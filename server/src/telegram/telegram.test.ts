import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { describe, it, expect, beforeEach, afterEach } from 'vitest';
import Fastify, { type FastifyInstance } from 'fastify';
import { openDb, type Db } from '../db';
import { buildApp } from '../app';
import { loadConfig } from '../config';
import { saveCatalog, validCatalog, type TelegramCatalog } from './catalog';
import { buildExport } from '../backup/export';
import { parseExport } from '../backup/format';
import { applyImport, planImport } from '../backup/import';
import { matchCourse } from '../backup/identify';

const catalog: TelegramCatalog = { chatId: '-100123', topicId: 45, title: 'Meu curso', files: [
  { messageId: 51, name: '01 - Introdução.mp4', size: 10, mime: 'video/mp4', video: true, duration: 2000 },
  { messageId: 52, name: 'Material.pdf', size: 10, mime: 'application/pdf', video: false, duration: null },
] };
let db: Db;
let upstream: FastifyInstance;
let app: FastifyInstance;
let mediaCalls: number;
let configuredCatalog: TelegramCatalog;

beforeEach(async () => {
  db = openDb(':memory:'); mediaCalls = 0; configuredCatalog = structuredClone(catalog);
  upstream = Fastify();
  upstream.addHook('preHandler', async (req, reply) => {
    if (req.headers.authorization !== 'Bearer teste-token') return reply.code(401).send();
  });
  upstream.get('/health', async () => ({ connected: true }));
  upstream.post('/catalog', async () => configuredCatalog);
  upstream.get('/media/:chat/:message', async (req, reply) => {
    mediaCalls++;
    expect((req.params as any).chat).toBe('-100123');
    reply.header('Accept-Ranges', 'bytes').header('Content-Type', 'video/mp4');
    if (req.headers.range === 'bytes=4-7') return reply.code(206).header('Content-Range', 'bytes 4-7/10').header('Content-Length', '4').send('EFGH');
    if (req.headers.range) return reply.code(416).header('Content-Range', 'bytes */10').send();
    return reply.header('Content-Length', '10').send('ABCDEFGHIJ');
  });
  const addr = await upstream.listen({ host: '127.0.0.1', port: 0 });
  app = buildApp({ ...loadConfig({}), telegramBridgeUrl: addr, telegramBridgeToken: 'teste-token' }, db);
});
afterEach(async () => { await app.close(); await upstream.close(); db.close(); });

