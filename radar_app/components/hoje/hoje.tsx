'use client';

import { useCallback, useEffect, useMemo, useRef, useState } from 'react';
import { AnimatePresence } from 'motion/react';
import { toast } from 'sonner';
import { Archive, CalendarClock, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Base, Conta, EstadoSinal, Sinal, StatusVscs } from '@/lib/tipos';
import { cn, dataCurta, dataLonga, plural, somarDias, pontos } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Kbd } from '@/components/ui/kbd';
import { PainelFlutuante } from '@/components/ui/painel-flutuante';
import { Abordar } from './abordar';
import { Agenda } from './agenda';
import { FAIXAS_VSCS, ROTULO_RELEVANCIA, type Relevancia } from '@/lib/avaliacao';
import { COR_STATUS_VSCS } from '@/components/ui/selo-vscs';
import { CartaoSinal, type AcaoCartao } from './cartao-sinal';
import { LinhaSinal } from './linha-sinal';
import { Decomposicao } from '@/components/conta/decomposicao';
import { SeloVscs } from '@/components/ui/selo-vscs';
import { CaixaVazia, ErroCarregar, ListaEsqueleto, SemPermissao } from './estados';
import { isoLocal, useAgora, useHoje } from '@/components/ui/use-agora';
import { VISOES, type Visao } from './navegacao';
import { Casca } from '@/components/casca/casca';
import { hrefConta } from '@/lib/contas';
import Link from 'next/link';
import { useRouter } from 'next/navigation';
import { useEstados } from './estado';
import { MenuFiltro } from '@/components/contas/menu-filtro';
import { playbooksPorConta } from '@/lib/playbooks';
import { BlocoPlaybook } from './playbook';
import {
  ORDENS, ORDEM_PADRAO, QUALQUER_PLAYBOOK, SEM_FILTROS_CAIXA, contarOpcoes, dentroDaJanela, filtrarCaixa, ordenarCaixa, porEstagio, temFiltroCaixa,
  type FiltrosCaixa, type Ordem,
} from '@/lib/caixa';

export type EstadoTela = 'normal' | 'carregando' | 'vazio' | 'erro' | 'sem-permissao';

const ADIAR_DIAS = 3;

/** Computador com espaço para lista + detalhe lado a lado. */
function useLargo() {
  const [largo, setLargo] = useState(false);
  useEffect(() => {
    // 1280px: abaixo disso (com o menu lateral de 240px) a coluna do detalhe fica estreita demais e o
    // gráfico do score passa por cima do texto; entre 768 e 1279 a tela usa os cartões empilhados
    const mq = window.matchMedia('(min-width: 1280px)');
    const ver = () => setLargo(mq.matches);
    ver();
    mq.addEventListener('change', ver);
    return () => mq.removeEventListener('change', ver);
  }, []);
  return largo;
}

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

