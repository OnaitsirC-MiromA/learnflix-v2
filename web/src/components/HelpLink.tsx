import { Link, useSearchParams } from 'react-router-dom';
import type { ReactNode } from 'react';
import type { TopicoId } from '../help/content';

// Link que abre a ajuda. Sem `topico`, abre o índice; com um tópico, vai direto
// nele. O destino é tipado como TopicoId, então o compilador recusa um link para
// tópico inexistente — link morto vira erro de build, e não uma tela vazia que
// só o usuário descobre.
//
// Preserva os demais parâmetros da URL e mantém o pathname atual: o painel abre
// POR CIMA de onde a pessoa está, sem tirá-la do lugar.
export default function HelpLink({
  topico = '',
  children,
  className = '',
}: {
  topico?: TopicoId | '';
  children: ReactNode;
  className?: string;
}) {
  const [params] = useSearchParams();
  const proximo = new URLSearchParams(params);
  proximo.set('ajuda', topico);
  return (
    <Link
      to={{ search: `?${proximo.toString()}` }}
      className={`underline decoration-current/40 underline-offset-2 hover:decoration-current focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-blue-600 rounded ${className}`}
    >
      {children}
    </Link>
  );
}
