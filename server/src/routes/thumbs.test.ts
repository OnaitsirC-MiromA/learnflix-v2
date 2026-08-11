import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { lessonThumbPath } from '../media/thumbs';
import { infoRoutes } from './info';
import { thumbsRoutes } from './thumbs';

describe('GET /api/info', () => {
  it('retorna { ffmpeg: boolean }', async () => {
    const app = Fastify();
    app.register(infoRoutes);
    const res = await app.inject({ method: 'GET', url: '/api/info' });
    expect(res.statusCode).toBe(200);
    expect(typeof res.json().ffmpeg).toBe('boolean');
  });
});

describe('rotas thumb/cover (cache-hit, sem ffmpeg)', () => {
  it('thumb do cache → 200 webp; cover faz fallback p/ aula-pôster; inexistente → 404', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rt-'));
    fs.writeFileSync(path.join(root, 'a.mp4'), 'xx');
    const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'tc-'));
    const config = { thumbsDir } as any;
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const lesson = db.prepare('SELECT id, mtime FROM lessons WHERE course_id=?').get(cid) as any;
    fs.writeFileSync(lessonThumbPath(config, lesson.id, lesson.mtime), 'WEBP'); // pré-posiciona cache

    const app = Fastify();
    app.register(thumbsRoutes, { db, config });

    const t = await app.inject({ method: 'GET', url: `/api/lessons/${lesson.id}/thumb` });
    expect(t.statusCode).toBe(200);
    expect(t.headers['content-type']).toBe('image/jpeg');

    const cover = await app.inject({ method: 'GET', url: `/api/courses/${cid}/cover` });
    expect(cover.statusCode).toBe(200); // poster_lesson_id = lesson → cache-hit

    const missing = await app.inject({ method: 'GET', url: `/api/lessons/nope/thumb` });
    expect(missing.statusCode).toBe(404);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(thumbsDir, { recursive: true, force: true });
    db.close();
  });
});
