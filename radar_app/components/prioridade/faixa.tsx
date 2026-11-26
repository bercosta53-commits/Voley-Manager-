'use client';

import { SEGMENTOS, type Segmento } from '@/lib/prioridade-filtros';
import { cn, plural } from '@/lib/utils';

/** Intensidade decrescente numa só cor (preenchimento e marcador); o texto mantém contraste em todos. */
const ESTILO: Record<Segmento, { fundo: string; marca: React.CSSProperties }> = {
  a1: { fundo: 'bg-ok/30', marca: { background: 'var(--vr-ok)' } },
  candidata: { fundo: 'bg-card border-2 border-ok/60', marca: { border: '2px solid var(--vr-ok)' } },
  A2: { fundo: 'bg-ok/20', marca: { background: 'var(--vr-ok)', opacity: 0.75 } },
  B1: { fundo: 'bg-ok/15', marca: { background: 'var(--vr-ok)', opacity: 0.55 } },
  B2: { fundo: 'bg-ok/10', marca: { background: 'var(--vr-ok)', opacity: 0.35 } },
  C: { fundo: 'bg-ok/5', marca: { background: 'var(--vr-ok)', opacity: 0.2 } },
  fora_por_criterio: { fundo: 'bg-card border border-dashed border-border-strong', marca: { border: '1px dashed var(--vr-border-strong)' } },
  sem_metrica: { fundo: 'bg-transparent border border-dashed border-border-strong', marca: { border: '1px dashed var(--vr-border-strong)' } },
};

export function textoFaixa(total: number, completas: number, c: Record<Segmento, number>) {
  return (
    `${plural(total, 'conta monitorada', 'contas monitoradas')}, ${completas} com as quatro dimensões: ` +
    `${c.a1} em A1, ${c.candidata} candidatas com 1 dimensão a investigar, ${c.A2} em A2, ${c.B1} em B1, ${c.B2} em B2, ${c.C} em C, ` +
    `${c.fora_por_criterio} com 1 faltando e A1 fora de alcance, ${c.sem_metrica} sem métrica por terem 2 ou mais dimensões faltando.`
  );
}

/**
 * Do ambiente (universo) ao sweet spot, depois as aproximadas e a métrica enfraquecendo até sumir.
 * Cada segmento filtra a lista; clicar de novo tira o filtro. Largura proporcional, com mínimo para seguir clicável.
 */
export function Faixa({
  total,
  completas,
  contagem,
  ativos,
  onAlternar,
}: {
  total: number;
  completas: number;
  contagem: Record<Segmento, number>;
  ativos: Segmento[];
  onAlternar: (s: Segmento) => void;
}) {
  const semA1 = contagem.a1 === 0;
  return (
    <section aria-labelledby="faixa-titulo" className="mb-4">
      <h2 id="faixa-titulo" className="sr-only">
        Do ambiente ao sweet spot
      </h2>
      <div className="flex flex-wrap items-stretch gap-1.5 xl:flex-nowrap">
        <div className="flex w-full min-w-[118px] flex-col justify-center rounded-control border border-border bg-card px-3 py-2 sm:w-auto">
          <span className="text-xs font-semibold tracking-wide text-text-3 uppercase">Ambiente</span>
          <span className="vr-data text-lg leading-tight font-semibold">{total}</span>
          <span className="text-xs text-text-3">{completas} com as 4 dimensões</span>
        </div>
        <span aria-hidden className="hidden self-center text-text-3 xl:block">
          →
        </span>
        <ul className="flex min-w-0 flex-1 flex-wrap gap-1.5">
          {SEGMENTOS.map(s => {
            const n = contagem[s.id];
            const ativo = ativos.includes(s.id);
            return (
              <li key={s.id} style={{ flexGrow: Math.max(n, total * 0.03), flexBasis: 0 }} className="min-w-[96px]">
                <button
                  type="button"
                  aria-pressed={ativo}
                  onClick={() => onAlternar(s.id)}
                  className={cn(
                    'flex h-full min-h-[60px] w-full flex-col justify-center rounded-control px-2.5 py-1.5 text-left transition-colors hover:brightness-95',
                    ESTILO[s.id].fundo,
                    ativo && 'ring-2 ring-foreground ring-offset-1',
                  )}
                >
                  <span className="flex items-center gap-1.5 text-xs font-semibold tracking-wide whitespace-nowrap text-text-2 uppercase">
                    <span aria-hidden className="size-2 shrink-0 rounded-[2px]" style={ESTILO[s.id].marca} />
                    {s.grupo}
                    {ativo && <span className="sr-only">(filtro ativo)</span>}
                  </span>
                  <span className="flex items-baseline gap-1.5">
                    <span className="vr-data text-lg leading-tight font-semibold">{n}</span>
                    <span className="text-xs leading-tight text-text-2">{s.rotulo}</span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      </div>
      <p className="sr-only">{textoFaixa(total, completas, contagem)}</p>
      {semA1 && completas === 0 && (
        <p className="mt-2 text-xs text-text-3">
          Nenhuma conta tem as quatro dimensões avaliadas nesta carga, então não há A1 a mostrar. O Clima do setor ainda não tem nota por conta.
        </p>
      )}
    </section>
  );
}
