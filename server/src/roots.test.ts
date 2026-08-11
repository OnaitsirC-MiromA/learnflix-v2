import { describe, it, expect } from 'vitest';
import path from 'node:path';
import { unidadesDoWindows, semRedundancia } from './roots';
import { isWithinRoots } from './routes/fs';

describe('unidadesDoWindows', () => {
  it('lista as unidades que existem, de C a Z', () => {
    const existentes = new Set(['C:\\', 'D:\\', 'F:\\']);
    expect(unidadesDoWindows((r) => existentes.has(r))).toEqual(['C:\\', 'D:\\', 'F:\\']);
  });

  it('ignora unidade que estoura ao ser sondada — rede desconectada não pode derrubar o seletor', () => {
    const sonda = (r: string) => {
      if (r === 'Z:\\') throw new Error('unidade de rede fora do ar');
      return r === 'D:\\';
    };
    expect(unidadesDoWindows(sonda)).toEqual(['D:\\']);
  });

  it('sem nenhuma unidade, devolve lista vazia em vez de quebrar', () => {
    expect(unidadesDoWindows(() => false)).toEqual([]);
  });
});

describe('semRedundancia', () => {
  it('remove a raiz que já está contida em outra — o seletor não repete a mesma árvore', () => {
    const sep = path.sep;
    const disco = `${sep}disco`;
    const dentro = `${sep}disco${sep}Users${sep}nome`;
    expect(semRedundancia([disco, dentro])).toEqual([disco]);
  });

  it('mantém raízes irmãs', () => {
    const sep = path.sep;
    expect(semRedundancia([`${sep}a`, `${sep}b`])).toEqual([`${sep}a`, `${sep}b`]);
  });

  it('não confunde prefixo textual com pasta contida', () => {
    const sep = path.sep;
    // "/disco" não contém "/disco-antigo": são pastas diferentes
    expect(semRedundancia([`${sep}disco`, `${sep}disco-antigo`])).toEqual([`${sep}disco`, `${sep}disco-antigo`]);
  });

  it('descarta duplicatas exatas', () => {
    expect(semRedundancia([`${path.sep}a`, `${path.sep}a`])).toEqual([`${path.sep}a`]);
  });

  // O caso que motivou tudo, escrito com strings do Windows para poder ser
  // verificado rodando os testes em qualquer sistema.
  it('no Windows: a home do usuário é absorvida pela unidade que a contém', () => {
    expect(semRedundancia(['C:\\Users\\Nome', 'C:\\', 'D:\\'])).toEqual(['C:\\', 'D:\\']);
  });

  it('no Windows: unidades diferentes convivem', () => {
    expect(semRedundancia(['C:\\', 'D:\\', 'E:\\'])).toEqual(['C:\\', 'D:\\', 'E:\\']);
  });

  it('no Windows: barras misturadas não escapam da checagem', () => {
    expect(semRedundancia(['C:\\', 'C:/Users/Nome'])).toEqual(['C:\\']);
  });
});

// A raiz de uma unidade do Windows ("D:\") já termina em separador. A comparação
// antiga fazia root + sep, produzindo "D:\\" — prefixo que nenhum caminho tem.
// Resultado: as unidades entrariam na lista de permitidas e mesmo assim tudo
// responderia 403. Aqui a raiz "/" faz o mesmo papel no POSIX.
describe('isWithinRoots com raiz terminada em separador', () => {
  it('aceita um caminho sob a raiz do sistema de arquivos', () => {
    expect(isWithinRoots(`${path.sep}Users`, [path.sep])).toBe(true);
  });

  it('aceita a própria raiz', () => {
    expect(isWithinRoots(path.sep, [path.sep])).toBe(true);
  });

  it('continua recusando o que está fora', () => {
    expect(isWithinRoots(`${path.sep}outra${path.sep}pasta`, [`${path.sep}permitida`])).toBe(false);
  });

  it('não deixa "/permitida" liberar "/permitida-outra"', () => {
    expect(isWithinRoots(`${path.sep}permitida-outra${path.sep}x`, [`${path.sep}permitida`])).toBe(false);
  });
});
