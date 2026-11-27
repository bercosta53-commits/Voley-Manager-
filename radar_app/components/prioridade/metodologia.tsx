'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { CLASSES, DIMENSOES, LEITURA_CLASSE, ORIGEM, REGRAS, ROTULO_DIMENSAO, SELO_MODELO } from '@/lib/prioridade-config';
import { formatarNota } from '@/lib/prioridade';
import { cn } from '@/lib/utils';

const CHAVE = 'vr:prioridade:metodologia-recolhida';
const n = (v: number) => formatarNota(v);

export function SeloExperimental({ className }: { className?: string }) {
  return <span className={cn('rounded-chip border border-border-strong px-1.5 py-0.5 text-xs text-text-2', className)}>{SELO_MODELO}</span>;
}

/** Definição curta ao toque ou ao foco (sem depender de hover). */
function Termo({ termo, definicao }: { termo: string; definicao: string }) {
  return (
    <abbr title={definicao} tabIndex={0} className="cursor-help underline decoration-border-strong decoration-dotted underline-offset-4 focus-visible:outline-2">
      {termo}
    </abbr>
  );
}

const ROTULO_MAPEAMENTO = { documentado: 'Documentado', proposto: 'Proposta experimental', pendente: 'Pendente de mapeamento', indisponivel: 'Indisponível' } as const;

/**
 * "Como ler a prioridade": os cinco passos, escritos a partir da mesma configuração que o cálculo usa
 * (lib/prioridade-config.ts). Recolhido por padrão; lembra se a pessoa abriu.
 */
