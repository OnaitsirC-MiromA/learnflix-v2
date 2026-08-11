# CLAUDE.md

Orientações para o Claude Code (claude.ai/code) trabalhar neste repositório.

## O que é

**Learnflix** é um app local para assistir cursos em vídeo guardados em pastas do disco, com
progresso confiável. Cada pasta escolhida vira um "curso"; o app escaneia, lista as aulas (com
módulos, materiais, duração e capas), transmite o vídeo por HTTP Range e guarda posição e conclusão
no SQLite. Cursos podem ser agrupados em **bibliotecas** (coleções).

É um projeto feito para ser **baixado e rodado por qualquer pessoa**: o único pré-requisito é o
Node 22. Nada de contas, rede, nuvem, Docker ou serviços externos — se uma mudança introduzir um
pré-requisito novo para quem só quer assistir seus cursos, ela está errada.

O código e o histórico de commits estão em **português** (prefixos `feat:`/`fix:`/`test:`/
`refactor:`/`chore:`). Escreva comentários e commits no mesmo idioma.

## Comandos

Node >= 22, npm. Monorepo com dois workspaces: `server` e `web`.

```bash
npm install                # primeira vez
npm run dev                # Vite (:5173, faz proxy de /api → :7777) + Fastify (:7777), hot reload
npm run build              # web (tsc --noEmit && vite build) e depois server (tsc --noEmit)
npm start                  # processo único: Fastify serve web/dist + API em :7777, abre o navegador
npm test                   # testes dos dois workspaces

./start.sh                 # build + start (é o caminho de quem baixou); `fast` pula o build; `dev` = npm run dev
```

Um teste só:

```bash
npm run test --workspace=server -- src/scan/derive.test.ts
```

**Não há script separado de typecheck** — o `tsc --noEmit` roda dentro do `build` de cada workspace.
O servidor nunca emite JS; roda via `tsx`. Os imports são ESM **sem extensão de arquivo**
(`moduleResolution: "Bundler"`).

## Variáveis de ambiente

Lidas em `server/src/config.ts`: `PORT` (7777), `BIND` (127.0.0.1), `DATA_DIR` (`server/data` →
guarda `app.db`, `thumbs/` e `converted/`), `ALLOWED_ROOTS` (separado por `:` ou `;`; padrão = home
do usuário, mais `/Volumes` no macOS e `/media`+`/mnt` no Linux), `AUTOCOMPLETE_THRESHOLD` (0.9),
`OPEN_BROWSER`.

## Arquitetura

**A divisão cliente/servidor existe porque o navegador não lê caminhos arbitrários do disco.** O
servidor Fastify lê as pastas (sempre só-leitura), transmite o vídeo, gera as miniaturas e é dono do
SQLite; a SPA React conversa com ele por uma API JSON.

### Servidor (`server/src`)

- `index.ts` — bootstrap: carrega a config, cria os diretórios de dados, `openDb`, `buildApp`, escuta
  e abre o navegador se `web/dist` existir.
- `app.ts` — `buildApp(config, db)` monta o Fastify e registra os plugins de rota. **Rota nova entra
  aqui, no marcador `// [ROUTES]`.** Quando `web/dist` existe, também serve a SPA com fallback para
  `index.html` em URLs que não começam com `/api`.
- `db/` — `openDb` liga WAL e foreign keys e roda `migrate`, um runner guardado por
  **`PRAGMA user_version`**. Para evoluir o schema, **acrescente um bloco `if (version < N)`** — nunca
  edite o `SCHEMA_V1` no lugar.
- `routes/` — um plugin por arquivo (`fs`, `courses`, `lessons`, `stream`, `materials`, `thumbs`,
  `convert`, `collections`, `migration`, `settings`, `reset`, `info`, `health`). SQL cru com
  prepared statements do `better-sqlite3`, mapeando as linhas snake_case para DTOs camelCase à mão.
  `stream.ts` implementa o parsing de HTTP Range (é o que faz o seek funcionar). O `isWithinRoots`
  do `fs.ts` é a fronteira de segurança da navegação de pastas, reaproveitada pelo `courses.ts`.
