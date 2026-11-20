import { Readable } from 'node:stream';
import type { FastifyReply, FastifyRequest } from 'fastify';
import type { AppConfig } from '../config';

// Destino fixado na configuração do servidor, nunca uma URL fornecida pelo
// navegador. O token e a sessão Telegram não chegam à interface nem ao backup.
export async function bridgeFetch(config: AppConfig, route: string, init: RequestInit = {}): Promise<Response> {
  if (!config.telegramBridgeUrl || !config.telegramBridgeToken) {
    throw Object.assign(new Error('Conecte o serviço Telegram antes de adicionar um curso.'), { statusCode: 503 });
  }
  const url = new URL(config.telegramBridgeUrl);
  if (url.protocol !== 'https:' && !(url.protocol === 'http:' && ['127.0.0.1', 'localhost', '[::1]'].includes(url.hostname))) {
    throw Object.assign(new Error('A conexão Telegram precisa usar HTTPS ou localhost.'), { statusCode: 503 });
  }
  let res: Response;
  try {
    res = await fetch(new URL(route, url), {
      ...init, redirect: 'error', signal: init.signal ?? AbortSignal.timeout(120000),
      headers: { ...init.headers, Authorization: `Bearer ${config.telegramBridgeToken}` },
    });
  } catch {
    throw Object.assign(new Error('O serviço Telegram não respondeu. Confira a conexão e tente novamente.'), { statusCode: 502 });
  }
  if (!res.ok && res.status !== 416) {
    await res.body?.cancel();
    const messages: Record<number, string> = {
      401: 'A conexão Telegram não foi autorizada.',
      403: 'A conta Telegram não tem acesso a este conteúdo.',
      404: 'O arquivo ou a origem não está mais disponível no Telegram.',
      400: 'Use um link de canal ou tópico acessível à sua conta Telegram.',
      429: 'O Telegram pediu uma espera. Tente novamente mais tarde.',
    };
    throw Object.assign(new Error(messages[res.status] ?? 'Falha ao consultar o Telegram. Tente novamente.'),
      { statusCode: res.status === 401 ? 503 : (res.status in messages ? res.status : 502) });
  }
  return res;
}

export async function proxyTelegram(config: AppConfig, req: FastifyRequest, reply: FastifyReply,
  chatId: string, messageId: number): Promise<FastifyReply> {
  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 120000);
  const disconnect = () => controller.abort();
  reply.raw.once('close', disconnect);
  reply.raw.once('finish', () => { clearTimeout(timeout); reply.raw.off('close', disconnect); });
  try {
    const res = await bridgeFetch(config, `/media/${encodeURIComponent(chatId)}/${messageId}`, {
      method: req.method === 'HEAD' ? 'HEAD' : 'GET', signal: controller.signal,
      headers: req.headers.range ? { Range: req.headers.range } : {},
    });
    clearTimeout(timeout); // Após os headers, a reprodução pode durar horas.
    reply.code(res.status).header('Cache-Control', 'private, no-store').header('X-Content-Type-Options', 'nosniff');
    for (const h of ['content-type','content-length','content-range','accept-ranges','content-disposition','retry-after']) {
      const value = res.headers.get(h);
      if (value) reply.header(h, value);
    }
    if (req.method === 'HEAD' || !res.body) { await res.body?.cancel(); return reply.send(); }
    const stream = Readable.fromWeb(res.body as any);
    stream.once('close', disconnect);
    return reply.send(stream);
  } catch (e) {
    clearTimeout(timeout);
    reply.raw.off('close', disconnect);
    throw e;
  }
}
