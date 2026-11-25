'use client';

import Link from 'next/link';
import { useMemo } from 'react';
import type { Base, EstadoSinal } from '@/lib/tipos';
import type { StatusConta } from '@/lib/acoes';
import { lideranca } from '@/lib/lideranca';
import { hrefConta } from '@/lib/contas';
import { plural, pontos } from '@/lib/utils';
import { SeloQualificada } from '@/components/ui/selo-qualificada';

const ROTULO_ANDAMENTO: [StatusConta, string][] = [
  ['abordado', 'Abordadas'],
  ['respondeu', 'Responderam'],
  ['reuniao', 'Reunião'],
  ['oportunidade', 'Oportunidade'],
  ['descartada', 'Descartadas'],
];

function Numero({ valor, rotulo, detalhe }: { valor: string; rotulo: string; detalhe?: string }) {
  return (
    <div className="flex min-w-0 flex-col gap-0.5 px-4 py-3">
      <span className="vr-data text-2xl font-semibold tracking-tight tabular-nums">{valor}</span>
      <span className="text-sm font-medium">{rotulo}</span>
      {detalhe && <span className="text-xs text-text-3">{detalhe}</span>}
    </div>
  );
}

/**
 * O que o time fez com o que o Radar trouxe. Só lê fatos da carga e cliques que já fazem parte do fluxo; nada
 * aqui pede preenchimento. Sem o registro compartilhado, as ações de cada pessoa ficam no navegador dela, então
 * a parte "o que o time fez" não aparece (mostrar só as ações de quem está olhando seria enganoso).
 */
export function VisaoLideranca({
  base,
  estados,
  status,
  compartilhado,
}: {
  base: Base;
  estados: Record<string, EstadoSinal>;
  status: Record<string, { status: StatusConta }>;
  compartilhado: boolean;
}) {
  const l = useMemo(() => lideranca(base, compartilhado ? estados : {}, compartilhado ? status : {}), [base, estados, status, compartilhado]);
  const contas = useMemo(() => new Map(base.contas.map(c => [c.id, c])), [base.contas]);
  const andamento = ROTULO_ANDAMENTO.filter(([s]) => l.andamento[s]);

  return (
    <section aria-labelledby="visao-lideranca" className="vr-card mb-6 overflow-hidden">
      <div className="border-b border-border px-4 py-2.5">
        <h2 id="visao-lideranca" className="text-sm font-semibold">
          O que o time fez com o que o Radar trouxe
        </h2>
        <p className="text-xs text-text-3">Só lê os fatos da carga e os cliques que já fazem parte do fluxo. Nada aqui pede preenchimento.</p>
      </div>

      <div className="grid grid-cols-2 md:grid-cols-4 [&>*:not(:last-child)]:border-r [&>*]:border-border">
        <Numero valor={String(l.fatosSemana)} rotulo="Fatos novos na semana" detalhe={plural(l.contasComFatoSemana, 'empresa', 'empresas')} />
        <Numero valor={String(l.quentes)} rotulo="Empresas em oportunidade" detalhe="VSCS 55 ou mais, ou qualificadas" />
        <Numero
          valor={compartilhado ? String(l.quentesComAcao) : '—'}
          rotulo="Já trabalhadas pelo time"
          detalhe={compartilhado ? `${l.quentesSemAcaoTotal} ainda sem nenhuma ação` : 'depende do registro compartilhado'}
        />
        <Numero
          valor={compartilhado && l.diasAteAgir !== null ? `${l.diasAteAgir.toLocaleString('pt-BR')} d` : '—'}
          rotulo="Do aviso à primeira ação"
          detalhe={compartilhado ? (l.sinaisComAcao ? `mediana de ${plural(l.sinaisComAcao, 'sinal', 'sinais')}` : 'nenhuma ação ainda') : 'depende do registro compartilhado'}
        />
      </div>

      <div className="grid gap-4 border-t border-border px-4 py-3 lg:grid-cols-[minmax(0,3fr)_minmax(0,2fr)] lg:gap-8">
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-text-3">Em oportunidade e ainda sem nenhuma ação</h3>
          {!compartilhado ? (
            <p className="mt-2 text-sm text-text-3">
              Aparece quando o registro compartilhado estiver ligado. Sem ele, cada pessoa só vê o que ela mesma marcou.
            </p>
          ) : l.quentesSemAcao.length === 0 ? (
            <p className="mt-2 text-sm text-text-3">{l.quentes ? 'Todas as empresas em oportunidade já tiveram alguma ação.' : 'Nenhuma empresa em oportunidade agora.'}</p>
          ) : (
            <ul className="mt-2 divide-y divide-border">
              {l.quentesSemAcao.map(c => {
                const conta = contas.get(c.contaId);
                return (
                  <li key={c.contaId}>
                    <Link href={hrefConta(c.contaId)} className="flex min-h-10 items-center gap-3 py-1.5 hover:text-foreground">
                      <span className="vr-data w-8 shrink-0 text-right font-semibold tabular-nums">{pontos(c.score)}</span>
                      <span className="min-w-0 flex-1">
                        <span className="flex items-center gap-1.5 font-medium">
                          {c.nome}
                          {conta && <SeloQualificada conta={conta} />}
                        </span>
                        <span className="block truncate text-xs text-text-3">{c.fato}</span>
                      </span>
                      <span className="shrink-0 text-xs text-text-3">{c.diasDesdeAviso === 0 ? 'hoje' : `há ${plural(c.diasDesdeAviso, 'dia', 'dias')}`}</span>
                    </Link>
                  </li>
                );
              })}
              {l.quentesSemAcaoTotal > l.quentesSemAcao.length && (
                <li className="py-1.5 text-xs text-text-3">e mais {l.quentesSemAcaoTotal - l.quentesSemAcao.length} em Contas</li>
              )}
            </ul>
          )}
        </div>
        <div className="min-w-0">
          <h3 className="text-xs font-semibold text-text-3">Andamento registrado (opcional)</h3>
          {compartilhado && andamento.length ? (
            <ul className="mt-2 flex flex-wrap gap-1.5">
              {andamento.map(([s, rotulo]) => (
                <li key={s} className="flex items-center gap-1.5 rounded-chip border border-border px-2 py-0.5 text-xs text-text-2">
                  {rotulo}
                  <span className="vr-data font-semibold text-foreground">{l.andamento[s]}</span>
                </li>
              ))}
            </ul>
          ) : (
            <p className="mt-2 text-sm text-text-3">Ninguém registrou andamento. É opcional: o funil completo continua no CRM.</p>
          )}
        </div>
      </div>
    </section>
  );
}
