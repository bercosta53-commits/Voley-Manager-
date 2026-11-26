import Link from 'next/link';
import { EXPLICA_COBERTURA, ROTULO_COBERTURA, type EstadoCobertura, type ResumoCobertura } from '@/lib/varredura';
import { cn, dataCurta, plural } from '@/lib/utils';

const ESTADOS: EstadoCobertura[] = ['com_fato', 'sem_fato', 'vencida', 'nao_varrida'];
const TOM: Record<EstadoCobertura, string> = {
  com_fato: 'bg-ok',
  sem_fato: 'bg-text-3',
  vencida: 'bg-warm',
  nao_varrida: 'bg-risk',
};
const TIERS = ['A', 'B', 'C'];

/** Separa "sem fato" de "não varrido": quanto da base o Radar realmente olhou. */
export function CoberturaVarredura({ resumo }: { resumo: ResumoCobertura }) {
  const { total, porEstado, porTier, aVarrer } = resumo;
  const olhadas = porEstado.com_fato + porEstado.sem_fato;
  const pct = (n: number) => (total ? Math.round((n / total) * 100) : 0);
  return (
    <section aria-labelledby="cobertura-titulo" className="vr-card mb-6 p-5 md:mb-8">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="cobertura-titulo" className="text-md font-semibold">
          Cobertura das contas
        </h2>
        <p className="text-sm text-text-3">
          <span className="vr-data text-foreground">{pct(olhadas)}%</span> da base com leitura recente · {plural(total, 'conta', 'contas')}
        </p>
      </div>
      <p className="mt-1 max-w-2xl text-sm text-text-3">
        Conta sem sinal só quer dizer "nada aconteceu" quando foi varrida há pouco. Nos outros casos, ninguém olhou.
      </p>

      <div className="mt-4 flex h-2.5 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={ESTADOS.map(e => `${ROTULO_COBERTURA[e]}: ${porEstado[e]}`).join(', ')}>
        {ESTADOS.map(e => (porEstado[e] ? <span key={e} className={TOM[e]} style={{ width: `${(porEstado[e] / total) * 100}%` }} /> : null))}
      </div>

      <ul className="mt-4 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        {ESTADOS.map(e => (
          <li key={e} className="rounded-control bg-muted/60 p-3">
            <div className="flex items-center gap-2 text-sm font-medium">
              <span aria-hidden className={cn('size-2 shrink-0 rounded-full', TOM[e])} />
              {ROTULO_COBERTURA[e]}
            </div>
            <p className="mt-1">
              <span className="vr-data text-xl font-semibold">{porEstado[e]}</span>
              <span className="text-xs text-text-3"> · {TIERS.map(t => `${t} ${porTier[t]?.[e] ?? 0}`).join(' · ')}</span>
            </p>
            <p className="mt-1 text-xs text-text-3">{EXPLICA_COBERTURA[e]}</p>
          </li>
        ))}
      </ul>

      {aVarrer.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">
            Varrer primeiro: {plural(aVarrer.length, 'conta A/B', 'contas A/B')} sem leitura recente
          </h3>
          <ul className="mt-2 flex flex-wrap gap-1.5">
            {aVarrer.slice(0, 40).map(c => (
              <li key={c.id}>
                <Link
                  href={`/contas/${c.id}`}
                  className="inline-flex items-center gap-1.5 rounded-chip border border-border px-2 py-0.5 text-xs text-text-2 hover:bg-muted focus-visible:outline-2"
                  title={c.estado === 'nao_varrida' ? 'Nunca varrida' : `Última leitura: ${dataCurta(c.ultimaVarredura ?? c.ultimoFato ?? '')}`}
                >
                  <span aria-hidden className={cn('size-1.5 rounded-full', TOM[c.estado])} />
                  <span className="vr-data text-text-3">{c.tier}</span> {c.nome}
                </Link>
              </li>
            ))}
            {aVarrer.length > 40 && <li className="px-1 text-xs text-text-3">e mais {aVarrer.length - 40}</li>}
          </ul>
        </div>
      )}
    </section>
  );
}