export function Metodologia({ abrirPedido }: { abrirPedido: number }) {
  const [aberto, setAberto] = useState(false);
  const [regra, setRegra] = useState(false);
  const [origem, setOrigem] = useState(false);
  useEffect(() => {
    try {
      if (localStorage.getItem(CHAVE) === '0') setAberto(true);
    } catch {}
  }, []);
  useEffect(() => {
    if (abrirPedido) setAberto(true);
  }, [abrirPedido]);
  const mudar = (v: boolean) => {
    setAberto(v);
    try {
      localStorage.setItem(CHAVE, v ? '0' : '1');
    } catch {}
  };
  const a1 = REGRAS.A1.minimos;
  const a2 = REGRAS.A2.minimos;

  return (
    <section id="como-funciona" aria-labelledby="como-ler" className="vr-card mb-4 scroll-mt-6">
      <button
        type="button"
        onClick={() => mudar(!aberto)}
        aria-expanded={aberto}
        className="flex w-full flex-wrap items-center justify-between gap-2 px-4 py-3 text-left"
      >
        <h2 id="como-ler" className="text-sm font-semibold">
          Como ler a prioridade
        </h2>
        <span className="flex items-center gap-2">
          <ChevronDown className={cn('size-4 text-text-3 transition-transform', aberto && 'rotate-180')} strokeWidth={1.5} />
        </span>
      </button>
      {aberto && (
        <div className="border-t border-border px-4 py-3 text-sm">
          <ol className="grid gap-2.5">
            {[
              <>
                Quatro perguntas, notas de 1 a 5 (maior = mais oportunidade): {DIMENSOES.map(d => ROTULO_DIMENSAO[d]).join(' · ')}.
              </>,
              <>
                <Termo termo="Nota integrada" definicao="Média simples das quatro notas, sem arredondar antes de classificar." /> = média simples das quatro, só com as quatro avaliadas.
              </>,
              <>
                <Termo termo="Travas" definicao="Mínimos que nenhuma média alta compensa." />: ICP abaixo de {n(REGRAS.C.icpAbaixoDe)} vira C. Para A: ICP ≥ {n(a1.icp)}, Sinais ≥ {n(a2.sinais)} (A2) ou ≥ {n(a1.sinais)} (A1), Oportunidade digital ≥ {n(a1.oportunidadeDigital)}. Clima não tem mínimo: é contexto e pesa metade na média (27/11).
              </>,
              <>
                Classe: A1 e A2 formam o <Termo termo="sweet spot" definicao="Contas A1 ou A2: os quatro eixos convergem e os mínimos de A são atendidos. A1 é o topo." /> (A1 é o topo) · B1 boa · B2 monitorar · C baixa prioridade.
              </>,
              <>
                Sem evidência = &quot;Sem avaliação&quot;, nunca vira nota nem entra na média. Falta 1 dimensão: a conta é classificada pelas outras três (média e mínimos das três) e a faltante vira investigação. Faltam 2 ou mais: fica sem métrica até completar.
              </>,
            ].map((t, i) => (
              <li key={i} className="grid grid-cols-[22px_minmax(0,1fr)] gap-2">
                <span className="vr-data grid size-5 place-items-center rounded-full bg-secondary text-xs font-semibold" aria-hidden>
                  {i + 1}
                </span>
                <span>{t}</span>
              </li>
            ))}
          </ol>
          <p className="mt-3 text-xs text-text-3">
            Esta classe não autoriza abordagem. Elegibilidade e contatos seguem o contrato oficial (VSCS, Tier ICP, Conta Qualificada).
          </p>
          <div className="mt-2 flex flex-wrap gap-3 text-sm">
            <button type="button" onClick={() => setRegra(v => !v)} aria-expanded={regra} className="font-medium underline decoration-border-strong underline-offset-4">
              {regra ? 'Esconder a regra completa' : 'Ver regra completa'}
            </button>
            <button type="button" onClick={() => setOrigem(v => !v)} aria-expanded={origem} className="font-medium underline decoration-border-strong underline-offset-4">
              {origem ? 'Esconder a origem das notas' : 'Ver origem de cada nota'}
            </button>
          </div>
          {regra && (
            <table className="mt-3 w-full text-left text-sm">
              <caption className="sr-only">Regras de classe, na ordem em que são aplicadas</caption>
              <thead className="text-xs text-text-3">
                <tr>
                  <th className="py-1 pr-3 font-medium">Ordem</th>
                  <th className="py-1 pr-3 font-medium">Classe</th>
                  <th className="py-1 pr-3 font-medium">Regra</th>
                  <th className="py-1 font-medium">Leitura</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {[
                  ['C', `ICP < ${n(REGRAS.C.icpAbaixoDe)} OU nota integrada < ${n(REGRAS.C.notaAbaixoDe)}`],
                  ['A1', `Nota ≥ ${n(REGRAS.A1.nota)} E ICP ≥ ${n(a1.icp)} E Sinais ≥ ${n(a1.sinais)} E Oportunidade digital ≥ ${n(a1.oportunidadeDigital)}`],
                  ['A2', `Nota ≥ ${n(REGRAS.A2.nota)} E ICP ≥ ${n(a2.icp)} E Sinais ≥ ${n(a2.sinais)} E Oportunidade digital ≥ ${n(a2.oportunidadeDigital)}`],
                  ['B1', `Nota ≥ ${n(REGRAS.B1.nota)}`],
                  ['B2', 'Demais avaliações completas'],
                ].map(([c, r], i) => (
                  <tr key={c}>
                    <td className="vr-data py-1.5 pr-3">{i + 1}</td>
                    <td className="py-1.5 pr-3 font-semibold">{c}</td>
                    <td className="py-1.5 pr-3">{r}</td>
                    <td className="py-1.5 text-text-2">{LEITURA_CLASSE[c as (typeof CLASSES)[number]]}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          )}
          {origem && (
            <table className="mt-3 w-full text-left text-sm">
              <caption className="sr-only">Origem de cada nota: método original e escala visual</caption>
              <thead className="text-xs text-text-3">
                <tr>
                  <th className="py-1 pr-3 font-medium">Eixo</th>
                  <th className="py-1 pr-3 font-medium">Fonte no projeto</th>
                  <th className="py-1 pr-3 font-medium">Escala original</th>
                  <th className="py-1 pr-3 font-medium">Transformação</th>
                  <th className="py-1 font-medium">Estado</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {DIMENSOES.map(d => {
                  const o = ORIGEM[d];
                  return (
                    <tr key={d}>
                      <td className="py-1.5 pr-3 font-medium">{ROTULO_DIMENSAO[d]}</td>
                      <td className="py-1.5 pr-3 text-text-2">{o.campoOrigem ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-text-2">{o.escalaOriginal ?? '—'}</td>
                      <td className="py-1.5 pr-3 text-text-2">{o.transformacao ?? ('motivo' in o ? o.motivo : '—')}</td>
                      <td className="py-1.5">{ROTULO_MAPEAMENTO[o.mapeamento]}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          )}
        </div>
      )}
    </section>
  );
}
