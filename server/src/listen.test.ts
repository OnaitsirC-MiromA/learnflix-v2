import { describe, it, expect, afterEach } from 'vitest';
import net from 'node:net';
import { escutarComFallback } from './listen';

const ocupados: net.Server[] = [];

function ocupar(port: number): Promise<void> {
  return new Promise((resolve) => {
    const s = net.createServer().listen(port, '127.0.0.1', () => resolve());
    ocupados.push(s);
  });
}

afterEach(() => {
  for (const s of ocupados.splice(0)) s.close();
});

// Um app "fake" com a mesma superfície que o escutarComFallback usa do Fastify.
function appFalso() {
  let servidor: net.Server | null = null;
  return {
    listen: ({ port, host }: { port: number; host: string }) =>
      new Promise<string>((resolve, reject) => {
        const s = net.createServer();
        s.once('error', reject);
        s.listen(port, host, () => {
          servidor = s;
          resolve(`http://${host}:${port}`);
        });
      }),
    close: () => servidor?.close(),
  };
}

describe('escutarComFallback', () => {
  it('usa a porta pedida quando ela está livre', async () => {
    const app = appFalso();

    const r = await escutarComFallback(app, 7401, '127.0.0.1');

    expect(r.port).toBe(7401);
    expect(r.trocou).toBe(false);
    app.close();
  });

  // Porta ocupada é comum: outro Learnflix aberto, ou qualquer serviço que
  // pegou a 7777. Morrer com stack trace nesse caso seria hostil.
  it('anda para a próxima porta livre quando a pedida está ocupada', async () => {
    await ocupar(7402);
    const app = appFalso();

    const r = await escutarComFallback(app, 7402, '127.0.0.1');

    expect(r.port).toBe(7403);
    expect(r.trocou).toBe(true);
    app.close();
  });

  it('pula quantas portas ocupadas forem necessárias', async () => {
    await ocupar(7404);
    await ocupar(7405);
    const app = appFalso();

    const r = await escutarComFallback(app, 7404, '127.0.0.1');

    expect(r.port).toBe(7406);
    app.close();
  });

  // Desistir em silêncio depois de N tentativas seria pior do que falhar: quem
  // está com o computador com portas bloqueadas precisa saber disso.
  it('desiste com erro claro depois de tentar o suficiente', async () => {
    for (let p = 7410; p < 7415; p++) await ocupar(p);
    const app = appFalso();

    await expect(escutarComFallback(app, 7410, '127.0.0.1', 5)).rejects.toThrow(/nenhuma porta livre/i);
  });

  // Erro que não é "porta ocupada" (permissão negada, endereço inválido) não
  // deve virar uma busca inútil por portas.
  it('não tenta a próxima porta quando o erro é outro', async () => {
    const app = {
      listen: () => Promise.reject(Object.assign(new Error('sem permissão'), { code: 'EACCES' })),
    };

    await expect(escutarComFallback(app, 80, '127.0.0.1')).rejects.toThrow('sem permissão');
  });
});
