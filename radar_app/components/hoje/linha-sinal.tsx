'use client';

import { forwardRef } from 'react';
import type { Conta, Sinal } from '@/lib/tipos';
import { cn, dataCurta, seDiferente } from '@/lib/utils';
import { COR_TIER, NIVEL_GATILHO } from '@/lib/papeis';
import { LogoConta } from './logo-conta';
import { BarraForca } from './forca';
import { forcaDe, pontosInteiros } from '@/lib/caixa';
import type { Ativacao } from '@/lib/playbooks';
import { Zap } from 'lucide-react';

/**
 * Uma linha da caixa de entrada (computador): conta, o sinal em uma frase, quanto somou e quando. A leitura é
 * de cima para baixo como um e-mail; o detalhe do sinal selecionado abre ao lado.
 */
export const LinhaSinal = forwardRef<HTMLButtonElement, { sinal: Sinal; conta: Conta; ativo: boolean; util?: boolean; playbook?: Ativacao; onSelecionar: () => void }>(
  function LinhaSinal({ sinal, conta, ativo, util, playbook, onSelecionar }, ref) {
    const negativo = sinal.categoria === 'negativo';
    const cor = negativo ? 'var(--vr-risk)' : NIVEL_GATILHO[sinal.nivel ?? 'C'].ponto;
    return (
      <li>
        <button
          ref={ref}
          type="button"
          role="option"
          aria-selected={ativo}
          onClick={onSelecionar}
          onFocus={onSelecionar}
          className={cn(
            'relative flex w-full items-start gap-3 px-3.5 py-3 text-left transition-colors duration-[var(--vr-dur-hover)] hover:bg-[var(--vr-surface-2)] focus-visible:shadow-none',
            ativo && 'bg-[var(--vr-surface-3)] hover:bg-[var(--vr-surface-3)]',
          )}
        >
          <span aria-hidden className="absolute top-0 bottom-0 left-0 w-[3px]" style={{ background: ativo ? 'var(--vr-text)' : 'transparent' }} />
          <LogoConta nome={conta.nome} dominio={conta.dominio} tamanho={28} className="mt-0.5 rounded-control" />
          <span className="min-w-0 flex-1">
            <span className="flex items-center gap-1.5">
              <span className="truncate text-sm font-semibold">{conta.nome}</span>
              {conta.tier && <span className={cn('shrink-0 rounded-chip px-1 text-xs font-semibold', COR_TIER[conta.tier] ?? COR_TIER.C)}>{conta.tier}</span>}
              <span className="vr-data ml-auto shrink-0 text-xs text-text-3">{dataCurta(sinal.data)}</span>
            </span>
            <span className="mt-0.5 block truncate text-sm text-text-2">{sinal.sinal ?? sinal.porQueAgora}</span>
            <span className="mt-1 flex items-center gap-1.5 text-xs text-text-3">
              {seDiferente(sinal.sinal ?? sinal.porQueAgora, sinal.rotulo) && (
                <>
                  <span aria-hidden className="size-1.5 shrink-0 rounded-full" style={{ background: cor }} />
                  <span className="truncate">{sinal.rotulo}</span>
                </>
              )}
              {util && <span className="shrink-0 text-ok">· útil</span>}
              {playbook && (
                <span title={`Playbook: ${playbook.playbook.nome}`} className="inline-flex min-w-0 items-center gap-0.5 font-semibold text-warm">
                  <Zap aria-hidden className="size-3 shrink-0" strokeWidth={2} />
                  <span className="truncate">{playbook.playbook.nome}</span>
                </span>
              )}
              {!negativo && <BarraForca forca={forcaDe(sinal)} className="ml-auto shrink-0" />}
              <span className={cn('vr-data shrink-0 font-semibold', negativo && 'ml-auto', negativo || sinal.pontos < 0 ? 'text-risk' : sinal.pontos > 0 ? 'text-warm' : 'text-text-3')}>
                {pontosInteiros(sinal.pontos)}
              </span>
            </span>
          </span>
        </button>
      </li>
    );
  },
);
