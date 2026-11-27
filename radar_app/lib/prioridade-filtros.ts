import { normalizar } from './contas';
import { ATALHOS, CLASSES, DIMENSOES, ROTULO_CURTO, type Classe, type Dimensao } from './prioridade-config';
import type { SituacaoSweetSpot, VisaoIntegradaConta } from './prioridade';

/**
 * Busca, filtros, faixa "do ambiente ao sweet spot" e ordenação da tela Prioridade de contas. Funções puras;
 * testes em scripts/tests/prioridade-filtros.test.mjs. Dentro de um grupo vale OU; entre grupos vale E.
 */

export interface LinhaPrioridade {
  contaId: string;
  nome: string;
  /** outros nomes que o payload já tem (razão social), para a busca */
  outrosNomes: string[];
  setor: string | null;
  uf: string;
  tier: string;
  evidencia: { texto: string; fonte: string | null; url: string | null; data: string | null } | null;
  /** ação oficial (VSCS × ICP); regras oficiais, separadas das classes experimentais */
  acaoOficial: string | null;
  acaoDaMatriz: boolean;
  visao: VisaoIntegradaConta;
}

/** Segmentos da faixa: a classe (com 4 ou 3 dimensões, 27/11) ou sem métrica (2 ou mais faltando). */
export type Segmento = 'a1' | 'A2' | 'B1' | 'B2' | 'C' | 'sem_metrica';
export const SEGMENTOS: { id: Segmento; rotulo: string; grupo: string }[] = [
  { id: 'a1', rotulo: 'A1', grupo: 'Sweet spot' },
  { id: 'A2', rotulo: 'A2', grupo: 'Sweet spot' },
  { id: 'B1', rotulo: 'B1', grupo: 'Aproximadas' },
  { id: 'B2', rotulo: 'B2', grupo: 'Enfraquece' },
  { id: 'C', rotulo: 'C', grupo: 'Enfraquece' },
  { id: 'sem_metrica', rotulo: '2+ faltando', grupo: 'Sem métrica' },
];

export function segmentoDe(v: VisaoIntegradaConta): Segmento {
  if (v.classeIntegrada) return v.classeIntegrada === 'A1' ? 'a1' : v.classeIntegrada;
  return 'sem_metrica';
}

export type Cobertura = 'completa' | '3' | '2-';
export const coberturaDe = (v: VisaoIntegradaConta): Cobertura => (v.cobertura === 4 ? 'completa' : v.cobertura === 3 ? '3' : '2-');

export type Atalho = 'sweet' | 'investigar' | 'perto' | 'encaixe_timing_fraco' | 'timing_forte_encaixe_duvidoso';
export const ATALHOS_ROTULO: Record<Atalho, string> = {
  sweet: 'Sweet spot',
  investigar: 'Investigar',
  perto: 'Perto do sweet spot',
  encaixe_timing_fraco: 'Bom encaixe, timing fraco',
  timing_forte_encaixe_duvidoso: 'Timing forte, encaixe duvidoso',
};

export interface FiltrosPrioridade {
  busca: string;
  classes: Classe[];
  situacoes: SituacaoSweetSpot[];
  segmentos: Segmento[];
  setores: string[];
  coberturas: Cobertura[];
  faltando: Dimensao[];
  notaMin: Partial<Record<Dimensao, number>>;
  integradaMin: number;
  ufs: string[];
  tiers: string[];
  atalho: Atalho | null;
  /** célula do cruzamento de duas dimensões (faixas de 1 ponto) */
  celula?: { x: Dimensao; y: Dimensao; fx: number; fy: number } | null;
}

export const SEM_FILTROS: FiltrosPrioridade = {
  busca: '', classes: [], situacoes: [], segmentos: [], setores: [], coberturas: [], faltando: [], notaMin: {}, integradaMin: 0, ufs: [], tiers: [], atalho: null, celula: null,
};
/** Faixas de 1 ponto: [1,2) → 1 … [4,5] → 4. */
export const faixaNota = (n: number) => (n >= 4 - 1e-9 ? 4 : n >= 3 - 1e-9 ? 3 : n >= 2 - 1e-9 ? 2 : 1);
export const SEM_SETOR = 'Sem setor';

const nota = (l: LinhaPrioridade, d: Dimensao) => {
  const x = l.visao.dimensoes[d];
  return x.nota !== null && x.entraNoCalculo ? x.nota : null;
};

/** Busca por nome (e outros nomes) e por setor, sem acento, caixa ou pontuação, aceitando trecho. */
export function bateBusca(l: LinhaPrioridade, termo: string): boolean {
  const t = normalizar(termo).replace(/[^\p{L}\p{N}\s]/gu, ' ').replace(/\s+/g, ' ').trim();
  if (!t) return true;
  const alvo = normalizar([l.nome, ...l.outrosNomes, l.setor ?? ''].join(' ')).replace(/[^\p{L}\p{N}\s]/gu, ' ');
  return t.split(' ').every(p => alvo.includes(p));
}

