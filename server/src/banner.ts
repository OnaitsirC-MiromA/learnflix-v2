export interface EstadoDoBoot {
  versao: string;
  dataDir: string;
  url: string;
  temFfmpeg: boolean;
  trocouDePorta: boolean;
  portaPedida: number;
  herdouDoV1: boolean;
  abrindoNavegador: boolean;
  plataforma: NodeJS.Platform;
}

const COMO_INSTALAR_FFMPEG: Partial<Record<NodeJS.Platform, string>> = {
  darwin: 'brew install ffmpeg',
  win32: 'winget install Gyan.FFmpeg',
  linux: 'sudo apt install ffmpeg',
};

/**
 * O que o app diz ao subir.
 *
 * É o primeiro contato de quem acabou de instalar, e cada linha tem de valer o
 * espaço: onde os dados moram, o que está faltando e como resolver, e para onde
 * ir. Nada de log de framework, nada de aviso sobre o qual não dá para agir.
 */
export function mensagemDeBoot(e: EstadoDoBoot): string[] {
  const linhas = [`Learnflix ${e.versao}`, `  dados em ${e.dataDir}`];

  if (e.herdouDoV1) {
    linhas.push('  progresso do Learnflix v1 adotado — nada foi perdido');
  }

  if (!e.temFfmpeg) {
    const comando = COMO_INSTALAR_FFMPEG[e.plataforma] ?? 'instale o ffmpeg pelo gerenciador da sua distro';
    linhas.push('', '  ffmpeg não encontrado — as aulas tocam, mas sem capas nem duração', `  para ter os dois: ${comando}`);
  }

  if (e.trocouDePorta) {
    linhas.push('', `  a porta ${e.portaPedida} estava ocupada, então o app subiu na seguinte`);
  }

  linhas.push('', `  ${e.url}${e.abrindoNavegador ? '  (abrindo o navegador…)' : ''}`);
  return linhas;
}
