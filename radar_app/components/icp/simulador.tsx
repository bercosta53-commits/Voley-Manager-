'use client';

import type { Alavancas, RegrasIcp } from '@/lib/icp';
import type { simular } from '@/lib/icp';
import { cn } from '@/lib/utils';

export const COR_TIER_ICP = { A: 'var(--vr-ok)', B: 'var(--vr-cool)', C: 'var(--vr-border-strong)' } as const;
type Simulacao = ReturnType<typeof simular>;

/** Posição de cada UF num grid 8×10 (cartograma simplificado do Brasil). */
const POS: Record<string, [number, number]> = { AP: [5, 1], CE: [7, 2], PE: [8, 3], BA: [7, 4], GO: [5, 5], DF: [6, 5], MG: [6, 6], ES: [7, 6], SP: [5, 7], RJ: [6, 7], PR: [4, 8], SC: [4, 9], RS: [3, 10] };

export function Definicao({ sim, regras, al }: { sim: Simulacao; regras: RegrasIcp; al: Alavancas }) {
  const rotuloExcl = { regiao: 'Fora da região', porte: 'Micro e pequena empresa', ramo: 'Ramo sem classificação', b2c: 'B2C, martech e adtech' } as const;
  return (
    <section aria-label="Definição do ICP" className="grid gap-3.5 sm:grid-cols-2 xl:grid-cols-4">
      <Cartao borda="var(--vr-ok)" rotulo="Principal" corRotulo="var(--vr-ok)" n={sim.nA} titulo="Serviços de tecnologia B2B" nota="Contas Tier A no cenário atual do simulador.">
        <Chip>ramo principal: serviços</Chip>
        <Chip>sede {al.regiao.join('/') || '—'}</Chip>
        <Chip>faturamento {regras.faturamentoAlvo.split(' (')[0].replace(' por ano', '')}</Chip>
        <Chip forte>{al.minGatilhos ? `≥ ${al.minGatilhos} gatilhos comportamentais` : 'gatilhos comportamentais: opcional'}</Chip>
      </Cartao>
      <Cartao borda="var(--vr-cool)" rotulo="Secundário · decisão pendente" corRotulo="var(--vr-cool)" n={sim.saasAfetadas} titulo="Software e SaaS B2B maduro" nota={`${Math.round((100 * sim.saasAfetadas) / sim.linhas.length)}% da base está aqui esperando a decisão sobre SaaS. É a maior alavanca do ICP.`}>
        <Chip>produto como receita</Chip>
        <Chip>{al.saas ? 'no simulador: conta como principal' : 'hoje fica no Tier B'}</Chip>
      </Cartao>
      <Cartao tracejado rotulo="Adjacente · fora da base" n={0} titulo="Serviços profissionais e financeiros" nota="Braços definidos no ICP original, sem contas na base enquanto o foco é TI.">
        <Chip>advocacia full-service</Chip>
        <Chip>auditoria e tributário</Chip>
        <Chip>cooperativas, seguros, consórcios</Chip>
      </Cartao>
      <Cartao borda="var(--vr-risk)" rotulo="Exclusões" corRotulo="var(--vr-risk)" n={sim.nC}>
        {sim.exclusoes.map(e => (
          <div key={e.motivo} className="flex w-full justify-between py-0.5 text-sm">
            <span className="text-text-2">{rotuloExcl[e.motivo]}</span>
            <span className="vr-data">{e.n}</span>
          </div>
        ))}
      </Cartao>
    </section>
  );
}

function Cartao({ borda, tracejado, rotulo, corRotulo, n, titulo, nota, children }: { borda?: string; tracejado?: boolean; rotulo: string; corRotulo?: string; n: number; titulo?: string; nota?: string; children: React.ReactNode }) {
  return (
    <div
      className={cn('flex flex-col gap-2.5 rounded-card bg-[var(--vr-surface)] p-4.5', tracejado ? 'border border-dashed border-border-strong' : 'border')}
      style={borda ? { borderColor: `color-mix(in srgb, ${borda} 45%, transparent)` } : undefined}
    >
      <div className="flex items-center justify-between">
        <span className="text-[11px] font-bold tracking-[0.08em] uppercase" style={{ color: corRotulo ?? 'var(--vr-text-2)' }}>
          {rotulo}
        </span>
        <span className={cn('vr-data text-2xl font-semibold', tracejado && 'text-text-3')}>{n}</span>
      </div>
      {titulo && <div className="text-md font-bold">{titulo}</div>}
      <div className="flex flex-wrap gap-1.5">{children}</div>
      {nota && <div className="text-xs text-text-3">{nota}</div>}
    </div>
  );
}

