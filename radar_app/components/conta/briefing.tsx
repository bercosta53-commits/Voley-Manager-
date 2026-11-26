'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { Check, ChevronLeft, Copy, ExternalLink, Info, Printer, Zap } from 'lucide-react';
import type { BaseCasca } from '@/lib/casca-dados';
import type { Conta, Sinal } from '@/lib/tipos';
import { Casca } from '@/components/casca/casca';
import { Button } from '@/components/ui/button';
import { useHoje } from '@/components/ui/use-agora';
import { hrefConta } from '@/lib/contas';
import { briefingEmTexto, montarBriefing, type Linha } from '@/lib/briefing';
import { detectarPlaybook } from '@/lib/playbooks';
import { dataCurta } from '@/lib/utils';

/**
 * Briefing de reunião (P3-6): uma página para levar à conversa, com cada fato ligado à fonte. Imprime limpo
 * (a casca sai do papel) e copia em texto com as fontes numeradas.
 */
export function TelaBriefing({ base }: { base: BaseCasca & { conta: Conta; sinaisDaConta: Sinal[] } }) {
  const { conta, sinaisDaConta } = base;
  const dataCarga = (base.atualizadoEm ?? base.geradoEm).slice(0, 10);
  const hoje = useHoje(base.atualizadoEm ?? base.geradoEm);
  const b = useMemo(() => {
    const acionaveis = sinaisDaConta.filter(s => s.tipo !== 'noticia_setorial');
    return montarBriefing(conta, sinaisDaConta, { dataCarga, hoje, playbook: detectarPlaybook(acionaveis, dataCarga) });
  }, [conta, sinaisDaConta, dataCarga, hoje]);
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(briefingEmTexto(b));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  }

  return (
    <Casca base={base}>
      <main className="w-full max-w-[860px] px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16 print:max-w-none print:p-0">
        <Link href={hrefConta(conta.id)} className="mb-4 inline-flex min-h-6 items-center gap-1 text-sm text-text-3 hover:text-foreground md:mb-6 print:hidden">
          <ChevronLeft className="size-4" strokeWidth={1.5} /> {conta.nome}
        </Link>

        <header className="flex flex-wrap items-end justify-between gap-4 border-b border-border pb-5">
          <div className="min-w-0">
            <p className="text-xs font-semibold tracking-wide text-text-3 uppercase">Briefing de reunião</p>
            <h1 className="font-display text-3xl font-semibold tracking-tight">{conta.nome}</h1>
            <p className="mt-1 text-sm text-text-3">
              Dados de {dataCurta(b.dataCarga)} · gerado em {dataCurta(b.geradoEm)} · cada fato tem o número da fonte
            </p>
          </div>
          <div className="flex gap-2 print:hidden">
            <Button variant="secondary" size="sm" onClick={() => window.print()}>
              <Printer /> Imprimir
            </Button>
            <Button variant="primary" size="sm" onClick={copiar}>
              {copiado ? <Check /> : <Copy />}
              {copiado ? 'Copiado' : 'Copiar texto'}
            </Button>
          </div>
        </header>

        <div className="mt-6 grid gap-8">
          {b.empresa.length > 0 && (
            <Secao titulo="A empresa">
              <Linhas linhas={b.empresa} />
            </Secao>
          )}

          <Secao titulo="O que aconteceu" vazio={b.fatos.length ? undefined : 'Nenhum fato com fonte nos últimos 120 dias.'}>
            {b.fatos.length > 0 && (
              <ol className="relative grid gap-4 border-l border-border pl-5">
                {b.fatos.map((l, i) => (
                  <li key={i} className="relative">
                    <span aria-hidden className="absolute top-1.5 -left-[25px] size-2.5 rounded-full border-2 border-card bg-warm" />
                    <p className="vr-data text-xs text-text-3">{l.data && dataCurta(l.data)}</p>
                    <p className="font-medium">
                      {l.texto}
                      <Cita ns={l.fontes} />
                    </p>
                    {l.detalhe && <p className="text-sm text-text-3">{l.detalhe}</p>}
                  </li>
                ))}
              </ol>
            )}
          </Secao>

          {b.momento.length > 0 && (
            <Secao titulo="Momento">
              <Linhas linhas={b.momento} />
            </Secao>
          )}

          <Secao titulo="Pessoas" vazio={!b.pessoas.length && !b.faltando.length ? 'Ninguém mapeado no comitê ainda.' : undefined}>
            {b.pessoas.length > 0 && <Linhas linhas={b.pessoas} />}
            {b.faltando.length > 0 && <p className="mt-3 text-sm text-text-2">Ainda sem nome no comitê: {b.faltando.join(', ')}.</p>}
          </Secao>

          {b.roteiro.base && (
            <section aria-label="Roteiro" className="rounded-card border border-border bg-warm-bg/40 p-5 break-inside-avoid">
              <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
                <h2 className="flex items-center gap-1.5 text-sm font-semibold">
                  {b.roteiro.playbook && <Zap aria-hidden className="size-4 text-warm" strokeWidth={2} />}
                  Roteiro{b.roteiro.playbook ? `: ${b.roteiro.playbook}` : ''}
                </h2>
                <span className="rounded-chip border border-border bg-card px-1.5 py-0.5 text-xs text-text-2">recomendação do Radar, não é fato</span>
              </div>
              <dl className="grid gap-3 text-sm sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-x-4">
                {b.roteiro.leitura && <Par rotulo="Leitura">{b.roteiro.leitura}</Par>}
                {b.roteiro.angulo && <Par rotulo="Ângulo">{b.roteiro.angulo}</Par>}
                {b.roteiro.perguntas.length > 0 && (
                  <Par rotulo="Perguntar">
                    <ul className="grid gap-1">
                      {b.roteiro.perguntas.map(p => (
                        <li key={p}>“{p}”</li>
                      ))}
                    </ul>
                  </Par>
                )}
                {b.roteiro.evitar && <Par rotulo="Evitar">{b.roteiro.evitar}</Par>}
                {b.roteiro.ofertas.length > 0 && <Par rotulo="Velora oferece">{b.roteiro.ofertas.join(' · ')}</Par>}
              </dl>
            </section>
          )}

          <Secao titulo="Fontes">
            <ol className="grid gap-1.5 text-sm">
              {b.fontes.map(f => (
                <li key={f.n} id={`fonte-${f.n}`} className="flex gap-2">
                  <span className="vr-data w-7 shrink-0 text-text-3">[{f.n}]</span>
                  <span className="min-w-0">
                    {f.url ? (
                      <a href={f.url} target="_blank" rel="noreferrer" className="inline-flex items-center gap-1 underline decoration-border-strong underline-offset-4">
                        {f.rotulo}
                        <ExternalLink aria-hidden className="size-3.5 print:hidden" strokeWidth={1.5} />
                      </a>
                    ) : (
                      f.rotulo
                    )}
                    {f.data && !f.rotulo.includes(f.data.split('-').reverse().join('/')) && <span className="text-text-3"> · {dataCurta(f.data)}</span>}
                    {f.url && <span className="hidden break-all text-xs text-text-3 print:block">{f.url}</span>}
                  </span>
                </li>
              ))}
            </ol>
          </Secao>

          <p className="flex items-start gap-1.5 text-xs text-text-3">
            <Info aria-hidden className="mt-0.5 size-3.5 shrink-0" strokeWidth={1.5} />
            Sem e-mail, telefone ou LinkedIn das pessoas: o briefing pode ser impresso e encaminhado. Fato sem fonte não entra.
          </p>
        </div>
      </main>
    </Casca>
  );
}

