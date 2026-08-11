import { useCallback, useEffect, useRef } from 'react';
import { useLocation, useSearchParams } from 'react-router-dom';
import { acharTopico, TOPICOS_PROBLEMAS, TOPICOS_RAIZ, type Bloco, type Topico, type TopicoId } from '../help/content';
import { ArrowLeft, HelpCircle, X } from './icons';

// Painel de ajuda. Montado UMA vez no App, fora das rotas: abre por cima de
// qualquer tela sem desmontar a página de trás — a pessoa não perde o lugar.
//
// O estado mora na URL (?ajuda=). É o que dá ao painel o que só uma página teria:
// link compartilhável, Voltar do navegador fechando o painel, e links contextuais
// que são <Link> comuns. De quebra, o Lesson consegue LER esse estado da própria
// URL para suspender os atalhos do player — sem estado global entre os dois.

const PARAM = 'ajuda';

function Kbd({ children }: { children: React.ReactNode }) {
  return (
    <kbd className="inline-block min-w-[1.75rem] rounded border border-neutral-700 bg-neutral-800 px-1.5 py-0.5 text-center font-sans text-xs text-neutral-200">
      {children}
    </kbd>
  );
}

function Blocos({ blocos }: { blocos: Bloco[] }) {
  return (
    <>
      {blocos.map((b, i) => {
        switch (b.t) {
          case 'p':
            return (
              <p key={i} className="mb-4 text-sm leading-relaxed text-neutral-300 last:mb-0">
                {b.texto}
              </p>
            );
          case 'passos':
            return (
              <ol key={i} className="mb-4 list-decimal space-y-2 pl-5 text-sm leading-relaxed text-neutral-300 marker:text-neutral-500">
                {b.itens.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ol>
            );
          case 'lista':
            return (
              <ul key={i} className="mb-4 list-disc space-y-2 pl-5 text-sm leading-relaxed text-neutral-300 marker:text-neutral-600">
                {b.itens.map((item, j) => (
                  <li key={j}>{item}</li>
                ))}
              </ul>
            );
          case 'teclas':
            return (
              <dl key={i} className="mb-4 space-y-1.5">
                {b.itens.map((k, j) => (
                  <div key={j} className="flex items-baseline gap-3">
                    <dt className="flex shrink-0 gap-1">
                      {k.teclas.map((t) => (
                        <Kbd key={t}>{t}</Kbd>
                      ))}
                    </dt>
                    <dd className="text-sm text-neutral-400">{k.desc}</dd>
                  </div>
                ))}
              </dl>
            );
          case 'nota':
            return (
              <div
                key={i}
                className={`mb-4 rounded-lg border px-3 py-2 text-sm leading-relaxed ${
                  b.tom === 'aviso'
                    ? 'border-amber-700/40 bg-amber-900/30 text-amber-100'
                    : 'border-neutral-800 bg-neutral-900 text-neutral-300'
                }`}
              >
                {b.texto}
              </div>
            );
        }
      })}
    </>
  );
}

function ItemIndice({ topico, onAbrir }: { topico: Topico; onAbrir: (id: TopicoId) => void }) {
  return (
    <button
      type="button"
      onClick={() => onAbrir(topico.id)}
      className="block w-full rounded-lg px-3 py-2.5 text-left transition-colors motion-reduce:transition-none hover:bg-neutral-900 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
    >
      <span className="block text-sm font-medium text-neutral-200">{topico.titulo}</span>
      <span className="mt-0.5 block text-xs text-neutral-500">{topico.resumo}</span>
    </button>
  );
}

export default function HelpDrawer() {
  const [params, setParams] = useSearchParams();
  const location = useLocation();
  const aberto = params.has(PARAM);
  const topico = acharTopico(params.get(PARAM));
  const painelRef = useRef<HTMLDivElement>(null);
  const focoAnterior = useRef<HTMLElement | null>(null);

  const navegar = useCallback(
    (id: TopicoId | '', substituir = false) => {
      const proximo = new URLSearchParams(params);
      proximo.set(PARAM, id);
      setParams(proximo, { replace: substituir });
    },
    [params, setParams],
  );

  const fechar = useCallback(() => {
    const proximo = new URLSearchParams(params);
    proximo.delete(PARAM);
    // replace: fechar não merece uma entrada no histórico. Voltar continua
    // levando ao estado anterior à abertura, que é o mesmo lugar.
    setParams(proximo, { replace: true });
  }, [params, setParams]);

  // Enquanto aberto: Esc fecha, Tab circula dentro do painel, o fundo não rola,
  // e ao fechar o foco volta para quem abriu.
  useEffect(() => {
    if (!aberto) return;
    focoAnterior.current = document.activeElement as HTMLElement | null;
    painelRef.current?.focus();

    const onKey = (e: KeyboardEvent) => {
      if (e.key === 'Escape') {
        e.preventDefault();
        fechar();
        return;
      }
      if (e.key !== 'Tab') return;
      const painel = painelRef.current;
      if (!painel) return;
      const focaveis = painel.querySelectorAll<HTMLElement>(
        'a[href], button:not([disabled]), [tabindex]:not([tabindex="-1"])',
      );
      if (focaveis.length === 0) return;
      const primeiro = focaveis[0];
      const ultimo = focaveis[focaveis.length - 1];
      if (e.shiftKey && document.activeElement === primeiro) {
        e.preventDefault();
        ultimo.focus();
      } else if (!e.shiftKey && document.activeElement === ultimo) {
        e.preventDefault();
        primeiro.focus();
      }
    };

    window.addEventListener('keydown', onKey);
    const overflowAnterior = document.body.style.overflow;
    document.body.style.overflow = 'hidden';
    return () => {
      window.removeEventListener('keydown', onKey);
      document.body.style.overflow = overflowAnterior;
      const alvo = focoAnterior.current;
      if (alvo?.isConnected) alvo.focus();
    };
  }, [aberto, fechar]);

  // "?" abre a ajuda — exceto na aula, onde essa tecla já mostra os atalhos do
  // player sem tirar você do vídeo, e exceto enquanto se digita num campo.
  useEffect(() => {
    if (aberto || location.pathname.startsWith('/lesson/')) return;
    const onKey = (e: KeyboardEvent) => {
      if (e.key !== '?') return;
      const alvo = e.target as HTMLElement | null;
      if (alvo && (alvo.tagName === 'INPUT' || alvo.tagName === 'TEXTAREA' || alvo.isContentEditable)) return;
      e.preventDefault();
      navegar('');
    };
    window.addEventListener('keydown', onKey);
    return () => window.removeEventListener('keydown', onKey);
  }, [aberto, location.pathname, navegar]);

  if (!aberto) return null;

  return (
    <div className="fixed inset-0 z-50 flex justify-end">
      <div
        className="ajuda-scrim absolute inset-0 bg-black/60"
        onClick={fechar}
        aria-hidden="true"
      />
      <div
        ref={painelRef}
        role="dialog"
        aria-modal="true"
        aria-label={topico ? `Ajuda: ${topico.titulo}` : 'Ajuda'}
        tabIndex={-1}
        className="ajuda-painel relative flex h-full w-full flex-col border-l border-neutral-800 bg-neutral-950 focus:outline-none sm:w-[28rem]"
      >
        <header className="flex items-center gap-2 border-b border-neutral-800 px-3 py-3">
          {topico ? (
            <button
              type="button"
              onClick={() => navegar('')}
              aria-label="Voltar ao índice da ajuda"
              className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors motion-reduce:transition-none hover:bg-neutral-900 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
            >
              <ArrowLeft size={18} />
            </button>
          ) : (
            <span className="grid h-11 w-11 shrink-0 place-items-center text-neutral-500">
              <HelpCircle size={18} />
            </span>
          )}
          <h2 className="min-w-0 flex-1 truncate text-base font-medium">{topico ? topico.titulo : 'Ajuda'}</h2>
          <button
            type="button"
            onClick={fechar}
            aria-label="Fechar a ajuda"
            className="grid h-11 w-11 shrink-0 place-items-center rounded-lg text-neutral-400 transition-colors motion-reduce:transition-none hover:bg-neutral-900 hover:text-neutral-200 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600"
          >
            <X size={18} />
          </button>
        </header>

        <div className="min-h-0 flex-1 overflow-y-auto overscroll-contain px-4 py-4">
          {topico ? (
            <>
              <Blocos blocos={topico.blocos} />
              {topico.id === 'problemas' && (
                <div className="mt-2 space-y-1">
                  {TOPICOS_PROBLEMAS.map((t) => (
                    <ItemIndice key={t.id} topico={t} onAbrir={navegar} />
                  ))}
                </div>
              )}
            </>
          ) : (
            <nav aria-label="Tópicos da ajuda" className="space-y-1">
              {TOPICOS_RAIZ.map((t) => (
                <ItemIndice key={t.id} topico={t} onAbrir={navegar} />
              ))}
            </nav>
          )}
        </div>

        <footer className="border-t border-neutral-800 px-4 py-3 text-xs text-neutral-500">
          Seus vídeos nunca saem da sua máquina. O Learnflix só lê as pastas que você aponta.
        </footer>
      </div>
    </div>
  );
}