function Chip({ children, forte }: { children: React.ReactNode; forte?: boolean }) {
  return <span className={cn('rounded-chip px-2 py-0.5 text-xs', forte ? 'bg-ok-bg text-ok' : 'bg-[var(--vr-surface-3)] text-text-2')}>{children}</span>;
}

function Interruptor({ ligado, rotulo, sub, onMudar }: { ligado: boolean; rotulo: string; sub: string; onMudar: () => void }) {
  return (
    <button
      type="button"
      role="switch"
      aria-checked={ligado}
      onClick={onMudar}
      className={cn('flex w-full items-center gap-3.5 rounded-card border p-3.5 text-left transition-colors', ligado ? 'border-ok/50 bg-ok-bg/50' : 'border-border bg-[var(--vr-surface-2)] hover:border-border-strong')}
    >
      <span aria-hidden className={cn('relative inline-block h-[22px] w-10 flex-none rounded-full transition-colors', ligado ? 'bg-ok' : 'bg-border-strong')}>
        <span className={cn('absolute top-[3px] size-4 rounded-full bg-white shadow-1 transition-[left] duration-150', ligado ? 'left-[21px]' : 'left-[3px]')} />
      </span>
      <span className="flex flex-col gap-0.5">
        <span className="text-sm font-bold">{rotulo}</span>
        <span className="text-xs text-text-3">{sub}</span>
      </span>
    </button>
  );
}

