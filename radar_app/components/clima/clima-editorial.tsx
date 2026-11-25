'use client';

import { useState } from 'react';
import { ArrowUpRight, ChevronDown, Download, Printer } from 'lucide-react';
import type { EdicaoClima, FonteClima, Indicador, PrioridadeClima, TeseClima } from '@/lib/clima';
import type { Base } from '@/lib/tipos';
import { baixarCsv } from '@/lib/exportar-csv';
import { cn } from '@/lib/utils';
import { Casca } from '@/components/casca/casca';
import { Button } from '@/components/ui/button';

const prioridades = {
  abordar: { rotulo: 'Abordar com gatilho', classe: 'bg-ok-bg text-ok' },
  validar: { rotulo: 'Validar na conta', classe: 'bg-warm-bg text-warm' },
  monitorar: { rotulo: 'Monitorar', classe: 'bg-[var(--vr-surface-3)] text-text-2' },
} satisfies Record<PrioridadeClima, { rotulo: string; classe: string }>;

type Filtro = 'todas' | PrioridadeClima;
const filtros: Filtro[] = ['todas', 'abordar', 'validar', 'monitorar'];

function dataPt(iso: string): string {
  return iso.split('-').reverse().join('/');
}

function FonteLink({ fonte }: { fonte: FonteClima }) {
  return (
    <a href={fonte.url} target="_blank" rel="noreferrer" className="inline-flex items-baseline gap-1 text-xs text-text-2 underline decoration-border-strong underline-offset-2 hover:text-foreground">
      {fonte.nome}<ArrowUpRight className="size-3 shrink-0 self-center" aria-hidden />
    </a>
  );
}

function CartaoTese({ tese }: { tese: TeseClima }) {
  const prioridade = prioridades[tese.prioridade];
  return (
    <article className="vr-card flex min-w-0 break-inside-avoid flex-col gap-4 p-5 md:p-6" aria-labelledby={`tese-${tese.id}`}>
      <header>
        <span className={cn('inline-block rounded-chip px-2.5 py-1 text-xs font-semibold', prioridade.classe)}>{prioridade.rotulo}</span>
        <h3 id={`tese-${tese.id}`} className="mt-3 font-display text-xl leading-tight font-semibold tracking-tight">{tese.titulo}</h3>
        <p className="mt-1 text-xs text-text-3">{tese.recorte}</p>
      </header>

      <section aria-label="Evidências" className="rounded-control bg-[var(--vr-surface-2)] px-4 py-3">
        <ul className="space-y-2.5">
          {tese.fatos.map(fato => (
            <li key={fato.texto} className="text-sm leading-relaxed text-text-2">
              {fato.texto}<br />
              <FonteLink fonte={fato.fonte} />
            </li>
          ))}
        </ul>
      </section>

      <div className="text-sm leading-relaxed text-text-2">{tese.leitura}</div>
      <dl className="grid gap-3 border-t border-border pt-4 text-sm leading-relaxed">
        <div><dt className="font-semibold">Gatilho para abordar</dt><dd className="text-text-2">{tese.gatilho}</dd></div>
        <div><dt className="font-semibold">Oferta e métrica</dt><dd className="text-text-2">{tese.oferta}</dd></div>
      </dl>
      <p className="mt-auto text-xs leading-relaxed text-text-3">{tese.limite}</p>
    </article>
  );
}

