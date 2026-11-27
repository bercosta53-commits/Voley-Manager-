import { useId } from 'react';
import { REGRAS, ROTULO_DIMENSAO, type Dimensao } from '@/lib/prioridade-config';
import { formatarNota, type DimensaoIntegrada } from '@/lib/prioridade';

/** Ordem dos eixos: topo ICP, direita Sinais, base Clima, esquerda Oportunidade digital (sentido horário). */
const EIXOS: Dimensao[] = ['icp', 'sinais', 'clima', 'oportunidadeDigital'];
const DIRECAO: Record<Dimensao, [number, number]> = { icp: [0, -1], sinais: [1, 0], clima: [0, 1], oportunidadeDigital: [-1, 0] };
const CURTO: Record<Dimensao, string> = { icp: 'ICP', sinais: 'Sinais', clima: 'Clima', oportunidadeDigital: 'Digital' };
/** mínimo de cada eixo para entrar no sweet spot (regras de A2) */
const MINIMO = REGRAS.A2.minimos;

/** O score real por trás da nota de Sinais (escala 1–5 traduzida do VSCS 0–100), para mostrar ao lado: "3,1 (VSCS 53)". */
export function vscsDaDimensao(x: DimensaoIntegrada): number | null {
  const m = x.resumo?.match(/VSCS (\d+)/);
  if (m) return Number(m[1]);
  return x.nota !== null && (x.semAchados || /^Nenhum sinal/.test(x.resumo ?? '')) ? 0 : null;
}

/** Nota que entra no desenho: só as válidas (desatualizada aparece no texto, não no polígono). */
const notaDesenho = (d: DimensaoIntegrada) => (d.nota !== null && d.entraNoCalculo ? d.nota : null);

export function textoLosango(dims: Record<Dimensao, DimensaoIntegrada>) {
  return EIXOS.map(d => `${ROTULO_DIMENSAO[d]} ${notaDesenho(dims[d]) !== null ? formatarNota(Math.round(dims[d].nota! * 10) / 10) : 'sem avaliação'}`).join('; ');
}

/**
 * Radar de quatro eixos, escala 1–5 igual em todas as contas. Mostra:
 * - faixas de fundo (fraco, médio, forte) para leitura imediata;
 * - o contorno tracejado do mínimo do sweet spot (regras de A2), para ver o que falta;
 * - a área da conta preenchida; eixo sem avaliação fica no centro, com borda tracejada e rótulo "sem avaliação";
 * - cada ponto verde quando atinge o mínimo do eixo, laranja quando fica abaixo.
 * Sem animação.
 */
