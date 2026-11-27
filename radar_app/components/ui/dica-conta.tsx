'use client';

import { useEffect, useRef, useState } from 'react';
import * as TooltipPrimitive from '@radix-ui/react-tooltip';
import { cn } from '@/lib/utils';

export interface ResumoConta {
  nome: string;
  /** "Software e Plataformas · SP · Tier A" */
  contexto?: string;
  /** o que a empresa faz, em uma linha */
  descricao?: string | null;
  /** pares curtos em destaque: Score 42 · Atenção, Classe B1 3,25 … */
  numeros?: { rotulo: string; valor: React.ReactNode; tom?: 'ok' | 'warm' | 'neutro' }[];
  /** desenho opcional à esquerda (o mini radar das quatro dimensões) */
  grafico?: React.ReactNode;
  /** o fato mais recente ou mais forte, com data */
  fato?: { texto: string; data?: string | null } | null;
  /** uma linha de leitura: o que falta, a ação recomendada */
  leitura?: string | null;
}

const TOM = { ok: 'text-ok', warm: 'text-warm', neutro: 'text-foreground' } as const;

/**
 * Resumo da conta ao passar o mouse (ou focar pelo teclado) sobre o nome: contexto, números principais, o radar
 * quando houver e o último fato. Só leitura; o clique continua levando à conta. No celular, onde não há mouse,
 * o toque longo (meio segundo) abre o cartão sem abrir a conta; o toque normal segue abrindo a conta.
 */
const TOQUE_LONGO_MS = 500;
export function DicaConta({ resumo, children, lado = 'right' }: { resumo: ResumoConta; children: React.ReactNode; lado?: 'top' | 'right' | 'bottom' | 'left' }) {
  const { nome, contexto, descricao, numeros, grafico, fato, leitura } = resumo;
  const [aberto, setAberto] = useState(false);
  // tela estreita (celular): o cartão abre embaixo do nome, que é onde cabe
  const [estreito, setEstreito] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const ver = () => setEstreito(mq.matches);
    ver();
    mq.addEventListener('change', ver);
    return () => mq.removeEventListener('change', ver);
  }, []);
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);
  const foiLongo = useRef(false);
  const cancelar = () => {
    if (timer.current) clearTimeout(timer.current);
    timer.current = null;
  };
  return (
    <TooltipPrimitive.Root delayDuration={250} open={aberto} onOpenChange={setAberto}>
      <TooltipPrimitive.Trigger
        asChild
        onPointerDown={e => {
          if (e.pointerType !== 'touch') return;
          foiLongo.current = false;
          cancelar();
          timer.current = setTimeout(() => {
            foiLongo.current = true;
            setAberto(true);
          }, TOQUE_LONGO_MS);
        }}
        onPointerUp={cancelar}
        onPointerCancel={cancelar}
        onPointerMove={e => e.pointerType === 'touch' && Math.abs(e.movementY) > 6 && cancelar()}
        // depois de um toque longo, o "clique" que o navegador dispara ao soltar não abre a conta
        onClickCapture={e => {
          if (foiLongo.current) {
            e.preventDefault();
            e.stopPropagation();
            foiLongo.current = false;
          }
        }}
        onContextMenu={e => foiLongo.current && e.preventDefault()}
      >
        {children}
      </TooltipPrimitive.Trigger>
      <TooltipPrimitive.Portal>
        <TooltipPrimitive.Content
          side={estreito ? 'bottom' : lado}
          align="start"
          sideOffset={8}
          collisionPadding={12}
          className="z-50 w-[300px] max-w-[calc(100vw-24px)] rounded-card border border-border bg-card p-3.5 text-left shadow-3"
        >
          <p className="text-sm leading-snug font-semibold text-foreground">{nome}</p>
          {contexto && <p className="mt-0.5 text-xs text-text-3">{contexto}</p>}
          {descricao && <p className="mt-1.5 line-clamp-2 text-xs text-text-2">{descricao}</p>}
          {(grafico || numeros?.length) && (
            <div className={cn('mt-3 flex items-center gap-3', !grafico && 'block')}>
              {grafico}
              {!!numeros?.length && (
                <dl className="grid min-w-0 flex-1 grid-cols-2 gap-x-3 gap-y-1.5">
                  {numeros.map(n => (
                    <div key={n.rotulo} className="min-w-0">
                      <dt className="text-xs text-text-3">{n.rotulo}</dt>
                      <dd className={cn('vr-data truncate text-sm font-semibold', TOM[n.tom ?? 'neutro'])}>{n.valor}</dd>
                    </div>
                  ))}
                </dl>
              )}
            </div>
          )}
          {fato?.texto && (
            <p className="mt-3 border-t border-border pt-2 text-xs text-text-2">
              <span className="line-clamp-2">{fato.texto}</span>
              {fato.data && <span className="vr-data mt-0.5 block text-text-3">{fato.data}</span>}
            </p>
          )}
          {leitura && <p className="mt-2 text-xs font-medium text-text-2">{leitura}</p>}
        </TooltipPrimitive.Content>
      </TooltipPrimitive.Portal>
    </TooltipPrimitive.Root>
  );
}
