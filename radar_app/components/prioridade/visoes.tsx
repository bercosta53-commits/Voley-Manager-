'use client';

import Link from 'next/link';
import { DIMENSOES, ROTULO_CURTO, ROTULO_DIMENSAO, type Dimensao } from '@/lib/prioridade-config';
import { formatarNota } from '@/lib/prioridade';
import type { LinhaPrioridade, Segmento } from '@/lib/prioridade-filtros';
import { COLUNAS_MATRIZ, FAIXAS_NOTA, cruzar, quadrante, resumoSetor, setorPorPrioridade } from '@/lib/prioridade-visoes';
import { cn } from '@/lib/utils';

/** Intensidade só reforça; o número em texto é a informação. */
const tom = (n: number, max: number) => (n ? { background: `color-mix(in srgb, var(--vr-ok) ${Math.round(8 + (32 * n) / Math.max(1, max))}%, transparent)` } : undefined);

export function MatrizSetorPrioridade({
  linhas,
  ordem,
  onOrdem,
  onCelula,
}: {
  linhas: LinhaPrioridade[];
  ordem: 'a1' | 'candidata' | 'nome';
  onOrdem: (o: 'a1' | 'candidata' | 'nome') => void;
  onCelula: (setor: string, seg: Segmento | null) => void;
}) {
  const m = setorPorPrioridade(linhas, ordem);
  const max = Math.max(1, ...m.linhas.flatMap(r => Object.values(r.celulas)));
  return (
    <section aria-labelledby="matriz-setor" className="vr-card overflow-x-auto p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="matriz-setor" className="text-sm font-semibold">
          Setor × Prioridade ({m.total} contas no recorte)
        </h2>
        <label className="flex items-center gap-1.5 text-sm text-text-2">
          Ordenar por
          <select value={ordem} onChange={e => onOrdem(e.target.value as 'a1' | 'candidata' | 'nome')} className="rounded-control border border-border bg-card px-1.5 py-1">
            <option value="a1">mais no sweet spot</option>
            <option value="candidata">mais candidatas</option>
            <option value="nome">nome do setor</option>
          </select>
        </label>
      </div>
      <table className="w-full min-w-[760px] text-sm">
        <caption className="sr-only">Contas por setor e por prioridade integrada (experimental). Clicar numa célula filtra a lista.</caption>
        <thead className="text-xs text-text-3">
          <tr>
            <th scope="col" className="py-1.5 pr-3 text-left font-medium">
              Setor
            </th>
            {COLUNAS_MATRIZ.map(c => (
              <th key={c.id} scope="col" className="px-1.5 py-1.5 text-center font-medium">
                {c.rotulo}
              </th>
            ))}
            <th scope="col" className="px-1.5 py-1.5 text-right font-medium">
              Total
            </th>
          </tr>
        </thead>
        <tbody className="divide-y divide-border">
          {m.linhas.map(r => (
            <tr key={r.setor}>
              <th scope="row" className="py-1 pr-3 text-left font-medium">
                <button type="button" onClick={() => onCelula(r.setor, null)} className="hover:underline">
                  {r.setor}
                </button>
              </th>
              {COLUNAS_MATRIZ.map(c => {
                const n = r.celulas[c.id];
                return (
                  <td key={c.id} className="p-0.5 text-center">
                    <button
                      type="button"
                      disabled={!n}
                      onClick={() => onCelula(r.setor, c.id)}
                      aria-label={`${r.setor}, ${c.rotulo}: ${n} ${n === 1 ? 'conta' : 'contas'}`}
                      style={tom(n, max)}
                      className={cn('vr-data h-8 w-full rounded-chip text-sm', n ? 'font-semibold hover:ring-1 hover:ring-foreground' : 'text-text-3')}
                    >
                      {n}
                    </button>
                  </td>
                );
              })}
              <td className="vr-data px-1.5 text-right font-semibold">{r.total}</td>
            </tr>
          ))}
        </tbody>
        <tfoot className="border-t border-border-strong text-xs">
          <tr>
            <th scope="row" className="py-1.5 pr-3 text-left font-medium">
              Total
            </th>
            {COLUNAS_MATRIZ.map(c => (
              <td key={c.id} className="vr-data px-1.5 text-center font-semibold">
                {m.totaisColuna[c.id]}
              </td>
            ))}
            <td className="vr-data px-1.5 text-right font-semibold">{m.total}</td>
          </tr>
        </tfoot>
      </table>
      <p className="mt-2 text-xs text-text-3">Contagens descritivas: não criam nota do setor nem classe nova.</p>
    </section>
  );
}

