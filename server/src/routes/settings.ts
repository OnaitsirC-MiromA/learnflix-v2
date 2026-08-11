import path from 'node:path';
import type { FastifyInstance } from 'fastify';
import type Database from 'better-sqlite3';
import type { AppConfig } from '../config';
import { semRedundancia, systemRoots } from '../roots';

const KEY = 'allowed_roots_extra';

export function getAllowedRootsExtra(db: Database.Database): string[] {
  const row = db.prepare('SELECT value FROM settings WHERE key=?').get(KEY) as { value: string } | undefined;
  if (!row) return [];
  try {
    const arr = JSON.parse(row.value);
    return Array.isArray(arr) ? arr.filter((p) => typeof p === 'string') : [];
  } catch {
    return [];
  }
}

// União das raízes fixas, das unidades que o próprio sistema oferece e das extras
// configuradas em /settings — usada em todo guard que precisa aceitar pastas
// navegáveis pelo /api/fs/browse (criar curso, re-apontar). Manter em um só lugar
// evita divergência entre o que o seletor mostra e o que os guards aceitam.
export function allowedRootsFor(config: AppConfig, db: Database.Database): string[] {
  // Quem definiu ALLOWED_ROOTS está restringindo de propósito (Docker, servidor
  // compartilhado): as unidades detectadas não entram, ou a restrição seria
  // burlada em silêncio.
  const doSistema = config.allowedRootsFromEnv ? [] : systemRoots();
  return semRedundancia([...config.allowedRoots, ...doSistema, ...getAllowedRootsExtra(db)]);
}

export async function settingsRoutes(app: FastifyInstance, opts: { db: Database.Database }): Promise<void> {
  const { db } = opts;

  app.get('/api/settings', async () => ({ allowedRootsExtra: getAllowedRootsExtra(db) }));

  app.patch('/api/settings', async (req) => {
    const b = req.body as { allowedRootsExtra?: unknown };
    if (Array.isArray(b.allowedRootsExtra)) {
      const clean = b.allowedRootsExtra
        .filter((p): p is string => typeof p === 'string' && path.isAbsolute(p))
        .map((p) => path.resolve(p));
      db.prepare('INSERT INTO settings (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value=excluded.value').run(
        KEY,
        JSON.stringify(clean),
      );
    }
    return { allowedRootsExtra: getAllowedRootsExtra(db) };
  });
}
