'use client';

import Link from 'next/link';
import { ExternalLink, X } from 'lucide-react';
import { DIMENSOES, LEITURA_CLASSE, ORIGEM, PERGUNTA_DIMENSAO, REGRAS, ROTULO_DIMENSAO, type Dimensao } from '@/lib/prioridade-config';
import { formatarIntegrada, formatarNota, type CriterioClasse, type DimensaoIntegrada, type VisaoIntegradaConta } from '@/lib/prioridade';
import type { LinhaPrioridade } from '@/lib/prioridade-filtros';
import { hrefConta } from '@/lib/contas';
import { cn, dataCurta } from '@/lib/utils';
import { Losango } from './losango';

const nota1 = (v: number) => formatarNota(Math.round(v * 10) / 10);
const MOTIVO: Record<string, string> = {
  nao_coletado: 'Sem avaliação',
  fora_do_intervalo: 'Sem avaliação — dado inconsistente',
  metodo_nao_mapeado: 'Sem avaliação — método ainda não mapeado',
  oculto_modo_apresentacao: 'Indisponível nesta visão',
};

/** Texto da nota de uma dimensão (nunca transforma ausência em número). */
export function textoNota(d: DimensaoIntegrada): string {
  if (d.nota === null) return MOTIVO[d.motivoSemNota ?? 'nao_coletado'] ?? 'Sem avaliação';
  if (d.semAchados) return `${nota1(d.nota)} · sem sinais encontrados`;
  return nota1(d.nota);
}

export function ClasseExperimental({ v, grande = false }: { v: VisaoIntegradaConta; grande?: boolean }) {
  if (!v.classeIntegrada)
    return (
      <span className="text-xs text-text-3">
        {v.situacaoSweetSpot === 'candidata' ? 'Candidata · investigar' : 'Avaliação incompleta'} · {v.cobertura} de 4
      </span>
    );
  return (
    <span className="inline-flex items-baseline gap-1.5">
      <span className="sr-only">Prioridade integrada (experimental)</span>
      <span
        className={cn(
          'vr-data rounded-chip px-1.5 py-0.5 font-semibold',
          grande ? 'text-base' : 'text-xs',
          v.classeIntegrada === 'A1' ? 'bg-ok text-white' : v.classeIntegrada === 'A2' || v.classeIntegrada === 'B1' ? 'bg-ok-bg text-ok' : 'bg-secondary text-text-2',
        )}
      >
        {v.classeIntegrada}
      </span>
      <span className={cn('vr-data', grande ? 'text-base font-semibold' : 'text-xs text-text-2')}>{formatarIntegrada(v.notaIntegrada!)}</span>
    </span>
  );
}

function Checagem({ c }: { c: CriterioClasse }) {
  const valor = c.dimensao === 'nota' ? formatarIntegrada(c.valor) : nota1(c.valor);
  const minimo = c.dimensao === 'nota' ? formatarIntegrada(c.minimo) : nota1(c.minimo);
  return (
    <li className="grid grid-cols-[20px_minmax(0,1fr)] gap-1.5 text-sm">
      <span aria-hidden className={c.atendido ? 'text-ok' : 'text-risk'}>
        {c.atendido ? '✓' : '✗'}
      </span>
      <span>
        <span className="sr-only">{c.atendido ? 'atende: ' : 'não atende: '}</span>
        {c.rotulo} <span className="vr-data">{valor}</span> <span className="text-text-3">(mínimo {minimo})</span>
        {!c.atendido && <span className="text-text-3"> · falta {nota1(Math.max(0.1, c.minimo - c.valor))}</span>}
      </span>
    </li>
  );
}

/** Por que esta classe, e não a de cima: a mesma regra do cálculo, em texto. */
function PorQueClasse({ v }: { v: VisaoIntegradaConta }) {
  if (!v.classeIntegrada || !v.criteriosSweet) return null;
  if (v.classeIntegrada === 'A1') return <p className="text-sm">No topo do sweet spot: atende todos os critérios de A1.</p>;
  const acima = v.classeIntegrada === 'A2' ? 'A1' : 'A2';
  const regra = acima === 'A1' ? REGRAS.A1 : REGRAS.A2;
  const crit: CriterioClasse[] = [
    { rotulo: 'Nota integrada', dimensao: 'nota', atendido: v.notaIntegrada! >= regra.nota - 1e-9, valor: v.notaIntegrada!, minimo: regra.nota },
    ...DIMENSOES.map(d => {
      const n = v.dimensoes[d].nota!;
      return { rotulo: ROTULO_DIMENSAO[d], dimensao: d, atendido: n >= regra.minimos[d] - 1e-9, valor: n, minimo: regra.minimos[d] };
    }),
  ];
  return (
    <div>
      <h3 className="text-sm font-semibold">
        Por que {v.classeIntegrada} e não {acima}?{acima === 'A2' && <span className="font-normal text-text-3"> (entrada do sweet spot)</span>}{v.classeIntegrada === 'A2' && <span className="font-normal text-text-3"> (já no sweet spot; A1 é o topo)</span>}
      </h3>
      {v.classeIntegrada === 'C' && <p className="mt-1 text-sm text-text-2">{v.motivosClassificacao[0]}</p>}
      <ul className="mt-1.5 grid gap-1">
        {crit.map(c => (
          <Checagem key={c.rotulo} c={c} />
        ))}
      </ul>
    </div>
  );
}

