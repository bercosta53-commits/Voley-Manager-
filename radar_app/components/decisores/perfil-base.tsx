'use client';

import { useEffect, useMemo, useState } from 'react';
import { ChevronDown } from 'lucide-react';
import type { Base, PapelAbm } from '@/lib/tipos';
import { perfilDecisores, type Barra } from '@/lib/perfil-decisores';
import { COR_BARRA } from '@/lib/papeis';
import { cn } from '@/lib/utils';
import { Tooltip } from '@/components/ui/tooltip';

const num = (n: number, casas = 0) => n.toLocaleString('pt-BR', { maximumFractionDigits: casas, minimumFractionDigits: casas });
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);
/** Nível é ordinal (do topo para a base): um tom só, do mais escuro para o mais claro. */
const OPACIDADE_NIVEL = [1, 0.78, 0.6, 0.45, 0.32, 0.2];

/**
 * Perfil da base de decisores em uma faixa: para ler de relance antes da tabela. Números na primeira linha;
 * embaixo, cada pergunta vira uma barra única segmentada (nível, papel no comitê) ou uma lista curta
 * (funções, contatos por empresa). Passar o mouse mostra o número exato; clicar no papel filtra a tabela.
 */
export function PerfilBase({ base, papeisAtivos, onPapel }: { base: Base; papeisAtivos: PapelAbm[]; onPapel: (p: PapelAbm) => void }) {
  const p = useMemo(() => perfilDecisores(base), [base]);
  const semDecisor = p.lacunas.find(l => l.id === 'Decisor');
  // compacto por padrão; quem expande uma vez continua vendo expandido (preferência deste navegador)
  const [aberto, setAberto] = useState(false);
  useEffect(() => {
    try {
      setAberto(localStorage.getItem('vr:perfil-decisores') === 'aberto');
    } catch {}
  }, []);
  const alternar = () => {
    const prox = !aberto;
    setAberto(prox);
    try {
      localStorage.setItem('vr:perfil-decisores', prox ? 'aberto' : 'fechado');
    } catch {}
  };

  return (
    <section aria-labelledby="perfil-base" className="vr-card mb-5 overflow-hidden">
      <h2 id="perfil-base" className="sr-only">
        Perfil da base de decisores
      </h2>

      <dl className="grid grid-cols-2 divide-border border-b border-border md:grid-cols-4 md:divide-x">
        <Numero rotulo="Pessoas" valor={num(p.pessoas)} nota={`em ${num(p.contas)} contas`} />
        <Numero rotulo="Por conta" valor={num(p.mediaPorConta, 1)} nota={`mediana ${p.medianaPorConta}`} />
        <Numero
          rotulo="Comitê completo"
          valor={`${pct(p.comiteCompleto, p.contas)}%`}
          nota={semDecisor ? `${num(semDecisor.valor)} contas sem decisor` : `${num(p.comiteCompleto)} contas`}
          alerta={!!semDecisor}
        />
        <Numero rotulo="Com e-mail" valor={`${pct(p.comEmail, p.pessoas)}%`} nota={`${pct(p.comLinkedin, p.pessoas)}% com LinkedIn`} />
      </dl>

      <div className="grid gap-x-6 gap-y-4 px-4 py-3.5 md:grid-cols-2 xl:grid-cols-4">
        <Bloco titulo="Nível hierárquico">
          <Segmentos barras={p.niveis} total={p.pessoas} estilo={(_, i) => ({ className: 'bg-cool', style: { opacity: OPACIDADE_NIVEL[i] } })} />
        </Bloco>
        <Bloco titulo="Papel no comitê" dica="clique filtra">
          <Segmentos
            barras={p.papeis}
            total={p.pessoas}
            estilo={b => ({ className: COR_BARRA[b.id as PapelAbm] })}
            ativos={papeisAtivos}
            onClicar={b => onPapel(b.id as PapelAbm)}
          />
        </Bloco>
        <Bloco titulo="Principais funções">
          <Ranking barras={p.funcoes.filter(f => f.rotulo !== 'Outras').slice(0, 5)} total={p.pessoas} />
        </Bloco>
        <Bloco titulo="Contatos por empresa">
          <Colunas barras={p.contatosPorConta} total={p.contas} />
        </Bloco>
      </div>

      {aberto && (
        <div id="perfil-detalhe" className="grid gap-x-6 gap-y-5 border-t border-border px-4 py-4 md:grid-cols-2 xl:grid-cols-[1fr_1fr_1.3fr]">
          <Bloco titulo="Todas as funções">
            <Ranking barras={p.funcoes} total={p.pessoas} />
          </Bloco>
          <Bloco titulo="Onde falta gente no comitê" dica="contas sem o papel">
            <Ranking barras={p.lacunas} total={p.contas} cor="bg-warm" unidade="contas" />
            <p className="mt-2 text-[11px] text-text-3">
              {num(p.comiteCompleto)} de {num(p.contas)} contas ({pct(p.comiteCompleto, p.contas)}%) têm decisor, dono da dor e quem assina o cheque.
            </p>
          </Bloco>
          <Bloco titulo="Leitura da base">
            <ul className="flex flex-col gap-1.5 text-xs text-text-2">
              {p.leituras.map((l, i) => (
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
        {!aberto && p.leituras[0] && <p className="min-w-0 flex-1 truncate text-xs text-text-2" title={p.leituras.slice(0, 2).join(' ')}>{p.leituras[0]}</p>}
        <button
          type="button"
          onClick={alternar}
          aria-expanded={aberto}
          aria-controls="perfil-detalhe"
          className="ml-auto flex shrink-0 items-center gap-1 rounded-chip text-xs font-medium text-text-2 hover:text-foreground"
        >
          {aberto ? 'Recolher' : 'Expandir análise'}
          <ChevronDown className={cn('size-3.5 transition-transform', aberto && 'rotate-180')} strokeWidth={1.75} />
        </button>
      </div>
    </section>
  );
}

function Numero({ rotulo, valor, nota, alerta }: { rotulo: string; valor: string; nota: string; alerta?: boolean }) {
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

function Bloco({ titulo, dica, children }: { titulo: string; dica?: string; children: React.ReactNode }) {
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
function Segmentos({
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
function Ranking({ barras, total, cor = 'bg-cool', unidade = 'pessoas' }: { barras: Barra[]; total: number; cor?: string; unidade?: string }) {
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
function Colunas({ barras, total }: { barras: Barra[]; total: number }) {
  const max = Math.max(1, ...barras.map(b => b.valor));
  return (
    <div>
      <ul className="flex h-[52px] items-end gap-1 border-b border-border-strong" aria-label="Contas por número de contatos mapeados">
        {barras.map(b => (
          <Tooltip key={b.id} conteudo={`${num(b.valor)} contas com ${b.rotulo} ${b.rotulo === '1' ? 'contato' : 'contatos'} · ${pct(b.valor, total)}%`}>
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
