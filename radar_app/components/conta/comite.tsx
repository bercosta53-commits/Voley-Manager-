import { UserRound, UserRoundSearch } from 'lucide-react';
import type { Conta, Pessoa, PapelAbm } from '@/lib/tipos';
import { cn } from '@/lib/utils';

/** Os três lugares que o ABM precisa ocupar antes de abordar (scripts/qualificar_icp.py classifica pelo cargo). */
const LUGARES: { papel: PapelAbm; rotulo: string; quem: string }[] = [
  { papel: 'assina_cheque', rotulo: 'Assina o cheque', quem: 'CEO, sócio ou CFO' },
  { papel: 'decisor', rotulo: 'Decisor', quem: 'CRO, CMO ou diretoria comercial/marketing' },
  { papel: 'dono_da_dor', rotulo: 'Dono da dor', quem: 'Head ou gerente de marketing, vendas ou growth' },
];
const ROTULO: Record<PapelAbm, string> = {
  assina_cheque: 'Assina o cheque',
  decisor: 'Decisor',
  dono_da_dor: 'Dono da dor',
  trava: 'Trava',
  influenciador: 'Influenciador',
};
const RELEVANCIA = { alta: 'relevância alta', media: 'relevância média', baixa: 'relevância baixa' } as const;

/** Lugar de cada pessoa: papel ABM quando já classificado; senão, o mapa antigo por área. */
function papelDe(p: Pessoa): PapelAbm {
  if (p.papelAbm) return p.papelAbm;
  if (p.area === 'executivo') return 'assina_cheque';
  if ((p.area === 'marketing' || p.area === 'comercial') && p.papel === 'decisor') return 'decisor';
  if (p.area === 'marketing' || p.area === 'comercial') return 'dono_da_dor';
  return 'influenciador';
}

/** A pessoa ocupa este lugar? (papel principal ou um dos extras) */
const ocupa = (p: Pessoa, papel: PapelAbm) => papelDe(p) === papel || !!p.papeisExtras?.includes(papel);

function Linha({ p }: { p: Pessoa }) {
  return (
    <li className="flex items-start gap-3">
      <span className="grid size-8 shrink-0 place-items-center rounded-full border border-border bg-secondary text-text-2">
        <UserRound className="size-4" strokeWidth={1.5} />
      </span>
      <div className="min-w-0 text-sm">
        <p className="truncate font-medium">{p.nome}</p>
        <p className="text-xs text-text-3">
          {p.cargo}
          {p.relevancia && <> · {RELEVANCIA[p.relevancia]}</>}
          {p.contatoVelora && <> · <span className="font-semibold text-foreground">nosso contato</span></>}
        </p>
      </div>
    </li>
  );
}

/** Comitê de compra: assina o cheque, decisor e dono da dor; quem trava aparece à parte. */
export function Comite({ conta }: { conta: Conta }) {
  const conhecidos = LUGARES.filter(l => conta.comite.some(p => ocupa(p, l.papel))).length;
  const travas = conta.comite.filter(p => papelDe(p) === 'trava');
  return (
    <section className="vr-card p-5">
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="text-xs font-semibold text-text-3">Comitê de compra</h2>
        <span className="vr-data text-xs text-text-3">
          {conhecidos}/{LUGARES.length}
        </span>
      </div>
      <div className="mt-3 flex flex-col gap-4">
        {LUGARES.map(l => {
          const pessoas = conta.comite.filter(p => ocupa(p, l.papel));
          return (
            <div key={l.papel}>
              <p className={cn('mb-1.5 text-[11px] font-semibold uppercase tracking-wide', pessoas.length ? 'text-text-2' : 'text-text-3')}>{l.rotulo}</p>
              {pessoas.length ? (
                <ul className="flex flex-col gap-2.5">
                  {pessoas.map(p => (
                    <Linha key={p.nome} p={p} />
                  ))}
                </ul>
              ) : (
                <div className="flex items-start gap-3">
                  <span className="grid size-8 shrink-0 place-items-center rounded-full border border-dashed border-border-strong text-text-3">
                    <UserRoundSearch className="size-4" strokeWidth={1.5} />
                  </span>
                  <p className="pt-1.5 text-sm text-text-2">{l.quem} · a identificar</p>
                </div>
              )}
            </div>
          );
        })}
        {travas.length > 0 && (
          <div>
            <p className="mb-1.5 text-[11px] font-semibold uppercase tracking-wide text-text-2">{ROTULO.trava}</p>
            <ul className="flex flex-col gap-2.5">
              {travas.map(p => (
                <Linha key={p.nome} p={p} />
              ))}
            </ul>
          </div>
        )}
      </div>
      <p className="mt-4 border-t border-border pt-3 text-xs text-text-3">
        Papel pelo cargo: quem assina o cheque aprova o orçamento, o decisor decide na área, o dono da dor vive o problema e puxa a conversa, a trava pode barrar
        (TI, compras, jurídico).
      </p>
    </section>
  );
}
