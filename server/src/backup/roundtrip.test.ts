import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { buildExport } from './export';
import { applyImport } from './import';
import type { LibraryExport } from './format';

// Ids de coleção e o carimbo de hora são gerados por máquina: o que precisa
// sobreviver à ida e volta é o SIGNIFICADO, não os identificadores. Trocar o id
// da coleção pelo nome dela é o que torna a comparação honesta.
function porSignificado(e: LibraryExport) {
  const nomeDaColecao = new Map(e.collections.map((c) => [c.id, c.name]));
  return {
    ...e,
    exportedAt: '<hora>',
    collections: e.collections.map((c) => ({ ...c, id: '<id>' })),
    courses: e.courses.map((c) => ({
      ...c,
      collectionId: c.collectionId ? nomeDaColecao.get(c.collectionId) : null,
    })),
  };
}

describe('ida e volta', () => {
  it('exportar, importar num banco vazio e exportar de novo devolve o mesmo arquivo', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ida-volta-'));
    fs.mkdirSync(path.join(root, 'Modulo 1'));
    fs.writeFileSync(path.join(root, 'Modulo 1', 'aula-01.mp4'), 'conteudo');
    fs.writeFileSync(path.join(root, 'Modulo 1', 'aula-02.mp4'), 'conteudo');
    fs.writeFileSync(path.join(root, 'apostila.pdf'), 'x');

    const origem = openDb(':memory:');
    const courseId = createCourseFromPath(origem, root);
    const aulas = origem.prepare('SELECT id FROM lessons WHERE course_id=? ORDER BY order_index').all(courseId) as any[];
    origem
      .prepare(
        `INSERT INTO progress (lesson_id, position_sec, furthest_sec, duration_sec, completed, completed_at, auto_completed, updated_at)
         VALUES (?, 120, 200, 612.4, 0, NULL, 0, ?), (?, 300, 612.4, 612.4, 1, ?, 1, ?)`,
      )
      .run(
        aulas[0].id,
        '2026-03-01T00:00:00.000Z',
        aulas[1].id,
        '2026-02-01T00:00:00.000Z',
        '2026-02-01T00:00:00.000Z',
      );
    origem.prepare("INSERT INTO collections (id, name, created_at, sort_index) VALUES ('c1','Programação',?,0)").run(
      '2026-01-01T00:00:00.000Z',
    );
    origem.prepare("UPDATE courses SET collection_id='c1', poster_lesson_id=?, sort_index=2 WHERE id=?").run(
      aulas[1].id,
      courseId,
    );
    origem.prepare("INSERT INTO course_roots (id, path, created_at, last_checked_at) VALUES ('r1',?,?,NULL)").run(
      path.dirname(root),
      '2026-01-01T00:00:00.000Z',
    );
    origem.prepare("INSERT INTO settings (key, value) VALUES ('allowed_roots_extra', ?)").run('["/Volumes/Cursos"]');

    const primeiro = buildExport(origem, '1.0.0');

    const destino = openDb(':memory:');
    applyImport(destino, primeiro);
    const segundo = buildExport(destino, '1.0.0');

    expect(porSignificado(segundo)).toEqual(porSignificado(primeiro));

    fs.rmSync(root, { recursive: true, force: true });
    origem.close();
    destino.close();
  });
});
