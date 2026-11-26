'use client';

import { useState } from 'react';
import { ArrowRight, Ban, Check, Copy, FileText, HelpCircle, Info, Mail, MessageCircle, Phone, UserRound, Zap } from 'lucide-react';
import { Button } from '@/components/ui/button';
import type { Conta, Sinal } from '@/lib/tipos';
import { cn, dataCurta, plural } from '@/lib/utils';
import { OFERTAS, mensagemPlaybook, oportunidadeDe, pessoasParaPlaybook, type Ativacao, type Oferta } from '@/lib/playbooks';
import { Rotulo } from '@/components/ui/rotulo';
import { Chip } from '@/components/ui/chip';

/** Selo do playbook combinado ativo na conta (linha da caixa e cartão). */
export function SeloPlaybook({ ativacao, className }: { ativacao: Ativacao; className?: string }) {
  return (
    <Chip
      tom="quente"
      peso="forte"
      title={`Playbook combinado: ${ativacao.playbook.nome}, ${plural(ativacao.diasRestantes, 'dia restante', 'dias restantes')}`}
      className={cn('shrink-0', className)}
    >
      <Zap aria-hidden className="size-3" strokeWidth={2} />
      {ativacao.playbook.nome}
    </Chip>
  );
}

function ChipsOferta({ ofertas }: { ofertas: Oferta[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {ofertas.map(o => (
        <Chip key={o} tom="cartao" peso="medio">
          {OFERTAS[o]}
        </Chip>
      ))}
    </span>
  );
}

/**
 * Linha "Oportunidade Velora" do cartão: com playbook combinado ativo, aponta para ele (o combinado substitui a
 * leitura isolada); senão, o entregável que o fato abre.
 */
export function OportunidadeVelora({ sinal, ativacao }: { sinal: Sinal; ativacao?: Ativacao }) {
  if (ativacao)
    return (
      <div className="flex flex-wrap items-center gap-x-1.5 gap-y-1">
        <dt className="text-text-3">Oportunidade Velora</dt>
        <dd className="text-text-2">
          está no playbook combinado <span className="font-medium text-foreground">{ativacao.playbook.nome}</span>, com a oferta e o roteiro
        </dd>
      </div>
    );
  const o = oportunidadeDe(sinal);
  if (!o) return null;
  return (
    <div className="grid gap-1">
      <dt className="text-text-3">Oportunidade Velora</dt>
      <dd className="grid gap-1.5">
        <span className="text-foreground">{o.texto}</span>
        <ChipsOferta ofertas={o.ofertas} />
      </dd>
    </div>
  );
}

const ICONE_CANAL: Record<string, typeof Mail> = { LinkedIn: MessageCircle, 'E-mail': Mail, Ligação: Phone, 'E-mail com caso': FileText };

const iniciais = (nome: string) =>
  nome
    .split(' ')
    .filter(Boolean)
    .slice(0, 2)
    .map(p => p[0]!.toUpperCase())
    .join('');


/**
 * O bloco do playbook combinado (seção 5.6), em quatro faixas de leitura rápida:
 * 1. o quê e até quando (nome, leitura, janela); 2. a história (os sinais em sequência);
 * 3. como abordar (com quem, ângulo, a pergunta, o que evitar) ao lado do que a Velora oferece;
 * 4. a ação (sequência de contato e a mensagem pronta para copiar).
 */
export function BlocoPlaybook({ ativacao, conta, className }: { ativacao: Ativacao; conta: Conta; className?: string }) {
  const { playbook: pb, evidencia, diasRestantes } = ativacao;
  const grupos = pessoasParaPlaybook(pb, conta.comite);
  const pessoas = [...new Map(grupos.flatMap(g => g.pessoas.map(p => [p.nome, { ...p, persona: g.rotulo }] as const))).values()].slice(0, 3);
  const semNome = grupos.filter(g => !g.pessoas.length).map(g => g.rotulo);
  const mensagem = mensagemPlaybook(pb, conta, pessoas[0]?.nome);
  const [copiado, setCopiado] = useState<'mensagem' | 'pergunta' | null>(null);
  const [verMensagem, setVerMensagem] = useState(false);
  async function copiar(texto: string, qual: 'mensagem' | 'pergunta') {
    try {
      await navigator.clipboard.writeText(texto);
      setCopiado(qual);
      setTimeout(() => setCopiado(null), 2000);
    } catch {}
  }
  const usado = Math.min(1, Math.max(0, 1 - diasRestantes / pb.janelaAcao));
  const urgente = diasRestantes <= 7;

  return (
    <section aria-label={`Playbook: ${pb.nome}`} className={cn('vr-card mt-4 overflow-hidden p-0', className)}>
      {/* 1. o quê e até quando */}
      <header className="flex flex-wrap items-start gap-3 border-b border-border p-5">
        <span aria-hidden className="grid size-10 shrink-0 place-items-center rounded-control bg-warm-bg text-warm">
          <Zap className="size-5" strokeWidth={2} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="text-xs font-semibold tracking-wide text-warm uppercase">Playbook ativo</p>
          <h2 className="text-lg leading-tight font-semibold tracking-tight">{pb.nome}</h2>
          <p className="mt-1 text-sm text-text-2">{pb.leitura}</p>
        </div>
        <div className="w-full shrink-0 sm:w-40" aria-label={`Janela de ação: ${diasRestantes} de ${pb.janelaAcao} dias restantes`}>
          <p className={cn('flex items-baseline justify-between text-xs', urgente ? 'text-risk' : 'text-text-3')}>
            <span>Janela de ação</span>
            <span className="vr-data font-semibold">{diasRestantes === 0 ? 'último dia' : `${diasRestantes} d`}</span>
          </p>
          <span aria-hidden className="mt-1.5 block h-1.5 overflow-hidden rounded-full bg-secondary">
            <span className={cn('block h-full rounded-full', urgente ? 'bg-risk' : 'bg-warm')} style={{ width: `${Math.round((1 - usado) * 100)}%` }} />
          </span>
          <p className="mt-1 text-xs text-text-3">até {dataCurta(ativacao.expiraEm)}</p>
        </div>
      </header>

      {/* 2. a história */}
      <div className="border-b border-border bg-muted/40 px-5 py-4">
        <Rotulo como="p" caps className="mb-2">Por que agora</Rotulo>
        <ol className="flex flex-wrap items-center gap-2">
          {evidencia.map((s, i) => (
            <li key={s.id} className="flex items-center gap-2">
              {i > 0 && <ArrowRight aria-hidden className="size-4 text-text-3" strokeWidth={1.5} />}
              <span className="inline-flex items-center gap-2 rounded-control border border-border bg-card px-2.5 py-1.5 text-sm">
                <span className="font-medium">{s.sinal ?? s.rotulo}</span>
                <span className="vr-data text-xs text-text-3">{dataCurta(s.data)}</span>
              </span>
            </li>
          ))}
        </ol>
        <p className="mt-2 text-sm text-text-2">
          <span className="text-text-3">Dor provável: </span>
          {pb.dor}
        </p>
      </div>

      {/* 3. como abordar + o que a Velora oferece */}
      <div className="grid gap-6 p-5 md:grid-cols-[minmax(0,1fr)_220px]">
        <div className="flex min-w-0 flex-col gap-5">
          <div>
            <Rotulo como="p" caps className="mb-2">Com quem falar</Rotulo>
            <ul className="flex flex-wrap gap-2">
              {pessoas.map(p => (
                <li key={p.nome} className="flex items-center gap-2 rounded-control border border-border px-2 py-1.5">
                  <span aria-hidden className="grid size-7 place-items-center rounded-full bg-secondary text-xs font-semibold">
                    {iniciais(p.nome)}
                  </span>
                  <span className="leading-tight">
                    <span className="block text-sm font-medium">{p.nome}</span>
                    <span className="block text-xs text-text-3">{p.cargo}</span>
                  </span>
                </li>
              ))}
              {semNome.map(r => (
                <li key={r} className="flex items-center gap-1.5 rounded-control border border-dashed border-border-strong px-2.5 py-1.5 text-sm text-text-2">
                  <UserRound aria-hidden className="size-4 text-text-3" strokeWidth={1.5} />
                  {r}
                  <span className="text-xs text-text-3">a mapear</span>
                </li>
              ))}
            </ul>
          </div>

          <div>
            <Rotulo como="p" caps className="mb-2">Ângulo</Rotulo>
            <p className="text-base font-medium leading-snug">{pb.angulo}</p>
          </div>

          <div className="rounded-control border border-border bg-muted/40 p-3">
            <div className="flex items-start gap-2">
              <HelpCircle aria-hidden className="mt-0.5 size-4 shrink-0 text-text-3" strokeWidth={1.5} />
              <div className="min-w-0 flex-1">
                <Rotulo como="p">Pergunta de descoberta</Rotulo>
                <p className="mt-0.5 text-sm">{pb.descoberta}</p>
              </div>
              <button
                type="button"
                onClick={() => copiar(pb.descoberta, 'pergunta')}
                aria-label="Copiar a pergunta"
                className="grid size-8 shrink-0 place-items-center rounded-control text-text-3 hover:bg-secondary hover:text-foreground max-md:size-10"
              >
                {copiado === 'pergunta' ? <Check className="size-4" /> : <Copy className="size-4" strokeWidth={1.5} />}
              </button>
            </div>
          </div>

          {pb.naoDizer && (
            <p className="flex items-start gap-2 text-sm text-text-2">
              <Ban aria-hidden className="mt-0.5 size-4 shrink-0 text-risk" strokeWidth={1.5} />
              <span>
                <span className="font-medium text-foreground">Evite: </span>
                {pb.naoDizer}
              </span>
            </p>
          )}
        </div>

        <aside className="rounded-control bg-warm-bg/50 p-4">
          <Rotulo como="p" caps className="mb-2">Velora oferece</Rotulo>
          <ul className="flex flex-col gap-2">
            {pb.ofertas.map(o => (
              <li key={o} className="flex items-start gap-2 text-sm font-medium">
                <Check aria-hidden className="mt-0.5 size-4 shrink-0 text-warm" strokeWidth={2} />
                {OFERTAS[o]}
              </li>
            ))}
          </ul>
          <p className="mt-4 border-t border-border pt-3 text-xs text-text-3">
            <span className="font-semibold text-text-2">Meta: </span>
            {pb.sucesso}
          </p>
        </aside>
      </div>

      {/* 4. a ação */}
      <footer className="border-t border-border p-5">
        <div className="flex flex-wrap items-center gap-4">
          <ol aria-label="Sequência de contato" className="flex min-w-0 flex-1 items-center">
            {pb.sequencia.map((p, i) => {
              const Icone = ICONE_CANAL[p.canal] ?? Mail;
              return (
                <li key={p.dia} className="flex flex-1 items-center last:flex-none">
                  <span className="flex flex-col items-center gap-1">
                    <span className="grid size-8 place-items-center rounded-full border border-border-strong bg-card">
                      <Icone aria-hidden className="size-4" strokeWidth={1.5} />
                    </span>
                    <span className="text-center text-xs leading-tight">
                      <span className="vr-data block font-semibold">D{p.dia}</span>
                      <span className="text-text-3">{p.canal}</span>
                    </span>
                  </span>
                  {i < pb.sequencia.length - 1 && <span aria-hidden className="mx-1 mb-8 h-px min-w-4 flex-1 bg-border-strong" />}
                </li>
              );
            })}
          </ol>
          <div className="flex w-full gap-2 sm:w-auto">
            <Button variant="secondary" size="sm" onClick={() => setVerMensagem(v => !v)} aria-expanded={verMensagem} className="flex-1 sm:flex-none">
              {verMensagem ? 'Fechar' : 'Ver mensagem'}
            </Button>
            <Button variant="primary" size="sm" onClick={() => copiar(mensagem, 'mensagem')} className="flex-1 sm:flex-none">
              {copiado === 'mensagem' ? <Check /> : <Copy />}
              {copiado === 'mensagem' ? 'Copiada' : 'Copiar mensagem'}
            </Button>
          </div>
        </div>
        {verMensagem && <p className="mt-4 rounded-control border border-border bg-muted/40 p-3 text-sm whitespace-pre-line">{mensagem}</p>}
        <p className="mt-4 flex items-center gap-1.5 text-xs text-text-3">
          <Info aria-hidden className="size-3.5 shrink-0" strokeWidth={1.5} />
          A mensagem é rascunho: cita o mercado, não o sinal. Revise antes de enviar.
        </p>
      </footer>
    </section>
  );
}
