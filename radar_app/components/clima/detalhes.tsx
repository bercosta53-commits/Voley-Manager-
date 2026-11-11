'use client';

import type { Clima, Vertical } from '@/lib/clima';
import { COR_CLIMA, FUNDO_CLIMA, ICONE_CLIMA, estadoNaSemana, fmtClima } from '@/lib/clima';
import { cn } from '@/lib/utils';

/** Botões de alternância (segmentado). */
function Alternar<T extends string | number>({ opcoes, valor, onMudar, rotulo }: { opcoes: [T, string][]; valor: T; onMudar: (v: T) => void; rotulo: string }) {
  return (
    <div role="group" aria-label={rotulo} className="flex rounded-control bg-[var(--vr-bg)] p-0.5">
      {opcoes.map(([v, r]) => (
        <button
          key={String(v)}
          type="button"
          aria-pressed={valor === v}
          onClick={() => onMudar(v)}
          className={cn('h-8 rounded-chip px-3 text-xs font-semibold', valor === v ? 'bg-[var(--vr-surface-3)] text-foreground' : 'text-text-3 hover:text-foreground')}
        >
          {r}
        </button>
      ))}
    </div>
  );
}

function Cabecalho({ id, titulo, texto, children }: { id: string; titulo: string; texto: string; children?: React.ReactNode }) {
  return (
    <div className="flex flex-wrap items-start justify-between gap-3">
      <div>
        <h2 id={id} className="font-display text-xl font-semibold">
          {titulo}
        </h2>
        <p className="mt-0.5 text-sm text-text-3">{texto}</p>
      </div>
      {children}
    </div>
  );
}

/** Mapa de calor: contribuição de cada bloco macro, do driver setorial e das notícias (ou a sensibilidade). */
export function MapaCalor({ clima, sel, modo, onModo, onSel }: { clima: Clima; sel: string; modo: 'contrib' | 'sens'; onModo: (m: 'contrib' | 'sens') => void; onSel: (id: string) => void }) {
  const { blocos, pesos } = clima.dados;
  const colunas = [...blocos, 'Setorial', 'Notícias'];
  const celula = (val: number, titulo: string, escala: number) => {
    const a = Math.min(1, Math.abs(val) / escala);
    const vazio = Math.abs(val) < 0.005;
    return {
      v: val === 0 ? '0' : fmtClima(val),
      fundo: vazio ? 'var(--vr-surface-2)' : `color-mix(in srgb, ${val < 0 ? 'var(--vr-risk)' : 'var(--vr-ok)'} ${Math.round(10 + a * 62)}%, var(--vr-surface))`,
      forte: a > 0.6,
      titulo,
    };
  };
  const linhas = [...clima.verticais].sort((a, b) => b.S - a.S).map(v => {
    const cels = colunas.map((h, i) => {
      if (i < blocos.length)
        return modo === 'contrib'
          ? celula(pesos.macro * v.contrib[i]! * (v.id === 'GEN' ? 2.5 : 1), `${v.nome} · ${h}`, 0.08)
          : celula(v.sens[i]!, `${v.nome} · sensibilidade a ${h}`, 1);
      if (i === blocos.length) return modo === 'contrib' ? celula(v.id === 'GEN' ? 0 : pesos.setorial * v.setorial, `${v.nome} · driver setorial`, 0.3) : celula(v.id === 'GEN' ? 0 : 1, 'peso setorial', 1);
      return modo === 'contrib' ? celula(v.id === 'GEN' ? 0 : pesos.noticias * v.noticias, `${v.nome} · notícias`, 0.1) : celula(v.id === 'GEN' ? 0 : 0.33, 'peso notícias', 1);
    });
    return { v, cels };
  });
  return (
    <section aria-labelledby="calor-t" className="vr-card flex flex-col gap-3 p-5">
      <Cabecalho id="calor-t" titulo="De onde vem o clima de cada vertical" texto="Contribuição de cada bloco macro, do driver setorial e das notícias. Vermelho puxa para baixo, verde para cima.">
        <Alternar rotulo="Modo do mapa de calor" opcoes={[['contrib', 'Contribuição'], ['sens', 'Sensibilidade']]} valor={modo} onMudar={onModo} />
      </Cabecalho>
      <div className="overflow-x-auto">
        <div className="grid min-w-[900px] gap-[3px] text-xs" style={{ gridTemplateColumns: `170px repeat(${colunas.length}, minmax(0, 1fr)) 80px` }}>
          <div />
          {colunas.map(h => (
            <div key={h} className="px-1 py-1.5 text-center font-semibold text-text-3">
              {h}
            </div>
          ))}
          <div className="px-1 py-1.5 text-center font-semibold text-text-3">S</div>
          {linhas.map(({ v, cels }) => (
            <Linha key={v.id} v={v} cels={cels} sel={sel === v.id} onSel={onSel} />
          ))}
        </div>
      </div>
    </section>
  );
}

