import type { StatusVscs } from '@/lib/tipos';
import { cn } from '@/lib/utils';

/** Cor da faixa do VSCS: frio (cinza) → atenção (ardósia) → emergente (âmbar) → alta/máxima (verde). */
export const COR_STATUS_VSCS: Record<StatusVscs, string> = {
  Monitoramento: 'bg-secondary text-text-2',
  Atenção: 'bg-cool-bg text-cool',
  'Oportunidade emergente': 'bg-warm-bg text-warm',
  'Alta prioridade': 'bg-ok-bg text-ok',
  'Prioridade máxima': 'bg-ok text-white',
};

/** Status do VSCS + a ação da matriz ICP × VSCS, em duas linhas curtas. */
export function SeloVscs({ status, acao, className }: { status?: StatusVscs; acao?: string; className?: string }) {
  if (!status) return <span className="text-xs text-text-3">—</span>;
  return (
    <span className={cn('inline-flex flex-col items-start gap-0.5', className)}>
      <span className={cn('rounded-chip px-1.5 py-0.5 text-[11px] font-medium whitespace-nowrap', COR_STATUS_VSCS[status])}>{status}</span>
      {acao && <span className="text-[11px] whitespace-nowrap text-text-3">{acao}</span>}
    </span>
  );
}
