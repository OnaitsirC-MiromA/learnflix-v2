import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { planImport } from './import';
import { FORMAT, VERSION, type ExportedCourse, type ExportedLesson, type LibraryExport } from './format';

function aula(relPath: string): ExportedLesson {
  return { relPath, module: null, title: relPath, orderIndex: 0, moduleOrder: 0, durationSec: null, progress: null };
}

function curso(over: Partial<ExportedCourse> = {}): ExportedCourse {
  return {
    title: 'Curso',
    rootPath: '/lugar/nenhum',
    structure: 'flat',
    archived: false,
    sortIndex: null,
    collectionId: null,
    posterLessonRelPath: null,
    lessons: [aula('a.mp4')],
    ...over,
  };
}

function arquivo(over: Partial<LibraryExport> = {}): LibraryExport {
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

describe('planImport', () => {
  it('separa o que é curso novo do que já existe aqui', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-'));
    fs.writeFileSync(path.join(root, 'a.mp4'), 'x');
    const db = openDb(':memory:');
    createCourseFromPath(db, root);

    const plano = planImport(
      db,
      arquivo({
        courses: [
          curso({ title: 'Já tenho', rootPath: path.resolve(root) }),
          curso({ title: 'Novo 1', rootPath: 'D:\\Cursos\\Um', lessons: [aula('rust-01.mp4'), aula('rust-02.mp4')] }),
          curso({ title: 'Novo 2', rootPath: 'D:\\Cursos\\Dois', lessons: [aula('go-01.mp4'), aula('go-02.mp4')] }),
        ],
      }),
    );

    expect(plano).toMatchObject({ created: 2, merged: 1 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // Só a contagem não explica nada a quem esperava os cursos aparecerem — a UI
  // precisa dizer QUAIS pastas não foram encontradas, como a importação em lote
  // já faz com as pastas puladas.
  it('aponta pelo nome os cursos cuja pasta não está nesta máquina', () => {
    const db = openDb(':memory:');

    const plano = planImport(
      db,
      arquivo({ courses: [curso({ title: 'Vue do zero', rootPath: 'D:\\Cursos\\Vue' })] }),
    );

    expect(plano.missingFolder).toBe(1);
    expect(plano.missingFolderTitles).toEqual(['Vue do zero']);

    db.close();
  });

  // Curso reconhecido pela impressão digital JÁ tem pasta boa aqui — o caminho
  // que veio no arquivo é de outra máquina e não interessa mais. Avisar "pasta
  // não encontrada" nesse caso assusta à toa, e sobre um curso que está inteiro.
  it('não alarma sobre pasta faltante de um curso que já existe aqui', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'plan-digital-'));
    for (const v of ['a.mp4', 'b.mp4', 'c.mp4']) fs.writeFileSync(path.join(root, v), 'x');
    const db = openDb(':memory:');
    createCourseFromPath(db, root);

    const plano = planImport(
      db,
      arquivo({
        courses: [
          curso({
            title: 'Curso vindo do Windows',
            rootPath: 'D:\\Cursos\\Rust',
            lessons: [aula('a.mp4'), aula('b.mp4'), aula('c.mp4')],
          }),
        ],
      }),
    );

    expect(plano.merged).toBe(1);
    expect(plano.missingFolder).toBe(0);
    expect(plano.missingFolderTitles).toEqual([]);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  // A prévia é mostrada ANTES de a pessoa confirmar. Se ela cancelar, o banco
  // tem de estar exatamente como estava.
  it('não grava absolutamente nada no banco', () => {
    const db = openDb(':memory:');
    const contar = () =>
      ['courses', 'lessons', 'progress', 'collections', 'course_roots', 'settings']
        .map((t) => (db.prepare(`SELECT COUNT(*) n FROM ${t}`).get() as any).n)
        .join(',');
    const antes = contar();

    planImport(
      db,
      arquivo({
        collections: [{ id: 'c1', name: 'Programação', createdAt: '2026-01-01T00:00:00.000Z', sortIndex: 0 }],
        courses: [curso({ rootPath: 'D:\\Cursos\\Um' })],
        courseRoots: [{ path: '/Volumes/Cursos', createdAt: '2026-01-01T00:00:00.000Z', lastCheckedAt: null }],
        settings: { allowedRootsExtra: ['/Volumes/Cursos'] },
      }),
    );

    expect(contar()).toBe(antes);

    db.close();
  });

  it('conta as bibliotecas que serão criadas', () => {
    const db = openDb(':memory:');
    db.prepare("INSERT INTO collections (id, name, created_at, sort_index) VALUES ('l1', 'Programação', ?, 0)").run(
      '2026-01-01T00:00:00.000Z',
    );

    const plano = planImport(
      db,
      arquivo({
        collections: [
          { id: 'c1', name: 'Programação', createdAt: '2026-01-01T00:00:00.000Z', sortIndex: 0 },
          { id: 'c2', name: 'Inglês', createdAt: '2026-01-01T00:00:00.000Z', sortIndex: 1 },
        ],
      }),
    );

    expect(plano.collectionsCreated).toBe(1);

    db.close();
  });
});
