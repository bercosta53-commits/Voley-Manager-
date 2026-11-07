'use client';

import { useEffect, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

/** Peças do perfil compacto (topo de Decisores e de Contas): ler de relance, expandir quando quiser. */

export interface Barra {
  id: string;
  rotulo: string;
  valor: number;
}

export const num = (n: number, casas = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas });
export const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

/**
 * Moldura do perfil: números na primeira linha, quatro blocos embaixo, detalhe opcional e um rodapé com a
 * leitura principal e o botão de expandir. Compacto por padrão; a escolha fica guardada neste navegador.
 */
export function FaixaPerfil({
  id,
  titulo,
  numeros,
  blocos,
  detalhe,
  leituras,
}: {
  id: string;
  titulo: string;
  numeros: React.ReactNode;
  blocos: React.ReactNode;
  detalhe: React.ReactNode;
  leituras: string[];
}) {
  const chave = `vr:perfil-${id}`;
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    try {
      setAberto(localStorage.getItem(chave) === 'aberto');
    } catch {}
  }, [chave]);
  const alternar = () => {
    const prox = !aberto;
    setAberto(prox);
    try {
      localStorage.setItem(chave, prox ? 'aberto' : 'fechado');
    } catch {}
  };
  return (
    <section aria-labelledby={`perfil-${id}`} className="vr-card mb-5 overflow-hidden">
      <h2 id={`perfil-${id}`} className="sr-only">
        {titulo}
      </h2>
      <dl className="grid grid-cols-2 divide-border border-b border-border md:grid-cols-4 md:divide-x">{numeros}</dl>
      <div className="grid gap-x-6 gap-y-4 px-4 py-3.5 md:grid-cols-2 xl:grid-cols-4">{blocos}</div>
      {aberto && (
        <div id={`perfil-${id}-detalhe`} className="grid gap-x-6 gap-y-5 border-t border-border px-4 py-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr]">
          {detalhe}
          <Bloco titulo="Leitura">
            <ul className="flex flex-col gap-1.5 text-xs text-text-2">
              {leituras.map((l, i) => (
                <li key={i} className="flex gap-2">
                  <span aria-hidden className="mt-1.5 size-1 shrink-0 rounded-full bg-text-3" />
                  {l}
                </li>
              ))}
            </ul>
          </Bloco>
        </div>
      )}
      <div className="flex items-center gap-3 border-t border-border bg-[var(--vr-surface-2)] px-4 py-2">
        {!aberto && leituras[0] && (
          <p className="min-w-0 flex-1 truncate text-xs text-text-2" title={leituras.join(' ')}>
            {leituras[0]}
          </p>
        )}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls={`perfil-${id}-detalhe`}
          className="ml-auto flex shrink-0 items-center gap-1 rounded-chip text-xs font-medium text-text-2 hover:text-foreground"
        >
          {aberto ? 'Recolher' : 'Expandir análise'}
          <ChevronDown className={cn('size-3.5 transition-transform', aberto && 'rotate-180')} strokeWidth={1.75} />
        </button>
      </div>
    </section>
  );
}

export function Numero({ rotulo, valor, nota, alerta }: { rotulo: string; valor: string; nota: string; alerta?: boolean }) {
  return (
    <div className="flex items-baseline gap-2 px-4 py-2.5">
      <dt className="sr-only">{rotulo}</dt>
      <dd className="font-display text-xl leading-none font-semibold tabular-nums">{valor}</dd>
      <dd className="min-w-0 text-xs leading-tight text-text-3">
        <span className="block text-text-2">{rotulo}</span>
        <span className={cn('block truncate', alerta && 'text-warm')}>{nota}</span>
      </dd>
    </div>
  );
}

export function Bloco({ titulo, dica, children }: { titulo: string; dica?: string; children: React.ReactNode }) {
  return (
    <div className="min-w-0">
      <p className="mb-1.5 flex items-baseline justify-between text-xs font-semibold text-text-2">
        {titulo}
        {dica && <span className="font-normal text-text-3">{dica}</span>}
      </p>
      {children}
    </div>
  );
}

