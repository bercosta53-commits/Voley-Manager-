'use client';

import { useEffect, useMemo, useState } from 'react';
import { BarChart3 } from 'lucide-react';
import type { Base } from '@/lib/tipos';
import { cn, diasEntre, plural } from '@/lib/utils';
import { Skeleton } from '@/components/ui/skeleton';
import { Casca } from '@/components/casca/casca';
import { Aviso, ErroCarregar, SemPermissao } from '@/components/hoje/estados';
import { useEstados } from '@/components/hoje/estado';

type EstadoTela = 'normal' | 'carregando' | 'vazio' | 'erro' | 'sem-permissao';
const ESTADOS: EstadoTela[] = ['carregando', 'vazio', 'erro', 'sem-permissao'];

/** Abaixo disso a precisão ainda é palpite. */
const MIN_AVALIACOES = 20;

const mediana = (xs: number[]) => {
  if (!xs.length) return 0;
  const o = [...xs].sort((a, b) => a - b);
  const m = Math.floor(o.length / 2);
  return o.length % 2 ? o[m]! : (o[m - 1]! + o[m]!) / 2;
};
const pct = (n: number, d: number) => (d ? Math.round((100 * n) / d) : 0);

export function TelaMetricas({ base }: { base: Base }) {
  const [estadoTela, setEstadoTela] = useState<EstadoTela>('normal');
  useEffect(() => {
    const e = new URLSearchParams(location.search).get('estado') as EstadoTela | null;
    if (e && ESTADOS.includes(e)) setEstadoTela(e);
  }, []);
  const { estados, pronto } = useEstados();
  const sinais = estadoTela === 'vazio' ? [] : base.sinais;

  const m = useMemo(() => {
    const fontes = [...new Set(sinais.map(s => s.fonte))];
    const porFonte = fontes
      .map(f => {
        const doFonte = sinais.filter(s => s.fonte === f);
        const util = doFonte.filter(s => estados[s.id]?.avaliacao === 'util').length;
        const ruido = doFonte.filter(s => estados[s.id]?.avaliacao === 'ruido').length;
        return {
          fonte: f,
          total: doFonte.length,
          reais: doFonte.filter(s => !s.exemplo).length,
          util,
          ruido,
          latencia: mediana(doFonte.map(s => Math.max(0, diasEntre(s.data, s.alertaEm)))),
        };
      })
      .sort((a, b) => b.total - a.total);
    const util = porFonte.reduce((n, f) => n + f.util, 0);
    const ruido = porFonte.reduce((n, f) => n + f.ruido, 0);
    const abordados = sinais.filter(s => estados[s.id]?.acao === 'abordado').length;
    const tratados = sinais.filter(s => estados[s.id]?.acao || estados[s.id]?.avaliacao).length;
    return {
      porFonte,
      util,
      ruido,
      avaliados: util + ruido,
      abordados,
      tratados,
      latencia: mediana(sinais.map(s => Math.max(0, diasEntre(s.data, s.alertaEm)))),
      noMesmoDia: sinais.filter(s => s.data === s.alertaEm).length,
      exemplos: sinais.filter(s => s.exemplo).length,
    };
  }, [sinais, estados]);

  let conteudo: React.ReactNode;
  if (estadoTela === 'carregando' || !pronto)
    conteudo = (
      <div aria-busy aria-label="Carregando métricas" className="grid gap-3 md:grid-cols-2">
        {Array.from({ length: 4 }, (_, i) => (
          <Skeleton key={i} className="h-60 rounded-card" />
        ))}
      </div>
    );
  else if (estadoTela === 'erro') conteudo = <ErroCarregar oque="as métricas" onTentar={() => location.reload()} />;
  else if (estadoTela === 'sem-permissao') conteudo = <SemPermissao />;
  else if (!sinais.length)
    conteudo = (
      <Aviso icone={<BarChart3 className="size-5" strokeWidth={1.5} />} titulo="Ainda sem sinais para medir">
        As métricas aparecem quando os primeiros sinais chegarem em Hoje.
      </Aviso>
    );
  else
    conteudo = (
      <div className="grid gap-3 md:grid-cols-2">
        {/* 1. precisão */}
        <Bloco
          pergunta="O radar acerta?"
          numero={m.avaliados ? `${pct(m.util, m.avaliados)}%` : '—'}
          legenda={
            m.avaliados
              ? `dos sinais avaliados foram úteis (${m.util} úteis, ${m.ruido} ruído)`
              : 'Nenhum sinal avaliado ainda. Marque Útil ou Ruído em Hoje.'
          }
          aviso={m.avaliados > 0 && m.avaliados < MIN_AVALIACOES ? `Com ${plural(m.avaliados, 'avaliação', 'avaliações')}, é cedo para confiar. O número fica firme a partir de ${MIN_AVALIACOES}.` : undefined}
        >
          <Barras
            linhas={m.porFonte
              .filter(f => f.util + f.ruido > 0)
              .map(f => ({ rotulo: f.fonte, valor: pct(f.util, f.util + f.ruido), texto: `${pct(f.util, f.util + f.ruido)}% · ${f.util + f.ruido}` }))}
            maximo={100}
            vazio="A precisão de cada fonte aparece aqui, separada, conforme você avalia."
          />
        </Bloco>

        {/* 2. latência */}
        <Bloco
          pergunta="Quanto demora do fato ao aviso?"
          numero={`${m.latencia.toLocaleString('pt-BR')} ${m.latencia === 1 ? 'dia' : 'dias'}`}
          legenda={`mediana entre o fato acontecer e o radar avisar · ${pct(m.noMesmoDia, sinais.length)}% no mesmo dia`}
        >
          <Barras
            linhas={m.porFonte.map(f => ({ rotulo: f.fonte, valor: f.latencia, texto: `${f.latencia.toLocaleString('pt-BR')} d` }))}
            maximo={Math.max(3, ...m.porFonte.map(f => f.latencia))}
          />
        </Bloco>

        {/* 3. volume */}
        <Bloco
          pergunta="De onde vêm os sinais?"
          numero={String(sinais.length)}
          legenda={`sinais na base agora · ${m.exemplos} de exemplo, ${sinais.length - m.exemplos} reais`}
        >
          <Barras
            linhas={m.porFonte.map(f => ({ rotulo: f.fonte, valor: f.total, parte: f.reais, texto: `${f.total}` }))}
            maximo={Math.max(...m.porFonte.map(f => f.total))}
            legendaParte="parte escura: reais"
          />
        </Bloco>

        {/* 4. conversão */}
        <Bloco
          pergunta="Quantos sinais viram abordagem?"
          numero={`${pct(m.abordados, sinais.length)}%`}
          legenda={`dos sinais recebidos viraram abordagem (${m.abordados} de ${sinais.length})`}
        >
          <Funil
            etapas={[
              { rotulo: 'Recebidos', valor: sinais.length },
              { rotulo: 'Tratados', valor: m.tratados },
              { rotulo: 'Abordados', valor: m.abordados },
            ]}
          />
        </Bloco>
      </div>
    );

  return (
    <Casca base={base}>
      <main className="mx-auto w-full max-w-[1040px] px-4 pt-2 pb-28 md:px-6 md:pt-10 md:pb-16">
        <div className="mb-6 md:mb-8">
          <h1 className="font-display text-2xl font-semibold tracking-tight">Métricas</h1>
          <p className="mt-1 max-w-xl text-sm text-text-3">
            Quatro perguntas sobre o radar. As respostas usam o que você marcou em Hoje (útil, ruído, abordado), guardado neste navegador.
          </p>
        </div>
        {conteudo}
      </main>
    </Casca>
  );
}

