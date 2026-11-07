'use client';

import { useMemo } from 'react';
import type { Base, PapelAbm } from '@/lib/tipos';
import { perfilDecisores, type Barra } from '@/lib/perfil-decisores';
import { COR_BARRA } from '@/lib/papeis';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

const num = (n: number, casas = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas });
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

/**
 * Perfil da base de decisores, no topo da tela: quem são (nível e função pelo cargo), que papel têm no
 * comitê, quantos contatos cada empresa tem e onde faltam pessoas. Um gráfico por pergunta, uma cor por
 * gráfico (o papel no comitê usa a mesma cor da tag da tabela); passar o mouse mostra o número e a fatia.
 */
export function PerfilBase({ base, papeisAtivos, onPapel }: { base: Base; papeisAtivos: PapelAbm[]; onPapel: (p: PapelAbm) => void }) {
  const p = useMemo(() => perfilDecisores(base), [base]);

  return (
    <section aria-labelledby="perfil-base" className="mb-6">
      <h2 id="perfil-base" className="sr-only">
        Perfil da base de decisores
      </h2>

      {/* números de abertura */}
      <dl className="grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border lg:grid-cols-4">
        <Numero rotulo="Pessoas mapeadas" valor={num(p.pessoas)} nota={`em ${num(p.contas)} contas`} />
        <Numero rotulo="Contatos por conta" valor={num(p.mediaPorConta, 1)} nota={`mediana ${p.medianaPorConta}`} />
        <Numero rotulo="Comitê completo" valor={`${pct(p.comiteCompleto, p.contas)}%`} nota={`${num(p.comiteCompleto)} contas com decisor, dono da dor e cheque`} />
        <Numero rotulo="Canal de contato" valor={`${pct(p.comEmail, p.pessoas)}%`} nota={`com e-mail · ${pct(p.comLinkedin, p.pessoas)}% com LinkedIn`} />
      </dl>

      <div className="mt-4 grid gap-4 lg:grid-cols-3">
        <Painel titulo="Nível hierárquico" legenda="pelo cargo">
          <Barras barras={p.niveis} total={p.pessoas} cor="bg-cool" />
        </Painel>
        <Painel titulo="Principais funções" legenda="o que a pessoa decide">
          <Barras barras={p.funcoes} total={p.pessoas} cor="bg-cool" />
        </Painel>
        <Painel titulo="Papel no comitê de compra" legenda="clique para filtrar a tabela">
          <Barras
            barras={p.papeis}
            total={p.pessoas}
            corDe={b => COR_BARRA[b.id as PapelAbm]}
            ativos={papeisAtivos}
            onClicar={b => onPapel(b.id as PapelAbm)}
          />
        </Painel>
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)_minmax(0,1.2fr)]">
        <Painel titulo="Contatos por empresa" legenda="quantas contas têm N pessoas mapeadas">
          <Colunas barras={p.contatosPorConta} total={p.contas} />
        </Painel>
        <Painel titulo="Onde falta gente no comitê" legenda="contas sem o papel mapeado">
          <Barras barras={p.lacunas} total={p.contas} cor="bg-warm" unidade="contas" />
        </Painel>
        <Painel titulo="Leitura da base">
          <ul className="flex flex-col gap-2.5 text-sm text-text-2">
            {p.leituras.map((l, i) => (
              <li key={i} className="flex gap-2">
                <span aria-hidden className="mt-2 size-1 shrink-0 rounded-full bg-text-3" />
                {l}
              </li>
            ))}
          </ul>
        </Painel>
      </div>
    </section>
  );
}

function Numero({ rotulo, valor, nota }: { rotulo: string; valor: string; nota: string }) {
  return (
    <div className="bg-[var(--vr-surface)] px-4 py-3.5">
      <dt className="text-xs text-text-3">{rotulo}</dt>
      <dd className="mt-1 font-display text-2xl leading-none font-semibold tracking-tight tabular-nums">{valor}</dd>
      <dd className="mt-1.5 text-xs text-text-3">{nota}</dd>
    </div>
  );
}

