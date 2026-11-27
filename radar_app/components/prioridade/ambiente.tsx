'use client';

import { useMemo, useState } from 'react';
import { ArrowRight } from 'lucide-react';
import { ambiente, FAIXAS_AMBIENTE, LIMITE_APROXIMACAO, LIMITE_PROXIMO, type FaixaAmbiente, type PontoAmbiente } from '@/lib/ambiente';
import { DIMENSOES, REGRAS, ROTULO_DIMENSAO, type Dimensao } from '@/lib/prioridade-config';
import type { LinhaPrioridade } from '@/lib/prioridade-filtros';
import { cn } from '@/lib/utils';
import { DicaConta } from '@/components/ui/dica-conta';
import { resumoDaLinha } from './resumo-linha';

const fmt = (n: number) => n.toLocaleString('pt-BR', { maximumFractionDigits: 1 });
const CURTO: Record<Dimensao, string> = { icp: 'ICP', sinais: 'Sinais', clima: 'Clima', oportunidadeDigital: 'Digital' };
/** o que significa a lacuna, para a decisão */
const LEITURA_LACUNA: Record<Dimensao, string> = {
  icp: 'encaixe fraco no perfil ideal',
  sinais: 'bom encaixe, falta gatilho (timing)',
  clima: 'setor em momento desfavorável',
  oportunidadeDigital: 'pouco espaço na aquisição digital',
};
const COR: Record<FaixaAmbiente, string> = {
  centro: 'var(--vr-ok)',
  proximo: '#7fa37a',
  aproximacao: 'var(--vr-warm)',
  distante: 'var(--vr-border-strong)',
};
const FUNDO: Record<FaixaAmbiente, string> = {
  centro: 'color-mix(in srgb, var(--vr-ok) 22%, var(--vr-surface))',
  proximo: 'color-mix(in srgb, var(--vr-ok) 10%, var(--vr-surface))',
  aproximacao: 'var(--vr-surface-2)',
  distante: 'var(--vr-surface)',
};
const RAIO_FAIXA: Record<FaixaAmbiente, number> = { centro: 0.2, proximo: 0.45, aproximacao: 0.7, distante: 0.95 };
const TAMANHO_TIER = (t: string) => (t === 'A' ? 6 : t === 'B' ? 5 : 3.8);

const nota = (l: LinhaPrioridade, d: Dimensao) => {
  const x = l.visao.dimensoes[d];
  return x.nota !== null && x.entraNoCalculo ? x.nota : null;
};

