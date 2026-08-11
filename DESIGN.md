---
name: Cursos Locais
description: Acervo pessoal de cursos em vídeo — estúdio de estudo noturno, escuro e focado.
colors:
  studio-black: "#0a0a0a"
  screen-black: "#000000"
  graphite: "#171717"
  charcoal: "#262626"
  slate: "#404040"
  desk-light: "#f5f5f5"
  mist-200: "#e5e5e5"
  mist-300: "#d4d4d4"
  mist-400: "#a3a3a3"
  mist-500: "#737373"
  mist-600: "#525252"
  focus-blue: "#2563eb"
  progress-blue: "#3b82f6"
  signal-blue: "#60a5fa"
  done-green: "#4ade80"
  warn-amber: "#fde68a"
  warn-amber-bg: "#78350f"
  warn-amber-border: "#b45309"
typography:
  display:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif'
    fontSize: "1.5rem"
    fontWeight: 600
    lineHeight: 1.2
    letterSpacing: "normal"
  title:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "1rem"
    fontWeight: 500
    lineHeight: 1.4
    letterSpacing: "normal"
  body:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "0.875rem"
    fontWeight: 400
    lineHeight: 1.5
    letterSpacing: "normal"
  label:
    fontFamily: '"Inter Variable", ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, sans-serif'
    fontSize: "0.75rem"
    fontWeight: 400
    lineHeight: 1.4
    letterSpacing: "0.025em"
rounded:
  sm: "4px"
  md: "8px"
  lg: "12px"
spacing:
  xs: "4px"
  sm: "8px"
  md: "12px"
  lg: "16px"
  xl: "24px"
components:
  button-primary:
    backgroundColor: "{colors.focus-blue}"
    textColor: "{colors.desk-light}"
    rounded: "{rounded.md}"
    padding: "8px 16px"
  button-neutral:
    backgroundColor: "{colors.charcoal}"
    textColor: "{colors.desk-light}"
    rounded: "{rounded.sm}"
    padding: "4px 8px"
  card-course:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.desk-light}"
    rounded: "{rounded.lg}"
  list-row:
    backgroundColor: "{colors.graphite}"
    textColor: "{colors.desk-light}"
    rounded: "{rounded.md}"
    padding: "8px 12px"
  progress-track:
    backgroundColor: "{colors.charcoal}"
    rounded: "{rounded.sm}"
    height: "6px"
  progress-fill:
    backgroundColor: "{colors.progress-blue}"
    rounded: "{rounded.sm}"
    height: "6px"
---

# Design System: Cursos Locais

## 1. Overview

**Creative North Star: "O Estúdio de Estudo Noturno"**

Uma cabine de estudo de madrugada: luz baixa, mesa limpa, só você e o material. A interface é o ambiente escuro ao redor da tela — ela existe para sumir. O conteúdo (a capa, o vídeo, o progresso) é a única coisa que brilha; tudo o mais recua para o quase-preto. É um acervo **pessoal**, não um produto comercial gritante: a sensação é de posse calma e foco, no espírito de um Plex/Jellyfin caseiro visto à noite.

O sistema é **escuro por convicção, não por moda**. O fundo vive no extremo da rampa (`#0a0a0a`–`#000`) porque é onde se assiste vídeo confortavelmente por horas; o azul aparece com parcimônia, reservado para ação e progresso. Profundidade vem de **camadas tonais** (preto → grafite → carvão → ardósia), nunca de sombra ou vidro. A tipografia é a fonte nativa do sistema, sem firulas — hierarquia se faz com peso e tamanho.

Este sistema **rejeita explicitamente**: o SaaS genérico de cards idênticos com eyebrows tracked; o LMS corporativo pesado e burocrático; o excesso de enfeite (glassmorphism, gradientes decorativos, animação gratuita); e a aparência de player amador/improvisado. Premium aqui é por subtração.

**Key Characteristics:**
- Quase-preto como palco; conteúdo como única fonte de luz.
- Azul de acento raro e funcional (ação + progresso), nunca decorativo.
- Plano por padrão: profundidade por camada tonal e anel de foco, não por sombra.
- Fonte do sistema; hierarquia por peso/tamanho.
- Acabamento de produto em todos os estados (vazio, carregando, sem ffmpeg, formato incompatível).

## 2. Colors

Uma paleta monocromática quente-fria de cinzas-quase-pretos, com um único azul de trabalho e dois sinais semânticos (verde de conclusão, âmbar de aviso).