function Bloco({ pergunta, numero, legenda, aviso, children }: { pergunta: string; numero: string; legenda: string; aviso?: string; children: React.ReactNode }) {
  return (
    <section className="vr-card flex flex-col p-5">
      <h2 className="text-sm font-semibold">{pergunta}</h2>
      <p className="mt-3 font-display text-2xl font-semibold tracking-tight tabular-nums">{numero}</p>
      <p className="mt-0.5 text-sm text-text-3">{legenda}</p>
      {aviso && <p className="mt-2 rounded-control bg-warm-bg px-2.5 py-1.5 text-xs text-foreground">{aviso}</p>}
      <div className="mt-5 border-t border-border pt-4">{children}</div>
    </section>
  );
}

function Barras({
  linhas,
  maximo,
  vazio,
  legendaParte,
}: {
  linhas: { rotulo: string; valor: number; parte?: number; texto: string }[];
  maximo: number;
  vazio?: string;
  legendaParte?: string;
}) {
  if (!linhas.length) return <p className="text-sm text-text-3">{vazio}</p>;
  return (
    <>
      <ul className="flex flex-col gap-2.5">
        {linhas.map(l => (
          <li key={l.rotulo} className="grid grid-cols-[150px_minmax(0,1fr)_56px] max-md:grid-cols-[112px_minmax(0,1fr)_48px] items-center gap-3 text-sm">
            <span className="truncate text-text-2">{l.rotulo}</span>
            <span className="relative h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
              <span className="absolute inset-y-0 left-0 rounded-full bg-border-strong" style={{ width: `${(100 * l.valor) / (maximo || 1)}%` }} />
              {l.parte !== undefined && <span className="absolute inset-y-0 left-0 rounded-full bg-text-2" style={{ width: `${(100 * l.parte) / (maximo || 1)}%` }} />}
              {l.parte === undefined && <span className="absolute inset-y-0 left-0 rounded-full bg-text-2" style={{ width: `${(100 * l.valor) / (maximo || 1)}%` }} />}
            </span>
            <span className="vr-data text-right text-xs text-text-2">{l.texto}</span>
          </li>
        ))}
      </ul>
      {legendaParte && <p className="mt-3 text-xs text-text-3">{legendaParte}</p>}
    </>
  );
}

function Funil({ etapas }: { etapas: { rotulo: string; valor: number }[] }) {
  const max = etapas[0]!.valor || 1;
  return (
    <ol className="flex flex-col gap-2.5">
      {etapas.map((e, i) => (
        <li key={e.rotulo} className="grid grid-cols-[150px_minmax(0,1fr)_56px] max-md:grid-cols-[112px_minmax(0,1fr)_48px] items-center gap-3 text-sm">
          <span className="text-text-2">{e.rotulo}</span>
          <span className="h-2 overflow-hidden rounded-full bg-secondary" aria-hidden>
            <span className={cn('block h-full rounded-full', i === etapas.length - 1 ? 'bg-foreground' : 'bg-text-3')} style={{ width: `${(100 * e.valor) / max}%` }} />
          </span>
          <span className="vr-data text-right text-xs text-text-2">{e.valor}</span>
        </li>
      ))}
    </ol>
  );
}
