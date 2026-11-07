'use client';

import { useMemo } from 'react';
import { ArrowDownRight, ArrowUpRight } from 'lucide-react';
import type { Base, Conta, Sinal } from '@/lib/tipos';
import { CATEGORIA_ROTULO_CURTO } from '@/lib/papeis';
import { cn, diasEntre, plural } from '@/lib/utils';
import { LogoConta } from '@/components/hoje/logo-conta';
import { COR_STATUS_VSCS } from '@/components/ui/selo-vscs';

const DIAS = 7;

interface Movimento {
  conta: Conta;
  delta: number;
  sinal?: Sinal;
}

/**
 * Principais movimentos da semana, acima do radar: quantos fatos novos chegaram, de que tipo, e as contas que
 * mais subiram ou caíram de score em 7 dias (com o fato que explica). Clicar numa conta abre ela no radar.
 */
export function MovimentosSemana({ base, onAbrir }: { base: Base; onAbrir: (contaId: string) => void }) {
  const m = useMemo(() => {
    const hoje = base.geradoEm;
    const daSemana = base.sinais.filter(s => s.tipo !== 'noticia_setorial' && diasEntre(s.alertaEm || s.data, hoje) <= DIAS && diasEntre(s.data, hoje) <= 30);
    const porConta = new Map<string, Sinal[]>();
    for (const s of daSemana) porConta.set(s.contaId, [...(porConta.get(s.contaId) ?? []), s]);
    const categorias = new Map<string, number>();
    for (const s of daSemana) {
      const k = s.categoria ?? 'contexto';
      categorias.set(k, (categorias.get(k) ?? 0) + 1);
    }
    // variação de score em ~7 dias: a série tem um ponto a cada 3 dias (o último é hoje)
    const movimentos: Movimento[] = base.contas
      .map(c => {
        const s = c.serie;
        const antes = s.length >= 3 ? s[s.length - 3]! : s[0] ?? c.score;
        const doFato = (porConta.get(c.id) ?? []).sort((a, b) => Math.abs(b.pontos) - Math.abs(a.pontos))[0];
        return { conta: c, delta: c.score - antes, sinal: doFato };
      })
      .filter(x => x.delta !== 0);
    const sobem = movimentos.filter(x => x.delta > 0).sort((a, b) => b.delta - a.delta).slice(0, 5);
    const caem = movimentos.filter(x => x.delta < 0).sort((a, b) => a.delta - b.delta).slice(0, 3);
    return {
      sinais: daSemana.length,
      contas: porConta.size,
      categorias: [...categorias.entries()].sort((a, b) => b[1] - a[1]),
      sobem,
      caem,
      subiram: movimentos.filter(x => x.delta > 0).length,
      cairam: movimentos.filter(x => x.delta < 0).length,
    };
  }, [base]);

  return (
    <section aria-labelledby="movimentos-semana" className="vr-card mb-4 overflow-hidden">
      <div className="flex flex-wrap items-baseline gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
        <h2 id="movimentos-semana" className="text-sm font-semibold">
          Movimentos da semana
        </h2>
        <p className="text-xs text-text-3">
          <span className="vr-data text-foreground">{m.sinais}</span> {m.sinais === 1 ? 'fato novo' : 'fatos novos'} em{' '}
          <span className="vr-data text-foreground">{m.contas}</span> {plural(m.contas, 'conta', 'contas').replace(/^\d+ /, '')} ·{' '}
          <span className="text-warm">{m.subiram} subiram</span> · <span className="text-cool">{m.cairam} caíram</span>
        </p>
        <ul className="flex flex-wrap gap-1.5 md:ml-auto" aria-label="Fatos novos por categoria">
          {m.categorias.map(([cat, n]) => (
            <li key={cat} className="rounded-chip bg-secondary px-1.5 py-0.5 text-[11px] text-text-2">
              {CATEGORIA_ROTULO_CURTO[cat] ?? cat} <span className="vr-data font-semibold text-foreground">{n}</span>
            </li>
          ))}
        </ul>
      </div>
      <div className="grid gap-x-6 md:grid-cols-[minmax(0,1.6fr)_minmax(0,1fr)]">
        <Lista titulo="Mais subiram" itens={m.sobem} vazio="Nenhuma conta subiu nesta semana." onAbrir={onAbrir} />
        <Lista titulo="Mais caíram" itens={m.caem} vazio="Nenhuma conta caiu nesta semana." onAbrir={onAbrir} />
      </div>
    </section>
  );
}

function Lista({ titulo, itens, vazio, onAbrir }: { titulo: string; itens: Movimento[]; vazio: string; onAbrir: (id: string) => void }) {
  return (
    <div className="px-4 py-2.5">
      <p className="mb-1 text-xs font-semibold text-text-2">{titulo}</p>
      {itens.length === 0 ? (
        <p className="py-1 text-xs text-text-3">{vazio}</p>
      ) : (
        <ul className="flex flex-col">
          {itens.map(({ conta, delta, sinal }) => (
            <li key={conta.id}>
              <button
                type="button"
                onClick={() => onAbrir(conta.id)}
                className="grid w-full grid-cols-[20px_minmax(0,9rem)_minmax(0,1fr)_auto_2.75rem] items-center gap-2 rounded-control px-1 py-1 text-left text-xs hover:bg-[var(--vr-surface-2)]"
              >
                <LogoConta nome={conta.nome} dominio={conta.dominio} tamanho={20} className="rounded-[4px]" />
                <span className="truncate font-medium text-foreground">{conta.nome}</span>
                <span className="truncate text-text-3">{sinal ? (sinal.sinal ?? sinal.porQueAgora) : 'perdeu força com o tempo'}</span>
                {conta.vscsStatus && <span className={cn('rounded-chip px-1 text-[10px]', COR_STATUS_VSCS[conta.vscsStatus])}>{conta.vscsStatus}</span>}
                <span className={cn('vr-data flex items-center justify-end gap-0.5 font-semibold', delta > 0 ? 'text-warm' : 'text-cool')}>
                  {delta > 0 ? <ArrowUpRight className="size-3" strokeWidth={2} /> : <ArrowDownRight className="size-3" strokeWidth={2} />}
                  {Math.abs(delta)}
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