/** Uma barra 100% em segmentos + legenda compacta (rótulo e número) embaixo. */
export function Segmentos({
  barras,
  total,
  estilo,
  ativos,
  onClicar,
}: {
  barras: Barra[];
  total: number;
  estilo: (b: Barra, i: number) => { className?: string; style?: React.CSSProperties };
  ativos?: string[];
  onClicar?: (b: Barra) => void;
}) {
  const algum = !!ativos?.length;
  return (
    <div>
      <div className="flex h-2.5 gap-[2px] overflow-hidden rounded-[3px]">
        {barras.map((b, i) => {
          const { className, style } = estilo(b, i);
          const apagado = algum && !ativos!.includes(b.id);
          return (
            <Tooltip key={b.id} conteudo={`${b.rotulo}: ${num(b.valor)} · ${pct(b.valor, total)}%`}>
              <span tabIndex={0} className={cn('h-full', className, apagado && 'opacity-25!')} style={{ ...style, flexGrow: b.valor, flexBasis: 0 }} />
            </Tooltip>
          );
        })}
      </div>
      <ul className="mt-1.5 flex flex-wrap gap-x-3 gap-y-0.5 text-[11px] text-text-3">
        {barras.map((b, i) => {
          const { className, style } = estilo(b, i);
          const ativo = ativos?.includes(b.id);
          const item = (
            <>
              <span aria-hidden className={cn('size-2 shrink-0 rounded-[2px]', className)} style={style} />
              {b.rotulo}
              <span className="vr-data text-text-2">{pct(b.valor, total)}%</span>
            </>
          );
          return (
            <li key={b.id}>
              {onClicar ? (
                <button
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => onClicar(b)}
                  className={cn('flex items-center gap-1 rounded-chip hover:text-foreground', ativo && 'font-semibold text-foreground')}
                >
                  {item}
                </button>
              ) : (
                <span className="flex items-center gap-1">{item}</span>
              )}
            </li>
          );
        })}
      </ul>
    </div>
  );
}

/** Top N em linhas finas: rótulo, barra curta, número. */
export function Ranking({ barras, total, cor = 'bg-cool', unidade = 'pessoas' }: { barras: Barra[]; total: number; cor?: string; unidade?: string }) {
  const max = Math.max(1, ...barras.map(b => b.valor));
  return (
    <ul className="flex flex-col gap-0.5">
      {barras.map(b => (
        <Tooltip key={b.id} conteudo={`${b.rotulo}: ${num(b.valor)} ${unidade} · ${pct(b.valor, total)}%`}>
          <li tabIndex={0} className="grid grid-cols-[minmax(0,7.5rem)_minmax(0,1fr)_2.25rem] items-center gap-2 text-[11px]">
            <span className="truncate text-text-2">{b.rotulo}</span>
            <span className={cn('h-1.5 rounded-r-[2px]', cor)} style={{ width: `${Math.max(3, (100 * b.valor) / max)}%` }} />
            <span className="vr-data text-right text-text-2">{num(b.valor)}</span>
          </li>
        </Tooltip>
      ))}
    </ul>
  );
}

/** Distribuição em colunas baixas (altura fixa de 40px), número em cima da coluna. */
export function Colunas({ barras, total, dica, rotulo }: { barras: Barra[]; total: number; dica: (b: Barra) => string; rotulo: string }) {
  const max = Math.max(1, ...barras.map(b => b.valor));
  return (
    <div>
      <ul className="flex h-[52px] items-end gap-1 border-b border-border-strong" aria-label={rotulo}>
        {barras.map(b => (
          <Tooltip key={b.id} conteudo={`${dica(b)} · ${pct(b.valor, total)}%`}>
            <li tabIndex={0} className="flex h-full flex-1 flex-col items-center justify-end gap-0.5">
              <span className="vr-data text-[10px] leading-none text-text-2">{num(b.valor)}</span>
              <span className="w-full rounded-t-[2px] bg-cool" style={{ height: `${Math.max(2, (40 * b.valor) / max)}px` }} />
            </li>
          </Tooltip>
        ))}
      </ul>
      <ul aria-hidden className="mt-1 flex gap-1">
        {barras.map(b => (
          <li key={b.id} className="vr-data flex-1 text-center text-[10px] text-text-3">
            {b.rotulo}
          </li>
        ))}
      </ul>
    </div>
  );
}
