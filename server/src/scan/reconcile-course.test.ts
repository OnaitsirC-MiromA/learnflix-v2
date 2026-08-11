import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from './scan-course';
import { previewReconcile, reconcileCourse } from './reconcile';

const cfg = { thumbsDir: '/tmp/x' } as any;

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rec-'));
  fs.mkdirSync(path.join(root, 'M1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'M1', 'a.mp4'), 'x');
  fs.writeFileSync(path.join(root, 'M1', 'b.mp4'), 'x');
  return root;
}

describe('reconcileCourse', () => {
  it('mover a pasta preserva o progresso', () => {
    const root = fixture();
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const lid = (db.prepare("SELECT id FROM lessons WHERE rel_path='M1/a.mp4' AND course_id=?").get(cid) as any).id;
    db.prepare('INSERT INTO progress (lesson_id, position_sec, furthest_sec, completed, auto_completed, updated_at) VALUES (?,42,42,1,0,?)').run(lid, new Date(0).toISOString());

    // "move" a pasta para um novo diretório com os mesmos arquivos
    const root2 = fixture();
    const res = reconcileCourse(db, cfg, cid, { newRootPath: root2 });
    expect(res).toMatchObject({ matched: 2, missing: 0, added: 0 });
    const prog = db.prepare('SELECT position_sec, completed FROM progress WHERE lesson_id=?').get(lid) as any;
    expect(prog.position_sec).toBe(42);
    expect(prog.completed).toBe(1);
    expect((db.prepare('SELECT root_path FROM courses WHERE id=?').get(cid) as any).root_path).toBe(root2);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(root2, { recursive: true, force: true });
    db.close();
  });

  it('rescan preserva o ID dos materiais (upsert por caminho, sem churn)', () => {
    const root = fixture();
    fs.writeFileSync(path.join(root, 'M1', 'apostila.pdf'), 'p');
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const before = (db.prepare("SELECT id FROM materials WHERE rel_path='M1/apostila.pdf' AND course_id=?").get(cid) as any).id;

    reconcileCourse(db, cfg, cid); // re-escaneia a MESMA pasta (como o mount da página faz)
    const after = (db.prepare("SELECT id FROM materials WHERE rel_path='M1/apostila.pdf' AND course_id=?").get(cid) as any).id;
    expect(after).toBe(before); // id estável — o link do material não quebra

    // arquivo removido some do banco
    fs.rmSync(path.join(root, 'M1', 'apostila.pdf'));
    reconcileCourse(db, cfg, cid);
    expect(db.prepare('SELECT COUNT(*) c FROM materials WHERE course_id=?').get(cid)).toEqual({ c: 0 });
    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('arquivo removido vira missing com progresso preservado', () => {
    const root = fixture();
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const bid = (db.prepare("SELECT id FROM lessons WHERE rel_path='M1/b.mp4' AND course_id=?").get(cid) as any).id;
    db.prepare('INSERT INTO progress (lesson_id, position_sec, furthest_sec, completed, auto_completed, updated_at) VALUES (?,30,30,0,0,?)').run(bid, new Date(0).toISOString());
    fs.rmSync(path.join(root, 'M1', 'b.mp4'));
    const res = reconcileCourse(db, cfg, cid);
    expect(res).toMatchObject({ missing: 1 });
    const b = db.prepare("SELECT missing, order_index FROM lessons WHERE rel_path='M1/b.mp4' AND course_id=?").get(cid) as any;
    expect(b.missing).toBe(1);
    expect(b.order_index).toBeGreaterThanOrEqual(100000);
    // O progresso da aula que virou missing deve ser preservado.
    const prog = db.prepare('SELECT position_sec, furthest_sec FROM progress WHERE lesson_id=?').get(bid) as any;
    expect(prog).toBeTruthy();
    expect(prog.position_sec).toBe(30);
    expect(prog.furthest_sec).toBe(30);
    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('order_index de aula missing é idempotente entre re-scans sucessivos', () => {
    const root = fixture();
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    fs.rmSync(path.join(root, 'M1', 'b.mp4'));

    const res1 = reconcileCourse(db, cfg, cid);
    expect(res1).toMatchObject({ missing: 1 });
    const after1 = db.prepare("SELECT order_index FROM lessons WHERE rel_path='M1/b.mp4' AND course_id=?").get(cid) as any;
    expect(after1.order_index).toBeGreaterThanOrEqual(100000);

    // Rescan novamente (ex.: auto-rescan ao reabrir o curso) — root ainda presente,
    // arquivo ainda ausente: o índice não pode crescer de novo.
    const res2 = reconcileCourse(db, cfg, cid);
    expect(res2).toMatchObject({ missing: 1 });
    const after2 = db.prepare("SELECT order_index FROM lessons WHERE rel_path='M1/b.mp4' AND course_id=?").get(cid) as any;
    expect(after2.order_index).toBe(after1.order_index);

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('preview não altera o banco; root inexistente → root_unavailable', () => {
    const root = fixture();
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    fs.rmSync(path.join(root, 'M1', 'b.mp4'));
    const before = db.prepare("SELECT missing FROM lessons WHERE rel_path='M1/b.mp4' AND course_id=?").get(cid) as any;
    const prev = previewReconcile(db, cfg, cid);
    expect(prev).toMatchObject({ missing: 1 });
    const after = db.prepare("SELECT missing FROM lessons WHERE rel_path='M1/b.mp4' AND course_id=?").get(cid) as any;
    expect(after.missing).toBe(before.missing); // preview não escreveu

    fs.rmSync(root, { recursive: true, force: true });
    expect(reconcileCourse(db, cfg, cid)).toEqual({ status: 'root_unavailable' });
    db.close();
  });
});
