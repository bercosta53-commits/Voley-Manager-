'use client';

import { useMemo, useState } from 'react';
import Link from 'next/link';
import type { BaseCasca } from '@/lib/casca-dados';
import { EIXOS, leituraMercado, rotuloSequencia, TEMAS_MERCADO, type ContaMercado, type Eixo, type FatoMercado, type GrupoMercado } from '@/lib/mercado';
import { TEMAS, dataNarrativa, type Tema } from '@/lib/narrativa';
import { cn, plural } from '@/lib/utils';
import { Casca } from '@/components/casca/casca';
import { Evidencia } from '@/components/ui/evidencia';
import { Secao } from '@/components/ui/secao';

const MESES = ['jan', 'fev', 'mar', 'abr', 'mai', 'jun', 'jul', 'ago', 'set', 'out', 'nov', 'dez'];
const GRUPOS_NA_GRADE = 10;

/**
 * Movimentos do mercado: o que está acontecendo nas contas, somado por grupo (família ou ramo de TI, ou vertical
 * do cliente) e por tema, nos últimos 90 dias. Cada número abre os fatos que o sustentam.
 */
export function TelaMovimentos({ base, contas, fatos, hoje }: { base: BaseCasca; contas: ContaMercado[]; fatos: FatoMercado[]; hoje: string }) {
  const [eixo, setEixo] = useState<Eixo>('familia');
  const leitura = useMemo(() => leituraMercado(contas, fatos, eixo, hoje), [contas, fatos, eixo, hoje]);
  const primeiraCelula = () => {
    const g = leitura.grupos.find(x => x.destaque) ?? leitura.grupos[0];
    return g ? { grupo: g.nome, tema: (g.destaque?.tema ?? TEMAS_MERCADO.find(t => g.porTema[t] > 0)) as Tema } : undefined;
  };
  const [selecao, setSelecao] = useState<{ grupo: string; tema: Tema } | undefined>(primeiraCelula);
  const mudarEixo = (e: Eixo) => {
    setEixo(e);
    setSelecao(undefined);
  };
  const grupoSel = leitura.grupos.find(g => g.nome === selecao?.grupo);
  const fatosSel = grupoSel ? grupoSel.fatos.filter(x => x.tema === selecao!.tema) : [];
  const maxMes = Math.max(1, ...leitura.porMes.map(m => m.n));
  const maxTema = Math.max(1, ...TEMAS_MERCADO.map(t => leitura.porTema[t]));
  const destaques = leitura.grupos.filter(g => g.destaque);
  // coluna sem fato nenhum na janela não entra na grade
  const temasGrade = TEMAS_MERCADO.filter(t => leitura.porTema[t] > 0);

  return (
    <Casca base={base}>
      <main className="w-full max-w-[1440px] px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16">
        <div className="mb-6 flex flex-wrap items-end justify-between gap-4 md:mb-8">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Movimentos do mercado</h1>
            <p className="mt-1 max-w-xl text-sm text-text-3">
              Últimos {leitura.janelaDias} dias · {plural(leitura.totalFatos, 'fato', 'fatos')} em {plural(leitura.contasComMovimento, 'conta', 'contas')}. Só fatos registrados; cada número abre os fatos que o sustentam.
            </p>
          </div>
          <div role="radiogroup" aria-label="Agrupar por" className="flex rounded-control border border-border bg-card p-0.5 text-sm">
            {(Object.keys(EIXOS) as Eixo[]).map(e => (
              <button
                key={e}
                role="radio"
                aria-checked={eixo === e}
                onClick={() => mudarEixo(e)}
                className={cn('rounded-[calc(var(--radius-control)-2px)] px-3 py-1.5', eixo === e ? 'bg-foreground text-background' : 'text-text-2 hover:bg-muted')}
              >
                {EIXOS[e]}
              </button>
            ))}
          </div>
        </div>

        {/* o que se mexe e quando */}
        <div className="grid gap-6 md:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Secao titulo="O que se mexe">
            <ul className="mt-3 flex flex-col gap-2">
              {TEMAS_MERCADO.filter(t => leitura.porTema[t] > 0).map(t => (
                <li key={t} className="grid grid-cols-[120px_minmax(0,1fr)_36px] items-center gap-3 text-sm">
                  <span className="text-text-2">{TEMAS[t].curto}</span>
                  <span className="h-2 overflow-hidden rounded-full bg-muted">
                    <span className="block h-full rounded-full bg-ok" style={{ width: `${(leitura.porTema[t] / maxTema) * 100}%` }} />
                  </span>
                  <span className="vr-data text-right font-semibold">{leitura.porTema[t]}</span>
                </li>
              ))}
            </ul>
          </Secao>
          <Secao titulo="Fatos por mês">
            <div className="mt-3 flex h-28 items-end gap-3">
              {leitura.porMes.map(m => (
                <div key={m.mes} className="flex flex-1 flex-col items-center gap-1">
                  <span className="vr-data text-xs font-semibold">{m.n}</span>
                  <span className="w-full max-w-10 rounded-t bg-ok/70" style={{ height: `${(m.n / maxMes) * 72}px` }} />
                  <span className="text-xs text-text-3">{MESES[Number(m.mes.slice(5, 7)) - 1]}</span>
                </div>
              ))}
            </div>
          </Secao>
        </div>

        {/* o que está mudando: tema acima da média da base em cada grupo */}
        {destaques.length > 0 && (
          <section aria-labelledby="mudando" className="mt-6">
            <h2 id="mudando" className="text-md font-semibold">
              O que está mudando, e em quem
            </h2>
            <ul className="mt-3 grid gap-3 md:grid-cols-2 xl:grid-cols-3">
              {destaques.slice(0, 6).map(g => (
                <CartaoDestaque key={g.nome} g={g} onAbrir={() => {
                    setSelecao({ grupo: g.nome, tema: g.destaque!.tema });
                    requestAnimationFrame(() => document.getElementById('grade-mercado')?.scrollIntoView({ behavior: 'smooth', block: 'start' }));
                  }} />
              ))}
            </ul>
          </section>
        )}

        {/* grade grupo × tema */}
        <Secao id="grade-mercado" titulo={`${EIXOS[eixo]} × tema`} className="mt-6 scroll-mt-6" extra={<span className="text-xs text-text-3">clique num número para ver os fatos</span>}>
          <div className="mt-3 overflow-x-auto">
            <table className="w-full min-w-[640px] border-separate border-spacing-0 text-sm">
              <thead>
                <tr className="text-left text-xs text-text-3">
                  <th className="py-2 pr-3 font-medium">{EIXOS[eixo]}</th>
                  <th className="px-2 py-2 text-right font-medium">Contas</th>
                  {temasGrade.map(t => (
                    <th key={t} className="px-2 py-2 text-center font-medium">
                      {TEMAS[t].curto}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {leitura.grupos.slice(0, GRUPOS_NA_GRADE).map(g => {
                  const max = Math.max(1, ...temasGrade.map(t => g.porTema[t]));
                  return (
                    <tr key={g.nome} className="border-t border-border">
                      <th scope="row" className="border-t border-border/60 py-2 pr-3 text-left font-medium">
                        {g.nome}
                      </th>
                      <td className="vr-data border-t border-border/60 px-2 py-2 text-right text-xs text-text-3">
                        {g.contasComMovimento}/{g.contas}
                      </td>
                      {temasGrade.map(t => {
                        const n = g.porTema[t];
                        const sel = selecao?.grupo === g.nome && selecao.tema === t;
                        return (
                          <td key={t} className="border-t border-border/60 px-1 py-1 text-center">
                            {n ? (
                              <button
                                onClick={() => setSelecao({ grupo: g.nome, tema: t })}
                                aria-pressed={sel}
                                aria-label={`${g.nome}, ${TEMAS[t].curto}: ${n}`}
                                className={cn(
                                  'vr-data w-full rounded-control py-1.5 font-semibold',
                                  g.destaque?.tema === t && 'ring-1 ring-foreground',
                                  sel ? 'bg-foreground text-background' : 'hover:ring-1 hover:ring-border-strong',
                                )}
                                style={sel ? undefined : { backgroundColor: `color-mix(in srgb, var(--vr-ok) ${Math.round(12 + (n / max) * 38)}%, transparent)` }}
                              >
                                {n}
                              </button>
                            ) : (
                              <span className="text-text-3">·</span>
                            )}
                          </td>
                        );
                      })}
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
          {leitura.grupos.length > GRUPOS_NA_GRADE && (
            <p className="mt-2 text-xs text-text-3">Mostrando os {GRUPOS_NA_GRADE} grupos com mais fatos de {leitura.grupos.length}.</p>
          )}
          {grupoSel && selecao && (
            <div className="mt-5 border-t border-border pt-4">
              <h3 className="text-sm font-semibold">
                {TEMAS[selecao.tema].curto} em {grupoSel.nome} · {plural(fatosSel.length, 'fato', 'fatos')}
              </h3>
              <ul className="mt-2">
                {fatosSel.map(x => (
                  <li key={x.fato.id} className="grid grid-cols-[48px_minmax(0,1fr)] gap-x-3 border-t border-border/60 py-2 first:border-t-0">
                    <time dateTime={x.fato.data} className="vr-data pt-0.5 text-xs text-text-3">
                      {dataNarrativa(x.fato.data)}
                    </time>
                    <div className="min-w-0">
                      <p className="text-sm">
                        <Link href={`/contas/${x.conta.id}`} className="font-medium hover:underline">
                          {x.conta.nome}
                        </Link>{' '}
                        · {x.fato.sinal}
                      </p>
                      <Evidencia className="mt-0.5 flex flex-wrap gap-x-1 text-xs" fonte={x.fato.fonte ?? ''} url={x.fato.url ?? ''} />
                    </div>
                  </li>
                ))}
              </ul>
            </div>
          )}
        </Secao>

        {/* sequências típicas */}
        {leitura.sequencias.length > 0 && (
          <Secao titulo="Sequências que se repetem" className="mt-6">
            <p className="mt-1 text-xs text-text-3">Ordem em que os temas aparecem pela primeira vez na mesma conta, com até 180 dias entre um e outro. Mostra só sequências vistas em duas contas ou mais.</p>
            <ul className="mt-3 grid gap-3 md:grid-cols-2">
              {leitura.sequencias.slice(0, 6).map(s => (
                <li key={s.chave} className="rounded-control border border-border p-3">
                  <p className="flex items-baseline justify-between gap-2">
                    <span className="text-sm font-semibold">{rotuloSequencia(s)}</span>
                    <span className="vr-data text-xs text-text-3">{plural(s.contas.length, 'conta', 'contas')}</span>
                  </p>
                  <p className="mt-1.5 text-xs leading-relaxed text-text-2">
                    {s.contas.map((c, i) => (
                      <span key={c.id}>
                        {i > 0 && ' · '}
                        <Link href={`/contas/${c.id}`} className="hover:underline">
                          {c.nome}
                        </Link>{' '}
                        <span className="vr-data text-text-3">
                          ({dataNarrativa(c.datas[0])} → {dataNarrativa(c.datas[1])})
                        </span>
                      </span>
                    ))}
                  </p>
                </li>
              ))}
            </ul>
          </Secao>
        )}
      </main>
    </Casca>
  );
}

function CartaoDestaque({ g, onAbrir }: { g: GrupoMercado; onAbrir: () => void }) {
  const d = g.destaque!;
  const doTema = g.fatos.filter(x => x.tema === d.tema);
  const contas = [...new Map(doTema.map(x => [x.conta.id, x.conta])).values()];
  return (
    <li className="vr-card flex flex-col p-4">
      <p className="text-xs text-text-3">{g.nome}</p>
      <p className="mt-1 text-sm">
        <span className="font-semibold">{TEMAS[d.tema].curto}</span> aparece <span className="vr-data font-semibold">{String(d.indice).replace('.', ',')}×</span> mais que na base ·{' '}
        {plural(d.n, 'fato', 'fatos')} em {plural(contas.length, 'conta', 'contas')}
      </p>
      <ul className="mt-2 flex flex-col gap-1">
        {doTema.slice(0, 3).map(x => (
          <li key={x.fato.id} className="truncate text-xs text-text-2">
            <span className="vr-data text-text-3">{dataNarrativa(x.fato.data)}</span>{' '}
            <Link href={`/contas/${x.conta.id}`} className="font-medium text-foreground hover:underline">
              {x.conta.nome}
            </Link>{' '}
            · {x.fato.sinal}
          </li>
        ))}
      </ul>
      <button onClick={onAbrir} className="mt-3 self-start text-xs font-medium text-text-2 underline underline-offset-2 hover:text-foreground">
        Ver os {d.n} fatos
      </button>
    </li>
  );
}
