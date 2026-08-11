import type { ReactNode } from 'react';

// Conteúdo da ajuda como DADO, não como marcação solta.
//
// Cada tópico é uma lista de blocos tipados, renderizados por um componente só
// (components/HelpDrawer.tsx). Assim a tipografia e o espaçamento do DESIGN.md
// valem por construção: um tópico novo não consegue inventar estilo próprio, e o
// texto continua legível aqui, separado do JSX.

export type Bloco =
  | { t: 'p'; texto: ReactNode }
  | { t: 'passos'; itens: ReactNode[] }
  | { t: 'lista'; itens: ReactNode[] }
  | { t: 'teclas'; itens: { teclas: string[]; desc: string }[] }
  | { t: 'nota'; tom: 'info' | 'aviso'; texto: ReactNode };

// As âncoras são o contrato dos links contextuais espalhados pelo app. Declará-las
// como união de literais faz o COMPILADOR recusar um link para tópico inexistente
// — um link morto vira erro de build, não uma tela vazia descoberta pelo usuário.
export const IDS = [
  'primeiros-passos',
  'assistir',
  'bibliotecas',
  'problemas',
  'video-nao-toca',
  'pasta-mudou',
  'sem-capas',
  'curso-sumiu',
] as const;

export type TopicoId = (typeof IDS)[number];

export interface Topico {
  id: TopicoId;
  titulo: string;
  /** Uma linha no índice: o que a pessoa ganha ao abrir. */
  resumo: string;
  blocos: Bloco[];
  /** Agrupa os tópicos de "Quando algo dá errado" sob o guarda-chuva. */
  grupo?: 'problemas';
}

// Atalhos do player — fonte única, compartilhada com o overlay "?" da aula, para
// que a ajuda e o player nunca divirjam.
export const ATALHOS: { teclas: string[]; desc: string }[] = [
  { teclas: ['Espaço'], desc: 'Play / pausar' },
  { teclas: ['←', '→'], desc: 'Voltar / avançar 10 s' },
  { teclas: ['↑', '↓'], desc: 'Volume' },
  { teclas: ['F'], desc: 'Tela cheia' },
  { teclas: ['M'], desc: 'Mudo' },
  { teclas: ['N', 'P'], desc: 'Próxima / anterior aula' },
  { teclas: ['Esc'], desc: 'Fechar / voltar ao curso' },
  { teclas: ['?'], desc: 'Mostrar estes atalhos' },
];

