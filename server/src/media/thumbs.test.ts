import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { pickFrameTimestamp, lessonThumbPath, courseCoverPath, getOrCreateLessonThumb } from './thumbs';

describe('pickFrameTimestamp', () => {
  it('10% com piso de 1s; 5s se duração nula/zero', () => {
    expect(pickFrameTimestamp(100)).toBe(10);
    expect(pickFrameTimestamp(5)).toBe(1); // 0.5s → piso 1s
    expect(pickFrameTimestamp(null)).toBe(5);
    expect(pickFrameTimestamp(0)).toBe(5);
  });
});

describe('caminhos de cache', () => {
  it('determinísticos por id/mtime', () => {
    const cfg = { thumbsDir: '/data/thumbs' } as any;
    expect(lessonThumbPath(cfg, 'L1', 123)).toBe(path.join('/data/thumbs', 'L1-123.jpg'));
    expect(courseCoverPath(cfg, 'C1')).toBe(path.join('/data/thumbs', 'course-C1.jpg'));
  });
});

describe('getOrCreateLessonThumb', () => {
  it('serve o cache existente sem exigir ffmpeg e grava thumb_path', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-src-'));
    fs.writeFileSync(path.join(root, 'a.mp4'), 'xx');
    const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'thumb-cache-'));
    const cfg = { thumbsDir } as any;
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const lesson = db.prepare('SELECT id, mtime FROM lessons WHERE course_id=?').get(cid) as any;
    const expected = lessonThumbPath(cfg, lesson.id, lesson.mtime);
    fs.writeFileSync(expected, 'WEBPDATA'); // pré-posiciona o cache

    const out = await getOrCreateLessonThumb(db, cfg, lesson.id);
    expect(out).toBe(expected);
    const stored = db.prepare('SELECT thumb_path FROM lessons WHERE id=?').get(lesson.id) as any;
    expect(stored.thumb_path).toBe(expected);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(thumbsDir, { recursive: true, force: true });
    db.close();
  });
});
