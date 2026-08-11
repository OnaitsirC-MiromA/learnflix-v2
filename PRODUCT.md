# Product

## Register

product

## Users

Uma pessoa (o próprio dono do acervo) que acumulou cursos em vídeo espalhados em pastas no disco — às vezes tudo numa pasta só, às vezes em subpastas, frequentemente com materiais (PDF, ZIP). Usa o app **localmente**, no próprio computador (localhost), normalmente sentada para estudar uma sessão de cada vez, num ambiente focado. O trabalho a ser feito: **escolher uma pasta, ver as aulas organizadas e assistir com a certeza de que o progresso não se perde** — retomar de onde parou e saber o que já concluiu.

Ela **não é necessariamente técnica**, e recebeu o app de alguém ou achou no GitHub: instalar e usar não pode exigir mais que instalar o Node e rodar um comando. Uso single-user e local é o caso único — não há contas, rede, nuvem nem sincronização.

## Product Purpose

Transformar pastas soltas de vídeo em uma biblioteca de cursos assistível, com **player integrado e progresso persistente e confiável**. Cada pasta escolhida vira um curso; o app deriva módulos/aulas, mostra capa, duração e status, faz streaming local (HTTP Range) e registra posição e conclusão. Sucesso = a pessoa abre uma aula, sai, volta dias depois e **continua exatamente do ponto certo**, com o histórico sobrevivendo até a mudança do caminho de origem da pasta. Concluir é manual ou auto-detectado (~90%), sempre com validação do usuário.

## Brand Personality

**Cinema pessoal.** Voz calma, confiante e voltada ao conteúdo — o app é o projecionista, não o espetáculo. Três palavras: **imersivo, confiável, sem ruído.** O conteúdo (capas, vídeo) é o protagonista; a interface recua para dar foco (player distraction-free 100vh, chrome que some sozinho). Sensação de acervo próprio bem cuidado, no espírito de Plex/Jellyfin/Apple TV — premium e quieto, nunca chamativo.

## Anti-references

- **SaaS genérico / "feito por IA"**: grades de cards idênticos, eyebrows em maiúsculas tracked, hero-metric, gradientes decorativos. Nada disso.
- **LMS corporativo pesado** (Moodle/Udemy): denso, burocrático, cheio de cromo e barras de navegação concorrentes. O foco é assistir, não administrar.
- **Excesso de enfeite**: glassmorphism, gradientes gratuitos e animações que competem com o vídeo. Motion só quando intencional e funcional.
- **Player amador/cru**: aparência improvisada, controles desalinhados, estados (vazio/carregando/sem ffmpeg/formato não tocável) malcuidados. O acabamento tem que ser de produto comercial.

## Design Principles

- **O conteúdo é o protagonista.** A UI serve o vídeo e as capas e depois desaparece. Quando em dúvida entre mostrar mais cromo ou mais conteúdo, escolha o conteúdo.
- **Confiança no progresso acima de tudo.** Retomar do ponto certo e refletir status com precisão é o valor central do produto; qualquer ambiguidade sobre "onde parei" ou "o que concluí" é um bug de design.
- **Restrição deliberada.** Premium por subtração, não por adição. Sem efeitos pelos efeitos; cada elemento ganha seu lugar.
- **Acabamento de produto, em todos os estados.** Vazio, carregando, erro, sem ffmpeg, formato incompatível — todos recebem o mesmo cuidado da tela "feliz".
- **Rápido e local primeiro.** Resposta imediata, sensação de app nativo no localhost, teclado em primeiro plano (atalhos do player são cidadãos de primeira classe).

## Accessibility & Inclusion

Meta: **padrão sólido**. Texto de corpo com contraste ≥4.5:1 (cuidado redobrado sobre o fundo escuro `#0a0a0a`); foco visível e navegação completa por teclado (já há atalhos espaço/setas/n/p/f/m/esc — manter consistentes e descobríveis); respeitar `prefers-reduced-motion` em toda animação. Não é alvo de conformidade WCAG AA formal, mas nada deve violar os fundamentos acima.
