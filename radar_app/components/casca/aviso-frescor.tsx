'use client';

import Link from 'next/link';
import { TriangleAlert } from 'lucide-react';
import type { BaseCasca } from '@/lib/casca-dados';
import { cn } from '@/lib/utils';
import { useAgora } from '@/components/ui/use-agora';
import { frescor, rotuloCarga, rotuloIdade } from '@/lib/frescor';

/**
 * Faixa no topo de todas as telas quando a base passou do prazo da carga diária. Com a base em dia não
 * aparece nada: o carimbo da última carga fica no menu lateral.
 */
export function AvisoFrescor({ base }: { base: BaseCasca }) {
  const agora = useAgora();
  if (!agora) return null;
  const iso = base.atualizadoEm ?? base.geradoEm;
  const { nivel, horas } = frescor(iso, agora);
  if (nivel === 'ok') return null;
  const critico = nivel === 'critico' || nivel === 'desconhecido';
  return (
    <div
      role="status"
      className={cn(
        'mx-4 mt-3 flex items-start gap-2.5 rounded-control border px-3.5 py-2.5 text-sm md:mx-8',
        critico ? 'border-risk bg-risk-bg text-foreground' : 'border-warm bg-warm-bg text-foreground',
      )}
    >
      <TriangleAlert className={cn('mt-0.5 size-4 shrink-0', critico ? 'text-risk' : 'text-warm')} strokeWidth={1.75} />
      <p>
        {nivel === 'desconhecido' ? (
          <>A base não informa quando foi atualizada. Confira a pesquisa diária antes de agir sobre os sinais.</>
        ) : (
          <>
            <strong className="font-semibold">Dados de {rotuloCarga(iso)}</strong>, {rotuloIdade(horas)}. A pesquisa diária não atualizou a base
            desde então{critico ? ' — mais de uma carga falhou' : ''}. Os sinais continuam válidos, mas podem faltar fatos recentes.{' '}
            <Link href="/fontes" className="font-medium underline underline-offset-4">
              Ver fontes
            </Link>
          </>
        )}
      </p>
    </div>
  );
}
