'use client';

import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export const TooltipProvider = TooltipPrimitive.Provider;

/** Dica curta sobre um controle. Sólida (não é camada de glass): é pequena e some rápido. */
export function Tooltip({ conteudo, children, lado = 'top' }: { conteudo: React.ReactNode; children: React.ReactNode; lado?: 'top' | 'bottom' }) {
  return (
    <TooltipPrimitive.Root delayDuration={350}>
      <TooltipPrimitive.Trigger asChild>{children}</TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={lado}
          sideOffset={6}
          className={cn(
            'z-50 flex items-center gap-1.5 rounded-control border border-border bg-card px-2 py-1 text-xs text-text-2 shadow-2',
            'data-[state=delayed-open]:animate-in',
          )}
        >
          {conteudo}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
