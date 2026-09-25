import type { Conta } from '@/lib/tipos';
import { dataCurta } from '@/lib/utils';

/** Decomposição do score: cada parcela com a barra do quanto somou (em pontos, de 0 a 100). */
export function Decomposicao({ conta }: { conta: Conta }) {
  const parcelas = conta.composicao.filter(p => p.pontos !== 0);
  return (
    <div>
      <ul className="flex flex-col gap-3">
        {parcelas.map((p, i) => (
          <li key={i} className="grid grid-cols-[minmax(0,1fr)_48px] items-start gap-x-4">
            <div className="min-w-0">
              <p className="text-sm font-medium">
                {p.rotulo}
                {p.data && <span className="vr-data ml-1.5 text-xs font-normal text-text-3">{dataCurta(p.data)}</span>}
              </p>
              <p className="truncate text-xs text-text-3">{p.detalhe}</p>
              <div className="mt-1.5 h-1.5 rounded-full bg-secondary" aria-hidden>
                <div
                  className={p.pontos < 0 ? 'h-full rounded-full bg-border-strong' : p.data ? 'h-full rounded-full bg-warm' : 'h-full rounded-full bg-text-3'}
                  style={{ width: `${Math.min(100, Math.abs(p.pontos))}%` }}
                />
              </div>
            </div>
            <span className="vr-data pt-0.5 text-right text-sm">{p.pontos > 0 ? `+${p.pontos}` : `−${Math.abs(p.pontos)}`}</span>
          </li>
        ))}
      </ul>
      <div className="mt-4 flex items-baseline justify-between border-t border-border pt-3">
        <span className="text-sm font-semibold">Score de hoje</span>
        <span className="font-display text-xl font-semibold tabular-nums">{conta.score}</span>
      </div>
      <p className="mt-2 text-xs text-text-3">Perfil e momento vêm da planilha. Sinais em âmbar: fatos recentes, que vão perdendo peso com o tempo.</p>
    </div>
  );
}
