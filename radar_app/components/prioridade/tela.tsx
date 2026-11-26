'use client';

import Link from 'next/link';
import { useEffect, useMemo, useRef, useState } from 'react';
import { Link2, Search } from 'lucide-react';
import type { Base } from '@/lib/tipos';
import { CLASSES, DIMENSOES, ROTULO_CURTO, ROTULO_DIMENSAO, type Dimensao } from '@/lib/prioridade-config';
import { visaoIntegrada, type SituacaoSweetSpot } from '@/lib/prioridade';
import {
  ATALHOS_ROTULO, SEM_FILTROS, SEM_SETOR, aplicarTudo, faixa, filtrosEmTexto, ordenar, sugestoes, temFiltro,
  type Atalho, type ColunaOrdem, type FiltrosPrioridade, type LinhaPrioridade, type Segmento,
} from '@/lib/prioridade-filtros';
import { Casca } from '@/components/casca/casca';
import { MenuFiltro } from '@/components/contas/menu-filtro';
import { useApresentacao } from '@/components/ui/use-apresentacao';
import { cn, plural } from '@/lib/utils';
import { Faixa } from './faixa';
import { Metodologia, SeloExperimental } from './metodologia';
import { ClasseExperimental, Comparacao, PainelConta, textoNota } from './painel';

const SITUACOES: { id: SituacaoSweetSpot; rotulo: string }[] = [
  { id: 'a1', rotulo: 'A1 (sweet spot)' },
  { id: 'candidata', rotulo: 'Candidata (1 a investigar)' },
  { id: 'fora_por_criterio', rotulo: 'Fora por critério' },
  { id: 'fora_por_falta_de_dados', rotulo: 'Fora por falta de dados' },
  { id: 'fora_por_classe', rotulo: 'Completa, fora de A1' },
];
const PASSOS = [1, 1.5, 2, 2.5, 3, 3.5, 4, 4.5, 5];

interface EstadoUrl {
  f: FiltrosPrioridade;
  o: { col: ColunaOrdem; desc: boolean };
  sel: string | null;
  cmp: string[];
}

function lerUrl(): EstadoUrl {
  const p = new URLSearchParams(location.search);
  let f = SEM_FILTROS;
  try {
    const bruto = p.get('f');
    if (bruto) f = { ...SEM_FILTROS, ...JSON.parse(bruto) };
  } catch {}
  f = { ...f, busca: p.get('q') ?? '' };
  const [col, dir] = (p.get('o') ?? 'inicial').split(':');
  return { f, o: { col: (col as ColunaOrdem) || 'inicial', desc: dir !== 'asc' }, sel: p.get('c'), cmp: (p.get('cmp') ?? '').split(',').filter(Boolean).slice(0, 3) };
}

function escreverUrl(e: EstadoUrl) {
  const p = new URLSearchParams();
  if (e.f.busca) p.set('q', e.f.busca);
  const { busca: _, ...resto } = e.f;
  if (temFiltro(e.f)) p.set('f', JSON.stringify(resto));
  if (e.o.col !== 'inicial') p.set('o', `${e.o.col}:${e.o.desc ? 'desc' : 'asc'}`);
  if (e.sel) p.set('c', e.sel);
  if (e.cmp.length) p.set('cmp', e.cmp.join(','));
  const q = p.toString();
  history.replaceState(null, '', q ? `?${q}` : location.pathname);
}

/** Indicador curto de uma dimensão na linha: número e rótulo acessível, nunca só cor. */
function Indicador({ l, d }: { l: LinhaPrioridade; d: Dimensao }) {
  const x = l.visao.dimensoes[d];
  const valida = x.nota !== null && x.entraNoCalculo;
  return (
    <span className="flex flex-col items-center gap-0.5" aria-label={`${ROTULO_DIMENSAO[d]}: ${textoNota(x)}`}>
      <span className={cn('vr-data text-sm', valida ? 'font-semibold' : 'text-text-3')}>{valida ? textoNota({ ...x, semAchados: false }) : '—'}</span>
      <span aria-hidden className="h-1 w-8 overflow-hidden rounded-full bg-secondary">
        {valida && <span className="block h-full bg-ok" style={{ width: `${(x.nota! / 5) * 100}%`, opacity: 0.35 + (0.65 * x.nota!) / 5 }} />}
      </span>
    </span>
  );
}

