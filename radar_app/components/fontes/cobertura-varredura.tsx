import Link from 'next/link';
import type { ResumoCobertura } from '@/lib/varredura';
import { cn, dataCurta, plural } from '@/lib/utils';

const TIERS = ['A', 'B', 'C'];
const VISIVEIS = 12;

/**
 * O que o Radar sabe hoje: contas com fato recente, de quando é a informação e quais acabaram de mudar.
 * O que falta ler fica numa linha só, recolhida; estado sem conta não aparece.
 */
export function CoberturaVarredura({ resumo }: { resumo: ResumoCobertura }) {
  const { total, porEstado, porTier, comInformacao, frescor, aVarrer } = resumo;
  const com = porEstado.com_fato;
  if (!total) return null;
  const pct = Math.round((com / total) * 100);
  const faixas = [
    { rotulo: 'Últimos 7 dias', n: frescor.ate7, tom: 'bg-ok' },
    { rotulo: '8 a 30 dias', n: frescor.ate30, tom: 'bg-ok/60' },
    { rotulo: '31 a 90 dias', n: frescor.ate90, tom: 'bg-ok/30' },
  ].filter(f => f.n > 0);
  const semLeitura = porEstado.vencida + porEstado.nao_varrida;
  return (
    <section aria-labelledby="cobertura-titulo" className="vr-card mb-6 p-5 md:mb-8">
      <h2 id="cobertura-titulo" className="text-md font-semibold">
        Contas com informação
      </h2>
      <div className="mt-3 flex flex-wrap items-end gap-x-8 gap-y-3">
        <p>
          <span className="vr-data text-4xl font-semibold tracking-tight">{com}</span>
          <span className="ml-2 text-sm text-text-3">contas com fato nos últimos 90 dias · {pct}% da base</span>
        </p>
        <ul className="flex gap-4 text-sm">
          {TIERS.filter(t => porTier[t]?.com_fato).map(t => (
            <li key={t} className="text-text-3">
              Tier {t} <span className="vr-data font-semibold text-foreground">{porTier[t].com_fato}</span>
            </li>
          ))}
        </ul>
      </div>

      {faixas.length > 0 && (
        <>
          <div className="mt-4 flex h-2 w-full overflow-hidden rounded-full bg-muted" role="img" aria-label={faixas.map(f => `${f.rotulo}: ${f.n}`).join(', ')}>
            {faixas.map(f => (
              <span key={f.rotulo} className={f.tom} style={{ width: `${(f.n / com) * 100}%` }} />
            ))}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-5 gap-y-1 text-xs text-text-3">
            {faixas.map(f => (
              <li key={f.rotulo} className="flex items-center gap-1.5">
                <span aria-hidden className={cn('size-2 rounded-full', f.tom)} />
                {f.rotulo} <span className="vr-data font-semibold text-foreground">{f.n}</span>
              </li>
            ))}
          </ul>
        </>
      )}

      {comInformacao.length > 0 && (
        <div className="mt-5">
          <h3 className="text-sm font-semibold">Informação mais recente</h3>
          <ul className="mt-2 grid gap-x-6 md:grid-cols-2">
            {comInformacao.slice(0, VISIVEIS).map(c => (
              <li key={c.id} className="border-t border-border/60 first:border-t-0 md:[&:nth-child(2)]:border-t-0">
                <Link href={`/contas/${c.id}`} className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 py-2 hover:bg-muted/50 focus-visible:outline-2">
                  <span className="vr-data pt-0.5 text-xs text-text-3">{dataCurta(c.ultimoFato)}</span>
                  <span className="min-w-0">
                    <span className="block truncate text-sm font-medium">
                      {c.nome} <span className="vr-data text-xs font-normal text-text-3">{c.tier}</span>
                    </span>
                    {c.fato && <span className="block truncate text-xs text-text-2">{c.fato}</span>}
                  </span>
                </Link>
              </li>
            ))}
          </ul>
          {comInformacao.length > VISIVEIS && (
            <Link href="/contas" className="mt-2 inline-block text-xs font-medium text-text-2 underline underline-offset-2 hover:text-foreground">
              Ver as {com} contas com informação
            </Link>
          )}
        </div>
      )}

      {semLeitura > 0 && (
        <details className="mt-5 border-t border-border/60 pt-3 text-xs text-text-3">
          <summary className="cursor-pointer select-none">
            {plural(semLeitura, 'conta ainda sem leitura recente', 'contas ainda sem leitura recente')}
            {aVarrer.length > 0 && ` · ${aVarrer.length} A/B na fila da próxima varredura`}
          </summary>
          {aVarrer.length > 0 && (
            <p className="mt-2 leading-relaxed">
              {aVarrer.map((c, i) => (
                <span key={c.id}>
                  {i > 0 && ' · '}
                  <Link href={`/contas/${c.id}`} className="hover:text-foreground hover:underline">
                    {c.nome}
                  </Link>
                </span>
              ))}
            </p>
          )}
        </details>
      )}
    </section>
  );
}
