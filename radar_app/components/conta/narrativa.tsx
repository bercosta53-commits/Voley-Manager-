'use client';

import { useEffect, useMemo, useState } from 'react';
import type { Conta, Sinal } from '@/lib/tipos';
import { movimentos, periodo, resumoNarrativa, TEMAS, dataNarrativa, type Movimento, type Tema } from '@/lib/narrativa';
import { cn, plural, pontos } from '@/lib/utils';
import { IconeSinal } from '@/components/hoje/icone-sinal';
import { Evidencia } from '@/components/ui/evidencia';
import { Secao } from '@/components/ui/secao';

/** cor da faixa lateral de cada tema: tokens do tema do app */
const FAIXA: Record<Tema, string> = {
  lideranca: 'bg-warm',
  time: 'bg-ok',
  expansao: 'bg-cool',
  oferta: 'bg-text-2',
  societario: 'bg-text-2',
  negativo: 'bg-risk',
  contexto: 'bg-border-strong',
};
const VISIVEIS = 3;

const chave = (contaId: string) => `vr-narrativa-lida:${contaId}`;

/** Lê e atualiza a última leitura desta pessoa nesta conta (só neste navegador; sem ela, nada fica marcado como novo). */
function useUltimaLeitura(contaId: string, hoje: string) {
  const [ultima, setUltima] = useState<string | undefined>();
  useEffect(() => {
    try {
      const anterior = localStorage.getItem(chave(contaId)) ?? undefined;
      setUltima(anterior && anterior < hoje ? anterior : undefined);
      localStorage.setItem(chave(contaId), hoje);
    } catch {
      setUltima(undefined);
    }
  }, [contaId, hoje]);
  return ultima;
}

/**
 * Narrativa da conta: os fatos agrupados em movimentos (tema + proximidade no tempo), do mais recente ao mais
 * antigo, com o período, a força que somam ao score hoje e o que é novo desde a última leitura.
 */
export function NarrativaConta({ contaId, sinais, historico = [], hoje }: { contaId: string; sinais: Sinal[]; historico?: Conta['historico']; hoje: string }) {
  const ultimaLeitura = useUltimaLeitura(contaId, hoje);
  // fatos abertos (sinais) e antigos (histórico da conta), cada um uma vez
  const fatos = useMemo(() => {
    const ids = new Set(sinais.map(s => s.id));
    const antigos = historico
      .map((h, i) => ({ ...h, id: `hist-${h.tipo}-${h.data}-${i}`, contaId, pontos: 0, alertaEm: h.data, exemplo: false }) as unknown as Sinal)
      .filter(h => !ids.has(h.id) && !sinais.some(s => s.data === h.data && (s.sinal ?? s.rotulo) === (h.sinal ?? h.rotulo)));
    return [...sinais, ...antigos];
  }, [sinais, historico, contaId]);
  const movs = useMemo(() => movimentos(fatos, { ultimaLeitura }), [fatos, ultimaLeitura]);
  const resumo = resumoNarrativa(movs);
  if (!movs.length)
    return (
      <Secao titulo="Narrativa da conta">
        <p className="mt-2 text-sm text-text-3">Nenhum fato registrado nesta conta ainda. Os coletores trazem os próximos.</p>
      </Secao>
    );
  return (
    <Secao
      titulo="Narrativa da conta"
      extra={
        resumo.novos > 0 && ultimaLeitura ? (
          <span className="rounded-chip bg-acid-soft px-2 py-0.5 text-xs font-medium text-foreground">
            {plural(resumo.novos, 'fato novo', 'fatos novos')} desde {dataNarrativa(ultimaLeitura)}
          </span>
        ) : undefined
      }
    >
      <p className="mt-2 text-sm text-text-2">{resumo.frase}</p>
      <ol className="mt-4 flex flex-col gap-3">
        {movs.map(m => (
          <MovimentoItem key={m.id} m={m} principal={m.id === resumo.principal?.id} />
        ))}
      </ol>
      <p className="mt-3 text-xs text-text-3">
        Agrupa fatos do mesmo tema com até 120 dias entre um e outro. Organiza o que aconteceu; não liga causas nem muda o score.
      </p>
    </Secao>
  );
}

function MovimentoItem({ m, principal }: { m: Movimento<Sinal>; principal: boolean }) {
  const [aberto, setAberto] = useState(false);
  const fatos = aberto ? m.fatos : m.fatos.slice(0, VISIVEIS);
  return (
    <li className={cn('relative overflow-hidden rounded-control border border-border bg-card pl-4', principal && 'border-border-strong')}>
      <span aria-hidden className={cn('absolute inset-y-0 left-0 w-1', FAIXA[m.tema])} />
      <div className="flex flex-wrap items-baseline justify-between gap-x-3 gap-y-1 px-3 pt-3">
        <h3 className="text-sm font-semibold">
          {m.titulo}
          {principal && <span className="ml-2 text-xs font-medium text-text-3">o que mais pesa</span>}
        </h3>
        <p className="text-xs text-text-3">
          <span className="vr-data">{periodo(m)}</span> · {plural(m.fatos.length, 'fato', 'fatos')} ·{' '}
          {m.forca > 0 ? <span className="vr-data text-foreground">+{pontos(m.forca)} no score</span> : 'não soma ao score'}
          {m.novos > 0 && <span className="ml-1.5 rounded-chip bg-acid-soft px-1.5 py-px font-medium text-foreground">{m.novos} novo{m.novos > 1 ? 's' : ''}</span>}
        </p>
      </div>
      <ul className="mt-2 px-3 pb-3">
        {fatos.map(f => (
          <li key={f.id} className="grid grid-cols-[44px_minmax(0,1fr)] gap-x-2 border-t border-border/60 py-2 first:border-t-0 sm:grid-cols-[52px_20px_minmax(0,1fr)]">
            <time dateTime={f.data} className="vr-data pt-0.5 text-xs text-text-3">
              {dataNarrativa(f.data)}
            </time>
            <IconeSinal tipo={f.tipo} className="mt-0.5 hidden size-4 text-text-3 sm:block" />
            <div className="min-w-0">
              <p className="text-sm">{f.sinal ?? f.rotulo}</p>
              <Evidencia className="mt-0.5 flex flex-wrap gap-x-1 text-xs" fonte={f.fonte} url={f.url} fontes={f.fontes} coletadoEm={f.coletadoEm} confianca={f.confianca} />
            </div>
          </li>
        ))}
      </ul>
      {m.fatos.length > VISIVEIS && (
        <button type="button" onClick={() => setAberto(a => !a)} className="w-full border-t border-border/60 px-3 py-2 text-left text-xs font-medium text-text-2 hover:bg-muted" aria-expanded={aberto}>
          {aberto ? 'Mostrar menos' : `Ver os outros ${m.fatos.length - VISIVEIS}`}
        </button>
      )}
    </li>
  );
}