function Proximidade({ l }: { l: LinhaPrioridade }) {
  const v = l.visao;
  if (v.situacaoSweetSpot === 'a1') return <span className="text-sm font-medium text-ok">No sweet spot</span>;
  if (v.situacaoSweetSpot === 'candidata') return <span className="text-sm">{v.motivosClassificacao[0]}</span>;
  if (v.criteriosA1Atendidos !== null)
    return (
      <span className="text-sm">
        Atende {v.criteriosA1Atendidos} de 5 critérios de A1
        {v.motivosClassificacao[0] && <span className="block text-xs text-text-3">falta {v.motivosClassificacao.map(m => m.replace(/, falta .*/, '')).join(', ')}</span>}
      </span>
    );
  return <span className="text-xs text-text-3">{v.motivosClassificacao.join(' · ')}</span>;
}

export function TelaPrioridade({ base, linhas: linhasServidor }: { base: Base; linhas: LinhaPrioridade[] }) {
  const apresentacao = useApresentacao();
  const [estado, setEstado] = useState<EstadoUrl>({ f: SEM_FILTROS, o: { col: 'inicial', desc: true }, sel: null, cmp: [] });
  const [pronto, setPronto] = useState(false);
  const [sugerir, setSugerir] = useState(false);
  const [indice, setIndice] = useState(0);
  const [abrirMetodo, setAbrirMetodo] = useState(0);
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
  const linhas = useMemo(
    () => (apresentacao ? linhasServidor.map(l => ({ ...l, visao: visaoIntegrada(l.contaId, l.visao.dimensoes, { ocultas: ['clima'] }) })) : linhasServidor),
    [linhasServidor, apresentacao],
  );
  const { f, o } = estado;
  const mudar = (parte: Partial<FiltrosPrioridade>) => setEstado(e => ({ ...e, f: { ...e.f, ...parte } }));
  const { visiveis, semNotaNoFiltro, naBuscaFora } = useMemo(() => aplicarTudo(linhas, f), [linhas, f]);
  const ordenadas = useMemo(() => ordenar(visiveis, o.col, o.desc), [visiveis, o]);
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
  function ordenarPor(col: ColunaOrdem) {
    setEstado(e => ({ ...e, o: e.o.col === col ? { col, desc: !e.o.desc } : { col, desc: col !== 'nome' } }));
  }
  function alternarComparar(id: string) {
    setEstado(e => ({ ...e, cmp: e.cmp.includes(id) ? e.cmp.filter(x => x !== id) : e.cmp.length >= 3 ? e.cmp : [...e.cmp, id] }));
  }
  const alternarSegmento = (s: Segmento) => mudar({ segmentos: f.segmentos.includes(s) ? f.segmentos.filter(x => x !== s) : [...f.segmentos, s] });
  const textoFiltros = filtrosEmTexto(f);

  const Cabecalho = ({ col, children, className }: { col: ColunaOrdem; children: React.ReactNode; className?: string }) => (
    <th scope="col" aria-sort={o.col === col ? (o.desc ? 'descending' : 'ascending') : undefined} className={cn('px-3 py-2 font-medium', className)}>
      <button type="button" onClick={() => ordenarPor(col)} className="hover:text-foreground">
        {children}
        {o.col === col && <span aria-hidden> {o.desc ? '↓' : '↑'}</span>}
      </button>
    </th>
  );

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

        <div className="mb-3 flex flex-wrap items-center gap-2">
          <MenuFiltro rotulo="Prioridade integrada" opcoes={CLASSES.map(c => ({ id: c, rotulo: c, qtd: conta(l => l.visao.classeIntegrada === c) }))} valor={f.classes} onMudar={v => mudar({ classes: v })} />
          <MenuFiltro rotulo="Sweet spot" opcoes={SITUACOES.map(s => ({ ...s, qtd: conta(l => l.visao.situacaoSweetSpot === s.id) }))} valor={f.situacoes} onMudar={v => mudar({ situacoes: v })} />
          <MenuFiltro rotulo="Setor" opcoes={setores.map(s => ({ id: s, rotulo: s, qtd: conta(l => (l.setor ?? SEM_SETOR) === s) }))} valor={f.setores} onMudar={v => mudar({ setores: v })} />
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
          <span className="mx-1 h-5 w-px bg-border" aria-hidden />
          <span className="text-xs text-text-3">Regras oficiais:</span>
          <MenuFiltro rotulo="Tier ICP" opcoes={['A', 'B', 'C'].map(t => ({ id: t, rotulo: `Tier ${t}`, qtd: conta(l => l.tier === t) })).filter(x => x.qtd)} valor={f.tiers} onMudar={v => mudar({ tiers: v })} />
          <MenuFiltro
            rotulo="UF"
            opcoes={[...new Set(linhas.map(l => l.uf || 'Sem UF'))].sort().map(u => ({ id: u, rotulo: u, qtd: conta(l => (l.uf || 'Sem UF') === u) }))}
            valor={f.ufs}
            onMudar={v => mudar({ ufs: v })}
          />
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

        {ordenadas.length === 0 ? (
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
          <div className="vr-card overflow-x-auto">
            <table className="w-full min-w-[920px] text-left text-sm">
              <caption className="sr-only">Contas por prioridade integrada (experimental)</caption>
              <thead className="border-b border-border text-xs text-text-3">
                <tr>
                  <th scope="col" className="w-10 px-3 py-2 font-medium">
                    <span className="sr-only">Comparar</span>
                  </th>
                  <Cabecalho col="nome">Conta</Cabecalho>
                  <Cabecalho col="integrada">Prioridade integrada (experimental)</Cabecalho>
                  {DIMENSOES.map(d => (
                    <Cabecalho key={d} col={d} className="text-center">
                      {ROTULO_CURTO[d]}
                    </Cabecalho>
                  ))}
                  <Cabecalho col="proximidade">Proximidade do sweet spot</Cabecalho>
                  <th scope="col" className="px-3 py-2 font-medium">
                    Evidência principal
                  </th>
                </tr>
              </thead>
              <tbody className="divide-y divide-border">
                {ordenadas.map(l => {
                  const v = l.visao;
                  const naComparacao = estado.cmp.includes(l.contaId);
                  const enfase =
                    v.classeIntegrada === 'A1' ? 'bg-ok/10' : v.situacaoSweetSpot === 'candidata' ? 'shadow-[inset_3px_0_0_var(--vr-ok)]' : '';
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
                        <button type="button" onClick={() => setEstado(e => ({ ...e, sel: l.contaId }))} className="text-left font-semibold hover:underline">
                          {l.nome}
                        </button>
                        <span className="block text-xs text-text-3">{l.setor ?? 'Sem setor'}</span>
                      </td>
                      <td className="px-3 py-2.5">
                        <ClasseExperimental v={v} />
                      </td>
                      {DIMENSOES.map(d => (
                        <td key={d} className="px-3 py-2.5">
                          <Indicador l={l} d={d} />
                        </td>
                      ))}
                      <td className="max-w-[260px] px-3 py-2.5">
                        <Proximidade l={l} />
                      </td>
                      <td className="max-w-[280px] px-3 py-2.5">
                        <span className="line-clamp-2 text-sm text-text-2">{l.evidencia?.texto ?? <span className="text-text-3">Sem fato com fonte</span>}</span>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
        {estado.cmp.length >= 3 && <p className="mt-2 text-xs text-text-3">Já há três contas na comparação. Tire uma para incluir outra.</p>}
      </main>
      {selecionada && <PainelConta linha={selecionada} onFechar={() => setEstado(e => ({ ...e, sel: null }))} />}
    </Casca>
  );
}
