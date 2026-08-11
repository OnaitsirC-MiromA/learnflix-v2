import { describe, it, expect } from 'vitest';
import { IDS, TOPICOS, TOPICOS_RAIZ, TOPICOS_PROBLEMAS, acharTopico, ehTopicoValido } from './content';

// A união TopicoId já impede, em tempo de compilação, um link para tópico
// inexistente. O que o compilador NÃO pega é a lista IDS e o conteúdo saírem de
// sincronia — um id declarado sem tópico escrito, ou um tópico órfão da lista.
// É isso que estes testes guardam.
describe('conteúdo da ajuda', () => {
  it('cada id declarado tem um tópico escrito, e vice-versa', () => {
    expect([...IDS].sort()).toEqual(TOPICOS.map((t) => t.id).sort());
  });

  it('nenhum id repetido — a URL precisa apontar para um tópico só', () => {
    const ids = TOPICOS.map((t) => t.id);
    expect(new Set(ids).size).toBe(ids.length);
  });

  it('todo tópico tem título, resumo para o índice e ao menos um bloco', () => {
    for (const t of TOPICOS) {
      expect(t.titulo.trim(), t.id).not.toBe('');
      expect(t.resumo.trim(), t.id).not.toBe('');
      expect(t.blocos.length, t.id).toBeGreaterThan(0);
    }
  });

  it('o índice cobre todos os tópicos: raiz + problemas = tudo', () => {
    expect(TOPICOS_RAIZ.length + TOPICOS_PROBLEMAS.length).toBe(TOPICOS.length);
    // o guarda-chuva "problemas" fica na raiz e os quatro casos ficam sob ele
    expect(TOPICOS_RAIZ.map((t) => t.id)).toContain('problemas');
    expect(TOPICOS_PROBLEMAS.length).toBe(4);
  });

  it('acharTopico resolve um id válido e recusa lixo vindo da URL', () => {
    expect(acharTopico('video-nao-toca')?.titulo).toBe('Um vídeo não toca');
    expect(acharTopico('nao-existe')).toBeNull();
    expect(acharTopico(null)).toBeNull();
  });

  it('ehTopicoValido separa id de tópico de qualquer outra coisa', () => {
    expect(ehTopicoValido('assistir')).toBe(true);
    expect(ehTopicoValido('')).toBe(false);
    expect(ehTopicoValido('../../etc/passwd')).toBe(false);
  });

  it('blocos de teclas nunca vêm vazios — uma tabela sem linha é um bug visível', () => {
    for (const t of TOPICOS) {
      for (const b of t.blocos) {
        if (b.t === 'teclas') expect(b.itens.length, t.id).toBeGreaterThan(0);
        if (b.t === 'lista' || b.t === 'passos') expect(b.itens.length, t.id).toBeGreaterThan(0);
      }
    }
  });
});
