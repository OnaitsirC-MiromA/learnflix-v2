import { describe, it, expect } from 'vitest';
import os from 'node:os';
import Fastify from 'fastify';
import { openDb } from '../db/index';
import { settingsRoutes, getAllowedRootsExtra } from './settings';

describe('settings', () => {
  it('GET default vazio; PATCH grava; helper lê', async () => {
    const db = openDb(':memory:');
    const app = Fastify();
    app.register(settingsRoutes, { db });

    const g0 = await app.inject({ method: 'GET', url: '/api/settings' });
    expect(g0.json().allowedRootsExtra).toEqual([]);

    const p = await app.inject({ method: 'PATCH', url: '/api/settings', payload: { allowedRootsExtra: [os.tmpdir(), 'relativo'] } });
    expect(p.statusCode).toBe(200);
    // só caminhos absolutos são guardados
    expect(getAllowedRootsExtra(db)).toEqual([os.tmpdir()]);
    db.close();
  });
});
