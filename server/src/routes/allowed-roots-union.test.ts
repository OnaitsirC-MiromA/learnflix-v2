import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { coursesRoutes } from './courses';
import { migrationRoutes } from './migration';

function fixture(prefix: string): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), prefix));
  fs.writeFileSync(path.join(root, 'a.mp4'), 'x');
  return root;
}

describe('guards de criar/repoint aceitam raízes extras de /settings (env ∪ extras)', () => {
  it('POST /api/courses com path sob raiz extra (fora de config.allowedRoots) não dá 403', async () => {
    const envRoot = fixture('env-');
    const extraRoot = fixture('extra-');
    const db = openDb(':memory:');
    // config.allowedRoots NÃO inclui extraRoot — só a extra em settings desbloqueia.
    const config = { allowedRoots: [envRoot] } as any;
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('allowed_roots_extra', JSON.stringify([extraRoot]));

    const app = Fastify();
    app.register(coursesRoutes, { db, config });

    const res = await app.inject({ method: 'POST', url: '/api/courses', payload: { path: extraRoot } });
    expect(res.statusCode).toBe(201);

    fs.rmSync(envRoot, { recursive: true, force: true });
    fs.rmSync(extraRoot, { recursive: true, force: true });
    db.close();
  });

  it('POST /api/courses/:id/repoint/preview com path sob raiz extra não dá 403', async () => {
    const envRoot = fixture('env-');
    const extraRoot = fixture('extra-');
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, envRoot);
    const config = { allowedRoots: [envRoot] } as any;
    db.prepare('INSERT INTO settings (key, value) VALUES (?, ?)').run('allowed_roots_extra', JSON.stringify([extraRoot]));

    const app = Fastify();
    app.register(migrationRoutes, { db, config });

    const res = await app.inject({
      method: 'POST',
      url: `/api/courses/${cid}/repoint/preview`,
      payload: { path: extraRoot },
    });
    expect(res.statusCode).not.toBe(403);
    expect([200, 409]).toContain(res.statusCode);

    fs.rmSync(envRoot, { recursive: true, force: true });
    fs.rmSync(extraRoot, { recursive: true, force: true });
    db.close();
  });
});
