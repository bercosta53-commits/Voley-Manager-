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
import { papelNoComite } from '@/lib/papeis';
import { cobertura } from '@/lib/cobertura';
import { ACAO_DO_ANDAMENTO, teseDaConta } from '@/lib/tese';
import { TeseConta } from './tese';
import { cn, dataComAno, dataCurta, moeda, plural, somarDias, pontos } from '@/lib/utils';
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
import { Decomposicao } from './decomposicao';
import { useHoje } from '@/components/ui/use-agora';

type EstadoTela = 'normal' | 'carregando' | 'vazio' | 'erro' | 'sem-permissao';
const ESTADOS: EstadoTela[] = ['carregando', 'vazio', 'erro', 'sem-permissao'];

/** S-1: a tela da conta recebe a conta e os sinais dela, mais o índice leve da casca; nunca o snapshot inteiro. */
export type BaseConta = BaseCasca & { conta?: Conta; sinaisDaConta: Sinal[] };

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
}) {
  const [decompor, setDecompor] = useState(false);
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
      {/* cabeçalho: quem é + calor */}
      <header className="flex flex-col gap-5 md:flex-row md:items-start md:justify-between">
        <div className="flex min-w-0 items-start gap-4">
          <LogoConta nome={conta.nome} dominio={conta.dominio} tamanho={56} />
          <div className="min-w-0">
            <h1 className="font-display text-2xl leading-tight font-semibold tracking-tight">{conta.nome}</h1>
            <p className="mt-1 text-sm text-text-3">
              {[primeiraMaiuscula(conta.segmento), conta.cidade && `${conta.cidade}/${conta.uf}`].filter(Boolean).join(' · ')}
            </p>
            <div className="mt-2 flex flex-wrap gap-1.5">
              <span className="rounded-chip border border-border px-1.5 py-0.5 text-xs text-text-2">Tier {conta.tier}</span>
              <span className="rounded-chip border border-border px-1.5 py-0.5 text-xs text-text-2">{rotuloStatus(conta)}</span>
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
        <ScoreGrande conta={conta} onAbrir={() => setDecompor(true)} />
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <TeseConta tese={tese} nomeConta={conta.nome} semAcaoDoTime={compartilhado && cobertura(conta, sinais, estados, andamento).subTrabalhada} />
          <div id="proxima-acao" className="scroll-mt-6 empty:hidden">
            <ProximaAcao conta={conta} sinais={sinais} estados={estados} hoje={hoje} onMudar={onMudar} andamento={andamento} />
          </div>
          {playbook && <BlocoPlaybook ativacao={playbook} conta={conta} className="mt-0" />}
          <LinhaDoTempo conta={conta} sinais={sinais} estados={estados} hoje={hoje} andamento={andamento} />
        </div>
        <div className="flex flex-col gap-6">
          <Andamento atual={andamento} compartilhado={compartilhado} onMudar={onAndamento} />
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

/** Score grande com a curva de 90 dias. É um botão: abre a decomposição. */
function ScoreGrande({ conta, onAbrir }: { conta: Conta; onAbrir: () => void }) {
  const s = sentido(conta.tendencia);
  const cor = s === 'sobe' ? 'text-warm' : s === 'desce' ? 'text-cool' : 'text-text-3';
  const Seta = s === 'sobe' ? ArrowUpRight : s === 'desce' ? ArrowDownRight : Minus;
  const texto = s === 'sobe' ? `esquentando, +${pontos(conta.tendencia)} em 30 dias` : s === 'desce' ? `esfriando, −${pontos(Math.abs(conta.tendencia))} em 30 dias` : 'estável em 30 dias';
  return (
    <button
      onClick={onAbrir}
      aria-label={`Score ${pontos(conta.score)}, ${texto}. Ver de onde vem`}
      className="vr-card flex items-center gap-5 px-5 py-4 text-left transition-[box-shadow,border-color] duration-[var(--vr-dur-hover)] hover:border-border-strong hover:shadow-2"
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
  const [mesmoAssim, setMesmoAssim] = useState(false);
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
        <h2 className="text-xs font-semibold tracking-wide text-text-3 uppercase">Antes do rascunho</h2>
        <p className="mt-2 text-md font-semibold">{titulo}</p>
        <p className="mt-1 text-sm text-text-2">{corpo}</p>
      </section>
    );
  }

  // a matriz ICP × VSCS ainda não pede abordagem: diz o que fazer em vez de empurrar o rascunho
  // (mesma origem da tese: o que o motor gravou ou, sem isso, a matriz — senão a tela se contradiz)
  const acao = conta.acaoRecomendada || acaoPelaMatriz(conta);
  if (acao && !ACOES_DE_ABORDAGEM.has(acao) && !conta.v2?.via_rapida && !mesmoAssim) {
    const corpo: Record<string, string> = {
      Monitorar: 'O VSCS ainda é baixo para o tier desta conta. Um fato sozinho não abre conversa: o radar avisa quando outro sinal chegar perto deste no tempo.',
      'Ampliar pesquisa': 'Há movimento, mas falta um segundo fato. Pesquise a conta (vagas, imprensa, LinkedIn à mão) e confirme quem decide antes de abordar.',
      'Revisar ICP da conta': 'Score alto em conta fora do ICP costuma indicar ICP mal classificado. Revise o tier antes de perseguir.',
      Ignorar: 'Fora do ICP e sem sinais relevantes.',
    };
    return (
      <section className="vr-card flex flex-wrap items-center justify-between gap-3 p-4">
        <div className="min-w-0">
          <h2 className="text-sm font-semibold">Rascunho guardado</h2>
          <p className="text-sm text-text-3">{corpo[acao] ?? conta.v2?.frase}</p>
        </div>
        <Button variant="ghost" onClick={() => setMesmoAssim(true)}>
          Ver o rascunho mesmo assim
        </Button>
      </section>
    );
  }

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
  if (conta.icp)
    linhas.push([
      'ICP',
      <span key="icp">
        <span className="font-medium text-foreground">Tier {conta.icp.tier}</span>
        <span className="text-text-3"> · {conta.icp.motivos.join(' · ')}</span>
      </span>,
    ]);
  if (conta.ramoTI) linhas.push(['Ramo de TI', `${conta.ramoTI.nome} (${conta.ramoTI.familia})`]);
  else linhas.push(['Segmento', primeiraMaiuscula(conta.segmento) || '—']);
  if (conta.especializacao) linhas.push(['Especialização', conta.especializacao.nome]);
  if (conta.modeloNegocio) linhas.push(['Modelo', { servico: 'Serviços', produto: 'Produto / software', misto: 'Produto e serviços' }[conta.modeloNegocio]]);
  if (conta.oQueFaz) linhas.push(['O que faz', conta.oQueFaz]);
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
  return (
    <section className="vr-card p-5">
      <h2 className="text-xs font-semibold text-text-3">Dados cadastrais</h2>
      <dl className="mt-3 grid gap-2.5 text-sm">
        {linhas.map(([k, v]) => (
          <div key={k} className="grid grid-cols-[112px_minmax(0,1fr)] gap-3">
            <dt className="text-text-3">{k}</dt>
            <dd className="break-words text-text-2">{v}</dd>
          </div>
        ))}
      </dl>
    </section>
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