### Primary
- **Azul Foco** (`#2563eb`): a cor de ação. Botão primário ("Adicionar curso", "Usar esta pasta", "Pular agora"), anel de foco/hover em cards (`ring-2`) e realce da aula atual na barra lateral (a `30%` de opacidade). Aparece em poucos pontos por tela — é o único lugar com saturação.
- **Azul Progresso** (`#3b82f6`): preenchimento das barras de progresso. Levemente mais claro que o Azul Foco para ler bem sobre o trilho carvão.
- **Azul Sinal** (`#60a5fa`): rótulos pequenos e eyebrows funcionais (o "Continuar" em maiúsculas tracked). Reservado para microcópia de orientação.

### Secondary (semântico)
- **Verde Concluído** (`#4ade80`): exclusivamente status de conclusão — "✓ concluída", "Aula assistida ✓", "Curso concluído". Nunca decorativo.
- **Âmbar Aviso** (`#fde68a` sobre fundo `#78350f`, borda `#b45309`): banner de degradação graciosa (ex.: ffmpeg ausente). O único tom quente do sistema, e só para avisos acionáveis.

### Neutral
- **Preto Estúdio** (`#0a0a0a`): fundo da aplicação (body). O palco.
- **Preto Tela** (`#000000`): letterbox do player; a moldura preta pura em volta do vídeo.
- **Grafite** (`#171717`): superfícies elevadas — cards de curso, linhas de aula, painel "Continuar", modal, painel do contador.
- **Carvão** (`#262626`): controles e trilhos — botões neutros, trilho da barra de progresso, placeholder de capa, bordas e divisórias.
- **Ardósia** (`#404040`): estado ativo/selecionado (ex.: aba de view selecionada no alternador Lista/Grade).
- **Luz de Mesa** (`#f5f5f5`): texto primário e títulos.
- **Névoa** (`#e5e5e5` → `#525252`): rampa de texto secundário/terciário e ícones. `#d4d4d4`/`#a3a3a3` para metadados, `#737373`/`#525252` para texto desativado e numeração.

### Named Rules
**A Regra do Palco Escuro.** O fundo nunca sai do extremo escuro da rampa (`#0a0a0a`/`#000`). Proibido fundo cinza-claro "para elegância": a tela é para assistir vídeo no escuro. Toda a "cor" do app é carregada pelas capas/vídeo e por um punhado de pontos azuis.

**A Regra do Azul Raro.** O Azul Foco aparece só em **ação e progresso**. Se mais de um punhado de elementos azuis dividem a mesma tela, recue — a raridade é o que faz o azul significar "aqui é onde se age".

**A Regra do Scrim (gradientes sancionados).** Gradiente nunca é decoração; existe em exatamente três papéis funcionais, sempre de/para preto: (1) o chrome do player (`from-black/80` para transparente); (2) o rodapé dos cards-pôster da Biblioteca (`from-black/90 via-black/55` para transparente — garante legibilidade de título/progresso sobre a capa); (3) o **backdrop ambiente** da página do curso (capa `blur-2xl` `opacity-35` com scrim `via-studio-black/40 to-studio-black` — o conteúdo ilumina o palco e funde de volta no fundo). Qualquer outro gradiente é enfeite e está proibido.

**A Regra da Barra Honesta.** Barra de progresso **só aparece quando há progresso** (`pct > 0`). A 0%, uma trilha visível sobre capa clara parece barra cheia — ambiguidade sobre progresso é bug de design (princípio nº 1 do produto). A trilha sobre imagem é `white/15`; sobre superfície, Carvão.

## 3. Typography

**Display/Body Font:** **Inter Variable** (latin + latin-ext, self-hosted em `web/public/fonts/`, copiada de `@fontsource-variable/inter`), com fallback na stack nativa do sistema (`ui-sans-serif, system-ui, -apple-system, "Segoe UI", Roboto, "Helvetica Neue", Arial, sans-serif`). *(Redesign 2026-07-04: uma família deliberada substituiu a stack pura do sistema — decisão do dono do acervo.)*
**Label/Mono Font:** nenhuma segunda família; rótulos são a mesma sans em corpo menor com leve tracking.

**Character:** legível e discreta — uma sans neutra de UI que dá acabamento "desenhado" sem chamar atenção para si (registro *product*: familiaridade conquistada, a ferramenta some na tarefa). Hierarquia se faz por **peso e tamanho**, não por troca de família. Display headings usam `tracking-tight` (−0.025em) para presença sem grito.

