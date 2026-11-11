'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { Conta } from '@/lib/tipos';
import { contasDoSetor, type Indicador, type SetorImpactado } from '@/lib/clima';
import { hrefConta } from '@/lib/contas';
import { cn } from '@/lib/utils';
import { PainelFlutuante } from '@/components/ui/painel-flutuante';
import { LogoConta } from '@/components/hoje/logo-conta';
import { COR_STATUS_VSCS } from '@/components/ui/selo-vscs';

const COR_EFEITO = { negativo: 'var(--vr-risk)', positivo: 'var(--vr-ok)' } as const;
const FUNDO_EFEITO = { negativo: 'var(--vr-risk-bg)', positivo: 'var(--vr-ok-bg)' } as const;

/**
 * "Setores impactados" de um indicador (bolsa caiu, dólar subiu…): um chip por setor com a direção e quantas
 * contas da base estão nele; clicar abre as empresas envolvidas naquela tendência.
 */
export function SetoresImpactados({ t, contas }: { t: Indicador; contas: Conta[] }) {
  const [aberto, setAberto] = useState<SetorImpactado | null>(null);
  const setores = useMemo(() => (t.setores ?? []).map(s => ({ s, contas: contasDoSetor(contas, s) })), [t.setores, contas]);
  const lista = aberto ? setores.find(x => x.s === aberto)?.contas ?? [] : [];
  if (!setores.length) return null;
  return (
    <div className="mt-1 border-t border-border pt-2">
      <div className="mb-1.5 text-[11px] font-semibold tracking-[0.04em] text-text-3 uppercase">Setores impactados</div>
      <ul className="flex flex-wrap gap-1.5">
        {setores.map(({ s, contas: cs }) => {
          const Seta = s.efeito === 'negativo' ? ArrowDownRight : ArrowUpRight;
          return (
            <li key={s.rotulo}>
              <button
                type="button"
                onClick={() => setAberto(s)}
                aria-haspopup="dialog"
                title={s.porque}
                className="inline-flex items-center gap-1 rounded-chip border px-1.5 py-0.5 text-xs font-medium transition-colors hover:border-current"
                style={{ color: COR_EFEITO[s.efeito], background: FUNDO_EFEITO[s.efeito], borderColor: 'transparent' }}
              >
                <Seta className="size-3" strokeWidth={2} />
                {s.rotulo}
                <span className="vr-data text-[10px] opacity-80">{cs.length}</span>
              </button>
            </li>
          );
        })}
      </ul>

      <PainelFlutuante
        aberto={!!aberto}
        onFechar={() => setAberto(null)}
        titulo={aberto ? `${aberto.rotulo} · ${t.rotulo}` : ''}
        descricao={aberto ? `${aberto.efeito === 'negativo' ? 'Pressão negativa' : 'Vento a favor'}: ${aberto.porque}` : undefined}
      >
        {aberto && (
          <div className="flex flex-col gap-3">
            <div className="flex flex-wrap items-baseline gap-x-3 gap-y-1 rounded-control bg-[var(--vr-surface-2)] px-3 py-2 text-sm">
              <span className="vr-data text-lg font-semibold">{t.valor}</span>
              <span className="text-text-2">{t.delta}</span>
              <span className="text-xs text-text-3">· {t.fonte}</span>
            </div>
            <p className="text-xs text-text-3">
              {lista.length ? `${lista.length} ${lista.length === 1 ? 'empresa da base' : 'empresas da base'} neste setor, da mais quente para a mais fria.` : 'Nenhuma empresa da base neste setor.'}
            </p>
            <ul className="flex max-h-[60vh] flex-col divide-y divide-border overflow-y-auto">
              {lista.map(c => (
                <li key={c.id}>
                  <Link href={hrefConta(c.id)} className="flex items-center gap-3 py-2.5 hover:bg-[var(--vr-surface-2)]">
                    <LogoConta nome={c.nome} dominio={c.dominio} tamanho={28} className="rounded-[6px]" />
                    <span className="min-w-0 flex-1">
                      <span className="block truncate text-sm font-semibold">{c.nome}</span>
                      <span className="block truncate text-xs text-text-3">
                        {[c.ramoTI?.nome, c.especializacao && c.especializacao.codigo !== 'GEN' ? c.especializacao.nome : null, c.uf, c.tier && `Tier ${c.tier}`].filter(Boolean).join(' · ')}
                      </span>
                    </span>
                    {c.vscsStatus && <span className={cn('hidden rounded-chip px-1.5 py-0.5 text-[10px] sm:inline', COR_STATUS_VSCS[c.vscsStatus])}>{c.vscsStatus}</span>}
                    <span className="vr-data w-8 text-right text-sm font-semibold">{c.score}</span>
                  </Link>
                </li>
              ))}
            </ul>
          </div>
        )}
      </PainelFlutuante>
    </div>
  );
}
