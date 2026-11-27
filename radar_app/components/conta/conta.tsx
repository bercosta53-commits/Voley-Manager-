'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Check, ChevronLeft, Copy, ExternalLink, FileText, Minus, SearchX, Send } from 'lucide-react';
import type { Conta, EstadoSinal, Sinal } from '@/lib/tipos';
import type { BaseCasca } from '@/lib/casca-dados';
import { ACOES_DE_ABORDAGEM, MATRIZ_ICP, faixaVscs } from '@/lib/avaliacao';
import { hrefConta, primeiraMaiuscula, rotuloStatus, rotuloSubsegmentoTI, sentido, status } from '@/lib/contas';
import { gancho, rascunho } from '@/lib/mensagem';
import { cobertura } from '@/lib/cobertura';
import { coberturaDaConta, EXPLICA_COBERTURA, ROTULO_COBERTURA, type Varredura } from '@/lib/varredura';
import { ACAO_DO_ANDAMENTO, teseDaConta } from '@/lib/tese';
import { TeseConta } from './tese';
import { cn, dataComAno, dataCurta, diasEntre, moeda, plural, somarDias, pontos } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PainelFlutuante } from '@/components/ui/painel-flutuante';
import { Casca } from '@/components/casca/casca';
import { LogoConta } from '@/components/hoje/logo-conta';
import { Curva } from '@/components/hoje/score';
import { Aviso, ErroCarregar, SemPermissao } from '@/components/hoje/estados';
import { useEstados, type StatusPorConta } from '@/components/hoje/estado';
import type { StatusConta } from '@/lib/acoes';
import { Andamento } from './andamento';
import { detectarPlaybook, type Ativacao } from '@/lib/playbooks';
import { BlocoPlaybook } from '@/components/hoje/playbook';
import { Comite } from './comite';
import { LinhaDoTempo } from './linha-do-tempo';
import { NarrativaConta } from './narrativa';
import { RadarConta } from './radar-conta';
import { Losango } from '@/components/prioridade/losango';
import { expandirLinhas } from '@/lib/prioridade-transporte';
import { formatarIntegrada, type VisaoIntegradaConta } from '@/lib/prioridade';
import { LEITURA_CLASSE } from '@/lib/prioridade-config';
import { faltandoNoComite, papelNoComite } from '@/lib/papeis';
import type { LinhaTransporte } from '@/lib/prioridade-transporte';
import { Decomposicao } from './decomposicao';
import { useHoje } from '@/components/ui/use-agora';
import { Rotulo } from '@/components/ui/rotulo';
import { Chip } from '@/components/ui/chip';
import { Secao } from '@/components/ui/secao';

type EstadoTela = 'normal' | 'carregando' | 'vazio' | 'erro' | 'sem-permissao';
const ESTADOS: EstadoTela[] = ['carregando', 'vazio', 'erro', 'sem-permissao'];

/** S-1: a tela da conta recebe a conta e os sinais dela, mais o índice leve da casca; nunca o snapshot inteiro. */
export type BaseConta = BaseCasca & { conta?: Conta; sinaisDaConta: Sinal[]; varreduraDaConta?: Record<string, Varredura>; linhaRadar?: LinhaTransporte };