function SweetSpot({ v }: { v: VisaoIntegradaConta }) {
  if (v.situacaoSweetSpot === 'sweet_spot') return null;
  if (v.situacaoSweetSpot === 'candidata' && v.investigacao) {
    const i = v.investigacao;
    return (
      <div className="rounded-control border-2 border-ok/50 p-3">
        <h3 className="text-sm font-semibold">Investigar: {ROTULO_DIMENSAO[i.dimensao]}</h3>
        <ul className="mt-1.5 grid gap-1 text-sm">
          <li>
            <span className="text-text-3">Por que falta:</span> {i.motivo ?? 'sem avaliação'}
          </li>
          <li>
            <span className="text-text-3">O que resolveria:</span> {i.evidenciaNecessaria}
          </li>
          {i.notaMinimaParaSweet !== null && (
            <li>
              <span className="text-text-3">Para o sweet spot (A2):</span> {ROTULO_DIMENSAO[i.dimensao]} precisa ser ≥ {nota1(Math.ceil(i.notaMinimaParaSweet * 10 - 1e-6) / 10)}.
            </li>
          )}
          <li className="text-text-2">
            {i.notaMinimaParaA1 !== null
              ? `Para o topo (A1): ≥ ${nota1(Math.ceil(i.notaMinimaParaA1 * 10 - 1e-6) / 10)}.`
              : 'O topo (A1) não é alcançável com as notas que já tem.'}
          </li>
        </ul>
        <p className="mt-2 text-xs text-text-3">A investigação não autoriza abordagem.</p>
      </div>
    );
  }
  return (
    <div>
      <h3 className="text-sm font-semibold">Para chegar ao sweet spot</h3>
      {v.criteriosSweetAtendidos !== null && <p className="mt-1 text-sm">Atende {v.criteriosSweetAtendidos} de 5 critérios de entrada (A2).</p>}
      <ul className="mt-1 grid gap-0.5 text-sm text-text-2">
        {v.motivosClassificacao.map(m => (
          <li key={m}>{v.situacaoSweetSpot === 'fora_por_falta_de_dados' ? `${m}: fora do sweet spot até completar.` : m}</li>
        ))}
      </ul>
    </div>
  );
}

function Notas({ dims }: { dims: Record<Dimensao, DimensaoIntegrada> }) {
  return (
    <dl className="grid gap-2.5">
      {DIMENSOES.map(d => {
        const x = dims[d];
        return (
          <div key={d}>
            <dt className="flex items-baseline justify-between gap-2 text-sm font-medium">
              {ROTULO_DIMENSAO[d]}
              <span className={cn(x.nota === null ? 'text-right text-xs text-text-3' : 'vr-data font-semibold')}>{textoNota(x)}</span>
            </dt>
            <dd className="text-xs text-text-3">
              {x.resumo ?? (x.motivoSemNota === 'metodo_nao_mapeado' && d === 'clima' ? ORIGEM.clima.motivo : PERGUNTA_DIMENSAO[d])}
              {x.status === 'desatualizada' && x.dataReferencia && ` · desatualizado desde ${dataCurta(x.dataReferencia)}, fora do cálculo`}
              {x.pendenciasQualidade.length > 0 && <span className="block text-warm">Pendência: {x.pendenciasQualidade.join('; ')}</span>}
            </dd>
          </div>
        );
      })}
    </dl>
  );
}

