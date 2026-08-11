import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { openDb } from '../db/index';
import { loadConfig } from '../config';
import { buildApp } from '../app';
import { createCourseFromPath } from './scan-course';
import { reconcileCourse } from './reconcile';

// Reproduz o caso real que quebrou uma importação de 46 cursos: um
// compartilhamento SMB listava arquivos que o stat seguinte não alcançava
// (ENOENT), de forma intermitente. Um diretório legível mas sem permissão de
// travessia (r sem x) recria o mesmo par: listado, porém inalcançável.
/** Monta um curso em `destino` com duas aulas alcançáveis e uma inalcançável. */
function cursoComArquivoInalcancavel(destino: string): string {
  fs.mkdirSync(destino, { recursive: true });
  fs.writeFileSync(path.join(destino, '01 - aula boa.mp4'), 'x');
  fs.writeFileSync(path.join(destino, '02 - outra boa.mp4'), 'x');
  const bloqueada = path.join(destino, '03 - Bloqueada');
  fs.mkdirSync(bloqueada);
  fs.writeFileSync(path.join(bloqueada, 'aula fora do ar.mp4'), 'x');
  fs.chmodSync(bloqueada, 0o400);
  return bloqueada; // devolvido para a limpeza destravar antes de apagar
}

describe('importação com arquivo inalcançável', () => {
  it('POST /api/courses/batch cria os cursos e conta o que não pôde ler, em vez de estourar 500', async () => {
    const pai = fs.mkdtempSync(path.join(os.tmpdir(), 'lote-'));
    const bloqueada = cursoComArquivoInalcancavel(path.join(pai, 'Curso Problemático'));
    // um segundo curso, saudável: o defeito era justamente ele ser perdido junto
    fs.mkdirSync(path.join(pai, 'Curso Saudável'));
    fs.writeFileSync(path.join(pai, 'Curso Saudável', 'aula.mp4'), 'x');

    const db = openDb(':memory:');
    const app = buildApp({ ...loadConfig({}), allowedRoots: [os.tmpdir()] }, db);
    try {
      const res = await app.inject({ method: 'POST', url: '/api/courses/batch', payload: { path: pai } });

      expect(res.statusCode).toBe(201);
      const body = res.json();
      expect(body.created).toBe(2); // o curso bom NÃO é perdido por causa do outro
      expect(body.unreadable).toBe(1);
      expect(body.unreadableSample[0]).toContain('aula fora do ar.mp4');
    } finally {
      fs.chmodSync(bloqueada, 0o755);
      fs.rmSync(pai, { recursive: true, force: true });
      db.close();
    }
  });

  it('POST /api/courses (curso único) devolve a contagem do que não pôde ler', async () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'unico-'));
    const bloqueada = cursoComArquivoInalcancavel(path.join(root, 'Curso'));
    const db = openDb(':memory:');
    const app = buildApp({ ...loadConfig({}), allowedRoots: [os.tmpdir()] }, db);
    try {
      const res = await app.inject({ method: 'POST', url: '/api/courses', payload: { path: path.join(root, 'Curso') } });
      expect(res.statusCode).toBe(201);
      expect(res.json().unreadable).toBe(1);
      // as duas aulas alcançáveis entraram
      expect((db.prepare('SELECT COUNT(*) c FROM lessons').get() as any).c).toBe(2);
    } finally {
      fs.chmodSync(bloqueada, 0o755);
      fs.rmSync(root, { recursive: true, force: true });
      db.close();
    }
  });

  it('o rescan NÃO marca como faltando a aula que só ficou inalcançável', () => {
    const root = fs.mkdtempSync(path.join(os.tmpdir(), 'flapping-'));
    const sub = path.join(root, 'Modulo');
    fs.mkdirSync(sub);
    fs.writeFileSync(path.join(root, 'aula 1.mp4'), 'x');
    fs.writeFileSync(path.join(sub, 'aula 2.mp4'), 'x');

    const db = openDb(':memory:');
    const config = loadConfig({});
    const cid = createCourseFromPath(db, root);
    expect((db.prepare('SELECT COUNT(*) c FROM lessons WHERE course_id=?').get(cid) as any).c).toBe(2);

    // a pasta some do alcance sem sumir da listagem — o que o SMB instável faz
    fs.chmodSync(sub, 0o400);
    try {
      const r = reconcileCourse(db, config, cid);
      expect('status' in r).toBe(false);
      expect((r as any).missing).toBe(0);
      const faltando = (db.prepare('SELECT COUNT(*) c FROM lessons WHERE course_id=? AND missing=1').get(cid) as any).c;
      expect(faltando).toBe(0);
    } finally {
      fs.chmodSync(sub, 0o755);
      fs.rmSync(root, { recursive: true, force: true });
      db.close();
    }
  });
});