export function TelaConta({ base, contaId }: { base: BaseConta; contaId: string }) {
  const [estadoTela, setEstadoTela] = useState<EstadoTela>('normal');
  useEffect(() => {
    const e = new URLSearchParams(location.search).get('estado') as EstadoTela | null;
    if (e && ESTADOS.includes(e)) setEstadoTela(e);
  }, []);
  const { estados, salvar, pronto, status: andamentos, salvarStatus, compartilhado } = useEstados();
  // o score é o do motor: a avaliação de relevância não o recalcula na tela (P1-8)
  const conta = estadoTela === 'vazio' || base.conta?.id !== contaId ? undefined : base.conta;
  const sinais = base.sinaisDaConta;
  // data real das ações (adiar, acompanhar); a data do snapshot só serve para os cálculos da base
  const hoje = useHoje(base.atualizadoEm ?? base.geradoEm);

  function mudar(s: Sinal, mudanca: EstadoSinal, aviso: string) {
    const anterior = estados[s.id];
    const prox = { ...estados, [s.id]: { ...anterior, ...mudanca, em: hoje } };
    salvar(prox);
    toast(aviso, {
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
  }

  let conteudo: React.ReactNode;
  if (estadoTela === 'carregando' || !pronto) conteudo = <ContaEsqueleto />;
  else if (estadoTela === 'erro') conteudo = <ErroCarregar oque="a conta" onTentar={() => location.reload()} />;
  else if (estadoTela === 'sem-permissao') conteudo = <SemPermissao />;
  else if (!conta)
    conteudo = (
      <Aviso icone={<SearchX className="size-5" strokeWidth={1.5} />} titulo="Conta não encontrada">
        Ela pode ter saído da base na última importação da planilha. Procure pelo nome em Contas ou com ⌘K.
      </Aviso>
    );
  else
    conteudo = (
      <Detalhe
        conta={conta}
        sinais={sinais}
        estados={estados}
        hoje={hoje}
        onMudar={mudar}
        ficticia={base.ficticia}
        andamento={andamentos[conta.id]}
        compartilhado={compartilhado}
        onAndamento={st => salvarStatus(conta.id, st)}
        varredura={base.varreduraDaConta}
        dataBase={base.geradoEm.slice(0, 10)}
        linhaRadar={base.linhaRadar}
        playbook={detectarPlaybook(sinais.filter(s => s.tipo !== 'noticia_setorial'), (base.atualizadoEm ?? base.geradoEm).slice(0, 10)) ?? undefined}
      />
    );

  return (
    <Casca base={base}>
      <main className="w-full max-w-[1440px] px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16">
        <Link href="/contas" className="mb-4 inline-flex min-h-6 items-center gap-1 rounded-chip text-sm text-text-3 hover:text-foreground md:mb-6">
          <ChevronLeft className="size-4" strokeWidth={1.5} /> Contas
        </Link>
        {conteudo}
      </main>
    </Casca>
  );
}

function Detalhe({
  conta,
  sinais,
  estados,
  hoje,
  onMudar,
  ficticia,
  andamento,
  compartilhado,
  onAndamento,
  playbook,
  varredura,
  dataBase,
  linhaRadar,
}: {
  conta: Conta;
  sinais: Sinal[];
  estados: Record<string, EstadoSinal>;
  hoje: string;
  onMudar: (s: Sinal, m: EstadoSinal, aviso: string) => void;
  ficticia?: boolean;
  andamento?: StatusPorConta[string];
  compartilhado: boolean;
  onAndamento: (status: StatusConta | null) => void;
  /** playbook combinado ativo na conta (fase 3 da tela de sinais) */
  playbook?: Ativacao;
  varredura?: Record<string, Varredura>;
  /** data da carga (AAAA-MM-DD): referência da cobertura */
  dataBase?: string;
  /** as quatro dimensões da prioridade integrada, calculadas no servidor como no Radar */
  linhaRadar?: LinhaTransporte;
}) {
  const [decompor, setDecompor] = useState(false);
  const visaoRadar = useMemo(() => (linhaRadar ? expandirLinhas([linhaRadar])[0]!.visao : null), [linhaRadar]);
  const tese = useMemo(
    () =>
      teseDaConta(conta, sinais, {
        hoje,
        aberto: s => naCaixa(estados[s.id], hoje),
        abordadoEm: sinais.map(s => estados[s.id]).find(e => e?.acao === 'abordado')?.em,
        ganchoDe: gancho,
        papelDe: papelNoComite,
        acoesDeAbordagem: ACOES_DE_ABORDAGEM,
        acaoDaMatriz: acaoPelaMatriz,
        andamento,
      }),
    [conta, sinais, estados, hoje, andamento],
  );
  return (
    <>
      {/* abertura: quem é, o radar das quatro dimensões e o calor (score), numa só caixa */}
      <header className="vr-card grid gap-6 p-5 md:p-6 lg:grid-cols-[minmax(0,1fr)_auto_auto] lg:items-center">
        <div className="flex min-w-0 items-start gap-4">
          <LogoConta nome={conta.nome} dominio={conta.dominio} tamanho={60} />
          <div className="min-w-0">
            <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">{conta.nome}</h1>
            <p className="mt-1 text-sm text-text-3">
              {[conta.ramoTI?.nome ?? primeiraMaiuscula(conta.segmento), conta.cidade ? `${conta.cidade}/${conta.uf}` : conta.uf].filter(Boolean).join(' · ')}
            </p>
            {conta.oQueFaz && <p className="mt-2 line-clamp-2 max-w-xl text-sm text-text-2">{conta.oQueFaz}</p>}
            <div className="mt-3 flex flex-wrap gap-1.5">
              <Chip tom="contorno">Tier {conta.tier}</Chip>
              <Chip tom="contorno">{rotuloStatus(conta)}</Chip>
              <ChipCobertura contaId={conta.id} sinais={sinais} varredura={varredura} hoje={dataBase ?? hoje} />
              {conta.dominio && (
                <a
                  href={`https://${conta.dominio}`}
                  target="_blank"
                  rel="noopener noreferrer"
                  className="inline-flex items-center gap-1 rounded-chip border border-border px-1.5 py-0.5 text-xs text-text-2 hover:text-foreground"
                >
                  {conta.dominio} <ExternalLink aria-hidden className="size-3" strokeWidth={1.5} />
                </a>
              )}
              <Link
                href={`${hrefConta(conta.id)}/briefing`}
                className="inline-flex items-center gap-1 rounded-chip border border-border-strong bg-card px-1.5 py-0.5 text-xs font-medium text-foreground hover:bg-muted"
              >
                <FileText aria-hidden className="size-3.5" strokeWidth={1.5} />
                Briefing de reunião
              </Link>
            </div>
          </div>
        </div>
        {visaoRadar && (
          <div className="flex flex-col items-center border-border lg:border-x lg:px-6">
            <Losango dims={visaoRadar.dimensoes} tamanho={230} />
          </div>
        )}
        <ScoreGrande conta={conta} onAbrir={() => setDecompor(true)} embutido />
      </header>

      <LeituraRapida conta={conta} sinais={sinais} hoje={hoje} visao={visaoRadar} acao={tese.acao.titulo} />

      <div className="mt-6 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <TeseConta tese={tese} nomeConta={conta.nome} semAcaoDoTime={compartilhado && cobertura(conta, sinais, estados, andamento).subTrabalhada} />
          <div id="proxima-acao" className="scroll-mt-6 empty:hidden">
            <ProximaAcao conta={conta} sinais={sinais} estados={estados} hoje={hoje} onMudar={onMudar} andamento={andamento} />
          </div>
          {playbook && <BlocoPlaybook ativacao={playbook} conta={conta} className="mt-0" />}
          {linhaRadar && <RadarConta linha={linhaRadar} semDesenho />}
          <NarrativaConta contaId={conta.id} sinais={sinais} historico={conta.historico} hoje={hoje} />
          <LinhaDoTempo conta={conta} sinais={sinais} estados={estados} hoje={hoje} andamento={andamento} />
        </div>
        <div className="flex flex-col gap-6">
          {compartilhado && <Andamento atual={andamento} compartilhado={compartilhado} onMudar={onAndamento} />}
          <Comite conta={conta} />
          <Cadastro conta={conta} />
        </div>
      </div>

      <PainelFlutuante
        aberto={decompor}
        onFechar={() => setDecompor(false)}
        titulo={`Score ${pontos(conta.score)}: de onde vem`}
        descricao="Quanto cada coisa soma hoje. Cada sinal perde metade do valor a cada 60 dias."
      >
        <Decomposicao conta={conta} ficticia={ficticia} />
      </PainelFlutuante>
    </>
  );
}

/** Faixa escaneável logo abaixo da abertura: os cinco números que respondem "como está esta conta". */
function LeituraRapida({ conta, sinais, hoje, visao, acao }: { conta: Conta; sinais: Sinal[]; hoje: string; visao: VisaoIntegradaConta | null; acao: string }) {
  const fatos = sinais.filter(s => s.tipo !== 'noticia_setorial' && s.data && diasEntre(s.data.slice(0, 10), hoje) <= 90);
  const ultimo = [...sinais].filter(s => s.data).sort((a, b) => b.data.localeCompare(a.data))[0];
  const lugares = 3 - Math.min(3, faltandoNoComite(conta).length);
  const itens: { rotulo: string; valor: React.ReactNode; nota?: React.ReactNode; tom?: string }[] = [
    {
      rotulo: 'Prioridade integrada',
      valor: visao?.classeIntegrada ? `${visao.classeIntegrada} · ${formatarIntegrada(visao.notaIntegrada!)}` : 'sem métrica',
      nota: visao?.classeIntegrada ? LEITURA_CLASSE[visao.classeIntegrada] : 'faltam dimensões',
      tom: visao?.situacaoSweetSpot === 'sweet_spot' ? 'text-ok' : undefined,
    },
    { rotulo: 'Fatos em 90 dias', valor: fatos.length, nota: fatos.length ? plural(new Set(fatos.map(f => f.tipo)).size, 'tipo de fato', 'tipos de fato') : 'nenhum fato recente' },
    { rotulo: 'Comitê de compra', valor: `${lugares} de 3`, nota: lugares === 3 ? 'completo' : `${plural(3 - lugares, 'papel', 'papéis')} a mapear`, tom: lugares === 3 ? 'text-ok' : undefined },
    { rotulo: 'Último fato', valor: ultimo ? dataCurta(ultimo.data) : '—', nota: ultimo ? `há ${plural(diasEntre(ultimo.data.slice(0, 10), hoje), 'dia', 'dias')}` : 'sem fato registrado' },
    { rotulo: 'Próxima ação', valor: acao, nota: conta.vscsStatus ?? undefined },
  ];
  return (
    <dl className="mt-4 grid grid-cols-2 gap-px overflow-hidden rounded-card border border-border bg-border sm:grid-cols-3 lg:grid-cols-5" aria-label="Leitura rápida da conta">
      {itens.map((i, n) => (
        <div key={i.rotulo} className={cn('min-w-0 bg-card px-4 py-3', n === itens.length - 1 && 'col-span-2 sm:col-span-1')}>
          <dt className="text-xs text-text-3">{i.rotulo}</dt>
          <dd className={cn('vr-data mt-0.5 truncate text-lg font-semibold', i.tom)}>{i.valor}</dd>
          {i.nota && <dd className="truncate text-xs text-text-3">{i.nota}</dd>}
        </div>
      ))}
    </dl>
  );
}

/** Score grande com a curva de 90 dias. É um botão: abre a decomposição. */
function ScoreGrande({ conta, onAbrir, embutido = false }: { conta: Conta; onAbrir: () => void; embutido?: boolean }) {
  const s = sentido(conta.tendencia);
  const cor = s === 'sobe' ? 'text-warm' : s === 'desce' ? 'text-cool' : 'text-text-3';
  const Seta = s === 'sobe' ? ArrowUpRight : s === 'desce' ? ArrowDownRight : Minus;
  const texto = s === 'sobe' ? `esquentando, +${pontos(conta.tendencia)} em 30 dias` : s === 'desce' ? `esfriando, −${pontos(Math.abs(conta.tendencia))} em 30 dias` : 'estável em 30 dias';
  return (
    <button
      onClick={onAbrir}
      aria-label={`Score ${pontos(conta.score)}, ${texto}. Ver de onde vem`}
      className={cn(
        'flex items-center gap-5 text-left transition-[box-shadow,border-color,background-color] duration-[var(--vr-dur-hover)]',
        embutido ? 'rounded-control px-3 py-2 hover:bg-[var(--vr-surface-2)]' : 'vr-card px-5 py-4 hover:border-border-strong hover:shadow-2',
      )}
    >
      <div className="flex flex-col">
        <Curva serie={conta.serie} largura={168} altura={44} classe={cor} />
        <span className="vr-data mt-1.5 flex justify-between text-xs text-text-3">
          <span>90 dias</span>
          <span>hoje</span>
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-display text-score leading-none font-semibold tracking-tight tabular-nums">{pontos(conta.score)}</span>
        <span className={cn('mt-1 flex items-center gap-0.5 text-xs', cor)}>
          {s === 'estavel' ? (
            <span>estável em 30 dias</span>
          ) : (
            <>
              <Seta className="size-3.5" strokeWidth={1.5} />
              <span className="vr-data">{`${conta.tendencia > 0 ? '+' : '−'}${pontos(Math.abs(conta.tendencia))}`}</span>
              <span className="ml-1 text-text-3">30 dias</span>
            </>
          )}
        </span>
        {conta.vscsStatus && (
          <span className="mt-1.5 text-right text-xs text-text-2">
            {conta.vscsStatus}
            {conta.acaoRecomendada && <span className="block text-text-3">{conta.acaoRecomendada}</span>}
          </span>
        )}
        <span className="mt-1.5 text-xs font-medium text-text-2 underline decoration-border-strong underline-offset-4">de onde vem</span>
      </div>
    </button>
  );
}

/** Ação da matriz ICP × VSCS (a mesma tabela do motor, confirmada pela inteligência em 25/11) para quando a base não traz acaoRecomendada. */
function acaoPelaMatriz(c: Conta) {
  const tier = (c.icp?.tier ?? c.tier) as 'A' | 'B' | 'C';
  return MATRIZ_ICP[tier] && Number.isFinite(c.score) ? MATRIZ_ICP[tier][faixaVscs(c.score)] : undefined;
}

const naCaixa = (e: EstadoSinal | undefined, hoje: string) => !e?.acao || (e.acao === 'adiado' && !!e.ate && e.ate <= hoje);

/** Rascunho da abordagem: o sinal mais forte ainda aberto vira uma mensagem pronta, quando a ação pede contato. */
function ProximaAcao({
  conta,
  sinais,
  estados,
  hoje,
  onMudar,
  andamento,
}: {
  conta: Conta;
  sinais: Sinal[];
  estados: Record<string, EstadoSinal>;
  hoje: string;
  onMudar: (s: Sinal, m: EstadoSinal, aviso: string) => void;
  andamento?: StatusPorConta[string];
}) {
  const abertos = sinais.filter(s => naCaixa(estados[s.id], hoje)).sort((a, b) => b.pontos - a.pontos);
  const alvo = abertos[0];
  const abordado = sinais.map(s => ({ s, e: estados[s.id] })).find(x => x.e?.acao === 'abordado');
  const [texto, setTexto] = useState('');
  const [copiado, setCopiado] = useState(false);
  useEffect(() => {
    if (alvo) setTexto(rascunho(alvo, conta));
    setCopiado(false);
  }, [alvo, conta]);

  const cabecalho = <h2 className="font-display text-md font-semibold tracking-tight">Rascunho da abordagem</h2>;

  // a tese já diz a próxima ação; este bloco só aparece quando acrescenta algo (o rascunho, ou o que falta antes dele)
  if (andamento && ACAO_DO_ANDAMENTO[andamento.status]) return null;

  if (!alvo) {
    let titulo: string, corpo: string;
    if (abordado) {
      titulo = `Abordada em ${dataCurta(abordado.e!.em ?? hoje)}`;
      corpo = `Se não houver resposta até ${dataCurta(somarDias(abordado.e!.em ?? hoje, 5))}, faça um segundo contato curto, retomando o mesmo fato.`;
    } else if (status(conta) === 'nao_abordar') {
      const semClassificacao = !conta.statusComercial.trim();
      titulo = semClassificacao ? 'Classificar antes de abordar' : 'Completar os dados antes de abordar';
      corpo = !conta.comite.length
        ? 'Ninguém do comitê de compra identificado ainda. O Apollo completa nome e cargo quando a chave estiver configurada.'
        : semClassificacao
          ? 'Esta conta ainda não tem status comercial da planilha. Classifique antes de abordar.'
          : 'A planilha marca esta conta como insuficiente. Confira o status comercial antes de qualquer contato.';
    } else return null; // "esperar um motivo" já está na tese
    return (
      <section className="vr-card p-5">
        <Rotulo caps>Antes do rascunho</Rotulo>
        <p className="mt-2 text-md font-semibold">{titulo}</p>
        <p className="mt-1 text-sm text-text-2">{corpo}</p>
      </section>
    );
  }

  // a matriz ICP × VSCS ainda não pede abordagem: diz o que fazer em vez de empurrar o rascunho
  // (mesma origem da tese: o que o motor gravou ou, sem isso, a matriz — senão a tela se contradiz)
  const acao = conta.acaoRecomendada || acaoPelaMatriz(conta);
  // a tese já diz a próxima ação (Monitorar, Ampliar pesquisa…): sem contato pedido, o rascunho não ocupa a tela
  if (acao && !ACOES_DE_ABORDAGEM.has(acao) && !conta.v2?.via_rapida) return null;

  const para = alvo.abordar.nome ? `${alvo.abordar.nome}${alvo.abordar.cargo ? `, ${alvo.abordar.cargo}` : ''}` : `${alvo.abordar.cargo} (a identificar)`;
  return (
    <section className="vr-card p-5">
      {cabecalho}
      <p className="mt-2 text-md font-semibold">Abordar {para}</p>
      <p className="mt-1 text-sm text-text-2">
        Por quê: {alvo.porQueAgora.charAt(0).toLowerCase() + alvo.porQueAgora.slice(1)}
        <span className="text-text-3">
          {' '}
          ({alvo.fonte}, {dataCurta(alvo.data)}
          {alvo.exemplo && ', exemplo'})
        </span>
        {abertos.length > 1 && <span className="text-text-3"> · mais {plural(abertos.length - 1, 'sinal aberto', 'sinais abertos')}</span>}
      </p>
      <label className="mt-4 grid gap-1.5 text-sm">
        <span className="text-text-3">Rascunho da mensagem</span>
        <textarea
          value={texto}
          onChange={e => setTexto(e.target.value)}
          rows={4}
          className="w-full resize-y rounded-control border border-input bg-muted p-3 text-base leading-relaxed text-foreground outline-none"
        />
      </label>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        <Button
          variant="primary"
          onClick={() => onMudar(alvo, { acao: 'abordado' }, `${conta.nome}: marcado como abordado`)}
        >
          <Send /> Marcar como abordado
        </Button>
        <Button
          onClick={async () => {
            try {
              await navigator.clipboard.writeText(texto);
              setCopiado(true);
            } catch {
              toast('Não consegui copiar. Selecione o texto e copie à mão.');
            }
          }}
        >
          {copiado ? <Check className="text-ok" /> : <Copy />} {copiado ? 'Copiado' : 'Copiar'}
        </Button>
        <Button
          variant="ghost"
          onClick={() => onMudar(alvo, { acao: 'adiado', ate: somarDias(hoje, 3) }, `${conta.nome}: adiado até ${dataCurta(somarDias(hoje, 3))}`)}
        >
          <CalendarClock /> Adiar 3 dias
        </Button>
        {alvo.url && (
          <a href={alvo.url} target="_blank" rel="noopener noreferrer" className="ml-auto inline-flex items-center gap-1 rounded-chip text-sm text-text-2 underline decoration-border-strong underline-offset-4 hover:text-foreground">
            ver fonte <ExternalLink className="size-3" strokeWidth={1.5} />
          </a>
        )}
      </div>
    </section>
  );
}

function Cadastro({ conta }: { conta: Conta }) {
  const linhas: [string, React.ReactNode][] = [
    ['Razão social', conta.razaoSocial || '—'],
    ['CNPJ', <span key="c" className="vr-data">{conta.cnpj || '—'}</span>],
    [
      'Domínio',
      conta.dominio ? (
        <a key="d" href={`https://${conta.dominio}`} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-chip underline decoration-border-strong underline-offset-4 hover:text-foreground">
          {conta.dominio} <ExternalLink className="size-3" strokeWidth={1.5} />
        </a>
      ) : (
        '—'
      ),
    ],
    [
      'Cidade',
      <span key="uf">
        {conta.cidade ? `${conta.cidade}/${conta.uf}` : conta.uf || '—'}
        {conta.uf && conta.ufFonte && conta.ufFonte !== 'receita' && (
          <span className="text-text-3"> · {conta.ufFonte === 'site' ? 'pelo endereço do site' : 'sede conhecida, validar na Receita'}</span>
        )}
      </span>,
    ],
  ];
  if (conta.ramoTI) linhas.push(['Ramo de TI', `${conta.ramoTI.nome} (${conta.ramoTI.familia})`]);
  else linhas.push(['Segmento', primeiraMaiuscula(conta.segmento) || '—']);
  if (conta.especializacao) linhas.push(['Especialização', conta.especializacao.nome]);
  if (conta.modeloNegocio) linhas.push(['Modelo', { servico: 'Serviços', produto: 'Produto / software', misto: 'Produto e serviços' }[conta.modeloNegocio]]);
  if (conta.braco) linhas.push(['Braço do ICP', conta.braco]);
  linhas.push(['Status comercial', primeiraMaiuscula(conta.statusComercial.toLowerCase()) || '—']);
  if (conta.subsegmentoTI) linhas.push(['Subsegmento de TI', rotuloSubsegmentoTI(conta.subsegmentoTI)]);
  if (conta.porte) linhas.push(['Porte', conta.porte]);
  if (conta.situacaoCadastral) linhas.push(['Situação cadastral', conta.situacaoCadastral]);
  if (conta.dataAbertura) linhas.push(['Fundação', dataComAno(conta.dataAbertura)]);
  if (conta.capitalSocial) linhas.push(['Capital social', moeda(conta.capitalSocial)]);
  if (conta.cnae) linhas.push(['CNAE', conta.cnae]);
  if (conta.socios?.length) {
    linhas.push(['Sócios', conta.socios.map(s => (s.qualificacao ? `${s.nome} (${s.qualificacao})` : s.nome)).join(', ')]);
  }
  // só o que está preenchido: linha com "—" não informa nada
  const preenchidas = linhas.filter(([, v]) => v !== '—' && !(typeof v === 'object' && v && 'props' in v && (v as React.ReactElement<{ children?: unknown }>).props.children === '—'));
  return (
    <Secao titulo="Dados cadastrais">
      <dl className="mt-3 grid gap-2.5 text-sm">
        {preenchidas.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
            <dt className="text-text-3">{k}</dt>
            <dd className="break-words text-text-2">{v}</dd>
          </div>
        ))}
      </dl>
    </Secao>
  );
}

