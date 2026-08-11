import path from 'node:path';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../config';
import { isWithinRoots } from './fs';
import { allowedRootsFor } from './settings';
import { previewReconcile, reconcileCourse } from '../scan/reconcile';

export async function migrationRoutes(app: FastifyInstance, opts: { db: Database.Database; config: AppConfig }): Promise<void> {
  const { db, config } = opts;

  const validatePath = (raw: unknown): { ok: true; path: string } | { ok: false; code: number } => {
    if (!raw || typeof raw !== 'string') return { ok: false, code: 400 };
    const target = path.resolve(raw);
    if (!isWithinRoots(target, allowedRootsFor(config, db))) return { ok: false, code: 403 };
    try {
      if (!fs.statSync(target).isDirectory()) return { ok: false, code: 400 };
    } catch {
      return { ok: false, code: 400 };
    }
    return { ok: true, path: target };
  };

  app.post('/api/courses/:id/repoint/preview', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const v = validatePath((req.body as { path?: string })?.path);
    if (!v.ok) return reply.code(v.code).send({ error: 'invalid_path' });
    const r = previewReconcile(db, config, id, { newRootPath: v.path });
    if ('status' in r) return reply.code(409).send(r);
    return r;
  });

  app.post('/api/courses/:id/repoint', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const v = validatePath((req.body as { path?: string })?.path);
    if (!v.ok) return reply.code(v.code).send({ error: 'invalid_path' });
    const r = reconcileCourse(db, config, id, { newRootPath: v.path });
    if ('status' in r) return reply.code(409).send(r);
    return r;
  });

  app.post('/api/courses/:id/rescan', async (req, reply) => {
    const id = (req.params as { id: string }).id;
    const r = reconcileCourse(db, config, id);
    if ('status' in r) return reply.code(409).send(r);
    return r;
  });
}
