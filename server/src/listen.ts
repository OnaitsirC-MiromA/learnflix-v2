// Superfície mínima que precisamos do Fastify — declarada aqui para o fallback
// poder ser testado sem subir um Fastify inteiro.
interface Escutavel {
  listen(opts: { port: number; host: string }): Promise<unknown>;
}

export interface Escuta {
  port: number;
  /** true quando a porta pedida estava ocupada e o app foi para outra. */
  trocou: boolean;
}

/**
 * Sobe o servidor, andando para a próxima porta se a pedida estiver ocupada.
 *
 * Porta ocupada é banal — outro Learnflix já aberto, ou qualquer serviço que
 * pegou a 7777 antes. Morrer com stack trace nesse caso seria hostil com quem
 * só quer assistir aula. Qualquer outro erro (permissão, endereço inválido)
 * sobe na hora: procurar portas não resolveria nada.
 */
export async function escutarComFallback(
  app: Escutavel,
  portaInicial: number,
  host: string,
  tentativas = 10,
): Promise<Escuta> {
  for (let i = 0; i < tentativas; i++) {
    const port = portaInicial + i;
    try {
      await app.listen({ port, host });
      return { port, trocou: i > 0 };
    } catch (err) {
      if ((err as { code?: string }).code !== 'EADDRINUSE') throw err;
    }
  }
  throw new Error(
    `Nenhuma porta livre entre ${portaInicial} e ${portaInicial + tentativas - 1}. ` +
      'Feche o que estiver usando essas portas, ou escolha outra com PORT=8080.',
  );
}
