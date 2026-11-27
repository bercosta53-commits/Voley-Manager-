'use client';

import Link from 'next/link';
import type { Clima, EstadoClima, Vertical } from '@/lib/clima';
import { COR_CLIMA, ESTADOS_CLIMA, FUNDO_CLIMA, ICONE_CLIMA, estadoNaSemana, fmtClima, referenciaComercial, quadranteComercial } from '@/lib/clima';
import { hrefConta } from '@/lib/contas';
import { cn, dataCurta, pontos } from '@/lib/utils';
import { LogoConta } from '@/components/hoje/logo-conta';

const formato = (n: number | null) => n === null ? '—' : n.toLocaleString('pt-BR', { maximumFractionDigits: 1, minimumFractionDigits: 1 });

/** Clima externo × VSCS puro das contas A/B. Sem histórico ou coordenadas artificiais. */
export function MapaVerticais({
  clima, sel, filtro, hover, onSel, onFiltro, onHover,
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
  const referencia = referenciaComercial(clima.verticais);
  const bolhas = clima.verticais.filter(v => v.intensidade.media !== null).sort((a, b) => b.intensidade.contasICP - a.intensidade.contasICP);
  const semDados = clima.verticais.filter(v => v.intensidade.media === null);
  const teto = Math.min(100, Math.max(20, Math.ceil(Math.max(0, ...bolhas.map(v => v.intensidade.media ?? 0)) / 10) * 10 + 10));
  const limiteX = Math.max(0.5, Math.ceil(Math.max(Math.abs(bom), Math.abs(ruim), ...clima.verticais.map(v => Math.abs(v.S))) * 10) / 10);
  const X0 = 64, X1 = 734, Y0 = 48, Y1 = 388;
  const xs = (s: number) => X0 + (s + limiteX) / (2 * limiteX) * (X1 - X0);
  const ys = (v: Vertical) => Y1 - (v.intensidade.media ?? 0) / teto * (Y1 - Y0);
  const corteX = xs(bom);
  const corteY = referencia === null ? Y0 : Y1 - referencia / teto * (Y1 - Y0);
  const maxContas = Math.max(1, ...bolhas.map(v => v.intensidade.contasICP));
  const raio = (v: Vertical) => 5 + 25 * Math.sqrt(v.intensidade.contasICP / maxContas);
  const ocupados: { x0: number; x1: number; y0: number; y1: number }[] = [];
  const rotulos = new Map<string, number>();
  for (const v of [...bolhas].sort((a, b) => Number(b.id === sel) - Number(a.id === sel) || b.intensidade.contasICP - a.intensidade.contasICP)) {
    const cx = xs(v.S), cy = ys(v), w = v.nome.length * 6.4;
    for (const y of [cy - raio(v) - 6, cy + raio(v) + 14]) {
      const caixa = { x0: cx - w / 2, x1: cx + w / 2, y0: y - 11, y1: y + 2 };
      if (caixa.y0 < 24 || caixa.y1 > 418 || caixa.x0 < 36 || caixa.x1 > 755) continue;
      if (!ocupados.some(o => caixa.x0 < o.x1 && caixa.x1 > o.x0 && caixa.y0 < o.y1 && caixa.y1 > o.y0)) {
        ocupados.push(caixa);
        rotulos.set(v.id, y);
        break;
      }
    }
  }
  const hv = bolhas.find(v => v.id === hover);
  const ticks = Array.from({ length: 5 }, (_, i) => i * teto / 4);
  return (
    <div className="flex min-w-0 flex-[999_1_640px] flex-col gap-3">
      <div className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h2 className="font-display text-xl font-semibold">Mapa de oportunidades por vertical</h2>
          <p className="mt-0.5 text-sm text-text-3">Clima externo × intensidade comercial (VSCS médio das contas Tier A e B). Bolha maior = mais contas no ICP.</p>
        </div>
        <div role="group" aria-label="Filtrar por estado" className="flex flex-wrap gap-1.5">
          {(['todos', ...ESTADOS_CLIMA] as const).map(f => {
            const on = filtro === f;
            const cor = f === 'todos' ? 'var(--vr-text)' : COR_CLIMA[f];
            return (
              <button key={f} type="button" aria-pressed={on} onClick={() => onFiltro(f)}
                className="h-8 rounded-chip border px-2.5 text-xs font-semibold"
                style={{ borderColor: on ? cor : 'var(--vr-border-strong)', color: on ? cor : 'var(--vr-text-2)', background: on ? 'var(--vr-surface-2)' : 'transparent' }}>
                {f === 'todos' ? 'Todos' : `${ICONE_CLIMA[f]} ${f}`}
              </button>
            );
          })}
        </div>
      </div>
      {referencia === null ? <p className="rounded-control border border-border p-5 text-sm text-text-3">Ainda não há VSCS válido nas contas A/B para construir o mapa.</p> : (
      <svg viewBox="0 0 760 460" className="w-full" role="group" aria-label="Mapa de oportunidades: clima e intensidade comercial">
        <rect x={X0} y={Y0} width={corteX-X0} height={Math.max(0,corteY-Y0)} fill="var(--vr-warm)" opacity={0.07} />
        <rect x={corteX} y={Y0} width={X1-corteX} height={Math.max(0,corteY-Y0)} fill="var(--vr-ok)" opacity={0.10} />
        <rect x={X0} y={corteY} width={corteX-X0} height={Y1-corteY} fill="var(--vr-risk)" opacity={0.05} />
        <rect x={corteX} y={corteY} width={X1-corteX} height={Y1-corteY} fill="var(--vr-cool)" opacity={0.07} />
        {ticks.map(t => {
          const y = Y1 - t / teto * (Y1-Y0);
          return <g key={t}><line x1={X0} x2={X1} y1={y} y2={y} stroke="var(--vr-border)" strokeDasharray="2 4" /><text x={X0-8} y={y+4} textAnchor="end" className="vr-data fill-text-3 text-xs">{t.toLocaleString('pt-BR')}</text></g>;
        })}
        <line x1={corteX} x2={corteX} y1={Y0} y2={Y1} stroke="var(--vr-ok)" strokeDasharray="4 4" strokeOpacity={0.65} />
        <line x1={xs(ruim)} x2={xs(ruim)} y1={Y0} y2={Y1} stroke="var(--vr-risk)" strokeOpacity={0.35} />
        <line x1={X0} x2={X1} y1={corteY} y2={corteY} stroke="var(--vr-text-3)" strokeDasharray="4 4" strokeOpacity={0.7} />
        <text x={X0+8} y={Y0+14} className="fill-text-2 text-xs font-semibold">Contramão</text>
        <text x={X1-8} y={Y0+14} textAnchor="end" className="fill-text-2 text-xs font-semibold">Sweet spot</text>
        {Y1-corteY > 32 && <><text x={X0+8} y={Y1-8} className="fill-text-2 text-xs font-semibold">Baixa prioridade</text><text x={X1-8} y={Y1-8} textAnchor="end" className="fill-text-2 text-xs font-semibold">Mercado latente</text></>}
        <text x={X1-4} y={Math.max(Y0+28,corteY-5)} textAnchor="end" className="vr-data fill-text-3 text-xs">Média A/B: {formato(referencia)}</text>
        <text x={xs(ruim)} y={425} textAnchor="middle" className="vr-data text-xs" fill="var(--vr-risk)">{fmtClima(ruim)}</text>
        <text x={xs(0)} y={425} textAnchor="middle" className="vr-data fill-text-3 text-xs">0</text>
        <text x={corteX} y={425} textAnchor="middle" className="vr-data text-xs" fill="var(--vr-ok)">{fmtClima(bom)}</text>
        <text x={(X0+X1)/2} y={448} textAnchor="middle" className="fill-text-3 text-xs">Clima econômico e setorial (S) →</text>
        <text x={17} y={218} textAnchor="middle" transform="rotate(-90 17 218)" className="fill-text-3 text-xs">Intensidade comercial · VSCS médio (0–100) →</text>
        {bolhas.map(v => {
          const cx = xs(v.S), cy = ys(v), r = raio(v);
          const selecionada = sel === v.id, apagada = filtro !== 'todos' && filtro !== v.estado;
          const cor = COR_CLIMA[v.estado], yRotulo = rotulos.get(v.id);
          return <g key={v.id} opacity={apagada ? 0.16 : 1} className="cursor-pointer" role="button" tabIndex={apagada ? -1 : 0}
            aria-label={`${v.nome}: ${v.estado}, clima ${fmtClima(v.S)}, VSCS médio ${formato(v.intensidade.media)}, ${v.intensidade.comScore} de ${v.intensidade.contasICP} contas A/B avaliadas, ${quadranteComercial(v.S,v.intensidade.media,referencia,bom)}`}
            onClick={() => onSel(v.id)} onKeyDown={e => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); onSel(v.id); } }}
            onMouseEnter={() => onHover(v.id)} onMouseLeave={() => onHover(null)} onFocus={() => onHover(v.id)} onBlur={() => onHover(null)}>
            <circle cx={cx} cy={cy} r={r} fill={cor} fillOpacity={0.20} stroke={selecionada ? 'var(--vr-text)' : cor} strokeWidth={selecionada ? 3 : 1.5}
              strokeDasharray={v.estado === 'Instável' && !selecionada ? '4 3' : undefined} />
            <circle cx={cx} cy={cy} r={3} fill={cor} />
            {yRotulo !== undefined && <text x={cx} y={yRotulo} textAnchor="middle" className="fill-foreground text-xs font-semibold" style={{ paintOrder:'stroke', stroke:'var(--vr-surface)', strokeWidth:3 }}>{v.nome}</text>}
          </g>;
        })}
        {hv && (() => {
          const x = Math.min(470, Math.max(66, xs(hv.S)+18)), y = Math.min(300, Math.max(22, ys(hv)-80));
          return <g pointerEvents="none">
            <rect x={x} y={y} width={270} height={79} rx={6} fill="var(--vr-surface-3)" stroke="var(--vr-border-strong)" />
            <text x={x+12} y={y+18} className="fill-foreground text-[13px] font-bold">{hv.nome} · {hv.estado}</text>
            <text x={x+12} y={y+35} className="vr-data fill-text-2 text-xs">S {fmtClima(hv.S)} · VSCS {formato(hv.intensidade.media)}</text>
            <text x={x+12} y={y+51} className="fill-text-2 text-xs">{hv.intensidade.comScore}/{hv.intensidade.contasICP} A/B avaliadas · {hv.intensidade.comSinal} com VSCS &gt; 0</text>
            <text x={x+12} y={y+67} className="fill-text-3 text-xs">{quadranteComercial(hv.S,hv.intensidade.media,referencia,bom)}{hv.intensidade.comScore < 5 ? ' · amostra pequena' : ''}</text>
          </g>;
        })()}
      </svg>)}
      <div className="flex flex-wrap gap-4 text-xs text-text-2">
        {ESTADOS_CLIMA.map(e => <span key={e} className="inline-flex items-center gap-1.5"><span className={cn('size-2.5 rounded-full',e === 'Instável' && 'border-2 border-dashed')} style={e === 'Instável' ? { borderColor: COR_CLIMA[e] } : { background: COR_CLIMA[e] }} />{e}</span>)}
      </div>
      <p className="text-xs text-text-3">Corte vertical: clima favorável a partir de {fmtClima(bom)}. Corte horizontal: média de VSCS das contas A/B avaliadas ({formato(referencia)}). Clima neutro permanece à esquerda; VSCS zero não comprova ausência de atividade. Amostras com menos de 5 contas avaliadas exigem cautela.</p>
      {semDados.length > 0 && <div className="flex flex-wrap items-center gap-1.5 text-xs text-text-3"><span>Sem VSCS A/B:</span>{semDados.map(v => <button key={v.id} type="button" onClick={() => onSel(v.id)} className="rounded-chip border border-border px-2 py-1 hover:text-foreground">{v.nome}</button>)}</div>}
    </div>
  );
}

