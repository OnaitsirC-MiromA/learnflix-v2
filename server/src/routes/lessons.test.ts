import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { lessonsRoutes } from './lessons';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'lessons-'));
  fs.writeFileSync(path.join(root, '01 - a.mp4'), 'x');
  fs.writeFileSync(path.join(root, '02 - b.mp4'), 'x');
});
afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

function setup() {
  const db = openDb(':memory:');
  const courseId = createCourseFromPath(db, root);
  const lessons = db.prepare('SELECT id FROM lessons WHERE course_id=? ORDER BY order_index').all(courseId) as any[];
  const app = Fastify();
  app.register(lessonsRoutes, { db });
  return { app, db, ids: lessons.map((l) => l.id) };
}

describe('lessons routes', () => {
  it('PATCH salva posição e furthest não regride; GET reflete e dá vizinhos', async () => {
    const { app, ids } = setup();
    await app.inject({ method: 'PATCH', url: `/api/lessons/${ids[0]}/progress`, payload: { position_sec: 50, furthest_sec: 50, duration_sec: 100 } });
    await app.inject({ method: 'PATCH', url: `/api/lessons/${ids[0]}/progress`, payload: { position_sec: 10, furthest_sec: 10, duration_sec: 100 } });
    const res = await app.inject({ method: 'GET', url: `/api/lessons/${ids[0]}` });
    const l = res.json();
    expect(l.position).toBe(10);
    expect(l.furthest).toBe(50);
    expect(l.nextLessonId).toBe(ids[1]);
    expect(l.prevLessonId).toBeNull();
  });

  it('POST complete marca e desmarca', async () => {
    const { app, ids } = setup();
    await app.inject({ method: 'POST', url: `/api/lessons/${ids[0]}/complete`, payload: { completed: true } });
    let l = (await app.inject({ method: 'GET', url: `/api/lessons/${ids[0]}` })).json();
    expect(l.completed).toBe(true);
    await app.inject({ method: 'POST', url: `/api/lessons/${ids[0]}/complete`, payload: { completed: false } });
    l = (await app.inject({ method: 'GET', url: `/api/lessons/${ids[0]}` })).json();
    expect(l.completed).toBe(false);
  });
});
