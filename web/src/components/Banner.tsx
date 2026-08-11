// Banner de aviso/degradação compartilhado — o padrão âmbar (ffmpeg ausente,
// pasta indisponível, aulas faltando) estava reimplementado inline em vários
// lugares com drift de opacidade. Fonte-única aqui.
export default function Banner({ tone = 'warn', children }: { tone?: 'warn' | 'info'; children: React.ReactNode }) {
  const cls =
    tone === 'warn'
      ? 'border-amber-700/40 bg-amber-900/40 text-amber-200'
      : 'border-neutral-700 bg-neutral-900 text-neutral-300';
  return <div className={`rounded-lg border px-3 py-2 text-sm ${cls}`}>{children}</div>;
}
