import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { buildApp } from '../app';

function makeApp(db: any, extra: Partial<{ thumbsDir: string; convertedDir: string }> = {}) {
  return buildApp(
    {
      allowedRoots: [os.tmpdir()],
      thumbsDir: extra.thumbsDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'rstT-')),
      convertedDir: extra.convertedDir ?? fs.mkdtempSync(path.join(os.tmpdir(), 'rstC-')),
    } as any,
    db,
  );
}

function makeCourse(db: any, name: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), name));
  fs.writeFileSync(path.join(root, 'a.mp4'), 'x');
  return createCourseFromPath(db, root);
}

function seedProgress(db: any, courseId: string): string {
  const lesson = db.prepare('SELECT id FROM lessons WHERE course_id=?').get(courseId) as { id: string };
  db.prepare(
    "INSERT INTO progress (lesson_id, position_sec, furthest_sec, completed, updated_at) VALUES (?, 120, 300, 1, datetime('now'))",
  ).run(lesson.id);
  return lesson.id;
}

describe('reset de progresso', () => {
  it('zera o progresso de UM curso sem tocar nos demais', async () => {
    const db = openDb(':memory:');
    const a = makeCourse(db, 'rst-a-');
    const b = makeCourse(db, 'rst-b-');
    seedProgress(db, a);
    seedProgress(db, b);
    const app = makeApp(db);

    const res = await app.inject({ method: 'POST', url: `/api/courses/${a}/progress/reset` });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: 1 });
    expect(db.prepare('SELECT COUNT(*) c FROM progress').get()).toEqual({ c: 1 }); // só o de B sobrou

    const missing = await app.inject({ method: 'POST', url: '/api/courses/nao-existe/progress/reset' });
    expect(missing.statusCode).toBe(404);
  });

  it('zera o progresso de TODOS os cursos', async () => {
    const db = openDb(':memory:');
    seedProgress(db, makeCourse(db, 'rst-c-'));
    seedProgress(db, makeCourse(db, 'rst-d-'));
    const app = makeApp(db);

    const res = await app.inject({ method: 'POST', url: '/api/progress/reset' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ deleted: 2 });
    expect(db.prepare('SELECT COUNT(*) c FROM progress').get()).toEqual({ c: 0 });
    // cursos e aulas ficam intactos
    expect(db.prepare('SELECT COUNT(*) c FROM courses').get()).toEqual({ c: 2 });
  });
});

describe('reset total da biblioteca', () => {
  it('apaga cursos, coleções e caches derivados; o acervo no disco fica', async () => {
    const db = openDb(':memory:');
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rst-lib-'));
    const video = path.join(root, 'a.mp4');
    fs.writeFileSync(video, 'x');
    const courseId = createCourseFromPath(db, root);
    seedProgress(db, courseId);
    db.prepare("INSERT INTO collections (id, name, created_at) VALUES ('c1', 'Col', datetime('now'))").run();

    // caches derivados que devem ser limpos
    const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rstT-'));
    const convertedDir = fs.mkdtempSync(path.join(os.tmpdir(), 'rstC-'));
    fs.writeFileSync(path.join(thumbsDir, 'x.jpg'), 'x');
    fs.writeFileSync(path.join(convertedDir, 'y.mp4'), 'y');

    const app = makeApp(db, { thumbsDir, convertedDir });
    const res = await app.inject({ method: 'POST', url: '/api/library/reset' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ courses: 1 });

    for (const t of ['courses', 'lessons', 'progress', 'collections']) {
      expect(db.prepare(`SELECT COUNT(*) c FROM ${t}`).get()).toEqual({ c: 0 });
    }
    expect(fs.readdirSync(thumbsDir)).toEqual([]);
    expect(fs.readdirSync(convertedDir)).toEqual([]);
    expect(fs.existsSync(video)).toBe(true); // acervo intocado
  });
});
