import { cn } from '@/lib/utils';

/**
 * Rótulo de seção (título pequeno de cartão: "Comitê de compra", "Linha do tempo") e, com `caps`, o sobretítulo
 * acima de um título grande ("BRIEFING DE REUNIÃO", "PLAYBOOK ATIVO"). Um estilo só para cada uso em todas as telas.
 */
export function Rotulo({
  como: Tag = 'h2',
  caps = false,
  className,
  ...props
}: React.HTMLAttributes<HTMLElement> & { como?: 'h2' | 'h3' | 'p' | 'span'; caps?: boolean }) {
  return <Tag className={cn('text-xs font-semibold text-text-3', caps && 'tracking-wider uppercase', className)} {...props} />;
}