/** "Varrida, sem fato · 20/11": diz se a falta de sinal é informação ou só falta de leitura. */
function ChipCobertura({ contaId, sinais, varredura, hoje }: { contaId: string; sinais: Sinal[]; varredura?: Record<string, Varredura>; hoje: string }) {
  const cb = coberturaDaConta(contaId, sinais.map(s => s.data), varredura ? { [contaId]: varredura } : undefined, hoje);
  if (cb.estado === 'com_fato') return null;
  const quando = cb.ultimaVarredura ?? cb.ultimoFato;
  return (
    <span title={EXPLICA_COBERTURA[cb.estado]}>
      <Chip tom="contorno">
        {ROTULO_COBERTURA[cb.estado]}
        {quando && ` · ${quando.slice(8, 10)}/${quando.slice(5, 7)}`}
      </Chip>
    </span>
  );
}

function ContaEsqueleto() {
  return (
    <div aria-busy aria-label="Carregando a conta">
      <div className="flex items-center gap-4">
        <Skeleton className="size-14 rounded-full" />
        <div className="space-y-2">
          <Skeleton className="h-6 w-56" />
          <Skeleton className="h-3.5 w-40" />
        </div>
        <Skeleton className="ml-auto hidden h-20 w-64 md:block" />
      </div>
      <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="space-y-6">
          <Skeleton className="h-52 rounded-card" />
          <Skeleton className="h-72 rounded-card" />
        </div>
        <div className="space-y-6">
          <Skeleton className="h-44 rounded-card" />
          <Skeleton className="h-56 rounded-card" />
        </div>
      </div>
    </div>
  );
}
