'use client';

import { useEffect, useId, useRef, useState } from 'react';
import { NIVEL_GATILHO } from '@/lib/papeis';
import { cn } from '@/lib/utils';

export interface EventoGrafico {
  data: string;
  pontos: number;
  rotulo: string;
  nivel: 'A' | 'B' | 'C';
  /** o sinal do cartão: ganha anel em volta e rótulo sempre visível */
  atual?: boolean;
}

const DIAS = 180;

/** Série diária, inclusive os dois extremos: D−180 até D0. */
export function temHistorico180(serie: number[]) {
  return serie.length === DIAS + 1 && serie.every(v => Number.isFinite(v) && v >= 0 && v <= 100);
}
const A = 144;
const M = { topo: 34, base: 22, esq: 28, dir: 8 };
/** distância mínima, em px, entre dois rótulos de pontos: rótulo que cairia em cima de outro fica no tooltip */
const VAO_ROTULO = 36;

function diasAtras(data: string, hoje: string) {
  return Math.round((Date.parse(hoje) - Date.parse(data)) / 86_400_000);
}

/**
 * Score de 180 dias quando existe série diária válida. Sem ela, mostra apenas as contribuições atuais
 * por data do fato: não replica o score atual no passado, nem confunde parcelas atuais com score histórico.
 */
