import type { FastifyInstance } from 'fastify';
import type { AssetEmbutido } from './bundled';

/**
 * Serve a interface a partir dos arquivos embutidos no build.
 *
 * Nada de disco: no v1 a SPA era procurada em `cwd/../web/dist`, o que dava
 * página em branco sempre que o processo subia de outro diretório — e não
 * sobreviveria de jeito nenhum a virar um executável único.
 *
 * Sem assets embutidos (desenvolvimento, onde quem serve é o Vite), não
 * registra nada: o servidor não tem casca para dar e não deve fingir que tem.
 */
export function registrarSpa(app: FastifyInstance, assets: Record<string, AssetEmbutido>): void {
  const casca = assets['/index.html'];
  if (!casca) return;

  // Decodifica uma vez no boot, e não a cada requisição.
  const corpos = new Map<string, Buffer>(
    Object.entries(assets).map(([rota, a]) => [rota, Buffer.from(a.base64, 'base64')]),
  );

  for (const [rota, asset] of Object.entries(assets)) {
    app.get(rota, async (_req, reply) => reply.type(asset.tipo).send(corpos.get(rota)));
    // A raiz é a casca — /index.html continua valendo, mas ninguém digita isso.
    if (rota === '/index.html') {
      app.get('/', async (_req, reply) => reply.type(asset.tipo).send(corpos.get(rota)));
    }
  }

  app.setNotFoundHandler((req, reply) => {
    // /api desconhecida é erro de programa, não navegação: devolver HTML faria o
    // cliente tentar interpretar uma página inteira como JSON.
    if (req.url.startsWith('/api')) return reply.code(404).send({ error: 'not_found' });
    // Qualquer outra URL é rota da SPA (/course/abc): recarregar a página nelas
    // precisa devolver a casca, ou o app some no F5.
    return reply.type(casca.tipo).send(corpos.get('/index.html'));
  });
}
