import { describe, it, expect } from 'vitest';
import Fastify from 'fastify';
import { registrarSpa } from './spa';
import type { AssetEmbutido } from './bundled';

const b64 = (s: string) => Buffer.from(s).toString('base64');

const ASSETS: Record<string, AssetEmbutido> = {
  '/index.html': { tipo: 'text/html; charset=utf-8', base64: b64('<html>a casca</html>') },
  '/assets/app.js': { tipo: 'text/javascript; charset=utf-8', base64: b64('console.log(1)') },
  '/fonts/inter.woff2': { tipo: 'font/woff2', base64: b64('fonte-binaria') },
};

function appCom(assets: Record<string, AssetEmbutido>) {
  const app = Fastify({ logger: false });
  app.get('/api/health', async () => ({ ok: true }));
  registrarSpa(app, assets);
  return app;
}

describe('registrarSpa', () => {
  it('serve a casca na raiz', async () => {
    const res = await appCom(ASSETS).inject({ method: 'GET', url: '/' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<html>a casca</html>');
    expect(res.headers['content-type']).toBe('text/html; charset=utf-8');
  });

  it('serve cada arquivo com o tipo certo', async () => {
    const app = appCom(ASSETS);

    const js = await app.inject({ method: 'GET', url: '/assets/app.js' });
    expect(js.headers['content-type']).toBe('text/javascript; charset=utf-8');
    expect(js.body).toBe('console.log(1)');

    const fonte = await app.inject({ method: 'GET', url: '/fonts/inter.woff2' });
    expect(fonte.headers['content-type']).toBe('font/woff2');
  });

  // A SPA usa rotas de verdade no navegador (/course/abc). Recarregar a página
  // nessas URLs precisa devolver a casca, ou o app "some" no F5.
  it('devolve a casca em qualquer rota da interface', async () => {
    const res = await appCom(ASSETS).inject({ method: 'GET', url: '/course/abc123' });

    expect(res.statusCode).toBe(200);
    expect(res.body).toBe('<html>a casca</html>');
  });

  // Rota de API que não existe é erro de programa, não navegação — devolver
  // HTML aqui faria o cliente tentar fazer JSON.parse numa página inteira.
  it('não devolve a casca para /api desconhecida', async () => {
    const res = await appCom(ASSETS).inject({ method: 'GET', url: '/api/nao-existe' });

    expect(res.statusCode).toBe(404);
    expect(res.json()).toEqual({ error: 'not_found' });
  });

  it('não atrapalha as rotas de API que existem', async () => {
    const res = await appCom(ASSETS).inject({ method: 'GET', url: '/api/health' });

    expect(res.json()).toEqual({ ok: true });
  });

  // Em desenvolvimento não há interface embutida: quem serve é o Vite. O
  // servidor não pode fingir que tem uma casca para dar.
  it('sem interface embutida, deixa o 404 padrão acontecer', async () => {
    const res = await appCom({}).inject({ method: 'GET', url: '/qualquer-coisa' });

    expect(res.statusCode).toBe(404);
  });
});
