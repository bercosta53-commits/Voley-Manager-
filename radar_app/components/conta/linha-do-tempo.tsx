import { Archive, CalendarClock, Flag, Send, ThumbsDown, ThumbsUp } from 'lucide-react';
import type { StatusConta } from '@/lib/acoes';
import type { Conta, EstadoSinal, Sinal } from '@/lib/tipos';
import { cn, dataCurta, quando } from '@/lib/utils';
import { Secao } from '@/components/ui/secao';

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

/** O que a equipe fez na conta (abordou, adiou, arquivou, avaliou, andamento), do mais recente para o mais antigo.
 * Os fatos ficam na Narrativa da conta, sem repetir aqui. */
const ROTULO_ANDAMENTO: Record<StatusConta, string> = {
  abordado: 'Andamento: abordado',
  respondeu: 'Andamento: respondeu',
  reuniao: 'Andamento: reunião marcada',
  oportunidade: 'Andamento: virou oportunidade',
  descartada: 'Andamento: conta descartada',
};

export function LinhaDoTempo({
  conta,
  sinais,
  estados,
  hoje,
  andamento,
}: {
  conta: Conta;
  sinais: Sinal[];
  estados: Record<string, EstadoSinal>;
  hoje: string;
  andamento?: { status: StatusConta; por: string; em: string };
}) {
  const itens: Item[] = [];
  // com o registro compartilhado, cada ação diz quem fez
  const sobre = (s: Sinal, e: EstadoSinal) => `Sobre: ${s.rotulo.toLowerCase()}${e.por ? ` · por ${e.por}` : ''}`;
  if (andamento)
    itens.push({ chave: 'andamento', data: andamento.em, icone: <Flag className="size-4" strokeWidth={1.5} />, titulo: ROTULO_ANDAMENTO[andamento.status], texto: `por ${andamento.por}`, acao: true });
  for (const s of sinais) {
    const e = estados[s.id];
    if (e?.acao && e.em) {
      const icones = { abordado: Send, adiado: CalendarClock, arquivado: e.avaliacao === 'ruido' ? ThumbsDown : Archive };
      const Icone = icones[e.acao];
      const titulo =
        e.acao === 'abordado' ? 'Abordado' : e.acao === 'adiado' ? `Adiado até ${dataCurta(e.ate ?? e.em)}` : e.avaliacao === 'ruido' ? 'Marcado como ruído' : 'Arquivado';
      itens.push({ chave: `${s.id}-acao`, data: e.em, icone: <Icone className="size-4" strokeWidth={1.5} />, titulo, texto: sobre(s, e), acao: true });
    } else if (e?.avaliacao === 'util' && e.em) {
      itens.push({ chave: `${s.id}-util`, data: e.em, icone: <ThumbsUp className="size-4" strokeWidth={1.5} />, titulo: 'Marcado como útil', texto: sobre(s, e), acao: true });
    }
  }
  // Ação feita hoje aparece acima do sinal do mesmo dia.
  itens.sort((a, b) => (a.data === b.data ? Number(!!b.acao) - Number(!!a.acao) : b.data.localeCompare(a.data)));

  if (!itens.length) return null;
  return (
    <Secao titulo="O que o time fez">
      {(
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
    </Secao>
  );
}