export function GraficoSinais({
  serie,
  eventos,
  hoje,
  className,
  marca,
}: {
  serie: number[];
  eventos: EventoGrafico[];
  hoje: string;
  className?: string;
  /** anotação vertical: dia em que um playbook combinado foi ativado, com o nome dele */
  marca?: { data: string; rotulo: string };
}) {
  // desenha na largura real do espaço (sem esticar o SVG): o texto fica sempre no mesmo tamanho
  const caixa = useRef<HTMLDivElement>(null);
  const [L, setL] = useState(560);
  useEffect(() => {
    const el = caixa.current;
    if (!el) return;
    const medir = () => el.clientWidth > 0 && setL(el.clientWidth);
    medir();
    const ro = new ResizeObserver(medir);
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  const gradiente = useId();
  const historico = temHistorico180(serie);
  const visiveis = eventos.filter(e => {
    const d = diasAtras(e.data, hoje);
    return Number.isFinite(d) && d >= 0 && d <= DIAS && Number.isFinite(e.pontos);
  });
  const minimo = !historico && visiveis.some(e => e.pontos < 0) ? -100 : 0;
  const w = Math.max(1, L - M.esq - M.dir);
  const h = A - M.topo - M.base;
  const x = (diasAtrasDoHoje: number) => M.esq + ((DIAS - Math.min(DIAS, Math.max(0, diasAtrasDoHoje))) / DIAS) * w;
  const y = (v: number) => M.topo + h - ((Math.min(100, Math.max(minimo, v)) - minimo) / (100 - minimo)) * h;
  const valores = historico ? serie : [];
  const pts = valores.map((v, i) => [M.esq + (i / (valores.length - 1)) * w, y(v)] as const);
  const linha = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = `${linha} L${(M.esq + w).toFixed(1)} ${M.topo + h} L${M.esq} ${M.topo + h} Z`;
  const valorNoDia = (d: number) => {
    const pos = ((DIAS - Math.min(DIAS, Math.max(0, d))) / DIAS) * (valores.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    return (valores[i] ?? 0) * (1 - f) + (valores[Math.min(i + 1, valores.length - 1)] ?? 0) * f;
  };

  // rótulo de pontos: o sinal do cartão primeiro, depois os mais fortes, até 4, sem dois rótulos sobrepostos;
  // o resto fica no tooltip
  const rotulados = new Set<string>();
  const xsRotulados: number[] = [];
  for (const e of [...visiveis].sort(
    (a, b) => Number(!!b.atual) - Number(!!a.atual) || Math.abs(b.pontos) - Math.abs(a.pontos)
  )) {
    if (rotulados.size >= 4) break;
    const cx = x(diasAtras(e.data, hoje));
    if (xsRotulados.some(px => Math.abs(px - cx) < VAO_ROTULO)) continue;
    rotulados.add(`${e.data}-${e.rotulo}`);
    xsRotulados.push(cx);
  }
  const atual = valores[valores.length - 1] ?? 0;

  return (
    <div ref={caixa} className={cn('w-full', className)}>
      <svg
        width={L}
        height={A}
        viewBox={`0 0 ${L} ${A}`}
        className="block overflow-visible"
        role="img"
        aria-label={`${historico ? 'Score histórico' : 'Contribuição atual dos sinais, sem histórico de score'} em 180 dias, ${visiveis.length} sinais`}
      >
        <defs>
          <linearGradient id={gradiente} x1="0" x2="0" y1="0" y2="1">
            <stop offset="0%" stopColor="var(--vr-warm)" stopOpacity={0.22} />
            <stop offset="100%" stopColor="var(--vr-warm)" stopOpacity={0} />
          </linearGradient>
        </defs>
        {(minimo < 0 ? [-100, -50, 0, 50, 100] : [0, 50, 100]).map(v => (
          <g key={v}>
            <line
              x1={M.esq}
              x2={M.esq + w}
              y1={y(v)}
              y2={y(v)}
              stroke="var(--vr-border)"
              strokeWidth={1}
              strokeDasharray={v === 0 ? undefined : '2 3'}
            />
            <text x={M.esq - 6} y={y(v) + 4} textAnchor="end" className="vr-data fill-text-3 text-xs">
              {v}
            </text>
          </g>
        ))}
        {historico && <path d={area} fill={`url(#${gradiente})`} />}
        {historico && <path
          d={linha}
          fill="none"
          stroke="var(--vr-warm)"
          strokeWidth={1.75}
          strokeLinejoin="round"
          strokeLinecap="round"
        />}
        {visiveis.map(e => {
          const d = diasAtras(e.data, hoje);
          const cx = x(d);
          const cy = y(historico ? valorNoDia(d) : e.pontos);
          const cor = (NIVEL_GATILHO[e.nivel] ?? NIVEL_GATILHO.C).ponto; // um campo fora do contrato não derruba Hoje
          const chave = `${e.data}-${e.rotulo}`;
          return (
            <g key={chave}>
              <title>{`${e.rotulo} · ${e.pontos < 0 ? '−' : '+'}${Math.round(Math.abs(e.pontos))} pts · ${e.data.split('-').reverse().join('/')}`}</title>
              <line
                x1={cx}
                x2={cx}
                y1={cy}
                y2={y(0)}
                stroke={cor}
                strokeWidth={1}
                strokeDasharray="1.5 2"
                opacity={0.6}
              />
              {e.atual && <circle cx={cx} cy={cy} r={6.5} fill="none" stroke={cor} strokeWidth={1.25} opacity={0.5} />}
              <circle cx={cx} cy={cy} r={e.atual ? 4 : 3} fill={cor} stroke="var(--vr-surface)" strokeWidth={1.5} />
              {rotulados.has(chave) && (
                <text x={cx} y={cy - 9} textAnchor="middle" className="vr-data text-xs font-semibold" fill={cor}>
                  {e.pontos < 0 ? `−${Math.round(Math.abs(e.pontos))}` : `+${Math.round(e.pontos)}`}
                </text>
              )}
            </g>
          );
        })}
        {marca && diasAtras(marca.data, hoje) >= 0 && diasAtras(marca.data, hoje) <= DIAS && (() => {
          const mx = x(diasAtras(marca.data, hoje));
          const direita = mx > M.esq + w / 2;
          return (
            <g aria-label={`Playbook ativado: ${marca.rotulo}`}>
              <line x1={mx} x2={mx} y1={M.topo - 4} y2={M.topo + h} stroke="var(--vr-text)" strokeWidth={1} strokeDasharray="3 3" opacity={0.45} />
              <text x={direita ? mx - 4 : mx + 4} y={12} textAnchor={direita ? 'end' : 'start'} className="fill-text-2 text-xs font-semibold">
                ⚡ {marca.rotulo}
              </text>
            </g>
          );
        })()}
        {historico && <circle cx={M.esq + w} cy={y(atual)} r={2.5} fill="var(--vr-warm)" />}
        <text x={M.esq} y={A - 3} className="fill-text-3 text-xs">
          180 dias
        </text>
        <text x={M.esq + w / 2} y={A - 3} textAnchor="middle" className="fill-text-3 text-xs">
          90
        </text>
        <text x={M.esq + w} y={A - 3} textAnchor="end" className="fill-text-3 text-xs">
          hoje
        </text>
      </svg>
    </div>
  );
}
