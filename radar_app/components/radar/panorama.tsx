'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import { ArrowUpRight } from 'lucide-react';
import type { Base, StatusVscs } from '@/lib/tipos';
import { FAIXAS_VSCS } from '@/lib/avaliacao';
import { CATEGORIA_ROTULO_CURTO } from '@/lib/papeis';
import { paraUrl, SEM_FILTRO } from '@/lib/filtros';
import { panorama } from '@/lib/panorama';
import { rotuloCarga } from '@/lib/frescor';
import { cn } from '@/lib/utils';

const COR_BARRA_ESTAGIO: Record<StatusVscs, string> = {
  Monitoramento: 'bg-[var(--vr-border-strong)]',
  Atenção: 'bg-cool',
  'Oportunidade emergente': 'bg-warm',
  'Alta prioridade': 'bg-ok/60',
  'Prioridade máxima': 'bg-ok',
};

const numero = (n: number) => n.toLocaleString('pt-BR');

function Indicador({ valor, rotulo, detalhe, href }: { valor: number; rotulo: string; detalhe?: string; href?: string }) {
  const corpo = (
    <>
      <span className="flex items-baseline gap-1.5">
        <span className="vr-data text-2xl font-semibold tracking-tight tabular-nums">{numero(valor)}</span>
        {href && <ArrowUpRight aria-hidden className="size-3.5 text-text-3 opacity-0 transition-opacity group-hover:opacity-100" strokeWidth={1.75} />}
      </span>
      <span className="text-sm font-medium text-foreground">{rotulo}</span>
      {detalhe && <span className="text-xs text-text-3">{detalhe}</span>}
    </>
  );
  const classe = 'group flex min-w-0 flex-col gap-0.5 px-4 py-3';
  return href ? (
    <Link href={href} className={cn(classe, 'transition-colors hover:bg-[var(--vr-surface-2)] focus-visible:bg-[var(--vr-surface-2)]')}>
      {corpo}
    </Link>
  ) : (
    <div className={classe}>{corpo}</div>
  );
}

/**
 * Panorama da base, no topo do Radar: quanto o Radar monitora e onde está o movimento. Cada número com link
 * abre exatamente a lista que ele conta; os demais são leitura. Tudo vem do snapshot (lib/panorama.ts).
 */
export function Panorama({ base }: { base: Base }) {
  const p = useMemo(() => panorama(base, FAIXAS_VSCS), [base]);
  const tierA = p.porTier.find(t => t.tier === 'A')?.n ?? 0;
  const outrosTiers = p.porTier.filter(t => t.tier !== 'A').map(t => `${t.tier}: ${numero(t.n)}`).join(' · ');
  const estagios = [...p.porEstagio].reverse(); // do frio ao quente, da esquerda para a direita

  return (
    <section aria-labelledby="panorama-base" className="vr-card mb-4 overflow-hidden">
      <div className="flex flex-wrap items-baseline justify-between gap-x-4 gap-y-1 border-b border-border px-4 py-2.5">
        <h2 id="panorama-base" className="text-sm font-semibold">
          Panorama da base
        </h2>
        <Link href="/fontes" className="text-xs text-text-3 hover:text-foreground">
          Dados de {rotuloCarga(base.atualizadoEm ?? base.geradoEm)} · {p.fontesOk} de {p.fontes} fontes ativas
        </Link>
      </div>

      <div className="grid grid-cols-2 divide-border md:grid-cols-3 xl:grid-cols-6 [&>*]:border-b [&>*]:border-border xl:[&>*]:border-b-0 [&>*:not(:last-child)]:border-r">
        <Indicador valor={p.contas} rotulo="Empresas monitoradas" detalhe="pesquisa diária às 00h30" href="/contas" />
        <Indicador
          valor={p.decisores}
          rotulo="Decisores mapeados"
          detalhe={`em ${numero(p.contasComComite)} empresas · ${numero(p.contasComComiteMultiplo)} com 2+ pessoas`}
          href="/decisores"
        />
        <Indicador valor={p.sinais30d} rotulo="Sinais em 30 dias" detalhe={`${numero(p.sinais7d)} nos últimos 7 dias`} href="/" />
        <Indicador valor={p.contasComSinal} rotulo="Empresas com sinal" detalhe="algum fato registrado" href={paraUrl({ ...SEM_FILTRO, comSinal: true })} />
        <Indicador
          valor={p.emOportunidade}
          rotulo="Em oportunidade"
          detalhe={`VSCS ${p.pisoOportunidade} ou mais`}
          href={paraUrl({ ...SEM_FILTRO, scoreMin: p.pisoOportunidade })}
        />
        <Indicador valor={tierA} rotulo="Tier A do ICP" detalhe={outrosTiers || undefined} href={paraUrl({ ...SEM_FILTRO, tiers: ['A'] })} />
      </div>

      <div className="grid gap-4 px-4 py-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-text-3">Estágio de momento (VSCS)</h3>
          <div className="mt-2 flex h-2.5 overflow-hidden rounded-full bg-[var(--vr-surface-3)]" role="img" aria-label={estagios.map(e => `${e.estagio}: ${e.n}`).join(', ')}>
            {estagios.map(e =>
              e.n ? <span key={e.estagio} className={cn('h-full', COR_BARRA_ESTAGIO[e.estagio])} style={{ width: `${(e.n / Math.max(1, p.contas)) * 100}%` }} /> : null,
            )}
          </div>
          <ul className="mt-2 flex flex-wrap gap-x-4 gap-y-1 text-xs text-text-2">
            {estagios.map(e => (
              <li key={e.estagio} className="flex items-center gap-1.5">
                <span aria-hidden className={cn('size-2 rounded-full', COR_BARRA_ESTAGIO[e.estagio])} />
                {e.estagio}
                <span className="vr-data text-text-3">{numero(e.n)}</span>
              </li>
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-text-3">Sinais dos últimos 30 dias, por tipo</h3>
          {p.porCategoria30d.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {p.porCategoria30d.map(c => (
                <li key={c.categoria} className="flex items-center gap-1.5 rounded-chip border border-border px-2 py-0.5 text-xs text-text-2">
                  {CATEGORIA_ROTULO_CURTO[c.categoria] ?? c.categoria}
                  <span className="vr-data font-semibold text-foreground">{numero(c.n)}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-xs text-text-3">Nenhum fato novo nos 30 dias até a última carga.</p>
          )}
        </div>
      </div>
    </section>
  );
}
