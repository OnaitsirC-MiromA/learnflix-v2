/** @type {import('tailwindcss').Config} */
export default {
  content: ['./index.html', './src/**/*.{ts,tsx}'],
  theme: {
    extend: {
      // Fonte deliberada do redesign "cinema pessoal" (2026-07-04): uma família só,
      // self-hosted (@fontsource-variable/inter), fallback na stack do sistema.
      // Hierarquia continua por peso/tamanho — a família muda, a regra não.
      fontFamily: {
        sans: [
          '"Inter Variable"',
          'ui-sans-serif',
          'system-ui',
          '-apple-system',
          '"Segoe UI"',
          'Roboto',
          '"Helvetica Neue"',
          'Arial',
          'sans-serif',
        ],
      },
      // Tokens semânticos do DESIGN.md — mesmos valores dos shades stock já em uso,
      // agora com fonte-única. NÃO altera nenhuma cor; só nomeia.
      colors: {
        'studio-black': '#0a0a0a', // neutral-950 — palco/app
        graphite: '#171717', // neutral-900 — superfícies elevadas
        charcoal: '#262626', // neutral-800 — controles/trilha/bordas
        slate: '#404040', // neutral-700 — estado ativo/selecionado
        'focus-blue': '#2563eb', // blue-600 — ação + ring de foco
        'progress-blue': '#3b82f6', // blue-500 — preenchimento de progresso
        'signal-blue': '#60a5fa', // blue-400 — eyebrow/label
        'done-green': '#4ade80', // green-400 — conclusão
      },
      height: { screen: '100dvh' }, // player usa h-screen; dvh evita a barra de URL do iOS
      minHeight: { screen: '100dvh' },
    },
  },
  plugins: [],
};
