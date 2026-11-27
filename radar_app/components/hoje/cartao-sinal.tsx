'use client';

import { forwardRef } from 'react';
import { motion, useMotionValue, useReducedMotion, useTransform, type PanInfo } from 'motion/react';
import { Archive, CalendarClock, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Conta, EstadoSinal, Sinal } from '@/lib/tipos';
import { cn, dataCurta, diasEntre, quando, pontos, seDiferente } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { Tooltip } from '@/components/ui/tooltip';
import Link from 'next/link';
import { hrefConta, primeiraMaiuscula } from '@/lib/contas';
import { IconeSinal } from './icone-sinal';
import { LogoConta } from './logo-conta';
import { ScoreTendencia } from './score';
import { GraficoSinais, type EventoGrafico } from './grafico-sinais';
import { COR_PAPEL, COR_TIER, NIVEL_GATILHO, papelNoComite, rotuloPapel } from '@/lib/papeis';
import { ACOES_DE_ABORDAGEM, ROTULO_RELEVANCIA, type Relevancia } from '@/lib/avaliacao';
import { useApresentacao } from '@/components/ui/use-apresentacao';
import { Evidencia } from '@/components/ui/evidencia';
import { SeloQualificada } from '@/components/ui/selo-qualificada';
import { BarraForca } from './forca';
import { forcaDe, pontosInteiros } from '@/lib/caixa';
import type { Ativacao } from '@/lib/playbooks';
import { OportunidadeVelora, SeloPlaybook } from './playbook';
import { SeloViaQuente } from '@/components/conta/relacionamento';
import { Chip } from '@/components/ui/chip';

/** "Sinal de alta relevância": retorno do time para calibrar o modelo; não muda o score (P1-8). */
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
  /** relevância que a pessoa dá ao sinal (1 comum, 2 forte, 3 decisivo), para calibração */
  onAvaliar?: (n: Relevancia) => void;
  onAbrir: () => void;
  onFoco: () => void;
  /** playbook combinado ativo na conta (fase 3): selo no cartão e substitui a oportunidade isolada */
  playbook?: Ativacao;
  /** alguém da Velora tem acesso direto a uma pessoa do comitê (relação 4–5) */
  viaQuente?: boolean;
}

