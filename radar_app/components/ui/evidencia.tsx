import { ExternalLink } from 'lucide-react';
import { cn, dataCurta } from '@/lib/utils';

/** Uma fonte do mesmo fato, como vem em Sinal.fontes. */
interface Fonte {
  fonte: string;
  url: string;
  data: string;
}

const ROTULO_CONFIANCA = { alta: 'confiança alta', media: 'confiança média', baixa: 'confiança baixa' } as const;

/**
 * A evidência de um fato, igual em Hoje, na linha do tempo da conta e na tese: veículo, quantos outros
 * veículos confirmam o mesmo fato, o link e, quando a base trouxer, a data da coleta e a confiança (D2).
 * Fato sem link aparece como "sem link de fonte": é evidência incompleta, não se esconde.
 */
export function Evidencia({
  fonte,
  url,
  fontes,
  coletadoEm,
  confianca,
  extra,
  pararPropagacao,
  className,
}: {
  fonte: string;
  url: string;
  fontes?: Fonte[];
  coletadoEm?: string;
  confianca?: keyof typeof ROTULO_CONFIANCA;
  extra?: string;
  /** dentro de um cartão clicável: o clique no link não abre o cartão */
  pararPropagacao?: boolean;
  className?: string;
}) {
  // outros veículos do mesmo fato (o principal costuma vir incluído na lista)
  const outros = (fontes ?? []).filter(f => f.fonte && f.fonte !== fonte);
  return (
    <span className={cn('inline-flex flex-wrap items-center gap-x-1.5 gap-y-0.5 text-text-3', className)}>
      <span className="text-text-2">{fonte || 'fonte sem nome'}</span>
      {outros.length > 0 && (
        <span title={outros.map(f => `${f.fonte}${f.data ? `, ${dataCurta(f.data)}` : ''}`).join(' · ')}>
          · confirmado por mais {outros.length} {outros.length > 1 ? 'veículos' : 'veículo'}
        </span>
      )}
      {url ? (
        <a
          href={url}
          target="_blank"
          rel="noopener noreferrer"
          onClick={pararPropagacao ? e => e.stopPropagation() : undefined}
          className="inline-flex min-h-6 items-center gap-1 rounded-chip text-text-2 underline decoration-border-strong underline-offset-2 hover:text-foreground"
        >
          ver fonte <ExternalLink className="size-3" strokeWidth={1.5} />
        </a>
      ) : (
        <span className="rounded-chip border border-border px-1 text-xs">sem link de fonte</span>
      )}
      {/^\d{4}-\d{2}-\d{2}/.test(coletadoEm ?? '') && <span>· coletado em {dataCurta(coletadoEm!.slice(0, 10))}</span>}
      {confianca && ROTULO_CONFIANCA[confianca] && <span>· {ROTULO_CONFIANCA[confianca]}</span>}
      {extra && <span>· {extra}</span>}
    </span>
  );
}
