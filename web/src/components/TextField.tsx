import { forwardRef } from 'react';

// Campo de texto charcoal compartilhado (DESIGN.md não tinha estilo de input
// definido; Configurações e os diálogos de renomear usavam classes ad hoc).
// Encaminha ref para autoFocus e leitura de valor.
const TextField = forwardRef<HTMLInputElement, React.InputHTMLAttributes<HTMLInputElement>>(
  function TextField({ className = '', ...props }, ref) {
    return (
      <input
        ref={ref}
        className={`w-full rounded-lg border border-neutral-700 bg-neutral-800 px-3 py-2 text-sm text-neutral-100 outline-none focus:ring-2 focus:ring-blue-600 ${className}`}
        {...props}
      />
    );
  },
);

export default TextField;
