import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { spawnSync } from 'node:child_process';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { hasFfmpeg } from '../media/ffmpeg';
import { thumbsRoutes } from './thumbs';

describe('POST /api/courses/:id/cover', () => {
  it('400 sem campos; 404 quando a aula não é do curso', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cov0-'));
    fs.writeFileSync(path.join(root, 'a.mp4'), 'xx');
    const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covT-'));
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const app = Fastify();
    app.register(thumbsRoutes, { db, config: { thumbsDir } as any });

    const bad = await app.inject({ method: 'POST', url: `/api/courses/${cid}/cover`, payload: {} });
    expect(bad.statusCode).toBe(400);
    const wrong = await app.inject({ method: 'POST', url: `/api/courses/${cid}/cover`, payload: { lessonId: 'nope', atSec: 1 } });
    expect(wrong.statusCode).toBe(404);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(thumbsDir, { recursive: true, force: true });
    db.close();
  });

  it.skipIf(!hasFfmpeg())('captura o frame e grava cover_path (204)', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cov1-'));
    spawnSync('ffmpeg', ['-f', 'lavfi', '-i', 'testsrc=duration=2:size=128x72:rate=10', '-y', path.join(root, 'a.mp4')], { stdio: 'ignore' });
    const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covT2-'));
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const lid = (db.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid) as any).id;
    const app = Fastify();
    app.register(thumbsRoutes, { db, config: { thumbsDir } as any });

    const res = await app.inject({ method: 'POST', url: `/api/courses/${cid}/cover`, payload: { lessonId: lid, atSec: 1 } });
    expect(res.statusCode).toBe(204);
    const course = db.prepare('SELECT cover_path FROM courses WHERE id=?').get(cid) as any;
    expect(course.cover_path).toBeTruthy();
    expect(fs.existsSync(course.cover_path)).toBe(true);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(thumbsDir, { recursive: true, force: true });
    db.close();
  });

  it.skipIf(hasFfmpeg())('503 quando ffmpeg ausente e a aula é válida', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'cov2-'));
    fs.writeFileSync(path.join(root, 'a.mp4'), 'xx');
    const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'covT3-'));
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const lid = (db.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid) as any).id;
    const app = Fastify();
    app.register(thumbsRoutes, { db, config: { thumbsDir } as any });
    const res = await app.inject({ method: 'POST', url: `/api/courses/${cid}/cover`, payload: { lessonId: lid, atSec: 1 } });
    expect(res.statusCode).toBe(503);
    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(thumbsDir, { recursive: true, force: true });
    db.close();
  });
});
