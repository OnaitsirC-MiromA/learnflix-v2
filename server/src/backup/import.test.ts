import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { applyImport } from './import';
import { FORMAT, VERSION, type ExportedCourse, type ExportedLesson, type LibraryExport, type ProgressState } from './format';

export function prog(over: Partial<ProgressState> = {}): ProgressState {
  return {
    positionSec: 0,
    furthestSec: 0,
    durationSec: null,
    completed: false,
    completedAt: null,
    autoCompleted: false,
    updatedAt: '2026-01-01T00:00:00.000Z',
    ...over,
  };
}

export function aula(relPath: string, progress: ProgressState | null = null): ExportedLesson {
  return { relPath, module: null, title: relPath, orderIndex: 0, moduleOrder: 0, durationSec: null, progress };
}

export function curso(over: Partial<ExportedCourse> = {}): ExportedCourse {
  return {
    title: 'Curso',
    rootPath: '/lugar/nenhum',
    structure: 'flat',
    archived: false,
    sortIndex: null,
    collectionId: null,
    posterLessonRelPath: null,
    lessons: [],
    ...over,
  };
}

export function arquivo(over: Partial<LibraryExport> = {}): LibraryExport {
  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: '2026-08-10T00:00:00.000Z',
    app: { version: '1.0.0', platform: 'darwin' },
    collections: [],
    courses: [],
    courseRoots: [],
    settings: { allowedRootsExtra: [] },
    ...over,
  };
}

describe('applyImport', () => {
  // Trocar de computador não deveria exigir plugar o HD antes de importar. O
  // curso entra com aulas e progresso; a pasta se reencontra depois, pelo
  // "Re-apontar pasta…" que já existe.
  it('traz o curso mesmo quando a pasta não existe nesta máquina', () => {
    const db = openDb(':memory:');
    const data = arquivo({
      courses: [
        curso({
          title: 'Rust do zero',
          rootPath: 'D:\\Cursos\\Rust',
          lessons: [aula('aula-01.mp4', prog({ positionSec: 120, furthestSec: 200 })), aula('aula-02.mp4')],
        }),
      ],
    });

    applyImport(db, data);

    const c = db.prepare('SELECT * FROM courses').all() as any[];
    expect(c).toHaveLength(1);
    expect(c[0].title).toBe('Rust do zero');

    const aulas = db.prepare('SELECT * FROM lessons ORDER BY order_index').all() as any[];
    expect(aulas).toHaveLength(2);
    // Sem a pasta não dá para confirmar que o arquivo existe: entram marcadas.
    expect(aulas.every((l) => l.missing === 1)).toBe(true);

    const p = db.prepare('SELECT * FROM progress WHERE lesson_id=?').get(aulas[0].id) as any;
    expect(p).toMatchObject({ position_sec: 120, furthest_sec: 200 });

    db.close();
  });

  // Com a pasta à mão, o disco é a fonte da verdade: o arquivo de export pode
  // estar velho, e aula que apareceu depois dele também tem que entrar.
  it('quando a pasta existe aqui, escaneia o disco e cola o progresso nas aulas', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'imp-'));
    fs.writeFileSync(path.join(root, 'aula-01.mp4'), 'conteudo');
    fs.writeFileSync(path.join(root, 'aula-02.mp4'), 'conteudo');
    const db = openDb(':memory:');
    const data = arquivo({
      courses: [
        curso({
          title: 'Curso Antigo',
          rootPath: path.resolve(root),
          lessons: [aula('aula-01.mp4', prog({ positionSec: 120, furthestSec: 200 }))],
        }),
      ],
    });

    applyImport(db, data);

    const aulas = db.prepare('SELECT * FROM lessons ORDER BY order_index').all() as any[];
    expect(aulas).toHaveLength(2);
    expect(aulas.every((l) => l.missing === 0)).toBe(true);
    expect(aulas[0].size_bytes).toBeGreaterThan(0);

    const p = db.prepare('SELECT * FROM progress WHERE lesson_id=?').get(aulas[0].id) as any;
    expect(p).toMatchObject({ position_sec: 120, furthest_sec: 200 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });
});