function Linha({ v, cels, sel, onSel }: { v: Vertical; cels: { v: string; fundo: string; forte: boolean; titulo: string }[]; sel: boolean; onSel: (id: string) => void }) {
  return (
    <>
      <button
        type="button"
        onClick={() => onSel(v.id)}
        className={cn('flex h-[30px] items-center gap-2 rounded-[3px] px-2 text-left text-xs font-semibold', sel ? 'bg-acid-soft text-foreground' : 'bg-[var(--vr-surface-2)]')}
      >
        <span className="size-2 shrink-0 rounded-full" style={{ background: COR_CLIMA[v.estado] }} />
        {v.nome}
      </button>
      {cels.map((c, i) => (
        <div key={i} title={c.titulo} className={cn('vr-data flex h-[30px] items-center justify-center rounded-[3px] text-[11px]', c.forte ? 'font-semibold text-white' : 'text-foreground')} style={{ background: c.fundo }}>
          {c.v}
        </div>
      ))}
      <div className="vr-data flex h-[30px] items-center justify-center rounded-[3px] bg-[var(--vr-surface-2)] text-xs font-semibold" style={{ color: COR_CLIMA[v.estado] }}>
        {fmtClima(v.S)}
      </div>
    </>
  );
}

/** Linha do tempo: uma faixa por vertical, uma célula por semana; as linhas marcam as decisões do Copom. */
export function LinhaTempoClima({ clima, periodo, onPeriodo }: { clima: Clima; periodo: number; onPeriodo: (p: number) => void }) {
  const { limiares, marcos } = clima.dados;
  const P = periodo;
  const x0 = 170;
  const largura = 1110;
  const cw = largura / P;
  const linhas = [...clima.verticais].sort((a, b) => b.S - a.S);
  const altura = 26 + linhas.length * 22 + 8;
  const xSemana = (w: number) => x0 + (P - 1 - w) * cw + cw / 2;
  return (
    <section aria-labelledby="linha-t" className="vr-card flex flex-col gap-3 p-5">
      <Cabecalho id="linha-t" titulo="Linha do tempo de estados" texto="Uma faixa por vertical, uma célula por semana. As linhas marcam as decisões do Copom.">
        <Alternar rotulo="Período" opcoes={[[13, '3 meses'], [26, '6 meses'], [52, '12 meses']]} valor={P} onMudar={onPeriodo} />
      </Cabecalho>
      <div className="overflow-x-auto">
        <svg viewBox={`0 0 1290 ${altura}`} className="w-full min-w-[900px]" role="img" aria-label="Linha do tempo de estados de clima por vertical">
          {marcos
            .filter(m => m.semanasAtras < P)
            .map(m => (
              <g key={m.rotulo}>
                <line x1={xSemana(m.semanasAtras)} y1={18} x2={xSemana(m.semanasAtras)} y2={26 + linhas.length * 22} stroke="var(--vr-cool)" strokeOpacity={0.7} strokeDasharray="3 3" />
                <text x={xSemana(m.semanasAtras)} y={12} textAnchor="middle" className="vr-data text-[11px]" fill="var(--vr-cool)">
                  {m.rotulo}
                </text>
              </g>
            ))}
          {linhas.map((v, ri) => {
            const y = 26 + ri * 22;
            return (
              <g key={v.id}>
                <text x={0} y={y + 12} className="fill-text-2 text-[12px]">
                  {v.nome}
                </text>
                {v.serie(P).map((x, i) => (
                  <rect key={i} x={x0 + i * cw} y={y} width={Math.max(2, cw - 2)} height={16} rx={2} fill={COR_CLIMA[estadoNaSemana(x, v, P - 1 - i, limiares)]} opacity={0.85} />
                ))}
              </g>
            );
          })}
        </svg>
      </div>
    </section>
  );
}

type Chave = 'nome' | 'estado' | 'S' | 'delta30' | 'contas' | 'contraMare';
const ORDEM_ESTADO = ['Bom', 'Neutro', 'Instável', 'Ruim'];

