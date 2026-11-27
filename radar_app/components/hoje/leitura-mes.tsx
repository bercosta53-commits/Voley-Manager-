'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowRight, ArrowUpRight } from 'lucide-react';
import type { Conta, Sinal } from '@/lib/tipos';
import { fraseDoMes, leituraDoMes, variacaoPct, type Variacao } from '@/lib/leitura-mes';
import { TEMAS, dataNarrativa } from '@/lib/narrativa';
import { SEM_GRUPO } from '@/lib/mercado';
import { hrefConta } from '@/lib/contas';
import { cn } from '@/lib/utils';

/** "+23" verde, "−4" laranja, "=" neutro: a direção em palavra e cor, não só em cor */
function Delta({ v, pct = false }: { v: Variacao; pct?: boolean }) {
  const d = v.agora - v.antes;
  const p = variacaoPct(v);
  const Icone = d > 0 ? ArrowUpRight : d < 0 ? ArrowDownRight : ArrowRight;
  const texto = pct && p !== null ? `${p > 0 ? '+' : ''}${p}%` : d === 0 ? 'estável' : `${d > 0 ? '+' : '−'}${Math.abs(d)}`;
  return (
    <span className={cn('vr-data inline-flex items-center gap-0.5 text-xs font-semibold', d > 0 ? 'text-ok' : d < 0 ? 'text-warm' : 'text-text-3')}>
      <Icone aria-hidden className="size-3.5" strokeWidth={2} />
      {texto}
    </span>
  );
}

function Numero({ rotulo, valor, v, pct, dica }: { rotulo: string; valor: number; v?: Variacao; pct?: boolean; dica?: string }) {
  return (
    <div className="min-w-0" title={dica}>
      <p className="text-xs text-text-3">{rotulo}</p>
      <p className="mt-0.5 flex items-baseline gap-2">
        <span className="vr-data text-2xl font-semibold tracking-tight">{valor}</span>
        {v && <Delta v={v} pct={pct} />}
      </p>
    </div>
  );
}

/** 12 semanas em barras; as da janela de 30 dias em cor cheia */
function Semanas({ semanas, janelaDias }: { semanas: { ate: string; n: number }[]; janelaDias: number }) {
  const max = Math.max(1, ...semanas.map(s => s.n));
  const naJanela = Math.ceil(janelaDias / 7);
  return (
    <figure className="min-w-0">
      <div className="flex h-14 items-end gap-1" role="img" aria-label={`Fatos por semana, últimas 12 semanas: ${semanas.map(s => s.n).join(', ')}`}>
        {semanas.map((s, i) => (
          <span
            key={s.ate}
            title={`Semana até ${dataNarrativa(s.ate)}: ${s.n} fatos`}
            className={cn('flex-1 rounded-t-[3px]', i >= semanas.length - naJanela ? 'bg-foreground' : 'bg-[var(--vr-border-strong)]')}
            style={{ height: `${Math.max(4, (s.n / max) * 100)}%` }}
          />
        ))}
      </div>
      <figcaption className="mt-1 flex justify-between text-xs text-text-3">
        <span>12 semanas</span>
        <span>últimos 30 dias</span>
      </figcaption>
    </figure>
  );
}

/**
 * Leitura do mês no topo de Hoje: o que aconteceu nos 30 dias até a última carga, com a comparação com os 30
 * dias anteriores, o que mais cresceu, onde se concentra e os movimentos de maior peso. Tudo vem dos fatos
 * registrados (lib/leitura-mes.ts); o feed continua logo abaixo.
 */
