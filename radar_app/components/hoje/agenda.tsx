import Link from 'next/link';
import { CalendarDays } from 'lucide-react';
import type { EventoAgenda } from '@/lib/tipos';
import { hrefConta } from '@/lib/contas';
import { dataCurta } from '@/lib/utils';

const PAPEL: Record<string, string> = {
  palestrante: 'palestra',
  expositor: 'expõe',
  patrocinador: 'patrocina',
  startup: 'startup em exposição',
};

/** Agenda presencial: eventos dos próximos 60 dias em que contas da base estarão como expositoras,
 * patrocinadoras ou com alguém do comitê no palco — ponto de contato presencial (spec 3.6). */
export function Agenda({ eventos }: { eventos: EventoAgenda[] }) {
  if (!eventos.length) return null;
  return (
    <section aria-labelledby="agenda-titulo" className="vr-card mb-6 p-4 md:p-5">
      <h2 id="agenda-titulo" className="flex items-center gap-2 text-sm font-semibold">
        <CalendarDays className="size-4" strokeWidth={1.5} aria-hidden /> Agenda presencial · próximos 60 dias
      </h2>
      <ul className="mt-3 flex flex-col gap-3">
        {eventos.map(e => (
          <li key={e.id} className="text-sm">
            <p className="font-medium">
              {e.nome} <span className="text-text-3">· {e.cidade}/{e.uf} · <span className="vr-data text-xs">{dataCurta(e.inicio)}</span></span>
            </p>
            <p className="text-text-2">
              {e.presencas.map((p, i) => (
                <span key={`${p.contaId}-${p.pessoa}-${i}`}>
                  {i > 0 && ' · '}
                  <Link href={hrefConta(p.contaId)} className="underline decoration-border-strong underline-offset-2 hover:text-foreground">
                    {p.conta}
                  </Link>{' '}
                  <span className="text-text-3">({p.pessoa ? `${p.pessoa} ${PAPEL.palestrante}` : PAPEL[p.papel] ?? p.papel})</span>
                </span>
              ))}
            </p>
          </li>
        ))}
      </ul>
    </section>
  );
}
