import type { FastifyInstance } from 'fastify';

// Service worker de autodestruição.
//
// O Learnflix não é um PWA e não registra service worker nenhum. Mas o navegador
// guarda service workers por ORIGEM, não por aplicação: se algum dia outro app
// rodou em http://localhost:7777 e registrou um SW com precache (o caso do
// Cursos Locais, que deu origem a este projeto), esse SW continua registrado e
// serve a casca ANTIGA a partir do cache. O resultado é cruel de depurar: o
// servidor entrega o build novo, o navegador mostra o app velho, e nenhuma
// correção no front resolve — porque o JavaScript novo nunca chega a rodar.
//
// Sem esta rota, GET /sw.js cai no fallback da SPA e responde index.html: o
// navegador recusa (não é JavaScript) e mantém o SW antigo para sempre.
// Servindo este script, a checagem de atualização do navegador instala ELE,
// que limpa os caches, se desregistra e recarrega as abas — voltando ao normal.
const SELF_DESTROY_SW = `// Learnflix — service worker de autodestruição.
// Não guarda cache nem intercepta requisição alguma: só existe para remover
// service workers herdados desta origem e devolver o controle ao servidor.
self.addEventListener('install', () => self.skipWaiting());

self.addEventListener('activate', (event) => {
  event.waitUntil((async () => {
    await self.clients.claim();
    const nomes = await caches.keys();
    await Promise.all(nomes.map((n) => caches.delete(n)));
    await self.registration.unregister();
    // Recarrega as abas abertas para que elas peguem a versão do servidor.
    const abas = await self.clients.matchAll({ type: 'window' });
    for (const aba of abas) aba.navigate(aba.url);
  })());
});
`;

export async function swRoutes(app: FastifyInstance): Promise<void> {
  app.get('/sw.js', async (_req, reply) => {
    // no-store: a checagem de atualização precisa enxergar este script, e não
    // uma cópia do SW antigo guardada no cache HTTP.
    reply
      .header('Content-Type', 'application/javascript; charset=utf-8')
      .header('Cache-Control', 'no-store')
      .header('Service-Worker-Allowed', '/');
    return SELF_DESTROY_SW;
  });
}
