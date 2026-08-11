import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from './scan-course';

let root: string;

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'scan-'));
  fs.mkdirSync(path.join(root, '01 - Intro'), { recursive: true });
  fs.writeFileSync(path.join(root, '01 - Intro', '01 - ola.mp4'), 'x');
  fs.writeFileSync(path.join(root, '01 - Intro', '02 - setup.mp4'), 'x');
  fs.writeFileSync(path.join(root, '01 - Intro', 'guia.pdf'), 'x');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('createCourseFromPath', () => {
  it('cria curso + aulas + materiais com título = basename', () => {
    const db = openDb(':memory:');
    const id = createCourseFromPath(db, root);

    const course: any = db.prepare('SELECT * FROM courses WHERE id=?').get(id);
    expect(course.title).toBe(path.basename(root));
    expect(course.root_path).toBe(root);
    expect(course.structure).toBe('modules');

    const lessons: any[] = db
      .prepare('SELECT * FROM lessons WHERE course_id=? ORDER BY order_index').all(id);
    expect(lessons.map((l) => l.rel_path)).toEqual([
      '01 - Intro/01 - ola.mp4', '01 - Intro/02 - setup.mp4',
    ]);
    expect(lessons[0].module).toBe('01 - Intro');
    expect(lessons[0].playable).toBe(1);

    const mats: any[] = db.prepare('SELECT * FROM materials WHERE course_id=?').all(id);
    expect(mats.map((m) => m.kind)).toEqual(['pdf']);

    expect(course.poster_lesson_id).toBe(lessons[0].id);
    expect(lessons[0].duration_sec).toBeNull();

    db.close();
  });
});