### Hierarchy
- **Display** (600, `1.5rem`/`text-2xl`, `sm:text-3xl` no título do curso, lh ~1.2, `tracking-tight`): título de página — "Meus cursos", título do curso. Único nível de cabeçalho forte.
- **Title** (500/`font-medium`, `1rem`, lh ~1.4; `sm:text-lg` no card featured e no Continuar): títulos de aula e de card, rótulo da barra lateral.
- **Body** (400, `0.875rem`/`text-sm`, lh ~1.5): metadados, descrições, status, links de navegação.
- **Label** (400, `0.75rem`/`text-xs`, tracking `0.025em`): microcópia e eyebrows funcionais ("CONTINUAR"), contadores e numeração de aula.

### Named Rules
**A Regra da Família Única.** Uma família só — Inter Variable — carregada localmente (latin apenas; nada de CDN — o app roda offline). Não pareie famílias; toda diferenciação vem de peso (400/500/600) e tamanho. A stack do sistema é fallback, não par.

**A Regra do Eyebrow Ganho.** Maiúsculas com tracking (o "CONTINUAR") só onde rotulam uma ação real e única na tela. Nunca um eyebrow tracked acima de cada seção — isso é gramática de IA, não voz.

## 4. Elevation

O sistema é **plano por padrão**. Não há `box-shadow` em lugar nenhum. A profundidade é comunicada por **camadas tonais**: Preto Estúdio (fundo) → Grafite (superfície) → Carvão (controle) → Ardósia (ativo). O olho lê a hierarquia pela diferença de luminância, não pela sombra.

A única "elevação" interativa é um **anel de foco azul** (`ring-2` em Azul Foco) que aparece no hover/foco de cards e do painel "Continuar". Overlays (modal, chrome do player) usam preto semitransparente — `bg-black/70` no fundo do modal e um gradiente `from-black/80` no topo do player — em vez de sombra projetada.

### Named Rules
**A Regra do Plano.** Superfícies são planas em repouso. A resposta a estado (hover, foco, seleção) é um **anel** ou uma **mudança de camada tonal** (Grafite → Ardósia), nunca uma sombra. Se você sentir vontade de adicionar `box-shadow`, suba uma camada tonal.

## 5. Components

### Buttons
- **Shape:** cantos suaves — `8px` (`rounded-lg`) no primário, `4px` (`rounded`) em controles compactos.
- **Primary:** fundo Azul Foco (`#2563eb`), texto Luz de Mesa, padding `8px 16px` (`px-4 py-2`). Para a ação principal de cada tela.
- **Neutral:** fundo Carvão (`#262626`), texto claro, padding `4px 8px` (`px-2 py-1`). Para os botões de chrome do player e ações secundárias.
- **Ghost / texto:** sem fundo, texto Névoa-400 (`#a3a3a3`) — usado em "Cancelar" e links de voltar.
- **Disabled:** `opacity` reduzida (0.3–0.4); sem mudança de cor.
- **Segmented toggle (Lista/Grade):** trilho `inline-flex` com borda Carvão; segmento ativo em Ardósia (`#404040`), inativo em Grafite.

### Cards / Containers
- **Corner Style:** `12px` (`rounded-xl`) em cards de curso, modal, painel "Continuar" e contador; `8px` (`rounded-lg`) em linhas/cards de aula.
- **Background:** Grafite (`#171717`).
- **Shadow Strategy:** nenhuma — ver Elevation. Hover/foco = anel Azul Foco `ring-2`.
- **Border:** só onde separa regiões (cabeçalho/rodapé de modal, borda da barra lateral): `1px` em Carvão.
- **Internal Padding:** `12px`–`16px` (`p-3`/`p-4`).
- **Poster/thumb:** sempre `aspect-video`, `object-cover`; fallback é o ícone `Play` do set (Névoa-600/700 sobre Grafite) ou `visibility:hidden`/`display:none` da imagem quebrada (sem capa = sem buraco, nunca emoji).
- **Card-pôster da Biblioteca (redesign 2026-07-04):** a capa É o card (`aspect-video` full-bleed, `rounded-xl`); título + progresso + meta vivem sobre o scrim inferior (Regra do Scrim); hover acende a capa (`brightness-110` + `scale-[1.03]`, 200ms ease-out, com `motion-reduce`) além do anel de foco. Aulas dentro do curso mantêm legenda-abaixo-do-thumb de propósito (lista de trabalho densa ≠ estante).

