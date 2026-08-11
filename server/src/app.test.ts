import { describe, it, expect } from 'vitest';
import { openDb } from './db/index';
import { loadConfig } from './config';
import { buildApp } from './app';

describe('buildApp', () => {
  it('GET /api/health → { ok: true }', async () => {
    const app = buildApp(loadConfig({}), openDb(':memory:'));
    const res = await app.inject({ method: 'GET', url: '/api/health' });
    expect(res.statusCode).toBe(200);
    expect(res.json()).toEqual({ ok: true });
  });
});
