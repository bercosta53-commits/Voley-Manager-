'use client';

import Link from 'next/link';
import { BARREIRAS, FAIXAS_CICLO, GATILHOS, type simular } from '@/lib/icp';
import { hrefConta } from '@/lib/contas';
import { cn } from '@/lib/utils';
import { COR_TIER_ICP } from './simulador';

type Linha = ReturnType<typeof simular>['linhas'][number];
export type EscopoGat = 'A' | 'AB' | 'all';

/** Oferta → barreiras típicas e faixa de ciclo (mesma tabela de lib/icp.ts, para a matriz da oferta). */
function Alternar<T extends string>({ opcoes, valor, onMudar, rotulo }: { opcoes: [T, string][]; valor: T; onMudar: (v: T) => void; rotulo: string }) {
  return (
    <div role="group" aria-label={rotulo} className="flex rounded-control bg-[var(--vr-bg)] p-0.5">
      {opcoes.map(([v, r]) => (
        <button key={v} type="button" aria-pressed={valor === v} onClick={() => onMudar(v)} className={cn('h-8 rounded-chip px-3 text-xs font-semibold', valor === v ? 'bg-[var(--vr-surface-3)] text-foreground' : 'text-text-3 hover:text-foreground')}>
          {r}
        </button>
      ))}
    </div>
  );
}

export { Alternar };

function Ponto({ sim, incompleto, titulo, extra }: { sim: boolean; incompleto?: boolean; titulo: string; extra?: boolean }) {
  return (
    <span
      title={titulo}
      className="size-3.5 rounded-full border-2"
      style={{
        background: sim ? 'var(--vr-ok)' : 'transparent',
        borderColor: sim ? 'var(--vr-ok)' : extra ? 'var(--vr-warm)' : 'var(--vr-border-strong)',
        borderStyle: incompleto || extra ? 'dashed' : 'solid',
      }}
    />
  );
}

