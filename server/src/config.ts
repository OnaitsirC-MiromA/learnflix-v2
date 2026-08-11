import path from 'node:path';
import os from 'node:os';

export interface AppConfig {
  port: number;
  bind: string;
  dataDir: string;
  allowedRoots: string[];
  /**
   * ALLOWED_ROOTS veio do ambiente? Quem define a variável está restringindo de
   * propósito (Docker, servidor compartilhado). Nesse caso as unidades detectadas
   * pelo sistema NÃO entram na lista — a restrição seria burlada em silêncio.
   */
  allowedRootsFromEnv: boolean;
  autocompleteThreshold: number;
  dbPath: string;
  thumbsDir: string;
  convertedDir: string;
  openBrowser: boolean;
}

// Raízes navegáveis padrão no seletor de pastas. No macOS, compartilhamentos de
// rede (SMB/AFP/NFS) e discos externos montam em /Volumes; no Linux, em /media e
// /mnt — incluí-los faz essas pastas aparecerem sem configuração nenhuma.
//
// O Windows não tem esse ponto único: cada unidade é uma raiz. Elas são detectadas
// em tempo de execução (ver roots.ts), e não aqui, porque um HD externo costuma
// ser plugado depois do app já estar aberto.
function defaultRoots(): string[] {
  const roots = [os.homedir()];
  if (process.platform === 'darwin') roots.push('/Volumes');
  if (process.platform === 'linux') roots.push('/media', '/mnt');
  return roots;
}

/**
 * Onde ficam o banco, as miniaturas e os convertidos.
 *
 * Fora da pasta de instalação, sempre. O app pode ser um executável que vive em
 * qualquer lugar e é substituído inteiro a cada atualização — se os dados
 * morassem junto dele, como no v1, atualizar apagaria o histórico de quem já
 * usava. É esta separação que faz "atualizar sem perder nada" ser estrutural, e
 * não uma promessa.
 */
export function defaultDataDir(env: NodeJS.ProcessEnv = process.env, plataforma = process.platform): string {
  // No Windows, pasta oculta na home não é a convenção: dados de aplicativo
  // moram em LOCALAPPDATA, que é onde backup e perfil móvel vão procurar.
  if (plataforma === 'win32' && env.LOCALAPPDATA) return path.join(env.LOCALAPPDATA, 'Learnflix');
  return path.join(os.homedir(), '.learnflix');
}

export function loadConfig(env: NodeJS.ProcessEnv = process.env): AppConfig {
  const dataDir = path.resolve(env.DATA_DIR ?? defaultDataDir(env));
  const allowedRoots = (env.ALLOWED_ROOTS ? env.ALLOWED_ROOTS.split(path.delimiter) : defaultRoots())
    .map((p) => p.trim())
    .filter(Boolean)
    .map((p) => path.resolve(p));

  return {
    port: Number(env.PORT ?? 7777),
    bind: env.BIND ?? '127.0.0.1',
    dataDir,
    allowedRoots,
    allowedRootsFromEnv: Boolean(env.ALLOWED_ROOTS),
    autocompleteThreshold: Number(env.AUTOCOMPLETE_THRESHOLD ?? 0.9),
    dbPath: path.join(dataDir, 'app.db'),
    thumbsDir: path.join(dataDir, 'thumbs'),
    convertedDir: path.join(dataDir, 'converted'),
    openBrowser: env.OPEN_BROWSER === undefined ? true : env.OPEN_BROWSER === '1' || env.OPEN_BROWSER === 'true',
  };
}