export function Losango({ dims, tamanho = 220, compacto = false }: { dims: Record<Dimensao, DimensaoIntegrada>; tamanho?: number; compacto?: boolean }) {
  const id = useId().replace(/:/g, '');
  const margem = compacto ? 44 : 50;
  // folga lateral: os rótulos dos eixos da esquerda e da direita ficam fora do quadrado do desenho
  const folga = compacto ? 24 : 44;
  const R = tamanho / 2 - margem;
  const c = tamanho / 2;
  const pt = (d: Dimensao, v: number) => [c + (DIRECAO[d][0] * R * v) / 5, c + (DIRECAO[d][1] * R * v) / 5] as const;
  const poligono = (vals: number[]) => EIXOS.map((d, i) => pt(d, vals[i]!).join(',')).join(' ');
  const notas = EIXOS.map(d => notaDesenho(dims[d]));
  const conhecidas = notas.filter(n => n !== null).length;
  const completo = conhecidas === 4;
  // eixo sem avaliação entra no desenho no centro: a área existe, mas mostra o buraco
  const forma = notas.map(n => n ?? 0);
  const atinge = (i: number) => notas[i] !== null && notas[i]! >= MINIMO[EIXOS[i]!];
  return (
    <figure className="flex flex-col items-center">
      <svg viewBox={`${-folga} 0 ${tamanho + 2 * folga} ${tamanho}`} width={tamanho + 2 * folga} height={tamanho} role="img" aria-label={`Radar das quatro dimensões: ${textoLosango(dims)}`} className="max-w-full overflow-visible">
        <defs>
          <radialGradient id={`area-${id}`} cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="var(--vr-ok)" stopOpacity={0.12} />
            <stop offset="100%" stopColor="var(--vr-ok)" stopOpacity={completo ? 0.42 : 0.26} />
          </radialGradient>
        </defs>

        {/* faixas de fundo: 4–5 forte, 2–4 médio, 0–2 fraco */}
        <polygon points={poligono([5, 5, 5, 5])} fill="var(--vr-surface-2)" stroke="var(--vr-border)" strokeWidth={1.25} />
        <polygon points={poligono([4, 4, 4, 4])} fill="var(--vr-surface)" stroke="var(--vr-border)" strokeWidth={1} />
        <polygon points={poligono([2, 2, 2, 2])} fill="var(--vr-surface-3)" fillOpacity={0.6} stroke="var(--vr-border)" strokeWidth={1} />
        {[1, 3].map(n => (
          <polygon key={n} points={poligono([n, n, n, n])} fill="none" stroke="var(--vr-border)" strokeWidth={0.75} strokeDasharray="2 3" />
        ))}
        {EIXOS.map(d => (
          <line key={d} x1={c} y1={c} x2={pt(d, 5)[0]} y2={pt(d, 5)[1]} stroke="var(--vr-border)" strokeWidth={1} />
        ))}
        {/* marcas da escala no eixo de cima */}
        {!compacto &&
          [1, 2, 3, 4, 5].map(n => (
            <text key={n} x={pt('icp', n)[0] + 9} y={pt('icp', n)[1] + 3} className="vr-data fill-text-3 text-[9px]">
              {n}
            </text>
          ))}

        {/* mínimo do sweet spot */}
        <polygon points={poligono(EIXOS.map(d => MINIMO[d]))} fill="none" stroke="var(--vr-text-3)" strokeWidth={1.25} strokeDasharray="5 4" />

        {/* área da conta */}
        {conhecidas >= 2 && <polygon points={poligono(forma)} fill={`url(#area-${id})`} stroke="var(--vr-ok)" strokeWidth={2.5} strokeLinejoin="round" strokeDasharray={completo ? undefined : '6 4'} />}

        {/* pontos */}
        {EIXOS.map((d, i) => {
          if (notas[i] === null) return <circle key={d} cx={c} cy={c} r={3} fill="var(--vr-surface)" stroke="var(--vr-text-3)" strokeWidth={1.5} />;
          const [x, y] = pt(d, notas[i]!);
          const cor = atinge(i) ? 'var(--vr-ok)' : 'var(--vr-warm)';
          return (
            <g key={d}>
              <circle cx={x} cy={y} r={compacto ? 4.5 : 6} fill={cor} stroke="var(--vr-surface)" strokeWidth={2} />
            </g>
          );
        })}

        {/* rótulos dos eixos: nome e nota em destaque */}
        {EIXOS.map((d, i) => {
          const [dx, dy] = DIRECAO[d];
          const x = c + dx * (R + (compacto ? 10 : 16));
          const y = c + dy * (R + (compacto ? 10 : 16));
          const anchor = dx > 0 ? 'start' : dx < 0 ? 'end' : 'middle';
          const yNome = dy < 0 ? y - 18 : dy > 0 ? y + 12 : y - 4;
          const yNota = dy < 0 ? y - 2 : dy > 0 ? y + 30 : y + 15;
          const nota = notas[i];
          return (
            <g key={d}>
              <text x={x} y={yNome} textAnchor={anchor} className="fill-text-2 text-xs font-medium">
                {compacto || d === 'oportunidadeDigital' ? CURTO[d] : ROTULO_DIMENSAO[d]}
              </text>
              <text
                x={x}
                y={yNota}
                textAnchor={anchor}
                className={nota !== null ? 'vr-data text-md font-semibold' : 'fill-text-3 text-xs'}
                style={nota !== null ? { fill: atinge(i) ? 'var(--vr-ok)' : 'var(--vr-warm)' } : undefined}
              >
                {nota !== null ? formatarNota(Math.round(nota * 10) / 10) : 'sem avaliação'}
                {nota !== null && d === 'sinais' && vscsDaDimensao(dims.sinais) !== null && (
                  <tspan className="fill-text-3 text-xs font-normal">{` (VSCS ${vscsDaDimensao(dims.sinais)})`}</tspan>
                )}
              </text>
            </g>
          );
        })}
      </svg>
      <figcaption className="mt-1 flex flex-wrap items-center justify-center gap-x-3 gap-y-0.5 text-xs text-text-3">
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="inline-block w-4 border-t-[1.5px] border-dashed border-text-3" /> mínimo do sweet spot
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full bg-ok" /> atinge
        </span>
        <span className="inline-flex items-center gap-1">
          <span aria-hidden className="size-2 rounded-full bg-warm" /> abaixo
        </span>
        {!completo && <span>· {conhecidas} de 4 avaliadas</span>}
      </figcaption>
    </figure>
  );
}

/**
 * Radar mínimo para a linha da lista (sem rótulos): área da conta, contorno tracejado do mínimo do sweet spot e
 * um ponto por eixo, verde quando atinge o mínimo e laranja abaixo. Eixo sem avaliação: ponto vazado no centro.
 */
export function LosangoMini({ dims, tamanho = 56 }: { dims: Record<Dimensao, DimensaoIntegrada>; tamanho?: number }) {
  const c = tamanho / 2;
  const R = tamanho / 2 - 4;
  const pt = (d: Dimensao, v: number) => [c + (DIRECAO[d][0] * R * v) / 5, c + (DIRECAO[d][1] * R * v) / 5] as const;
  const poligono = (vals: number[]) => EIXOS.map((d, i) => pt(d, vals[i]!).join(',')).join(' ');
  const notas = EIXOS.map(d => notaDesenho(dims[d]));
  const conhecidas = notas.filter(n => n !== null).length;
  return (
    <svg viewBox={`0 0 ${tamanho} ${tamanho}`} width={tamanho} height={tamanho} role="img" aria-label={`Radar: ${textoLosango(dims)}`} className="shrink-0">
      <polygon points={poligono([5, 5, 5, 5])} fill="var(--vr-surface-2)" stroke="var(--vr-border)" strokeWidth={1} />
      <polygon points={poligono(EIXOS.map(d => MINIMO[d]))} fill="none" stroke="var(--vr-text-3)" strokeWidth={0.75} strokeDasharray="2 2" />
      {conhecidas >= 2 && <polygon points={poligono(notas.map(n => n ?? 0))} fill="var(--vr-ok)" fillOpacity={0.28} stroke="var(--vr-ok)" strokeWidth={1.25} strokeLinejoin="round" />}
      {EIXOS.map((d, i) => {
        const n = notas[i];
        if (n === null) return <circle key={d} cx={c} cy={c} r={1.8} fill="var(--vr-surface)" stroke="var(--vr-text-3)" strokeWidth={1} />;
        const [x, y] = pt(d, n);
        return <circle key={d} cx={x} cy={y} r={2.4} fill={n >= MINIMO[d] ? 'var(--vr-ok)' : 'var(--vr-warm)'} />;
      })}
    </svg>
  );
}