/** Vertical selecionada: evidências, contas e ação comercial. */
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
  const temHistorico = clima.dados.historicoMedido !== false;
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
        <Mini rotulo="VSCS médio A/B" valor={formato(v.intensidade.media)} />
        <Mini rotulo="Confiança" valor={v.confianca} texto />
      </div>
      <div className="rounded-control border border-border p-2.5 text-xs text-text-2">
        <span className="font-semibold">{quadranteComercial(v.S,v.intensidade.media,referenciaComercial(clima.verticais),limiares.bom)}</span>
        <span className="text-text-3"> · {v.intensidade.comScore}/{v.intensidade.contasICP} A/B avaliadas · {v.intensidade.comSinal} com VSCS &gt; 0{v.intensidade.comScore > 0 && v.intensidade.comScore < 5 ? ' · amostra pequena' : ''}</span>
      </div>
      <p className="text-sm text-text-2">
        {v.porque} {temHistorico && <span className="text-text-3">· desde {dataCurta(v.desde)}</span>}
      </p>
      {v.fontes?.length ? (
        <ul aria-label="Fontes da vertical" className="flex flex-wrap gap-x-3 gap-y-1 text-xs text-text-3">
          {v.fontes.map(f => <li key={f.url}><a href={f.url} target="_blank" rel="noreferrer" className="underline underline-offset-2 hover:text-foreground">{f.nome}</a></li>)}
        </ul>
      ) : null}

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
                <text x={0} y={y + 13} className="fill-text-2 text-xs">
                  {rotulo}
                </text>
                <rect x={neg ? 250 - w : 250} y={y} width={w} height={18} rx={3} fill={neg ? 'var(--vr-risk)' : 'var(--vr-ok)'} opacity={0.85} />
                <text x={neg ? 250 - w - 5 : 250 + w + 5} y={y + 13} textAnchor={neg ? 'end' : 'start'} className="vr-data fill-foreground text-xs">
                  {fmtClima(val)}
                </text>
              </g>
            );
          })}
        </svg>
      </div>

      {temHistorico && <div>
        <Titulo>Histórico de estados · 26 semanas</Titulo>
        <svg viewBox="0 0 340 40" className="w-full" role="img" aria-label="Faixa de estados semanais da vertical">
          {v.serie(26).map((x, i) => (
            <rect key={i} x={i * 13} y={4} width={12} height={24} rx={2} fill={COR_CLIMA[estadoNaSemana(x, v, 25 - i, limiares)]} opacity={0.35 + 0.65 * (i / 25)} />
          ))}
          <text x={0} y={39} className="vr-data fill-text-3 text-xs">
            26 sem
          </text>
          <text x={338} y={39} textAnchor="end" className="vr-data fill-text-3 text-xs">
            hoje
          </text>
        </svg>
      </div>}

      <div>
        <Titulo>Contas mais quentes</Titulo>
        {v.quentes.length === 0 && <p className="text-xs text-text-3">Nenhuma conta da base nesta vertical.</p>}
        {v.quentes.map(c => (
          <Link key={c.id} href={hrefConta(c.id)} className="flex items-center justify-between gap-2 border-b border-border py-2 hover:text-foreground">
            <span className="flex min-w-0 items-center gap-2 font-semibold">
              <LogoConta nome={c.nome} dominio={c.dominio} tamanho={20} className="rounded-chip" />
              <span className="truncate">{c.nome}</span>
            </span>
            <span className="flex items-center gap-2.5">
              <span className="text-xs text-text-3">Tier {c.tier}</span>
              <span className="vr-data min-w-7 text-right text-sm">{pontos(c.score)}</span>
            </span>
          </Link>
        ))}
      </div>
      <div className="rounded-control border border-acid/40 bg-acid-soft p-3">
        <div className="text-xs font-bold tracking-[0.06em] text-foreground uppercase">Jogada da vertical</div>
        <div className="mt-0.5 text-md font-bold">{v.jogada}</div>
        <div className="mt-0.5 text-xs text-text-2">{v.jogadaTexto}</div>
      </div>
    </aside>
  );
}

function Mini({ rotulo, valor, cor, texto }: { rotulo: string; valor: string; cor?: string; texto?: boolean }) {
  return (
    <div className="rounded-control bg-[var(--vr-surface)] p-2.5">
      <div className="text-xs text-text-3">{rotulo}</div>
      <div className={cn(texto ? 'pt-0.5 text-sm font-semibold' : 'vr-data text-lg')} style={cor ? { color: cor } : undefined}>
        {valor}
      </div>
    </div>
  );
}

export function Titulo({ children }: { children: React.ReactNode }) {
  return <div className="mb-2 text-xs font-bold tracking-[0.06em] text-text-2 uppercase">{children}</div>;
}
