import { describe, it, expect } from 'vitest';
import { openDb } from '../db/index';
import { loadConfig } from '../config';
import { buildApp } from '../app';

// O Learnflix não é um PWA. Mas se a origem (ex.: localhost:7777) já hospedou um
// app que registrou um service worker, esse SW continua registrado e serve a
// casca ANTIGA do cache — o Learnflix nunca aparece, por mais que o servidor
// entregue o build novo. Servir um /sw.js que se autodestrói é o que quebra esse
// impasse: o navegador rebusca o script, instala este, e ele apaga os caches e
// se desregistra.
describe('GET /sw.js — desativa service worker herdado da origem', () => {
  it('responde JavaScript de verdade, não o index.html do fallback da SPA', async () => {
    const app = buildApp(loadConfig({}), openDb(':memory:'));
    const res = await app.inject({ method: 'GET', url: '/sw.js' });
    expect(res.statusCode).toBe(200);
    expect(res.headers['content-type']).toContain('javascript');
    expect(res.body).not.toContain('<!doctype html>');
  });

  it('apaga os caches, se desregistra e recarrega as abas abertas', async () => {
    const app = buildApp(loadConfig({}), openDb(':memory:'));
    const res = await app.inject({ method: 'GET', url: '/sw.js' });
    expect(res.body).toContain('caches.delete');
    expect(res.body).toContain('registration.unregister()');
    expect(res.body).toContain('navigate');
    // skipWaiting/clients.claim: sem isso o SW novo fica "waiting" atrás do
    // antigo e a limpeza só valeria depois de fechar todas as abas.
    expect(res.body).toContain('skipWaiting');
  });

  it('nunca é cacheado — o navegador precisa ver a versão nova a cada checagem', async () => {
    const app = buildApp(loadConfig({}), openDb(':memory:'));
    const res = await app.inject({ method: 'GET', url: '/sw.js' });
    expect(res.headers['cache-control']).toContain('no-store');
  });
});