function Alvo({
  pontos,
  ocultas,
  destaque,
  onDestaque,
  onSelecionar,
}: {
  pontos: PontoAmbiente[];
  ocultas: Set<FaixaAmbiente>;
  destaque: string | null;
  onDestaque: (id: string | null) => void;
  onSelecionar: (id: string) => void;
}) {
  const L = 560;
  const c = L / 2;
  const R = L / 2 - 34;
  const ativo = pontos.find(p => p.linha.contaId === destaque);
  // os maiores por cima: distante primeiro, centro por último
  const ordem: FaixaAmbiente[] = ['distante', 'aproximacao', 'proximo', 'centro'];
  const visiveis = pontos.filter(p => !ocultas.has(p.faixa)).sort((a, b) => ordem.indexOf(a.faixa) - ordem.indexOf(b.faixa));
  return (
    <div className="relative">
      <svg viewBox={`0 0 ${L} ${L}`} className="mx-auto block w-full max-w-[560px]" role="img" aria-label={`Ambiente das contas: ${FAIXAS_AMBIENTE.map(f => `${f.rotulo} ${pontos.filter(p => p.faixa === f.id).length}`).join(', ')}`}>
        {[...ordem].map(f => (
          <circle key={f} cx={c} cy={c} r={R * RAIO_FAIXA[f]} fill={FUNDO[f]} stroke="var(--vr-border)" strokeWidth={1} />
        ))}
        {/* eixos: a conta fica do lado da dimensão que a afasta do centro */}
        {DIMENSOES.map(d => {
          const [dx, dy] = ({ icp: [0, -1], sinais: [1, 0], clima: [0, 1], oportunidadeDigital: [-1, 0] } as const)[d];
          return <line key={d} x1={c + dx * R * 0.2} y1={c + dy * R * 0.2} x2={c + dx * R} y2={c + dy * R} stroke="var(--vr-border)" strokeDasharray="3 4" />;
        })}
        <text x={c} y={16} textAnchor="middle" className="fill-text-2 text-xs font-medium">ICP forte</text>
        <text x={c} y={L - 6} textAnchor="middle" className="fill-text-2 text-xs font-medium">Clima favorável</text>
        <text x={L - 4} y={c - 8} textAnchor="end" className="fill-text-2 text-xs font-medium">Sinais fortes</text>
        <text x={4} y={c - 8} className="fill-text-2 text-xs font-medium">Digital com espaço</text>
        {/* rótulos das faixas na diagonal de cima à direita (ICP e Sinais fortes juntos são raros: fica livre) */}
        {(['proximo', 'aproximacao', 'distante'] as FaixaAmbiente[]).map(f => {
          const r = R * (RAIO_FAIXA[f] - 0.05);
          return (
            <text key={f} x={c + r * 0.707} y={c - r * 0.707} textAnchor="middle" className="fill-text-3 text-xs" style={{ paintOrder: 'stroke', stroke: 'var(--vr-surface)', strokeWidth: 3 }}>
              {FAIXAS_AMBIENTE.find(x => x.id === f)!.rotulo}
            </text>
          );
        })}
        <text x={c} y={c + 4} textAnchor="middle" className="fill-ok text-xs font-semibold" style={{ paintOrder: 'stroke', stroke: 'var(--vr-surface)', strokeWidth: 3 }}>
          sweet spot
        </text>

        {visiveis.map(p => {
          const x = c + Math.cos(p.angulo) * p.raio * R;
          const y = c + Math.sin(p.angulo) * p.raio * R;
          const r = TAMANHO_TIER(p.linha.tier);
          const on = destaque === p.linha.contaId;
          return (
            <circle
              key={p.linha.contaId}
              cx={x}
              cy={y}
              r={on ? r + 3 : r}
              fill={p.aInvestigar ? 'var(--vr-surface)' : COR[p.faixa]}
              stroke={p.aInvestigar ? COR[p.faixa] : on ? 'var(--vr-text)' : 'var(--vr-surface)'}
              strokeWidth={p.aInvestigar ? 2 : on ? 2 : 1}
              opacity={destaque && !on ? 0.45 : 1}
              className="cursor-pointer"
              onMouseEnter={() => onDestaque(p.linha.contaId)}
              onMouseLeave={() => onDestaque(null)}
              onClick={() => onSelecionar(p.linha.contaId)}
            >
              <title>{`${p.linha.nome} · Tier ${p.linha.tier} · ${p.faixa === 'centro' ? 'no sweet spot' : `faltam ${fmt(p.falta)} pt`}`}</title>
            </circle>
          );
        })}
      </svg>
      {/* cartão da conta em foco (passar o mouse no ponto ou na lista) */}
      {ativo && (
        <div className="pointer-events-none absolute bottom-0 left-0 max-w-[260px] rounded-control border border-border bg-card p-3 text-xs shadow-2">
          <p className="truncate text-sm font-semibold">{ativo.linha.nome}</p>
          <p className="text-text-3">
            Tier {ativo.linha.tier}
            {ativo.linha.setor ? ` · ${ativo.linha.setor}` : ''}
          </p>
          <p className="mt-1.5 vr-data text-text-2">
            {DIMENSOES.map(d => `${CURTO[d]} ${nota(ativo.linha, d) !== null ? fmt(nota(ativo.linha, d)!) : '—'}`).join(' · ')}
          </p>
          <p className="mt-1 font-medium">
            {ativo.forca ? `Força: ${CURTO[ativo.forca]} · ` : ''}{ativo.faixa === 'centro' ? 'no sweet spot' : `faltam ${fmt(ativo.falta)} pt${ativo.lacuna ? ` (${CURTO[ativo.lacuna]})` : ''}`}
          </p>
        </div>
      )}
    </div>
  );
}

