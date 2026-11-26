'use client';

import type { StatusConta } from '@/lib/acoes';
import { STATUS_CONTA } from '@/lib/acoes';
import { cn, dataCurta } from '@/lib/utils';

const ROTULO: Record<StatusConta, string> = {
  abordado: 'Abordado',
  respondeu: 'Respondeu',
  reuniao: 'Reunião',
  oportunidade: 'Oportunidade',
  descartada: 'Descartada',
};

/**
 * Andamento da conta depois do primeiro contato, registrado pelo time em radar_acoes. Clicar no status vigente
 * tira o status (o registro guarda um "desfazer", nada é apagado). Sem o registro compartilhado ligado, o bloco
 * só explica o que falta.
 */
export function Andamento({
  atual,
  compartilhado,
  onMudar,
}: {
  atual?: { status: StatusConta; por: string; em: string };
  compartilhado: boolean;
  onMudar: (status: StatusConta | null) => void;
}) {
  return (
    <section aria-labelledby="andamento-conta" className="vr-card p-5">
      <h2 id="andamento-conta" className="text-xs font-semibold text-text-3">
        Andamento da conta
      </h2>
      {!compartilhado ? (
        <p className="mt-2 text-sm text-text-3">O andamento depois do contato é registrado para o time inteiro quando o registro compartilhado estiver ligado.</p>
      ) : (
        <>
          <div role="group" aria-label="Andamento da conta" className="mt-3 flex flex-wrap gap-1.5">
            {STATUS_CONTA.map(s => {
              const ativo = atual?.status === s;
              return (
                <button
                  key={s}
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => onMudar(ativo ? null : s)}
                  className={cn(
                    'min-h-8 rounded-chip border px-2.5 text-sm transition-colors',
                    ativo ? 'border-foreground bg-foreground text-background' : 'border-border text-text-2 hover:border-border-strong hover:text-foreground',
                    s === 'descartada' && !ativo && 'text-text-3',
                  )}
                >
                  {ROTULO[s]}
                </button>
              );
            })}
          </div>
          <p className="mt-2 text-xs text-text-3">
            {atual ? `${ROTULO[atual.status]} · por ${atual.por} em ${dataCurta(atual.em)}` : 'Nenhum andamento registrado.'}
          </p>
        </>
      )}
    </section>
  );
}
