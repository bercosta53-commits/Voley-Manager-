import type { StatusVscs } from '@/lib/tipos';
import { cn } from '@/lib/utils';
import { Chip } from './chip';

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
      <Chip tom="livre" peso="medio" className={COR_STATUS_VSCS[status]}>
        {status}
      </Chip>
      {acao && <span className="text-xs whitespace-nowrap text-text-3">{acao}</span>}
    </span>
  );
}