describe('cursos Telegram', () => {
  it('protege interface, catálogo e vídeos quando há senha de acesso', async () => {
    const secured = buildApp({ ...loadConfig({}), accessPassword: 'segredo-de-teste' }, db);
    const unauth = await secured.inject({ url: '/api/courses' });
    expect(unauth.statusCode).toBe(401);
    expect(unauth.headers['www-authenticate']).toContain('Basic');
    const wrong = await secured.inject({ url: '/', headers: { authorization: `Basic ${Buffer.from('learnflix:errado').toString('base64')}` } });
    expect(wrong.statusCode).toBe(401);
    const ok = await secured.inject({ url: '/api/courses', headers: { authorization: `Basic ${Buffer.from('learnflix:segredo-de-teste').toString('base64')}` } });
    expect(ok.statusCode).toBe(200);
    await secured.close();
  });
  it('persiste a posição em disco após encerrar e abrir o Learnflix novamente', async () => {
    const dir = fs.mkdtempSync(path.join(os.tmpdir(), 'learnflix-telegram-'));
    const file = path.join(dir, 'app.db');
    let disk = openDb(file);
    try {
      const cid = saveCatalog(disk, catalog);
      const lid = disk.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid)!.id;
      disk.prepare('INSERT INTO progress(lesson_id,position_sec,furthest_sec,updated_at) VALUES(?,123.456,432.1,?)').run(lid, new Date().toISOString());
      disk.close(); disk = openDb(file);
      saveCatalog(disk, { ...catalog, files: [{ ...catalog.files[0], name: 'Título novo.mp4' }] });
      expect(disk.prepare('SELECT position_sec FROM progress WHERE lesson_id=?').get(lid)!.position_sec).toBe(123.456);
      expect(disk.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid)!.id).toBe(lid);
    } finally { disk.close(); fs.rmSync(dir, { recursive: true, force: true }); }
  });

  it('prévia não baixa mídia nem cria curso; importar permite vídeo e material por Range', async () => {
    const r = await app.inject({ method: 'POST', url: '/api/telegram/preview', payload: { link: 'https://t.me/exemplo/45' } });
    expect(r.statusCode).toBe(200);
    expect(r.json().files).toHaveLength(2);
    expect(db.prepare('SELECT count(*) AS n FROM courses').get()!.n).toBe(0);
    expect(mediaCalls).toBe(0);
    const added = await app.inject({ method: 'POST', url: '/api/telegram/courses', payload: { link: 'https://t.me/exemplo/45' } });
    expect(added.statusCode).toBe(201);
    expect(mediaCalls).toBe(0);
    const cid = added.json().id;
    const lesson = db.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid)!;
    const partial = await app.inject({ url: `/api/lessons/${lesson.id}/stream`, headers: { range: 'bytes=4-7' } });
    expect(partial.statusCode).toBe(206);
    expect(partial.body).toBe('EFGH');
    expect(partial.headers['content-range']).toBe('bytes 4-7/10');
    expect(partial.headers['cache-control']).toBe('private, no-store');
    expect(partial.headers.authorization).toBeUndefined();
    const material = db.prepare('SELECT id FROM materials WHERE course_id=?').get(cid)!;
    const pdf = await app.inject({ url: `/api/materials/${material.id}`, headers: { range: 'bytes=4-7' } });
    expect(pdf.body).toBe('EFGH');
    const invalid = await app.inject({ url: `/api/lessons/${lesson.id}/stream`, headers: { range: 'bytes=100-' } });
    expect(invalid.statusCode).toBe(416);
    expect(invalid.headers['content-range']).toBe('bytes */10');
  });
  it('posição, retrocesso e conclusão sobrevivem a renomear, atualizar, remover e voltar aula', async () => {
    const cid = saveCatalog(db, catalog);
    const lesson = db.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid)!;
    const url = `/api/lessons/${lesson.id}`;
    for (const pos of [985.5, 432.25]) {
      expect((await app.inject({ method: 'PATCH', url: url+'/progress', payload: { position_sec: pos, furthest_sec: 985.5, duration_sec: 2000 } })).statusCode).toBe(204);
    }
    await app.inject({ method: 'POST', url: url+'/complete', payload: { completed: true } });
    configuredCatalog.files[0].name = 'Título corrigido.webm';
    configuredCatalog.files.unshift({ ...catalog.files[0], messageId: 49, name: 'Antes.mp4' });
    const refresh = await app.inject({ method: 'POST', url: `/api/telegram/courses/${cid}/refresh` });
    expect(refresh.statusCode).toBe(200);
    const result = (await app.inject({ url })).json();
    expect(result.position).toBe(432.25);
    expect(result.furthest).toBe(985.5);
    expect(result.completed).toBe(true);
    expect(result.title).toBe('Título corrigido.webm');
    expect(result.progressUpdatedAt).toBeTruthy();
    saveCatalog(db, { ...catalog, files: [] });
    expect((await app.inject({ url: url+'/stream' })).statusCode).toBe(404);
    saveCatalog(db, catalog);
    expect((await app.inject({ url })).json().position).toBe(432.25);
    expect((await app.inject({ method: 'POST', url: `/api/courses/${cid}/rescan` })).statusCode).toBe(409);
  });
  it('exportação/importação mantém catálogo, materiais e progresso sem sessão ou token', async () => {
    const cid = saveCatalog(db, catalog);
    const lid = db.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid)!.id;
    await app.inject({ method: 'PATCH', url: `/api/lessons/${lid}/progress`, payload: { position_sec: 123.45, furthest_sec: 321, duration_sec: 2000 } });
    const backup = buildExport(db);
    expect(parseExport(backup).ok).toBe(true);
    expect(JSON.stringify(backup)).not.toContain('teste-token');
    const target = openDb(':memory:');
    expect(planImport(target, backup).missingFolder).toBe(0);
    applyImport(target, backup); applyImport(target, backup);
    expect(target.prepare('SELECT count(*) AS n FROM courses').get()!.n).toBe(1);
    expect(target.prepare('SELECT position_sec FROM progress').get()!.position_sec).toBe(123.45);
    expect(target.prepare('SELECT telegram_message_id FROM lessons').get()!.telegram_message_id).toBe(51);
    expect(target.prepare('SELECT count(*) AS n FROM materials').get()!.n).toBe(1);
    expect(matchCourse(target, { ...backup.courses[0], rootPath: 'telegram://-100999/45', telegram: { ...catalog, chatId: '-100999' } })).toBeNull();
    target.close();
  });
  it('títulos visuais preservam origem, identidade, ordem e progresso inclusive no backup', async () => {
    const id = saveCatalog(db, catalog);
    const before = db.prepare('SELECT * FROM lessons WHERE course_id=?').get(id)!;
    await app.inject({ method: 'PATCH', url: `/api/lessons/${before.id}/progress`, payload: { position_sec: 97.5, furthest_sec: 120, duration_sec: 2000 } });
    const labeled = structuredClone(catalog);
    labeled.files[0].displayTitle = 'F01 · 01.1 — The Family';
    saveCatalog(db, labeled);
    const after = db.prepare('SELECT * FROM lessons WHERE course_id=?').get(id)!;
    expect(after.id).toBe(before.id);
    expect(after.rel_path).toBe(before.rel_path);
    expect(after.order_index).toBe(before.order_index);
    expect(after.title).toBe('F01 · 01.1 — The Family');
    expect(db.prepare('SELECT position_sec FROM progress WHERE lesson_id=?').get(before.id)!.position_sec).toBe(97.5);
    const backup = buildExport(db);
    const exported = backup.courses[0].telegram!.files.find(f => f.video)!;
    expect(exported.name).toBe(catalog.files[0].name);
    expect(exported.displayTitle).toBe('F01 · 01.1 — The Family');
    const target = openDb(':memory:');
    applyImport(target, backup);
    const restored = target.prepare('SELECT * FROM lessons').get()!;
    expect(restored.title).toBe(after.title);
    expect(restored.rel_path).toBe(before.rel_path);
    expect(target.prepare('SELECT position_sec FROM progress').get()!.position_sec).toBe(97.5);
    target.close();
    expect(validCatalog({ ...catalog, files: [{ ...catalog.files[0], displayTitle: 123 }] })).toBe(false);
    expect(validCatalog({ ...catalog, files: [{ ...catalog.files[0], displayTitle: 'a\nb' }] })).toBe(false);
  });

  it('recusa catálogo inválido e progresso inválido sem alterar o banco', async () => {
    expect(validCatalog({ ...catalog, files: [{ ...catalog.files[0], name: '../a.mp4' }] })).toBe(false);
    expect(validCatalog({ ...catalog, files: [catalog.files[0], catalog.files[0]] })).toBe(false);
    const cid = saveCatalog(db, catalog);
    const lid = db.prepare('SELECT id FROM lessons WHERE course_id=?').get(cid)!.id;
    expect((await app.inject({ method: 'PATCH', url: `/api/lessons/${lid}/progress`, payload: { position_sec: -1, furthest_sec: 0, duration_sec: null } })).statusCode).toBe(400);
    expect(db.prepare('SELECT count(*) AS n FROM progress').get()!.n).toBe(0);
  });
  it('não configurado retorna orientação e nunca revela credenciais', async () => {
    const unconfigured = buildApp(loadConfig({}), db);
    const response = await unconfigured.inject({ method: 'POST', url: '/api/telegram/preview', payload: { link: 'https://t.me/exemplo' } });
    expect(response.statusCode).toBe(503);
    expect(response.body).toContain('Conecte o serviço Telegram');
    await unconfigured.close();
  });
});
