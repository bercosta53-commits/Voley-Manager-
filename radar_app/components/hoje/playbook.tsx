'use client';

import { useState } from 'react';
import { Check, Copy, Zap } from 'lucide-react';
import type { Conta, Sinal } from '@/lib/tipos';
import { cn, dataCurta, plural } from '@/lib/utils';
import { OFERTAS, mensagemPlaybook, oportunidadeDe, pessoasParaPlaybook, type Ativacao, type Oferta } from '@/lib/playbooks';

/** Selo do playbook combinado ativo na conta (linha da caixa e cartão). */
export function SeloPlaybook({ ativacao, className }: { ativacao: Ativacao; className?: string }) {
  return (
    <span
      title={`Playbook combinado: ${ativacao.playbook.nome}, ${plural(ativacao.diasRestantes, 'dia restante', 'dias restantes')}`}
      className={cn('inline-flex shrink-0 items-center gap-1 rounded-chip bg-warm-bg px-1.5 py-0.5 text-xs font-semibold text-warm', className)}
    >
      <Zap aria-hidden className="size-3" strokeWidth={2} />
      {ativacao.playbook.nome}
    </span>
  );
}

function ChipsOferta({ ofertas }: { ofertas: Oferta[] }) {
  return (
    <span className="flex flex-wrap gap-1">
      {ofertas.map(o => (
        <span key={o} className="rounded-chip border border-border bg-card px-1.5 py-0.5 text-xs font-medium text-foreground">
          {OFERTAS[o]}
        </span>
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

/** O bloco do playbook combinado (seção 5.6): história, o que fazer e o que a Velora oferece. */
export function BlocoPlaybook({ ativacao, conta, className }: { ativacao: Ativacao; conta: Conta; className?: string }) {
  const { playbook: pb, evidencia, diasRestantes } = ativacao;
  const grupos = pessoasParaPlaybook(pb, conta.comite);
  const primeiro = grupos.flatMap(g => g.pessoas)[0];
  const [copiado, setCopiado] = useState(false);
  async function copiar() {
    try {
      await navigator.clipboard.writeText(mensagemPlaybook(pb, conta, primeiro?.nome));
      setCopiado(true);
      setTimeout(() => setCopiado(false), 2000);
    } catch {}
  }
  const linhas: [string, React.ReactNode][] = [
    [
      'Evidência',
      evidencia.map((s, i) => (
        <span key={s.id}>
          {i > 0 && <span className="text-text-3"> + </span>}
          {s.sinal ?? s.rotulo} <span className="vr-data text-text-3">({dataCurta(s.data)})</span>
        </span>
      )),
    ],
    ['Leitura', pb.leitura],
    ['Dor provável', pb.dor],
    [
      'Procure',
      grupos.map((g, i) => (
        <span key={g.rotulo}>
          {i > 0 && <span className="text-text-3"> · </span>}
          {g.rotulo}
          {g.pessoas.length > 0 && <span className="text-text-2"> → {g.pessoas.slice(0, 3).map(p => p.nome).join(', ')}</span>}
        </span>
      )),
    ],
    ['Ângulo', pb.angulo],
    ...(pb.naoDizer ? ([['Não diga', pb.naoDizer]] as [string, React.ReactNode][]) : []),
    ['Pergunte', `"${pb.descoberta}"`],
    ['Velora oferece', <ChipsOferta key="o" ofertas={pb.ofertas} />],
    ['Sucesso', pb.sucesso],
  ];
  return (
    <section aria-label={`Playbook: ${pb.nome}`} className={cn('vr-card mt-4 border-l-[3px] border-l-[var(--vr-warm)] p-5', className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h2 className="flex items-center gap-1.5 text-sm font-semibold">
          <Zap aria-hidden className="size-4 text-warm" strokeWidth={2} />
          Playbook: {pb.nome}
        </h2>
        <span className="vr-data text-xs text-text-3">
          janela: {diasRestantes === 0 ? 'último dia' : plural(diasRestantes, 'dia restante', 'dias restantes')}
        </span>
      </div>
      <dl className="grid gap-2 text-sm sm:grid-cols-[120px_minmax(0,1fr)] sm:gap-x-4">
        {linhas.map(([rotulo, valor]) => (
          <div key={rotulo} className="contents">
            <dt className="text-text-3">{rotulo}</dt>
            <dd className="min-w-0 max-sm:mb-1">{valor}</dd>
          </div>
        ))}
      </dl>
      <div className="mt-4 flex flex-wrap items-center gap-2 border-t border-border pt-3">
        <ol aria-label="Sequência" className="flex flex-wrap gap-1.5">
          {pb.sequencia.map(p => (
            <li key={p.dia} className="rounded-chip bg-secondary px-1.5 py-0.5 text-xs text-text-2">
              <span className="vr-data font-semibold text-foreground">D{p.dia}</span> {p.canal}
            </li>
          ))}
        </ol>
        <button
          type="button"
          onClick={copiar}
          className="ml-auto inline-flex h-8 items-center gap-1.5 rounded-control border border-border bg-card px-2.5 text-sm font-medium hover:bg-[var(--vr-surface-2)] max-md:h-10"
        >
          {copiado ? <Check aria-hidden className="size-4" /> : <Copy aria-hidden className="size-4" strokeWidth={1.5} />}
          {copiado ? 'Mensagem copiada' : 'Copiar mensagem'}
        </button>
      </div>
      <p className="mt-2 text-xs text-text-3">
        Proposta inicial de playbook, a validar com o comercial. A mensagem é rascunho: cita o mercado, não o sinal; revise antes de enviar.
      </p>
    </section>
  );
}
