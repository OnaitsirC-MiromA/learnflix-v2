import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { buildExport } from './export';

describe('buildExport', () => {
  it('leva o curso com suas aulas e o progresso de cada uma', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-'));
    fs.writeFileSync(path.join(root, 'aula-01.mp4'), 'x');
    const db = openDb(':memory:');
    const courseId = createCourseFromPath(db, root);
    const lesson = db.prepare('SELECT id, rel_path FROM lessons WHERE course_id=?').get(courseId) as any;
    db.prepare('INSERT INTO progress (lesson_id, position_sec, furthest_sec, updated_at) VALUES (?, 120, 200, ?)').run(
      lesson.id,
      '2026-01-05T00:00:00.000Z',
    );

    const out = buildExport(db);

    expect(out.courses).toHaveLength(1);
    expect(out.courses[0].rootPath).toBe(path.resolve(root));
    expect(out.courses[0].lessons).toHaveLength(1);
    expect(out.courses[0].lessons[0].relPath).toBe(lesson.rel_path);
    expect(out.courses[0].lessons[0].progress).toMatchObject({ positionSec: 120, furthestSec: 200 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('carimba o envelope com formato, versão e data', () => {
    const db = openDb(':memory:');

    const out = buildExport(db);

    expect(out.format).toBe('learnflix-library');
    expect(out.version).toBe(1);
    expect(out.exportedAt).toMatch(/^\d{4}-\d{2}-\d{2}T/);

    db.close();
  });

  it('leva a organização que a pessoa deu ao curso', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-org-'));
    fs.writeFileSync(path.join(root, 'aula-01.mp4'), 'x');
    const db = openDb(':memory:');
    const courseId = createCourseFromPath(db, root);
    db.prepare("INSERT INTO collections (id, name, created_at, sort_index) VALUES ('c1', 'Programação', ?, 0)").run(
      '2026-01-01T00:00:00.000Z',
    );
    db.prepare("UPDATE courses SET collection_id='c1', archived=1, sort_index=3 WHERE id=?").run(courseId);

    const out = buildExport(db);

    expect(out.courses[0]).toMatchObject({
      title: path.basename(root),
      structure: 'flat',
      archived: true,
      sortIndex: 3,
      collectionId: 'c1',
    });
    expect(out.collections).toEqual([
      { id: 'c1', name: 'Programação', createdAt: '2026-01-01T00:00:00.000Z', sortIndex: 0 },
    ]);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // O id da aula é gerado nesta máquina e não significa nada na de destino; o
  // rel_path, sim. Por isso a capa viaja como caminho relativo.
  it('leva a capa do curso como caminho relativo da aula, não como id', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-capa-'));
    fs.writeFileSync(path.join(root, 'aula-01.mp4'), 'x');
    fs.writeFileSync(path.join(root, 'aula-02.mp4'), 'x');
    const db = openDb(':memory:');
    const courseId = createCourseFromPath(db, root);
    const segunda = db.prepare('SELECT id, rel_path FROM lessons WHERE course_id=? ORDER BY order_index').all(courseId)[1] as any;
    db.prepare('UPDATE courses SET poster_lesson_id=? WHERE id=?').run(segunda.id, courseId);

    const out = buildExport(db);

    expect(out.courses[0].posterLessonRelPath).toBe(segunda.rel_path);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // Título, módulo e ordem são deriváveis do disco — mas só quando o disco está
  // lá. Um curso importado num computador que ainda não tem a pasta precisa
  // aparecer com a lista de aulas legível, não com caminhos crus.
  it('leva título, módulo, ordem e duração de cada aula', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-aula-'));
    fs.mkdirSync(path.join(root, 'Modulo 1'));
    fs.writeFileSync(path.join(root, 'Modulo 1', 'aula-01.mp4'), 'x');
    const db = openDb(':memory:');
    const courseId = createCourseFromPath(db, root);
    db.prepare('UPDATE lessons SET duration_sec=612.4 WHERE course_id=?').run(courseId);

    const aula = buildExport(db).courses[0].lessons[0];
    const linha = db.prepare('SELECT * FROM lessons WHERE course_id=?').get(courseId) as any;

    expect(aula).toMatchObject({
      relPath: linha.rel_path,
      module: linha.module,
      title: linha.title,
      orderIndex: linha.order_index,
      moduleOrder: linha.module_order,
      durationSec: 612.4,
    });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('leva as pastas de importação em lote e as raízes extras configuradas', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO course_roots (id, path, created_at, last_checked_at) VALUES ('r1', '/Volumes/Cursos', ?, ?)").run(
      '2026-01-01T00:00:00.000Z',
      '2026-02-01T00:00:00.000Z',
    );
    db.prepare("INSERT INTO settings (key, value) VALUES ('allowed_roots_extra', ?)").run('["/Volumes/Cursos"]');

    const out = buildExport(db);

    expect(out.courseRoots).toEqual([
      { path: '/Volumes/Cursos', createdAt: '2026-01-01T00:00:00.000Z', lastCheckedAt: '2026-02-01T00:00:00.000Z' },
    ]);
    expect(out.settings).toEqual({ allowedRootsExtra: ['/Volumes/Cursos'] });

    db.close();
  });

  // Serve para entender um arquivo estranho meses depois: de que versão saiu e
  // de qual sistema (caminhos com barra invertida, por exemplo).
  it('registra a versão e a plataforma de origem do arquivo', () => {
    const db = openDb(':memory:');

    expect(buildExport(db, '1.0.0').app).toEqual({ version: '1.0.0', platform: process.platform });

    db.close();
  });

  // Guarda de regressão da decisão central do formato. Um `SELECT *` distraído
  // reintroduziria fatos deste disco no arquivo — e o import passaria a afirmar
  // na máquina de destino coisas que só valem aqui. Travar a forma exata faz
  // qualquer campo novo passar por uma decisão consciente.
  it('não carrega nada que seja fato apenas deste disco', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'exp-limpo-'));
    fs.writeFileSync(path.join(root, 'aula-01.mp4'), 'x');
    const db = openDb(':memory:');
    const courseId = createCourseFromPath(db, root);
    db.prepare("UPDATE lessons SET thumb_path='/data/thumbs/abc.jpg', missing=1 WHERE course_id=?").run(courseId);
    db.prepare("UPDATE courses SET cover_path='/data/thumbs/capa.jpg' WHERE id=?").run(courseId);

    const out = buildExport(db);

    expect(Object.keys(out.courses[0]).sort()).toEqual(
      ['archived', 'collectionId', 'lessons', 'posterLessonRelPath', 'rootPath', 'sortIndex', 'structure', 'title'].sort(),
    );
    expect(Object.keys(out.courses[0].lessons[0]).sort()).toEqual(
      ['durationSec', 'module', 'moduleOrder', 'orderIndex', 'progress', 'relPath', 'title'].sort(),
    );

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });
});
