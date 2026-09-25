'use client';

import { forwardRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react';
import { Archive, CalendarClock, ExternalLink, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Conta, EstadoSinal, Sinal } from '@/lib/tipos';
import { cn, dataCurta, diasEntre, quando } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import { IconeSinal } from './icone-sinal';
import { LogoConta } from './logo-conta';
import { ScoreTendencia } from './score';

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
  deslizavel: boolean;
  onAcao: (acao: AcaoCartao) => void;
  onAbrir: () => void;
  onFoco: () => void;
}

export const CartaoSinal = forwardRef<HTMLElement, Props>(function CartaoSinal(
  { sinal, conta, estado, hoje, naCaixa, deslizavel, onAcao, onAbrir, onFoco },
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
        aria-label={`${conta.nome}: ${sinal.rotulo}. ${sinal.porQueAgora}`}
        onFocus={onFoco}
        onClick={deslizavel ? onAbrir : undefined}
        drag={deslizavel && naCaixa && !reduzir ? 'x' : false}
        dragConstraints={{ left: 0, right: 0 }}
        dragElastic={0.55}
        dragSnapToOrigin
        onDragEnd={soltar}
        style={{ x }}
        className={cn(
          'vr-card group relative flex flex-col gap-3 p-4 outline-none md:p-5',
          'transition-[box-shadow,border-color] duration-[var(--vr-dur-hover)] ease-out hover:border-border-strong hover:shadow-2',
          deslizavel && 'cursor-pointer touch-pan-y',
        )}
      >
        {/* conta + calor */}
        <header className="flex items-start gap-3">
          <LogoConta nome={conta.nome} dominio={conta.dominio} tamanho={36} />
          <div className="min-w-0 flex-1">
            <div className="flex items-center gap-2">
              {novo && (
                <span className="size-2 shrink-0 rounded-full bg-acid ring-1 ring-foreground/25" title="Novo">
                  <span className="sr-only">Novo.</span>
                </span>
              )}
              <h2 className="truncate text-md font-semibold">{conta.nome}</h2>
              {conta.tier && (
                <span className="shrink-0 rounded-chip border border-border px-1 text-[11px] font-medium text-text-3" title={`Tier ${conta.tier}`}>
                  <span className="sr-only">Tier </span>
                  {conta.tier}
                </span>
              )}
            </div>
            <p className="truncate text-sm text-text-3">{[primeiraMaiuscula(conta.segmento), conta.uf].filter(Boolean).join(' · ')}</p>
          </div>
          <ScoreTendencia score={conta.score} tendencia={conta.tendencia} serie={conta.serie} compacto={deslizavel} />
        </header>

        {/* o sinal: tipo e por que agora */}
        <div className="flex flex-col gap-1.5">
          <span className="inline-flex w-fit items-center gap-1.5 rounded-chip bg-secondary px-2 py-0.5 text-xs font-medium text-text-2">
            <IconeSinal tipo={sinal.tipo} className="size-3.5" />
            {sinal.rotulo}
          </span>
          <p className="text-md leading-snug text-foreground">{sinal.porQueAgora}</p>
        </div>

        {/* evidência + quem abordar */}
        <dl className="grid gap-1 text-sm">
          <div className="flex flex-wrap items-center gap-x-1.5">
            <dt className="sr-only">Evidência</dt>
            <dd className="flex flex-wrap items-center gap-x-1.5 text-text-3">
              <span className="text-text-2">{sinal.fonte}</span>·
              <time dateTime={sinal.data} className="vr-data text-xs">
                {quando(sinal.data, hoje)}
              </time>
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
          <div className="flex flex-wrap items-center gap-x-1.5">
            <dt className="text-text-3">Falar com</dt>
            <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5">
              <span className="min-w-0">{quem}</span>
              <span className="rounded-chip border border-border px-1.5 text-[11px] text-text-3">{sinal.abordar.papel}</span>
            </dd>
          </div>
        </dl>

        {/* ações */}
        {naCaixa ? (
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

const primeiraMaiuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

function situacao(estado?: EstadoSinal) {
  const av = estado?.avaliacao === 'util' ? ' · marcado como útil' : estado?.avaliacao === 'ruido' ? ' · marcado como ruído' : '';
  if (estado?.acao === 'adiado' && estado.ate) return `Adiado até ${dataCurta(estado.ate)}${av}`;
  if (estado?.acao === 'abordado') return `Abordado${estado.em ? ` em ${dataCurta(estado.em)}` : ''}${av}`;
  return `Arquivado${av}`;
}