function Lista({
  titulo,
  ajuda,
  itens,
  vazio,
  detalhe,
  onDestaque,
  onSelecionar,
  limite = 6,
}: {
  titulo: string;
  ajuda: string;
  itens: PontoAmbiente[];
  vazio: string;
  detalhe: (p: PontoAmbiente) => React.ReactNode;
  onDestaque: (id: string | null) => void;
  onSelecionar: (id: string) => void;
  limite?: number;
}) {
  const [todos, setTodos] = useState(false);
  const mostrar = todos ? itens : itens.slice(0, limite);
  return (
    <section>
      <div className="flex items-baseline justify-between gap-2">
        <h3 className="text-sm font-semibold">
          {titulo} <span className="vr-data font-normal text-text-3">{itens.length}</span>
        </h3>
      </div>
      <p className="mt-0.5 text-xs text-text-3">{ajuda}</p>
      {itens.length === 0 ? (
        <p className="mt-2 text-xs text-text-3">{vazio}</p>
      ) : (
        <ul className="mt-1.5 divide-y divide-border">
          {mostrar.map(p => (
            <li key={p.linha.contaId}>
              <DicaConta resumo={resumoDaLinha(p.linha)} lado="left">
              <button
                type="button"
                onMouseEnter={() => onDestaque(p.linha.contaId)}
                onMouseLeave={() => onDestaque(null)}
                onFocus={() => onDestaque(p.linha.contaId)}
                onBlur={() => onDestaque(null)}
                onClick={() => onSelecionar(p.linha.contaId)}
                className="-mx-2 grid w-[calc(100%+1rem)] grid-cols-[10px_minmax(0,1fr)_auto] items-center gap-x-2.5 rounded-control px-2 py-2 text-left hover:bg-[var(--vr-surface-2)]"
              >
                <span aria-hidden className="size-2.5 rounded-full" style={p.aInvestigar ? { border: `2px solid ${COR[p.faixa]}` } : { background: COR[p.faixa] }} />
                <span className="min-w-0">
                  <span className="block truncate text-sm font-medium">
                    {p.linha.nome} <span className="vr-data text-xs font-normal text-text-3">Tier {p.linha.tier}</span>
                  </span>
                  <span className="block truncate text-xs text-text-2">{detalhe(p)}</span>
                </span>
                <ArrowRight aria-hidden className="size-3.5 text-text-3" />
              </button>
              </DicaConta>
            </li>
          ))}
        </ul>
      )}
      {itens.length > limite && (
        <button type="button" onClick={() => setTodos(v => !v)} className="mt-1 text-xs font-medium text-text-2 underline decoration-border-strong underline-offset-2 hover:text-foreground">
          {todos ? 'Mostrar menos' : `Ver todas (${itens.length})`}
        </button>
      )}
    </section>
  );
}

/**
 * Ambiente de decisão do Radar: as contas num alvo cujo centro é o sweet spot (lib/ambiente.ts) e, ao lado, a
 * decisão de abordagem que o cruzamento dos quatro eixos sustenta: abordar agora, investigar antes, acompanhar
 * o gatilho, e o que afasta a base do centro. Respeita os filtros da tela; clicar abre o painel da conta.
 */
