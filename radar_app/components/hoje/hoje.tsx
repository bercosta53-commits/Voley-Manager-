'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Archive, CalendarClock, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Base, EstadoSinal, Sinal } from '@/lib/tipos';
import { cn, dataCurta, dataLonga, plural, somarDias } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { PainelFlutuante } from '@/components/ui/painel-flutuante';
import { Abordar } from './abordar';
import { CartaoSinal, type AcaoCartao } from './cartao-sinal';
import { CaixaVazia, ErroCarregar, ListaEsqueleto, SemPermissao } from './estados';
import { NavInferior, NavTopo, TopoCelular, VISOES, type Visao } from './navegacao';
import { useEstados } from './estado';

export type EstadoTela = 'normal' | 'carregando' | 'vazio' | 'erro' | 'sem-permissao';

const ADIAR_DIAS = 3;

function useCelular() {
  const [celular, setCelular] = useState(false);
  useEffect(() => {
    const mq = window.matchMedia('(max-width: 767px)');
    const ver = () => setCelular(mq.matches);
    ver();
    mq.addEventListener('change', ver);
    return () => mq.removeEventListener('change', ver);
  }, []);
  return celular;
}

const ESTADOS: EstadoTela[] = ['carregando', 'vazio', 'erro', 'sem-permissao'];

