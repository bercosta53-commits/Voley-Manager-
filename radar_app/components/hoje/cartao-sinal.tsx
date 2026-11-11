'use client';

import { forwardRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react';
import { Archive, CalendarClock, ExternalLink, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Conta, EstadoSinal, Sinal } from '@/lib/tipos';
import { cn, dataCurta, diasEntre, quando } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import Link from 'next/link';
import { hrefConta, primeiraMaiuscula } from '@/lib/contas';
import { IconeSinal } from './icone-sinal';
import { LogoConta } from './logo-conta';
import { ScoreTendencia } from './score';
import { GraficoSinais, type EventoGrafico } from './grafico-sinais';
import { COR_PAPEL, COR_TIER, NIVEL_GATILHO, rotuloPapel } from '@/lib/papeis';
import { ACOES_DE_ABORDAGEM, ROTULO_RELEVANCIA, type Relevancia } from '@/lib/avaliacao';

/** "Sinal de alta relevância": 1 mantém o peso, 2 soma 10%, 3 soma 15% — e o score da conta é recalculado. */
function SeletorRelevancia({ valor, onMudar }: { valor?: Relevancia; onMudar: (n: Relevancia) => void }) {
  return (
    <div className="flex items-center gap-2" onClick={e => e.stopPropagation()}>
      <span className="text-xs text-text-3">Sinal de alta relevância?</span>
      <div role="radiogroup" aria-label="Relevância do sinal" className="flex rounded-control border border-border bg-card p-0.5">
        {([1, 2, 3] as const).map(n => (
          <button
            key={n}
            role="radio"
            aria-checked={valor === n}
            title={ROTULO_RELEVANCIA[n]}
            onClick={() => onMudar(n)}
            className={cn(
              'vr-data grid h-7 w-7 place-items-center rounded-chip text-xs font-semibold transition-colors duration-[var(--vr-dur-hover)] max-md:h-9 max-md:w-9',
              valor === n
                ? n === 3
                  ? 'bg-ok text-white'
                  : n === 2
                    ? 'bg-ok-bg text-ok'
                    : 'bg-secondary text-foreground'
                : 'text-text-3 hover:bg-secondary hover:text-foreground',
            )}
          >
            {n}
          </button>
        ))}
      </div>
    </div>
  );
}

export type AcaoCartao = 'abordar' | 'adiar' | 'util' | 'ruido' | 'arquivar' | 'voltar';

const LIMITE_DESLIZE = 96;
const EASE = [0.16, 1, 0.3, 1] as const;

interface Props {
  sinal: Sinal;
  conta: Conta;
  estado?: EstadoSinal;
  hoje: string;
  /** na caixa, as ações de triagem; fora dela, só "voltar para a caixa" */
  naCaixa: boolean;
  /** dentro do painel do celular: as ações ficam nos botões grandes do painel, não no cartão */
  semAcoes?: boolean;
  deslizavel: boolean;
  onAcao: (acao: AcaoCartao) => void;
  /** relevância que a pessoa dá ao sinal (1 mantém, 2 +10%, 3 +15%) */
  onAvaliar?: (n: Relevancia) => void;
  onAbrir: () => void;
  onFoco: () => void;
}

export const CartaoSinal = forwardRef<HTMLElement, Props>(function CartaoSinal(
  { sinal, conta, estado, hoje, naCaixa, semAcoes, deslizavel, onAcao, onAvaliar, onAbrir, onFoco },
  ref,
) {
  const reduzir = useReducedMotion();
  const x = useMotionValue(0);
  const revelaUtil = useTransform(x, [24, LIMITE_DESLIZE], [0, 1]);
  const revelaArquivar = useTransform(x, [-24, -LIMITE_DESLIZE], [0, 1]);
  // "novo" é a função do ácido: fato de hoje, ainda sem nenhuma ação.
  const novo = naCaixa && !estado?.avaliacao && diasEntre(sinal.data, hoje) <= 0;
  const util = estado?.avaliacao === 'util';

  function soltar(_: unknown, info: PanInfo) {
    if (info.offset.x > LIMITE_DESLIZE) onAcao('util');
    else if (info.offset.x < -LIMITE_DESLIZE) onAcao('arquivar');
  }

  const negativo = sinal.categoria === 'negativo';
  const nivel = negativo ? { ...NIVEL_GATILHO.C, rotulo: 'Sinal negativo', cor: 'bg-risk-bg text-risk' } : NIVEL_GATILHO[sinal.nivel ?? 'C'];
  const papelContato = conta.comite.find(p => p.nome === sinal.abordar.nome)?.papelAbm;
  // eventos do gráfico: cada acontecimento que conta no VSCS, com o que somou ao score + o sinal deste cartão
  const eventos: EventoGrafico[] = (conta.v2?.contribuicoes ?? []).map(c => ({
    data: c.data,
    pontos: Math.round(c.pontos),
    rotulo: c.texto,
    nivel: c.nivel,
    atual: c.id === sinal.id || (c.data === sinal.data && c.texto === (sinal.sinal ?? sinal.porQueAgora)),
  }));
  if (!eventos.some(e => e.atual) && sinal.nivel)
    eventos.push({ data: sinal.data, pontos: sinal.pontos, rotulo: sinal.sinal ?? sinal.porQueAgora, nivel: sinal.nivel, atual: true });

  const quem = sinal.abordar.nome ? (
    <>
      <span className="font-medium text-foreground">{sinal.abordar.nome}</span>
      {sinal.abordar.cargo && <span className="text-text-3">, {sinal.abordar.cargo}</span>}
    </>
  ) : (
    <span className="text-text-2">{sinal.abordar.cargo} (a identificar)</span>
  );

  return (
    <motion.li
      layout={reduzir ? false : 'position'}
      initial={reduzir ? false : { opacity: 0, y: 8 }}
      animate={{ opacity: 1, y: 0, transition: { duration: 0.2, ease: EASE } }}
      exit={
        reduzir
          ? { opacity: 0, transition: { duration: 0.12 } }
          : { opacity: 0, x: x.get() > 0 ? 80 : -80, transition: { duration: 0.32, ease: EASE } }
      }
      transition={{ layout: { type: 'spring', stiffness: 420, damping: 36, mass: 0.9 } }}
      className="relative list-none"
    >
      {/* O que aparece por trás no deslize (celular): direita = útil, esquerda = arquivar. */}
      {deslizavel && naCaixa && (
        <div aria-hidden className="absolute inset-0 flex items-center justify-between overflow-hidden rounded-card px-6">
          <motion.span style={{ opacity: revelaUtil }} className="flex items-center gap-2 font-semibold text-ok">
            <ThumbsUp className="size-5" strokeWidth={1.5} /> Útil
          </motion.span>
          <motion.span style={{ opacity: revelaArquivar }} className="flex items-center gap-2 font-semibold text-text-2">
            Arquivar <Archive className="size-5" strokeWidth={1.5} />
          </motion.span>
        </div>
      )}
      <motion.article
        ref={ref}
        tabIndex={0}
        aria-label={`${conta.nome}: ${sinal.sinal ?? sinal.porQueAgora}.`}
        onFocus={onFoco}
        onClick={deslizavel ? onAbrir : undefined}
        drag={deslizavel && naCaixa && !reduzir ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        dragSnapToOrigin
        onDragEnd={soltar}
        style={{ x }}
        className={cn(
          'vr-card group relative flex flex-col gap-4 overflow-hidden p-4 outline-none md:p-5',
          // faixa à esquerda pelo nível do gatilho: dá pra varrer a caixa só pela cor
          'before:absolute before:inset-y-0 before:left-0 before:w-1',
          sinal.nivel === 'A' ? 'before:bg-warm' : sinal.nivel === 'B' ? 'before:bg-cool' : 'before:bg-border-strong',
          'transition-[box-shadow,border-color] duration-[var(--vr-dur-hover)] ease-out hover:border-border-strong hover:shadow-2',
          deslizavel && 'cursor-pointer touch-pan-y',
        )}
      >
        {/* conta: logo, nome, tier colorido e anel; score grande à direita */}
        <header className="flex items-start gap-3">
          <LogoConta nome={conta.nome} dominio={conta.dominio} tamanho={40} />
          <div className="min-w-0 flex-1">
            <div className="flex flex-wrap items-center gap-x-2 gap-y-1">
              {novo && (
                <span className="size-2 shrink-0 rounded-full bg-acid ring-1 ring-foreground/25" title="Novo">
                  <span className="sr-only">Novo.</span>
                </span>
              )}
              <h2 className="truncate text-md font-semibold">
                <Link
                  href={hrefConta(conta.id)}
                  tabIndex={-1}
                  onClick={e => e.stopPropagation()}
                  className="rounded-chip decoration-border-strong underline-offset-4 hover:underline"
                >
                  {conta.nome}
                </Link>
              </h2>
              {conta.tier && (
                <span className={cn('shrink-0 rounded-chip px-1.5 py-0.5 text-[11px] font-semibold', COR_TIER[conta.tier] ?? COR_TIER.C)} title={(conta.icp?.motivos ?? []).join(' · ')}>
                  Tier {conta.tier}
                </span>
              )}
              {conta.v2?.via_rapida ? (
                <span className="shrink-0 rounded-chip bg-risk px-1.5 py-0.5 text-[11px] font-semibold text-white">Via rápida · 48h</span>
              ) : (
                conta.acaoRecomendada &&
                ACOES_DE_ABORDAGEM.has(conta.acaoRecomendada) && (
                  <span className="shrink-0 rounded-chip bg-ok px-1.5 py-0.5 text-[11px] font-semibold text-white">{conta.acaoRecomendada}</span>
                )
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-text-3">{[conta.ramoTI?.nome ?? primeiraMaiuscula(conta.segmento), conta.uf].filter(Boolean).join(' · ')}</p>
          </div>
          <ScoreTendencia score={conta.score} tendencia={conta.tendencia} serie={conta.serie} status={conta.vscsStatus} compacto />
        </header>

        <div className="grid gap-4 md:grid-cols-[minmax(0,1fr)_280px] md:gap-6">
          {/* o sinal: nível do gatilho, a sinalização rápida e os pontos — leitura em 2 segundos */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-[11px] font-semibold', nivel.cor)}>
                <IconeSinal tipo={sinal.tipo} className="size-3.5" />
                {nivel.rotulo}
              </span>
              <span className="rounded-chip bg-secondary px-1.5 py-0.5 text-[11px] text-text-2">{sinal.rotulo}</span>
            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-semibold leading-snug tracking-tight text-foreground">{sinal.sinal ?? sinal.porQueAgora}</p>
              <span
                  className={cn(
                    'vr-data shrink-0 rounded-chip px-1.5 py-0.5 text-xs font-semibold',
                    sinal.pontos < 0 ? 'bg-risk-bg text-risk' : 'bg-warm-bg text-warm',
                  )}
                >
                  {sinal.pontos < 0 ? `−${Math.abs(sinal.pontos)}` : `+${sinal.pontos}`}
                </span>
            </div>
            {sinal.sinal && <p className="-mt-1.5 line-clamp-2 text-sm text-text-2">{sinal.porQueAgora}</p>}

            <dl className="grid gap-1.5 text-sm">
              <div className="flex flex-wrap items-center gap-x-1.5">
                <dt className="sr-only">Evidência</dt>
                <dd className="flex flex-wrap items-center gap-x-1.5 text-text-3">
                  <time dateTime={sinal.data} className="vr-data text-xs text-text-2">
                    {quando(sinal.data, hoje)}
                  </time>
                  ·<span>{sinal.fonte}</span>
                  {sinal.fontes && sinal.fontes.length > 1 && (
                    <span title={sinal.fontes.map(f => f.fonte).join(', ')}>
                      +{sinal.fontes.length - 1} {sinal.fontes.length > 2 ? 'fontes' : 'fonte'}
                    </span>
                  )}
                  {sinal.url ? (
                    <a
                      href={sinal.url}
                      target="_blank"
                      rel="noopener noreferrer"
                      onClick={e => e.stopPropagation()}
                      className="inline-flex items-center gap-1 rounded-chip text-text-2 underline decoration-border-strong underline-offset-2 hover:text-foreground"
                    >
                      ver fonte <ExternalLink className="size-3" strokeWidth={1.5} />
                    </a>
                  ) : (
                    sinal.exemplo && <span className="rounded-chip border border-border px-1 text-[11px] text-text-3">exemplo</span>
                  )}
                </dd>
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <dt className="text-text-3">Falar com</dt>
                <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="min-w-0">{quem}</span>
                  {papelContato && (
                    <span className={cn('rounded-chip px-1.5 py-0.5 text-[11px] font-medium', COR_PAPEL[papelContato])}>{rotuloPapel(papelContato)}</span>
                  )}
                </dd>
              </div>
            </dl>
            {onAvaliar && <SeletorRelevancia valor={estado?.relevancia} onMudar={onAvaliar} />}
          </div>

          {/* o score da conta no tempo, com cada sinal marcado na data em que aconteceu */}
          <div className="min-w-0 rounded-control border border-border bg-background/40 p-3">
            <p className="mb-1 flex items-center justify-between text-[11px] text-text-3">
              <span className="font-medium text-text-2">Score em 90 dias</span>
              <span>cada ponto é um sinal</span>
            </p>
            <GraficoSinais serie={conta.serie} eventos={eventos} hoje={hoje} />
            <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-[10px] text-text-3">
              {(['A', 'B', 'C'] as const).map(n => (
                <span key={n} className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ background: NIVEL_GATILHO[n].ponto }} />
                  {NIVEL_GATILHO[n].rotulo}
                </span>
              ))}
            </p>
          </div>
        </div>

        {/* ações */}
        {semAcoes ? null : naCaixa ? (
          <div
            className={cn('flex flex-wrap items-center gap-1.5 border-t border-border pt-3', deslizavel && 'hidden')}
            onClick={e => e.stopPropagation()}
          >
            <Tooltip conteudo={<>Abordar <Kbd>a</Kbd></>}>
              <Button
                size="sm"
                variant="secondary"
                className="group-focus-within:border-transparent group-focus-within:bg-primary group-focus-within:text-primary-foreground"
                onClick={() => onAcao('abordar')}
              >
                <Send /> Abordar
              </Button>
            </Tooltip>
            <Tooltip conteudo={<>Adiar 3 dias <Kbd>s</Kbd></>}>
              <Button size="sm" variant="ghost" onClick={() => onAcao('adiar')}>
                <CalendarClock /> Adiar
              </Button>
            </Tooltip>
            <span className="mx-1 h-4 w-px bg-border" aria-hidden />
            <Tooltip conteudo={<>Útil <Kbd>u</Kbd></>}>
              <Button size="sm" variant={util ? 'pressed' : 'ghost'} aria-pressed={util} onClick={() => onAcao('util')}>
                <ThumbsUp className={cn(util && 'text-ok')} /> Útil
              </Button>
            </Tooltip>
            <Tooltip conteudo={<>Ruído: arquiva <Kbd>r</Kbd></>}>
              <Button size="sm" variant="ghost" onClick={() => onAcao('ruido')}>
                <ThumbsDown /> Ruído
              </Button>
            </Tooltip>
            <Tooltip conteudo={<>Arquivar <Kbd>e</Kbd></>}>
              <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onAcao('arquivar')}>
                <Archive /> Arquivar
              </Button>
            </Tooltip>
          </div>
        ) : (
          <div className="flex flex-wrap items-center gap-2 border-t border-border pt-3 text-sm text-text-3" onClick={e => e.stopPropagation()}>
            <span>{situacao(estado)}</span>
            <Button size="sm" variant="ghost" className="ml-auto" onClick={() => onAcao('voltar')}>
              Voltar para a caixa
            </Button>
          </div>
        )}
      </motion.article>
    </motion.li>
  );
});

function situacao(estado?: EstadoSinal) {
  const av = estado?.avaliacao === 'util' ? ' · marcado como útil' : estado?.avaliacao === 'ruido' ? ' · marcado como ruído' : '';
  if (estado?.acao === 'adiado' && estado.ate) return `Adiado até ${dataCurta(estado.ate)}${av}`;
  if (estado?.acao === 'abordado') return `Abordado${estado.em ? ` em ${dataCurta(estado.em)}` : ''}${av}`;
  return `Arquivado${av}`;
}
