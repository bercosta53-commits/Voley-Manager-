'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { motion, useReducedMotion } from 'motion/react';
import { Minus, Plus, Shrink } from 'lucide-react';
import { BRACOS, type Anel } from '@/lib/proximidade';
import { anguloCentralBraco, BANDA_ANEL, CENTRO, faixaProximityPorAnel, posicaoConta, raioPonto, RAIO_MAX, ROTULO_ANEL, type PontoPolar, type PontoRadar } from '@/lib/proximidade-layout';
import { cn } from '@/lib/utils';

const EASE = [0.16, 1, 0.3, 1] as const;
const ZOOM_MIN = 1;
const ZOOM_MAX = 8;
const VB = 640; // lado do viewBox — tudo abaixo é autorado nesse espaço, antes do zoom/pan

export type { PontoRadar };

interface Transformacao {
  zoom: number;
  x: number;
  y: number;
}

/** Interpola a cor do ponto entre cinza (sem sinal) e âmbar (sinal recente) — mesmas cores de "esquentando" já usadas no resto do app. */
function corTemperatura(t: number): string {
  if (t < 0.08) return 'var(--vr-text-3)';
  const op = 0.4 + t * 0.6;
  return `color-mix(in oklab, var(--vr-warm) ${Math.round(op * 100)}%, var(--vr-text-3))`;
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
  const [t, setT] = useState<Transformacao>({ zoom: 1, x: 0, y: 0 });
  const [arrastando, setArrastando] = useState(false);
  const arrastoRef = useRef<{ ultimoX: number; ultimoY: number } | null>(null);
  const ponteirosRef = useRef<Map<number, { x: number; y: number }>>(new Map());
  const distanciaPinçaRef = useRef<number | null>(null);

  const posicoes = useMemo(() => {
    const mapa = new Map<string, PontoPolar>();
    for (const p of pontos) mapa.set(p.id, posicaoConta(p, faixaEstavelPorAnel));
    return mapa;
  }, [pontos, faixaEstavelPorAnel]);

  const aneis: Anel[] = [4, 3, 2, 1]; // desenha de fora pra dentro

  // Rotular todo mundo no anel 1 vira sopa de texto quando a zona de ativação cresce: rotula só as top 10
  // por proximity (o resto some pro hover ou pro zoom — agora dá pra chegar perto). O rótulo fica numa borda
  // fixa (fora do aperto do centro) no ângulo do próprio ponto, com uma linha fina até ele.
  const RAIO_ROTULO = BANDA_ANEL[1][1] + 14;
  // com a base real o anel 1 aperta: rotula até 8, e só quem está a mais de 16° de um já rotulado (sem sobrepor texto)
  const idsRotulados = useMemo(() => {
    const escolhidos: { id: string; ang: number }[] = [];
    for (const p of pontos.filter(p => p.anel === 1 && !p.convertida).sort((a, b) => b.proximity - a.proximity)) {
      const pos = posicoes.get(p.id);
      if (!pos) continue;
      const ang = (Math.atan2(pos.y - CENTRO, pos.x - CENTRO) * 180) / Math.PI;
      const perto = escolhidos.some(e => Math.abs(((ang - e.ang + 540) % 360) - 180) < 16);
      if (!perto) escolhidos.push({ id: p.id, ang });
      if (escolhidos.length >= 8) break;
    }
    return new Set(escolhidos.map(e => e.id));
  }, [pontos, posicoes]);

  // --- zoom / pan ---------------------------------------------------------
  const paraEspacoSvg = useCallback((clientX: number, clientY: number) => {
    const svg = svgRef.current;
    const ctm = svg?.getScreenCTM();
    if (!svg || !ctm) return { x: CENTRO, y: CENTRO };
    const pt = svg.createSVGPoint();
    pt.x = clientX;
    pt.y = clientY;
    const p = pt.matrixTransform(ctm.inverse());
    return { x: p.x, y: p.y };
  }, []);

  const aplicarZoom = useCallback((fator: number, centro: { x: number; y: number }) => {
    setT(prev => {
      const novoZoom = Math.min(ZOOM_MAX, Math.max(ZOOM_MIN, prev.zoom * fator));
      if (Math.abs(novoZoom - prev.zoom) < 1e-4) return prev;
      const mundoX = (centro.x - prev.x) / prev.zoom;
      const mundoY = (centro.y - prev.y) / prev.zoom;
      return { zoom: novoZoom, x: centro.x - novoZoom * mundoX, y: centro.y - novoZoom * mundoY };
    });
  }, []);

  // React liga o onWheel do DOM como passivo por padrão (perf) — preventDefault aí dentro é ignorado (com aviso
  // no console) e a página rola junto. Por isso o listener de wheel é nativo, registrado explicitamente como
  // non-passive, pra realmente segurar o scroll da página enquanto o usuário dá zoom no radar.
  useEffect(() => {
    const svg = svgRef.current;
    if (!svg) return;
    const onWheelNativo = (e: WheelEvent) => {
      e.preventDefault();
      aplicarZoom(Math.exp(-e.deltaY * 0.0018), paraEspacoSvg(e.clientX, e.clientY));
    };
    svg.addEventListener('wheel', onWheelNativo, { passive: false });
    return () => svg.removeEventListener('wheel', onWheelNativo);
  }, [aplicarZoom, paraEspacoSvg]);

  const handlePointerDown = (e: React.PointerEvent<SVGSVGElement>) => {
    ponteirosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });
    if (ponteirosRef.current.size === 1) {
      arrastoRef.current = { ultimoX: e.clientX, ultimoY: e.clientY };
    } else if (ponteirosRef.current.size === 2) {
      arrastoRef.current = null;
      const [a, b] = [...ponteirosRef.current.values()];
      distanciaPinçaRef.current = Math.hypot(a!.x - b!.x, a!.y - b!.y);
    }
  };

  const handlePointerMove = (e: React.PointerEvent<SVGSVGElement>) => {
    if (!ponteirosRef.current.has(e.pointerId)) return;
    ponteirosRef.current.set(e.pointerId, { x: e.clientX, y: e.clientY });

    if (ponteirosRef.current.size === 2 && distanciaPinçaRef.current != null) {
      const [a, b] = [...ponteirosRef.current.values()];
      const dist = Math.hypot(a!.x - b!.x, a!.y - b!.y);
      const meio = { x: (a!.x + b!.x) / 2, y: (a!.y + b!.y) / 2 };
      aplicarZoom(dist / distanciaPinçaRef.current, paraEspacoSvg(meio.x, meio.y));
      distanciaPinçaRef.current = dist;
      return;
    }

    if (arrastoRef.current && e.buttons) {
      const dxTela = e.clientX - arrastoRef.current.ultimoX;
      const dyTela = e.clientY - arrastoRef.current.ultimoY;
      if (Math.abs(dxTela) + Math.abs(dyTela) > 2) setArrastando(true);
      const rect = svgRef.current?.getBoundingClientRect();
      if (rect && rect.width > 0) {
        const escala = VB / rect.width;
        setT(prev => ({ ...prev, x: prev.x + dxTela * escala, y: prev.y + dyTela * escala }));
      }
      arrastoRef.current.ultimoX = e.clientX;
      arrastoRef.current.ultimoY = e.clientY;
    }
  };

  const encerrarPonteiro = (e: React.PointerEvent<SVGSVGElement>) => {
    ponteirosRef.current.delete(e.pointerId);
    if (ponteirosRef.current.size < 2) distanciaPinçaRef.current = null;
    if (ponteirosRef.current.size === 0) {
      arrastoRef.current = null;
      setArrastando(false);
    }
  };

  const zoomIn = () => aplicarZoom(1.5, { x: CENTRO, y: CENTRO });
  const zoomOut = () => aplicarZoom(1 / 1.5, { x: CENTRO, y: CENTRO });
  const resetar = () => setT({ zoom: 1, x: 0, y: 0 });
  const contraescala = 1 / t.zoom; // mantém traço e texto com espessura/tamanho constantes em tela, zoom adentro ou afora

  // Memoiza os 400 pontos à parte: arrastar/der zoom só muda `t` (a transformação do <g> pai), não precisa
  // recriar os 400 elementos — só o atributo transform do grupo externo muda a cada frame.
  const camadaPontos = useMemo(
    () =>
      pontos.map(p => {
        const pos = posicoes.get(p.id)!;
        const r = raioPonto(p.potencial);
        const destacada = destacadas?.has(p.id);
        const selecionada = selecionadaId === p.id;
        const dx = pos.x - CENTRO,
          dy = pos.y - CENTRO;
        const dist = Math.hypot(dx, dy) || 1;
        const dirX = dx / dist,
          dirY = dy / dist;
        // Ponto na borda do rótulo (raio fixo RAIO_ROTULO, mesmo ângulo do ponto), em coordenadas LOCAIS
        // ao <motion.g> (já transladado pra pos.x/pos.y) — por isso é (RAIO_ROTULO - dist), não RAIO_ROTULO.
        const leaderFimX = (RAIO_ROTULO - dist) * dirX;
        const leaderFimY = (RAIO_ROTULO - dist) * dirY;
        const labelAnchor = dirX > 0.12 ? 'start' : dirX < -0.12 ? 'end' : 'middle';
        const apagada = hover && hover.id !== p.id;
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
                vectorEffect="non-scaling-stroke"
                initial={{ opacity: 0.9, scale: 1 }}
                animate={{ opacity: 0, scale: 2.4 }}
                transition={{ duration: 1.4, repeat: Infinity, repeatDelay: 0.6, ease: 'easeOut' }}
              />
            )}
            {selecionada && (
              <>
                <circle r={r + 5} fill="none" stroke="var(--vr-bg)" strokeWidth={3.5} vectorEffect="non-scaling-stroke" />
                <circle r={r + 5} fill="none" stroke="var(--vr-acid)" strokeWidth={2} vectorEffect="non-scaling-stroke" />
              </>
            )}
            {/* o anel colorido é a temperatura do sinal; dentro, o logo da empresa (favicon pelo domínio) */}
            <g opacity={apagada ? 0.32 : 1} style={{ transition: 'opacity 150ms ease-out' }}>
              <circle
                r={p.convertida ? r + 1 : r}
                fill="var(--vr-surface)"
                stroke={p.convertida ? 'var(--vr-acid)' : p.sinalRelevante ? corTemperatura(p.temperatura) : 'var(--vr-border-strong)'}
                strokeLinecap="round"
                vectorEffect="non-scaling-stroke"
                strokeWidth={p.sinalRelevante || p.convertida ? 2.25 : 1}
              />
              {p.dominio && (
                <image
                  href={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(p.dominio)}&sz=64`}
                  x={-r * 0.62}
                  y={-r * 0.62}
                  width={r * 1.24}
                  height={r * 1.24}
                  clipPath={`circle(${r * 0.62}px)`}
                  preserveAspectRatio="xMidYMid slice"
                  style={{ pointerEvents: 'none' }}
                />
              )}
            </g>
            {idsRotulados.has(p.id) && (
              <g opacity={apagada ? 0.32 : 1} style={{ transition: 'opacity 150ms ease-out' }}>
                {/* a linha fica no espaço "natural" (escala com o zoom — mais zoom, mais espaço pros rótulos) */}
                <line x1={0} y1={0} x2={leaderFimX} y2={leaderFimY} stroke="var(--vr-border-strong)" strokeWidth={1} vectorEffect="non-scaling-stroke" />
                {/* só o texto é contraescalado, ancorado na ponta da linha, pra não virar gigante no zoom */}
                <g transform={`translate(${leaderFimX} ${leaderFimY}) scale(${contraescala})`}>
                  <text x={dirX * 4} y={dirY * 4} textAnchor={labelAnchor} dominantBaseline="middle" className="fill-text-2 text-[9px] font-medium">
                    {p.nome.length > 20 ? p.nome.slice(0, 19) + '…' : p.nome}
                  </text>
                </g>
              </g>
            )}
          </motion.g>
        );
      }),
    // eslint-disable-next-line react-hooks/exhaustive-deps
    [pontos, posicoes, selecionadaId, destacadas, hover, idsRotulados, reduzir, contraescala, t.zoom, onSelecionar],
  );

  return (
    <div className="relative w-full">
      <svg
        ref={svgRef}
        viewBox={`0 0 ${VB} ${VB}`}
        overflow="visible"
        className={cn('aspect-square w-full touch-none select-none overflow-visible', arrastando ? 'cursor-grabbing' : 'cursor-grab')}
        role="img"
        aria-label="Radar de proximidade das contas"
        onPointerDown={handlePointerDown}
        onPointerMove={handlePointerMove}
        onPointerUp={encerrarPonteiro}
        onPointerLeave={encerrarPonteiro}
        onPointerCancel={encerrarPonteiro}
      >
        <title>Radar de proximidade — anel por regra, posição pelo score, cor pela temperatura do sinal. Scroll ou pinça pra dar zoom; arraste pra mover.</title>
        <defs>
          <radialGradient id="vrZonaAtivacao" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--vr-ok-bg)" stopOpacity="1" />
            <stop offset="75%" stopColor="var(--vr-ok-bg)" stopOpacity="0.85" />
            <stop offset="100%" stopColor="var(--vr-ok-bg)" stopOpacity="0.55" />
          </radialGradient>
          <radialGradient id="vrMiolo" cx="50%" cy="50%" r="50%">
            <stop offset="0%" stopColor="var(--vr-surface)" stopOpacity="0" />
            <stop offset="88%" stopColor="var(--vr-surface)" stopOpacity="0" />
            <stop offset="100%" stopColor="var(--vr-text)" stopOpacity="0.025" />
          </radialGradient>
        </defs>

        <g transform={`translate(${t.x} ${t.y}) scale(${t.zoom})`}>
          {/* anéis, de fora pra dentro, com vão sólido entre eles */}
          {aneis.map(anel => {
            const [, max] = BANDA_ANEL[anel];
            return (
              <circle
                key={anel}
                cx={CENTRO}
                cy={CENTRO}
                r={max}
                fill={anel === 1 ? 'url(#vrZonaAtivacao)' : 'var(--vr-surface)'}
                stroke="var(--vr-border)"
                strokeOpacity={0.7}
                strokeWidth={1}
                vectorEffect="non-scaling-stroke"
              />
            );
          })}
          <circle cx={CENTRO} cy={CENTRO} r={RAIO_MAX} fill="url(#vrMiolo)" stroke="none" />

          {/* divisórias de fatia por braço — começam na borda do anel 1, não cruzam o miolo mais cheio */}
          {BRACOS.map((b, i) => {
            const grau = (i * 360) / BRACOS.length - 90 - 3;
            const rad = (grau * Math.PI) / 180;
            const r1 = BANDA_ANEL[1][1] + 6;
            return (
              <line
                key={b.id}
                x1={CENTRO + r1 * Math.cos(rad)}
                y1={CENTRO + r1 * Math.sin(rad)}
                x2={CENTRO + RAIO_MAX * Math.cos(rad)}
                y2={CENTRO + RAIO_MAX * Math.sin(rad)}
                stroke="var(--vr-border)"
                strokeOpacity={0.6}
                strokeWidth={1}
                strokeLinecap="round"
                strokeDasharray="1.5 5"
                vectorEffect="non-scaling-stroke"
              />
            );
          })}

          {/* rótulos de setor (braço) na borda, ancorados pro lado certo pra nunca estourar o viewBox; contraescala pra não virar gigante no zoom */}
          {BRACOS.map(b => {
            const rad = anguloCentralBraco(b.id);
            const dx = Math.cos(rad);
            // rótulo centrado na fatia, logo fora do anel externo (o svg deixa transbordar: overflow visible)
            const baseX = CENTRO + (RAIO_MAX + 16) * dx;
            const baseY = CENTRO + (RAIO_MAX + 16) * Math.sin(rad);
            const anchor = 'middle';
            return (
              <g key={b.id} transform={`translate(${baseX} ${baseY}) scale(${contraescala})`}>
                <text textAnchor={anchor} dominantBaseline="middle" className="fill-text-3 text-[11px] font-semibold uppercase" style={{ letterSpacing: '0.06em' }}>
                  {b.rotuloCurto}
                </text>
              </g>
            );
          })}

          {/* contador discreto no topo do anel central — o texto cheio já está no cartão acima do radar */}
          <g transform={`translate(${CENTRO} ${CENTRO - BANDA_ANEL[1][1] + 16}) scale(${contraescala})`}>
            <text textAnchor="middle" className="fill-ok text-[10px] font-semibold uppercase" style={{ letterSpacing: '0.05em' }}>
              Zona de ativação
            </text>
          </g>

          {camadaPontos}
        </g>
      </svg>

      {/* controles de zoom */}
      <div className="absolute right-3 bottom-3 flex flex-col overflow-hidden rounded-control border border-border bg-card shadow-2">
        <button onClick={zoomIn} disabled={t.zoom >= ZOOM_MAX} className="grid size-8 place-items-center text-text-2 hover:bg-secondary hover:text-foreground disabled:opacity-30" aria-label="Aumentar zoom">
          <Plus className="size-4" strokeWidth={1.75} />
        </button>
        <div className="h-px bg-border" />
        <button onClick={zoomOut} disabled={t.zoom <= ZOOM_MIN} className="grid size-8 place-items-center text-text-2 hover:bg-secondary hover:text-foreground disabled:opacity-30" aria-label="Diminuir zoom">
          <Minus className="size-4" strokeWidth={1.75} />
        </button>
        {(t.zoom > ZOOM_MIN || t.x !== 0 || t.y !== 0) && (
          <>
            <div className="h-px bg-border" />
            <button onClick={resetar} className="grid size-8 place-items-center text-text-2 hover:bg-secondary hover:text-foreground" aria-label="Restaurar zoom">
              <Shrink className="size-4" strokeWidth={1.75} />
            </button>
          </>
        )}
      </div>

      {hover &&
        (() => {
          const pos = posicoes.get(hover.id)!;
          const visX = t.x + t.zoom * pos.x;
          const visY = t.y + t.zoom * pos.y;
          return (
            <div
              className="vr-card pointer-events-none absolute z-10 w-56 -translate-x-1/2 p-3 text-xs shadow-3"
              style={{ left: `${(visX / VB) * 100}%`, top: `${(visY / VB) * 100 - 2}%`, transform: 'translate(-50%, -100%)' }}
            >
              <p className="font-semibold text-foreground">{hover.nome}</p>
              <p className="mt-0.5 text-text-3">
                {ROTULO_ANEL[hover.anel]} · {hover.braco.replace('_', ' ')}
              </p>
              <p className={cn('mt-1.5', hover.sinalRelevante ? 'text-warm' : 'text-text-3')}>{hover.sinalRelevante ? 'Sinal recente' : 'Sem sinal recente'}</p>
            </div>
          );
        })()}
    </div>
  );
}
