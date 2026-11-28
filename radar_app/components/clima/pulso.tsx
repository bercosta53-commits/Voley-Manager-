import Link from 'next/link';
import { TrendingUp, Megaphone, Users } from 'lucide-react';
import { hrefConta } from '@/lib/contas';
import { fmtClima } from '@/lib/clima';
import { MIN_CONTAS_PULSO, PESO_CONTEXTO, PESO_PULSO, type LeituraPulso, type VerticalPulso } from '@/lib/clima-pulso';
import { cn } from '@/lib/utils';
import { Rotulo } from '@/components/ui/rotulo';

const pct = (x: number) => `${Math.round(x * 100)}%`;
const tom = (s: number) => (s >= 0.25 ? 'text-ok' : s <= -0.25 ? 'text-risk' : 'text-foreground');
const cor = (s: number) => (s >= 0.25 ? 'var(--vr-ok)' : s <= -0.25 ? 'var(--vr-risk)' : 'var(--vr-text-2)');
const palavra = (s: number) => (s >= 0.25 ? 'Bom' : s <= -0.25 ? 'Ruim' : 'Neutro');
/** posição de −1..+1 em % da largura */
const pos = (s: number) => `${((Math.max(-1, Math.min(1, s)) + 1) / 2) * 100}%`;

/** Régua de −1 a +1 com o zero marcado e um ponto no valor. */
function Regua({ valor, rotulo }: { valor: number; rotulo: string }) {
  return (
    <div className="relative mt-3 h-2 rounded-full bg-secondary" role="img" aria-label={`${rotulo}: ${fmtClima(valor)} numa escala de −1 a +1`}>
      <span aria-hidden className="absolute top-[-3px] h-[14px] w-px bg-border-strong" style={{ left: '50%' }} />
      <span aria-hidden className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: pos(valor), background: cor(valor) }} />
    </div>
  );
}

function Bloco({ rotulo, valor, sub, children }: { rotulo: string; valor: number; sub: string; children?: React.ReactNode }) {
  return (
    <div className="min-w-0 rounded-card border border-border bg-card p-4">
      <p className="text-xs font-medium text-text-3">{rotulo}</p>
      <p className="mt-1 flex items-baseline gap-2">
        <span className={cn('vr-data text-2xl font-semibold', tom(valor))}>{fmtClima(valor)}</span>
        <span className={cn('text-sm font-medium', tom(valor))}>{palavra(valor)}</span>
      </p>
      <Regua valor={valor} rotulo={rotulo} />
      <p className="mt-2 text-xs text-text-2">{sub}</p>
      {children}
    </div>
  );
}

/** Uma vertical: do contexto (cinza) ao composto (cor do estado), na mesma régua de −1 a +1. */
function Linha({ v }: { v: VerticalPulso }) {
  const a = Math.min(v.contexto, v.composto);
  const b = Math.max(v.contexto, v.composto);
  const dica = `${v.nome}: contexto ${fmtClima(v.contexto)} · pulso ${v.pulso.S === null ? '—' : fmtClima(v.pulso.S)}${v.pulso.usaBase ? ' (da base)' : ''} · composto ${fmtClima(v.composto)} · ${v.pulso.cresce} crescem, ${v.pulso.encolhe} encolhem, ${v.pulso.comMovimento} contratando ou expandindo`;
  return (
    <li className="grid grid-cols-[minmax(0,1fr)_auto] items-center gap-x-3 gap-y-1 py-2 md:grid-cols-[minmax(0,11rem)_minmax(0,1fr)_7rem_6rem]" title={dica}>
      <span className="min-w-0">
        <span className="block truncate text-sm font-medium">{v.nome}</span>
        <span className="vr-data block text-xs text-text-3">
          {v.pulso.n} contas · {v.pulso.cresce}↑ {v.pulso.encolhe}↓
        </span>
      </span>
      <span className="relative order-last col-span-2 h-6 md:order-none md:col-span-1" role="img" aria-label={dica}>
        <span aria-hidden className="absolute inset-x-0 top-1/2 h-px bg-border" />
        <span aria-hidden className="absolute top-1 h-4 w-px bg-border-strong" style={{ left: '50%' }} />
        <span aria-hidden className="absolute top-1/2 h-0.5 -translate-y-1/2 rounded-full" style={{ left: pos(a), width: `calc(${pos(b)} - ${pos(a)})`, background: cor(v.composto), opacity: 0.45 }} />
        <span aria-hidden className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full border-2 border-text-3 bg-card" style={{ left: pos(v.contexto) }} />
        <span aria-hidden className="absolute top-1/2 size-3 -translate-x-1/2 -translate-y-1/2 rounded-full ring-2 ring-card" style={{ left: pos(v.composto), background: cor(v.composto) }} />
      </span>
      <span className="vr-data text-right text-sm">
        <span className="text-text-3">{fmtClima(v.contexto)} → </span>
        <span className={cn('font-semibold', tom(v.composto))}>{fmtClima(v.composto)}</span>
      </span>
      <span className={cn('hidden text-right text-xs md:block', v.relativo >= 0.05 ? 'text-ok' : v.relativo <= -0.05 ? 'text-risk' : 'text-text-3')}>
        {v.relativo >= 0.05 ? 'acima da média' : v.relativo <= -0.05 ? 'abaixo da média' : 'na média'}
      </span>
    </li>
  );
}

