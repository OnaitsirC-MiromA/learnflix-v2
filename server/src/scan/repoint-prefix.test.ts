import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from './scan-course';
import { planBatchRepoint, runBatchRepoint } from './repoint-prefix';

const cfg = { thumbsDir: '/tmp/x' } as any;

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-'));
  fs.mkdirSync(path.join(root, 'M1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'M1', 'a.mp4'), 'x');
  return root;
}

describe('planBatchRepoint (puro)', () => {
  it('calcula o novo caminho só para cursos sob o prefixo antigo', () => {
    const plan = planBatchRepoint(
      [
        { id: 'A', title: 'Curso A', root_path: '/Users/admin/Cursos/A' },
        { id: 'B', title: 'Curso B', root_path: '/Users/admin/Cursos/B' },
        { id: 'C', title: 'Curso C', root_path: '/outra/pasta/C' },
      ],
      '/Users/admin/Cursos',
      '/library',
    );
    expect(plan.map((p) => p.id)).toEqual(['A', 'B']);
    expect(plan.find((p) => p.id === 'A')!.newPath).toBe('/library/A');
  });

  // No Windows os root_path são gravados com "\". Comparar com "/" fixo devolvia
  // plano vazio: o re-apontamento em lote não movia nada e não reclamava de nada.
  it('reconhece caminhos do Windows, com barra invertida', () => {
    const plan = planBatchRepoint(
      [
        { id: 'A', title: 'Curso A', root_path: 'D:\\Cursos\\A' },
        { id: 'B', title: 'Curso B', root_path: 'D:\\Cursos\\Sub\\B' },
        { id: 'C', title: 'Curso C', root_path: 'E:\\Outra\\C' },
      ],
      'D:\\Cursos',
      'F:\\Backup',
    );
    expect(plan.map((p) => p.id)).toEqual(['A', 'B']);
    expect(plan.find((p) => p.id === 'A')!.newPath).toBe('F:\\Backup\\A');
    expect(plan.find((p) => p.id === 'B')!.newPath).toBe('F:\\Backup\\Sub\\B');
  });

  it('o curso cujo caminho é exatamente o prefixo entra no plano', () => {
    const plan = planBatchRepoint([{ id: 'A', title: 'A', root_path: '/Cursos' }], '/Cursos', '/novo');
    expect(plan.map((p) => p.newPath)).toEqual(['/novo']);
  });

  // Sem a checagem do separador, "/Cursos" casaria com "/Cursos-Antigos" e o lote
  // moveria pastas que ninguém mandou mover.
  it('não confunde prefixo com começo de outro nome', () => {
    const plan = planBatchRepoint(
      [
        { id: 'A', title: 'A', root_path: '/Cursos-Antigos/A' },
        { id: 'B', title: 'B', root_path: 'D:\\Cursos-Antigos\\B' },
      ],
      '/Cursos',
      '/novo',
    );
    expect(plan).toEqual([]);
  });
});

describe('runBatchRepoint', () => {
  it('re-aponta todos os cursos preservando progresso', () => {
    const root1 = fixture();
    const root2 = fixture();
    const parent = path.dirname(root1);
    const db = openDb(':memory:');
    const c1 = createCourseFromPath(db, root1);
    createCourseFromPath(db, root2);
    const lid = (db.prepare("SELECT id FROM lessons WHERE rel_path='M1/a.mp4' AND course_id=?").get(c1) as any).id;
    db.prepare('INSERT INTO progress (lesson_id, position_sec, furthest_sec, completed, auto_completed, updated_at) VALUES (?,15,15,0,0,?)').run(lid, new Date(0).toISOString());

    const movedParent = fs.mkdtempSync(path.join(os.tmpdir(), 'moved-'));
    fs.cpSync(root1, path.join(movedParent, path.basename(root1)), { recursive: true });
    fs.cpSync(root2, path.join(movedParent, path.basename(root2)), { recursive: true });

    const result = runBatchRepoint(db, cfg, parent, movedParent);
    expect(result.total).toBe(2);
    expect(result.succeeded).toHaveLength(2);
    expect(result.abortedAt).toBeUndefined();

    const prog = db.prepare('SELECT position_sec FROM progress WHERE lesson_id=?').get(lid) as any;
    expect(prog.position_sec).toBe(15);
    expect((db.prepare('SELECT root_path FROM courses WHERE id=?').get(c1) as any).root_path).toBe(path.join(movedParent, path.basename(root1)));

    fs.rmSync(root1, { recursive: true, force: true });
    fs.rmSync(root2, { recursive: true, force: true });
    fs.rmSync(movedParent, { recursive: true, force: true });
    db.close();
  });

  it('aborta no primeiro curso indisponível e não toca os cursos seguintes do lote', () => {
    const root1 = fixture();
    const root2 = fixture();
    const root3 = fixture();
    const parent = path.dirname(root1);
    const db = openDb(':memory:');
    const c1 = createCourseFromPath(db, root1);
    const c2 = createCourseFromPath(db, root2);
    const c3 = createCourseFromPath(db, root3);

    const movedParent = fs.mkdtempSync(path.join(os.tmpdir(), 'moved3-'));
    // só root1 e root3 existem no destino; root2 (o do meio) não é movido → aborta nele.
    fs.cpSync(root1, path.join(movedParent, path.basename(root1)), { recursive: true });
    fs.cpSync(root3, path.join(movedParent, path.basename(root3)), { recursive: true });

    const result = runBatchRepoint(db, cfg, parent, movedParent);

    expect(result.total).toBe(3);
    expect(result.succeeded.map((s) => s.id)).toEqual([c1]);
    expect(result.abortedAt?.id).toBe(c2);
    expect((db.prepare('SELECT root_path FROM courses WHERE id=?').get(c3) as any).root_path).toBe(root3);

    fs.rmSync(root1, { recursive: true, force: true });
    fs.rmSync(root2, { recursive: true, force: true });
    fs.rmSync(root3, { recursive: true, force: true });
    fs.rmSync(movedParent, { recursive: true, force: true });
    db.close();
  });
});