- `scan/` — a ingestão: `walk.ts` percorre a pasta separando vídeos de materiais (ignorando
  dotfiles), `derive.ts` transforma a lista de arquivos em aulas ordenadas e módulos (`modules` se
  algum vídeo estiver aninhado, senão `flat`; títulos limpos a partir do nome do arquivo),
  `natural-sort.ts` ordena com consciência numérica (`Intl.Collator`), `scan-course.ts` junta tudo
  numa transação só, e `reconcile.ts`/`repoint-prefix.ts` cuidam de re-escanear e re-apontar.

### Modelo de dados (SQLite)

Schema em `server/src/db/schema.ts`; tipos de linha em `server/src/types.ts`. **Princípio central:
o progresso nunca se prende a um caminho absoluto.** O curso tem um `id` interno estável e a aula é
identificada pelo `rel_path` dentro do curso — mover a pasta de origem e re-apontar preserva o
histórico. `progress` é uma tabela por aula com `position_sec`, `furthest_sec`,
`completed`/`auto_completed`. Aulas caem em cascata; `courses.poster_lesson_id` aponta para a aula
da capa; `courses.collection_id` é `ON DELETE SET NULL` (excluir a biblioteca preserva os cursos).

### Web (`web/src`)

React 18 + Vite 6 + TanStack Query 5 + React Router 7 + Tailwind 3.

- `main.tsx` — providers (QueryClient, BrowserRouter). `App.tsx` — quatro rotas: `/` (Library),
  `/course/:id` (Course), `/lesson/:id` (Lesson), `/settings` (Settings).
- `api/client.ts` — o único cliente HTTP tipado (`api.*`) e todas as interfaces de DTO, espelhando o
  servidor. `api/hooks.ts` — wrappers do TanStack Query; as mutations invalidam `['courses']` /
  `['course', id]`.
- `pages/` — Library (grade de cursos, bibliotecas, adicionar pasta, importação em lote), Course
  (lista de aulas, retomar, menu ⋯), Lesson (player 100vh sem distração, salvar progresso, concluir,
  atalhos de teclado), Settings. `components/DirPicker.tsx` conduz o seletor de pastas via
  `/api/fs/browse`.

## Convenções

- **TDD na lógica de verdade** (scan/derive, parsing de Range, migrações, config) com Vitest; testes
  de rota usam `app.inject(...)` do Fastify. Testes que dependem do ffmpeg são guardados por uma
  checagem de capacidade (`it.skipIf(!hasFfmpeg())`).
- ffmpeg/ffprobe são **opcionais** — capas, duração e conversão degradam com elegância (placeholder,
  404, aviso claro) quando faltam.
- A interface é verificada por build + checagem manual, não por testes de UI.

## Contexto de design

O design é governado por **`PRODUCT.md`** (estratégia e voz) e **`DESIGN.md`** (sistema visual), na
raiz. Leia antes de mexer na UI.

- **Registro:** `product` — o design serve à tarefa; o conteúdo (vídeo, capas) é o protagonista e a
  interface recua.
- **Personalidade:** "cinema pessoal" — imersivo, confiável, sem ruído (espírito Plex/Jellyfin,
  nunca chamativo).
- **Princípios:** conteúdo primeiro; confiança no progresso acima de tudo; restrição deliberada (sem
  gradiente, vidro ou movimento gratuitos); acabamento de produto em todos os estados (vazio,
  carregando, erro, sem ffmpeg, formato não tocável); rápido, local e com o teclado em primeiro plano.
- **Evitar:** SaaS genérico "feito por IA", LMS corporativo pesado, ornamento decorativo, player com
  cara de amador.
- **Acessibilidade:** padrão sólido — contraste ≥4.5:1 no corpo (atenção ao fundo `#0a0a0a`), foco
  visível e navegação completa por teclado, respeitar `prefers-reduced-motion`.
