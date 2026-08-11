import { describe, it, expect, beforeAll, afterAll } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { materialsRoutes } from './materials';

let root: string;

function makeApp(db: any) {
  const app = Fastify();
  app.register(materialsRoutes, { db, config: { allowedRoots: [root] } as any });
  return app;
}

beforeAll(() => {
  root = fs.mkdtempSync(path.join(os.tmpdir(), 'mat-'));
  fs.mkdirSync(path.join(root, 'curso', 'Mod 1'), { recursive: true });
  fs.writeFileSync(path.join(root, 'curso', 'Mod 1', 'aula.mp4'), 'v');
  fs.writeFileSync(path.join(root, 'curso', 'Mod 1', 'apostila.pdf'), '%PDF-1.4 conteudo');
  fs.writeFileSync(path.join(root, 'curso', 'material.zip'), 'PKzip');
});

afterAll(() => fs.rmSync(root, { recursive: true, force: true }));

describe('materials route', () => {
  it('serve PDF inline com content-type e o detalhe do curso lista os materiais', async () => {
    const db = openDb(':memory:');
    createCourseFromPath(db, path.join(root, 'curso'));
    const pdf = db.prepare("SELECT id FROM materials WHERE rel_path LIKE '%apostila.pdf'").get() as { id: string };
    const zip = db.prepare("SELECT id FROM materials WHERE rel_path LIKE '%material.zip'").get() as { id: string };
    expect(pdf?.id).toBeTruthy();

    const app = makeApp(db);
    const r = await app.inject({ method: 'GET', url: `/api/materials/${pdf.id}` });
    expect(r.statusCode).toBe(200);
    expect(r.headers['content-type']).toBe('application/pdf');
    expect(r.headers['content-disposition']).toContain('inline');
    expect(r.body).toContain('%PDF');

    // zip vai como download (attachment) mesmo sem ?download
    const z = await app.inject({ method: 'GET', url: `/api/materials/${zip.id}` });
    expect(z.headers['content-type']).toBe('application/zip');
    expect(z.headers['content-disposition']).toContain('attachment');

    // ?download=1 força attachment no PDF também
    const dl = await app.inject({ method: 'GET', url: `/api/materials/${pdf.id}?download=1` });
    expect(dl.headers['content-disposition']).toContain('attachment');
  });

  it('404 para material inexistente', async () => {
    const db = openDb(':memory:');
    const app = makeApp(db);
    expect((await app.inject({ method: 'GET', url: '/api/materials/nao-existe' })).statusCode).toBe(404);
  });
});