function bateAtalho(l: LinhaPrioridade, a: Atalho): boolean {
  const v = l.visao;
  const icp = nota(l, 'icp'), sinais = nota(l, 'sinais');
  if (a === 'sweet') return v.situacaoSweetSpot === 'sweet_spot';
  // investigar: classificada com 3 de 4 e no sweet spot ou podendo entrar se a faltante vier boa
  if (a === 'investigar') return v.cobertura === 3 && (v.situacaoSweetSpot === 'sweet_spot' || v.investigacao?.notaMinimaParaSweet != null);
  if (a === 'perto') return v.situacaoSweetSpot === 'fora_por_classe' && (v.criteriosSweetAtendidos ?? 0) >= ATALHOS.pertoDoSweetSpot.criteriosEntrada;
  if (a === 'encaixe_timing_fraco') return icp !== null && sinais !== null && icp >= ATALHOS.bomEncaixeTimingFraco.icpMin && sinais < ATALHOS.bomEncaixeTimingFraco.sinaisAbaixoDe;
  return icp !== null && sinais !== null && sinais >= ATALHOS.timingForteEncaixeDuvidoso.sinaisMin && icp < ATALHOS.timingForteEncaixeDuvidoso.icpAbaixoDe;
}

/** Aplica os filtros (sem a busca). Devolve também quantas saíram só por não ter nota na dimensão do filtro de nota mínima. */
export function filtrar(linhas: LinhaPrioridade[], f: FiltrosPrioridade): { linhas: LinhaPrioridade[]; semNotaNoFiltro: number } {
  let semNotaNoFiltro = 0;
  const saida = linhas.filter(l => {
    const v = l.visao;
    if (f.classes.length && !(v.classeIntegrada && f.classes.includes(v.classeIntegrada))) return false;
    if (f.situacoes.length && !f.situacoes.includes(v.situacaoSweetSpot)) return false;
    if (f.segmentos.length && !f.segmentos.includes(segmentoDe(v))) return false;
    if (f.setores.length && !f.setores.includes(l.setor ?? SEM_SETOR)) return false;
    if (f.coberturas.length && !f.coberturas.includes(coberturaDe(v))) return false;
    if (f.faltando.length && !f.faltando.some(d => v.dimensoesFaltantes.includes(d))) return false;
    if (f.ufs.length && !f.ufs.includes(l.uf || 'Sem UF')) return false;
    if (f.tiers.length && !f.tiers.includes(l.tier)) return false;
    if (f.integradaMin && !(v.notaIntegrada !== null && v.notaIntegrada >= f.integradaMin - 1e-9)) return false;
    if (f.atalho && !bateAtalho(l, f.atalho)) return false;
    if (f.celula) {
      const nx = nota(l, f.celula.x), ny = nota(l, f.celula.y);
      if (nx === null || ny === null || faixaNota(nx) !== f.celula.fx || faixaNota(ny) !== f.celula.fy) return false;
    }
    for (const d of DIMENSOES) {
      const min = f.notaMin[d];
      if (!min) continue;
      const n = nota(l, d);
      if (n === null) {
        semNotaNoFiltro++;
        return false;
      }
      if (n < min - 1e-9) return false;
    }
    return true;
  });
  return { linhas: saida, semNotaNoFiltro };
}

/** Lista visível: filtros E busca; e quantas batem a busca mas estão fora dos filtros. */
export function aplicarTudo(linhas: LinhaPrioridade[], f: FiltrosPrioridade) {
  const { linhas: filtradas, semNotaNoFiltro } = filtrar(linhas, f);
  const visiveis = filtradas.filter(l => bateBusca(l, f.busca));
  const naBuscaFora = f.busca.trim() ? linhas.filter(l => bateBusca(l, f.busca)).length - visiveis.length : 0;
  return { visiveis, semNotaNoFiltro, naBuscaFora };
}