/** Simulador: alavancas à esquerda, efeito (tiers, programa ABM, quem entra e sai) à direita. */
export function Simulador({
  sim,
  al,
  regras,
  porUf,
  semUf,
  onMudar,
  onRestaurar,
}: {
  sim: Simulacao;
  al: Alavancas;
  regras: RegrasIcp;
  porUf: Record<string, number>;
  semUf: number;
  onMudar: (a: Partial<Alavancas>) => void;
  onRestaurar: () => void;
}) {
  const atual = { A: sim.linhas.filter(l => l.tierAtual === 'A').length, B: sim.linhas.filter(l => l.tierAtual === 'B').length, C: sim.linhas.filter(l => l.tierAtual === 'C').length };
  const total = sim.linhas.length;
  const sinal = (d: number) => (d > 0 ? `+${d}` : d < 0 ? `−${Math.abs(d)}` : '±0');
  const { umAUm, umFew, umMany } = sim.programa;
  const max = Math.max(160, Math.ceil((sim.nA + 20) / 20) * 20);
  const sc = (n: number) => (n / max) * 620;
  const meta = 100;
  return (
    <section aria-labelledby="sim-t" className="vr-card flex flex-wrap gap-7 p-5.5">
      <div className="flex min-w-0 flex-[1_1_380px] flex-col gap-3.5">
        <div>
          <h2 id="sim-t" className="font-display text-xl font-semibold">
            Simulador de ICP
          </h2>
          <p className="mt-0.5 text-sm text-text-3">Mude uma regra e veja o Tier A, a capacidade e o programa ABM se mexerem.</p>
        </div>
        <Interruptor ligado={al.saas} rotulo="Software e SaaS como ramo principal" sub={`Decide a pendência sobre SaaS · ${sim.saasAfetadas} contas afetadas`} onMudar={() => onMudar({ saas: !al.saas })} />
        <Interruptor ligado={al.sedeNaoConfirmada} rotulo="Aceitar sede ainda não confirmada na Receita" sub="Hoje a sede precisa estar confirmada para virar Tier A" onMudar={() => onMudar({ sedeNaoConfirmada: !al.sedeNaoConfirmada })} />
        <Interruptor
          ligado={al.exigirFaturamento}
          rotulo="Exigir faturamento validado para Tier A"
          sub={`Hoje ${sim.linhas.filter(l => l.tierAtual === 'A' && l.porte !== 'validado').length} dos ${atual.A} Tier A têm faturamento não validado`}
          onMudar={() => onMudar({ exigirFaturamento: !al.exigirFaturamento })}
        />
        <div className={cn('flex flex-col gap-2.5 rounded-card border p-3.5', al.minGatilhos ? 'border-ok/50 bg-ok-bg/50' : 'border-border bg-[var(--vr-surface-2)]')}>
          <div>
            <div className="text-sm font-bold">Mínimo de gatilhos comportamentais no Tier A</div>
            <div className="text-xs text-text-3">Tier A que não bate o mínimo cai para B</div>
          </div>
          <div role="group" aria-label="Mínimo de gatilhos" className="grid grid-cols-6 gap-1">
            {[0, 1, 2, 3, 4, 5].map(k => (
              <button
                key={k}
                type="button"
                aria-pressed={al.minGatilhos === k}
                onClick={() => onMudar({ minGatilhos: k })}
                className={cn('vr-data h-9 rounded-control border text-sm font-semibold', al.minGatilhos === k ? 'border-ok bg-ok-bg text-ok' : 'border-border bg-[var(--vr-surface)] text-text-2 hover:border-border-strong')}
              >
                {k === 0 ? 'off' : k}
              </button>
            ))}
          </div>
        </div>
        <div>
          <div className="mb-2 flex items-baseline justify-between">
            <span className="text-sm font-bold">Região do ICP</span>
            <span className="text-xs text-text-3">clique num estado para incluir ou tirar</span>
          </div>
          <div className="grid max-w-[400px] grid-cols-8 gap-1" style={{ gridAutoRows: '46px' }}>
            {Object.entries(POS).map(([uf, [col, row]]) => {
              const on = al.regiao.includes(uf);
              return (
                <button
                  key={uf}
                  type="button"
                  aria-pressed={on}
                  aria-label={`${uf}, ${porUf[uf] ?? 0} contas, ${on ? 'na região do ICP' : 'fora da região'}`}
                  onClick={() => onMudar({ regiao: on ? al.regiao.filter(x => x !== uf) : [...al.regiao, uf] })}
                  className={cn('flex flex-col items-center justify-center rounded-control border leading-tight', on ? 'border-ok bg-ok-bg text-foreground' : 'border-border bg-[var(--vr-surface-3)] text-text-2 hover:border-border-strong')}
                  style={{ gridColumn: col, gridRow: row }}
                >
                  <span className="text-xs font-bold">{uf}</span>
                  <span className="vr-data text-[10px] opacity-85">{porUf[uf] ?? 0}</span>
                </button>
              );
            })}
          </div>
          <div className="mt-2 flex gap-3.5 text-[11px] text-text-3">
            <span>número = contas na base</span>
            <span>· {semUf} contas sem UF ficam no Tier B</span>
          </div>
        </div>
        <button type="button" onClick={onRestaurar} className="h-9 self-start rounded-control border border-border-strong px-3.5 text-sm hover:bg-[var(--vr-surface-2)]">
          Restaurar ICP atual ({regras.regiao.join('/')})
        </button>
      </div>

      <div className="flex min-w-0 flex-[999_1_560px] flex-col gap-4.5">
        <div className="grid grid-cols-3 gap-3">
          {(
            [
              ['A', sim.nA, 'prioridade de ativação', true],
              ['B', sim.nB, 'nutrir e pesquisar', null],
              ['C', sim.nC, 'fora do ICP', false],
            ] as const
          ).map(([t, n, sub, bomSubir]) => {
            const d = n - atual[t];
            const cor = d === 0 || bomSubir === null ? 'var(--vr-text-3)' : (d > 0) === bomSubir ? 'var(--vr-ok)' : 'var(--vr-risk)';
            return (
              <div key={t} className="rounded-card bg-[var(--vr-surface-2)] p-3.5" style={{ borderTop: `3px solid ${COR_TIER_ICP[t]}` }}>
                <div className="text-xs text-text-3">Tier {t}</div>
                <div className="flex items-baseline gap-2">
                  <span className="vr-data text-3xl font-semibold">{n}</span>
                  <span className="vr-data text-sm" style={{ color: cor }}>
                    {sinal(d)}
                  </span>
                </div>
                <div className="text-xs text-text-3">{sub}</div>
              </div>
            );
          })}
        </div>
        <div>
          <div className="flex h-7 overflow-hidden rounded-control bg-[var(--vr-surface-3)]" role="img" aria-label={`${sim.nA} Tier A, ${sim.nB} Tier B, ${sim.nC} Tier C`}>
            {(['A', 'B', 'C'] as const).map(t => (
              <div key={t} className="transition-[width] duration-300" style={{ width: `${(100 * (t === 'A' ? sim.nA : t === 'B' ? sim.nB : sim.nC)) / total}%`, background: COR_TIER_ICP[t] }} />
            ))}
          </div>
          <div className="mt-1.5 flex gap-4 text-xs text-text-2">
            {(['A', 'B', 'C'] as const).map(t => (
              <span key={t} className="inline-flex items-center gap-1.5">
                <span className="size-2.5 rounded-[2px]" style={{ background: COR_TIER_ICP[t] }} />
                Tier {t}
              </span>
            ))}
          </div>
        </div>

        <div className="flex flex-col gap-3 rounded-card bg-[var(--vr-surface-2)] p-4">
          <div className="flex flex-wrap items-baseline justify-between gap-2.5">
            <span className="text-sm font-bold">Programa ABM dimensionado</span>
            <span className="text-xs" style={{ color: sim.nA > meta ? 'var(--vr-risk)' : 'var(--vr-ok)' }}>
              {sim.nA > meta ? `Tier A passa da capacidade em ${sim.nA - meta} contas` : `Tier A cabe na meta; sobram ${meta - sim.nA} vagas para o melhor do Tier B`}
            </span>
          </div>
          <svg viewBox="0 0 620 70" className="w-full" role="img" aria-label={`1:1 ${umAUm} contas, 1:few ${umFew}, 1:many ${umMany}; meta de ${meta} contas tratadas`}>
            <rect x={0} y={18} width={sc(umAUm)} height={26} rx={3} fill="var(--vr-ok)" />
            <rect x={sc(umAUm)} y={18} width={sc(umFew)} height={26} rx={3} fill="var(--vr-ok)" fillOpacity={0.45} />
            <rect x={sc(sim.nA)} y={18} width={Math.max(0, Math.min(620 - sc(sim.nA), sc(umMany)))} height={26} rx={3} fill="var(--vr-cool)" fillOpacity={0.55} />
            <line x1={Math.min(612, sc(meta))} y1={6} x2={Math.min(612, sc(meta))} y2={56} stroke="var(--vr-text)" strokeWidth={2} strokeDasharray="4 3" />
            <text x={Math.min(612, sc(meta))} y={68} textAnchor="middle" className="vr-data fill-foreground text-[11px]">
              meta {meta} contas tratadas
            </text>
            <text x={0} y={12} className="fill-text-3 text-[11px]">0</text>
            <text x={620} y={12} textAnchor="end" className="fill-text-3 text-[11px]">{max} contas</text>
          </svg>
          <div className="grid grid-cols-3 gap-2.5">
            <Faixa cor="var(--vr-ok)" rotulo={`1:1 · ${umAUm}`} texto="Tier A com VSCS ≥ 40: abordagem individual, sócio na conversa" />
            <Faixa cor="color-mix(in srgb, var(--vr-ok) 60%, var(--vr-text-3))" rotulo={`1:few · ${umFew}`} texto="Demais Tier A, agrupados por vertical" />
            <Faixa cor="var(--vr-cool)" rotulo={`1:many · ${umMany}`} texto="Tier B na região: conteúdo e presença" />
          </div>
        </div>

        <div className="grid gap-3.5 md:grid-cols-2">
          <Movimento titulo="Entram no Tier A" n={sim.entram.length} sinalMais vazio="Nenhuma mudança: ligue uma regra ao lado." itens={sim.entram.map(l => ({ id: l.conta.id, nome: l.conta.nome, extra: `${l.uf || 'sem UF'} · ${l.vertical}`, vscs: l.conta.score }))} />
          <Movimento titulo="Saem do Tier A" n={sim.saem.length} vazio="Ninguém sai." itens={sim.saem.map(l => ({ id: l.conta.id, nome: l.conta.nome, extra: `${l.uf || 'sem UF'} · ${sim.porque(l)}`, vscs: l.conta.score }))} />
        </div>
      </div>
    </section>
  );
}

