import { describe, it, expect } from 'vitest';
import fs from 'node:fs';
import path from 'node:path';
import os from 'node:os';
import { herdarDadosDoV1 } from './legacy';

function cenario() {
  const base = fs.mkdtempSync(path.join(os.tmpdir(), 'heranca-'));
  const novo = path.join(base, 'novo');
  fs.mkdirSync(novo, { recursive: true });
  return { base, novo, limpar: () => fs.rmSync(base, { recursive: true, force: true }) };
}

function bancoDoV1(base: string, layout: 'raiz' | 'server', conteudo = 'banco-do-v1'): string {
  const dir = layout === 'raiz' ? path.join(base, 'antigo', 'server', 'data') : path.join(base, 'antigo', 'data');
  fs.mkdirSync(dir, { recursive: true });
  fs.writeFileSync(path.join(dir, 'app.db'), conteudo);
  return path.join(base, 'antigo');
}

describe('herdarDadosDoV1', () => {
  it('adota o banco quando o v2 é iniciado de dentro da pasta do v1', () => {
    const { base, novo, limpar } = cenario();
    const cwd = bancoDoV1(base, 'raiz');

    expect(herdarDadosDoV1(cwd, novo)).toBe('adotado');
    expect(fs.readFileSync(path.join(novo, 'app.db'), 'utf8')).toBe('banco-do-v1');

    limpar();
  });

  // O v1 rodava com o cwd em server/, então o banco também aparece como ./data.
  it('encontra o banco no layout de quem rodava a partir de server/', () => {
    const { base, novo, limpar } = cenario();
    const cwd = bancoDoV1(base, 'server');

    expect(herdarDadosDoV1(cwd, novo)).toBe('adotado');

    limpar();
  });

  // A regra mais importante daqui: sobrescrever o banco novo apagaria o
  // histórico de quem já usa o v2 — exatamente o oposto do que a herança quer.
  it('nunca sobrescreve um banco que já existe', () => {
    const { base, novo, limpar } = cenario();
    const cwd = bancoDoV1(base, 'raiz');
    fs.writeFileSync(path.join(novo, 'app.db'), 'banco-do-v2-em-uso');

    expect(herdarDadosDoV1(cwd, novo)).toBe('ja-tinha');
    expect(fs.readFileSync(path.join(novo, 'app.db'), 'utf8')).toBe('banco-do-v2-em-uso');

    limpar();
  });

  it('não faz nada quando não há v1 por perto', () => {
    const { base, novo, limpar } = cenario();

    expect(herdarDadosDoV1(path.join(base, 'lugar-qualquer'), novo)).toBe('nada-encontrado');
    expect(fs.existsSync(path.join(novo, 'app.db'))).toBe(false);

    limpar();
  });

  // O SQLite em modo WAL deixa gravações recentes no arquivo -wal. Copiar só o
  // .db perderia as últimas aulas assistidas antes de trocar de versão.
  it('leva o WAL junto, para não perder o que ainda não foi para o .db', () => {
    const { base, novo, limpar } = cenario();
    const cwd = bancoDoV1(base, 'raiz');
    const dirV1 = path.join(cwd, 'server', 'data');
    fs.writeFileSync(path.join(dirV1, 'app.db-wal'), 'gravacoes-recentes');
    fs.writeFileSync(path.join(dirV1, 'app.db-shm'), 'indice');

    herdarDadosDoV1(cwd, novo);

    expect(fs.readFileSync(path.join(novo, 'app.db-wal'), 'utf8')).toBe('gravacoes-recentes');
    expect(fs.existsSync(path.join(novo, 'app.db-shm'))).toBe(true);

    limpar();
  });
});
