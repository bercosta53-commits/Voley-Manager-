'use client';

import Link from 'next/link';
import type { Clima, EstadoClima, Vertical } from '@/lib/clima';
import { COR_CLIMA, ESTADOS_CLIMA, FUNDO_CLIMA, ICONE_CLIMA, estadoNaSemana, fmtClima } from '@/lib/clima';
import { hrefConta } from '@/lib/contas';
import { cn, dataCurta } from '@/lib/utils';
import { LogoConta } from '@/components/hoje/logo-conta';

const xs = (s: number) => 400 + (Math.max(-0.7, Math.min(0.7, s)) / 0.7) * 320;
const ys = (d: number) => 210 - (Math.max(-0.45, Math.min(0.45, d)) / 0.45) * 175;

/** Bolhas: nível do clima (x) × direção em 30 dias (y); tamanho = contas na base. */
export function MapaVerticais({
  clima,
  sel,
  filtro,
  hover,
  onSel,
  onFiltro,
  onHover,
}: {
  clima: Clima;
  sel: string;
  filtro: EstadoClima | 'todos';
  hover: string | null;
  onSel: (id: string) => void;
  onFiltro: (f: EstadoClima | 'todos') => void;
  onHover: (id: string | null) => void;
}) {
  const { bom, ruim } = clima.dados.limiares;
  const bolhas = [...clima.verticais].sort((a, b) => b.contas - a.contas);
  // rótulos sem sobrepor: o da bolha maior escolhe primeiro (em cima, depois embaixo); quem não cabe aparece no hover
  const raio = (v: Vertical) => (v.id === 'GEN' ? 34 : 8 + Math.sqrt(v.contas) * 3.2);
  const ocupados: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const rotulos = new Map<string, number>();
  for (const v of [...bolhas].sort((a, b) => Number(b.id === sel) - Number(a.id === sel) || b.contas - a.contas)) {
    const cx = xs(v.S);
    const cy = ys(v.delta30);
    const w = v.nome.length * 6.6;
    for (const y of [cy - raio(v) - 6, cy + raio(v) + 14]) {
      const caixa = { x0: cx - w / 2, x1: cx + w / 2, y0: y - 11, y1: y + 2 };
      if (!ocupados.some(o => caixa.x0 < o.x1 && caixa.x1 > o.x0 && caixa.y0 < o.y1 && caixa.y1 > o.y0)) {
        ocupados.push(caixa);
        rotulos.set(v.id, y);
        break;
      }
    }
  }
  const hv = clima.verticais.find(v => v.id === hover);
  return (
    <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Mapa de clima por vertical</h2>
          <p className="mt-0.5 text-sm text-text-3">Nível do clima × direção nos últimos 30 dias. Tamanho = contas na base. Clique numa vertical.</p>
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {(['todos', ...ESTADOS_CLIMA] as const).map(f => {
            const on = filtro === f;
            const cor = f === 'todos' ? 'var(--vr-text)' : COR_CLIMA[f];
            return (
              <button
                key={f}
                type="button"
                aria-pressed={on}
                onClick={() => onFiltro(f)}
                className="h-8 rounded-chip border px-2.5 text-xs font-semibold"
                style={{ borderColor: on ? cor : 'var(--vr-border-strong)', color: on ? cor : 'var(--vr-text-2)', background: on ? 'var(--vr-surface-2)' : 'transparent' }}
              >
                {f === 'todos' ? 'Todos' : `${ICONE_CLIMA[f]} ${f}`}
              </button>
            );
          })}
        </div>
      </div>
      <svg viewBox="0 0 760 460" className="w-full" role="img" aria-label="Gráfico de bolhas: verticais por nível e tendência do clima">
        <rect x={60} y={20} width={340} height={190} fill="var(--vr-ok)" opacity={0.03} />
        <rect x={400} y={20} width={340} height={190} fill="var(--vr-ok)" opacity={0.08} />
        <rect x={60} y={210} width={340} height={200} fill="var(--vr-risk)" opacity={0.08} />
        <rect x={400} y={210} width={340} height={200} fill="var(--vr-risk)" opacity={0.03} />
        <line x1={400} y1={20} x2={400} y2={410} stroke="var(--vr-border-strong)" strokeDasharray="4 4" />
        <line x1={60} y1={210} x2={740} y2={210} stroke="var(--vr-border-strong)" strokeDasharray="4 4" />
        <line x1={xs(bom)} y1={20} x2={xs(bom)} y2={410} stroke="var(--vr-ok)" strokeOpacity={0.4} />
        <line x1={xs(ruim)} y1={20} x2={xs(ruim)} y2={410} stroke="var(--vr-risk)" strokeOpacity={0.4} />
        <text x={70} y={38} className="fill-text-3 text-[12px]">Ruim, mas melhorando</text>
        <text x={730} y={38} textAnchor="end" className="text-[12px] font-semibold" fill="var(--vr-ok)">Bom e melhorando</text>
        <text x={70} y={400} className="text-[12px] font-semibold" fill="var(--vr-risk)">Ruim e piorando</text>
        <text x={730} y={400} textAnchor="end" className="fill-text-3 text-[12px]">Bom, mas esfriando</text>
        <text x={xs(ruim)} y={428} textAnchor="middle" className="vr-data text-[11px]" fill="var(--vr-risk)">{fmtClima(ruim)}</text>
        <text x={xs(bom)} y={428} textAnchor="middle" className="vr-data text-[11px]" fill="var(--vr-ok)">{fmtClima(bom)}</text>
        <text x={400} y={448} textAnchor="middle" className="fill-text-3 text-[12px]">Nível do clima (S) →</text>
        <text x={22} y={215} textAnchor="middle" transform="rotate(-90 22 215)" className="fill-text-3 text-[12px]">Tendência 30 dias →</text>
        {bolhas.map(v => {
          const r = raio(v);
          const yRotulo = rotulos.get(v.id);
          const cx = xs(v.S);
          const cy = ys(v.delta30);
          const selecionada = sel === v.id;
          const apagada = filtro !== 'todos' && filtro !== v.estado;
          const cor = COR_CLIMA[v.estado];
          return (
            <g
              key={v.id}
              opacity={apagada ? 0.18 : 1}
              className="cursor-pointer"
              role="button"
              tabIndex={0}
              aria-label={`${v.nome}: ${v.estado}, nível ${fmtClima(v.S)}, ${v.contas} contas`}
              onClick={() => onSel(v.id)}
              onKeyDown={e => (e.key === 'Enter' || e.key === ' ') && onSel(v.id)}
              onMouseEnter={() => onHover(v.id)}
              onMouseLeave={() => onHover(null)}
              onFocus={() => onHover(v.id)}
              onBlur={() => onHover(null)}
            >
              <circle
                cx={cx}
                cy={cy}
                r={r}
                fill={cor}
                fillOpacity={0.2}
                stroke={selecionada ? 'var(--vr-text)' : cor}
                strokeWidth={selecionada ? 3 : 1.5}
                strokeDasharray={v.estado === 'Instável' && !selecionada ? '4 3' : undefined}
              />
              <circle cx={cx} cy={cy} r={3} fill={cor} />
              {yRotulo !== undefined && (
                <text x={cx} y={yRotulo} textAnchor="middle" className="fill-foreground text-[12px] font-semibold" style={{ paintOrder: 'stroke', stroke: 'var(--vr-surface)', strokeWidth: 3 }}>
                  {v.nome}
                </text>
              )}
            </g>
          );
        })}
        {hv &&
          (() => {
            const x = Math.min(500, Math.max(62, xs(hv.S) + 18));
            const y = Math.min(330, Math.max(24, ys(hv.delta30) - 80));
            return (
              <g pointerEvents="none">
                <rect x={x} y={y} width={236} height={66} rx={6} fill="var(--vr-surface-3)" stroke="var(--vr-border-strong)" />
                <text x={x + 12} y={y + 20} className="fill-foreground text-[13px] font-bold">
                  {hv.nome} · {hv.estado}
                </text>
                <text x={x + 12} y={y + 38} className="vr-data fill-text-2 text-[12px]">
                  S {fmtClima(hv.S)} · Δ30d {fmtClima(hv.delta30)} · {hv.contas} contas
                </text>
                <text x={x + 12} y={y + 56} className="fill-text-3 text-[11px]">
                  {hv.porque.length > 38 ? `${hv.porque.slice(0, 37)}…` : hv.porque}
                </text>
              </g>
            );
          })()}
      </svg>
      <div className="flex flex-wrap gap-4 text-xs text-text-2">
        {(['Bom', 'Neutro', 'Ruim'] as const).map(e => (
          <span key={e} className="inline-flex items-center gap-1.5">
            <span className="size-2.5 rounded-full" style={{ background: COR_CLIMA[e] }} />
            {e}
          </span>
        ))}
        <span className="inline-flex items-center gap-1.5">
          <span className="size-2.5 rounded-full border-2 border-dashed" style={{ borderColor: COR_CLIMA.Instável }} />
          Instável (contorno tracejado)
        </span>
      </div>
    </div>
  );
}

