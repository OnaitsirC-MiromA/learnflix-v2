import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { buildApp } from '../app';

function makeApp(db: any, allowedRoot: string) {
  return buildApp({ allowedRoots: [allowedRoot], thumbsDir: fs.mkdtempSync(path.join(os.tmpdir(), 'colT-')) } as any, db);
}

describe('coleções', () => {
  it('CRUD: cria, lista com contagem, renomeia, exclui preservando cursos', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'col-'));
    fs.writeFileSync(path.join(root, 'a.mp4'), 'x');
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const app = makeApp(db, os.tmpdir());

    const created = await app.inject({ method: 'POST', url: '/api/collections', payload: { name: '  Programação ' } });
    expect(created.statusCode).toBe(201);
    const col = created.json();
    expect(col.name).toBe('Programação'); // trim

    const bad = await app.inject({ method: 'POST', url: '/api/collections', payload: { name: '   ' } });
    expect(bad.statusCode).toBe(400);

    // atribui o curso à coleção via PATCH do curso
    const assign = await app.inject({ method: 'PATCH', url: `/api/courses/${cid}`, payload: { collectionId: col.id } });
    expect(assign.statusCode).toBe(200);

    const list = await app.inject({ method: 'GET', url: '/api/collections' });
    expect(list.json()).toEqual([{ id: col.id, name: 'Programação', courseCount: 1 }]);

    // curso lista com collectionId
    const courses = await app.inject({ method: 'GET', url: '/api/courses' });
    expect(courses.json()[0].collectionId).toBe(col.id);

    const ren = await app.inject({ method: 'PATCH', url: `/api/collections/${col.id}`, payload: { name: 'Dev' } });
    expect(ren.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/collections' })).json()[0].name).toBe('Dev');

    // coleção inexistente no PATCH do curso → 400
    const badAssign = await app.inject({ method: 'PATCH', url: `/api/courses/${cid}`, payload: { collectionId: 'nao-existe' } });
    expect(badAssign.statusCode).toBe(400);

    // remover da coleção (null)
    const clear = await app.inject({ method: 'PATCH', url: `/api/courses/${cid}`, payload: { collectionId: null } });
    expect(clear.statusCode).toBe(200);
    expect((await app.inject({ method: 'GET', url: '/api/courses' })).json()[0].collectionId).toBeNull();

    // re-atribui e exclui a coleção: curso permanece, sem coleção
    await app.inject({ method: 'PATCH', url: `/api/courses/${cid}`, payload: { collectionId: col.id } });
    const del = await app.inject({ method: 'DELETE', url: `/api/collections/${col.id}` });
    expect(del.statusCode).toBe(204);
    const after = await app.inject({ method: 'GET', url: '/api/courses' });
    expect(after.json()).toHaveLength(1);
    expect(after.json()[0].collectionId).toBeNull();

    fs.rmSync(root, { recursive: true, force: true });
    db.close();
  });
});