export function Gatilhos({
  linhas,
  escopo,
  onEscopo,
  sel,
  onSel,
}: {
  linhas: Linha[];
  escopo: EscopoGat;
  onEscopo: (e: EscopoGat) => void;
  sel: number;
  onSel: (g: number) => void;
}) {
  const pool = escopo === 'A' ? linhas.filter(l => l.tier === 'A') : escopo === 'AB' ? linhas.filter(l => l.tier !== 'C') : linhas;
  const tot = Math.max(1, pool.length);
  const pct = (n: number) => `${Math.round((100 * n) / tot)}%`;
  // histograma: contas por nº de gatilhos, empilhado por tier
  const hist = [0, 1, 2, 3, 4, 5].map(k => {
    const l = pool.filter(a => a.gatilhos.size === k);
    return { k, n: l.length, A: l.filter(a => a.tier === 'A').length, B: l.filter(a => a.tier === 'B').length, C: l.filter(a => a.tier === 'C').length };
  });
  const hmax = Math.max(1, ...hist.map(h => h.n));
  const comax = Math.max(1, ...GATILHOS.map(g => pool.filter(a => a.gatilhos.has(g.id)).length));
  const gSel = GATILHOS.find(g => g.id === sel) ?? GATILHOS[0];
  const top = pool
    .filter(a => a.gatilhos.has(gSel.id))
    .sort((x, y) => y.gatilhos.size - x.gatilhos.size || y.conta.score - x.conta.score)
    .slice(0, 12);

  // G3: ciclo por oferta
  const porOferta = new Map<string, Linha[]>();
  for (const a of pool) if (a.ciclo) porOferta.set(a.segmento, [...(porOferta.get(a.segmento) ?? []), a]);
  const ofertas = [...porOferta.entries()].sort((x, y) => Math.max(...y[1].map(a => a.ciclo)) - Math.max(...x[1].map(a => a.ciclo)) || y[1].length - x[1].length);
  const dist = [...FAIXAS_CICLO.map(f => ({ ...f, n: pool.filter(a => a.ciclo === f.band).length })), { band: 0, rotulo: 'Sem leitura', prazo: 'sem segmento', cor: 'var(--vr-border-strong)', n: pool.filter(a => !a.ciclo).length }];

  return (
    <section aria-labelledby="gat-t" className="vr-card flex flex-col gap-4.5 p-5.5">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 id="gat-t" className="font-display text-xl font-semibold">
            Gatilhos comportamentais
          </h2>
          <p className="mt-0.5 max-w-[760px] text-sm text-text-3">
            Como a empresa vende hoje, não só o que ela é. Cada gatilho é uma dor que o diagnóstico da Velora resolve. Clique num gatilho para ver as contas que batem.
          </p>
        </div>
        <Alternar rotulo="Escopo dos gatilhos" valor={escopo} onMudar={onEscopo} opcoes={[['A', 'Tier A simulado'], ['AB', 'Tiers A e B'], ['all', 'Toda a base']]} />
      </div>

      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-5">
        {GATILHOS.map(g => {
          const n = pool.filter(a => a.gatilhos.has(g.id)).length;
          const baixo = pool.filter(a => a.incompletos.has(g.id)).length / tot;
          const conf = g.id === 3 ? 'média · deduzido da oferta' : baixo > 0.4 ? `baixa · ${Math.round(baixo * 100)}% sem dado completo` : baixo > 0.15 ? `média · ${Math.round(baixo * 100)}% sem dado completo` : 'alta';
          const corConf = conf.startsWith('baixa') ? 'var(--vr-risk)' : conf.startsWith('média') ? 'var(--vr-warm)' : 'var(--vr-ok)';
          const on = sel === g.id;
          return (
            <button
              key={g.id}
              type="button"
              aria-pressed={on}
              onClick={() => onSel(g.id)}
              className={cn('flex flex-col gap-2 rounded-card border p-4 text-left', on ? 'border-ok bg-ok-bg/50' : 'border-border bg-[var(--vr-surface-2)] hover:border-border-strong')}
            >
              <span className="flex items-center justify-between gap-2">
                <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: g.tag === 'Sugestão' ? 'var(--vr-cool)' : 'var(--vr-ok)' }}>
                  {g.tag}
                </span>
                <span className="vr-data text-[11px] text-text-3">G{g.id}</span>
              </span>
              <span className="text-md leading-snug font-bold">{g.nome}</span>
              <span className="text-xs text-text-2">{g.def}</span>
              <span className="mt-0.5 flex items-baseline gap-2">
                <span className="vr-data text-2xl font-semibold">{n}</span>
                <span className="text-xs text-text-3">{pct(n)} do escopo</span>
              </span>
              <span className="block h-1.5 overflow-hidden rounded-full bg-[var(--vr-surface-3)]">
                <span className="block h-1.5 bg-ok transition-[width] duration-300" style={{ width: pct(n) }} />
              </span>
              <span className="text-[11px] text-text-3">
                <span className="font-semibold text-foreground">Como medimos:</span> {g.como}
              </span>
              <span className="text-[11px]" style={{ color: corConf }}>
                Confiança {conf}
              </span>
            </button>
          );
        })}
      </div>

      <div className="flex flex-wrap gap-6">
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5">
          <div className="text-sm font-bold">Quantos gatilhos cada conta acumula</div>
          <svg viewBox="0 0 360 230" className="w-full" role="img" aria-label={`Contas por número de gatilhos: ${hist.map(h => `${h.k} gatilhos ${h.n}`).join(', ')}`}>
            <line x1={30} y1={190} x2={356} y2={190} stroke="var(--vr-border-strong)" />
            {hist.map((h, i) => {
              const x = 40 + i * 53;
              const hC = (h.C / hmax) * 160;
              const hB = (h.B / hmax) * 160;
              const hA = (h.A / hmax) * 160;
              return (
                <g key={h.k}>
                  <title>{`${h.k} gatilhos: ${h.n} contas (A ${h.A}, B ${h.B}, C ${h.C})`}</title>
                  <rect x={x} y={190 - hC} width={40} height={hC} fill={COR_TIER_ICP.C} />
                  <rect x={x} y={190 - hC - hB} width={40} height={hB} fill={COR_TIER_ICP.B} />
                  <rect x={x} y={190 - hC - hB - hA} width={40} height={hA} fill={COR_TIER_ICP.A} />
                  <text x={x + 20} y={184 - hA - hB - hC} textAnchor="middle" className="vr-data fill-foreground text-[12px]">
                    {h.n}
                  </text>
                  <text x={x + 20} y={208} textAnchor="middle" className="vr-data fill-text-3 text-[12px]">
                    {h.k}
                  </text>
                </g>
              );
            })}
            <text x={193} y={226} textAnchor="middle" className="fill-text-3 text-[11px]">
              nº de gatilhos (cor = tier no simulador)
            </text>
          </svg>
        </div>
        <div className="flex min-w-0 flex-[1_1_340px] flex-col gap-2.5">
          <div className="text-sm font-bold">Quais gatilhos andam juntos</div>
          <div className="grid gap-[3px] text-[11px]" style={{ gridTemplateColumns: '120px repeat(5, minmax(0, 1fr))' }}>
            <div />
            {GATILHOS.map(g => (
              <div key={g.id} className="py-1 text-center font-semibold text-text-3">
                {g.curto}
              </div>
            ))}
            {GATILHOS.map(r => (
              <Linhas key={r.id} r={r} pool={pool} comax={comax} />
            ))}
          </div>
          <div className="text-[11px] text-text-3">Diagonal = contas com o gatilho. Fora dela = contas com os dois.</div>
        </div>
      </div>

      <div className="flex flex-col gap-3.5 rounded-card bg-[var(--vr-surface-2)] p-4.5">
        <div>
          <div className="text-md font-bold">G3 por dentro: a oferta define as barreiras de compra</div>
          <div className="text-sm text-text-3">
            Outsourcing exige homologação do fornecedor; cibersegurança exige compliance forte do parceiro. Cliente regulado, enterprise ou governo soma barreiras e alonga o ciclo.
          </div>
        </div>
        <div>
          <div className="flex h-6.5 overflow-hidden rounded-control bg-[var(--vr-surface-3)]" role="img" aria-label="Distribuição do ciclo deduzido no escopo">
            {dist.map(d => (
              <div key={d.rotulo} title={`${d.rotulo} · ${d.prazo} · ${d.n} contas`} className="transition-[width] duration-300" style={{ width: `${(100 * d.n) / tot}%`, background: d.cor }} />
            ))}
          </div>
          <div className="mt-2 flex flex-wrap gap-3.5 text-xs text-text-2">
            {dist.map(d => (
              <span key={d.rotulo} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px]" style={{ background: d.cor }} />
                {d.rotulo} <span className="text-text-3">{d.prazo}</span> <span className="vr-data text-foreground">{d.n}</span>
              </span>
            ))}
          </div>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[820px] items-center gap-x-1.5 gap-y-0.5 text-xs" style={{ gridTemplateColumns: '250px repeat(5, minmax(0, 1fr)) 110px 80px' }}>
            <div className="py-1 font-semibold text-text-3">Oferta</div>
            {BARREIRAS.map(b => (
              <div key={b.bit} title={b.dica} className="text-center leading-tight font-semibold text-text-3">
                {b.rotulo}
                <br />
                <span className="vr-data text-text-2">{pool.filter(a => a.barreiras & b.bit).length}</span>
              </div>
            ))}
            <div className="font-semibold text-text-3">Ciclo típico</div>
            <div className="text-right font-semibold text-text-3">Contas</div>
            {ofertas.map(([seg, l]) => {
              const tipico = Math.max(...l.map(a => a.ciclo));
              const faixa = FAIXAS_CICLO[tipico - 1];
              const comum = l.reduce((m, a) => m & a.barreiras, 31);
              return (
                <Oferta key={seg} seg={seg} l={l} comum={comum} faixa={faixa} />
              );
            })}
          </div>
        </div>
        <div className="text-[11px] text-text-3">
          Ponto cheio = barreira típica da oferta · tracejado âmbar = aparece em parte das contas por causa do cliente atendido. Faixas de ciclo são hipótese para calibrar com as primeiras conversas.
        </div>
      </div>

      <div className="flex flex-col gap-2">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <span className="text-sm font-bold">Contas que mais batem · {gSel.nome.toLowerCase()}</span>
          <span className="text-xs text-text-3">ponto cheio = bate · contorno tracejado = medição incompleta</span>
        </div>
        <div className="overflow-x-auto">
          <div className="grid min-w-[860px] items-center gap-x-1 gap-y-0.5 text-xs" style={{ gridTemplateColumns: '240px repeat(5, minmax(0, 1fr)) 110px 60px 60px' }}>
            <div className="py-1 font-semibold text-text-3">Conta</div>
            {GATILHOS.map(g => (
              <div key={g.id} className="text-center font-semibold text-text-3">
                {g.curto}
              </div>
            ))}
            <div className="font-semibold text-text-3">Ciclo deduzido</div>
            <div className="text-right font-semibold text-text-3">Tier</div>
            <div className="text-right font-semibold text-text-3">VSCS</div>
            {top.map(a => (
              <ContaLinha key={a.conta.id} a={a} />
            ))}
          </div>
          {top.length === 0 && <p className="py-3 text-sm text-text-3">Nenhuma conta do escopo bate este gatilho.</p>}
        </div>
      </div>
    </section>
  );
}

