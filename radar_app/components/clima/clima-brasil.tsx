import type { Clima, Indicador } from '@/lib/clima';
import { COR_CLIMA, FUNDO_CLIMA, ICONE_CLIMA, fmtClima } from '@/lib/clima';
import { cn } from '@/lib/utils';
import { SetoresImpactados } from './setores-impactados';
import type { Conta } from '@/lib/tipos';

const COR_TOM = { bom: 'var(--vr-ok)', ruim: 'var(--vr-risk)', atencao: 'var(--vr-warm)', neutro: 'var(--vr-cool)' } as const;

/** Medidor −1…+1 do clima Brasil (a vertical Generalista segue só o macro). */
export function ClimaBrasil({ clima }: { clima: Clima }) {
  const { brasil } = clima.dados;
  const S = clima.brasilS;
  const gx = (a: number, r: number) => 140 + r * Math.cos(a);
  const gy = (a: number, r: number) => 140 - r * Math.sin(a);
  const ang = (s: number) => Math.PI * (1 - (s + 1) / 2);
  const arco = (s0: number, s1: number, r: number) =>
    `M${gx(ang(s0), r).toFixed(1)} ${gy(ang(s0), r).toFixed(1)} A${r} ${r} 0 0 1 ${gx(ang(s1), r).toFixed(1)} ${gy(ang(s1), r).toFixed(1)}`;
  const { bom, ruim } = clima.dados.limiares;
  return (
    <div className="vr-card flex flex-col gap-2 p-5">
      <div className="flex items-center justify-between">
        <h2 className="text-xs font-semibold tracking-[0.06em] text-text-2 uppercase">Clima Brasil</h2>
        <span className="rounded-chip px-2 py-0.5 text-xs font-bold" style={{ background: FUNDO_CLIMA[brasil.estado], color: COR_CLIMA[brasil.estado] }}>
          {ICONE_CLIMA[brasil.estado]} {brasil.estado}
        </span>
      </div>
      <svg viewBox="0 0 280 160" className="w-full" role="img" aria-label={`Medidor de clima Brasil: ${fmtClima(S)}, ${brasil.estado.toLowerCase()}`}>
        <path d={arco(-1, ruim, 110)} fill="none" stroke="var(--vr-risk)" strokeWidth={16} opacity={0.8} />
        <path d={arco(ruim, bom, 110)} fill="none" stroke="var(--vr-border-strong)" strokeWidth={16} />
        <path d={arco(bom, 1, 110)} fill="none" stroke="var(--vr-ok)" strokeWidth={16} opacity={0.8} />
        <line x1={140} y1={140} x2={gx(ang(S), 96).toFixed(1)} y2={gy(ang(S), 96).toFixed(1)} stroke="var(--vr-text)" strokeWidth={3} strokeLinecap="round" />
        <circle cx={140} cy={140} r={7} fill="var(--vr-text)" />
        <text x={24} y={156} className="vr-data fill-text-3 text-[11px]">−1</text>
        <text x={246} y={156} className="vr-data fill-text-3 text-[11px]">+1</text>
      </svg>
      <div className="flex items-baseline gap-2.5">
        <span className="vr-data text-4xl font-semibold">{fmtClima(S)}</span>
        {clima.dados.historicoMedido !== false && (
          <span className="text-sm text-text-3">
            {brasil.delta30 < 0 ? '↘' : '↗'} {fmtClima(brasil.delta30)} em 30 dias
          </span>
        )}
      </div>
      <p className="text-sm text-text-2">{brasil.nota}</p>
      {clima.dados.historicoMedido !== false && <div className="mt-1.5 grid grid-cols-2 gap-3 border-t border-border pt-3">
        <div>
          <div className="text-xs text-text-3">Fator de clima m</div>
          <div className="vr-data text-xl">{brasil.fatorClima.toFixed(2).replace('.', ',')}</div>
        </div>
        <div>
          <div className="text-xs text-text-3">Contas em mercado / tri</div>
          <div className="vr-data text-xl">
            {brasil.contasEmMercadoTri} <span className="text-xs text-text-3">(base {brasil.baseEmMercado})</span>
          </div>
        </div>
      </div>}
      <RankingVerticais clima={clima} />
    </div>
  );
}

/**
 * Onde o clima está melhor e pior nesta edição: barras divergentes por vertical (−1 a +1), com as contas da base em
 * cada uma. Ocupa a coluna do medidor, que acompanha a altura da grade de indicadores ao lado.
 */
