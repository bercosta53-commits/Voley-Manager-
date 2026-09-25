'use client';

import { useEffect, useMemo, useState } from 'react';
import Link from 'next/link';
import { toast } from 'sonner';
import { ArrowDownRight, ArrowUpRight, CalendarClock, Check, ChevronLeft, Copy, ExternalLink, Minus, SearchX, Send } from 'lucide-react';
import type { Base, Conta, EstadoSinal, Sinal } from '@/lib/tipos';
import { primeiraMaiuscula, rotuloStatus, sentido, status } from '@/lib/contas';
import { rascunho } from '@/lib/mensagem';
import { cn, dataCurta, plural, somarDias } from '@/lib/utils';
import { Button } from '@/components/ui/button';
import { Skeleton } from '@/components/ui/skeleton';
import { PainelFlutuante } from '@/components/ui/painel-flutuante';
import { Casca } from '@/components/casca/casca';
import { LogoConta } from '@/components/hoje/logo-conta';
import { Curva } from '@/components/hoje/score';
import { Aviso, ErroCarregar, SemPermissao } from '@/components/hoje/estados';
import { useEstados } from '@/components/hoje/estado';
import { Comite } from './comite';
import { LinhaDoTempo } from './linha-do-tempo';
import { Decomposicao } from './decomposicao';

type EstadoTela = 'normal' | 'carregando' | 'vazio' | 'erro' | 'sem-permissao';
const ESTADOS: EstadoTela[] = ['carregando', 'vazio', 'erro', 'sem-permissao'];

export function TelaConta({ base, contaId }: { base: Base; contaId: string }) {
  const [estadoTela, setEstadoTela] = useState<EstadoTela>('normal');
  useEffect(() => {
    const e = new URLSearchParams(location.search).get('estado') as EstadoTela | null;
    if (e && ESTADOS.includes(e)) setEstadoTela(e);
  }, []);
  const { estados, salvar, pronto } = useEstados();
  const conta = estadoTela === 'vazio' ? undefined : base.contas.find(c => c.id === contaId);
  const sinais = useMemo(() => base.sinais.filter(s => s.contaId === contaId), [base.sinais, contaId]);
  const hoje = base.geradoEm;

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
  else conteudo = <Detalhe conta={conta} sinais={sinais} estados={estados} hoje={hoje} onMudar={mudar} />;

  return (
    <Casca base={base}>
      <main className="mx-auto w-full max-w-[1040px] px-4 pt-2 pb-28 md:px-6 md:pt-8 md:pb-16">
        <Link href="/contas" className="mb-4 inline-flex items-center gap-1 rounded-chip text-sm text-text-3 hover:text-foreground md:mb-6">
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
}: {
  conta: Conta;
  sinais: Sinal[];
  estados: Record<string, EstadoSinal>;
  hoje: string;
  onMudar: (s: Sinal, m: EstadoSinal, aviso: string) => void;
}) {
  const [decompor, setDecompor] = useState(false);
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
            </div>
          </div>
        </div>
        <ScoreGrande conta={conta} onAbrir={() => setDecompor(true)} />
      </header>

      <div className="mt-8 grid gap-6 md:grid-cols-[minmax(0,1fr)_320px]">
        <div className="flex min-w-0 flex-col gap-6">
          <ProximaAcao conta={conta} sinais={sinais} estados={estados} hoje={hoje} onMudar={onMudar} />
          <LinhaDoTempo conta={conta} sinais={sinais} estados={estados} hoje={hoje} />
        </div>
        <div className="flex flex-col gap-6">
          <Comite conta={conta} />
          <Cadastro conta={conta} />
        </div>
      </div>

      <PainelFlutuante
        aberto={decompor}
        onFechar={() => setDecompor(false)}
        titulo={`Score ${conta.score}: de onde vem`}
        descricao="Quanto cada coisa soma hoje. Cada sinal perde metade do valor a cada 60 dias."
      >
        <Decomposicao conta={conta} />
      </PainelFlutuante>
    </>
  );
}