export const TOPICOS: Topico[] = [
  {
    id: 'primeiros-passos',
    titulo: 'Primeiros passos',
    resumo: 'Transformar suas pastas em cursos',
    blocos: [
      {
        t: 'p',
        texto:
          'O Learnflix não guarda vídeo nenhum: ele lê as pastas que já existem no seu disco. Apontar uma pasta é tudo o que ele precisa para montar um curso.',
      },
      {
        t: 'p',
        texto: (
          <>
            <b>Um curso de cada vez.</b> Clique em <b>Adicionar</b> e navegue até a pasta dele. Todo
            vídeo lá dentro vira uma aula.
          </>
        ),
      },
      {
        t: 'p',
        texto: (
          <>
            <b>Uma pasta inteira de cursos.</b> Se você tem uma pasta-mãe com vários cursos dentro,
            use <b>Importar pasta de cursos</b> e aponte para ela: cada subpasta com vídeo vira um
            curso. O Learnflix guarda essa pasta-mãe, e depois basta clicar em{' '}
            <b>Verificar novos cursos</b> para trazer o que apareceu de novo. Rodar de novo nunca
            duplica nada.
          </>
        ),
      },
      {
        t: 'p',
        texto: (
          <>
            <b>Módulos saem das subpastas.</b> Se os vídeos estiverem soltos na raiz do curso, a
            lista é simples. Se estiverem organizados em subpastas, cada subpasta vira um módulo,
            com o nome que ela já tem.
          </>
        ),
      },
      {
        t: 'p',
        texto: (
          <>
            <b>A ordem segue os nomes dos arquivos</b>, com ordenação numérica de verdade:{' '}
            <i>aula 2</i> vem antes de <i>aula 10</i>, e não depois. Se a ordem sair errada,
            renomeie os arquivos com números na frente e use <b>Re-escanear agora</b> no menu ⋯ do
            curso.
          </>
        ),
      },
      {
        t: 'p',
        texto: (
          <>
            <b>Materiais.</b> Arquivos que não são vídeo — PDFs, slides, exercícios, imagens —
            aparecem numa seção própria no fim da página do curso, para abrir ou baixar.
          </>
        ),
      },
      {
        t: 'nota',
        tom: 'info',
        texto:
          'Nada é copiado, movido ou renomeado. O Learnflix só lê as suas pastas; os arquivos ficam exatamente onde estão.',
      },
    ],
  },

  {
    id: 'assistir',
    titulo: 'Assistir e progresso',
    resumo: 'Retomar de onde parou, concluir, atalhos',
    blocos: [
      {
        t: 'p',
        texto: (
          <>
            <b>Você nunca precisa anotar onde parou.</b> A posição de cada aula é salva enquanto você
            assiste, e o cartão <b>Continuar</b> — no topo do curso e na biblioteca — leva direto ao
            segundo exato onde você saiu.
          </>
        ),
      },
      {
        t: 'p',
        texto: (
          <>
            <b>Concluir.</b> Marque a caixinha ao lado da aula, ou use o botão de concluir no player.
            Quando você assiste quase até o fim, o Learnflix marca sozinho — mas a decisão continua
            sua: dá para desmarcar a qualquer momento.
          </>
        ),
      },
      {
        t: 'p',
        texto: (
          <>
            <b>Capa do curso.</b> Pause num quadro bonito e use o botão de câmera no player para
            transformá-lo na capa. Também dá para trocar pelo menu ⋯ do curso.
          </>
        ),
      },
      { t: 'p', texto: <b>Atalhos de teclado, enquanto assiste:</b> },
      { t: 'teclas', itens: ATALHOS },
      {
        t: 'nota',
        tom: 'info',
        texto:
          'O progresso vive num banco na sua máquina, não no navegador. Trocar de navegador, limpar o cache ou abrir numa aba anônima não apaga nada.',
      },
    ],
  },

  {
    id: 'bibliotecas',
    titulo: 'Bibliotecas',
    resumo: 'Agrupar cursos por assunto',
    blocos: [
      {
        t: 'p',
        texto:
          'Com muitos cursos, a grade única vira bagunça. Bibliotecas são grupos com nome — Programação, Inglês, Faculdade — que separam a tela inicial por assunto.',
      },
      {
        t: 'passos',
        itens: [
          <>
            Abra o menu ⋯ de um curso e escolha <b>Coleção…</b>
          </>,
          <>
            Escolha uma biblioteca existente ou digite um nome novo para criar na hora.
          </>,
          <>
            Na tela inicial, os filtros no topo alternam entre <b>Todas</b>, cada biblioteca e{' '}
            <b>Sem coleção</b>.
          </>,
        ],
      },
      {
        t: 'p',
        texto: (
          <>
            Para mover vários cursos de uma vez, use <b>Selecionar</b> no cabeçalho da biblioteca,
            marque os cursos e atribua todos juntos.
          </>
        ),
      },
      {
        t: 'nota',
        tom: 'info',
        texto: (
          <>
            <b>Excluir uma biblioteca não apaga curso nenhum.</b> Os cursos voltam para a lista
            geral, com todo o progresso intacto. Biblioteca é organização, não posse.
          </>
        ),
      },
    ],
  },

  {
    id: 'problemas',
    titulo: 'Quando algo dá errado',
    resumo: 'Vídeo que não toca, pasta que mudou, capas ausentes',
    blocos: [
      {
        t: 'p',
        texto:
          'Quatro situações respondem por quase tudo o que costuma dar errado. Cada uma tem sua própria página aqui:',
      },
      {
        t: 'lista',
        itens: [
          <>
            <b>Um vídeo não toca</b> — o formato do arquivo, e a conversão sem perda.
          </>,
          <>
            <b>Mudei a pasta de lugar</b> — re-apontar sem perder o progresso.
          </>,
          <>
            <b>Não aparecem capas nem durações</b> — o ffmpeg.
          </>,
          <>
            <b>Um curso sumiu ou está indisponível</b> — disco desconectado, pasta renomeada.
          </>,
        ],
      },
    ],
  },

  {
    id: 'video-nao-toca',
    grupo: 'problemas',
    titulo: 'Um vídeo não toca',
    resumo: 'Formato incompatível e conversão sem perda',
    blocos: [
      {
        t: 'p',
        texto:
          'Nem todo arquivo de vídeo toca num navegador, mesmo terminando em .mp4. Muitos cursos baixados trazem arquivos cuja extensão mente sobre o conteúdo. Em vez de mostrar uma tela preta, o Learnflix olha o formato por dentro do arquivo e explica o caso.',
      },
      {
        t: 'p',
        texto: (
          <>
            <b>Se dá para resolver sem perda</b> — o caso mais comum, um vídeo MPEG-TS renomeado para
            .mp4 — aparece o botão <b>Converter agora (sem perda)</b>. A conversão leva segundos,
            reempacota o vídeo sem recomprimir nada, e o arquivo original não é tocado: o resultado
            fica guardado à parte, dentro dos dados do app.
          </>
        ),
      },
      {
        t: 'p',
        texto: (
          <>
            <b>Se o codec em si é incompatível</b> — H.264 10-bit ou HEVC — a única saída é
            recodificar de verdade, o que é lento e perde qualidade. O Learnflix não faz isso por
            você de propósito. Converta a aula para H.264 8-bit com o HandBrake ou o VLC, substitua o
            arquivo na pasta do curso e use <b>Re-escanear agora</b> no menu ⋯.
          </>
        ),
      },
      {
        t: 'nota',
        tom: 'info',
        texto: 'Trocar o arquivo e re-escanear preserva o progresso daquela aula.',
      },
      {
        t: 'p',
        texto: (
          <>
            A conversão sem perda depende do <b>ffmpeg</b> instalado. Sem ele, o botão responde que a
            ferramenta não está disponível.
          </>
        ),
      },
    ],
  },

  {
    id: 'pasta-mudou',
    grupo: 'problemas',
    titulo: 'Mudei a pasta de lugar',
    resumo: 'Re-apontar sem perder o progresso',
    blocos: [
      {
        t: 'p',
        texto:
          'Mover um curso para outro disco, renomear a pasta ou reorganizar o acervo não custa o seu histórico. O progresso nunca fica preso ao caminho: cada aula é identificada pelo lugar que ocupa dentro do curso, não pelo endereço no disco.',
      },
      {
        t: 'passos',
        itens: [
          <>
            Abra o curso. Se a pasta sumiu, um aviso aparece no topo.
          </>,
          <>
            No menu ⋯, escolha <b>Re-apontar pasta…</b>
          </>,
          <>
            Navegue até o novo lugar e confirme. Antes de aplicar, o Learnflix mostra quantas aulas
            ele reencontrou, quantas continuam faltando e quantas são novas.
          </>,
        ],
      },
      {
        t: 'nota',
        tom: 'info',
        texto:
          'As posições e as aulas concluídas seguem intactas. Se alguma aula não for reencontrada, ela fica marcada como faltando em vez de desaparecer — nada de progresso é descartado em silêncio.',
      },
    ],
  },

  {
    id: 'sem-capas',
    grupo: 'problemas',
    titulo: 'Não aparecem capas nem durações',
    resumo: 'Instalar o ffmpeg',
    blocos: [
      {
        t: 'p',
        texto: (
          <>
            Miniaturas e durações são extraídas dos vídeos pelo <b>ffmpeg</b>, um programa separado.
            Sem ele o Learnflix funciona inteiro — só a grade fica sem capas e a lista mostra{' '}
            <code>--:--</code> no lugar do tempo.
          </>
        ),
      },
      { t: 'p', texto: <b>Instalar:</b> },
      {
        t: 'lista',
        itens: [
          <>
            macOS: <code>brew install ffmpeg</code>
          </>,
          <>
            Windows: <code>winget install Gyan.FFmpeg</code>
          </>,
          <>
            Linux: <code>sudo apt install ffmpeg</code> (ou o gerenciador da sua distro)
          </>,
        ],
      },
      {
        t: 'p',
        texto:
          'Depois de instalar, reinicie o Learnflix. As capas vão aparecendo conforme você abre os cursos — elas são geradas sob demanda, não todas de uma vez.',
      },
      {
        t: 'nota',
        tom: 'info',
        texto:
          'No Windows, feche e reabra o terminal depois de instalar: é o que faz o sistema enxergar o ffmpeg.',
      },
    ],
  },

  {
    id: 'curso-sumiu',
    grupo: 'problemas',
    titulo: 'Um curso sumiu ou está indisponível',
    resumo: 'Disco desconectado, pasta renomeada',
    blocos: [
      {
        t: 'p',
        texto:
          'Se um curso aparece na biblioteca mas avisa que a pasta está indisponível, os arquivos não estão onde estavam. As causas mais comuns, em ordem:',
      },
      {
        t: 'lista',
        itens: [
          <>
            <b>Disco externo desconectado.</b> Conecte o disco e recarregue a página — costuma
            resolver sozinho.
          </>,
          <>
            <b>Compartilhamento de rede fora do ar.</b> Monte a pasta de rede primeiro, depois abra o
            Learnflix.
          </>,
          <>
            <b>Pasta movida ou renomeada.</b> Use <b>Re-apontar pasta…</b> no menu ⋯ do curso.
          </>,
        ],
      },
      {
        t: 'nota',
        tom: 'aviso',
        texto:
          'Nunca exclua o curso para "consertar" — excluir descarta o progresso. Re-apontar preserva tudo.',
      },
      {
        t: 'p',
        texto: (
          <>
            Se apenas <i>algumas</i> aulas sumiram, elas ficam marcadas como faltando e o resto do
            curso continua funcionando. Repor os arquivos e usar <b>Re-escanear agora</b> traz tudo
            de volta.
          </>
        ),
      },
    ],
  },
];

/** Tópicos que aparecem no primeiro nível do índice. */
export const TOPICOS_RAIZ = TOPICOS.filter((t) => !t.grupo);

/** Sub-tópicos de "Quando algo dá errado". */
export const TOPICOS_PROBLEMAS = TOPICOS.filter((t) => t.grupo === 'problemas');

export function acharTopico(id: string | null): Topico | null {
  if (!id) return null;
  return TOPICOS.find((t) => t.id === id) ?? null;
}

/** Um id qualquer (ex.: vindo da URL, que o usuário pode digitar) é um tópico? */
export function ehTopicoValido(id: string): id is TopicoId {
  return (IDS as readonly string[]).includes(id);
}
