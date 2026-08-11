import fs from 'node:fs';

// O Windows não tem um lugar único onde os discos aparecem — não há o /Volumes do
// macOS nem o /media do Linux. Cada unidade é uma raiz própria (C:\, D:\, …), e
// sem detectá-las o seletor de pastas enxerga só a pasta do usuário: um HD externo
// fica inalcançável, e até uma pasta em C:\Cursos é recusada com 403.
//
// A sondagem acontece SOB DEMANDA, não no boot: HD externo costuma ser plugado
// depois do app já estar aberto, e ninguém adivinharia que precisa reiniciar. O
// cache curto evita repetir 24 idas ao sistema de arquivos a cada clique.

const CACHE_MS = 5_000;
let cache: { em: number; unidades: string[] } | null = null;

/** Sonda C:\ até Z:\ com o predicado dado. Puro — o teste injeta a sonda. */
export function unidadesDoWindows(existe: (raiz: string) => boolean): string[] {
  const unidades: string[] = [];
  for (let c = 'C'.charCodeAt(0); c <= 'Z'.charCodeAt(0); c++) {
    const raiz = `${String.fromCharCode(c)}:\\`;
    try {
      if (existe(raiz)) unidades.push(raiz);
    } catch {
      // Unidade de rede mapeada e desconectada estoura ao ser sondada. Ela some
      // da lista, e só: uma unidade fora do ar não pode derrubar o seletor.
    }
  }
  return unidades;
}

/** Raízes que o sistema oferece por conta própria. Vazio fora do Windows. */
export function systemRoots(agora: number = Date.now()): string[] {
  if (process.platform !== 'win32') return [];
  if (cache && agora - cache.em < CACHE_MS) return cache.unidades;
  const unidades = unidadesDoWindows((raiz) => fs.existsSync(raiz));
  cache = { em: agora, unidades };
  return unidades;
}

/**
 * Descarta as raízes já contidas em outra. Com as unidades detectadas, a home do
 * usuário vira redundante (C:\Users\Nome está dentro de C:\) — listar as duas faria
 * o seletor abrir duas portas para a mesma árvore.
 */
export function semRedundancia(roots: string[]): string[] {
  // Aceita os dois separadores em vez de usar path.sep: assim a regra do Windows
  // é verificável rodando os testes em qualquer sistema — e caminhos com barras
  // misturadas, que acontecem no Windows, não escapam da checagem.
  const iguais = (a: string, b: string): boolean => chave(a) === chave(b);
  const chave = (p: string): string => {
    const semBarraFinal = p.replace(/[\\/]+$/, '') || p.slice(0, 1) + (p.includes('\\') ? '\\' : '/');
    return process.platform === 'win32' ? semBarraFinal.toLowerCase() : semBarraFinal;
  };

  const dentroDe = (filho: string, pai: string): boolean => {
    if (iguais(filho, pai)) return false;
    const f = chave(filho);
    const p = chave(pai);
    if (!f.startsWith(p)) return false;
    const resto = f.slice(p.length);
    return resto.startsWith('/') || resto.startsWith('\\');
  };

  const unicas = roots.filter((r, i) => roots.findIndex((o) => iguais(o, r)) === i);
  return unicas.filter((r) => !unicas.some((outra) => dentroDe(r, outra)));
}