export function Hoje({ base, estadoTela: estadoFixo }: { base: Base; estadoTela?: EstadoTela }) {
  // ?estado=... mostra cada estado obrigatório da tela, para revisão.
  const [estadoUrl, setEstadoUrl] = useState<EstadoTela>('normal');
  useEffect(() => {
    const e = new URLSearchParams(location.search).get('estado') as EstadoTela | null;
    if (e && ESTADOS.includes(e)) setEstadoUrl(e);
  }, []);
  const estadoTela = estadoFixo ?? estadoUrl;
  const hoje = base.geradoEm;
  const { estados, salvar, pronto } = useEstados();
  const [visao, setVisao] = useState<Visao>('caixa');
  const [foco, setFoco] = useState(0);
  const [abordarAlvo, setAbordarAlvo] = useState<Sinal | null>(null);
  const [detalhe, setDetalhe] = useState<Sinal | null>(null);
  const celular = useCelular();
  const refs = useRef<(HTMLElement | null)[]>([]);

  const contas = useMemo(() => new Map(base.contas.map(c => [c.id, c])), [base.contas]);
  const sinais = estadoTela === 'vazio' ? [] : base.sinais;

  const naCaixa = useCallback(
    (e?: EstadoSinal) => !e?.acao || (e.acao === 'adiado' && !!e.ate && e.ate <= hoje),
    [hoje],
  );
  const listas = useMemo(() => {
    const caixa: Sinal[] = [],
      adiados: Sinal[] = [],
      concluidos: Sinal[] = [];
    for (const s of sinais) {
      const e = estados[s.id];
      if (naCaixa(e)) caixa.push(s);
      else if (e?.acao === 'adiado') adiados.push(s);
      else concluidos.push(s);
    }
    return { caixa, adiados, concluidos };
  }, [sinais, estados, naCaixa]);
  const lista = listas[visao];
  const contagens = { caixa: listas.caixa.length, adiados: listas.adiados.length, concluidos: listas.concluidos.length };
  const novosHoje = listas.caixa.filter(s => s.data >= hoje).length;

  // ---------- ações ----------

  const mudar = useCallback(
    (s: Sinal, mudanca: EstadoSinal | null, aviso?: string, icone?: React.ReactNode) => {
      const anterior = estados[s.id];
      const prox = { ...estados };
      if (mudanca === null) delete prox[s.id];
      else prox[s.id] = { ...anterior, ...mudanca, em: hoje };
      salvar(prox);
      if (aviso)
        toast(aviso, {
          icon: icone,
          action: {
            label: 'Desfazer',
            onClick: () => {
              const volta = { ...prox };
              if (anterior) volta[s.id] = anterior;
              else delete volta[s.id];
              salvar(volta);
            },
          },
        });
    },
    [estados, salvar, hoje],
  );

  const agir = useCallback(
    (s: Sinal, acao: AcaoCartao) => {
      const conta = contas.get(s.contaId)!;
      const e = estados[s.id];
      if (acao === 'abordar') return setAbordarAlvo(s);
      if (acao === 'adiar') {
        const ate = somarDias(hoje, ADIAR_DIAS);
        return mudar(s, { acao: 'adiado', ate }, `${conta.nome}: adiado até ${dataCurta(ate)}`, <CalendarClock className="size-4" strokeWidth={1.5} />);
      }
      if (acao === 'util') {
        const ja = e?.avaliacao === 'util';
        return mudar(s, { avaliacao: ja ? undefined : 'util' }, ja ? undefined : 'Marcado como útil. Isso ensina o radar.', <ThumbsUp className="size-4 text-ok" strokeWidth={1.5} />);
      }
      if (acao === 'ruido')
        return mudar(s, { acao: 'arquivado', avaliacao: 'ruido' }, `${conta.nome}: marcado como ruído e arquivado`, <ThumbsDown className="size-4" strokeWidth={1.5} />);
      if (acao === 'arquivar') return mudar(s, { acao: 'arquivado' }, `${conta.nome}: arquivado`, <Archive className="size-4" strokeWidth={1.5} />);
      if (acao === 'voltar') return mudar(s, null, `${conta.nome}: de volta à caixa`);
    },
    [contas, estados, hoje, mudar],
  );

  // ---------- teclado: j/k navegam, a u r s e agem no cartão em foco ----------

  useEffect(() => {
    function tecla(ev: KeyboardEvent) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || abordarAlvo || detalhe) return;
      const alvo = ev.target as HTMLElement;
      if (alvo.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      const n = lista.length;
      if (!n) return;
      const atual = Math.min(foco, n - 1);
      const mapa: Record<string, AcaoCartao> = visao === 'caixa' ? { a: 'abordar', u: 'util', r: 'ruido', s: 'adiar', e: 'arquivar' } : {};
      if (ev.key === 'j' || ev.key === 'k') {
        ev.preventDefault();
        // Primeiro j (nenhum cartão em foco ainda) fica no primeiro cartão.
        const algumFocado = refs.current.some(r => r && r === document.activeElement);
        const prox = !algumFocado ? atual : ev.key === 'j' ? Math.min(n - 1, atual + 1) : Math.max(0, atual - 1);
        setFoco(prox);
        refs.current[prox]?.focus();
        refs.current[prox]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if (mapa[ev.key]) {
        ev.preventDefault();
        agir(lista[atual]!, mapa[ev.key]!);
      }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [lista, foco, visao, agir, abordarAlvo, detalhe]);

  // Quando um cartão sai, o foco fica no que subiu para o lugar dele.
  const tamanho = lista.length;
  useEffect(() => {
    if (foco >= tamanho && tamanho > 0) setFoco(tamanho - 1);
  }, [foco, tamanho]);

  const trocarVisao = (v: Visao) => {
    setVisao(v);
    setFoco(0);
  };

  // ---------- tela ----------

  let conteudo: React.ReactNode;
  if (estadoTela === 'carregando' || !pronto) conteudo = <ListaEsqueleto />;
  else if (estadoTela === 'erro') conteudo = <ErroCarregar onTentar={() => location.reload()} />;
  else if (estadoTela === 'sem-permissao') conteudo = <SemPermissao />;
  else if (!lista.length) conteudo = <CaixaVazia visao={visao} />;
  else
    conteudo = (
      <ul className="flex flex-col gap-3" aria-label={`Sinais: ${VISOES.find(v => v.id === visao)!.rotulo}`}>
        <AnimatePresence initial={false} mode="popLayout">
          {lista.map((s, i) => (
            <CartaoSinal
              key={s.id}
              ref={el => {
                refs.current[i] = el;
              }}
              sinal={s}
              conta={contas.get(s.contaId)!}
              estado={estados[s.id]}
              hoje={hoje}
              naCaixa={visao === 'caixa'}
              deslizavel={celular}
              onAcao={a => agir(s, a)}
              onAbrir={() => setDetalhe(s)}
              onFoco={() => setFoco(i)}
            />
          ))}
        </AnimatePresence>
      </ul>
    );

  const semDados = estadoTela === 'erro' || estadoTela === 'sem-permissao';
  const carregando = estadoTela === 'carregando' || !pronto;
  const comLista = !semDados && !carregando && lista.length > 0;
  const detalheConta = detalhe ? contas.get(detalhe.contaId) : undefined;

  return (
    <>
      <NavTopo ficticia={!!base.ficticia} />
      <TopoCelular ficticia={!!base.ficticia} />
      <main className="mx-auto w-full max-w-[760px] px-4 pt-2 pb-28 md:px-6 md:pt-10 md:pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Hoje</h1>
            <p className="mt-1 text-sm text-text-3">
              {dataLonga(hoje)}
              {!semDados && !carregando && (
                <>
                  {' · '}
                  {plural(contagens.caixa, 'sinal na caixa', 'sinais na caixa')}
                  {novosHoje > 0 && `, ${novosHoje} de hoje`}
                </>
              )}
            </p>
          </div>
          {!semDados && (
            <div role="tablist" aria-label="Visões de Hoje" className="hidden rounded-control border border-border bg-card p-0.5 shadow-1 md:flex">
              {VISOES.map(v => (
                <button
                  key={v.id}
                  role="tab"
                  aria-selected={visao === v.id}
                  onClick={() => trocarVisao(v.id)}
                  className={cn(
                    'flex h-8 items-center gap-1.5 rounded-chip px-3 text-sm font-medium text-text-3 transition-colors duration-[var(--vr-dur-hover)] hover:text-foreground',
                    visao === v.id && 'bg-secondary text-foreground',
                  )}
                >
                  {v.rotulo}
                  {!carregando && <span className="vr-data text-xs text-text-3">{contagens[v.id]}</span>}
                </button>
              ))}
            </div>
          )}
        </div>

        {conteudo}

        {comLista && visao === 'caixa' && (
          <p className="mt-8 hidden flex-wrap items-center justify-center gap-x-4 gap-y-2 text-xs text-text-3 md:flex">
            <span className="flex items-center gap-1"><Kbd>j</Kbd><Kbd>k</Kbd> navegar</span>
            <span className="flex items-center gap-1"><Kbd>a</Kbd> abordar</span>
            <span className="flex items-center gap-1"><Kbd>u</Kbd> útil</span>
            <span className="flex items-center gap-1"><Kbd>r</Kbd> ruído</span>
            <span className="flex items-center gap-1"><Kbd>s</Kbd> adiar</span>
            <span className="flex items-center gap-1"><Kbd>e</Kbd> arquivar</span>
          </p>
        )}
        {celular && comLista && visao === 'caixa' && (
          <p className="mt-6 text-center text-xs text-text-3">Deslize para a direita: útil. Para a esquerda: arquivar.</p>
        )}
      </main>

      {!semDados && <NavInferior visao={visao} contagens={contagens} onVisao={trocarVisao} />}

      <Abordar
        alvo={abordarAlvo ? { sinal: abordarAlvo, conta: contas.get(abordarAlvo.contaId)! } : null}
        onFechar={() => setAbordarAlvo(null)}
        onAbordado={s => {
          setAbordarAlvo(null);
          setDetalhe(null);
          mudar(s, { acao: 'abordado' }, `${contas.get(s.contaId)!.nome}: marcado como abordado`, <Send className="size-4" strokeWidth={1.5} />);
        }}
      />

      {/* Celular: toque no cartão abre o detalhe em bottom sheet, com as ações em alvos grandes. */}
      <PainelFlutuante
        aberto={!!detalhe && !abordarAlvo}
        onFechar={() => setDetalhe(null)}
        titulo={detalheConta?.nome ?? ''}
        descricao={detalhe ? `${detalhe.rotulo} · ${detalhe.fonte} · ${dataCurta(detalhe.data)}` : undefined}
      >
        {detalhe && detalheConta && (
          <div className="flex flex-col gap-4">
            <p className="text-md leading-snug">{detalhe.porQueAgora}</p>
            <p className="text-sm text-text-2">
              Falar com: {detalhe.abordar.nome ? `${detalhe.abordar.nome}${detalhe.abordar.cargo ? `, ${detalhe.abordar.cargo}` : ''}` : `${detalhe.abordar.cargo} (a identificar)`}
            </p>
            {naCaixa(estados[detalhe.id]) ? (
              <div className="grid grid-cols-2 gap-2">
                <Button variant="primary" className="col-span-2" onClick={() => agir(detalhe, 'abordar')}>
                  <Send /> Abordar
                </Button>
                <Button onClick={() => (agir(detalhe, 'util'), setDetalhe(null))}>
                  <ThumbsUp /> Útil
                </Button>
                <Button onClick={() => (agir(detalhe, 'ruido'), setDetalhe(null))}>
                  <ThumbsDown /> Ruído
                </Button>
                <Button onClick={() => (agir(detalhe, 'adiar'), setDetalhe(null))}>
                  <CalendarClock /> Adiar
                </Button>
                <Button onClick={() => (agir(detalhe, 'arquivar'), setDetalhe(null))}>
                  <Archive /> Arquivar
                </Button>
              </div>
            ) : (
              <Button onClick={() => (agir(detalhe, 'voltar'), setDetalhe(null))}>Voltar para a caixa</Button>
            )}
          </div>
        )}
      </PainelFlutuante>
    </>
  );
}
