import { ROTULO_DIMENSAO, type Dimensao } from '@/lib/prioridade-config';
import { formatarNota, type DimensaoIntegrada } from '@/lib/prioridade';
import { cn } from '@/lib/utils';

/** Ordem dos eixos: topo ICP, direita Sinais, base Clima, esquerda Oportunidade digital (sentido horário). */
const EIXOS: Dimensao[] = ['icp', 'sinais', 'clima', 'oportunidadeDigital'];
const DIRECAO: Record<Dimensao, [number, number]> = { icp: [0, -1], sinais: [1, 0], clima: [0, 1], oportunidadeDigital: [-1, 0] };

/** Nota que entra no desenho: só as válidas (desatualizada aparece no texto, não no polígono). */
const notaDesenho = (d: DimensaoIntegrada) => (d.nota !== null && d.entraNoCalculo ? d.nota : null);

export function textoLosango(dims: Record<Dimensao, DimensaoIntegrada>) {
  return EIXOS.map(d => `${ROTULO_DIMENSAO[d]} ${notaDesenho(dims[d]) !== null ? formatarNota(Math.round(dims[d].nota! * 10) / 10) : 'sem avaliação'}`).join('; ');
}

/**
 * Losango de quatro eixos, escala 1–5 igual em todas as contas (o centro é só referência geométrica). Dimensão
 * ausente: o eixo fica rotulado "Sem avaliação", só os pontos conhecidos aparecem e só eixos vizinhos conhecidos
 * se ligam; o polígono só é preenchido com as quatro notas. Sem animação.
 */
export function Losango({ dims, tamanho = 220, compacto = false }: { dims: Record<Dimensao, DimensaoIntegrada>; tamanho?: number; compacto?: boolean }) {
  const margem = compacto ? 46 : 56;
  const R = tamanho / 2 - margem;
  const c = tamanho / 2;
  const pt = (d: Dimensao, v: number) => [c + DIRECAO[d][0] * (R * v) / 5, c + DIRECAO[d][1] * (R * v) / 5] as const;
  const notas = EIXOS.map(d => notaDesenho(dims[d]));
  const completo = notas.every(n => n !== null);
  const segmentos = EIXOS.map((d, i) => [i, (i + 1) % 4] as const).filter(([a, b]) => notas[a] !== null && notas[b] !== null);
  const conhecidas = notas.filter(n => n !== null).length;
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`0 0 ${tamanho} ${tamanho}`} width={tamanho} height={tamanho} role="img" aria-label={`Losango das quatro dimensões: ${textoLosango(dims)}`} className="max-w-full overflow-visible">
        {[1, 2, 3, 4, 5].map(n => (
          <polygon
            key={n}
            points={EIXOS.map(d => pt(d, n).join(',')).join(' ')}
            fill="none"
            stroke="var(--vr-border)"
            strokeWidth={n === 5 ? 1.25 : 1}
            strokeDasharray={n === 3 ? '3 3' : undefined}
          />
        ))}
        {EIXOS.map(d => (
          <line key={d} x1={c} y1={c} x2={pt(d, 5)[0]} y2={pt(d, 5)[1]} stroke="var(--vr-border)" strokeWidth={1} />
        ))}
        {completo && <polygon points={EIXOS.map((d, i) => pt(d, notas[i]!).join(',')).join(' ')} fill="var(--vr-ok)" fillOpacity={0.16} stroke="none" />}
        {segmentos.map(([a, b]) => (
          <line key={`${a}-${b}`} x1={pt(EIXOS[a]!, notas[a]!)[0]} y1={pt(EIXOS[a]!, notas[a]!)[1]} x2={pt(EIXOS[b]!, notas[b]!)[0]} y2={pt(EIXOS[b]!, notas[b]!)[1]} stroke="var(--vr-ok)" strokeWidth={2} strokeLinejoin="round" />
        ))}
        {EIXOS.map((d, i) =>
          notas[i] !== null ? <circle key={d} cx={pt(d, notas[i]!)[0]} cy={pt(d, notas[i]!)[1]} r={3.5} fill="var(--vr-ok)" stroke="var(--vr-surface)" strokeWidth={1.5} /> : null,
        )}
        {EIXOS.map((d, i) => {
          const [dx, dy] = DIRECAO[d];
          const x = c + dx * (R + (compacto ? 10 : 14));
          const y = c + dy * (R + (compacto ? 10 : 14));
          const anchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle';
          const base = dy < 0 ? -4 : dy > 0 ? 12 : 4;
          return (
            <g key={d}>
              <text x={x} y={y + base - (dy === 0 ? 7 : dy < 0 ? 13 : 0)} textAnchor={anchor} className={cn('fill-text-2 font-medium', 'text-xs')}>
                {compacto ? ({ icp: 'ICP', sinais: 'Sinais', clima: 'Clima', oportunidadeDigital: 'Digital' } as const)[d] : ROTULO_DIMENSAO[d]}
              </text>
              <text x={x} y={y + base + (dy === 0 ? 7 : dy < 0 ? 0 : 13)} textAnchor={anchor} className={cn(notas[i] !== null ? 'vr-data fill-foreground font-semibold' : 'fill-text-3', 'text-xs')}>
                {notas[i] !== null ? formatarNota(Math.round(notas[i]! * 10) / 10) : 'Sem avaliação'}
              </text>
            </g>
          );
        })}
      </svg>
      {!completo && <figcaption className="mt-1 text-xs text-text-3">Avaliação incompleta: {conhecidas} de 4 dimensões</figcaption>}
    </figure>
  );
}