function Linhas({ r, pool, comax }: { r: (typeof GATILHOS)[number]; pool: Linha[]; comax: number }) {
  return (
    <>
      <div className="flex items-center font-semibold text-text-2">{r.curto}</div>
      {GATILHOS.map(c => {
        const n = pool.filter(a => a.gatilhos.has(r.id) && a.gatilhos.has(c.id)).length;
        const t = Math.sqrt(n / comax);
        const diag = r.id === c.id;
        return (
          <div
            key={c.id}
            title={`${r.nome} + ${c.nome}: ${n}`}
            className={cn('vr-data flex h-[38px] items-center justify-center rounded-[3px] text-xs', diag ? 'font-bold' : '', t > 0.65 ? 'text-white' : 'text-foreground')}
            style={{ background: `color-mix(in srgb, ${diag ? 'var(--vr-ok)' : 'var(--vr-cool)'} ${Math.round(10 + t * 62)}%, var(--vr-surface))` }}
          >
            {n}
          </div>
        );
      })}
    </>
  );
}

function Oferta({ seg, l, comum, faixa }: { seg: string; l: Linha[]; comum: number; faixa: (typeof FAIXAS_CICLO)[number] | undefined }) {
  const borda = 'border-t border-border';
  return (
    <>
      <div className={cn('py-1.5 text-sm font-semibold', borda)}>{seg}</div>
      {BARREIRAS.map(b => {
        const tipica = !!(comum & b.bit);
        const extra = !tipica && l.some(a => a.barreiras & b.bit);
        return (
          <div key={b.bit} className={cn('flex justify-center py-1.5', borda)}>
            <Ponto sim={tipica} extra={extra} titulo={`${seg} · ${b.rotulo}${tipica ? ': barreira típica da oferta' : extra ? ': aparece em parte das contas (cliente regulado, enterprise ou governo)' : ': não típica'}`} />
          </div>
        );
      })}
      <div className={cn('py-1.5', borda)}>
        {faixa && (
          <span className="rounded-chip bg-[var(--vr-surface)] px-2 py-0.5 font-bold" style={{ color: faixa.cor }}>
            {faixa.rotulo}
          </span>
        )}
      </div>
      <div className={cn('vr-data py-1.5 text-right', borda)}>
        {l.length} <span className="text-[11px] text-ok">{l.filter(a => a.tier === 'A').length} A</span>
      </div>
    </>
  );
}

