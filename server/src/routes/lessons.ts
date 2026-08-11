import type { FastifyInstance } from 'fastify';
import type { Db } from '../db';

export async function lessonsRoutes(app: FastifyInstance, opts: { db: Db }): Promise<void> {
  const { db } = opts;

  app.get('/api/lessons/:id', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const r = db.prepare(`
      SELECT l.*, c.title AS course_title,
        p.position_sec, p.furthest_sec, p.completed, p.duration_sec AS p_dur
      FROM lessons l JOIN courses c ON c.id = l.course_id
      LEFT JOIN progress p ON p.lesson_id = l.id
      WHERE l.id = ?
    `).get(id) as any;
    if (!r) { reply.code(404); return { error: 'not_found' }; }

    const prev = db.prepare('SELECT id FROM lessons WHERE course_id=? AND order_index<? ORDER BY order_index DESC LIMIT 1').get(r.course_id, r.order_index) as any;
    const next = db.prepare('SELECT id FROM lessons WHERE course_id=? AND order_index>? ORDER BY order_index ASC LIMIT 1').get(r.course_id, r.order_index) as any;

    return {
      id: r.id, title: r.title, module: r.module, relPath: r.rel_path,
      orderIndex: r.order_index, durationSec: r.duration_sec ?? r.p_dur ?? null,
      container: r.container, playable: !!r.playable, missing: !!r.missing,
      position: r.position_sec ?? 0, furthest: r.furthest_sec ?? 0, completed: !!r.completed,
      courseId: r.course_id, courseTitle: r.course_title,
      prevLessonId: prev?.id ?? null, nextLessonId: next?.id ?? null,
    };
  });

  app.patch('/api/lessons/:id/progress', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const b = req.body as { position_sec: number; furthest_sec: number; duration_sec: number | null };
    if (!db.prepare('SELECT 1 FROM lessons WHERE id=?').get(id)) { reply.code(404); return { error: 'not_found' }; }
    db.prepare(`
      INSERT INTO progress (lesson_id, position_sec, furthest_sec, duration_sec, updated_at)
      VALUES (@id, @pos, @furthest, @dur, @now)
      ON CONFLICT(lesson_id) DO UPDATE SET
        position_sec = excluded.position_sec,
        furthest_sec = MAX(furthest_sec, excluded.furthest_sec),
        duration_sec = COALESCE(excluded.duration_sec, duration_sec),
        updated_at   = excluded.updated_at
    `).run({ id, pos: b.position_sec, furthest: b.furthest_sec, dur: b.duration_sec ?? null, now: new Date().toISOString() });
    reply.code(204);
  });

  app.post('/api/lessons/:id/complete', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const b = req.body as { completed: boolean };
    if (!db.prepare('SELECT 1 FROM lessons WHERE id=?').get(id)) { reply.code(404); return { error: 'not_found' }; }
    const now = new Date().toISOString();
    db.prepare(`
      INSERT INTO progress (lesson_id, position_sec, furthest_sec, completed, completed_at, auto_completed, updated_at)
      VALUES (@id, 0, 0, @completed, @completedAt, 0, @now)
      ON CONFLICT(lesson_id) DO UPDATE SET
        completed = excluded.completed,
        completed_at = excluded.completed_at,
        auto_completed = 0,
        updated_at = excluded.updated_at
    `).run({ id, completed: b.completed ? 1 : 0, completedAt: b.completed ? now : null, now });
    reply.code(204);
  });
}
