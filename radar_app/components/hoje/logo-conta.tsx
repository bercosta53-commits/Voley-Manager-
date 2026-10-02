'use client';

import { useState } from 'react';
import { cn, iniciais } from '@/lib/utils';

/** Logo da empresa pelo domínio (favicon em alta resolução); sem domínio ou se falhar, iniciais sobre fundo neutro. */
export function LogoConta({ nome, dominio, tamanho = 32, className }: { nome: string; dominio: string; tamanho?: number; className?: string }) {
  const [falhou, setFalhou] = useState(false);
  const base = cn('grid shrink-0 place-items-center overflow-hidden rounded-full border border-border bg-secondary', className);
  if (!dominio || falhou)
    return (
      <span aria-hidden className={cn(base, 'font-semibold text-text-2')} style={{ width: tamanho, height: tamanho, fontSize: tamanho * 0.36 }}>
        {iniciais(nome)}
      </span>
    );
  return (
    <span aria-hidden className={cn(base, 'bg-card')} style={{ width: tamanho, height: tamanho }}>
      {/* eslint-disable-next-line @next/next/no-img-element */}
      <img
        src={`https://www.google.com/s2/favicons?domain=${encodeURIComponent(dominio)}&sz=128`}
        alt=""
        width={tamanho * 0.62}
        height={tamanho * 0.62}
        loading="lazy"
        onError={() => setFalhou(true)}
        onLoad={e => {
          // O serviço devolve um globo genérico de 16px quando não acha o ícone: trata como falha.
          if ((e.currentTarget.naturalWidth || 0) < 32) setFalhou(true);
        }}
      />
    </span>
  );
}