export function Hoje({ base: baseOriginal, estadoTela: estadoFixo }: { base: Base; estadoTela?: EstadoTela }) {
  // ?estado=... mostra cada estado obrigatório da tela, para revisão.
  const [estadoUrl, setEstadoUrl] = useState<EstadoTela>('normal');
  useEffect(() => {
    const e = new URLSearchParams(location.search).get('estado') as EstadoTela | null;
    if (e && ESTADOS.includes(e)) setEstadoUrl(e);
  }, []);
  const estadoTela = estadoFixo ?? estadoUrl;
  // data da última carga (sinais "novos") e data real (adiar, acompanhar): base velha não vira "hoje"
  const dataCarga = (baseOriginal.atualizadoEm ?? baseOriginal.geradoEm).slice(0, 10);
  const hoje = useHoje(dataCarga);
  const { estados, salvar, pronto } = useEstados();
  const base = baseOriginal; // score do motor, igual para todos (P1-8)
  // só a caixa: adiados e concluídos saíram da tela (pedido de 2026-11-06); quem foi adiado volta sozinho na data
  const visao: Visao = 'caixa';
  const [foco, setFoco] = useState(0);
  const [abordarAlvo, setAbordarAlvo] = useState<Sinal | null>(null);
  const [detalhe, setDetalhe] = useState<Sinal | null>(null);
  const [ajuda, setAjuda] = useState(false);
  const celular = useCelular();
  const largo = useLargo();
  const agora = useAgora();
  const router = useRouter();
  const refs = useRef<(HTMLElement | null)[]>([]);
  const refsLinhas = useRef<(HTMLButtonElement | null)[]>([]);

  const contas = useMemo(() => new Map(base.contas.map(c => [c.id, c])), [base.contas]);
  // notícia sem fato acionável (noticia_setorial) não é sinal: fica só na linha do tempo da conta
  const sinais = useMemo(
    () => (estadoTela === 'vazio' ? [] : base.sinais.filter(s => s.tipo !== 'noticia_setorial')),
    [estadoTela, base.sinais],
  );

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
  // playbooks combinados por conta (fase 3): leem todos os sinais da carga, não só os da caixa
  const playbooks = useMemo(() => playbooksPorConta(sinais, dataCarga), [sinais, dataCarga]);
  // contas com o nome do playbook ativo, para o filtro "Playbook" (lib/caixa.ts)
  const contasFiltro = useMemo(() => {
    const m = new Map<string, Conta & { playbook?: string }>();
    for (const [id, c] of contas) m.set(id, playbooks.has(id) ? { ...c, playbook: playbooks.get(id)!.playbook.nome } : c);
    return m;
  }, [contas, playbooks]);
  // janela de validade por tipo: sinal vencido sai da caixa e fica só na conta e no gráfico (lib/caixa.ts)
  const caixaValida = useMemo(() => listas.caixa.filter(s => dentroDaJanela(s, dataCarga)), [listas.caixa, dataCarga]);
  const vencidos = listas.caixa.length - caixaValida.length;
  // ordenação e filtros escolhidos pela pessoa, guardados na URL (um link abre a mesma visão)
  const [ordem, setOrdem] = useState<Ordem>(ORDEM_PADRAO);
  const [filtros, setFiltros] = useState<FiltrosCaixa>(SEM_FILTROS_CAIXA);
  const [urlLida, setUrlLida] = useState(false);
  useEffect(() => {
    const q = new URLSearchParams(location.search);
    const o = q.get('ordem') as Ordem | null;
    if (o && ORDENS.some(x => x.id === o)) setOrdem(o);
    try {
      const f = q.get('f');
      if (f) setFiltros({ ...SEM_FILTROS_CAIXA, ...JSON.parse(f) });
    } catch {}
    setUrlLida(true);
  }, []);
  useEffect(() => {
    if (!urlLida) return;
    const q = new URLSearchParams(location.search);
    if (ordem === ORDEM_PADRAO) q.delete('ordem');
    else q.set('ordem', ordem);
    if (temFiltroCaixa(filtros)) q.set('f', JSON.stringify(filtros));
    else q.delete('f');
    const s = q.toString();
    history.replaceState(null, '', s ? `?${s}` : location.pathname);
  }, [ordem, filtros, urlLida]);
  const mudarFiltro = (parte: Partial<FiltrosCaixa>) => setFiltros(f => ({ ...f, ...parte }));
  // mudar filtro ou ordem volta o foco do j/k para o primeiro da nova lista
  useEffect(() => setFoco(0), [ordem, filtros]);
  const lista = useMemo(
    () => ordenarCaixa(filtrarCaixa(caixaValida, filtros, contasFiltro, dataCarga), ordem, contas),
    [caixaValida, filtros, contas, dataCarga, ordem],
  );
  const contagens = { caixa: caixaValida.length, adiados: listas.adiados.length, concluidos: listas.concluidos.length };
  // "novos" = fatos da data da última carga em diante; o rótulo só diz "de hoje" se a carga for de hoje
  const novosHoje = caixaValida.filter(s => s.data >= dataCarga).length;
  const rotuloNovos = dataCarga === hoje ? `${novosHoje} de hoje` : `${novosHoje} da carga de ${dataCurta(dataCarga)}`;
  // sinais por estágio do score (todas as faixas, com os outros filtros aplicados): os contadores somam o total
  const semEstagio = useMemo(() => filtrarCaixa(caixaValida, filtros, contasFiltro, dataCarga, 'estagios'), [caixaValida, filtros, contasFiltro, dataCarga]);
  const porStatus = useMemo(
    () => porEstagio(semEstagio, contas, [...FAIXAS_VSCS].map(([, st]) => st)).filter(x => x.n > 0),
    [semEstagio, contas],
  );
  const opcoes = useMemo(
    () => ({
      tipos: contarOpcoes(caixaValida, filtros, contasFiltro, dataCarga, 'tipos'),
      tiers: contarOpcoes(caixaValida, filtros, contasFiltro, dataCarga, 'tiers'),
      setores: contarOpcoes(caixaValida, filtros, contasFiltro, dataCarga, 'setores'),
      ufs: contarOpcoes(caixaValida, filtros, contasFiltro, dataCarga, 'ufs'),
      playbooks: contarOpcoes(caixaValida, filtros, contasFiltro, dataCarga, 'playbooks'),
    }),
    [caixaValida, filtros, contasFiltro, dataCarga],
  );
  // estado vazio por filtro: sugere tirar o filtro que mais devolve sinais
  const sugestao = useMemo(() => {
    if (lista.length || !temFiltroCaixa(filtros)) return null;
    const grupos: [keyof FiltrosCaixa, string][] = [['estagios', 'estágio'], ['tipos', 'tipo de sinal'], ['tiers', 'tier'], ['setores', 'setor'], ['ufs', 'UF'], ['janela', 'janela'], ['playbooks', 'playbook']];
    return grupos
      .filter(([g]) => (g === 'janela' ? filtros.janela : (filtros[g] as string[] | undefined)?.length))
      .map(([g, rotulo]) => ({ g, rotulo, n: filtrarCaixa(caixaValida, filtros, contasFiltro, dataCarga, g).length }))
      .sort((a, b) => b.n - a.n)[0] ?? null;
  }, [lista.length, filtros, caixaValida, contasFiltro, dataCarga]);

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

  const avaliar = useCallback(
    (s: Sinal, n: Relevancia) => {
      const conta = contas.get(s.contaId)!;
      const ja = estados[s.id]?.relevancia === n;
      mudar(s, { relevancia: ja ? undefined : n }, ja ? undefined : `${conta.nome}: ${ROTULO_RELEVANCIA[n].toLowerCase()}`);
    },
    [contas, estados, hoje, mudar],
  );

  // ---------- teclado: j/k navegam, a u r s e agem no cartão em foco ----------

  useEffect(() => {
    function tecla(ev: KeyboardEvent) {
      if (ev.metaKey || ev.ctrlKey || ev.altKey || abordarAlvo || detalhe) return;
      const alvo = ev.target as HTMLElement;
      if (alvo.closest('input, textarea, select, [contenteditable="true"], [role="dialog"]')) return;
      if (ev.key === '?') {
        ev.preventDefault();
        return setAjuda(true);
      }
      if (ajuda) return;
      const n = lista.length;
      if (!n) return;
      const atual = Math.min(foco, n - 1);
      const mapa: Record<string, AcaoCartao> = visao === 'caixa' ? { a: 'abordar', u: 'util', r: 'ruido', s: 'adiar', e: 'arquivar' } : {};
      // no computador largo a navegação anda pela lista; no resto, pelos cartões
      const alvos: (HTMLElement | null)[] = largo ? refsLinhas.current : refs.current;
      if (ev.key === 'j' || ev.key === 'k') {
        ev.preventDefault();
        // Primeiro j (nada em foco ainda) fica no primeiro item; na lista larga já há um selecionado.
        const algumFocado = largo || alvos.some(r => r && r === document.activeElement);
        const prox = !algumFocado ? atual : ev.key === 'j' ? Math.min(n - 1, atual + 1) : Math.max(0, atual - 1);
        setFoco(prox);
        alvos[prox]?.focus();
        alvos[prox]?.scrollIntoView({ block: 'nearest', behavior: 'smooth' });
      } else if ((ev.key === 'Enter' || ev.key === 'o') && (largo || alvos.some(r => r && r === document.activeElement))) {
        ev.preventDefault();
        router.push(hrefConta(lista[atual]!.contaId));
      } else if (mapa[ev.key]) {
        ev.preventDefault();
        agir(lista[atual]!, mapa[ev.key]!);
      }
    }
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, [lista, foco, visao, agir, abordarAlvo, detalhe, ajuda, router, largo]);

  // Quando um cartão sai, o foco fica no que subiu para o lugar dele.
  const tamanho = lista.length;
  useEffect(() => {
    if (foco >= tamanho && tamanho > 0) setFoco(tamanho - 1);
  }, [foco, tamanho]);

  // ---------- tela ----------

  let conteudo: React.ReactNode;
  if (estadoTela === 'carregando' || !pronto) conteudo = <ListaEsqueleto />;
  else if (estadoTela === 'erro') conteudo = <ErroCarregar onTentar={() => location.reload()} />;
  else if (estadoTela === 'sem-permissao') conteudo = <SemPermissao />;
  else if (!lista.length && temFiltroCaixa(filtros))
    conteudo = (
      <div className="vr-card max-w-[760px] p-6 text-center text-sm">
        <p className="font-medium">Nenhum sinal com estes filtros.</p>
        {sugestao && sugestao.n > 0 && (
          <button
            type="button"
            onClick={() => mudarFiltro({ [sugestao.g]: sugestao.g === 'janela' ? null : [] } as Partial<FiltrosCaixa>)}
            className="mt-2 font-semibold underline decoration-border-strong underline-offset-4"
          >
            Tirar o filtro de {sugestao.rotulo} ({plural(sugestao.n, 'sinal', 'sinais')})
          </button>
        )}
        <button type="button" onClick={() => setFiltros(SEM_FILTROS_CAIXA)} className="mt-2 ml-3 text-text-2 underline decoration-border-strong underline-offset-4">
          Limpar filtros
        </button>
      </div>
    );
  else if (!lista.length) conteudo = <CaixaVazia visao={visao} />;
  else if (largo) {
    const atual = lista[Math.min(foco, lista.length - 1)]!;
    conteudo = (
      <div className="grid grid-cols-[minmax(340px,420px)_minmax(0,1fr)] items-start gap-6">
        <div className="vr-card sticky top-6 overflow-hidden">
          <div className="flex items-center justify-between border-b border-border px-3.5 py-2 text-xs text-text-3">
            <span>
              {plural(lista.length, 'sinal', 'sinais')} · {ORDENS.find(o => o.id === ordem)!.rotulo.toLowerCase()}
            </span>
            <span className="flex items-center gap-1"><Kbd>j</Kbd><Kbd>k</Kbd></span>
          </div>
          <ul role="listbox" aria-label="Sinais na caixa" className="max-h-[calc(100dvh-180px)] divide-y divide-border overflow-y-auto">
            {lista.map((s, i) => (
              <LinhaSinal
                key={s.id}
                ref={el => {
                  refsLinhas.current[i] = el;
                }}
                sinal={s}
                conta={contas.get(s.contaId)!}
                ativo={s.id === atual.id}
                util={estados[s.id]?.avaliacao === 'util'}
                playbook={playbooks.get(s.contaId)}
                onSelecionar={() => setFoco(i)}
              />
            ))}
          </ul>
        </div>
        <div className="min-w-0">
          <ul aria-label="Sinal selecionado">
            <CartaoSinal
              key={atual.id}
              sinal={atual}
              conta={contas.get(atual.contaId)!}
              estado={estados[atual.id]}
              hoje={hoje}
              naCaixa
              deslizavel={false}
              onAcao={a => agir(atual, a)}
              onAvaliar={n => avaliar(atual, n)}
              onAbrir={() => router.push(hrefConta(atual.contaId))}
              onFoco={() => {}}
              playbook={playbooks.get(atual.contaId)}
            />
          </ul>
          {playbooks.get(atual.contaId) && <BlocoPlaybook key={atual.contaId} ativacao={playbooks.get(atual.contaId)!} conta={contas.get(atual.contaId)!} />}
          {/* contexto da conta ao lado do sinal: o que fazer (matriz ICP × score) e de onde vem o número */}
          {(() => {
            const c = contas.get(atual.contaId)!;
            return (
              <section aria-label={`Score de ${c.nome}`} className="vr-card mt-4 p-5">
                <div className="mb-4 flex flex-wrap items-center justify-between gap-3">
                  <h2 className="text-sm font-semibold">Por que {c.nome} está com {pontos(c.score)}</h2>
                  <SeloVscs status={c.vscsStatus} acao={c.acaoRecomendada} className="flex-row! items-center! gap-2!" />
                </div>
                <Decomposicao conta={c} />
                <Link href={hrefConta(c.id)} className="mt-4 inline-flex min-h-6 items-center text-sm font-medium text-text-2 underline decoration-border-strong underline-offset-4 hover:text-foreground">
                  Abrir a conta: comitê, linha do tempo e dados cadastrais
                </Link>
              </section>
            );
          })()}
        </div>
      </div>
    );
  } else if (celular)
    // celular: a mesma lista compacta; tocar abre o cartão completo no painel de baixo
    conteudo = (
      <div className="vr-card overflow-hidden">
        <ul role="listbox" aria-label="Sinais na caixa" className="divide-y divide-border">
          {lista.map((s, i) => (
            <LinhaSinal
              key={s.id}
              sinal={s}
              conta={contas.get(s.contaId)!}
              ativo={false}
              util={estados[s.id]?.avaliacao === 'util'}
              onSelecionar={() => (setFoco(i), setDetalhe(s))}
            />
          ))}
        </ul>
      </div>
    );
  else
    conteudo = (
      <ul className="flex max-w-[760px] flex-col gap-3" aria-label={`Sinais: ${VISOES.find(v => v.id === visao)!.rotulo}`}>
        <AnimatePresence initial={false} mode="popLayout">
          {lista.map((s, i) => (
            <CartaoSinal
              key={s.id}
              ref={el => {
                refs.current[i] = el;
              }}
              sinal={s}
              conta={contas.get(s.contaId)!}
              playbook={playbooks.get(s.contaId)}
              estado={estados[s.id]}
              hoje={hoje}
              naCaixa={visao === 'caixa'}
              deslizavel={celular}
              onAcao={a => agir(s, a)}
              onAvaliar={n => avaliar(s, n)}
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
    <Casca base={base} novos={carregando || semDados ? 0 : contagens.caixa}>
      <main className="w-full max-w-[1440px] px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Hoje</h1>
            {/* a data do cabeçalho é a de hoje no navegador; "novos" vêm da data da última carga, e o rótulo
                diz qual é quando a carga não é de hoje (lib/frescor.ts e o aviso no topo cobrem o atraso) */}
            <p className="mt-1 min-h-5 text-sm text-text-3">
              {[
                agora && dataLonga(isoLocal(agora)),
                !semDados && !carregando && plural(contagens.caixa, 'sinal na caixa', 'sinais na caixa') + (novosHoje > 0 ? `, ${rotuloNovos}` : ''),
              ]
                .filter(Boolean)
                .join(' · ')}
            </p>
          </div>
          {!semDados && !carregando && porStatus.length > 0 && (
            <ul aria-label={`Sinais na caixa por estágio do score: ${semEstagio.length} no total`} className="flex flex-wrap items-center gap-1.5">
              {porStatus.map(({ estagio: st, n: q }) => {
                const ativo = st !== 'Sem estágio' && filtros.estagios.includes(st);
                return (
                  <li key={st}>
                    <button
                      type="button"
                      aria-pressed={ativo}
                      disabled={st === 'Sem estágio'}
                      onClick={() =>
                        st !== 'Sem estágio' && mudarFiltro({ estagios: ativo ? filtros.estagios.filter(x => x !== st) : [...filtros.estagios, st] })
                      }
                      className={cn(
                        'flex items-center gap-1.5 rounded-chip px-2 py-1 text-xs transition-shadow',
                        st === 'Sem estágio' ? 'bg-secondary text-text-2' : COR_STATUS_VSCS[st],
                        ativo && 'ring-2 ring-foreground',
                      )}
                    >
                      <span className="vr-data font-semibold">{q}</span>
                      {st}
                    </button>
                  </li>
                );
              })}
            </ul>
          )}
        </div>

        {!semDados && !carregando && visao === 'caixa' && <Agenda eventos={base.agenda ?? []} />}

        {!semDados && !carregando && caixaValida.length > 0 && (
          <div className="mb-4 flex flex-wrap items-center gap-2" aria-label="Ordenação e filtros da caixa">
            <label className="flex h-8 items-center gap-1.5 rounded-control border border-border bg-card px-2 text-sm text-text-2 max-md:h-10">
              Ordenar por
              <select value={ordem} onChange={e => setOrdem(e.target.value as Ordem)} aria-label="Ordenar a caixa" className="bg-transparent font-medium text-foreground">
                {ORDENS.map(o => (
                  <option key={o.id} value={o.id} title={o.dica}>
                    {o.rotulo}
                  </option>
                ))}
              </select>
            </label>
            <MenuFiltro rotulo="Tipo de sinal" opcoes={opcoes.tipos.map(([id, qtd]) => ({ id, rotulo: id, qtd }))} valor={filtros.tipos} onMudar={v => mudarFiltro({ tipos: v })} />
            <MenuFiltro rotulo="Tier" opcoes={opcoes.tiers.map(([id, qtd]) => ({ id, rotulo: `Tier ${id}`, qtd }))} valor={filtros.tiers} onMudar={v => mudarFiltro({ tiers: v })} />
            <MenuFiltro rotulo="Setor" opcoes={opcoes.setores.map(([id, qtd]) => ({ id, rotulo: id, qtd }))} valor={filtros.setores} onMudar={v => mudarFiltro({ setores: v })} />
            {(opcoes.playbooks.length > 0 || filtros.playbooks.length > 0) && (
              <MenuFiltro
                rotulo="Playbook"
                opcoes={[
                  { id: QUALQUER_PLAYBOOK, rotulo: QUALQUER_PLAYBOOK, qtd: opcoes.playbooks.reduce((n, [, q]) => n + q, 0) },
                  ...opcoes.playbooks.map(([id, qtd]) => ({ id, rotulo: id, qtd })),
                ]}
                valor={filtros.playbooks}
                onMudar={v => mudarFiltro({ playbooks: v })}
              />
            )}
            <MenuFiltro rotulo="UF" opcoes={opcoes.ufs.map(([id, qtd]) => ({ id, rotulo: id, qtd }))} valor={filtros.ufs} onMudar={v => mudarFiltro({ ufs: v })} />
            <label className="flex h-8 items-center gap-1.5 rounded-control border border-border bg-card px-2 text-sm text-text-2 max-md:h-10">
              Janela
              <select
                value={filtros.janela ?? ''}
                onChange={e => mudarFiltro({ janela: e.target.value ? (Number(e.target.value) as 7 | 30 | 90) : null })}
                aria-label="Só sinais dos últimos dias"
                className="bg-transparent font-medium text-foreground"
              >
                <option value="">toda a validade</option>
                <option value="7">7 dias</option>
                <option value="30">30 dias</option>
                <option value="90">90 dias</option>
              </select>
            </label>
            {temFiltroCaixa(filtros) && (
              <button type="button" onClick={() => setFiltros(SEM_FILTROS_CAIXA)} className="text-sm font-medium underline decoration-border-strong underline-offset-4">
                Limpar filtros
              </button>
            )}
            {vencidos > 0 && (
              <span className="ml-auto text-xs text-text-3" title="Cada tipo de sinal tem uma janela de ação; depois dela o sinal fica só na conta e no gráfico">
                {plural(vencidos, 'sinal fora da janela de ação ficou', 'sinais fora da janela de ação ficaram')} só na conta
              </span>
            )}
          </div>
        )}

        {conteudo}

        {comLista && visao === 'caixa' && (
          <button
            type="button"
            onClick={() => setAjuda(true)}
            className="mt-8 hidden w-full flex-wrap items-center justify-center gap-x-4 gap-y-2 rounded-control py-1 text-xs text-text-3 transition-colors duration-[var(--vr-dur-hover)] hover:text-foreground md:flex"
          >
            <span className="flex items-center gap-1"><Kbd>j</Kbd><Kbd>k</Kbd> navegar</span>
            <span className="flex items-center gap-1"><Kbd>a</Kbd> abordar</span>
            <span className="flex items-center gap-1"><Kbd>u</Kbd> útil</span>
            <span className="flex items-center gap-1"><Kbd>r</Kbd> ruído</span>
            <span className="flex items-center gap-1"><Kbd>s</Kbd> adiar</span>
            <span className="flex items-center gap-1"><Kbd>e</Kbd> arquivar</span>
            <span className="flex items-center gap-1"><Kbd>o</Kbd> abrir conta</span>
            <span className="flex items-center gap-1"><Kbd>?</Kbd> mais atalhos</span>
          </button>
        )}
        {celular && comLista && visao === 'caixa' && (
          <p className="mt-6 text-center text-xs text-text-3">Deslize para a direita: útil. Para a esquerda: arquivar.</p>
        )}
      </main>

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
            <ul aria-label="Sinal" className="-mx-1">
              <CartaoSinal
                sinal={detalhe}
                conta={detalheConta}
                playbook={playbooks.get(detalhe.contaId)}
                estado={estados[detalhe.id]}
                hoje={hoje}
                naCaixa={naCaixa(estados[detalhe.id])}
                semAcoes
                deslizavel={false}
                onAcao={a => agir(detalhe, a)}
                onAvaliar={n => avaliar(detalhe, n)}
                onAbrir={() => {}}
                onFoco={() => {}}
              />
            </ul>
            {playbooks.get(detalhe.contaId) && <BlocoPlaybook ativacao={playbooks.get(detalhe.contaId)!} conta={detalheConta} />}
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
        {detalheConta && (
          <Link href={hrefConta(detalheConta.id)} className="mt-3 block rounded-control py-2 text-center text-sm font-semibold text-text-2 underline decoration-border-strong underline-offset-4">
            Ver a conta {detalheConta.nome}
          </Link>
        )}
      </PainelFlutuante>

      <PainelFlutuante aberto={ajuda} onFechar={() => setAjuda(false)} titulo="Atalhos de teclado">
        <ul className="flex flex-col gap-3 text-sm">
          <li className="flex items-center justify-between gap-4"><span>Navegar entre sinais</span><span className="flex gap-1"><Kbd>j</Kbd><Kbd>k</Kbd></span></li>
          <li className="flex items-center justify-between gap-4"><span>Abrir a conta em foco</span><span className="flex gap-1"><Kbd>o</Kbd><Kbd>↵</Kbd></span></li>
          <li className="flex items-center justify-between gap-4"><span>Abordar</span><Kbd>a</Kbd></li>
          <li className="flex items-center justify-between gap-4"><span>Marcar útil</span><Kbd>u</Kbd></li>
          <li className="flex items-center justify-between gap-4"><span>Marcar ruído</span><Kbd>r</Kbd></li>
          <li className="flex items-center justify-between gap-4"><span>Adiar {ADIAR_DIAS} dias</span><Kbd>s</Kbd></li>
          <li className="flex items-center justify-between gap-4"><span>Arquivar</span><Kbd>e</Kbd></li>
          <li className="flex items-center justify-between gap-4"><span>Buscar ou perguntar</span><Kbd>⌘K</Kbd></li>
          <li className="flex items-center justify-between gap-4"><span>Esta ajuda</span><Kbd>?</Kbd></li>
        </ul>
        <p className="mt-4 text-xs text-text-3">No celular: deslize para a direita marca útil, para a esquerda arquiva; toque abre o detalhe.</p>
      </PainelFlutuante>
    </Casca>
  );
}
