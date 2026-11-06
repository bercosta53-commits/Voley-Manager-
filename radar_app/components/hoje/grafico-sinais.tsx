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

const DIAS = 90;
const L = 300;
const A = 104;
const M = { topo: 16, base: 18, esq: 4, dir: 4 };

function diasAtras(data: string, hoje: string) {
  return Math.round((Date.parse(hoje) - Date.parse(data)) / 86_400_000);
}

/**
 * Score dos últimos 90 dias (0–100, mesma escala em todo cartão, para comparar contas de olho) com cada
 * sinal marcado na data em que aconteceu: a curva sobe junto com os fatos. Cor da marca = nível do gatilho.
 */
export function GraficoSinais({ serie, eventos, hoje, className }: { serie: number[]; eventos: EventoGrafico[]; hoje: string; className?: string }) {
  const w = L - M.esq - M.dir;
  const h = A - M.topo - M.base;
  const x = (diasAtrasDoHoje: number) => M.esq + ((DIAS - Math.min(DIAS, Math.max(0, diasAtrasDoHoje))) / DIAS) * w;
  const y = (v: number) => M.topo + h - (Math.min(100, Math.max(0, v)) / 100) * h;
  const valores = serie.length > 1 ? serie : [serie[0] ?? 0, serie[0] ?? 0];
  const pts = valores.map((v, i) => [M.esq + (i / (valores.length - 1)) * w, y(v)] as const);
  const linha = pts.map(([px, py], i) => `${i ? 'L' : 'M'}${px.toFixed(1)} ${py.toFixed(1)}`).join(' ');
  const area = `${linha} L${(M.esq + w).toFixed(1)} ${M.topo + h} L${M.esq} ${M.topo + h} Z`;
  const valorNoDia = (d: number) => {
    const pos = ((DIAS - Math.min(DIAS, Math.max(0, d))) / DIAS) * (valores.length - 1);
    const i = Math.floor(pos);
    const f = pos - i;
    return (valores[i] ?? 0) * (1 - f) + (valores[Math.min(i + 1, valores.length - 1)] ?? 0) * f;
  };
  const visiveis = eventos.filter(e => diasAtras(e.data, hoje) <= DIAS && diasAtras(e.data, hoje) >= -30);
  // rótulo de pontos: o sinal do cartão e os dois mais fortes; o resto fica no tooltip
  const rotulados = new Set(
    [...visiveis]
      .sort((a, b) => Number(!!b.atual) - Number(!!a.atual) || b.pontos - a.pontos)
      .slice(0, 3)
      .map(e => `${e.data}-${e.rotulo}`),
  );
  const atual = valores[valores.length - 1] ?? 0;

  return (
    <svg viewBox={`0 0 ${L} ${A}`} className={cn('h-auto w-full overflow-visible', className)} role="img" aria-label={`Score de 90 dias com ${visiveis.length} sinais marcados na data`}>
      <defs>
        <linearGradient id="vrAreaScore" x1="0" x2="0" y1="0" y2="1">
          <stop offset="0%" stopColor="var(--vr-warm)" stopOpacity={0.22} />
          <stop offset="100%" stopColor="var(--vr-warm)" stopOpacity={0} />
        </linearGradient>
      </defs>
      {[0, 50, 100].map(v => (
        <g key={v}>
          <line x1={M.esq} x2={M.esq + w} y1={y(v)} y2={y(v)} stroke="var(--vr-border)" strokeWidth={1} strokeDasharray={v === 0 ? undefined : '2 3'} />
          <text x={M.esq + w} y={y(v) - 3} textAnchor="end" className="fill-text-3 text-[8px]">
            {v}
          </text>
        </g>
      ))}
      <path d={area} fill="url(#vrAreaScore)" />
      <path d={linha} fill="none" stroke="var(--vr-warm)" strokeWidth={1.75} strokeLinejoin="round" strokeLinecap="round" />
      {visiveis.map(e => {
        const d = diasAtras(e.data, hoje);
        const cx = x(d);
        const cy = y(valorNoDia(d));
        const cor = NIVEL_GATILHO[e.nivel].ponto;
        const chave = `${e.data}-${e.rotulo}`;
        return (
          <g key={chave}>
            <title>{`${e.rotulo} · +${e.pontos} pts · ${e.data.split('-').reverse().join('/')}`}</title>
            <line x1={cx} x2={cx} y1={cy} y2={M.topo + h} stroke={cor} strokeWidth={1} strokeDasharray="1.5 2" opacity={0.6} />
            {e.atual && <circle cx={cx} cy={cy} r={6.5} fill="none" stroke={cor} strokeWidth={1.25} opacity={0.5} />}
            <circle cx={cx} cy={cy} r={e.atual ? 4 : 3} fill={cor} stroke="var(--vr-surface)" strokeWidth={1.5} />
            {rotulados.has(chave) && (
              <text x={cx} y={cy - 8} textAnchor="middle" className="vr-data text-[9px] font-semibold" fill={cor}>
                +{e.pontos}
              </text>
            )}
          </g>
        );
      })}
      <circle cx={M.esq + w} cy={y(atual)} r={2.5} fill="var(--vr-warm)" />
      <text x={M.esq} y={A - 3} className="fill-text-3 text-[8px]">
        90 dias
      </text>
      <text x={M.esq + w / 2} y={A - 3} textAnchor="middle" className="fill-text-3 text-[8px]">
        45
      </text>
      <text x={M.esq + w} y={A - 3} textAnchor="end" className="fill-text-3 text-[8px]">
        hoje
      </text>
    </svg>
  );
}
