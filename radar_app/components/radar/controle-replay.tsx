'use client';

import { useEffect, useRef } from 'react';
import { Pause, Play, RotateCcw } from 'lucide-react';
import { useReducedMotion } from 'motion/react';

const PASSO_DIAS = 3;
const TOTAL_DIAS = 90;
const PASSOS = TOTAL_DIAS / PASSO_DIAS + 1; // 31 pontos: 0, 3, ..., 90
const DURACAO_TOTAL_MS = 10000; // "toca os últimos 90 dias em ~10s"

export function ControleReplay({ diaOffset, tocando, onMudarDia, onTocar, onParar }: { diaOffset: number | null; tocando: boolean; onMudarDia: (d: number | null) => void; onTocar: () => void; onParar: () => void }) {
  const reduzir = useReducedMotion();
  const indiceAtual = diaOffset == null ? PASSOS - 1 : diaOffset / PASSO_DIAS;
  const timer = useRef<ReturnType<typeof setInterval> | null>(null);

  useEffect(() => {
    if (!tocando) {
      if (timer.current) clearInterval(timer.current);
      return;
    }
    let i = diaOffset == null ? 0 : diaOffset / PASSO_DIAS;
    onMudarDia(i * PASSO_DIAS);
    timer.current = setInterval(
      () => {
        i += 1;
        if (i >= PASSOS) {
          onParar();
          onMudarDia(null);
          return;
        }
        onMudarDia(i * PASSO_DIAS);
      },
      reduzir ? 140 : DURACAO_TOTAL_MS / PASSOS,
    );
    return () => {
      if (timer.current) clearInterval(timer.current);
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [tocando, reduzir]);

  const rotuloDia = diaOffset == null ? 'Hoje' : diaOffset === 0 ? '90 dias atrás' : `${TOTAL_DIAS - diaOffset} dias atrás`;

  return (
    <div className="flex items-center gap-3 rounded-control border border-border bg-card px-3 py-2">
      <button
        onClick={() => (tocando ? onParar() : onTocar())}
        className="grid size-7 shrink-0 place-items-center rounded-full bg-foreground text-background"
        aria-label={tocando ? 'Pausar replay' : 'Tocar replay dos últimos 90 dias'}
      >
        {tocando ? <Pause className="size-3.5" strokeWidth={2} /> : <Play className="size-3.5 translate-x-px" strokeWidth={2} />}
      </button>
      <input
        type="range"
        min={0}
        max={PASSOS - 1}
        step={1}
        value={indiceAtual}
        onChange={e => {
          onParar();
          const i = Number(e.target.value);
          onMudarDia(i === PASSOS - 1 ? null : i * PASSO_DIAS);
        }}
        className="h-1.5 flex-1 cursor-pointer accent-foreground"
        aria-label="Navegar pelos últimos 90 dias"
      />
      <span className="vr-data w-28 shrink-0 text-right text-xs text-text-3">{rotuloDia}</span>
      {diaOffset != null && (
        <button onClick={() => (onParar(), onMudarDia(null))} className="shrink-0 text-text-3 hover:text-foreground" aria-label="Voltar para hoje">
          <RotateCcw className="size-3.5" strokeWidth={1.5} />
        </button>
      )}
    </div>
  );
}
