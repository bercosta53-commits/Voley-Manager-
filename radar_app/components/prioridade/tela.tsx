'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { ChevronDown, Link2, Search, SlidersHorizontal } from 'lucide-react';
import type { BaseCasca } from '@/lib/casca-dados';
import { CLASSES, DIMENSOES, REGRAS, ROTULO_CURTO, ROTULO_DIMENSAO, type Dimensao } from '@/lib/prioridade-config';
import type { SituacaoSweetSpot } from '@/lib/prioridade';
import { expandirLinhas, type LinhaTransporte } from '@/lib/prioridade-transporte';
import {
  ATALHOS_ROTULO, SEGMENTOS, SEM_FILTROS, SEM_SETOR, aplicarTudo, coberturaDe, faixa, filtrosEmTexto, sugestoes, temFiltro,
  type Atalho, type ColunaOrdem, type FiltrosPrioridade, type LinhaPrioridade, type Segmento,
} from '@/lib/prioridade-filtros';
import { AGRUPAMENTOS, agrupar, mudarOrdem, ordemEmTexto, ordenarMulti, type Agrupamento, type CriterioOrdem } from '@/lib/prioridade-visoes';
import { Casca } from '@/components/casca/casca';
import { MenuFiltro } from '@/components/contas/menu-filtro';
import { cn, plural } from '@/lib/utils';
import { Faixa } from './faixa';
import { Metodologia, SeloExperimental } from './metodologia';
import { ClasseExperimental, Comparacao, PainelConta, textoNota } from './painel';
import { AmbienteDecisao } from './ambiente';
import { LosangoMini } from './losango';
import { resumoDaLinha } from './resumo-linha';
import { DicaConta } from '@/components/ui/dica-conta';
import { CruzarDimensoes, MatrizSetorPrioridade, ResumoDoSetor } from './visoes';
import { dataCurta } from '@/lib/utils';

const SITUACOES: { id: SituacaoSweetSpot; rotulo: string }[] = [
  { id: 'sweet_spot', rotulo: 'No sweet spot (A1 ou A2)' },
  { id: 'candidata', rotulo: 'Candidata (1 a investigar)' },
  { id: 'fora_por_criterio', rotulo: 'Fora por critério' },
  { id: 'fora_por_falta_de_dados', rotulo: 'Fora por falta de dados' },
  { id: 'fora_por_classe', rotulo: 'Completa, fora do sweet spot' },
];
const PASSOS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

type Visao = 'ambiente' | 'lista' | 'matriz' | 'cruzar';
type ColunaOpcional = 'proximidade' | 'evidencia' | 'cobertura' | 'data';
const COLUNAS_OPCIONAIS: { id: ColunaOpcional; rotulo: string }[] = [
  { id: 'proximidade', rotulo: 'Sweet spot' },
  { id: 'evidencia', rotulo: 'Evidência principal' },
  { id: 'cobertura', rotulo: 'Cobertura' },
  { id: 'data', rotulo: 'Data da última avaliação' },
];
const COLUNAS_PADRAO: ColunaOpcional[] = ['proximidade', 'evidencia'];
const LOTE = 100;

interface EstadoUrl {
  f: FiltrosPrioridade;
  o: CriterioOrdem[];
  sel: string | null;
  cmp: string[];
  v: Visao;
  g: Agrupamento;
  cols: ColunaOpcional[];
  x: Dimensao;
  y: Dimensao;
  mo: 'a1' | 'candidata' | 'nome';
}
const INICIAL: EstadoUrl = { f: SEM_FILTROS, o: [{ col: 'inicial', desc: true }], sel: null, cmp: [], v: 'ambiente', g: 'nenhum', cols: COLUNAS_PADRAO, x: 'icp', y: 'sinais', mo: 'a1' };

function lerUrl(): EstadoUrl {
  const p = new URLSearchParams(location.search);
  let f = SEM_FILTROS;
  try {
    const bruto = p.get('f');
    if (bruto) f = { ...SEM_FILTROS, ...JSON.parse(bruto) };
  } catch {}
  f = { ...f, busca: p.get('q') ?? '' };
  const o = (p.get('o') ?? '')
    .split(',')
    .filter(Boolean)
    .map(x => {
      const [col, dir] = x.split(':');
      return { col: col as ColunaOrdem, desc: dir !== 'asc' };
    });
  const dims = (v: string | null, padrao: Dimensao) => (DIMENSOES.includes(v as Dimensao) ? (v as Dimensao) : padrao);
  return {
    ...INICIAL,
    f,
    o: o.length ? o : INICIAL.o,
    sel: p.get('c'),
    cmp: (p.get('cmp') ?? '').split(',').filter(Boolean).slice(0, 3),
    v: (['ambiente', 'lista', 'matriz', 'cruzar'].includes(p.get('v') ?? '') ? p.get('v') : 'ambiente') as Visao,
    g: (AGRUPAMENTOS.some(a => a.id === p.get('g')) ? p.get('g') : 'nenhum') as Agrupamento,
    cols: p.has('cols') ? ((p.get('cols') ?? '').split(',').filter(c => COLUNAS_OPCIONAIS.some(x => x.id === c)) as ColunaOpcional[]) : COLUNAS_PADRAO,
    x: dims(p.get('x'), 'icp'),
    y: dims(p.get('y'), 'sinais'),
    mo: (['a1', 'candidata', 'nome'].includes(p.get('mo') ?? '') ? p.get('mo') : 'a1') as EstadoUrl['mo'],
  };
}