function ContaLinha({ a }: { a: Linha }) {
  const borda = 'border-t border-border';
  const faixa = FAIXAS_CICLO[a.ciclo - 1];
  return (
    <>
      <div className={cn('truncate py-1.5', borda)}>
        <Link href={hrefConta(a.conta.id)} className="text-sm font-bold hover:underline">
          {a.conta.nome}
        </Link>{' '}
        <span className="text-text-3">· {a.uf || 'sem UF'}</span>
      </div>
      {GATILHOS.map(g => (
        <div key={g.id} className={cn('flex justify-center py-1.5', borda)}>
          <Ponto sim={a.gatilhos.has(g.id)} incompleto={a.incompletos.has(g.id)} titulo={`${g.nome}${a.gatilhos.has(g.id) ? ': bate' : ': não bate'}${a.incompletos.has(g.id) ? ' (medição incompleta)' : ''}`} />
        </div>
      ))}
      <div className={cn('py-1.5 font-semibold', borda)} style={{ color: faixa?.cor ?? 'var(--vr-text-3)' }} title={`${a.segmento} · ${BARREIRAS.filter(b => a.barreiras & b.bit).map(b => b.rotulo).join(', ')}`}>
        {faixa?.rotulo ?? '—'}
      </div>
      <div className={cn('py-1.5 text-right font-bold', borda)} style={{ color: a.tier === 'C' ? 'var(--vr-text-3)' : COR_TIER_ICP[a.tier] }}>
        {a.tier}
      </div>
      <div className={cn('vr-data py-1.5 text-right', borda)}>{a.conta.score}</div>
    </>
  );
}
