'use client';

import { useMemo } from 'react';
import Link from 'next/link';
import { Building2, CloudSun, Radio, Target } from 'lucide-react';
import { DIMENSOES, PERGUNTA_DIMENSAO, REGRAS, ROTULO_DIMENSAO, LEITURA_CLASSE, type Dimensao } from '@/lib/prioridade-config';
import { formatarNota } from '@/lib/prioridade';
import { expandirLinhas, type LinhaTransporte } from '@/lib/prioridade-transporte';
import { cn } from '@/lib/utils';
import { Losango, vscsDaDimensao } from '@/components/prioridade/losango';
import { ClasseExperimental } from '@/components/prioridade/painel';
import { Secao } from '@/components/ui/secao';

const ICONE: Record<Dimensao, typeof Target> = { icp: Building2, sinais: Radio, clima: CloudSun, oportunidadeDigital: Target };
const MINIMO = REGRAS.A2.minimos;

/**
 * Radar da conta: as quatro dimensões da prioridade integrada (ICP, Sinais, Clima do setor e Oportunidade
 * digital, que vem da maturidade de aquisição) no mesmo desenho do Radar, com a nota e o resumo de cada uma.
 * Modelo experimental, separado do score oficial (VSCS).
 */
export function RadarConta({ linha }: { linha: LinhaTransporte }) {
  const v = useMemo(() => expandirLinhas([linha])[0]!.visao, [linha]);
  return (
    <Secao
      titulo="Radar da conta"
      extra={
        <Link href={`/radar?q=${encodeURIComponent(linha.nome)}`} className="text-xs font-medium text-text-2 underline decoration-border-strong underline-offset-2 hover:text-foreground">
          ver no Radar
        </Link>
      }
    >
      <div className="mt-3 grid items-center gap-5 md:grid-cols-[388px_minmax(0,1fr)]">
        <div className="flex justify-center">
          <Losango dims={v.dimensoes} tamanho={300} />
        </div>
        <div className="flex flex-col gap-3">
          <div className="flex flex-wrap items-center gap-2 text-sm">
            <ClasseExperimental v={v} grande />
            {v.classeIntegrada && <span className="text-text-2">{LEITURA_CLASSE[v.classeIntegrada]}</span>}
          </div>
          <ul className="flex flex-col gap-2.5">
            {DIMENSOES.map(d => {
              const x = v.dimensoes[d];
              const nota = x.nota !== null && x.entraNoCalculo ? x.nota : null;
              const atinge = nota !== null && nota >= MINIMO[d];
              const Icone = ICONE[d];
              return (
                <li key={d} className="rounded-control border border-border bg-[var(--vr-surface-2)]/60 p-3">
                  <div className="flex items-center gap-2">
                    <Icone aria-hidden className="size-4 shrink-0 text-text-3" strokeWidth={1.5} />
                    <span className="text-sm font-semibold">{ROTULO_DIMENSAO[d]}</span>
                    <span
                      className={cn('vr-data ml-auto text-md font-semibold', nota === null && 'text-xs font-normal text-text-3')}
                      style={nota !== null ? { color: atinge ? 'var(--vr-ok)' : 'var(--vr-warm)' } : undefined}
                    >
                      {nota !== null ? formatarNota(Math.round(nota * 10) / 10) : 'sem avaliação'}
                      {nota !== null && d === 'sinais' && vscsDaDimensao(x) !== null && <span className="ml-1 text-xs font-normal text-text-3">(VSCS {vscsDaDimensao(x)})</span>}
                    </span>
                  </div>
                  {/* barra 0–5 com a marca do mínimo do sweet spot */}
                  <div className="relative mt-2 h-2 rounded-full bg-[var(--vr-surface-3)]" aria-hidden>
                    {nota !== null && <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${(nota / 5) * 100}%`, background: atinge ? 'var(--vr-ok)' : 'var(--vr-warm)' }} />}
                    <span className="absolute -top-0.5 -bottom-0.5 w-0.5 rounded bg-text-3" style={{ left: `${(MINIMO[d] / 5) * 100}%` }} title={`Mínimo do sweet spot: ${MINIMO[d]}`} />
                  </div>
                  <p className="mt-1.5 line-clamp-2 text-xs text-text-2" title={x.resumo ?? undefined}>{(d === 'sinais' ? x.resumo?.replace(/^VSCS \d+ · /, '') : x.resumo) ?? PERGUNTA_DIMENSAO[d]}</p>
                </li>
              );
            })}
          </ul>
          <p className="text-xs text-text-3">Modelo experimental de prioridade, separado do score oficial. A marca na barra é o mínimo para o sweet spot.</p>
        </div>
      </div>
    </Secao>
  );
}
