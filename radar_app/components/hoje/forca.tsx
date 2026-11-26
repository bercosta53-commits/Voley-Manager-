import { cn } from '@/lib/utils';
import { FORCA_ROTULO, type Forca } from '@/lib/caixa';

const CHEIAS: Record<Forca, number> = { forte: 3, medio: 2, contexto: 1 };

/** Força do sinal em 3 traços (forte, médio, contexto): lê-se sem decimais nem legenda. */
export function BarraForca({ forca, className }: { forca: Forca; className?: string }) {
  const n = CHEIAS[forca];
  return (
    <span role="img" aria-label={`Força ${FORCA_ROTULO[forca]}`} title={`Força ${FORCA_ROTULO[forca]}`} className={cn('inline-flex items-end gap-[2px]', className)}>
      {[1, 2, 3].map(i => (
        <span key={i} aria-hidden className={cn('w-[3px] rounded-[1px]', i <= n ? 'bg-foreground' : 'bg-border-strong')} style={{ height: 4 + i * 3 }} />
      ))}
    </span>
  );
}