describe('importação em lote (pasta-raiz de cursos)', () => {
  it('cada subpasta com vídeos vira um curso; existentes e vazias são puladas', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-'));
    // 2 cursos novos, 1 pasta sem vídeo, 1 curso já existente, 1 dotdir ignorada
    fs.mkdirSync(path.join(parent, 'Curso A', 'M1'), { recursive: true });
    fs.writeFileSync(path.join(parent, 'Curso A', 'M1', 'a.mp4'), 'x');
    fs.mkdirSync(path.join(parent, 'Curso B'));
    fs.writeFileSync(path.join(parent, 'Curso B', 'b.mp4'), 'x');
    fs.mkdirSync(path.join(parent, 'So PDFs'));
    fs.writeFileSync(path.join(parent, 'So PDFs', 'apostila.pdf'), 'x');
    fs.mkdirSync(path.join(parent, 'Ja Existe'));
    fs.writeFileSync(path.join(parent, 'Ja Existe', 'c.mp4'), 'x');
    fs.mkdirSync(path.join(parent, '.escondida'));

    const db = openDb(':memory:');
    createCourseFromPath(db, path.join(parent, 'Ja Existe'));
    const app = makeApp(db, os.tmpdir());

    const res = await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: parent } });
    expect(res.statusCode).toBe(201);
    const body = res.json();
    expect(body.created).toBe(2);
    expect(body.skipped).toBe(1); // Ja Existe
    expect(body.noVideos).toBe(1); // So PDFs
    expect(body.courses.map((c: any) => c.title).sort()).toEqual(['Curso A', 'Curso B']);

    // idempotente: rodar de novo não duplica nada
    const again = await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: parent } });
    expect(again.json().created).toBe(0);
    expect(again.json().skipped).toBe(3);

    expect((db.prepare('SELECT COUNT(*) AS n FROM courses').get() as any).n).toBe(3);

    fs.rmSync(parent, { recursive: true, force: true });
    db.close();
  });

  it('fora das raízes permitidas → 403; path inválido → 400', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ allowedRoots: ['/nonexistent-root'], thumbsDir: '/tmp/x' } as any, db);
    const out = await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: os.tmpdir() } });
    expect(out.statusCode).toBe(403);
    const bad = await app.inject({ method: 'POST', url: '/api/courses/batch', payload: {} });
    expect(bad.statusCode).toBe(400);
    db.close();
  });

  // A UI mostra POR NOME o que aconteceu com cada subpasta — só as contagens não
  // explicam um resultado vazio ("0 importados" sem dizer quais pastas e por quê).
  it('devolve os nomes das pastas puladas e das sem vídeo, não só as contagens', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'batch-nomes-'));
    fs.mkdirSync(path.join(parent, 'Curso Novo'));
    fs.writeFileSync(path.join(parent, 'Curso Novo', 'a.mp4'), 'x');
    fs.mkdirSync(path.join(parent, 'Ja Existe'));
    fs.writeFileSync(path.join(parent, 'Ja Existe', 'b.mp4'), 'x');
    fs.mkdirSync(path.join(parent, 'Vazia Sem Video'));
    fs.writeFileSync(path.join(parent, 'Vazia Sem Video', 'leia.pdf'), 'x');

    const db = openDb(':memory:');
    createCourseFromPath(db, path.join(parent, 'Ja Existe'));
    const app = makeApp(db, os.tmpdir());

    const body = (await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: parent } })).json();
    expect(body.courses.map((c: any) => c.title)).toEqual(['Curso Novo']);
    expect(body.skippedTitles).toEqual(['Ja Existe']);
    expect(body.noVideosTitles).toEqual(['Vazia Sem Video']);

    fs.rmSync(parent, { recursive: true, force: true });
    db.close();
  });
});

describe('pastas de cursos persistidas (course_roots)', () => {
  it('importação em lote registra a raiz; rodar de novo não duplica', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'root-'));
    fs.mkdirSync(path.join(parent, 'Curso A'));
    fs.writeFileSync(path.join(parent, 'Curso A', 'a.mp4'), 'x');
    const db = openDb(':memory:');
    const app = makeApp(db, os.tmpdir());

    await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: parent } });
    const rows1 = db.prepare('SELECT * FROM course_roots').all() as any[];
    expect(rows1).toHaveLength(1);
    expect(rows1[0].path).toBe(path.resolve(parent));
    expect(rows1[0].last_checked_at).not.toBeNull();

    // rodar de novo (recheck): não duplica o registro
    await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: parent } });
    const rows2 = db.prepare('SELECT * FROM course_roots').all() as any[];
    expect(rows2).toHaveLength(1);
    expect(rows2[0].id).toBe(rows1[0].id);

    fs.rmSync(parent, { recursive: true, force: true });
    db.close();
  });

  it('GET lista as raízes registradas; DELETE remove (404 se não existe)', async () => {
    const parent = fs.mkdtempSync(path.join(os.tmpdir(), 'root-'));
    fs.mkdirSync(path.join(parent, 'Curso A'));
    fs.writeFileSync(path.join(parent, 'Curso A', 'a.mp4'), 'x');
    const db = openDb(':memory:');
    const app = makeApp(db, os.tmpdir());

    await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: parent } });
    const list = await app.inject({ method: 'GET', url: '/api/courses/roots' });
    expect(list.statusCode).toBe(200);
    const roots = list.json();
    expect(roots).toHaveLength(1);
    expect(roots[0]).toMatchObject({ path: path.resolve(parent) });
    expect(roots[0].createdAt).toBeTruthy();

    const del = await app.inject({ method: 'DELETE', url: `/api/courses/roots/${roots[0].id}` });
    expect(del.statusCode).toBe(204);
    expect((await app.inject({ method: 'GET', url: '/api/courses/roots' })).json()).toHaveLength(0);

    const delAgain = await app.inject({ method: 'DELETE', url: `/api/courses/roots/${roots[0].id}` });
    expect(delAgain.statusCode).toBe(404);

    fs.rmSync(parent, { recursive: true, force: true });
    db.close();
  });

  it('raiz fora das permitidas ou path inválido não registra nada', async () => {
    const db = openDb(':memory:');
    const app = buildApp({ allowedRoots: ['/nonexistent-root'], thumbsDir: '/tmp/x' } as any, db);
    await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: os.tmpdir() } }); // 403
    await app.inject({ method: 'POST', url: '/api/courses/batch', payload: {} }); // 400
    expect((db.prepare('SELECT COUNT(*) AS n FROM course_roots').get() as any).n).toBe(0);
    db.close();
  });
});
