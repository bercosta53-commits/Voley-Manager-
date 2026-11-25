import type { Conta } from '@/lib/tipos';
import { cn, dataCurta } from '@/lib/utils';

/**
 * Conta Qualificada (regra CQ-1 da inteligência): o motor grava `qualificada` no snapshot; a tela só exibe.
 * "sim" vira o selo; "desconhecido" vira "Qualificação pendente", com as pendências no título; "nao" e campo
 * ausente não mostram nada.
 */
export function SeloQualificada({ conta, className }: { conta: Pick<Conta, 'qualificada'>; className?: string }) {
  const q = conta.qualificada;
  if (!q || q.status === 'nao') return null;
  if (q.status === 'desconhecido')
    return (
      <span
        className={cn('shrink-0 rounded-chip border border-border px-1.5 py-0.5 text-xs text-text-3', className)}
        title={q.pendencias?.length ? `Pendente: ${q.pendencias.join(' · ')}` : 'Faltam dados para aplicar a regra de qualificação'}
      >
        Qualificação pendente
      </span>
    );
  return (
    <span
      className={cn('shrink-0 rounded-chip bg-ok-bg px-1.5 py-0.5 text-xs font-semibold text-ok', className)}
      title={[q.motivo, q.desde && `desde ${dataCurta(q.desde)}`, q.regra_versao && `regra ${q.regra_versao}`].filter(Boolean).join(' · ')}
    >
      Qualificada
    </span>
  );
}