/**
 * Contexto × pulso: o clima que o noticiário e os indicadores descrevem, ao lado do que as empresas da própria
 * base estão fazendo (crescimento de equipe e contratação/expansão). Leitura proposta, explicada na própria tela;
 * não muda a nota do Clima nem a prioridade. Cálculo em lib/clima-pulso.ts.
 */
export function ContextoPulso({ leitura }: { leitura: LeituraPulso }) {
  if (!leitura.disponivel)
    return (
      <section aria-labelledby="contexto-pulso" className="vr-card p-5">
        <h2 id="contexto-pulso" className="text-md font-semibold">
          Contexto × pulso
        </h2>
        <p className="mt-1 text-sm text-text-2">Sem crescimento de equipe medido na base: o pulso das empresas aparece quando houver pelo menos {MIN_CONTAS_PULSO} contas comparáveis.</p>
      </section>
    );
  const { base } = leitura;
  const mudaram = base.cresce + base.encolhe;
  const individuais = leitura.verticais.filter(v => !v.pulso.usaBase);
  const pequenas = leitura.verticais.filter(v => v.pulso.usaBase);
  const frase =
    leitura.contextoBase < 0 && (base.S ?? 0) > 0
      ? `Os indicadores e o noticiário pesam para baixo, mas as empresas da base estão crescendo: de cada ${mudaram} que mudaram de tamanho em 12 meses, ${base.cresce} cresceram.`
      : `Contexto e empresas apontam na mesma direção: ${base.cresce} cresceram e ${base.encolhe} encolheram em 12 meses.`;

  return (
    <section aria-labelledby="contexto-pulso" className="vr-card p-5 md:p-6">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 id="contexto-pulso" className="text-md font-semibold">
          Contexto × pulso: o que se diz e o que as empresas fazem
        </h2>
        <span className="rounded-chip border border-border px-2 py-0.5 text-xs text-text-3">Leitura proposta · ainda não entra na prioridade</span>
      </div>
      <p className="mt-1 max-w-3xl text-sm text-text-2">{frase}</p>

      <div className="mt-4 grid items-stretch gap-3 md:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)_auto_minmax(0,1fr)]">
        <Bloco rotulo={`Contexto · pesa ${pct(PESO_CONTEXTO)}`} valor={leitura.contextoBase} sub="Juros, PIB, regulação e notícias do setor (a edição atual do Clima), na média das contas." />
        <span aria-hidden className="hidden self-center text-xl text-text-3 md:block">+</span>
        <Bloco rotulo={`Pulso das empresas · pesa ${pct(PESO_PULSO)}`} valor={base.S ?? 0} sub="Crescimento de equipe em 12 meses e contratação ou expansão registradas em 90 dias, na própria base.">
          <ul className="mt-2 grid gap-1 text-xs text-text-2">
            <li className="flex items-center gap-1.5">
              <TrendingUp aria-hidden className="size-3.5 text-ok" strokeWidth={1.75} />
              <span>
                <b className="vr-data font-semibold text-foreground">{base.cresce}</b> crescem · <b className="vr-data font-semibold text-foreground">{base.encolhe}</b> encolhem
              </span>
            </li>
            <li className="flex items-center gap-1.5">
              <Megaphone aria-hidden className="size-3.5 text-text-3" strokeWidth={1.75} />
              <span>
                <b className="vr-data font-semibold text-foreground">{base.comMovimento}</b> contratando ou expandindo ({pct(base.taxaMovimento)})
              </span>
            </li>
          </ul>
        </Bloco>
        <span aria-hidden className="hidden self-center text-xl text-text-3 md:block">=</span>
        <Bloco rotulo="Clima composto" valor={leitura.compostoBase} sub="A leitura que soma os dois. Cada vertical é comparada com esta média: acima dela, o setor favorece; abaixo, pesa." />
      </div>

      <div className="mt-6 grid gap-6 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)]">
        <div className="min-w-0">
          <div className="flex flex-wrap items-baseline justify-between gap-2">
            <Rotulo como="h3">Por vertical: do contexto ao composto</Rotulo>
            <span className="flex flex-wrap items-center gap-x-3 gap-y-1 text-xs text-text-3">
              <span className="flex items-center gap-1">
                <span aria-hidden className="size-3 rounded-full border-2 border-text-3 bg-card" />
                contexto
              </span>
              <span className="flex items-center gap-1">
                <span aria-hidden className="flex">
                  <span className="size-3 rounded-full ring-2 ring-card" style={{ background: 'var(--vr-ok)' }} />
                  <span className="-ml-1 size-3 rounded-full ring-2 ring-card" style={{ background: 'var(--vr-text-2)' }} />
                  <span className="-ml-1 size-3 rounded-full ring-2 ring-card" style={{ background: 'var(--vr-risk)' }} />
                </span>
                composto (bom · neutro · ruim)
              </span>
              <span className="vr-data">−1 · 0 · +1</span>
            </span>
          </div>
          <ul className="mt-2 divide-y divide-border">
            {individuais.map(v => (
              <Linha key={v.id} v={v} />
            ))}
          </ul>
          {pequenas.length > 0 && (
            <p className="mt-2 text-xs text-text-3">
              {pequenas.length} verticais com menos de {MIN_CONTAS_PULSO} contas medidas ({pequenas.map(v => v.nome).join(', ')}) usam o pulso da base: amostra pequena não vira sinal.
            </p>
          )}
        </div>

        <div className="min-w-0">
          <Rotulo como="h3">Contra a maré</Rotulo>
          <p className="mt-1 text-xs text-text-2">
            Crescem 10% ou mais, ou estão contratando ou expandindo, num setor que o contexto lê como negativo. O clima do setor não rebaixa estas contas, e o contraste é argumento de
            abordagem.
          </p>
          <p className="mt-2 text-sm">
            <b className="vr-data text-lg font-semibold">{leitura.totalContraMare}</b> <span className="text-text-2">contas · Tier A primeiro</span>
          </p>
          <ul className="mt-2 grid gap-1.5">
            {leitura.contraMare.map(c => (
              <li key={c.id} className="flex items-center justify-between gap-2 rounded-control border border-border px-2.5 py-1.5">
                <span className="min-w-0">
                  <Link href={hrefConta(c.id)} className="block truncate text-sm font-medium hover:underline">
                    {c.nome}
                  </Link>
                  <span className="block truncate text-xs text-text-3">
                    {c.tier ? `Tier ${c.tier} · ` : ''}
                    {c.vertical}
                  </span>
                </span>
                <span className="flex shrink-0 gap-1">
                  {c.cresce && (
                    <span className="inline-flex items-center gap-1 rounded-chip bg-ok-bg px-1.5 py-0.5 text-xs text-ok">
                      <Users aria-hidden className="size-3" strokeWidth={1.75} />
                      {c.crescimentoPct === null ? 'cresce' : `+${Math.round(c.crescimentoPct)}%`}
                    </span>
                  )}
                  {c.movimento && <span className="rounded-chip bg-secondary px-1.5 py-0.5 text-xs text-text-2">contratando</span>}
                </span>
              </li>
            ))}
          </ul>
        </div>
      </div>

      <details className="mt-6 text-sm">
        <summary className="cursor-pointer text-xs font-semibold text-text-3">Como esta leitura é feita</summary>
        <ol className="mt-2 grid gap-1.5 text-text-2 md:grid-cols-3 md:gap-4">
          <li>
            <b className="font-medium text-foreground">1. Contexto ({pct(PESO_CONTEXTO)})</b>: o Clima como é hoje, com macro, driver setorial e notícias. Hard news tende ao negativo, por
            isso pesa menos.
          </li>
          <li>
            <b className="font-medium text-foreground">2. Pulso ({pct(PESO_PULSO)})</b>: 70% pelo saldo de quem cresce menos quem encolhe (equipe em 12 meses, variações abaixo de 3
            pessoas são ruído) e 30% pela fatia que contrata ou expande em 90 dias, comparada com a base.
          </li>
          <li>
            <b className="font-medium text-foreground">3. Relativo e contra a maré</b>: o que diferencia é estar acima ou abaixo da média da base; uma conta que cresce num setor negativo
            não perde nota pelo setor.
          </li>
        </ol>
      </details>
    </section>
  );
}