describe('applyImport, fundindo com o que já existe', () => {
  // Monta um curso local de uma aula com o progresso dado, e devolve o que é
  // preciso para montar o arquivo de export correspondente.
  function cenario(furthestLocal: number, over: Partial<Record<string, unknown>> = {}) {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'fusao-'));
    fs.writeFileSync(path.join(root, 'aula-01.mp4'), 'conteudo');
    const db = openDb(':memory:');
    const courseId = createCourseFromPath(db, root);
    const aulaLocal = db.prepare('SELECT id FROM lessons WHERE course_id=?').get(courseId) as any;
    db.prepare(
      `INSERT INTO progress (lesson_id, position_sec, furthest_sec, completed, completed_at, auto_completed, updated_at)
       VALUES (?, ?, ?, ?, ?, 0, ?)`,
    ).run(
      aulaLocal.id,
      furthestLocal,
      furthestLocal,
      over.completed ?? 0,
      over.completedAt ?? null,
      '2026-03-01T00:00:00.000Z',
    );
    return { db, root: path.resolve(root), courseId, aulaLocal };
  }

  it('não duplica um curso que já existe nesta máquina', () => {
    const { db, root } = cenario(720);

    applyImport(db, arquivo({ courses: [curso({ rootPath: root, lessons: [aula('aula-01.mp4', prog())] })] }));

    expect(db.prepare('SELECT COUNT(*) n FROM courses').get()).toEqual({ n: 1 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('adota o progresso do arquivo quando ele foi mais longe', () => {
    const { db, root, aulaLocal } = cenario(720);

    applyImport(
      db,
      arquivo({
        courses: [curso({ rootPath: root, lessons: [aula('aula-01.mp4', prog({ positionSec: 2400, furthestSec: 2400 }))] })],
      }),
    );

    const p = db.prepare('SELECT * FROM progress WHERE lesson_id=?').get(aulaLocal.id) as any;
    expect(p).toMatchObject({ position_sec: 2400, furthest_sec: 2400 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // O caso que dói: importar um backup antigo por engano não pode apagar o que
  // foi assistido depois dele.
  it('mantém o progresso local quando o arquivo está atrasado', () => {
    const { db, root, aulaLocal } = cenario(2400);

    applyImport(
      db,
      arquivo({
        courses: [curso({ rootPath: root, lessons: [aula('aula-01.mp4', prog({ positionSec: 720, furthestSec: 720 }))] })],
      }),
    );

    const p = db.prepare('SELECT * FROM progress WHERE lesson_id=?').get(aulaLocal.id) as any;
    expect(p).toMatchObject({ position_sec: 2400, furthest_sec: 2400 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('não desfaz uma conclusão local ao importar um arquivo sem ela', () => {
    const { db, root, aulaLocal } = cenario(2400, { completed: 1, completedAt: '2026-02-01T00:00:00.000Z' });

    applyImport(
      db,
      arquivo({
        courses: [curso({ rootPath: root, lessons: [aula('aula-01.mp4', prog({ furthestSec: 10 }))] })],
      }),
    );

    const p = db.prepare('SELECT * FROM progress WHERE lesson_id=?').get(aulaLocal.id) as any;
    expect(p.completed).toBe(1);
    expect(p.completed_at).toBe('2026-02-01T00:00:00.000Z');

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // Aula que o arquivo conhece e esta máquina não: pode ser que o vídeo tenha
  // sido apagado daqui, ou que o disco esteja desconectado. Descartar o
  // progresso dela seria perder exatamente o que o import promete guardar.
  it('traz a aula que só existe no arquivo, com o progresso dela', () => {
    const { db, root } = cenario(0);

    applyImport(
      db,
      arquivo({
        courses: [
          curso({
            rootPath: root,
            lessons: [aula('aula-01.mp4'), aula('aula-02.mp4', prog({ positionSec: 300, furthestSec: 450 }))],
          }),
        ],
      }),
    );

    const aulas = db.prepare('SELECT * FROM lessons ORDER BY rel_path').all() as any[];
    expect(aulas.map((l) => l.rel_path)).toEqual(['aula-01.mp4', 'aula-02.mp4']);
    const nova = aulas[1];
    expect(nova.missing).toBe(1);
    expect(db.prepare('SELECT * FROM progress WHERE lesson_id=?').get(nova.id)).toMatchObject({ furthest_sec: 450 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('importar o mesmo arquivo duas vezes dá no mesmo que importar uma', () => {
    const { db, root } = cenario(720);
    const data = arquivo({
      courses: [
        curso({ rootPath: root, lessons: [aula('aula-01.mp4', prog({ furthestSec: 2400 })), aula('aula-02.mp4')] }),
      ],
    });

    applyImport(db, data);
    const depoisDaPrimeira = db.prepare('SELECT * FROM lessons ORDER BY rel_path').all();
    applyImport(db, data);

    expect(db.prepare('SELECT COUNT(*) n FROM courses').get()).toEqual({ n: 1 });
    expect(db.prepare('SELECT * FROM lessons ORDER BY rel_path').all()).toEqual(depoisDaPrimeira);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // Dois cursos diferentes podem ter a mesma cara — uma aula só, com o mesmo
  // nome de arquivo. Sem trava, os dois reivindicariam o mesmo curso local e o
  // progresso de um vazaria para o outro.
  it('não deixa dois cursos do arquivo reivindicarem o mesmo curso local', () => {
    const { db, root } = cenario(0);

    applyImport(
      db,
      arquivo({
        courses: [
          curso({ title: 'Primeiro', rootPath: root, lessons: [aula('aula-01.mp4', prog({ furthestSec: 100 }))] }),
          curso({
            title: 'Segundo',
            rootPath: 'D:\\Outro\\Curso',
            lessons: [aula('aula-01.mp4', prog({ furthestSec: 900 }))],
          }),
        ],
      }),
    );

    expect(db.prepare('SELECT COUNT(*) n FROM courses').get()).toEqual({ n: 2 });

    // Cada progresso ficou no seu curso, sem vazar de um para o outro.
    const furthestDe = (rootPath: string) =>
      (
        db
          .prepare(
            `SELECT p.furthest_sec FROM progress p
             JOIN lessons l ON l.id = p.lesson_id
             JOIN courses c ON c.id = l.course_id
             WHERE c.root_path = ?`,
          )
          .get(rootPath) as any
      ).furthest_sec;
    expect(furthestDe(root)).toBe(100);
    expect(furthestDe('D:\\Outro\\Curso')).toBe(900);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });
});

describe('applyImport, organização da estante', () => {
  it('traz as bibliotecas e devolve cada curso à sua', () => {
    const db = openDb(':memory:');

    applyImport(
      db,
      arquivo({
        collections: [{ id: 'c1', name: 'Programação', createdAt: '2026-01-01T00:00:00.000Z', sortIndex: 0 }],
        courses: [curso({ rootPath: 'D:\\Cursos\\Rust', collectionId: 'c1', lessons: [aula('a.mp4')] })],
      }),
    );

    const col = db.prepare('SELECT * FROM collections').all() as any[];
    expect(col).toHaveLength(1);
    expect(col[0].name).toBe('Programação');
    expect((db.prepare('SELECT collection_id FROM courses').get() as any).collection_id).toBe(col[0].id);

    db.close();
  });

  // Biblioteca é um rótulo que a pessoa deu, não um id. Duas máquinas com uma
  // "Programação" cada têm a mesma biblioteca, ainda que os ids não batam.
  it('não duplica uma biblioteca que já existe com o mesmo nome', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO collections (id, name, created_at, sort_index) VALUES ('local-1', 'Programação', ?, 0)").run(
      '2026-01-01T00:00:00.000Z',
    );

    applyImport(
      db,
      arquivo({
        collections: [{ id: 'outro-id', name: 'Programação', createdAt: '2026-01-01T00:00:00.000Z', sortIndex: 0 }],
        courses: [curso({ rootPath: 'D:\\Cursos\\Rust', collectionId: 'outro-id', lessons: [aula('a.mp4')] })],
      }),
    );

    expect(db.prepare('SELECT COUNT(*) n FROM collections').get()).toEqual({ n: 1 });
    expect((db.prepare('SELECT collection_id FROM courses').get() as any).collection_id).toBe('local-1');

    db.close();
  });

  it('restaura a capa escolhida para o curso', () => {
    const db = openDb(':memory:');

    applyImport(
      db,
      arquivo({
        courses: [
          curso({
            rootPath: 'D:\\Cursos\\Rust',
            posterLessonRelPath: 'aula-02.mp4',
            lessons: [aula('aula-01.mp4'), aula('aula-02.mp4')],
          }),
        ],
      }),
    );

    const capa = db.prepare('SELECT poster_lesson_id FROM courses').get() as any;
    const aula02 = db.prepare("SELECT id FROM lessons WHERE rel_path='aula-02.mp4'").get() as any;
    expect(capa.poster_lesson_id).toBe(aula02.id);

    db.close();
  });

  it('traz as pastas de importação em lote e as raízes extras', () => {
    const db = openDb(':memory:');

    applyImport(
      db,
      arquivo({
        courseRoots: [{ path: '/Volumes/Cursos', createdAt: '2026-01-01T00:00:00.000Z', lastCheckedAt: null }],
        settings: { allowedRootsExtra: ['/Volumes/Cursos'] },
      }),
    );

    expect((db.prepare('SELECT path FROM course_roots').get() as any).path).toBe('/Volumes/Cursos');
    expect((db.prepare("SELECT value FROM settings WHERE key='allowed_roots_extra'").get() as any).value).toBe(
      '["/Volumes/Cursos"]',
    );

    db.close();
  });
});
