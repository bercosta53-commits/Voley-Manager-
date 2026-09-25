import { Archive, CalendarClock, ExternalLink, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { Conta, EstadoSinal, Sinal } from '@/lib/tipos';
import { cn, dataCurta, quando } from '@/lib/utils';
import { IconeSinal } from '@/components/hoje/icone-sinal';

interface Item {
  chave: string;
  data: string;
  icone: React.ReactNode;
  titulo: string;
  texto?: string;
  meta?: React.ReactNode;
  novo?: boolean;
  acao?: boolean;
}

/** Linha do tempo: sinais (abertos e antigos) e o que a equipe fez, do mais recente para o mais antigo. */
export function LinhaDoTempo({ conta, sinais, estados, hoje }: { conta: Conta; sinais: Sinal[]; estados: Record<string, EstadoSinal>; hoje: string }) {
  const itens: Item[] = [];
  for (const s of sinais) {
    const e = estados[s.id];
    itens.push({
      chave: s.id,
      data: s.data,
      icone: <IconeSinal tipo={s.tipo} className="size-4" />,
      titulo: s.rotulo,
      texto: s.porQueAgora,
      novo: !e?.acao,
      meta: <Evidencia fonte={s.fonte} url={s.url} exemplo={s.exemplo} extra={!e?.acao ? 'na caixa' : undefined} />,
    });
    if (e?.acao && e.em) {
      const icones = { abordado: Send, adiado: CalendarClock, arquivado: e.avaliacao === 'ruido' ? ThumbsDown : Archive };
      const Icone = icones[e.acao];
      const titulo =
        e.acao === 'abordado' ? 'Abordado' : e.acao === 'adiado' ? `Adiado até ${dataCurta(e.ate ?? e.em)}` : e.avaliacao === 'ruido' ? 'Marcado como ruído' : 'Arquivado';
      itens.push({ chave: `${s.id}-acao`, data: e.em, icone: <Icone className="size-4" strokeWidth={1.5} />, titulo, texto: `Sobre: ${s.rotulo.toLowerCase()}`, acao: true });
    } else if (e?.avaliacao === 'util' && e.em) {
      itens.push({ chave: `${s.id}-util`, data: e.em, icone: <ThumbsUp className="size-4" strokeWidth={1.5} />, titulo: 'Marcado como útil', texto: `Sobre: ${s.rotulo.toLowerCase()}`, acao: true });
    }
  }
  for (const h of conta.historico)
    itens.push({
      chave: `${h.tipo}-${h.data}`,
      data: h.data,
      icone: <IconeSinal tipo={h.tipo} className="size-4" />,
      titulo: h.rotulo,
      texto: h.porQueAgora,
      meta: <Evidencia fonte={h.fonte} url={h.url} exemplo={h.exemplo} />,
    });
  // Ação feita hoje aparece acima do sinal do mesmo dia.
  itens.sort((a, b) => (a.data === b.data ? Number(!!b.acao) - Number(!!a.acao) : b.data.localeCompare(a.data)));

  return (
    <section className="vr-card p-5">
      <h2 className="text-xs font-semibold text-text-3">Linha do tempo</h2>
      {!itens.length ? (
        <p className="mt-3 text-sm text-text-3">Nenhum fato registrado nesta conta ainda. Os coletores trazem os próximos.</p>
      ) : (
        <ol className="mt-4">
          {itens.map((it, i) => (
            <li key={it.chave} className="relative grid grid-cols-[64px_28px_minmax(0,1fr)] gap-x-3 pb-5 last:pb-0">
              <time dateTime={it.data} className="vr-data pt-1 text-right text-xs text-text-3">
                {quando(it.data, hoje)}
              </time>
              <div className="relative flex justify-center">
                {i < itens.length - 1 && <span aria-hidden className="absolute top-7 -bottom-5 w-px bg-border" />}
                <span
                  className={cn(
                    'relative grid size-7 place-items-center rounded-full border border-border',
                    it.acao ? 'bg-card text-text-3' : 'bg-secondary text-text-2',
                  )}
                >
                  {it.icone}
                  {it.novo && <span aria-hidden className="absolute -top-0.5 -right-0.5 size-2 rounded-full bg-acid ring-1 ring-foreground/25" />}
                </span>
              </div>
              <div className="min-w-0 pt-0.5">
                <p className={cn('text-sm font-semibold', it.acao && 'font-medium text-text-2')}>{it.titulo}</p>
                {it.texto && <p className={cn('text-sm', it.acao ? 'text-text-3' : 'text-foreground')}>{it.texto}</p>}
                {it.meta}
              </div>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}

function Evidencia({ fonte, url, exemplo, extra }: { fonte: string; url: string; exemplo: boolean; extra?: string }) {
  return (
    <p className="mt-0.5 flex flex-wrap items-center gap-x-1.5 text-xs text-text-3">
      <span className="text-text-2">{fonte}</span>
      {url ? (
        <a href={url} target="_blank" rel="noopener noreferrer" className="inline-flex items-center gap-1 rounded-chip underline decoration-border-strong underline-offset-2 hover:text-foreground">
          ver fonte <ExternalLink className="size-3" strokeWidth={1.5} />
        </a>
      ) : (
        exemplo && <span className="rounded-chip border border-border px-1 text-[11px]">exemplo</span>
      )}
      {extra && <span>· {extra}</span>}
    </p>
  );
}
