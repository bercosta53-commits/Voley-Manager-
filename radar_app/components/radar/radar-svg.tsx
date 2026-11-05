'use client';

import { useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { BRACOS, type Anel } from '@/lib/proximidade';
import { anguloCentralBraco, BANDA_ANEL, CENTRO, faixaProximityPorAnel, posicaoConta, raioPonto, RAIO_MAX, ROTULO_ANEL, type PontoPolar, type PontoRadar } from '@/lib/proximidade-layout';
import { cn } from '@/lib/utils';

const EASE = [0.16, 1, 0.3, 1] as const;

export type { PontoRadar };

/** Interpola a cor do ponto entre cinza (sem sinal) e âmbar (sinal recente) — mesmas cores de "esquentando" já usadas no resto do app. */
function corTemperatura(t: number): string {
  if (t < 0.08) return 'var(--vr-text-3)';
  const op = 0.35 + t * 0.65;
  return `color-mix(in oklab, var(--vr-warm) ${Math.round(op * 100)}%, var(--vr-text-3))`;
}

/** ~4 traços ao redor do círculo, do menor ao maior ponto — fixo (p.ex. "2.5 2"), um círculo pequeno vira serrilhado. */
function dasharrayProporcional(r: number): string {
  const segmento = (Math.PI * r) / 4;
  return `${(segmento * 0.62).toFixed(1)} ${(segmento * 0.38).toFixed(1)}`;
}

export function RadarSvg({
  pontos,
  faixaEstavelPorAnel,
  selecionadaId,
  destacadas,
  onSelecionar,
}: {
  pontos: PontoRadar[];
  /** Faixa de proximity por anel calculada sobre a base INTEIRA (não o filtro atual), para a nuvem não "pular" ao filtrar. */
  faixaEstavelPorAnel: ReturnType<typeof faixaProximityPorAnel>;
  selecionadaId?: string;
  /** Ids que mudaram de anel desde a última visita — ganham o indicador ácido de "novo". */
  destacadas?: Set<string>;
  onSelecionar: (id: string) => void;
}) {
  const reduzir = useReducedMotion();
  const [hover, setHover] = useState<PontoRadar | null>(null);
  const svgRef = useRef<SVGSVGElement>(null);

  const posicoes = useMemo(() => {
    const mapa = new Map<string, PontoPolar>();
    for (const p of pontos) mapa.set(p.id, posicaoConta(p, faixaEstavelPorAnel));
    return mapa;
  }, [pontos, faixaEstavelPorAnel]);

  const aneis: Anel[] = [4, 3, 2, 1]; // desenha de fora pra dentro

  // Rotular todo mundo no anel 1 vira sopa de texto quando a zona de ativação cresce: rotula só as top 8
  // por proximity, o resto some pro hover. O rótulo fica numa borda fixa (fora do aperto do centro) no
  // ângulo do próprio ponto, com uma linha fina até ele — um raio maior já espalha mais os rótulos (arco
  // cresce com o raio), então evita a sopa de texto mesmo com dois pontos em ângulos quase iguais.
  const RAIO_ROTULO = BANDA_ANEL[1][1] + 14;
  const idsRotulados = useMemo(
    () =>
      new Set(
        pontos
          .filter(p => p.anel === 1 && !p.convertida)
          .sort((a, b) => b.proximity - a.proximity)
          .slice(0, 8)
          .map(p => p.id),
      ),
    [pontos],
  );

  return (
    <div className="relative w-full">
      <svg ref={svgRef} viewBox="0 0 640 640" className="aspect-square w-full" role="img" aria-label="Radar de proximidade das contas">
        <title>Radar de proximidade — anel por regra, posição pelo score, cor pela temperatura do sinal</title>

        {/* anéis, de fora pra dentro, com vão sólido entre eles */}
        {aneis.map(anel => {
          const [, max] = BANDA_ANEL[anel];
          return (
            <circle
              key={anel}
              cx={CENTRO}
              cy={CENTRO}
              r={max}
              className={anel === 1 ? 'fill-ok-bg' : 'fill-card'}
              stroke="var(--vr-border)"
              strokeWidth={1}
            />
          );
        })}

        {/* divisórias de fatia por braço */}
        {BRACOS.map((b, i) => {
          const grau = (i * 360) / BRACOS.length - 90 - 3;
          const rad = (grau * Math.PI) / 180;
          const x2 = CENTRO + RAIO_MAX * Math.cos(rad);
          const y2 = CENTRO + RAIO_MAX * Math.sin(rad);
          return <line key={b.id} x1={CENTRO} y1={CENTRO} x2={x2} y2={y2} stroke="var(--vr-border)" strokeWidth={1} strokeDasharray="2 4" />;
        })}

        {/* rótulos de setor (braço) na borda, ancorados pro lado certo pra nunca estourar o viewBox */}
        {BRACOS.map(b => {
          const rad = anguloCentralBraco(b.id);
          const dx = Math.cos(rad);
          const x = CENTRO + (RAIO_MAX + 14) * dx;
          const y = CENTRO + (RAIO_MAX + 14) * Math.sin(rad);
          const anchor = dx > 0.15 ? 'start' : dx < -0.15 ? 'end' : 'middle';
          return (
            <text key={b.id} x={x} y={y} textAnchor={anchor} dominantBaseline="middle" className="fill-text-3 text-[11px] font-medium uppercase" style={{ letterSpacing: '0.04em' }}>
              {b.rotuloCurto}
            </text>
          );
        })}

        {/* contador discreto no topo do anel central — o texto cheio já está no cartão acima do radar */}
        <text x={CENTRO} y={CENTRO - BANDA_ANEL[1][1] + 16} textAnchor="middle" className="fill-ok text-[10px] font-semibold uppercase" style={{ letterSpacing: '0.04em' }}>
          Zona de ativação
        </text>

        {/* pontos */}
        {pontos.map(p => {
          const pos = posicoes.get(p.id)!;
          const r = raioPonto(p.potencial);
          const destacada = destacadas?.has(p.id);
          const dx = pos.x - CENTRO,
            dy = pos.y - CENTRO;
          const dist = Math.hypot(dx, dy) || 1;
          const dirX = dx / dist,
            dirY = dy / dist;
          // Ponto na borda do rótulo (raio fixo RAIO_ROTULO, mesmo ângulo do ponto), em coordenadas LOCAIS
          // ao <motion.g> (que já está transladado pra pos.x/pos.y) — por isso é (RAIO_ROTULO - dist), não RAIO_ROTULO.
          const leaderFimX = (RAIO_ROTULO - dist) * dirX;
          const leaderFimY = (RAIO_ROTULO - dist) * dirY;
          const labelTextX = leaderFimX + dirX * 4;
          const labelTextY = leaderFimY + dirY * 4;
          const labelAnchor = dirX > 0.12 ? 'start' : dirX < -0.12 ? 'end' : 'middle';
          return (
            <motion.g
              key={p.id}
              initial={false}
              animate={{ x: pos.x, y: pos.y }}
              transition={reduzir ? { duration: 0 } : { duration: 1, ease: EASE }}
              onMouseEnter={() => setHover(p)}
              onMouseLeave={() => setHover(h => (h?.id === p.id ? null : h))}
              onClick={() => onSelecionar(p.id)}
              className="cursor-pointer outline-none"
              tabIndex={0}
              role="button"
              aria-label={`${p.nome}, ${ROTULO_ANEL[p.anel]}`}
              onKeyDown={e => e.key === 'Enter' && onSelecionar(p.id)}
            >
              {destacada && !reduzir && (
                <motion.circle
                  r={r}
                  fill="none"
                  stroke="var(--vr-acid)"
                  strokeWidth={2}
                  initial={{ opacity: 0.9, scale: 1 }}
                  animate={{ opacity: 0, scale: 2.4 }}
                  transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' }}
                />
              )}
              <circle
                r={p.convertida ? r + 1 : r}
                fill={p.convertida ? 'var(--vr-acid)' : corTemperatura(p.temperatura)}
                stroke={p.convertida ? 'var(--vr-acid-ink)' : selecionadaId === p.id ? 'var(--vr-text)' : 'var(--vr-surface)'}
                strokeWidth={selecionadaId === p.id ? 2.5 : 1.5}
                strokeDasharray={!p.convertida && !p.sinalRelevante ? dasharrayProporcional(r) : undefined}
                opacity={hover && hover.id !== p.id ? 0.35 : 1}
              />
              {idsRotulados.has(p.id) && (
                <g opacity={hover && hover.id !== p.id ? 0.35 : 1}>
                  <line x1={0} y1={0} x2={leaderFimX} y2={leaderFimY} stroke="var(--vr-border-strong)" strokeWidth={1} />
                  <text x={labelTextX} y={labelTextY} textAnchor={labelAnchor} dominantBaseline="middle" className="fill-text-2 text-[9px]">
                    {p.nome.length > 20 ? p.nome.slice(0, 19) + '…' : p.nome}
                  </text>
                </g>
              )}
            </motion.g>
          );
        })}
      </svg>

      {hover && (
        <div
          className="vr-card pointer-events-none absolute z-10 w-56 -translate-x-1/2 p-3 text-xs shadow-3"
          style={{ left: `${(posicoes.get(hover.id)!.x / 640) * 100}%`, top: `${(posicoes.get(hover.id)!.y / 640) * 100 - 2}%`, transform: 'translate(-50%, -100%)' }}
        >
          <p className="font-semibold text-foreground">{hover.nome}</p>
          <p className="mt-0.5 text-text-3">
            {ROTULO_ANEL[hover.anel]} · {hover.braco.replace('_', ' ')}
          </p>
          <p className={cn('mt-1.5', hover.sinalRelevante ? 'text-warm' : 'text-text-3')}>{hover.sinalRelevante ? 'Sinal recente' : 'Sem sinal recente'}</p>
        </div>
      )}
    </div>
  );
}
