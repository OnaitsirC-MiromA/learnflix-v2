import type { Db } from '../db';
import { getAllowedRootsExtra } from '../routes/settings';
import {
  FORMAT,
  VERSION,
  type ExportedCollection,
  type ExportedCourseRoot,
  type ExportedLesson,
  type LibraryExport,
} from './format';

// Monta o arquivo de export a partir do banco. Só leitura — nada aqui altera nada.
//
// A versão do app entra por parâmetro em vez de ser lida daqui: ler o
// package.json a partir do cwd amarra o export ao diretório de onde o processo
// subiu, e é exatamente o tipo de coisa que quebra num executável empacotado.
export function buildExport(db: Db, appVersion = 'dev'): LibraryExport {
  const collections = (
    db.prepare('SELECT id, name, created_at, sort_index FROM collections ORDER BY sort_index, rowid').all() as any[]
  ).map(
    (c): ExportedCollection => ({ id: c.id, name: c.name, createdAt: c.created_at, sortIndex: c.sort_index }),
  );

  const courses = db
    .prepare(
      `SELECT c.id, c.title, c.root_path, c.structure, c.archived, c.sort_index, c.collection_id,
              (SELECT rel_path FROM lessons WHERE id = c.poster_lesson_id) AS poster_rel_path
       FROM courses c ORDER BY c.rowid`,
    )
    .all() as any[];

  const lessonsDoCurso = db.prepare(`
    SELECT l.rel_path, l.module, l.title, l.order_index, l.module_order, l.duration_sec,
           p.position_sec, p.furthest_sec, p.duration_sec AS p_duration_sec,
           p.completed, p.completed_at, p.auto_completed, p.updated_at
    FROM lessons l
    LEFT JOIN progress p ON p.lesson_id = l.id
    WHERE l.course_id = ?
    ORDER BY l.order_index
  `);

  const courseRoots = (
    db.prepare('SELECT path, created_at, last_checked_at FROM course_roots ORDER BY rowid').all() as any[]
  ).map((r): ExportedCourseRoot => ({ path: r.path, createdAt: r.created_at, lastCheckedAt: r.last_checked_at }));

  return {
    format: FORMAT,
    version: VERSION,
    exportedAt: new Date().toISOString(),
    app: { version: appVersion, platform: process.platform },
    collections,
    courses: courses.map((c) => ({
      title: c.title,
      rootPath: c.root_path,
      structure: c.structure,
      archived: !!c.archived,
      sortIndex: c.sort_index,
      collectionId: c.collection_id,
      posterLessonRelPath: c.poster_rel_path ?? null,
      lessons: (lessonsDoCurso.all(c.id) as any[]).map(
        (l): ExportedLesson => ({
          relPath: l.rel_path,
          module: l.module,
          title: l.title,
          orderIndex: l.order_index,
          moduleOrder: l.module_order,
          durationSec: l.duration_sec,
          // updated_at nulo = LEFT JOIN sem linha de progresso: a aula nunca foi aberta.
          progress:
            l.updated_at === null
              ? null
              : {
                  positionSec: l.position_sec,
                  furthestSec: l.furthest_sec,
                  durationSec: l.p_duration_sec,
                  completed: !!l.completed,
                  completedAt: l.completed_at,
                  autoCompleted: !!l.auto_completed,
                  updatedAt: l.updated_at,
                },
        }),
      ),
    })),
    courseRoots,
    settings: { allowedRootsExtra: getAllowedRootsExtra(db) },
  };
}
