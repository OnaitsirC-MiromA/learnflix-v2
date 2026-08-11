import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { createCourseFromPath } from '../scan/scan-course';
import { buildApp } from '../app';

function fixture(): string {
  const root = fs.mkdtempSync(path.join(os.tmpdir(), 'ejb-'));
  fs.writeFileSync(path.join(root, 'a.mp4'), 'x');
  return root;
}

// Regressão: o browser envia Content-Type: application/json mesmo em requisições
// sem corpo. O parser padrão do Fastify rejeita com FST_ERR_CTP_EMPTY_JSON_BODY (400),
// o que quebrava rescan (POST sem corpo) e excluir (DELETE sem corpo). buildApp registra
// um parser que trata corpo vazio como indefinido.
describe('corpo JSON vazio não quebra rotas sem corpo (rescan/delete)', () => {
  it('POST /rescan e DELETE com content-type application/json e sem payload não dão 400', async () => {
    const root = fixture();
    const thumbsDir = fs.mkdtempSync(path.join(os.tmpdir(), 'ejbT-'));
    const db = openDb(':memory:');
    const cid = createCourseFromPath(db, root);
    const app = buildApp({ allowedRoots: [os.tmpdir()], thumbsDir } as any, db);

    const rescan = await app.inject({
      method: 'POST',
      url: `/api/courses/${cid}/rescan`,
      headers: { 'content-type': 'application/json' },
    });
    expect(rescan.statusCode).not.toBe(400);
    expect([200, 409]).toContain(rescan.statusCode);

    const del = await app.inject({
      method: 'DELETE',
      url: `/api/courses/${cid}`,
      headers: { 'content-type': 'application/json' },
    });
    expect(del.statusCode).toBe(204);

    // Corpo JSON válido continua sendo parseado normalmente (PATCH com título).
    const cid2 = createCourseFromPath(db, fixture());
    const patch = await app.inject({
      method: 'PATCH',
      url: `/api/courses/${cid2}`,
      headers: { 'content-type': 'application/json' },
      payload: JSON.stringify({ title: 'Renomeado' }),
    });
    expect(patch.statusCode).toBe(200);

    fs.rmSync(root, { recursive: true, force: true });
    fs.rmSync(thumbsDir, { recursive: true, force: true });
    db.close();
  });
});