/** Score grande com a curva de 90 dias. É um botão: abre a decomposição. */
function ScoreGrande({ conta, onAbrir }: { conta: Conta; onAbrir: () => void }) {
  const s = sentido(conta.tendencia);
  const cor = s === 'sobe' ? 'text-warm' : s === 'desce' ? 'text-cool' : 'text-text-3';
  const Seta = s === 'sobe' ? ArrowUpRight : s === 'desce' ? ArrowDownRight : Minus;
  const texto = s === 'sobe' ? `esquentando, +${conta.tendencia} em 14 dias` : s === 'desce' ? `esfriando, −${Math.abs(conta.tendencia)} em 14 dias` : 'estável em 14 dias';
  return (
    <button
      onClick={onAbrir}
      aria-label={`Score ${conta.score}, ${texto}. Ver de onde vem`}
      className="vr-card flex items-center gap-5 px-5 py-4 text-left transition-[box-shadow,border-color] duration-[var(--vr-dur-hover)] hover:border-border-strong hover:shadow-2"
    >
      <div className="flex flex-col">
        <Curva serie={conta.serie} largura={168} altura={44} classe={cor} />
        <span className="vr-data mt-1.5 flex justify-between text-[11px] text-text-3">
          <span>90 dias</span>
          <span>hoje</span>
        </span>
      </div>
      <div className="flex flex-col items-end">
        <span className="font-display text-score leading-none font-semibold tracking-tight tabular-nums">{conta.score}</span>
        <span className={cn('mt-1 flex items-center gap-0.5 text-xs', cor)}>
          <Seta className="size-3.5" strokeWidth={1.5} />
          <span className="vr-data">{s === 'estavel' ? '0' : `${conta.tendencia > 0 ? '+' : '−'}${Math.abs(conta.tendencia)}`}</span>
          <span className="ml-1 text-text-3">14 dias</span>
        </span>
        <span className="mt-1.5 text-xs font-medium text-text-2 underline decoration-border-strong underline-offset-4">de onde vem</span>
      </div>
    </button>
  );
}

const naCaixa = (e: EstadoSinal | undefined, hoje: string) => !e?.acao || (e.acao === 'adiado' && !!e.ate && e.ate <= hoje);

/** Próxima ação sugerida: o sinal mais forte ainda aberto vira uma abordagem com rascunho. */
function ProximaAcao({
  conta,
  sinais,
  estados,
  hoje,
  onMudar,
}: {
  conta: Conta;
  sinais: Sinal[];
  estados: Record<string, EstadoSinal>;
  hoje: string;
  onMudar: (s: Sinal, m: EstadoSinal, aviso: string) => void;
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

  const cabecalho = <h2 className="text-xs font-semibold text-text-3">Próxima ação sugerida</h2>;

  if (!alvo) {
    let titulo: string, corpo: string;
    if (abordado) {
      titulo = `Acompanhar a abordagem de ${dataCurta(abordado.e!.em ?? hoje)}`;
      corpo = `Se não houver resposta até ${dataCurta(somarDias(abordado.e!.em ?? hoje, 5))}, faça um segundo contato curto, retomando o mesmo fato.`;
    } else if (status(conta) === 'nao_abordar') {
      titulo = 'Completar os dados antes de abordar';
      corpo = conta.comite.length
        ? 'A planilha marca esta conta como insuficiente. Confira o status comercial antes de qualquer contato.'
        : 'Ninguém do comitê de compra identificado ainda. O Apollo completa nome e cargo quando a chave estiver configurada.';
    } else {
      titulo = 'Esperar um motivo';
      corpo = 'Nenhum sinal aberto nesta conta. O radar avisa em Hoje quando algo mudar; abordar sem motivo gasta a primeira impressão.';
    }
    return (
      <section className="vr-card p-5">
        {cabecalho}
        <p className="mt-2 text-md font-semibold">{titulo}</p>
        <p className="mt-1 text-sm text-text-2">{corpo}</p>
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
    ['CNPJ', <span key="c" className="vr-data">{conta.cnpj}</span>],
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
    ['Cidade', conta.cidade ? `${conta.cidade}/${conta.uf}` : conta.uf || '—'],
    ['Braço do ICP', conta.braco || '—'],
    ['Segmento', primeiraMaiuscula(conta.segmento) || '—'],
    ['Status comercial', primeiraMaiuscula(conta.statusComercial.toLowerCase()) || '—'],
  ];
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