export function AmbienteDecisao({ linhas, onSelecionar }: { linhas: LinhaPrioridade[]; onSelecionar: (id: string) => void }) {
  const a = useMemo(() => ambiente(linhas), [linhas]);
  const [destaque, setDestaque] = useState<string | null>(null);
  const [ocultas, setOcultas] = useState<Set<FaixaAmbiente>>(new Set());
  const porFalta = (x: PontoAmbiente, y: PontoAmbiente) => x.falta - y.falta || (nota(y.linha, 'sinais') ?? 0) - (nota(x.linha, 'sinais') ?? 0) || x.linha.nome.localeCompare(y.linha.nome);

  const abordar = a.pontos.filter(p => p.faixa === 'centro' || (p.faixa === 'proximo' && !p.aInvestigar)).sort(porFalta);
  const investigar = a.pontos.filter(p => p.aInvestigar && p.faixa === 'proximo').sort(porFalta);
  // bom encaixe esperando gatilho: ICP no mínimo, o que afasta é Sinais
  const acompanhar = a.pontos
    .filter(p => p.faixa === 'aproximacao' && !p.aInvestigar && p.lacuna === 'sinais' && (nota(p.linha, 'icp') ?? 0) >= REGRAS.A2.minimos.icp)
    .sort(porFalta);
  const foraDoCentro = a.pontos.length - a.porFaixa.centro;
  const lacunas = DIMENSOES.map(d => ({ d, n: a.porLacuna[d] })).filter(x => x.n > 0).sort((x, y) => y.n - x.n);
  const maxLacuna = Math.max(1, ...lacunas.map(x => x.n));

  const falta = (p: PontoAmbiente) => {
    if (p.faixa === 'centro') return p.linha.evidencia?.texto ?? 'No sweet spot';
    const motivo = p.linha.visao.motivosClassificacao[0];
    return `Faltam ${fmt(p.falta)} pt${p.lacuna ? ` · ${CURTO[p.lacuna]}` : ''}${motivo ? ` · ${motivo.replace(/, falta .*/, '')}` : ''}`;
  };

  return (
    <div className="grid gap-5 xl:grid-cols-[minmax(0,1.15fr)_minmax(0,1fr)]">
      <section className="vr-card p-5" aria-labelledby="ambiente-t">
        <div className="flex flex-wrap items-baseline justify-between gap-2">
          <div>
            <h2 id="ambiente-t" className="text-lg font-semibold tracking-tight">
              Ambiente das contas
            </h2>
            <p className="mt-0.5 max-w-xl text-xs text-text-3">
              Centro = sweet spot. O lado mostra a força da conta (a dimensão que mais passa do mínimo); quanto mais longe do centro, mais pontos de nota faltam. Ponto vazado: uma dimensão ainda sem avaliação. Tamanho = Tier.
            </p>
          </div>
        </div>
        <div className="mt-3 flex flex-wrap gap-1.5" aria-label="Faixas do ambiente (clique para mostrar ou esconder)">
          {FAIXAS_AMBIENTE.map(f => {
            const off = ocultas.has(f.id);
            return (
              <button
                key={f.id}
                type="button"
                aria-pressed={!off}
                title={f.descricao}
                onClick={() => setOcultas(s => (s.has(f.id) ? new Set([...s].filter(x => x !== f.id)) : new Set([...s, f.id])))}
                className={cn('inline-flex items-center gap-1.5 rounded-chip border px-2 py-1 text-xs', off ? 'border-border text-text-3 line-through' : 'border-border-strong bg-card')}
              >
                <span aria-hidden className="size-2.5 rounded-full" style={{ background: COR[f.id] }} />
                {f.rotulo}
                <span className="vr-data font-semibold">{a.porFaixa[f.id]}</span>
              </button>
            );
          })}
          {a.semDados > 0 && <span className="self-center text-xs text-text-3">· {a.semDados} fora do mapa (2 ou mais dimensões sem avaliação)</span>}
        </div>
        <div className="mt-2">
          <Alvo pontos={a.pontos} ocultas={ocultas} destaque={destaque} onDestaque={setDestaque} onSelecionar={onSelecionar} />
        </div>
        <p className="mt-2 text-xs text-text-3">
          Próximo: falta até {fmt(LIMITE_PROXIMO)} ponto de nota · em aproximação: até {fmt(LIMITE_APROXIMACAO)} · leitura visual, não muda nota nem classe.
        </p>
      </section>

      <section className="vr-card flex flex-col gap-6 p-5" aria-label="Decisão de abordagem">
        <div>
          <h2 className="text-lg font-semibold tracking-tight">Decisão de abordagem</h2>
          <p className="mt-0.5 text-xs text-text-3">O que o cruzamento de ICP, sinais, clima e aquisição digital indica fazer com cada conta.</p>
        </div>
        <Lista
          titulo="Abordar agora"
          ajuda="No sweet spot ou a menos de 1,5 ponto, com as quatro dimensões avaliadas"
          itens={abordar}
          vazio="Nenhuma conta no centro ou próxima no recorte atual."
          detalhe={falta}
          onDestaque={setDestaque}
          onSelecionar={onSelecionar}
        />
        <Lista
          titulo="Investigar antes"
          ajuda="Perto do centro, mas com uma dimensão sem avaliação: confirmar antes de abordar"
          itens={investigar}
          vazio="Nenhuma conta perto do centro dependendo de investigação."
          detalhe={p => {
            const inv = p.linha.visao.investigacao;
            const d = p.linha.visao.dimensoesFaltantes[0];
            return inv?.notaMinimaParaSweet != null && d
              ? `Avaliar ${ROTULO_DIMENSAO[d]}: com nota ≥ ${fmt(Math.ceil(inv.notaMinimaParaSweet * 10 - 1e-6) / 10)} entra no sweet spot`
              : d
                ? `Avaliar ${ROTULO_DIMENSAO[d]} · faltam ao menos ${fmt(p.falta)} pt`
                : falta(p);
          }}
          onDestaque={setDestaque}
          onSelecionar={onSelecionar}
          limite={4}
        />
        <Lista
          titulo="Acompanhar o gatilho"
          ajuda="Bom encaixe (ICP no mínimo), mas sem sinal forte: monitorar e abordar quando surgir o gatilho"
          itens={acompanhar}
          vazio="Nenhuma conta de bom encaixe esperando gatilho."
          detalhe={falta}
          onDestaque={setDestaque}
          onSelecionar={onSelecionar}
          limite={4}
        />
        {lacunas.length > 0 && (
          <section>
            <h3 className="text-sm font-semibold">O que afasta a base do centro</h3>
            <p className="mt-0.5 text-xs text-text-3">Dimensão que mais pesa em cada uma das {foraDoCentro} contas fora do sweet spot</p>
            <ul className="mt-2 flex flex-col gap-2">
              {lacunas.map(({ d, n }) => (
                <li key={d} className="text-sm">
                  <div className="flex items-baseline justify-between gap-2">
                    <span>
                      <span className="font-medium">{ROTULO_DIMENSAO[d]}</span> <span className="text-xs text-text-3">· {LEITURA_LACUNA[d]}</span>
                    </span>
                    <span className="vr-data text-xs font-semibold">
                      {n} <span className="font-normal text-text-3">({Math.round((n / Math.max(1, foraDoCentro)) * 100)}%)</span>
                    </span>
                  </div>
                  <span className="mt-1 block h-1.5 rounded-full bg-[var(--vr-surface-3)]" aria-hidden>
                    <span className="block h-full rounded-full bg-foreground/75" style={{ width: `${(n / maxLacuna) * 100}%` }} />
                  </span>
                </li>
              ))}
            </ul>
          </section>
        )}
      </section>
    </div>
  );
}
