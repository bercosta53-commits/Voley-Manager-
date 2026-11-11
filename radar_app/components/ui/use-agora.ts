'use client';

import { useEffect, useState } from 'react';

/**
 * A data de agora, só no navegador. No servidor (e na primeira pintura) é null: as páginas são geradas
 * no build, então qualquer "hoje" calculado lá fica congelado no dia do deploy e diverge do navegador
 * (erro de hidratação). Quem usa mostra um valor neutro até o efeito rodar.
 */
export function useAgora() {
  const [agora, setAgora] = useState<Date | null>(null);
  useEffect(() => setAgora(new Date()), []);
  return agora;
}

/** AAAA-MM-DD no fuso do navegador (toISOString usaria UTC e viraria o dia às 21h no Brasil). */
export function isoLocal(d: Date) {
  return `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
}