function Painel({ titulo, legenda, children }: { titulo: string; legenda?: string; children: React.ReactNode }) {
  return (
    <div className="vr-card p-4">
      <div className="mb-3 flex items-baseline justify-between gap-3">
        <h3 className="text-sm font-semibold">{titulo}</h3>
        {legenda && <span className="text-right text-xs text-text-3">{legenda}</span>}
      </div>
      {children}
    </div>
  );
}

/** Barras horizontais com rótulo à esquerda e valor à direita; a barra é proporcional ao maior valor. */
function Barras({
  barras,
  total,
  cor,
  corDe,
  ativos,
  onClicar,
  unidade = 'pessoas',
}: {
  barras: Barra[];
  total: number;
  cor?: string;
  corDe?: (b: Barra) => string;
  ativos?: string[];
  onClicar?: (b: Barra) => void;
  unidade?: string;
}) {
  const max = Math.max(1, ...barras.map(b => b.valor));
  return (
    <ul className="flex flex-col gap-1">
      {barras.map(b => {
        const ativo = ativos?.includes(b.id);
        const apagado = !!ativos?.length && !ativo;
        const conteudo = (
          <>
            <span className={cn('truncate text-left text-sm', apagado ? 'text-text-3' : 'text-text-2')}>{b.rotulo}</span>
            <span className="relative h-2.5 rounded-r-[3px] bg-[var(--vr-surface-2)]">
              <span
                className={cn('absolute inset-y-0 left-0 rounded-r-[3px] transition-opacity', corDe ? corDe(b) : cor, apagado && 'opacity-30')}
                style={{ width: `${Math.max(2, (100 * b.valor) / max)}%` }}
              />
            </span>
            <span className="vr-data text-right text-xs text-foreground">{num(b.valor)}</span>
          </>
        );
        const classe = cn(
          'grid w-full grid-cols-[minmax(0,9.5rem)_minmax(0,1fr)_3rem] items-center gap-3 rounded-control px-1.5 py-1',
          onClicar && 'cursor-pointer hover:bg-[var(--vr-surface-2)]',
          ativo && 'bg-[var(--vr-surface-3)]',
        );
        return (
          <li key={b.id}>
            <Tooltip conteudo={`${b.rotulo}: ${num(b.valor)} ${unidade} · ${pct(b.valor, total)}% do total`}>
              {onClicar ? (
                <button type="button" aria-pressed={ativo} className={classe} onClick={() => onClicar(b)}>
                  {conteudo}
                </button>
              ) : (
                <div tabIndex={0} className={classe}>
                  {conteudo}
                </div>
              )}
            </Tooltip>
          </li>
        );
      })}
    </ul>
  );
}

/** Colunas (distribuição): uma por faixa de contatos, valor em cima, faixa embaixo. */
function Colunas({ barras, total }: { barras: Barra[]; total: number }) {
  const max = Math.max(1, ...barras.map(b => b.valor));
  return (
    <div>
      <ul className="flex h-36 items-end gap-2 border-b border-border-strong" aria-label="Contas por número de contatos mapeados">
        {barras.map(b => (
          <li key={b.id} className="flex h-full flex-1 flex-col justify-end">
            <Tooltip conteudo={`${num(b.valor)} contas com ${b.rotulo} ${b.rotulo === '1' ? 'contato' : 'contatos'} · ${pct(b.valor, total)}%`}>
              <div tabIndex={0} className="group flex h-full flex-col items-center justify-end gap-1 rounded-t-[3px] px-0.5 hover:bg-[var(--vr-surface-2)]">
                <span className="vr-data text-xs text-foreground">{num(b.valor)}</span>
                <span className="w-full rounded-t-[3px] bg-cool" style={{ height: `${Math.max(2, (100 * b.valor) / max) * 0.8}%` }} />
              </div>
            </Tooltip>
          </li>
        ))}
      </ul>
      <ul aria-hidden className="mt-1.5 flex gap-2">
        {barras.map(b => (
          <li key={b.id} className="vr-data flex-1 text-center text-xs text-text-3">
            {b.rotulo}
          </li>
        ))}
      </ul>
      <p className="mt-1 text-center text-xs text-text-3">contatos mapeados na conta</p>
    </div>
  );
}
