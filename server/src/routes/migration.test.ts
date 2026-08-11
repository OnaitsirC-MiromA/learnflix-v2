import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { migrationRoutes } from './migration';

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'mig-'));
  fs.writeFileSync(path.join(root, 'a.mp4'), 'x');
  return root;
}

describe('rotas de migração', () => {
  it('preview não altera; repoint aplica e muda root; rescan 409 sem pasta', async () => {
    const root = fixture();
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const app = Fastify();
    app.register(migrationRoutes, { db, config: { allowedRoots: [os.tmpdir()] } as any });

    const root2 = fixture();
    const prev = await app.inject({ method: 'POST', url: `/api/courses/${cid}/repoint/preview`, payload: { path: root2 } });
    expect(prev.statusCode).toBe(200);
    expect(prev.json().matched).toBe(1);
    expect((db.prepare('SELECT root_path FROM courses WHERE id=?').get(cid) as any).root_path).toBe(root); // preview não escreveu

    const apply = await app.inject({ method: 'POST', url: `/api/courses/${cid}/repoint`, payload: { path: root2 } });
    expect(apply.statusCode).toBe(200);
    expect((db.prepare('SELECT root_path FROM courses WHERE id=?').get(cid) as any).root_path).toBe(root2);

    fs.rmSync(root2, { recursive: true, force: true });
    const rescan = await app.inject({ method: 'POST', url: `/api/courses/${cid}/rescan` });
    expect(rescan.statusCode).toBe(409);
    expect(rescan.json().status).toBe('root_unavailable');

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('preview fora das raízes → 403', async () => {
    const root = fixture();
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const app = Fastify();
    app.register(migrationRoutes, { db, config: { allowedRoots: ['/nonexistent-root'] } as any });
    const res = await app.inject({ method: 'POST', url: `/api/courses/${cid}/repoint/preview`, payload: { path: '/etc' } });
    expect(res.statusCode).toBe(403);
    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });
});