/** Relatório por vertical, ordenável pelo cabeçalho. */
export function TabelaVerticais({
  clima,
  sel,
  ordem,
  onOrdem,
  onSel,
}: {
  clima: Clima;
  sel: string;
  ordem: { chave: Chave; dir: 1 | -1 };
  onOrdem: (o: { chave: Chave; dir: 1 | -1 }) => void;
  onSel: (id: string) => void;
}) {
  const chaves: Record<Chave, (v: Vertical) => string | number> = {
    nome: v => v.nome,
    estado: v => ORDEM_ESTADO.indexOf(v.estado),
    S: v => -v.S,
    delta30: v => -v.delta30,
    contas: v => -v.contas,
    contraMare: v => -v.contraMare,
  };
  const f = chaves[ordem.chave];
  const linhas = [...clima.verticais].sort((a, b) => {
    const A = f(a);
    const B = f(b);
    return (A > B ? 1 : A < B ? -1 : 0) * ordem.dir;
  });
  const cols: [Chave | null, string, 'left' | 'right'][] = [
    ['nome', 'Vertical', 'left'],
    ['estado', 'Clima', 'left'],
    ['S', 'Nível S', 'right'],
    ['delta30', 'Δ 30d', 'right'],
    [null, 'Últimas 26 semanas', 'left'],
    [null, 'Por quê', 'left'],
    ['contas', 'Contas', 'right'],
    ['contraMare', 'Contra a maré', 'right'],
    [null, 'Jogada', 'left'],
  ];
  return (
    <section aria-labelledby="tab-t" className="vr-card flex flex-col gap-3 p-5">
      <Cabecalho id="tab-t" titulo="Relatório por vertical" texto='Clique no cabeçalho para ordenar. "Contra a maré" = contas com fato de crescimento em vertical Ruim ou Instável.' />
      <div className="overflow-x-auto">
        <table className="w-full min-w-[980px] border-collapse text-sm">
          <thead>
            <tr>
              {cols.map(([k, r, al]) => (
                <th key={r} scope="col" className="border-b border-border-strong p-0" style={{ textAlign: al }}>
                  <button
                    type="button"
                    disabled={!k}
                    onClick={() => k && onOrdem({ chave: k, dir: ordem.chave === k ? (-ordem.dir as 1 | -1) : 1 })}
                    className={cn('w-full px-2 py-2.5 text-xs font-bold', ordem.chave === k ? 'text-foreground' : 'text-text-3', k && 'cursor-pointer hover:text-foreground')}
                    style={{ textAlign: al }}
                  >
                    {r} {ordem.chave === k ? (ordem.dir === 1 ? '↓' : '↑') : ''}
                  </button>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {linhas.map(v => {
              const ss = v.serie(26);
              const sp = ss.map((x, i) => `${i ? 'L' : 'M'}${((i * 120) / 25).toFixed(1)} ${(14 - x * 20).toFixed(1)}`).join(' ');
              return (
                <tr key={v.id} className={cn('border-b border-border', sel === v.id && 'bg-acid-soft')}>
                  <td className="px-2 py-2.5">
                    <button type="button" onClick={() => onSel(v.id)} className="font-semibold hover:underline">
                      {v.nome}
                    </button>
                  </td>
                  <td className="px-2 py-2.5">
                    <span className="rounded-chip px-2 py-0.5 text-xs font-bold whitespace-nowrap" style={{ background: FUNDO_CLIMA[v.estado], color: COR_CLIMA[v.estado] }}>
                      {ICONE_CLIMA[v.estado]} {v.estado}
                    </span>
                  </td>
                  <td className="vr-data px-2 py-2.5 text-right">{fmtClima(v.S)}</td>
                  <td className="vr-data px-2 py-2.5 text-right" style={{ color: v.delta30 >= 0 ? 'var(--vr-ok)' : 'var(--vr-risk)' }}>
                    {fmtClima(v.delta30)}
                  </td>
                  <td className="px-2 py-1.5">
                    <svg viewBox="0 0 120 28" width={120} height={28} aria-hidden>
                      <line x1={0} y1={14} x2={120} y2={14} stroke="var(--vr-border)" />
                      <path d={sp} fill="none" stroke={COR_CLIMA[v.estado]} strokeWidth={1.75} />
                    </svg>
                  </td>
                  <td className="max-w-[320px] px-2 py-2.5 text-text-2">{v.porque}</td>
                  <td className="vr-data px-2 py-2.5 text-right">{v.contas}</td>
                  <td className={cn('vr-data px-2 py-2.5 text-right', v.contraMare > 0 ? 'font-semibold text-foreground' : 'text-text-3')}>{v.contraMare}</td>
                  <td className="px-2 py-2.5 font-semibold whitespace-nowrap">{v.jogada}</td>
                </tr>
              );
            })}
          </tbody>
        </table>
      </div>
    </section>
  );
}

export type { Chave };