/** Vertical selecionada: nível, direção, o que puxa o clima, 26 semanas, contas mais quentes e a jogada. */
export function PainelVertical({ clima, v }: { clima: Clima; v: Vertical }) {
  const { pesos, limiares } = clima.dados;
  const partes: [string, number][] =
    v.id === 'GEN'
      ? [['Macro geral', v.macro]]
      : [
          [`Macro geral (×${pesos.macro.toFixed(2).replace('.', ',')})`, pesos.macro * v.macro],
          [`Driver setorial (×${pesos.setorial.toFixed(2).replace('.', ',')})`, pesos.setorial * v.setorial],
          [`Notícias (×${pesos.noticias.toFixed(2).replace('.', ',')})`, pesos.noticias * v.noticias],
        ];
  const serie = v.serie(26);
  return (
    <aside aria-label="Vertical selecionada" className="flex min-w-0 flex-[1_1_360px] flex-col gap-3.5 rounded-card border border-border bg-[var(--vr-surface-2)] p-4.5">
      <div className="flex items-start justify-between gap-2">
        <div>
          <div className="text-xs text-text-3">
            {v.codigos.join(' + ')} · {v.contas} contas · Tier A {v.tierA}
          </div>
          <h3 className="mt-0.5 font-display text-2xl font-semibold">{v.nome}</h3>
        </div>
        <span className="rounded-chip px-2.5 py-1 text-sm font-bold whitespace-nowrap" style={{ background: FUNDO_CLIMA[v.estado], color: COR_CLIMA[v.estado] }}>
          {ICONE_CLIMA[v.estado]} {v.estado}
        </span>
      </div>
      <div className="grid grid-cols-3 gap-2">
        <Mini rotulo="Nível S" valor={fmtClima(v.S)} />
        <Mini rotulo="Δ 30 dias" valor={fmtClima(v.delta30)} cor={v.delta30 >= 0 ? 'var(--vr-ok)' : 'var(--vr-risk)'} />
        <Mini rotulo="Confiança" valor={v.confianca} texto />
      </div>
      <p className="text-sm text-text-2">
        {v.porque} <span className="text-text-3">· desde {dataCurta(v.desde)}</span>
      </p>

      <div>
        <Titulo>O que puxa o clima</Titulo>
        <svg viewBox="0 0 340 112" className="w-full overflow-visible" role="img" aria-label="Decomposição do clima da vertical selecionada">
          <line x1={250} y1={4} x2={250} y2={108} stroke="var(--vr-border-strong)" />
          {partes.map(([rotulo, val], i) => {
            const w = Math.max(2, Math.min(1, Math.abs(val) / 0.25) * 70);
            const neg = val < 0;
            const y = 8 + i * 34;
            return (
              <g key={rotulo}>
                <text x={0} y={y + 13} className="fill-text-2 text-[12px]">
                  {rotulo}
                </text>
                <rect x={neg ? 250 - w : 250} y={y} width={w} height={18} rx={3} fill={neg ? 'var(--vr-risk)' : 'var(--vr-ok)'} opacity={0.85} />
                <text x={neg ? 250 - w - 5 : 250 + w + 5} y={y + 13} textAnchor={neg ? 'end' : 'start'} className="vr-data fill-foreground text-[11px]">
                  {fmtClima(val)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      <div>
        <Titulo>Histórico de estados · 26 semanas</Titulo>
        <svg viewBox="0 0 340 40" className="w-full" role="img" aria-label="Faixa de estados semanais da vertical">
          {serie.map((x, i) => (
            <rect key={i} x={i * 13} y={4} width={12} height={24} rx={2} fill={COR_CLIMA[estadoNaSemana(x, v, 25 - i, limiares)]} opacity={0.35 + 0.65 * (i / 25)} />
          ))}
          <text x={0} y={39} className="vr-data fill-text-3 text-[10px]">
            26 sem
          </text>
          <text x={338} y={39} textAnchor="end" className="vr-data fill-text-3 text-[10px]">
            hoje
          </text>
        </svg>
      </div>

      <div>
        <Titulo>Contas mais quentes</Titulo>
        {v.quentes.length === 0 && <p className="text-xs text-text-3">Nenhuma conta da base nesta vertical.</p>}
        {v.quentes.map(c => (
          <Link key={c.id} href={hrefConta(c.id)} className="flex items-center justify-between gap-2 border-b border-border py-2 hover:text-foreground">
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <LogoConta nome={c.nome} dominio={c.dominio} tamanho={20} className="rounded-[4px]" />
              <span className="truncate">{c.nome}</span>
            </span>
            <span className="flex items-center gap-2.5">
              <span className="text-[11px] text-text-3">Tier {c.tier}</span>
              <span className="vr-data min-w-7 text-right text-sm">{c.score}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="rounded-control border border-acid/40 bg-acid-soft p-3">
        <div className="text-[11px] font-bold tracking-[0.06em] text-foreground uppercase">Jogada da vertical</div>
        <div className="mt-0.5 text-md font-bold">{v.jogada}</div>
        <div className="mt-0.5 text-xs text-text-2">{v.jogadaTexto}</div>
      </div>
    </aside>
  );
}

function Mini({ rotulo, valor, cor, texto }: { rotulo: string; valor: string; cor?: string; texto?: boolean }) {
  return (
    <div className="rounded-control bg-[var(--vr-surface)] p-2.5">
      <div className="text-[11px] text-text-3">{rotulo}</div>
      <div className={cn(texto ? 'pt-0.5 text-sm font-semibold' : 'vr-data text-lg')} style={cor ? { color: cor } : undefined}>
        {valor}
      </div>
    </div>
  );
}

export function Titulo({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-bold tracking-[0.06em] text-text-2 uppercase">{children}</div>;
}
