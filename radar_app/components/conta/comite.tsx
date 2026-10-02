import { UserRound, UserRoundSearch } from 'lucide-react';
import type { Area, Conta } from '@/lib/tipos';

const LUGARES: { area: Area; rotulo: string; quem: string }[] = [
  { area: 'executivo', rotulo: 'Decisão', quem: 'CEO ou diretoria executiva' },
  { area: 'marketing', rotulo: 'Marketing', quem: 'CMO ou head de marketing' },
  { area: 'comercial', rotulo: 'Comercial', quem: 'Diretoria comercial' },
];

/** Comitê de compra: três lugares; quem já sabemos (nome, cargo e papel) e quem falta identificar. */
export function Comite({ conta }: { conta: Conta }) {
  const conhecidos = LUGARES.filter(l => conta.comite.some(p => p.area === l.area)).length;
  return (
    <section className="vr-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold text-text-3">Comitê de compra</h2>
        <span className="vr-data text-xs text-text-3">
          {conhecidos}/{LUGARES.length}
        </span>
      </div>
      <ul className="mt-3 flex flex-col gap-3">
        {LUGARES.map(l => {
          const pessoas = conta.comite.filter(p => p.area === l.area);
          if (!pessoas.length)
            return (
              <li key={l.area} className="flex items-start gap-3">
                <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-text-3">
                  <UserRoundSearch className="size-4" strokeWidth={1.5} />
                </span>
                <div className="min-w-0 text-sm">
                  <p className="text-text-2">{l.quem}</p>
                  <p className="text-xs text-text-3">{l.rotulo} · a identificar</p>
                </div>
              </li>
            );
          return pessoas.map(p => (
            <li key={p.nome} className="flex items-start gap-3">
              <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-secondary text-text-2">
                <UserRound className="size-4" strokeWidth={1.5} />
              </span>
              <div className="min-w-0 text-sm">
                <p className="truncate font-medium">{p.nome}</p>
                <p className="text-xs text-text-3">
                  {p.cargo} · {p.papel}
                </p>
              </div>
            </li>
          ));
        })}
      </ul>
      <p className="mt-4 border-t border-border pt-3 text-xs text-text-3">Guardamos só nome, cargo e papel no comitê. Os lugares vazios o Apollo preenche quando a chave estiver configurada.</p>
    </section>
  );
}
