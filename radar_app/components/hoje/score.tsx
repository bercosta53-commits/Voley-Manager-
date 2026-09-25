import { ArrowDownRight, ArrowUpRight, Minus } from 'lucide-react';
import { cn } from '@/lib/utils';

function Curva({ serie, largura, altura, classe }: { serie: number[]; largura: number; altura: number; classe: string }) {
  const min = Math.min(...serie),
    max = Math.max(...serie);
  const faixa = Math.max(8, max - min);
  const pts = serie.map((v, i) => [(i / (serie.length - 1)) * largura, altura - 2 - ((v - min) / faixa) * (altura - 4)] as const);
  const d = pts.map(([x, y], i) => `${i ? 'L' : 'M'}${x.toFixed(1)} ${y.toFixed(1)}`).join(' ');
  const [ux, uy] = pts[pts.length - 1]!;
  return (
    <svg width={largura} height={altura} viewBox={`0 0 ${largura} ${altura}`} aria-hidden className={cn('overflow-visible', classe)}>
      <path d={d} fill="none" stroke="currentColor" strokeWidth={1.5} strokeLinecap="round" strokeLinejoin="round" opacity={0.9} />
      <circle cx={ux} cy={uy} r={2} fill="currentColor" />
    </svg>
  );
}

/** Calor da conta: número + seta de tendência + mini-curva de 90 dias. Cor nunca sozinha: seta e texto junto. */
export function ScoreTendencia({ score, tendencia, serie, compacto = false }: { score: number; tendencia: number; serie: number[]; compacto?: boolean }) {
  const sentido = tendencia >= 3 ? 'sobe' : tendencia <= -3 ? 'desce' : 'estavel';
  const cor = sentido === 'sobe' ? 'text-warm' : sentido === 'desce' ? 'text-cool' : 'text-text-3';
  const Seta = sentido === 'sobe' ? ArrowUpRight : sentido === 'desce' ? ArrowDownRight : Minus;
  const rotulo =
    sentido === 'sobe'
      ? `esquentando, mais ${tendencia} pontos em 14 dias`
      : sentido === 'desce'
        ? `esfriando, menos ${Math.abs(tendencia)} pontos em 14 dias`
        : 'estável nos últimos 14 dias';
  return (
    <div className="flex items-center gap-3" aria-label={`Score ${score}, ${rotulo}`} role="img">
      {!compacto && <Curva serie={serie} largura={64} altura={22} classe={cor} />}
      <div className="flex flex-col items-end leading-none">
        <span className="font-display text-xl font-semibold tracking-tight tabular-nums">{score}</span>
        <span className={cn('vr-data mt-1 flex items-center gap-0.5 text-xs', cor)}>
          <Seta className="size-3.5" strokeWidth={1.5} />
          {sentido === 'estavel' ? '0' : `${tendencia > 0 ? '+' : '−'}${Math.abs(tendencia)}`}
        </span>
      </div>
    </div>
  );
}