function escreverUrl(e: EstadoUrl) {
  const p = new URLSearchParams();
  if (e.f.busca) p.set('q', e.f.busca);
  const { busca: _, ...resto } = e.f;
  if (temFiltro(e.f)) p.set('f', JSON.stringify(resto));
  if (e.o.some(c => c.col !== 'inicial')) p.set('o', e.o.map(c => `${c.col}:${c.desc ? 'desc' : 'asc'}`).join(','));
  if (e.sel) p.set('c', e.sel);
  if (e.cmp.length) p.set('cmp', e.cmp.join(','));
  if (e.v !== 'ambiente') p.set('v', e.v);
  if (e.g !== 'nenhum') p.set('g', e.g);
  if (e.cols.join() !== COLUNAS_PADRAO.join()) p.set('cols', e.cols.join(','));
  if (e.v === 'cruzar') (p.set('x', e.x), p.set('y', e.y));
  if (e.v === 'matriz' && e.mo !== 'a1') p.set('mo', e.mo);
  const q = p.toString();
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}

/** Indicador curto de uma dimensão na linha: número e rótulo acessível, nunca só cor. */
function Indicador({ l, d }: { l: LinhaPrioridade; d: Dimensao }) {
  const x = l.visao.dimensoes[d];
  const valida = x.nota !== null && x.entraNoCalculo;
  // cor com significado fixo: verde atinge o mínimo do sweet spot, laranja fica abaixo, cinza sem avaliação
  const minimo = REGRAS.A2.minimos[d];
  const atinge = valida && x.nota! >= minimo;
  const titulo = valida ? `${ROTULO_DIMENSAO[d]}: ${textoNota(x)} · ${atinge ? 'atinge' : `abaixo do`} mínimo do sweet spot (${minimo})` : `${ROTULO_DIMENSAO[d]}: sem avaliação`;
  return (
    <span className="flex flex-col items-center gap-0.5" aria-label={titulo} title={titulo}>
      <span className={cn('vr-data text-sm', valida ? 'font-semibold' : 'text-text-3')} style={valida ? { color: atinge ? 'var(--vr-ok)' : 'var(--vr-warm)' } : undefined}>
        {valida ? textoNota({ ...x, semAchados: false }) : '—'}
      </span>
      <span aria-hidden className="relative h-1 w-8 rounded-full bg-secondary">
        {valida && <span className="block h-full rounded-full" style={{ width: `${(x.nota! / 5) * 100}%`, background: atinge ? 'var(--vr-ok)' : 'var(--vr-warm)' }} />}
        <span className="absolute -top-0.5 -bottom-0.5 w-px bg-text-3" style={{ left: `${(minimo / 5) * 100}%` }} />
      </span>
    </span>
  );
}

function Proximidade({ l }: { l: LinhaPrioridade }) {
  const v = l.visao;
  if (v.situacaoSweetSpot === 'sweet_spot') return <span className="text-sm font-medium text-ok">No sweet spot{v.classeIntegrada === 'A1' ? ' (topo)' : ''}</span>;
  if (v.situacaoSweetSpot === 'candidata') return <span className="text-sm">{v.motivosClassificacao[0]}</span>;
  if (v.criteriosSweetAtendidos !== null) {
    // cinco marcas em vez de três linhas de texto; o que falta fica no título (passar o mouse) e no painel da conta
    const falta = v.motivosClassificacao.map(m => m.replace(/, falta .*/, '')).join(', ');
    return (
      <span className="flex items-center gap-2" title={falta ? `Falta: ${falta}` : undefined} aria-label={`Atende ${v.criteriosSweetAtendidos} de 5 critérios do sweet spot${falta ? `; falta ${falta}` : ''}`}>
        <span aria-hidden className="flex gap-0.5">
          {[0, 1, 2, 3, 4].map(i => (
            <span key={i} className={cn('h-2.5 w-2 rounded-[2px]', i < v.criteriosSweetAtendidos! ? 'bg-ok' : 'bg-secondary')} />
          ))}
        </span>
        <span className="vr-data text-xs text-text-2">{v.criteriosSweetAtendidos}/5</span>
      </span>
    );
  }
  return <span className="text-xs text-text-3">{v.motivosClassificacao.join(' · ')}</span>;
}

