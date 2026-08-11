import fs from 'node:fs';
import { existsSync } from 'node:fs';
import type { FastifyInstance, FastifyReply } from 'fastify';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../config';
import { getOrCreateLessonThumb, setCourseCover } from '../media/thumbs';

function sendImage(reply: FastifyReply, filePath: string) {
  reply.header('Content-Type', 'image/jpeg');
  reply.header('Cache-Control', 'private, max-age=86400');
  return reply.send(fs.createReadStream(filePath));
}

export async function thumbsRoutes(app: FastifyInstance, opts: { db: Database.Database; config: AppConfig }): Promise<void> {
  const { db, config } = opts;

  app.get('/api/lessons/:id/thumb', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const out = await getOrCreateLessonThumb(db, config, id);
    if (!out) return reply.code(404).send({ error: 'no_thumb' });
    return sendImage(reply, out);
  });

  app.get('/api/courses/:id/cover', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const course = db.prepare('SELECT cover_path, poster_lesson_id FROM courses WHERE id=?').get(id) as any;
    if (!course) return reply.code(404).send({ error: 'not_found' });
    if (course.cover_path && existsSync(course.cover_path)) return sendImage(reply, course.cover_path);
    if (course.poster_lesson_id) {
      const out = await getOrCreateLessonThumb(db, config, course.poster_lesson_id);
      if (out) return sendImage(reply, out);
    }
    return reply.code(404).send({ error: 'no_cover' });
  });

  app.post('/api/courses/:id/cover', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const b = req.body as { lessonId?: string; atSec?: number };
    if (!b?.lessonId || typeof b.atSec !== 'number') return reply.code(400).send({ error: 'bad_request' });
    const r = await setCourseCover(db, config, id, b.lessonId, b.atSec);
    if (r === 'not_found') return reply.code(404).send({ error: 'not_found' });
    if (r === 'no_ffmpeg') return reply.code(503).send({ error: 'ffmpeg_required' });
    return reply.code(204).send();
  });
}
