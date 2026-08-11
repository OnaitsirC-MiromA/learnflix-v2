import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { buildApp } from '../app';

function makeApp(db: any) {
  return buildApp({ allowedRoots: [os.tmpdir()], thumbsDir: '/tmp/x' } as any, db);
}

// Um curso real com uma aula e progresso, para as rotas terem o que carregar.
function comCurso(db: any) {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'rota-'));
  fs.writeFileSync(path.join(root, 'aula-01.mp4'), 'conteudo');
  const courseId = createCourseFromPath(db, root);
  const aula = db.prepare('SELECT id FROM lessons WHERE course_id=?').get(courseId) as any;
  db.prepare('INSERT INTO progress (lesson_id, position_sec, furthest_sec, updated_at) VALUES (?,120,200,?)').run(
    aula.id,
    '2026-03-01T00:00:00.000Z',
  );
  return { root: path.resolve(root), courseId };
}

describe('GET /api/library/export', () => {
  it('devolve o arquivo pronto para baixar, com nome datado', async () => {
    const db = openDb(':memory:');
    const { root } = comCurso(db);
    const app = makeApp(db);

    const res = await app.inject({ method: 'GET', url: '/api/library/export' });

    expect(res.statusCode).toBe(200);
    expect(res.headers['content-disposition']).toMatch(/attachment; filename="learnflix-\d{4}-\d{2}-\d{2}\.json"/);
    const body = res.json();
    expect(body.format).toBe('learnflix-library');
    expect(body.courses[0].lessons[0].progress).toMatchObject({ furthestSec: 200 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });
});

describe('POST /api/library/import/preview', () => {
  it('conta o que aconteceria, sem gravar nada', async () => {
    const db = openDb(':memory:');
    const { root } = comCurso(db);
    const app = makeApp(db);
    const arquivo = (await app.inject({ method: 'GET', url: '/api/library/export' })).json();

    const res = await app.inject({ method: 'POST', url: '/api/library/import/preview', payload: arquivo });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 0, merged: 1, missingFolder: 0 });
    // Nada foi criado: o curso continua sendo um só.
    expect(db.prepare('SELECT COUNT(*) n FROM courses').get()).toEqual({ n: 1 });

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });

  it('recusa um arquivo que não é do Learnflix, explicando o motivo', async () => {
    const db = openDb(':memory:');
    const app = makeApp(db);

    const res = await app.inject({ method: 'POST', url: '/api/library/import/preview', payload: { nome: 'outra coisa' } });

    expect(res.statusCode).toBe(400);
    expect(res.json().error).toMatch(/não parece ser um arquivo do Learnflix/i);

    db.close();
  });

  it('recusa corpo vazio', async () => {
    const db = openDb(':memory:');
    const app = makeApp(db);

    const res = await app.inject({ method: 'POST', url: '/api/library/import/preview' });

    expect(res.statusCode).toBe(400);

    db.close();
  });
});

describe('POST /api/library/import', () => {
  it('aplica o arquivo e devolve o resumo do que fez', async () => {
    const origem = openDb(':memory:');
    const { root } = comCurso(origem);
    const arquivo = (await makeApp(origem).inject({ method: 'GET', url: '/api/library/export' })).json();

    const destino = openDb(':memory:');
    const app = makeApp(destino);
    const res = await app.inject({ method: 'POST', url: '/api/library/import', payload: arquivo });

    expect(res.statusCode).toBe(200);
    expect(res.json()).toMatchObject({ created: 1, merged: 0 });
    expect(destino.prepare('SELECT COUNT(*) n FROM courses').get()).toEqual({ n: 1 });
    const p = destino.prepare('SELECT furthest_sec FROM progress').get() as any;
    expect(p.furthest_sec).toBe(200);

    fs.rmSync(root, { recursive: true, force: true });
    origem.close();
    destino.close();
  });

  it('não aplica nada quando o arquivo é inválido', async () => {
    const db = openDb(':memory:');
    const app = makeApp(db);

    const res = await app.inject({ method: 'POST', url: '/api/library/import', payload: { format: 'outra-coisa' } });

    expect(res.statusCode).toBe(400);
    expect(db.prepare('SELECT COUNT(*) n FROM courses').get()).toEqual({ n: 0 });

    db.close();
  });
});