export function ClimaEditorial({ base, edicao, contexto }: { base: Base; edicao: EdicaoClima; contexto: Indicador[] }) {
  const [filtro, setFiltro] = useState<Filtro>('todas');
  const teses = edicao.teses.filter(tese => filtro === 'todas' || tese.prioridade === filtro);

  function exportar() {
    baixarCsv(
      `clima-velora-${edicao.data}.csv`,
      ['Tese', 'Recorte', 'Prioridade', 'Evidências', 'Leitura', 'Gatilho', 'Oferta e métrica', 'Limite', 'Fontes'],
      teses.map(tese => [tese.titulo, tese.recorte, prioridades[tese.prioridade].rotulo,
        tese.fatos.map(fato => fato.texto).join(' | '), tese.leitura, tese.gatilho, tese.oferta, tese.limite,
        [...new Set(tese.fatos.map(fato => fato.fonte.url))].join(' | ')]),
    );
  }

  return (
    <Casca base={base}>
      <main className="flex w-full max-w-[1320px] flex-col gap-7 px-4 pt-2 pb-28 md:gap-8 md:px-8 md:pt-8 md:pb-16 print:max-w-none print:p-0">
        <header className="flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-3xl font-semibold tracking-tight">Clima de mercado</h1>
            <p className="mt-1.5 text-sm text-text-3">Edição de <time dateTime={edicao.data}>{dataPt(edicao.data)}</time></p>
          </div>
          <div className="flex flex-wrap gap-2 print:hidden">
            <Button onClick={exportar} disabled={!teses.length}><Download /> Exportar CSV</Button>
            <Button onClick={() => window.print()}><Printer /> Imprimir leitura</Button>
          </div>
        </header>

        <section aria-labelledby="clima-leitura" className="vr-card grid gap-6 p-5 md:p-6 lg:grid-cols-[1.05fr_1fr]">
          <div className="min-w-0">
            <h2 id="clima-leitura" className="font-display text-xl font-semibold">Leitura executiva</h2>
            <p className="mt-3 max-w-[65ch] text-sm leading-relaxed text-text-2 md:text-base">{edicao.resumo}</p>
            <p className="mt-3 text-xs leading-relaxed text-text-3">O contexto orienta a ordem de investigação. A prioridade de uma conta depende de ICP, VSCS e do gatilho confirmado.</p>
          </div>
          <dl className="grid grid-cols-1 gap-3 min-[420px]:grid-cols-2">
            {edicao.macro.map(indicador => (
              <div key={indicador.rotulo} className="rounded-control border border-border bg-[var(--vr-surface-2)] p-3.5">
                <dt className="text-xs font-medium text-text-2">{indicador.rotulo}</dt>
                <dd className="vr-data mt-1 text-2xl leading-tight font-semibold">{indicador.valor}</dd>
                <dd className="mt-1 text-xs leading-relaxed text-text-3">{indicador.referencia}</dd>
                <dd className="mt-1.5"><FonteLink fonte={indicador.fonte} /></dd>
              </div>
            ))}
          </dl>
        </section>

        <section aria-labelledby="clima-teses">
          <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
            <div>
              <h2 id="clima-teses" className="font-display text-xl font-semibold">Teses comerciais</h2>
              <p aria-live="polite" className="mt-1 text-xs text-text-3">{teses.length} de {edicao.teses.length} teses · CSV e impressão seguem o filtro</p>
            </div>
            <div role="group" aria-label="Filtrar teses por prioridade" className="flex flex-wrap gap-1.5 print:hidden">
              {filtros.map(valor => (
                <button key={valor} type="button" aria-pressed={filtro === valor} onClick={() => setFiltro(valor)}
                  className={cn('rounded-control border px-3 py-2 text-xs font-semibold', filtro === valor ? 'border-acid/60 bg-acid-soft text-foreground' : 'border-border text-text-2 hover:bg-[var(--vr-surface-2)]')}>
                  {valor === 'todas' ? 'Todas' : prioridades[valor].rotulo}
                </button>
              ))}
            </div>
          </div>
          {teses.length ? (
            <div className="grid gap-4 lg:grid-cols-2">{teses.map(tese => <CartaoTese key={tese.id} tese={tese} />)}</div>
          ) : <p className="vr-card p-5 text-sm text-text-2">Nenhuma tese nesta prioridade na edição.</p>}
        </section>

        <section aria-labelledby="clima-agenda" className="vr-card break-inside-avoid p-5 md:p-6">
          <h2 id="clima-agenda" className="font-display text-xl font-semibold">O que acompanhar</h2>
          <ul className="mt-4 divide-y divide-border">
            {edicao.agenda.map(evento => (
              <li key={evento.titulo} className="grid items-start gap-1.5 py-3 first:pt-0 last:pb-0 sm:grid-cols-[7rem_1fr_auto] sm:gap-4">
                <time dateTime={evento.data} className="vr-data text-sm font-semibold">{dataPt(evento.data)}</time>
                <div><p className="text-sm font-semibold">{evento.titulo}</p><p className="mt-0.5 text-sm leading-relaxed text-text-2">{evento.leitura}</p></div>
                <FonteLink fonte={evento.fonte} />
              </li>
            ))}
          </ul>
        </section>

        <details className="vr-card group print:hidden">
          <summary className="flex cursor-pointer list-none items-center justify-between gap-3 p-5 md:px-6 [&::-webkit-details-marker]:hidden">
            <span className="font-display text-base font-semibold">Indicadores de contexto</span>
            <ChevronDown className="size-4 shrink-0 text-text-3 group-open:rotate-180" aria-hidden />
          </summary>
          <div className="overflow-x-auto border-t border-border">
            <table className="w-full min-w-[620px] text-left text-sm">
              <thead className="bg-[var(--vr-surface-2)] text-xs text-text-3">
                <tr><th scope="col" className="px-5 py-3">Indicador</th><th scope="col" className="px-4 py-3">Valor e referência</th><th scope="col" className="px-4 py-3">Leitura</th><th scope="col" className="px-4 py-3">Fonte</th></tr>
              </thead>
              <tbody className="divide-y divide-border">
                {contexto.map(indicador => (
                  <tr key={indicador.rotulo}>
                    <th scope="row" className="px-5 py-3 font-medium">{indicador.rotulo}</th>
                    <td className="px-4 py-3"><span className="vr-data font-semibold">{indicador.valor}</span><br /><span className="text-xs text-text-3">{indicador.delta}</span></td>
                    <td className="max-w-[47ch] px-4 py-3 text-sm leading-relaxed text-text-2">{indicador.nota}</td>
                    <td className="px-4 py-3 text-xs text-text-3">{indicador.fonteUrl ? <FonteLink fonte={{ nome: indicador.fonte, url: indicador.fonteUrl }} /> : indicador.fonte}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </details>
      </main>
    </Casca>
  );
}