/** Painel da conta selecionada: lateral no desktop, tela cheia no celular. */
export function PainelConta({ linha, onFechar }: { linha: LinhaPrioridade; onFechar: () => void }) {
  const v = linha.visao;
  const lacunas = DIMENSOES.filter(d => v.dimensoes[d].nota === null || !v.dimensoes[d].entraNoCalculo).map(d => `${ROTULO_DIMENSAO[d]}: ${textoNota(v.dimensoes[d]).toLowerCase()}`);
  const pendencias = DIMENSOES.flatMap(d => v.dimensoes[d].pendenciasQualidade.map(p => `${ROTULO_DIMENSAO[d]}: ${p}`));
  return (
    <aside
      aria-labelledby="painel-conta-titulo"
      className="fixed inset-0 z-40 overflow-y-auto bg-background p-5 md:inset-y-0 md:right-0 md:left-auto md:w-[440px] md:border-l md:border-border md:shadow-3"
    >
      <div className="flex items-start justify-between gap-3">
        <div className="min-w-0">
          <h2 id="painel-conta-titulo" className="font-display text-xl font-semibold tracking-tight">
            {linha.nome}
          </h2>
          <p className="text-sm text-text-3">{linha.setor ?? 'Sem setor'}</p>
          <p className="mt-1.5 flex flex-wrap items-center gap-2 text-xs text-text-3">
            Prioridade integrada (experimental) <ClasseExperimental v={v} grande />
          </p>
          {v.classeIntegrada && <p className="mt-0.5 text-xs text-text-3">{LEITURA_CLASSE[v.classeIntegrada]}</p>}
        </div>
        <button type="button" onClick={onFechar} aria-label="Fechar o painel" className="grid size-9 shrink-0 place-items-center rounded-control hover:bg-secondary">
          <X className="size-4" strokeWidth={1.5} />
        </button>
      </div>

      <div className="mt-4 flex justify-center">
        <Losango dims={v.dimensoes} tamanho={280} />
      </div>

      <div className="mt-4 grid gap-5">
        <Notas dims={v.dimensoes} />
        <PorQueClasse v={v} />
        <SweetSpot v={v} />
        <div>
          <h3 className="text-sm font-semibold">Por que esta conta?</h3>
          {linha.evidencia ? (
            <p className="mt-1 text-sm">
              {linha.evidencia.texto}
              <span className="text-text-3">
                {' '}
                · {linha.evidencia.fonte ?? 'fonte'}
                {linha.evidencia.data && `, ${dataCurta(linha.evidencia.data)}`}
              </span>
              {linha.evidencia.url && (
                <a href={linha.evidencia.url} target="_blank" rel="noopener noreferrer" className="ml-1 inline-flex items-center gap-0.5 underline decoration-border-strong underline-offset-4">
                  fonte <ExternalLink className="size-3" strokeWidth={1.5} />
                </a>
              )}
            </p>
          ) : (
            <p className="mt-1 text-sm text-text-3">Nenhum fato com fonte registrado nesta conta.</p>
          )}
        </div>
        {(lacunas.length > 0 || pendencias.length > 0) && (
          <div>
            <h3 className="text-sm font-semibold">O que falta validar?</h3>
            <ul className="mt-1 grid gap-0.5 text-sm text-text-2">
              {[...lacunas, ...pendencias].map(t => (
                <li key={t}>{t}</li>
              ))}
            </ul>
          </div>
        )}
        <div>
          <h3 className="text-sm font-semibold">Ação recomendada oficial</h3>
          <p className="mt-1 text-sm">
            {linha.acaoOficial ?? 'Não disponível'}
            {linha.acaoOficial && <span className="text-text-3"> · {linha.acaoDaMatriz ? 'pela matriz ICP × VSCS' : 'gravada pelo motor'}</span>}
          </p>
          <p className="text-xs text-text-3">Regra oficial, separada da classe experimental. Bloqueios e contatos seguem o contrato.</p>
        </div>
        <Link href={hrefConta(linha.contaId)} className="text-sm font-semibold underline decoration-border-strong underline-offset-4">
          Abrir a conta completa
        </Link>
      </div>
    </aside>
  );
}

/** Comparação de até três contas: losangos lado a lado na mesma escala e uma tabela. */
export function Comparacao({ linhas, onTirar }: { linhas: LinhaPrioridade[]; onTirar: (id: string) => void }) {
  if (!linhas.length) return null;
  return (
    <section aria-labelledby="comparacao" className="vr-card mb-4 p-4">
      <h2 id="comparacao" className="text-sm font-semibold">
        Comparação ({linhas.length} de 3)
      </h2>
      <div className="mt-3 grid gap-4 sm:grid-cols-3">
        {linhas.map(l => (
          <div key={l.contaId} className="flex flex-col items-center">
            <div className="flex w-full items-center justify-between gap-2">
              <p className="truncate text-sm font-semibold">{l.nome}</p>
              <button type="button" onClick={() => onTirar(l.contaId)} aria-label={`Tirar ${l.nome} da comparação`} className="grid size-7 place-items-center rounded-control hover:bg-secondary">
                <X className="size-3.5" strokeWidth={1.5} />
              </button>
            </div>
            <Losango dims={l.visao.dimensoes} tamanho={190} compacto />
          </div>
        ))}
      </div>
      <table className="mt-3 w-full text-left text-sm">
        <caption className="sr-only">Notas das contas comparadas</caption>
        <thead className="text-xs text-text-3">
          <tr>
            <th className="py-1 pr-3 font-medium">Conta</th>
            {DIMENSOES.map(d => (
              <th key={d} className="py-1 pr-3 font-medium">
                {ROTULO_DIMENSAO[d]}
              </th>
            ))}
            <th className="py-1 font-medium">Prioridade integrada (experimental)</th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {linhas.map(l => (
            <tr key={l.contaId}>
              <td className="py-1.5 pr-3 font-medium">{l.nome}</td>
              {DIMENSOES.map(d => (
                <td key={d} className={cn('py-1.5 pr-3', l.visao.dimensoes[d].nota === null ? 'text-xs text-text-3' : 'vr-data')}>
                  {l.visao.dimensoes[d].nota === null ? 'Sem avaliação' : textoNota(l.visao.dimensoes[d])}
                </td>
              ))}
              <td className="py-1.5">
                <ClasseExperimental v={l.visao} />
              </td>
            </tr>
          ))}
        </tbody>
      </table>
    </section>
  );
}
