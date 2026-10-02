'use client';

import { useEffect, useRef, useState } from 'react';
import { Check, ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';

/** Filtro de múltipla escolha: botão que abre uma lista com marcação. Superfície sólida (não é glass). */
export function MenuFiltro<T extends string>({
  rotulo,
  opcoes,
  valor,
  onMudar,
  unico = false,
}: {
  rotulo: string;
  opcoes: { id: T; rotulo: string; qtd?: number }[];
  valor: T[];
  onMudar: (v: T[]) => void;
  unico?: boolean;
}) {
  const [aberto, setAberto] = useState(false);
  const caixa = useRef<HTMLDivElement>(null);
  useEffect(() => {
    if (!aberto) return;
    const fora = (e: MouseEvent) => !caixa.current?.contains(e.target as Node) && setAberto(false);
    const esc = (e: KeyboardEvent) => e.key === 'Escape' && setAberto(false);
    document.addEventListener('mousedown', fora);
    document.addEventListener('keydown', esc);
    return () => {
      document.removeEventListener('mousedown', fora);
      document.removeEventListener('keydown', esc);
    };
  }, [aberto]);

  const escolhidos = opcoes.filter(o => valor.includes(o.id));
  const resumo = escolhidos.length === 0 ? '' : escolhidos.length === 1 ? escolhidos[0]!.rotulo : `${escolhidos.length}`;

  return (
    <div ref={caixa} className="relative">
      <button
        onClick={() => setAberto(a => !a)}
        aria-expanded={aberto}
        aria-haspopup="listbox"
        className={cn(
          'flex h-8 items-center gap-1.5 rounded-control border px-2.5 text-sm transition-colors duration-[var(--vr-dur-hover)] max-md:h-10',
          escolhidos.length ? 'border-border-strong bg-secondary font-medium text-foreground' : 'border-border bg-card text-text-2 hover:border-border-strong',
        )}
      >
        {rotulo}
        {resumo && <span className="text-text-2">: {resumo}</span>}
        <ChevronDown className="size-3.5 text-text-3" strokeWidth={1.5} />
      </button>
      {aberto && (
        <div role="listbox" aria-multiselectable={!unico} aria-label={rotulo} className="absolute top-full left-0 z-20 mt-1 min-w-52 rounded-card border border-border bg-card p-1 shadow-3">
          {opcoes.map(o => {
            const marcado = valor.includes(o.id);
            return (
              <button
                key={o.id}
                role="option"
                aria-selected={marcado}
                onClick={() => {
                  if (unico) {
                    onMudar(marcado ? [] : [o.id]);
                    setAberto(false);
                  } else onMudar(marcado ? valor.filter(v => v !== o.id) : [...valor, o.id]);
                }}
                className="flex min-h-9 w-full items-center gap-2 rounded-control px-2 text-left text-sm hover:bg-secondary max-md:min-h-11"
              >
                <span className={cn('grid size-4 place-items-center rounded-[4px] border', marcado ? 'border-foreground bg-foreground text-background' : 'border-border-strong')}>
                  {marcado && <Check className="size-3" strokeWidth={2} />}
                </span>
                <span className="flex-1">{o.rotulo}</span>
                {o.qtd !== undefined && <span className="vr-data text-xs text-text-3">{o.qtd}</span>}
              </button>
            );
          })}
        </div>
      )}
    </div>
  );
}
