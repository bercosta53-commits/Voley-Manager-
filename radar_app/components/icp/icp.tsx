'use client';

import { useMemo, useState } from 'react';
import type { Base } from '@/lib/tipos';
import { ALAVANCAS_ATUAIS, prepararContas, simular, type Alavancas, type RegrasIcp } from '@/lib/icp';
import { Casca } from '@/components/casca/casca';
import { Definicao, Simulador, COR_TIER_ICP } from './simulador';
import { Alternar, Gatilhos, type EscopoGat } from './gatilhos';
import { cn } from '@/lib/utils';

const PAPEIS_COMITE: [string, string][] = [
  ['assina_cheque', 'Assina o cheque'],
  ['dono_da_dor', 'Dono da dor'],
  ['influenciador', 'Influenciador'],
  ['decisor', 'Decisor'],
  ['trava', 'Trava'],
  ['completo', 'Comitê completo'],
];
const COLUNAS_VERTICAL = ['Generalista', 'Fintech', 'Retailtech', 'Regtech', 'Logtech', 'HR Tech', 'Legaltech', 'Indústria 4.0', 'Healthtech', 'Mobilitytech', 'Outras'];

/**
 * Aba ICP: quem a Velora quer ganhar, o que a base diz sobre isso e o que acontece com o Tier A quando uma
 * regra muda. Com as alavancas no padrão, a regra reproduz os tiers atuais conta a conta.
 */
