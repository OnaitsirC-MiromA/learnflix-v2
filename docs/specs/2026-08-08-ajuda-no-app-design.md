# Ajuda dentro do app — design

**Data:** 2026-08-08

## Problema

O Learnflix é feito para ser baixado por qualquer pessoa, mas hoje toda a explicação está no README —
fora do app. Quem já instalou e trava numa dúvida ("por que este vídeo não toca?", "mudei a pasta de
lugar e agora?") precisa sair do produto, achar o repositório e procurar. Pior: as telas que
anunciam um problema não dizem o que fazer com ele.

Objetivo: documentação abrangente **dentro** do app, acessível de qualquer tela, e presente
justamente onde a dúvida nasce.

## Decisões

| Decisão | Escolha |
|---|---|
| Formato | Painel deslizante à direita, sobre a tela atual |
| Estado | Na URL, no parâmetro `?ajuda=` |
| Assuntos | Primeiros passos · Assistir e progresso · Bibliotecas · Quando algo dá errado |
| Ajuda contextual | Sim, links nas telas de erro |
| Busca | Não (quatro tópicos não justificam) |

## Onde vive e como abre

`HelpDrawer` é montado uma vez em `App.tsx`, **fora** das `Routes`: fica disponível sobre qualquer
tela sem desmontar a página por trás — a pessoa não perde o lugar onde estava.

O estado mora na URL, no parâmetro `?ajuda=`. Sem valor, abre o índice; com um id
(`?ajuda=video-nao-toca`), abre o tópico. É o que devolve ao painel as três qualidades que só uma
página dedicada teria:

- **Link compartilhável** — dá para mandar a seção exata para alguém.
- **Voltar do navegador fecha o painel**, que é o comportamento esperado.
- **Links contextuais viram `<Link>` comum** — nada de estado global para abrir a ajuda de longe.

Abrir: ícone `?` no cabeçalho, tecla `?` fora do player, e os links contextuais.
Fechar: `Esc`, clique no scrim, ou `×` (remove o parâmetro com `replace`).

## Anatomia

- Largura `28rem` no desktop; tela cheia no celular. Scrim escuro clicável atrás.
- Cabeçalho fixo: `←` (só dentro de um tópico, volta ao índice), título, `×`.
- Corpo rolável. **Dois níveis apenas:** índice → tópico.
- Foco preso dentro do painel enquanto aberto, devolvido ao elemento que o abriu ao fechar.
- `prefers-reduced-motion`: sem a animação de deslizar.

## Conteúdo como dado

Cada tópico é uma lista de blocos tipados, renderizados por um componente único:

```ts
type Bloco =
  | { t: 'p'; texto: ReactNode }
  | { t: 'passos'; itens: ReactNode[] }   // numerada
  | { t: 'lista'; itens: ReactNode[] }
  | { t: 'teclas'; itens: { teclas: string[]; desc: string }[] }
  | { t: 'nota'; tom: 'info' | 'aviso'; texto: ReactNode }
```

Motivo: a tipografia e o espaçamento do `DESIGN.md` passam a valer **por construção** — um tópico
novo não consegue inventar estilo próprio, e o texto fica legível no arquivo, separado da marcação.

Tópicos e âncoras (as âncoras são o contrato dos links contextuais e não mudam à toa):

| id | Cobre |
|---|---|
| `primeiros-passos` | Adicionar um curso, importar uma pasta em lote, como a ordem e os módulos são decididos, o que são materiais |
| `assistir` | Retomar, concluir (manual e automática), o cartão Continuar, atalhos de teclado |
| `bibliotecas` | Criar, renomear, mover cursos; por que excluir uma biblioteca não apaga curso |
| `problemas` | Guarda-chuva dos quatro pontos de dor |
| `video-nao-toca` | Formato incompatível e a conversão sem perda |
| `pasta-mudou` | Re-apontar preservando o progresso |
| `sem-capas` | ffmpeg ausente |
| `curso-sumiu` | Pasta indisponível, disco desconectado |

Os atalhos reaproveitam a lista `SHORTCUTS` que já existe em `pages/Lesson.tsx` — ela passa a ser
exportada de um lugar só, para a ajuda e o overlay do player nunca divergirem.

## Ajuda contextual

| Onde | Gatilho | Abre |
|---|---|---|
| `pages/Lesson.tsx`, tela de formato incompatível | "Entenda o que aconteceu" | `video-nao-toca` |
| `pages/Course.tsx`, banner de pasta indisponível | link no banner | `pasta-mudou` |
| `components/FfmpegBanner.tsx` | link no banner | `sem-capas` |
| `pages/Library.tsx`, estado vazio | "Como funciona?" | `primeiros-passos` |

## Riscos e como são contidos

**Atalhos do player brigando com o painel.** O `Lesson.tsx` já suspende os atalhos quando há um
overlay aberto (`if (help || confirmCover) return;`). Como o estado do painel está na URL, o próprio
`Lesson` consegue lê-lo (`searchParams.has('ajuda')`) e entrar na mesma guarda — sem estado
compartilhado nem ordem de listeners para acertar. O `Esc` respeita a ordem: painel → overlay de
atalhos → sair da aula.

**Âncora morta.** Um link contextual apontando para um tópico que deixou de existir é uma regressão
silenciosa. Teste automatizado garante que todo id referenciado existe e que não há id duplicado.

**Divergir do README.** A ajuda cobre *uso*; o README cobre *instalação e visão geral*. Instalação
não se repete dentro do app — quem está lendo já instalou.

## Fora de escopo

Busca, "isso foi útil?", tour guiado e imagens dentro da ajuda (peso no repositório e manutenção
dobrada a cada mudança de UI).

## Verificação

- Testes de integridade das âncoras, verdes.
- `npm run build` limpo nos dois workspaces.
- No navegador: abrir pelo `?` do cabeçalho e pela tecla; navegar índice ↔ tópico; fechar por `Esc`,
  scrim e `×`; conferir que o Voltar do navegador fecha; percorrer o painel só com Tab e confirmar
  que o foco não escapa; abrir cada link contextual e verificar que cai no tópico certo; confirmar
  que os atalhos do player ficam suspensos com o painel aberto sobre uma aula.
