import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { coursesRoutes } from './courses';

function makeApp(db: any, thumbsDir: string) {
  const app = Fastify();
  app.register(coursesRoutes, { db, config: { allowedRoots: [os.tmpdir()], thumbsDir } as any });
  return app;
}

describe('CRUD de curso', () => {
  it('PATCH renomeia e arquiva; GET ?archived lista arquivados; DELETE remove', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'crud-'));
    fs.writeFileSync(path.join(root, 'a.mp4'), 'x');
    const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'crudT-'));
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const app = makeApp(db, thumbsDir);

    const ren = await app.inject({ method: 'PATCH', url: `/api/courses/${cid}`, payload: { title: 'Novo Nome' } });
    expect(ren.statusCode).toBe(200);
    expect((db.prepare('SELECT title FROM courses WHERE id=?').get(cid) as any).title).toBe('Novo Nome');

    await app.inject({ method: 'PATCH', url: `/api/courses/${cid}`, payload: { archived: true } });
    const active = await app.inject({ method: 'GET', url: '/api/courses' });
    expect(active.json()).toHaveLength(0);
    const archived = await app.inject({ method: 'GET', url: '/api/courses?archived=1' });
    expect(archived.json()).toHaveLength(1);

    const empty = await app.inject({ method: 'PATCH', url: `/api/courses/${cid}`, payload: { title: '  ' } });
    expect(empty.statusCode).toBe(400);

    const nonString = await app.inject({ method: 'PATCH', url: `/api/courses/${cid}`, payload: { title: null } });
    expect(nonString.statusCode).toBe(400);

    // Iscas no cache de thumbs para exercitar a limpeza do DELETE:
    // prefix-match <lessonId>- e match exato course-<id>.jpg.
    const lid = (db.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid) as any).id;
    const lessonThumb = path.join(thumbsDir, `${lid}-123.jpg`);
    const courseThumb = path.join(thumbsDir, `course-${cid}.jpg`);
    fs.writeFileSync(lessonThumb, 'x');
    fs.writeFileSync(courseThumb, 'x');

    const del = await app.inject({ method: 'DELETE', url: `/api/courses/${cid}` });
    expect(del.statusCode).toBe(204);
    expect(db.prepare('SELECT COUNT(*) AS n FROM courses').get() as any).toMatchObject({ n: 0 });
    expect(fs.existsSync(lessonThumb)).toBe(false);
    expect(fs.existsSync(courseThumb)).toBe(false);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(thumbsDir, { recursive: true, force: true });
    db.close();
  });
});