export function TelaIcp({ base, regras }: { base: Base; regras: RegrasIcp }) {
  const contas = useMemo(() => prepararContas(base, regras), [base, regras]);
  const [al, setAl] = useState<Alavancas>(() => ALAVANCAS_ATUAIS(regras));
  const [escopoComite, setEscopoComite] = useState<'all' | 'A'>('all');
  const [escopoGat, setEscopoGat] = useState<EscopoGat>('A');
  const [gatSel, setGatSel] = useState(1);
  const sim = useMemo(() => simular(contas, al), [contas, al]);
  const porUf = useMemo(() => {
    const n: Record<string, number> = {};
    for (const c of contas) if (c.uf) n[c.uf] = (n[c.uf] ?? 0) + 1;
    return n;
  }, [contas]);

  const escopo = escopoComite === 'A' ? sim.linhas.filter(l => l.tier === 'A') : sim.linhas;
  const familias = [...new Set(sim.linhas.map(l => l.familia))].sort((a, b) => Number(a === 'Sem classificação') - Number(b === 'Sem classificação') || sim.linhas.filter(l => l.familia === b).length - sim.linhas.filter(l => l.familia === a).length);
  const colDe = (v: string) => (COLUNAS_VERTICAL.includes(v) ? v : 'Outras');
  const maxCel = Math.max(1, ...familias.flatMap(f => COLUNAS_VERTICAL.map(c => sim.linhas.filter(l => l.familia === f && colDe(l.vertical) === c).length)));

  return (
    <Casca base={base}>
      <main className="flex w-full max-w-[1440px] flex-col gap-6 px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16">
        <div>
          <h1 className="font-display text-2xl font-semibold tracking-tight">ICP</h1>
          <p className="mt-1 max-w-[820px] text-sm text-text-2">
            Quem a Velora quer ganhar, o que a base diz sobre isso e o que acontece com o Tier A quando uma regra muda. A regra abaixo reproduz os tiers atuais conta a conta.
          </p>
          <p className="mt-1 text-xs text-text-3">
            Base lida em {base.geradoEm.split('-').reverse().join('/')} · {sim.linhas.length} contas · regras em data/icp.json
          </p>
        </div>

        <Definicao sim={sim} regras={regras} al={al} />
        <Simulador sim={sim} al={al} regras={regras} porUf={porUf} semUf={sim.linhas.filter(l => !l.uf).length} onMudar={m => setAl(a => ({ ...a, ...m }))} onRestaurar={() => setAl(ALAVANCAS_ATUAIS(regras))} />
        <Gatilhos linhas={sim.linhas} escopo={escopoGat} onEscopo={setEscopoGat} sel={gatSel} onSel={setGatSel} />

        <div className="flex flex-wrap gap-6">
          <section aria-labelledby="fun-t" className="vr-card flex min-w-0 flex-[1_1_480px] flex-col gap-3 p-5">
            <div>
              <h2 id="fun-t" className="font-display text-xl font-semibold">
                Da base às contas prontas
              </h2>
              <p className="mt-0.5 text-sm text-text-3">O gargalo não é achar conta: é completar o comitê de quem já é Tier A.</p>
            </div>
            <svg viewBox="0 0 560 300" className="w-full" role="img" aria-label={`Funil: ${sim.funil.map(f => `${f.rotulo} ${f.n}`).join(', ')}`}>
              {sim.funil.map((f, i) => {
                const w = Math.max(3, (f.n / sim.funil[0]!.n) * 470);
                const y = 18 + i * 47;
                const ant = i ? sim.funil[i - 1]!.n : null;
                const queda = ant === null ? '' : `−${ant - f.n}`;
                const forte = ant !== null && ant > 0 && (ant - f.n) / ant > 0.5;
                return (
                  <g key={f.rotulo}>
                    <text x={0} y={y - 5} className="fill-text-2 text-[12px] font-semibold">
                      {f.rotulo}
                    </text>
                    <rect x={0} y={y} width={w} height={22} rx={4} fill={i >= 3 ? 'var(--vr-ok)' : 'var(--vr-cool)'} fillOpacity={i >= 3 ? 0.85 : 0.6} />
                    <text x={w + 8} y={y + 16} className="vr-data fill-foreground text-[13px] font-semibold">
                      {f.n}
                    </text>
                    <text x={556} y={y + 16} textAnchor="end" className="vr-data text-[11px]" fill={forte ? 'var(--vr-risk)' : 'var(--vr-text-3)'}>
                      {queda}
                    </text>
                  </g>
                );
              })}
            </svg>
            <p className="text-xs text-text-3">
              {sim.aSemFaturamento} dos {sim.nA} Tier A ainda estão com faturamento não validado na Receita.
            </p>
          </section>

          <section aria-labelledby="com-t" className="vr-card flex min-w-0 flex-[1_1_480px] flex-col gap-3 p-5">
            <div className="flex flex-wrap items-start justify-between gap-2.5">
              <div>
                <h2 id="com-t" className="font-display text-xl font-semibold">
                  Comitê de compra mapeado
                </h2>
                <p className="mt-0.5 text-sm text-text-3">% de contas com ao menos uma pessoa em cada papel.</p>
              </div>
              <Alternar rotulo="Escopo" valor={escopoComite} onMudar={setEscopoComite} opcoes={[['all', 'Toda a base'], ['A', 'Tier A simulado']]} />
            </div>
            {PAPEIS_COMITE.map(([id, rotulo]) => {
              const n = escopo.filter(l => (id === 'completo' ? l.comiteCompleto : l.papeis.has(id))).length;
              const p = escopo.length ? n / escopo.length : 0;
              const cor = id === 'completo' ? 'var(--vr-ok)' : id === 'decisor' ? 'var(--vr-risk)' : 'var(--vr-cool)';
              return (
                <div key={id} className="grid items-center gap-2.5" style={{ gridTemplateColumns: '150px 1fr 96px' }}>
                  <span className={cn('text-sm', id === 'completo' ? 'font-bold' : 'font-medium')}>{rotulo}</span>
                  <div className="h-3.5 overflow-hidden rounded-[3px] bg-[var(--vr-surface-3)]">
                    <div className="h-3.5 transition-[width] duration-300" style={{ width: `${(p * 100).toFixed(1)}%`, background: cor }} />
                  </div>
                  <span className="vr-data text-right text-xs">
                    {Math.round(p * 100)}% <span className="text-text-3">({n})</span>
                  </span>
                </div>
              );
            })}
            <p className="text-xs text-text-3">Contatos vêm do Snov e ainda não têm canal verificado. Decisor é o papel mais em falta.</p>
          </section>
        </div>

        <section aria-labelledby="mat-t" className="vr-card flex flex-col gap-3 p-5">
          <div>
            <h2 id="mat-t" className="font-display text-xl font-semibold">
              Onde está o ICP: família de TI × vertical atendida
            </h2>
            <p className="mt-0.5 text-sm text-text-3">Número grande = contas na célula; número verde = Tier A no cenário do simulador. Cor mais forte = mais contas.</p>
          </div>
          <div className="overflow-x-auto">
            <div className="grid min-w-[1000px] gap-[3px] text-xs" style={{ gridTemplateColumns: `200px repeat(${COLUNAS_VERTICAL.length}, minmax(0, 1fr)) 70px` }}>
              <div />
              {COLUNAS_VERTICAL.map(c => (
                <div key={c} className="px-0.5 py-1.5 text-center font-semibold text-text-3">
                  {c}
                </div>
              ))}
              <div className="px-0.5 py-1.5 text-center font-semibold text-text-3">Total</div>
              {familias.map(f => {
                const daFamilia = sim.linhas.filter(l => l.familia === f);
                return (
                  <Linha key={f} nome={f} total={daFamilia.length} a={daFamilia.filter(l => l.tier === 'A').length}>
                    {COLUNAS_VERTICAL.map(c => {
                      const l = daFamilia.filter(x => colDe(x.vertical) === c);
                      const a = l.filter(x => x.tier === 'A').length;
                      const t = l.length ? Math.sqrt(l.length / maxCel) : 0;
                      return (
                        <div
                          key={c}
                          title={`${f} × ${c}: ${l.length} contas, ${a} Tier A`}
                          className="flex h-11 flex-col items-center justify-center rounded-[3px] leading-tight"
                          style={{ background: l.length ? `color-mix(in srgb, var(--vr-cool) ${Math.round(8 + t * 55)}%, var(--vr-surface))` : 'var(--vr-surface-2)' }}
                        >
                          <span className={cn('vr-data text-sm', t > 0.7 ? 'text-white' : 'text-foreground')}>{l.length || '·'}</span>
                          {a > 0 && <span className={cn('vr-data text-[11px] font-semibold', t > 0.7 ? 'text-white' : 'text-ok')}>{a} A</span>}
                        </div>
                      );
                    })}
                  </Linha>
                );
              })}
            </div>
          </div>
          <div className="flex gap-4 text-xs text-text-2">
            {(['A', 'B', 'C'] as const).map(t => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px]" style={{ background: COR_TIER_ICP[t] }} />
                Tier {t}: {t === 'A' ? sim.nA : t === 'B' ? sim.nB : sim.nC}
              </span>
            ))}
          </div>
        </section>
      </main>
    </Casca>
  );
}

function Linha({ nome, total, a, children }: { nome: string; total: number; a: number; children: React.ReactNode }) {
  return (
    <>
      <div className="flex h-11 items-center rounded-[3px] bg-[var(--vr-surface-2)] px-2 font-semibold">{nome}</div>
      {children}
      <div className="flex h-11 flex-col items-center justify-center rounded-[3px] bg-[var(--vr-surface-2)] leading-tight">
        <span className="vr-data text-sm">{total}</span>
        <span className="vr-data text-[11px] font-semibold text-ok">{a} A</span>
      </div>
    </>
  );
}