### Inputs / Fields
- **Checkbox:** nativo, `16px` (`w-4 h-4`); marca "concluída". Posicionado no canto superior direito do card na grade.
- **Range (tamanho da grade):** nativo, sem estilização custom.
- **Campo de texto:** o componente compartilhado `TextField` (Carvão `bg-neutral-800`, borda Ardósia `border-neutral-700`, `rounded-lg`, `focus:ring-2` Azul Foco). Todo input de texto passa por ele (Login, Settings, renomear).

### Navigation
- **Player chrome:** barra superior com gradiente `from-black/80 to-transparent`, **auto-ocultável** (opacidade, `transition-opacity duration-300`) após ~2,5s de inatividade do mouse. Botões de ícone do set SVG próprio (`icons.tsx`: 24×24, stroke 2, estilo Lucide) em Carvão; 44px de alvo (`h-11 w-11`). No celular a barra reflui em 2 linhas (controles na 1ª, título na 2ª) e revela-se por toque (revelar + auto-esconder, nunca alternar).
- **Barra lateral de playlist:** `w-72`, fundo `#0a0a0a` a 95% com borda esquerda Carvão, `z-20`. Aula atual destacada em Azul Foco a 30%; hover em Carvão.
- **Links de retorno:** texto Névoa-400 com seta "←".

### Signature Component — Cabeçalho cinematográfico do curso
Duas peças que trabalham juntas na página do curso:
- **Backdrop ambiente**: a capa do curso desfocada (`blur-2xl`, `scale-110`, `opacity-35`) atrás do cabeçalho, com scrim fundindo no Preto Estúdio (~26rem de altura). Puramente decorativo (`aria-hidden`, `pointer-events-none`); some sozinho sem capa. É a assinatura do redesign: o conteúdo ilumina o palco.
- **Painel "Continuar"**: card `rounded-xl` em Grafite a 80% + `backdrop-blur-sm` (glass-lite propositado SOBRE o backdrop, não default), thumbnail `w-24 sm:w-44 aspect-video`, eyebrow "CONTINUAR" em Azul Sinal, título (`sm:text-lg`), tempo `posição / duração`, botão Azul Foco com ▶ (44px). É o ponto de retomada — a primeira coisa que o olho encontra.

### Status (glifos)
Status de aula é sempre **glifo + cor**, legível de relance: `✓` (Verde Concluído) concluída, `▓` em progresso, `○` não iniciada. Mantenha o vocabulário consistente entre lista, grade e barra lateral.

## 6. Do's and Don'ts

### Do:
- **Do** manter o fundo no extremo escuro (`#0a0a0a`/`#000`) e deixar capas e vídeo serem a fonte de luz da tela.
- **Do** reservar o Azul Foco (`#2563eb`) para ação e progresso; conte os elementos azuis por tela e recue se passarem de um punhado.
- **Do** comunicar profundidade por camada tonal (Grafite → Carvão → Ardósia) e por anel de foco, não por sombra.
- **Do** usar Inter Variable (família única, fallback do sistema) e variar só peso/tamanho para hierarquia; `tracking-tight` nos display headings.
- **Do** cuidar de todos os estados — vazio, carregando, erro, ffmpeg ausente, formato não tocável — com o mesmo acabamento da tela "feliz".
- **Do** garantir contraste de corpo ≥4.5:1 sobre o fundo escuro (atenção aos cinzas Névoa-500/600 em texto pequeno).
- **Do** respeitar `prefers-reduced-motion`: a animação de chrome e qualquer transição precisam de alternativa instantânea/crossfade.

### Don't:
- **Don't** introduzir fundo cinza-claro ou "off-white quente" para parecer elegante — viola a Regra do Palco Escuro.
- **Don't** parecer **SaaS genérico**: grades de cards idênticos com eyebrow tracked acima de cada seção, hero-metric, ou cara de "feito por IA".
- **Don't** parecer **LMS corporativo pesado** (Moodle/Udemy): cromo denso, navegação concorrente, burocracia visual.
- **Don't** cair em **excesso de enfeite**: glassmorphism, gradientes decorativos (gradiente só é permitido como o scrim funcional do chrome do player) e animação gratuita que compete com o vídeo.
- **Don't** entregar um **player amador/cru**: controles desalinhados, estados malcuidados, thumbnails que viram buraco quando faltam.
- **Don't** usar `border-left`/`border-right` colorida >1px como faixa de acento; texto com gradiente (`background-clip: text`); ou sombra para simular profundidade.
- **Don't** parear famílias ou adicionar uma segunda fonte — Inter Variable é a única família; peso e tamanho fazem a hierarquia.