export function TelaPrioridade({ base, linhas: linhasServidor }: { base: BaseCasca; linhas: LinhaTransporte[] }) {
  const [estado, setEstado] = useState<EstadoUrl>(INICIAL);
  const [folha, setFolha] = useState(false);
  const [recolhidos, setRecolhidos] = useState<Set<string>>(new Set());
  // S-1: a lista sem agrupar desenha as primeiras linhas e mostra o resto sob pedido (com a contagem, nada some)
  const [limite, setLimite] = useState(LOTE);
  const [pronto, setPronto] = useState(false);
  const [sugerir, setSugerir] = useState(false);
  const [indice, setIndice] = useState(0);
  const [abrirMetodo, setAbrirMetodo] = useState(0);
  const [maisFiltros, setMaisFiltros] = useState(false);
  const campo = useRef<HTMLInputElement>(null);

  useEffect(() => {
    setEstado(lerUrl());
    setPronto(true);
  }, []);
  useEffect(() => {
    if (pronto) escreverUrl(estado);
  }, [estado, pronto]);
  useEffect(() => {
    const tecla = (e: KeyboardEvent) => {
      const alvo = e.target as HTMLElement;
      if (e.key === '/' && !/INPUT|TEXTAREA|SELECT/.test(alvo.tagName)) {
        e.preventDefault();
        campo.current?.focus();
      }
    };
    window.addEventListener('keydown', tecla);
    return () => window.removeEventListener('keydown', tecla);
  }, []);

  // no modo apresentação o Clima fica oculto; conta como faltante para a classe não revelar o valor (hoje já é nulo)
  // S-1: o servidor manda só as dimensões; a classe é recalculada aqui com as mesmas regras (lib/prioridade.ts)
  const linhas = useMemo(() => expandirLinhas(linhasServidor), [linhasServidor]);
  const { f, o } = estado;
  // filtros fora dos quatro visíveis que estão ligados: mantêm o painel aberto e aparecem na contagem
  const avancados = f.situacoes.length + f.coberturas.length + f.faltando.length + f.ufs.length + Object.values(f.notaMin).filter(Boolean).length;
  const mudar = (parte: Partial<FiltrosPrioridade>) => setEstado(e => ({ ...e, f: { ...e.f, ...parte } }));
  const { visiveis, semNotaNoFiltro, naBuscaFora } = useMemo(() => aplicarTudo(linhas, f), [linhas, f]);
  const ordenadas = useMemo(() => ordenarMulti(visiveis, o), [visiveis, o]);
  useEffect(() => setLimite(LOTE), [f, o]);
  const grupos = useMemo(() => (estado.g === 'nenhum' ? null : agrupar(ordenadas, estado.g)), [ordenadas, estado.g]);
  const col = (c: ColunaOpcional) => estado.cols.includes(c);
  const nFiltros = filtrosEmTexto(f) ? filtrosEmTexto(f).split(', E ').length : 0;
  const contagem = useMemo(() => faixa(linhas), [linhas]);
  const completas = linhas.filter(l => l.visao.cobertura === 4).length;
  const setores = useMemo(() => [...new Set(linhas.map(l => l.setor ?? SEM_SETOR))].sort((a, b) => a.localeCompare(b, 'pt-BR')), [linhas]);
  const sug = useMemo(() => sugestoes(linhas, f.busca), [linhas, f.busca]);
  const opcoesSug = [...sug.contas.map(l => ({ tipo: 'conta' as const, id: l.contaId, rotulo: l.nome })), ...sug.setores.map(s => ({ tipo: 'setor' as const, id: s.setor, rotulo: `${s.setor} (${s.n})` }))];
  const selecionada = linhas.find(l => l.contaId === estado.sel) ?? null;
  const comparadas = estado.cmp.map(id => linhas.find(l => l.contaId === id)).filter((l): l is LinhaPrioridade => !!l);
  const conta = (pred: (l: LinhaPrioridade) => boolean) => linhas.filter(pred).length;

  function escolher(op: (typeof opcoesSug)[number]) {
    if (op.tipo === 'conta') setEstado(e => ({ ...e, sel: op.id }));
    else setEstado(e => ({ ...e, f: { ...e.f, busca: '', setores: [...new Set([...e.f.setores, op.id])] } }));
    setSugerir(false);
  }
  function ordenarPor(c: ColunaOrdem, somar: boolean) {
    setEstado(e => ({ ...e, o: mudarOrdem(e.o, c, somar) }));
  }
  function alternarComparar(id: string) {
    setEstado(e => ({ ...e, cmp: e.cmp.includes(id) ? e.cmp.filter(x => x !== id) : e.cmp.length >= 3 ? e.cmp : [...e.cmp, id] }));
  }
  const alternarSegmento = (s: Segmento) => mudar({ segmentos: f.segmentos.includes(s) ? f.segmentos.filter(x => x !== s) : [...f.segmentos, s] });
  const textoFiltros = filtrosEmTexto(f);

  const Cabecalho = ({ col: c, children, className }: { col: ColunaOrdem; children: React.ReactNode; className?: string }) => {
    const i = o.findIndex(x => x.col === c);
    const crit = o[i];
    return (
      <th scope="col" aria-sort={i === 0 ? (crit!.desc ? 'descending' : 'ascending') : undefined} className={cn('px-3 py-2 font-medium', className)}>
        <button type="button" onClick={e => ordenarPor(c, e.shiftKey)} title="Clique ordena; Shift+clique soma um critério" className="hover:text-foreground">
          {children}
          {crit && (
            <span aria-hidden>
              {' '}
              {crit.desc ? '↓' : '↑'}
              {o.length > 1 && <sup>{i + 1}</sup>}
            </span>
          )}
        </button>
      </th>
    );
  };
  const nColunas = 4 + DIMENSOES.length + estado.cols.length;
  const linhaConta = (l: LinhaPrioridade) => {
    const v = l.visao;
    const naComparacao = estado.cmp.includes(l.contaId);
    const enfase = v.situacaoSweetSpot === 'sweet_spot' ? 'bg-ok/10' : v.situacaoSweetSpot === 'candidata' ? 'shadow-[inset_3px_0_0_var(--vr-ok)]' : '';
    const datas = DIMENSOES.map(d => v.dimensoes[d].dataReferencia).filter((x): x is string => !!x).sort();
    return (
      <tr key={l.contaId} className={cn('hover:bg-secondary/60', enfase, estado.sel === l.contaId && 'bg-secondary')}>
        <td className="px-3 py-2.5">
          <input
            type="checkbox"
            checked={naComparacao}
            disabled={!naComparacao && estado.cmp.length >= 3}
            onChange={() => alternarComparar(l.contaId)}
            aria-label={`Comparar ${l.nome}`}
            title={!naComparacao && estado.cmp.length >= 3 ? 'Já há três contas na comparação; tire uma para incluir outra' : undefined}
          />
        </td>
        <td className="px-3 py-2.5">
          <DicaConta resumo={resumoDaLinha(l)}>
            <button type="button" onClick={() => setEstado(e => ({ ...e, sel: l.contaId }))} className="text-left font-semibold hover:underline">
              {l.nome}
            </button>
          </DicaConta>
          <span className="block text-xs text-text-3">{l.setor ?? 'Sem setor'}</span>
        </td>
        <td className="px-1 py-1">
          <button type="button" onClick={() => setEstado(e => ({ ...e, sel: l.contaId }))} title="Abrir o radar completo da conta" className="block rounded-control hover:bg-secondary">
            <LosangoMini dims={v.dimensoes} />
          </button>
        </td>
        <td className="px-3 py-2.5">
          <ClasseExperimental v={v} />
        </td>
        {DIMENSOES.map(d => (
          <td key={d} className="px-3 py-2.5">
            <Indicador l={l} d={d} />
          </td>
        ))}
        {col('proximidade') && (
          <td className="max-w-[260px] px-3 py-2.5">
            <Proximidade l={l} />
          </td>
        )}
        {col('evidencia') && (
          <td className="max-w-[280px] px-3 py-2.5">
            <span className="line-clamp-2 text-sm text-text-2">{l.evidencia?.texto ?? <span className="text-text-3">Sem fato com fonte</span>}</span>
          </td>
        )}
        {col('cobertura') && (
          <td className="px-3 py-2.5 text-sm">
            {v.cobertura} de 4
            {coberturaDe(v) !== 'completa' && <span className="block text-xs text-text-3">falta {v.dimensoesFaltantes.map(d => ROTULO_CURTO[d]).join(', ')}</span>}
          </td>
        )}
        {col('data') && <td className="px-3 py-2.5 text-sm text-text-2">{datas.length ? dataCurta(datas[datas.length - 1]!) : <span className="text-text-3">—</span>}</td>}
      </tr>
    );
  };

  return (
    <Casca base={base}>
      <main className={cn('w-full max-w-[1440px] px-4 pt-2 pb-28 md:px-8 md:pt-8 md:pb-16', selecionada && 'md:pr-[464px]')}>
        <div className="mb-4 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h1 className="font-display text-2xl font-semibold tracking-tight">Prioridade de contas</h1>
            <p className="mt-1 flex flex-wrap items-center gap-2 text-sm text-text-3">
              <span>
                {ordenadas.length} de {plural(linhas.length, 'conta', 'contas')}
              </span>
              <SeloExperimental />
              <a
                href="#como-funciona"
                onClick={() => setAbrirMetodo(n => n + 1)}
                className="font-medium text-foreground underline decoration-border-strong underline-offset-4"
              >
                Como funciona
              </a>
              <Link href="/radar/proximidade" className="underline decoration-border-strong underline-offset-4">
                Radar de proximidade
              </Link>
            </p>
          </div>
          <label className="flex items-center gap-2 text-sm">
            <input type="checkbox" checked={f.coberturas.length === 1 && f.coberturas[0] === 'completa'} onChange={e => mudar({ coberturas: e.target.checked ? ['completa'] : [] })} />
            Somente avaliações completas
          </label>
        </div>

        <Metodologia abrirPedido={abrirMetodo} />
        <Faixa total={linhas.length} completas={completas} contagem={contagem} ativos={f.segmentos} onAlternar={alternarSegmento} />

        {/* busca: um campo, dois alvos (contas e setores) */}
        <div className="relative mb-3 max-w-xl">
          <Search aria-hidden className="pointer-events-none absolute top-1/2 left-3 size-4 -translate-y-1/2 text-text-3" strokeWidth={1.5} />
          <input
            ref={campo}
            type="search"
            role="combobox"
            aria-expanded={sugerir && opcoesSug.length > 0}
            aria-controls="sugestoes-prioridade"
            aria-label="Buscar empresa ou setor"
            placeholder="Buscar empresa ou setor (atalho /)"
            value={f.busca}
            onChange={e => {
              mudar({ busca: e.target.value });
              setSugerir(true);
              setIndice(0);
            }}
            onFocus={() => setSugerir(true)}
            onBlur={() => setTimeout(() => setSugerir(false), 150)}
            onKeyDown={e => {
              if (e.key === 'ArrowDown') (e.preventDefault(), setIndice(i => Math.min(i + 1, opcoesSug.length - 1)));
              else if (e.key === 'ArrowUp') (e.preventDefault(), setIndice(i => Math.max(i - 1, 0)));
              else if (e.key === 'Enter' && sugerir && opcoesSug[indice]) (e.preventDefault(), escolher(opcoesSug[indice]!));
              else if (e.key === 'Escape') setSugerir(false);
            }}
            className="h-10 w-full rounded-control border border-border bg-card pr-3 pl-9 text-sm focus-visible:border-border-strong"
          />
          {sugerir && opcoesSug.length > 0 && (
            <ul id="sugestoes-prioridade" role="listbox" className="absolute z-20 mt-1 w-full overflow-hidden rounded-control border border-border bg-card py-1 shadow-2">
              {(['conta', 'setor'] as const).map(tipo =>
                opcoesSug.some(op => op.tipo === tipo) ? (
                  <li key={tipo} role="presentation">
                    <p className="px-3 pt-1 text-xs font-semibold text-text-3">{tipo === 'conta' ? 'Contas' : 'Setores'}</p>
                    <ul role="group">
                      {opcoesSug.map((op, i) =>
                        op.tipo === tipo ? (
                          <li
                            key={op.tipo + op.id}
                            role="option"
                            aria-selected={i === indice}
                            onMouseDown={e => (e.preventDefault(), escolher(op))}
                            className={cn('cursor-pointer px-3 py-1.5 text-sm', i === indice && 'bg-secondary')}
                          >
                            {op.rotulo}
                          </li>
                        ) : null,
                      )}
                    </ul>
                  </li>
                ) : null,
              )}
            </ul>
          )}
        </div>

        <button
          type="button"
          onClick={() => setFolha(true)}
          className="mb-3 inline-flex h-10 items-center gap-1.5 rounded-control border border-border bg-card px-3 text-sm md:hidden"
        >
          <SlidersHorizontal className="size-4" strokeWidth={1.5} /> Filtros{nFiltros ? ` (${nFiltros})` : ''}
        </button>
        {/* atalhos de visão (experimentais) */}
        <div className="mb-3 flex flex-wrap items-center gap-1.5" role="group" aria-label="Atalhos de visão (experimentais)">
          {(Object.keys(ATALHOS_ROTULO) as Atalho[]).map(a => (
            <button
              key={a}
              type="button"
              aria-pressed={f.atalho === a}
              onClick={() => mudar({ atalho: f.atalho === a ? null : a })}
              className={cn(
                'h-8 rounded-chip border px-2.5 text-sm transition-colors max-md:h-10',
                f.atalho === a ? 'border-foreground bg-foreground text-background' : 'border-border bg-card text-text-2 hover:border-border-strong',
              )}
            >
              {ATALHOS_ROTULO[a]}
            </button>
          ))}
        </div>

        <div className={cn('mb-3 flex-wrap items-center gap-2', folha ? 'fixed inset-x-0 bottom-0 z-40 flex max-h-[80vh] overflow-y-auto rounded-t-overlay border-t border-border bg-background p-4 shadow-3' : 'hidden md:flex')} role={folha ? 'dialog' : undefined} aria-label={folha ? 'Filtros' : undefined}>
          <MenuFiltro rotulo="Prioridade integrada" opcoes={CLASSES.map(c => ({ id: c, rotulo: c, qtd: conta(l => l.visao.classeIntegrada === c) }))} valor={f.classes} onMudar={v => mudar({ classes: v })} />
          <MenuFiltro rotulo="Setor" opcoes={setores.map(s => ({ id: s, rotulo: s, qtd: conta(l => (l.setor ?? SEM_SETOR) === s) }))} valor={f.setores} onMudar={v => mudar({ setores: v })} />
          <MenuFiltro rotulo="Tier ICP" opcoes={['A', 'B', 'C'].map(t => ({ id: t, rotulo: `Tier ${t}`, qtd: conta(l => l.tier === t) })).filter(x => x.qtd)} valor={f.tiers} onMudar={v => mudar({ tiers: v })} />
          {/* o resto fica em "Mais filtros": quatro filtros visíveis bastam para a leitura do dia */}
          {!folha && (
            <button
              type="button"
              aria-expanded={maisFiltros || avancados > 0}
              onClick={() => setMaisFiltros(v => !v)}
              className="h-8 rounded-control border border-border bg-card px-2.5 text-sm text-text-2 hover:border-border-strong max-md:h-10"
            >
              {maisFiltros || avancados > 0 ? 'Menos filtros' : 'Mais filtros'}
              {avancados > 0 && <span className="vr-data ml-1 font-semibold text-foreground">({avancados})</span>}
            </button>
          )}
          {(folha || maisFiltros || avancados > 0) && (
            <>
          <MenuFiltro rotulo="Sweet spot" opcoes={SITUACOES.map(s => ({ ...s, qtd: conta(l => l.visao.situacaoSweetSpot === s.id) }))} valor={f.situacoes} onMudar={v => mudar({ situacoes: v })} />
          <MenuFiltro
            rotulo="Cobertura"
            opcoes={[
              { id: 'completa' as const, rotulo: 'Completas', qtd: conta(l => l.visao.cobertura === 4) },
              { id: '3' as const, rotulo: '3 de 4', qtd: conta(l => l.visao.cobertura === 3) },
              { id: '2-' as const, rotulo: '2 ou menos', qtd: conta(l => l.visao.cobertura <= 2) },
            ]}
            valor={f.coberturas}
            onMudar={v => mudar({ coberturas: v })}
          />
          <MenuFiltro rotulo="Falta" opcoes={DIMENSOES.map(d => ({ id: d, rotulo: ROTULO_DIMENSAO[d], qtd: conta(l => l.visao.dimensoesFaltantes.includes(d)) }))} valor={f.faltando} onMudar={v => mudar({ faltando: v })} />
          {DIMENSOES.map(d => (
            <label key={d} className="flex h-8 items-center gap-1 rounded-control border border-border bg-card px-2 text-sm text-text-2 max-md:h-10">
              {ROTULO_CURTO[d]} ≥
              <select
                value={f.notaMin[d] ?? 0}
                onChange={e => mudar({ notaMin: { ...f.notaMin, [d]: Number(e.target.value) || undefined } })}
                aria-label={`Nota mínima de ${ROTULO_DIMENSAO[d]}`}
                className="bg-transparent text-foreground"
              >
                <option value={0}>—</option>
                {PASSOS.map(p => (
                  <option key={p} value={p}>
                    {String(p).replace('.', ',')}
                  </option>
                ))}
              </select>
            </label>
          ))}
          <MenuFiltro
            rotulo="UF"
            opcoes={[...new Set(linhas.map(l => l.uf || 'Sem UF'))].sort().map(u => ({ id: u, rotulo: u, qtd: conta(l => (l.uf || 'Sem UF') === u) }))}
            valor={f.ufs}
            onMudar={v => mudar({ ufs: v })}
          />
            </>
          )}
          {folha && (
            <button type="button" onClick={() => setFolha(false)} className="mt-2 h-10 w-full rounded-control bg-foreground text-sm font-semibold text-background">
              Aplicar ({ordenadas.length} contas)
            </button>
          )}
        </div>

        {(temFiltro(f) || f.busca) && (
          <div className="mb-3 flex flex-wrap items-center gap-2 text-sm">
            {textoFiltros && <span className="text-text-2">Filtro: {textoFiltros}</span>}
            {semNotaNoFiltro > 0 && <span className="text-text-3">· {plural(semNotaNoFiltro, 'conta ficou de fora', 'contas ficaram de fora')} por não ter nota na dimensão filtrada</span>}
            <button type="button" onClick={() => setEstado(e => ({ ...e, f: SEM_FILTROS }))} className="font-medium underline decoration-border-strong underline-offset-4">
              Limpar tudo
            </button>
            <button type="button" onClick={() => navigator.clipboard?.writeText(location.href)} className="inline-flex items-center gap-1 text-text-2 underline decoration-border-strong underline-offset-4">
              <Link2 className="size-3.5" strokeWidth={1.5} /> Copiar link da visão
            </button>
          </div>
        )}

        <Comparacao linhas={comparadas} onTirar={alternarComparar} />
        <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
          <div role="tablist" aria-label="Visão" className="flex rounded-control border border-border bg-card p-0.5">
            {(
              [
                ['ambiente', 'Ambiente'],
                ['lista', 'Lista'],
                ['matriz', 'Setor × Prioridade'],
                ['cruzar', 'Cruzar duas dimensões'],
              ] as [Visao, string][]
            ).map(([id, rotulo]) => (
              <button
                key={id}
                type="button"
                role="tab"
                aria-selected={estado.v === id}
                onClick={() => setEstado(e => ({ ...e, v: id }))}
                className={cn('h-8 rounded-control px-3 text-sm max-md:h-10', estado.v === id ? 'bg-foreground font-semibold text-background' : 'text-text-2 hover:text-foreground')}
              >
                {rotulo}
              </button>
            ))}
          </div>
          {estado.v === 'lista' && (
            <div className="flex flex-wrap items-center gap-2 text-sm text-text-2">
              <label className="flex items-center gap-1.5">
                Agrupar por
                <select value={estado.g} onChange={e => setEstado(s => ({ ...s, g: e.target.value as Agrupamento }))} className="rounded-control border border-border bg-card px-1.5 py-1">
                  {AGRUPAMENTOS.map(a => (
                    <option key={a.id} value={a.id}>
                      {a.rotulo}
                    </option>
                  ))}
                </select>
              </label>
              <details className="relative">
                <summary className="cursor-pointer list-none rounded-control border border-border bg-card px-2 py-1">Colunas</summary>
                <div className="absolute right-0 z-20 mt-1 w-60 rounded-control border border-border bg-card p-2 shadow-2">
                  <p className="px-1 pb-1 text-xs text-text-3">Conta e as quatro dimensões ficam sempre.</p>
                  {COLUNAS_OPCIONAIS.map(c => (
                    <label key={c.id} className="flex items-center gap-2 px-1 py-1">
                      <input
                        type="checkbox"
                        checked={estado.cols.includes(c.id)}
                        onChange={() =>
                          setEstado(s => ({ ...s, cols: s.cols.includes(c.id) ? s.cols.filter(x => x !== c.id) : COLUNAS_OPCIONAIS.map(x => x.id).filter(x => x === c.id || s.cols.includes(x)) }))
                        }
                      />
                      {c.rotulo}
                    </label>
                  ))}
                </div>
              </details>
            </div>
          )}
        </div>
        {o.length > 1 && estado.v === 'lista' && <p className="mb-2 text-xs text-text-3">Ordem: {ordemEmTexto(o)}</p>}
        {f.setores.length === 1 && <ResumoDoSetor linhas={visiveis} setor={f.setores[0]!} />}
        {estado.v === 'ambiente' ? (
          <AmbienteDecisao linhas={visiveis} onSelecionar={id => setEstado(e => ({ ...e, sel: id }))} />
        ) : estado.v === 'matriz' ? (
          <MatrizSetorPrioridade
            linhas={visiveis}
            ordem={estado.mo}
            onOrdem={mo => setEstado(e => ({ ...e, mo }))}
            onCelula={(setor, seg) => setEstado(e => ({ ...e, v: 'lista', f: { ...e.f, setores: [setor], segmentos: seg ? [seg] : e.f.segmentos } }))}
          />
        ) : estado.v === 'cruzar' ? (
          <CruzarDimensoes
            linhas={visiveis}
            x={estado.x}
            y={estado.y}
            onEixos={(x, y) => setEstado(e => ({ ...e, x, y }))}
            onCelula={(fx, fy) => setEstado(e => ({ ...e, v: 'lista', f: { ...e.f, celula: { x: e.x, y: e.y, fx, fy } } }))}
          />
        ) : ordenadas.length === 0 ? (
          <div className="vr-card p-6 text-center text-sm">
            {f.busca ? (
              <>
                <p>
                  Nada com &quot;{f.busca}&quot; no recorte atual{naBuscaFora ? ` · ${naBuscaFora} fora dos filtros` : ''}.
                </p>
                <div className="mt-2 flex justify-center gap-3">
                  {naBuscaFora > 0 && (
                    <button type="button" onClick={() => setEstado(e => ({ ...e, f: { ...SEM_FILTROS, busca: e.f.busca } }))} className="font-medium underline underline-offset-4">
                      Ver fora dos filtros
                    </button>
                  )}
                  <button type="button" onClick={() => mudar({ busca: '' })} className="font-medium underline underline-offset-4">
                    Limpar busca
                  </button>
                </div>
              </>
            ) : (
              <p>Nenhuma conta com estes filtros.</p>
            )}
          </div>
        ) : (
          <>
          <p className="mb-2 flex flex-wrap items-center gap-x-4 gap-y-1 text-xs text-text-3" aria-hidden>
            <span className="font-medium text-text-2">Notas de 1 a 5:</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-ok" /> atinge o mínimo do sweet spot</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-1.5 w-4 rounded-full bg-warm" /> abaixo do mínimo</span>
            <span className="inline-flex items-center gap-1.5"><span className="h-2.5 w-px bg-text-3" /> marca do mínimo</span>
            <span>— sem avaliação</span>
          </p>
          <div className="vr-card overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <caption className="sr-only">Contas por prioridade integrada (experimental)</caption>
              <thead className="border-b border-border text-xs text-text-3">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2 font-medium">
                    <span className="sr-only">Comparar</span>
                  </th>
                  <Cabecalho col="nome">Conta</Cabecalho>
                  <th scope="col" className="px-1 py-2 font-medium">Radar</th>
                  <Cabecalho col="integrada">Prioridade integrada (experimental)</Cabecalho>
                  {DIMENSOES.map(d => (
                    <Cabecalho key={d} col={d} className="text-center">
                      {ROTULO_CURTO[d]}
                    </Cabecalho>
                  ))}
                  {col('proximidade') && <Cabecalho col="proximidade">Sweet spot</Cabecalho>}
                  {col('evidencia') && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      Evidência principal
                    </th>
                  )}
                  {col('cobertura') && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      Cobertura
                    </th>
                  )}
                  {col('data') && (
                    <th scope="col" className="px-3 py-2 font-medium">
                      Última avaliação
                    </th>
                  )}
                </tr>
              </thead>
              {grupos ? (
                grupos.map(g => {
                  const fechado = recolhidos.has(g.chave);
                  return (
                    <tbody key={g.chave} className="divide-y divide-border border-b border-border">
                      <tr className="bg-secondary/50">
                        <th scope="rowgroup" colSpan={nColunas} className="px-3 py-2 text-left">
                          <button
                            type="button"
                            aria-expanded={!fechado}
                            onClick={() => setRecolhidos(s => (s.has(g.chave) ? new Set([...s].filter(x => x !== g.chave)) : new Set([...s, g.chave])))}
                            className="flex w-full items-center gap-3"
                          >
                            <ChevronDown className={cn('size-4 text-text-3 transition-transform', fechado && '-rotate-90')} strokeWidth={1.5} />
                            <span className="font-semibold">{g.rotulo}</span>
                            <span className="text-xs font-normal text-text-3">{g.linhas.length} contas</span>
                            <span aria-hidden className="ml-auto flex h-2 w-40 overflow-hidden rounded-full bg-background">
                              {SEGMENTOS.map(s =>
                                g.distribuicao[s.id] ? (
                                  <span
                                    key={s.id}
                                    style={{
                                      flexGrow: g.distribuicao[s.id],
                                      background: 'var(--vr-ok)',
                                      opacity: { a1: 1, A2: 0.75, B1: 0.55, B2: 0.35, C: 0.2, sem_metrica: 0.06 }[s.id],
                                    }}
                                  />
                                ) : null,
                              )}
                            </span>
                            <span className="sr-only">
                              Distribuição: {SEGMENTOS.filter(s => g.distribuicao[s.id]).map(s => `${g.distribuicao[s.id]} ${s.rotulo}`).join(', ')}
                            </span>
                          </button>
                        </th>
                      </tr>
                      {!fechado && g.linhas.map(linhaConta)}
                    </tbody>
                  );
                })
              ) : (
                <tbody className="divide-y divide-border">{ordenadas.slice(0, limite).map(linhaConta)}</tbody>
              )}
            </table>
            {!grupos && ordenadas.length > limite && (
              <div className="flex flex-wrap items-center justify-center gap-3 border-t border-border px-3 py-3 text-sm">
                <span className="text-text-3">
                  Mostrando {limite} de {ordenadas.length}
                </span>
                <button type="button" onClick={() => setLimite(l => l + LOTE)} className="font-semibold underline decoration-border-strong underline-offset-4">
                  Mostrar mais {Math.min(LOTE, ordenadas.length - limite)}
                </button>
                <button type="button" onClick={() => setLimite(ordenadas.length)} className="text-text-2 underline decoration-border-strong underline-offset-4">
                  Mostrar todas
                </button>
              </div>
            )}
            {estado.g === 'faltante' && <p className="px-3 py-2 text-xs text-text-3">Uma conta com duas dimensões faltando aparece nos dois grupos.</p>}
          </div>
          </>
        )}
        {estado.cmp.length >= 3 && <p className="mt-2 text-xs text-text-3">Já há três contas na comparação. Tire uma para incluir outra.</p>}
      </main>
      {selecionada && <PainelConta linha={selecionada} onFechar={() => setEstado(e => ({ ...e, sel: null }))} />}
    </Casca>
  );
}