function RankingVerticais({ clima }: { clima: Clima }) {
  const verticais = clima.verticais.filter(v => v.id !== 'GEN' && v.contas > 0).sort((a, b) => b.S - a.S);
  if (!verticais.length) return null;
  const max = Math.max(0.2, ...verticais.map(v => Math.abs(v.S)));
  const mostrar = verticais.length > 20 ? [...verticais.slice(0, 10), ...verticais.slice(-10)] : verticais;
  return (
    <div className="mt-3 flex flex-1 flex-col border-t border-border pt-3">
      <div className="mb-2 flex items-baseline justify-between">
        <h3 className="text-xs font-semibold tracking-[0.06em] text-text-2 uppercase">Verticais nesta edição</h3>
        <span className="text-xs text-text-3">contas na base</span>
      </div>
      <ul className="flex flex-col gap-1.5">
        {mostrar.map((v, i) => (
          <li key={v.id}>
            {verticais.length > 20 && i === 10 && <div aria-hidden className="my-1 border-t border-dashed border-border" />}
            <div className="grid grid-cols-[minmax(0,1fr)_96px_40px_28px] items-center gap-2 text-xs" title={`${v.nome}: ${fmtClima(v.S)} · ${v.estado}`}>
              <span className="truncate text-text-2">{v.nome}</span>
              <span className="relative h-2 rounded-full bg-[var(--vr-surface-3)]" aria-hidden>
                <span className="absolute inset-y-0 left-1/2 w-px bg-border-strong" />
                <span
                  className="absolute inset-y-0 rounded-full"
                  style={{
                    background: COR_CLIMA[v.estado],
                    left: v.S >= 0 ? '50%' : `${50 - (Math.abs(v.S) / max) * 50}%`,
                    width: `${(Math.abs(v.S) / max) * 50}%`,
                  }}
                />
              </span>
              <span className="vr-data text-right" style={{ color: COR_CLIMA[v.estado] }}>
                {fmtClima(v.S)}
              </span>
              <span className="vr-data text-right text-text-3">{v.contas}</span>
            </div>
          </li>
        ))}
      </ul>
      {verticais.length > 20 && <p className="mt-2 text-xs text-text-3">As 10 melhores e as 10 piores de {verticais.length} verticais.</p>}
    </div>
  );
}

/** Um indicador: número, variação, minigráfico (quando há série), leitura e fonte. */
function CartaoIndicador({ t, contas }: { t: Indicador; contas: Conta[] }) {
  const [lo, hi] = t.faixa;
  const n = t.serie.length;
  const cor = COR_TOM[t.cor];
  const xy = t.serie.map((p, i) => [(i * 192) / Math.max(1, n - 1) + 4, 44 - ((p - lo) / (hi - lo)) * 34] as const);
  const linha = xy.map((q, i) => `${i ? 'L' : 'M'}${q[0].toFixed(1)} ${q[1].toFixed(1)}`).join(' ');
  return (
    <div className="vr-card flex flex-col gap-1.5 p-4">
      <div className="text-xs text-text-3">{t.rotulo}</div>
      <div className="flex flex-wrap items-baseline gap-x-2">
        <span className="vr-data text-2xl font-semibold">{t.valor}</span>
        <span className="text-xs" style={{ color: COR_TOM[t.tom] }}>
          {t.delta}
        </span>
      </div>
      {n >= 2 && (
        <svg viewBox="0 0 200 48" className="h-12 w-full" preserveAspectRatio="none" role="img" aria-label={`${t.rotulo}: ${t.serie.join(', ')}`}>
          <path d={`${linha} L${xy[n - 1]![0].toFixed(1)} 48 L${xy[0]![0].toFixed(1)} 48 Z`} fill={cor} opacity={0.1} />
          <path d={linha} fill="none" stroke={cor} strokeWidth={2} strokeLinejoin="round" vectorEffect="non-scaling-stroke" />
          <circle cx={xy[n - 1]![0]} cy={xy[n - 1]![1]} r={3.5} fill={cor} />
        </svg>
      )}
      <div className="text-xs text-text-2">{t.nota}</div>
      <div className="text-xs text-text-3">
        {t.fonteUrl ? <a href={t.fonteUrl} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{t.fonte}</a> : t.fonte}
      </div>
      <div className="mt-auto">
        <SetoresImpactados t={t} contas={contas} />
      </div>
    </div>
  );
}

/** Indicadores macro com sparkline + a agenda que pode mexer no clima. */
export function Indicadores({ clima }: { clima: Clima }) {
  const { indicadores, agenda } = clima.dados;
  return (
    <div className="grid gap-4 sm:grid-cols-2 lg:col-span-2 xl:grid-cols-3">
      {indicadores.map(t => (
        <CartaoIndicador key={t.rotulo} t={t} contas={clima.contas} />
      ))}
      <div className="vr-card flex flex-wrap items-center gap-x-6 gap-y-2.5 px-4 py-3.5 sm:col-span-full">
        <span className="text-xs font-bold tracking-[0.06em] text-text-2 uppercase">Agenda</span>
        {agenda.map(g => (
          <span key={g.t} className="inline-flex items-center gap-2 text-sm">
            <span className={cn('vr-data text-xs font-semibold text-cool')}>{g.d}</span>
            {g.t}
          </span>
        ))}
      </div>
    </div>
  );
}

/** Eventos fiscais e fechamento dos mercados. */
export function PoliticaBolsa({ clima }: { clima: Clima }) {
  const itens = clima.dados.politicaBolsa ?? [];
  if (!itens.length) return null;
  return (
    <section aria-labelledby="politica-t" className="flex flex-col gap-3">
      <div>
        <h2 id="politica-t" className="font-display text-xl font-semibold">
          Política e bolsa
        </h2>
        <p className="mt-0.5 text-sm text-text-3">
          Decisões fiscais e movimentos de bolsa e câmbio que podem influenciar orçamento e custo de capital.
        </p>
      </div>
      <div className="grid gap-4 sm:grid-cols-2 xl:grid-cols-4">
        {itens.map(t => (
          <CartaoIndicador key={t.rotulo} t={t} contas={clima.contas} />
        ))}
      </div>
    </section>
  );
}
