'use client';

import { useCallback, useEffect, useState } from 'react';
import { Flame } from 'lucide-react';
import { Chip } from '@/components/ui/chip';
import { useApresentacao } from '@/components/ui/use-apresentacao';
import { ESCALA_RELACIONAMENTO, VIA_QUENTE, chavePessoa, type RelacaoPessoa } from '@/lib/relacionamentos';

/** Relações registradas pelo time na conta. `ligado = false` quando a tabela privada ainda não está ativa (204). */
export function useRelacionamentos(contaId: string) {
  const [ligado, setLigado] = useState(false);
  const [pessoas, setPessoas] = useState<Record<string, RelacaoPessoa>>({});
  const [erro, setErro] = useState(false);
  useEffect(() => {
    let vivo = true;
    fetch(`/api/relacionamentos?conta=${encodeURIComponent(contaId)}`, { cache: 'no-store' })
      .then(async r => {
        if (!vivo) return;
        if (r.status === 204) return setLigado(false);
        if (!r.ok) throw new Error(String(r.status));
        setLigado(true);
        setPessoas(((await r.json()) as { pessoas: Record<string, RelacaoPessoa> }).pessoas ?? {});
      })
      .catch(() => vivo && setErro(true));
    return () => {
      vivo = false;
    };
  }, [contaId]);
  const salvar = useCallback(
    async (pessoa: string, nota: number) => {
      const k = chavePessoa(pessoa);
      const antes = pessoas[k];
      const hoje = new Date().toISOString().slice(0, 10);
      // otimista: a minha nota muda na hora; a maior nota do time só sobe se a minha passar dela
      setPessoas(p => ({
        ...p,
        [k]: { nota: Math.max(nota, (antes?.minha === antes?.nota ? -1 : antes?.nota) ?? -1), em: hoje, minha: nota, registros: (antes?.registros ?? 0) + (antes?.minha == null ? 1 : 0) },
      }));
      const r = await fetch('/api/relacionamentos', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ contaId, pessoa, nota }),
      }).catch(() => null);
      if (!r?.ok) {
        setPessoas(p => ({ ...p, [k]: antes as RelacaoPessoa }));
        setErro(true);
      }
    },
    [contaId, pessoas],
  );
  return { ligado, pessoas, salvar, erro };
}

/** Campo da relação de uma pessoa do comitê. No modo apresentação só aparece o selo "via quente". */
export function RelacaoPessoaCampo({
  nome,
  relacao,
  onMudar,
}: {
  nome: string;
  relacao?: RelacaoPessoa;
  onMudar: (nota: number) => void;
}) {
  const apresentacao = useApresentacao();
  const quente = (relacao?.nota ?? 0) >= VIA_QUENTE;
  if (apresentacao) return quente ? <SeloViaQuente /> : null;
  return (
    <span className="mt-1 flex flex-wrap items-center gap-1.5">
      <label className="flex min-w-0 max-w-full items-center gap-1 text-xs text-text-3">
        Relação
        <select
          aria-label={`Relação da Velora com ${nome}`}
          value={relacao?.minha ?? ''}
          onChange={e => e.target.value !== '' && onMudar(Number(e.target.value))}
          className="w-40 max-w-full min-w-0 truncate rounded-control border border-border bg-card px-1 py-0.5 text-xs text-foreground"
        >
          <option value="" disabled>
            —
          </option>
          {ESCALA_RELACIONAMENTO.map(e => (
            <option key={e.nota} value={e.nota}>
              {e.nota} · {e.rotulo}
            </option>
          ))}
        </select>
      </label>
      {relacao && relacao.registros > 0 && relacao.nota !== relacao.minha && (
        <span className="text-xs text-text-3">time: {relacao.nota}</span>
      )}
      {quente && <SeloViaQuente />}
    </span>
  );
}

export function SeloViaQuente({ className }: { className?: string }) {
  return (
    <Chip tom="quente" peso="forte" className={className} title="Alguém da Velora tem acesso direto a esta pessoa (relação 4 ou 5)">
      <Flame aria-hidden className="size-3" strokeWidth={2} />
      via quente
    </Chip>
  );
}

/** Contas com via quente, para o selo no cartão de Hoje (lista vazia quando desligado). */
export function useViasQuentes() {
  const [contas, setContas] = useState<Set<string>>(new Set());
  useEffect(() => {
    let vivo = true;
    fetch('/api/relacionamentos', { cache: 'no-store' })
      .then(async r => (r.status === 200 ? ((await r.json()) as { viaQuente: string[] }).viaQuente : []))
      .then(ids => vivo && setContas(new Set(ids)))
      .catch(() => {});
    return () => {
      vivo = false;
    };
  }, []);
  return contas;
}
