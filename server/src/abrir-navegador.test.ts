import { describe, it, expect } from 'vitest';
import { comandoParaAbrir } from './abrir-navegador';

describe('comandoParaAbrir', () => {
  it('no macOS usa o open', () => {
    expect(comandoParaAbrir('darwin', 'http://localhost:7777')).toEqual({
      comando: 'open',
      args: ['http://localhost:7777'],
    });
  });

  // `start` é comando interno do cmd.exe, não um executável — precisa do cmd /c.
  // O "" solto é o título da janela: sem ele, o cmd trata a URL como título e
  // não abre nada.
  it('no Windows passa pelo cmd, com o título vazio que o start exige', () => {
    expect(comandoParaAbrir('win32', 'http://localhost:7777')).toEqual({
      comando: 'cmd',
      args: ['/c', 'start', '', 'http://localhost:7777'],
    });
  });

  it('no Linux usa o xdg-open', () => {
    expect(comandoParaAbrir('linux', 'http://localhost:7777')).toEqual({
      comando: 'xdg-open',
      args: ['http://localhost:7777'],
    });
  });

  // Sistema desconhecido não pode derrubar o app: quem não sabe abrir navegador
  // simplesmente não abre, e o endereço já está impresso no terminal.
  it('em sistema desconhecido, não tenta nada', () => {
    expect(comandoParaAbrir('sunos' as NodeJS.Platform, 'http://localhost:7777')).toBeNull();
  });
});
