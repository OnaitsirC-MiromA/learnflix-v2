import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { coursesRoutes } from './courses';

let root: string;

function makeApp() {
  const db = openDb(':memory:');
  const app = Fastify();
  app.register(coursesRoutes, { db, config: { allowedRoots: [root] } as any });
  return app;
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'courses-'));
  fs.mkdirSync(path.join(root, 'curso', '01 - Mod'), { recursive: true });
  fs.writeFileSync(path.join(root, 'curso', '01 - Mod', '01 - a.mp4'), 'x');
  fs.writeFileSync(path.join(root, 'curso', '01 - Mod', '02 - b.mp4'), 'x');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('courses routes', () => {
  it('POST cria curso, GET lista com agregados, GET detalhe agrupa módulos', async () => {
    const app = makeApp();
    const created = await app.inject({
      method: 'POST', url: '/api/courses',
      payload: { path: path.join(root, 'curso') },
    });
    expect(created.statusCode).toBe(201);
    const { id } = created.json();

    const list = await app.inject({ method: 'GET', url: '/api/courses' });
    const summary = list.json()[0];
    expect(summary.totalLessons).toBe(2);
    expect(summary.completedLessons).toBe(0);
    expect(summary.inProgressLessons).toBe(0);
    expect(summary.structure).toBe('modules');

    const detail = await app.inject({ method: 'GET', url: `/api/courses/${id}` });
    const d = detail.json();
    expect(d.structure).toBe('modules');
    expect(d.modules[0].name).toBe('01 - Mod');
    expect(d.modules[0].lessons.map((l: any) => l.title)).toEqual(['01 - a', '02 - b']);
  });

  it('POST rejeita path fora das raízes', async () => {
    const app = makeApp();
    const res = await app.inject({ method: 'POST', url: '/api/courses', payload: { path: '/etc' } });
    expect(res.statusCode).toBe(403);
  });

  it('POST na mesma pasta NÃO duplica — re-escaneia e devolve existing=true', async () => {
    const app = makeApp();
    const p = path.join(root, 'curso');
    const first = await app.inject({ method: 'POST', url: '/api/courses', payload: { path: p } });
    expect(first.statusCode).toBe(201);
    expect(first.json().existing).toBe(false);
    const firstId = first.json().id;

    const again = await app.inject({ method: 'POST', url: '/api/courses', payload: { path: p } });
    expect(again.statusCode).toBe(200);
    expect(again.json()).toMatchObject({ id: firstId, existing: true });

    // continua só 1 curso (não duplicou)
    expect((await app.inject({ method: 'GET', url: '/api/courses' })).json()).toHaveLength(1);
  });
});
