import { spawn } from 'node:child_process';

export interface ComandoDeAbertura {
  comando: string;
  args: string[];
}

/**
 * Como pedir ao sistema que abra uma URL no navegador padrão.
 *
 * Feito à mão em vez de usar o pacote `open` porque ele carrega um script
 * auxiliar pelo caminho da própria pasta — e esse caminho deixa de existir
 * quando o app vira um arquivo só. São três comandos; a dependência não pagava
 * o preço de impedir o empacotamento.
 */
export function comandoParaAbrir(plataforma: NodeJS.Platform, url: string): ComandoDeAbertura | null {
  if (plataforma === 'darwin') return { comando: 'open', args: [url] };
  // `start` é comando interno do cmd.exe, não um executável. E o "" é o título
  // da janela: sem ele o cmd trata a URL como título e não abre nada.
  if (plataforma === 'win32') return { comando: 'cmd', args: ['/c', 'start', '', url] };
  if (plataforma === 'linux') return { comando: 'xdg-open', args: [url] };
  return null;
}

/**
 * Abre a URL, em silêncio se não der.
 *
 * Falhar aqui não é motivo para nada: o endereço já está impresso no terminal, e
 * derrubar o app porque o navegador não abriu seria absurdo.
 */
export function abrirNavegador(url: string, plataforma: NodeJS.Platform = process.platform): void {
  const c = comandoParaAbrir(plataforma, url);
  if (!c) return;
  try {
    const p = spawn(c.comando, c.args, { stdio: 'ignore', detached: true });
    p.on('error', () => {});
    p.unref();
  } catch {
    // sem navegador, sem problema
  }
}