/** Os filtros ativos em texto, com OU dentro do grupo e E entre grupos. */
export function filtrosEmTexto(f: FiltrosPrioridade): string {
  const g: string[] = [];
  const ou = (xs: string[]) => xs.join(' ou ');
  if (f.atalho) g.push(ATALHOS_ROTULO[f.atalho]);
  if (f.segmentos.length) g.push(ou(f.segmentos.map(s => SEGMENTOS.find(x => x.id === s)!.rotulo)));
  if (f.classes.length) g.push(ou(f.classes));
  if (f.situacoes.length) g.push(ou(f.situacoes.map(s => s.replace(/_/g, ' '))));
  if (f.setores.length) g.push(`setor ${ou(f.setores)}`);
  if (f.coberturas.length) g.push(ou(f.coberturas.map(c => (c === 'completa' ? 'completas' : c === '3' ? '3 de 4' : '2 ou menos'))));
  if (f.faltando.length) g.push(`falta ${ou(f.faltando.map(d => ROTULO_CURTO[d]))}`);
  for (const d of DIMENSOES) if (f.notaMin[d]) g.push(`${ROTULO_CURTO[d]} ≥ ${String(f.notaMin[d]).replace('.', ',')}`);
  if (f.integradaMin) g.push(`nota integrada ≥ ${String(f.integradaMin).replace('.', ',')}`);
  if (f.celula) g.push(`${ROTULO_CURTO[f.celula.x]} ${f.celula.fx} a ${f.celula.fx + 1} e ${ROTULO_CURTO[f.celula.y]} ${f.celula.fy} a ${f.celula.fy + 1}`);
  if (f.tiers.length) g.push(`Tier ICP ${ou(f.tiers)}`);
  if (f.ufs.length) g.push(ou(f.ufs));
  return g.join(', E ');
}

export const temFiltro = (f: FiltrosPrioridade) => JSON.stringify({ ...SEM_FILTROS, ...f, busca: '', celula: f.celula ?? null }) !== JSON.stringify(SEM_FILTROS);

/** Contagem por segmento da faixa (sempre soma o total). */
export function faixa(linhas: LinhaPrioridade[]): Record<Segmento, number> {
  const r = Object.fromEntries(SEGMENTOS.map(s => [s.id, 0])) as Record<Segmento, number>;
  for (const l of linhas) r[segmentoDe(l.visao)]++;
  return r;
}

const GRUPO_ORDEM = (v: VisaoIntegradaConta) => (v.classeIntegrada ? 0 : 3);

/**
 * Ordem inicial: classificadas (4 ou 3 dimensões) pela nota integrada (empate: ICP, Sinais, nome); por fim as sem
 * métrica. Nada some.
 */
export function ordemInicial(a: LinhaPrioridade, b: LinhaPrioridade): number {
  const ga = GRUPO_ORDEM(a.visao), gb = GRUPO_ORDEM(b.visao);
  if (ga !== gb) return ga - gb;
  const desc = (x: number | null, y: number | null) => (y ?? -1) - (x ?? -1);
  return (
    (ga === 0 ? desc(a.visao.notaIntegrada, b.visao.notaIntegrada) : 0) ||
    desc(nota(a, 'icp'), nota(b, 'icp')) ||
    desc(nota(a, 'sinais'), nota(b, 'sinais')) ||
    a.nome.localeCompare(b.nome, 'pt-BR')
  );
}

export type ColunaOrdem = 'inicial' | 'nome' | 'integrada' | 'proximidade' | Dimensao;
/** Ordena por uma coluna; sem nota vai sempre para o fim, nos dois sentidos. */
export function ordenar(linhas: LinhaPrioridade[], col: ColunaOrdem, desc = true): LinhaPrioridade[] {
  if (col === 'inicial') return [...linhas].sort(ordemInicial);
  const valor = (l: LinhaPrioridade): number | string | null =>
    col === 'nome' ? l.nome : col === 'integrada' ? l.visao.notaIntegrada : col === 'proximidade' ? (l.visao.criteriosSweetAtendidos ?? null) : nota(l, col);
  return [...linhas].sort((a, b) => {
    const va = valor(a), vb = valor(b);
    if (va === null && vb === null) return ordemInicial(a, b);
    if (va === null) return 1;
    if (vb === null) return -1;
    const r = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : va - (vb as number);
    return (desc ? -r : r) || (col === 'proximidade' ? (b.visao.notaIntegrada ?? 0) - (a.visao.notaIntegrada ?? 0) : 0) || ordemInicial(a, b);
  });
}

/** Sugestões da busca: contas e setores que contêm o termo (inclusive fora dos filtros). */
export function sugestoes(linhas: LinhaPrioridade[], termo: string, limite = 6) {
  if (!termo.trim()) return { contas: [], setores: [] };
  const contas = linhas.filter(l => bateBusca({ ...l, setor: null }, termo)).slice(0, limite);
  const setores = [...new Set(linhas.map(l => l.setor ?? SEM_SETOR))]
    .filter(s => bateBusca({ nome: s, outrosNomes: [], setor: null } as unknown as LinhaPrioridade, termo))
    .slice(0, limite)
    .map(s => ({ setor: s, n: linhas.filter(l => (l.setor ?? SEM_SETOR) === s).length }));
  return { contas, setores };
}

export { CLASSES };
