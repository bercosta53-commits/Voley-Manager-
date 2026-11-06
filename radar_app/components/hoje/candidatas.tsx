'use client';

import { useState } from 'react';
import { BriefcaseBusiness, ExternalLink } from 'lucide-react';
import type { Candidata } from '@/lib/tipos';
import { dataCurta } from '@/lib/utils';

const VISIVEIS = 5;

/**
 * Descoberta de contas (playbook, frente 2): empresas que ainda não estão na base e abriram vaga de
 * gerente pra cima em Growth/Revenue. É o mesmo gatilho que pesa 0.90 nas contas da base — aqui ele
 * diz "olhe esta empresa" antes de ela entrar no radar.
 */
export function Candidatas({ candidatas }: { candidatas: Candidata[] }) {
  const [todas, setTodas] = useState(false);
  if (!candidatas.length) return null;
  const lista = todas ? candidatas : candidatas.slice(0, VISIVEIS);
  return (
    <section aria-labelledby="candidatas-titulo" className="vr-card mb-6 p-4 md:p-5">
      <h2 id="candidatas-titulo" className="flex items-center gap-2 text-sm font-semibold">
        <BriefcaseBusiness className="size-4" strokeWidth={1.5} aria-hidden /> Fora da base · contratando liderança de Growth, Revenue e comercial
      </h2>
      <p className="mt-1 text-xs text-text-3">Contas novas para qualificar: quem chega com meta e sem plano pronto.</p>
      <ul className="mt-3 flex flex-col divide-y divide-border">
        {lista.map(c => (
          <li key={c.chave} className="flex flex-col gap-1 py-2 text-sm first:pt-0 last:pb-0">
            <p className="font-medium">
              {c.empresa}
              {c.vagas.length > 1 && <span className="ml-1.5 vr-data text-xs text-text-3">{c.vagas.length} vagas</span>}
            </p>
            {c.vagas.slice(0, 2).map(v => (
              <a
                key={v.url}
                href={v.url}
                target="_blank"
                rel="noreferrer"
                className="group flex items-center gap-1.5 text-text-2 hover:text-foreground"
              >
                {v.focoGrowthRevenue && <span className="shrink-0 rounded-chip bg-warm-bg px-1.5 py-px text-[11px] font-medium text-warm">Growth/Revenue</span>}
                <span className="truncate">{v.titulo}</span>
                <span className="shrink-0 text-xs text-text-3">
                  {[v.local, v.data && dataCurta(v.data), v.fonte].filter(Boolean).join(' · ')}
                </span>
                <ExternalLink className="size-3 shrink-0 text-text-3 opacity-0 group-hover:opacity-100" strokeWidth={1.5} aria-hidden />
              </a>
            ))}
          </li>
        ))}
      </ul>
      {candidatas.length > VISIVEIS && (
        <button type="button" onClick={() => setTodas(t => !t)} className="mt-3 text-xs text-text-3 underline underline-offset-2 hover:text-foreground">
          {todas ? 'Mostrar menos' : `Ver as ${candidatas.length}`}
        </button>
      )}
    </section>
  );
}