function Faixa({ cor, rotulo, texto }: { cor: string; rotulo: string; texto: string }) {
  return (
    <div>
      <div className="text-xs font-bold" style={{ color: cor }}>
        {rotulo}
      </div>
      <div className="text-xs text-text-3">{texto}</div>
    </div>
  );
}

function Movimento({ titulo, n, sinalMais, vazio, itens }: { titulo: string; n: number; sinalMais?: boolean; vazio: string; itens: { id: string; nome: string; extra: string; vscs: number }[] }) {
  const LIMITE = sinalMais ? 7 : 5;
  return (
    <div>
      <div className="mb-1.5 text-sm font-bold">
        {titulo}{' '}
        <span className="vr-data" style={{ color: sinalMais ? 'var(--vr-ok)' : 'var(--vr-risk)' }}>
          {sinalMais ? '+' : '−'}
          {n}
        </span>
      </div>
      {n === 0 && <div className="py-2 text-xs text-text-3">{vazio}</div>}
      {itens.slice(0, LIMITE).map(m => (
        <div key={m.id} className="flex justify-between gap-2 border-b border-border py-1.5 text-sm">
          <span className="min-w-0 truncate">
            <span className="font-bold">{m.nome}</span> <span className="text-text-3">· {m.extra}</span>
          </span>
          <span className="vr-data">{m.vscs}</span>
        </div>
      ))}
      {itens.length > LIMITE && <div className="pt-1.5 text-xs text-text-3">e mais {itens.length - LIMITE} contas</div>}
    </div>
  );
}
