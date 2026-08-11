import type Database from 'better-sqlite3';
import path from 'node:path';
import { randomUUID } from 'node:crypto';
import { walkCourseDir } from './walk';
import { deriveCourse } from './derive';

// onUnreadable recebe os caminhos que a listagem mostrou mas o sistema de
// arquivos não entregou (ver walkCourseDir). É opcional de propósito: quem só
// quer criar o curso não precisa saber; quem importa em lote precisa contar ao
// usuário o que ficou de fora.
export function createCourseFromPath(
  db: Database.Database,
  rootPath: string,
  onUnreadable?: (caminhos: string[]) => void,
): string {
  const now = new Date().toISOString();
  const courseId = randomUUID();

  const { videos, materials, unreadable } = walkCourseDir(rootPath);
  if (unreadable.length) onUnreadable?.(unreadable);
  const derived = deriveCourse(videos);

  const insertCourse = db.prepare(`
    INSERT INTO courses (id, title, root_path, structure, archived, sort_index, poster_lesson_id, created_at, updated_at, last_scanned_at)
    VALUES (@id, @title, @root_path, @structure, 0, NULL, NULL, @now, @now, @now)
  `);
  const insertLesson = db.prepare(`
    INSERT INTO lessons (id, course_id, rel_path, module, title, order_index, module_order, duration_sec, size_bytes, mtime, container, playable, thumb_path, missing)
    VALUES (@id, @course_id, @rel_path, @module, @title, @order_index, @module_order, NULL, @size_bytes, @mtime, @container, @playable, NULL, 0)
  `);
  const insertMaterial = db.prepare(`
    INSERT INTO materials (id, course_id, module, rel_path, kind, size_bytes)
    VALUES (@id, @course_id, @module, @rel_path, @kind, @size_bytes)
  `);
  const updatePoster = db.prepare('UPDATE courses SET poster_lesson_id=? WHERE id=?');

  const tx = db.transaction(() => {
    insertCourse.run({
      id: courseId,
      title: path.basename(rootPath),
      root_path: rootPath,
      structure: derived.structure,
      now,
    });
    let firstLessonId: string | null = null;
    for (const lesson of derived.lessons) {
      const id = randomUUID();
      if (!firstLessonId) firstLessonId = id;
      insertLesson.run({
        id,
        course_id: courseId,
        rel_path: lesson.relPath,
        module: lesson.module,
        title: lesson.title,
        order_index: lesson.orderIndex,
        module_order: lesson.moduleOrder,
        size_bytes: lesson.sizeBytes,
        mtime: lesson.mtime,
        container: lesson.container,
        playable: lesson.playable ? 1 : 0,
      });
    }
    for (const material of materials) {
      const segs = material.relPath.split('/');
      insertMaterial.run({
        id: randomUUID(),
        course_id: courseId,
        module: segs.length > 1 ? segs[0] : null,
        rel_path: material.relPath,
        kind: material.kind,
        size_bytes: material.sizeBytes,
      });
    }
    if (firstLessonId) {
      updatePoster.run(firstLessonId, courseId);
    }
  });
  tx();

  return courseId;
}