export function LeituraDoMes({ contas, sinais, ate }: { contas: Conta[]; sinais: Sinal[]; ate: string }) {
  const l = useMemo(() => leituraDoMes(contas, sinais, ate), [contas, sinais, ate]);
  if (!l.fatos.agora && !l.fatos.antes) return null;
  const maxTema = Math.max(1, ...l.temas.flatMap(t => [t.agora, t.antes]));
  const familias = l.familias.filter(f => f.nome !== SEM_GRUPO).slice(0, 4);
  const maxFam = Math.max(1, ...familias.map(f => f.agora));
  return (
    <section aria-labelledby="leitura-mes" className="vr-card mb-6 p-5 md:p-6">
      <div className="grid gap-5 lg:grid-cols-[minmax(0,1fr)_260px] lg:items-end">
        <div className="min-w-0">
          <h2 id="leitura-mes" className="text-xs font-semibold tracking-wider text-text-3 uppercase">
            Últimos 30 dias · {dataNarrativa(l.desde)} a {dataNarrativa(l.ate)}
          </h2>
          <p className="mt-2 max-w-3xl text-md leading-snug font-medium text-pretty">{fraseDoMes(l)}</p>
          <div className="mt-4 grid grid-cols-3 gap-4 sm:max-w-lg">
            <Numero rotulo="Fatos" valor={l.fatos.agora} v={l.fatos} pct dica={`${l.fatos.antes} nos 30 dias anteriores`} />
            <Numero rotulo="Contas em movimento" valor={l.contas.agora} v={l.contas} dica={`${l.contas.antes} nos 30 dias anteriores`} />
            <Numero rotulo="Tier A e B" valor={l.contasAB} dica="Contas Tier A ou B com ao menos um fato no período" />
          </div>
        </div>
        <Semanas semanas={l.semanas} janelaDias={l.janelaDias} />
      </div>

      <div className="mt-6 grid gap-6 border-t border-border pt-5 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr]">
        <div className="min-w-0">
          <h3 className="text-sm font-semibold">O que mais cresceu</h3>
          <p className="mt-0.5 text-xs text-text-3">Fatos por tema: mês anterior → últimos 30 dias</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {l.temas.map(t => (
              <li key={t.tema} className="grid grid-cols-[96px_minmax(0,1fr)_auto] items-center gap-2 text-sm">
                <span className="truncate text-text-2">{TEMAS[t.tema].curto}</span>
                <span className="flex flex-col gap-0.5" aria-hidden>
                  <span className="h-1 rounded-full bg-[var(--vr-border-strong)]" style={{ width: `${(t.antes / maxTema) * 100}%` }} />
                  <span className={cn('h-2 rounded-full', t.tema === 'negativo' ? 'bg-warm' : 'bg-ok')} style={{ width: `${Math.max(2, (t.agora / maxTema) * 100)}%` }} />
                </span>
                <span className="grid grid-cols-[52px_64px] items-center justify-items-end gap-1 whitespace-nowrap">
                  <span className="vr-data text-xs text-text-3">
                    {t.antes} → <span className="font-semibold text-foreground">{t.agora}</span>
                  </span>
                  <Delta v={t} />
                </span>
              </li>
            ))}
          </ul>
        </div>

        <div className="min-w-0">
          <h3 className="text-sm font-semibold">Onde se concentra</h3>
          <p className="mt-0.5 text-xs text-text-3">Famílias de TI com mais fatos no período</p>
          <ul className="mt-3 flex flex-col gap-2.5">
            {familias.map(f => (
              <li key={f.nome} className="text-sm">
                <div className="flex items-baseline justify-between gap-2">
                  <span className="truncate text-text-2" title={`${f.contas} contas na base`}>{f.nome}</span>
                  <span className="flex shrink-0 items-center gap-2">
                    <span className="vr-data text-xs font-semibold">{f.agora}</span>
                    <Delta v={f} />
                  </span>
                </div>
                <span className="mt-1 block h-1.5 rounded-full bg-[var(--vr-surface-3)]" aria-hidden>
                  <span className="block h-full rounded-full bg-foreground/80" style={{ width: `${(f.agora / maxFam) * 100}%` }} />
                </span>
              </li>
            ))}
          </ul>
          <Link href="/movimentos" className="mt-3 inline-block text-xs font-medium text-text-2 underline decoration-border-strong underline-offset-2 hover:text-foreground">
            Ver movimentos do mercado
          </Link>
        </div>

        <div className="min-w-0 md:col-span-2 xl:col-span-1">
          <h3 className="text-sm font-semibold">Principais movimentos</h3>
          <p className="mt-0.5 text-xs text-text-3">O fato de maior peso de cada conta, Tier A e B primeiro</p>
          <ol className="mt-2 divide-y divide-border">
            {l.principais.map(p => (
              <li key={p.fato.id}>
                <Link href={hrefConta(p.conta.id)} className="-mx-2 grid grid-cols-[minmax(0,1fr)_auto] gap-x-3 rounded-control px-2 py-2 hover:bg-[var(--vr-surface-2)]">
                  <span className="min-w-0">
                    <span className="flex items-center gap-1.5">
                      <span className="truncate text-sm font-semibold">{p.conta.nome}</span>
                      {p.conta.tier && <span className="vr-data shrink-0 text-xs text-text-3">Tier {p.conta.tier}</span>}
                    </span>
                    <span className="block truncate text-xs text-text-2">{p.fato.sinal || p.fato.rotulo}</span>
                  </span>
                  <span className="flex flex-col items-end gap-0.5">
                    <span className={cn('rounded-chip px-1.5 py-0.5 text-xs font-medium', p.tema === 'negativo' ? 'bg-warm-bg text-warm' : 'bg-secondary text-text-2')}>
                      {TEMAS[p.tema].curto}
                    </span>
                    <span className="vr-data text-xs text-text-3">
                      {dataNarrativa(p.fato.data.slice(0, 10))}
                      {p.outros > 0 && ` · +${p.outros}`}
                    </span>
                  </span>
                </Link>
              </li>
            ))}
          </ol>
        </div>
      </div>
    </section>
  );
}
