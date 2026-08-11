import path from 'node:path';
import fs from 'node:fs';
import type { FastifyInstance } from 'fastify';
import type { Db } from '../db';
import type { AppConfig } from '../config';
import { allowedRootsFor } from './settings';

// Fronteira de segurança da navegação de pastas. Dois detalhes que custam caro no
// Windows: a raiz de uma unidade ("D:\") JÁ termina em separador, e concatenar
// outro produzia "D:\\" — prefixo que nenhum caminho tem, então a unidade inteira
// respondia 403 mesmo constando entre as permitidas. E o Windows não diferencia
// maiúsculas em caminho: "d:\cursos" e "D:\Cursos" são a mesma pasta, e recusar
// uma delas seria um 403 impossível de entender.
export function isWithinRoots(target: string, roots: string[]): boolean {
  const janela = process.platform === 'win32';
  const normalizar = (p: string): string => (janela ? p.toLowerCase() : p);
  const resolved = normalizar(path.resolve(target));
  return roots.some((root) => {
    const raiz = normalizar(root);
    if (resolved === raiz) return true;
    const base = raiz.endsWith(path.sep) ? raiz : raiz + path.sep;
    return resolved.startsWith(base);
  });
}

export async function fsRoutes(app: FastifyInstance, opts: { config: AppConfig; db: Db }): Promise<void> {
  const { config, db } = opts;
  const roots = () => allowedRootsFor(config, db);

  app.get('/api/fs/browse', async (req, reply) => {
    const q = (req.query as { path?: string }).path;
    if (!q) {
      return { path: null, parent: null, dirs: roots().map((r) => ({ name: r, path: r })) };
    }
    const target = path.resolve(q);
    if (!isWithinRoots(target, roots())) {
      reply.code(403);
      return { error: 'forbidden' };
    }
    let entries: fs.Dirent[];
    try {
      entries = fs.readdirSync(target, { withFileTypes: true });
    } catch {
      reply.code(404);
      return { error: 'not_found' };
    }
    const dirs = entries
      .filter((e) => e.isDirectory() && !e.name.startsWith('.'))
      .map((e) => ({ name: e.name, path: path.join(target, e.name) }))
      .sort((a, b) => a.name.localeCompare(b.name));
    const isRoot = roots().some((r) => path.resolve(target) === r);
    return { path: target, parent: isRoot ? null : path.dirname(target), dirs };
  });
}