export function CruzarDimensoes({
  linhas,
  x,
  y,
  onEixos,
  onCelula,
}: {
  linhas: LinhaPrioridade[];
  x: Dimensao;
  y: Dimensao;
  onEixos: (x: Dimensao, y: Dimensao) => void;
  onCelula: (fx: number, fy: number) => void;
}) {
  const c = cruzar(linhas, x, y);
  const max = Math.max(1, ...Object.values(c.celulas).flatMap(r => Object.values(r)));
  const Seletor = ({ valor, outro, rotulo, onMudar }: { valor: Dimensao; outro: Dimensao; rotulo: string; onMudar: (d: Dimensao) => void }) => (
    <label className="flex items-center gap-1.5 text-sm text-text-2">
      {rotulo}
      <select value={valor} onChange={e => onMudar(e.target.value as Dimensao)} className="rounded-control border border-border bg-card px-1.5 py-1">
        {DIMENSOES.filter(d => d !== outro).map(d => (
          <option key={d} value={d}>
            {ROTULO_DIMENSAO[d]}
          </option>
        ))}
      </select>
    </label>
  );
  return (
    <section aria-labelledby="cruzar" className="vr-card p-4">
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 id="cruzar" className="text-sm font-semibold">
          Cruzar duas dimensões ({c.total} contas no recorte)
        </h2>
        <div className="flex flex-wrap gap-3">
          <Seletor rotulo="Horizontal (X)" valor={x} outro={y} onMudar={d => onEixos(d, y)} />
          <Seletor rotulo="Vertical (Y)" valor={y} outro={x} onMudar={d => onEixos(x, d)} />
        </div>
      </div>
      <div className="overflow-x-auto">
        <table className="mx-auto text-sm">
          <caption className="sr-only">
            Contas por faixa de {ROTULO_DIMENSAO[x]} (colunas) e {ROTULO_DIMENSAO[y]} (linhas). Clicar numa célula filtra a lista.
          </caption>
          <thead className="text-xs text-text-3">
            <tr>
              <th scope="col" className="px-2 py-1 text-right font-medium">
                {ROTULO_CURTO[y]} ↓ · {ROTULO_CURTO[x]} →
              </th>
              {FAIXAS_NOTA.map(f => (
                <th key={f.id} scope="col" className="px-2 py-1 font-medium">
                  {f.rotulo}
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {[...FAIXAS_NOTA].reverse().map(fy => (
              <tr key={fy.id}>
                <th scope="row" className="px-2 py-1 text-right text-xs font-medium text-text-3">
                  {fy.rotulo}
                </th>
                {FAIXAS_NOTA.map(fx => {
                  const n = c.celulas[fy.id]![fx.id]!;
                  const q = quadrante(x, y, fx.id, fy.id);
                  return (
                    <td key={fx.id} className="p-0.5">
                      <button
                        type="button"
                        disabled={!n}
                        onClick={() => onCelula(fx.id, fy.id)}
                        aria-label={`${q}: ${n} ${n === 1 ? 'conta' : 'contas'}`}
                        title={q}
                        style={tom(n, max)}
                        className={cn('vr-data grid h-14 w-20 place-items-center rounded-chip text-base sm:w-28', n ? 'font-semibold hover:ring-1 hover:ring-foreground' : 'text-text-3')}
                      >
                        {n}
                      </button>
                    </td>
                  );
                })}
              </tr>
            ))}
          </tbody>
        </table>
      </div>
      <div className="mt-3 flex flex-wrap justify-center gap-x-6 gap-y-1 text-xs text-text-3">
        <span>
          Alto à direita e em cima: {ROTULO_CURTO[x]} e {ROTULO_CURTO[y]} de 3 a 5.
        </span>
        <span className="font-medium text-text-2">
          Sem avaliação em {ROTULO_CURTO[x]} ou {ROTULO_CURTO[y]}: {c.semAvaliacao}
        </span>
      </div>
    </section>
  );
}

/** Uma linha acima da lista quando exatamente um setor está filtrado: médias só das avaliadas, sempre com o n. */
export function ResumoDoSetor({ linhas, setor }: { linhas: LinhaPrioridade[]; setor: string }) {
  const r = resumoSetor(linhas, setor);
  return (
    <p className="vr-card mb-3 flex flex-wrap items-center gap-x-4 gap-y-1 px-4 py-2.5 text-sm">
      <span className="font-semibold">{setor}</span>
      <span className="text-text-3">{r.contas} contas no recorte</span>
      {DIMENSOES.filter(d => d !== 'clima').map(d => (
        <span key={d}>
          {ROTULO_CURTO[d]}{' '}
          {r.medias[d].media !== null ? (
            <span className="vr-data font-semibold">{formatarNota(Math.round(r.medias[d].media! * 10) / 10)}</span>
          ) : (
            <span className="text-text-3">sem avaliação</span>
          )}
          <span className="text-text-3">
            {' '}
            · {r.medias[d].n} de {r.contas}
          </span>
        </span>
      ))}
      <span className="text-text-3">
        Clima do setor: indisponível (vínculo com a vertical do Clima pendente) ·{' '}
        <Link href="/clima" className="underline decoration-border-strong underline-offset-4">
          ver Clima
        </Link>
      </span>
    </p>
  );
}