function Secao({ titulo, vazio, children }: { titulo: string; vazio?: string; children?: React.ReactNode }) {
  return (
    <section aria-label={titulo} className="break-inside-avoid">
      <h2 className="mb-3 text-xs font-semibold tracking-wide text-text-3 uppercase">{titulo}</h2>
      {vazio ? <p className="text-sm text-text-3">{vazio}</p> : children}
    </section>
  );
}

function Linhas({ linhas }: { linhas: Linha[] }) {
  return (
    <ul className="grid gap-2">
      {linhas.map((l, i) => (
        <li key={i}>
          <span>{l.texto}</span>
          <Cita ns={l.fontes} />
          {l.detalhe && <span className="block text-sm text-text-3">{l.detalhe}</span>}
        </li>
      ))}
    </ul>
  );
}

function Cita({ ns }: { ns: number[] }) {
  return (
    <sup className="ml-0.5 whitespace-nowrap">
      {ns.map(n => (
        <a key={n} href={`#fonte-${n}`} className="vr-data px-0.5 text-[12px] text-text-3 no-underline hover:text-foreground">
          [{n}]
        </a>
      ))}
    </sup>
  );
}

function Par({ rotulo, children }: { rotulo: string; children: React.ReactNode }) {
  return (
    <>
      <dt className="text-text-3">{rotulo}</dt>
      <dd className="min-w-0 max-sm:-mt-2">{children}</dd>
    </>
  );
}