export const CartaoSinal = forwardRef<HTMLElement, Props>(function CartaoSinal(
  { sinal, conta, estado, hoje, naCaixa, semAcoes, deslizavel, onAcao, onAvaliar, onAbrir, onFoco, playbook, viaQuente },
  ref,
) {
  const reduzir = useReducedMotion();
  const apresentacao = useApresentacao();
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
  const contato = conta.comite.find(p => p.nome === sinal.abordar.nome);
  const papelContato = contato && papelNoComite(contato);
  // eventos do gráfico: cada acontecimento que conta no VSCS, com o que somou ao score + o sinal deste cartão
  const eventos: EventoGrafico[] = (conta.v2?.contribuicoes ?? []).map(c => ({
    data: c.data,
    pontos: Math.round(c.pontos),
    rotulo: c.texto,
    nivel: c.nivel,
    atual: c.id === sinal.id || (c.data === sinal.data && c.texto === (sinal.sinal ?? sinal.porQueAgora)),
  }));
  if (!eventos.some(e => e.atual) && sinal.nivel)
    eventos.push({ data: sinal.data, pontos: Math.round(sinal.pontos), rotulo: sinal.sinal ?? sinal.porQueAgora, nivel: sinal.nivel, atual: true });

  // com 1 ou 2 fatos o gráfico fica quase vazio; mantém quando há playbook, que marca o dia em que ativou
  const comGrafico = eventos.length >= 3 || !!playbook;

  const quem = sinal.abordar.nome ? (
    <>
      <span className="font-medium text-foreground">{sinal.abordar.nome}</span>
      {sinal.abordar.cargo && <span className="text-text-3">, {sinal.abordar.cargo}</span>}
    </>
  ) : (
    // sem nome indicado pelo motor: a persona a procurar e, quando houver, quem do comitê já está mapeado
    <>
      <span className="text-text-2">{sinal.abordar.cargo ? `Persona: ${sinal.abordar.cargo}` : 'Persona não indicada'}</span>
      {conta.comite.length > 0 ? (
        <span className="text-text-3">
          {' · no comitê: '}
          {conta.comite
            .slice(0, 2)
            .map(p => p.nome)
            .join(', ')}
          {conta.comite.length > 2 && ` e mais ${conta.comite.length - 2}`}
        </span>
      ) : (
        <span className="text-text-3"> · ninguém mapeado no comitê</span>
      )}
      <Link href={`${hrefConta(conta.id)}#comite`} className="ml-1.5 text-xs font-medium text-foreground underline decoration-border-strong underline-offset-4" onClick={e => e.stopPropagation()}>
        Ver comitê
      </Link>
    </>
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
                <span className={cn('shrink-0 rounded-chip px-1.5 py-0.5 text-xs font-semibold', COR_TIER[conta.tier] ?? COR_TIER.C)} title={(conta.icp?.motivos ?? []).join(' · ')}>
                  Tier {conta.tier}
                </span>
              )}
              <SeloQualificada conta={conta} />
              {conta.v2?.via_rapida ? (
                <Chip tom="risco-solido" peso="forte" className="shrink-0">Via rápida · 48h</Chip>
              ) : (
                conta.acaoRecomendada &&
                ACOES_DE_ABORDAGEM.has(conta.acaoRecomendada) && (
                  <Chip tom="ok-solido" peso="forte" className="shrink-0">{conta.acaoRecomendada}</Chip>
                )
              )}
            </div>
            <p className="mt-0.5 truncate text-sm text-text-3">{[conta.ramoTI?.nome ?? primeiraMaiuscula(conta.segmento), conta.uf].filter(Boolean).join(' · ')}</p>
          </div>
          <ScoreTendencia score={pontos(conta.score)} tendencia={conta.tendencia} serie={conta.serie} status={conta.vscsStatus} compacto />
        </header>

        <div className="grid gap-4">
          {/* o sinal: nível do gatilho, a sinalização rápida e os pontos — leitura em 2 segundos */}
          <div className="flex min-w-0 flex-col gap-3">
            <div className="flex flex-wrap items-center gap-1.5">
              <span className={cn('inline-flex items-center gap-1 rounded-chip px-1.5 py-0.5 text-xs font-semibold', nivel.cor)}>
                <IconeSinal tipo={sinal.tipo} className="size-3.5" />
                {!negativo && <BarraForca forca={forcaDe(sinal)} />}
                {nivel.rotulo}
              </span>
              {seDiferente(sinal.sinal ?? sinal.porQueAgora, sinal.rotulo) && <Chip tom="neutro">{sinal.rotulo}</Chip>}
              {playbook && <SeloPlaybook ativacao={playbook} />}
              {viaQuente && <SeloViaQuente />}

            </div>
            <div className="flex items-baseline gap-2">
              <p className="text-xl font-semibold leading-snug tracking-tight text-foreground">{sinal.sinal ?? sinal.porQueAgora}</p>
              <span
                  className={cn(
                    'vr-data shrink-0 rounded-chip px-1.5 py-0.5 text-xs font-semibold',
                    sinal.pontos < 0 ? 'bg-risk-bg text-risk' : 'bg-warm-bg text-warm',
                  )}
                >
                  {pontosInteiros(sinal.pontos)}
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
                  ·
                  <Evidencia className="contents" fonte={sinal.fonte} url={sinal.url} fontes={sinal.fontes} coletadoEm={sinal.coletadoEm} confianca={sinal.confianca} pararPropagacao />
                </dd>
              </div>
              <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
                <dt className="text-text-3">Falar com</dt>
                <dd className="flex min-w-0 flex-wrap items-center gap-x-1.5 gap-y-1">
                  <span className="min-w-0">{quem}</span>
                  {papelContato && (
                    <span className={cn('rounded-chip px-1.5 py-0.5 text-xs font-medium', COR_PAPEL[papelContato])}>{rotuloPapel(papelContato)}</span>
                  )}
                </dd>
              </div>
              <OportunidadeVelora sinal={sinal} ativacao={playbook} />
            </dl>
            {/* no modo apresentação a nota sai da tela: ela recalcula o score só neste navegador */}
            {onAvaliar && !apresentacao && <SeletorRelevancia valor={estado?.relevancia} onMudar={onAvaliar} />}
          </div>

          {/* o score da conta no tempo, com cada sinal marcado na data em que aconteceu */}
          <div className="min-w-0 rounded-control border border-border bg-background/40 p-3">
            <p className="mb-1 flex items-center justify-between text-xs text-text-3">
              <span className="font-medium text-text-2">{comGrafico ? 'Score em 90 dias' : 'O que somou ao score'}</span>
              {comGrafico && <span>cada ponto é um sinal</span>}
            </p>
            {comGrafico ? (
              <GraficoSinais serie={conta.serie} eventos={eventos} hoje={hoje} marca={playbook && { data: playbook.ativadoEm, rotulo: playbook.playbook.nome }} />
            ) : (
              // com 1 ou 2 fatos o gráfico fica quase vazio: o mesmo dado em uma linha por fato
              <ul className="mt-1 flex flex-col gap-1 text-sm">
                {[...eventos].sort((a, b) => b.data.localeCompare(a.data)).map(e => (
                  <li key={`${e.data}-${e.rotulo}`} className="flex items-baseline gap-2">
                    <span className={cn('vr-data shrink-0 font-semibold', e.pontos < 0 ? 'text-risk' : 'text-warm')}>{e.pontos > 0 ? `+${e.pontos}` : e.pontos}</span>
                    <span className="vr-data shrink-0 text-xs text-text-3">{dataCurta(e.data)}</span>
                    <span className={cn('min-w-0 truncate', e.atual ? 'text-foreground' : 'text-text-2')}>{e.rotulo}</span>
                  </li>
                ))}
              </ul>
            )}
            {comGrafico && <p className="mt-1 flex flex-wrap gap-x-3 gap-y-0.5 text-xs text-text-3">
              {(['A', 'B', 'C'] as const).map(n => (
                <span key={n} className="inline-flex items-center gap-1">
                  <span className="size-2 rounded-full" style={{ background: NIVEL_GATILHO[n].ponto }} />
                  {NIVEL_GATILHO[n].rotulo}
                </span>
              ))}
            </p>}
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
