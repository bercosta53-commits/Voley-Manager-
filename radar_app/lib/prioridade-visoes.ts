import { DIMENSOES, ROTULO_CURTO, ROTULO_DIMENSAO, type Dimensao } from './prioridade-config';
import { SEGMENTOS, SEM_SETOR, coberturaDe, faixaNota, ordemInicial, segmentoDe, type ColunaOrdem, type LinhaPrioridade, type Segmento } from './prioridade-filtros';

/**
 * Agrupar, cruzar e resumir (briefing v2, 6.6). Tudo descritivo: não cria nota do setor, classe nova nem
 * ordenação oficial. Funções puras; testes em scripts/tests/prioridade-visoes.test.mjs.
 */

const notaValida = (l: LinhaPrioridade, d: Dimensao) => {
  const x = l.visao.dimensoes[d];
  return x.nota !== null && x.entraNoCalculo ? x.nota : null;
};

// ---------------------------------------------------------------- agrupar

export type Agrupamento = 'nenhum' | 'setor' | 'prioridade' | 'sweet' | 'cobertura' | 'faltante';
export const AGRUPAMENTOS: { id: Agrupamento; rotulo: string }[] = [
  { id: 'nenhum', rotulo: 'Sem agrupar' },
  { id: 'setor', rotulo: 'Setor' },
  { id: 'prioridade', rotulo: 'Prioridade integrada' },
  { id: 'sweet', rotulo: 'Situação do sweet spot' },
  { id: 'cobertura', rotulo: 'Cobertura' },
  { id: 'faltante', rotulo: 'Dimensão faltante' },
];
const ROTULO_SITUACAO = { sweet_spot: 'No sweet spot (A1 ou A2)', candidata: 'Candidatas', fora_por_criterio: 'Fora por critério', fora_por_falta_de_dados: 'Fora por falta de dados', fora_por_classe: 'Completas fora do sweet spot' };

/** Chave e rótulo do grupo de uma conta; quem não tem o atributo cai num grupo "sem", nunca some. */
function grupoDe(l: LinhaPrioridade, a: Agrupamento): { chave: string; rotulo: string; ordem: number }[] {
  const v = l.visao;
  if (a === 'setor') return [{ chave: l.setor ?? SEM_SETOR, rotulo: l.setor ?? SEM_SETOR, ordem: l.setor ? 0 : 1 }];
  if (a === 'prioridade') {
    const s = segmentoDe(v);
    const i = SEGMENTOS.findIndex(x => x.id === s);
    return [{ chave: s, rotulo: v.classeIntegrada ?? 'Sem métrica', ordem: i }];
  }
  if (a === 'sweet') return [{ chave: v.situacaoSweetSpot, rotulo: ROTULO_SITUACAO[v.situacaoSweetSpot], ordem: Object.keys(ROTULO_SITUACAO).indexOf(v.situacaoSweetSpot) }];
  if (a === 'cobertura') {
    const c = coberturaDe(v);
    return [{ chave: c, rotulo: c === 'completa' ? 'Completas (4 de 4)' : c === '3' ? '3 de 4' : '2 ou menos', ordem: ['completa', '3', '2-'].indexOf(c) }];
  }
  if (a === 'faltante') {
    if (!v.dimensoesFaltantes.length) return [{ chave: 'nenhuma', rotulo: 'Nenhuma faltando', ordem: 0 }];
    // a conta aparece em cada grupo de dimensão que falta (a contagem do cabeçalho diz isso)
    return v.dimensoesFaltantes.map(d => ({ chave: d, rotulo: `Falta ${ROTULO_DIMENSAO[d]}`, ordem: 1 + DIMENSOES.indexOf(d) }));
  }
  return [{ chave: 'todas', rotulo: 'Todas', ordem: 0 }];
}

export interface Grupo {
  chave: string;
  rotulo: string;
  linhas: LinhaPrioridade[];
  distribuicao: Record<Segmento, number>;
}

/** Agrupa mantendo a ordem das linhas dentro de cada grupo. */
export function agrupar(linhas: LinhaPrioridade[], a: Agrupamento): Grupo[] {
  const m = new Map<string, Grupo & { ordem: number }>();
  for (const l of linhas)
    for (const g of grupoDe(l, a)) {
      const atual = m.get(g.chave) ?? { chave: g.chave, rotulo: g.rotulo, ordem: g.ordem, linhas: [], distribuicao: Object.fromEntries(SEGMENTOS.map(s => [s.id, 0])) as Record<Segmento, number> };
      atual.linhas.push(l);
      atual.distribuicao[segmentoDe(l.visao)]++;
      m.set(g.chave, atual);
    }
  return [...m.values()]
    .sort((x, y) => x.ordem - y.ordem || (a === 'setor' ? y.linhas.length - x.linhas.length || x.rotulo.localeCompare(y.rotulo, 'pt-BR') : 0))
    .map(({ ordem: _, ...g }) => g);
}

// ---------------------------------------------------------------- ordenação múltipla

export interface CriterioOrdem {
  col: ColunaOrdem;
  desc: boolean;
}
export const ROTULO_COLUNA: Record<ColunaOrdem, string> = {
  inicial: 'ordem inicial',
  nome: 'Conta',
  integrada: 'Nota integrada',
  proximidade: 'Proximidade',
  ...ROTULO_CURTO,
};
/** "1º ICP ↓, 2º Sinais ↓" */
export const ordemEmTexto = (cs: CriterioOrdem[]) => cs.map((c, i) => `${i + 1}º ${ROTULO_COLUNA[c.col]} ${c.desc ? '↓' : '↑'}`).join(', ');

/** Ordena por vários critérios em sequência; sem valor vai sempre para o fim; empate final pela ordem inicial. */
export function ordenarMulti(linhas: LinhaPrioridade[], cs: CriterioOrdem[]): LinhaPrioridade[] {
  const valor = (l: LinhaPrioridade, col: ColunaOrdem): number | string | null =>
    col === 'nome' ? l.nome : col === 'integrada' ? l.visao.notaIntegrada : col === 'proximidade' ? l.visao.criteriosSweetAtendidos : col === 'inicial' ? null : notaValida(l, col);
  const criterios = cs.filter(c => c.col !== 'inicial');
  return [...linhas].sort((a, b) => {
    for (const c of criterios) {
      const va = valor(a, c.col), vb = valor(b, c.col);
      if (va === null && vb === null) continue;
      if (va === null) return 1;
      if (vb === null) return -1;
      const r = typeof va === 'string' ? va.localeCompare(vb as string, 'pt-BR') : va - (vb as number);
      if (r) return c.desc ? -r : r;
    }
    return ordemInicial(a, b);
  });
}

/** Clique simples troca o critério; Shift+clique soma (ou inverte, se já estiver na lista). */
export function mudarOrdem(cs: CriterioOrdem[], col: ColunaOrdem, somar: boolean): CriterioOrdem[] {
  const padraoDesc = col !== 'nome';
  const existente = cs.find(c => c.col === col);
  if (!somar) return [{ col, desc: existente && cs.length === 1 ? !existente.desc : padraoDesc }];
  if (existente) return cs.map(c => (c.col === col ? { ...c, desc: !c.desc } : c));
  return [...cs.filter(c => c.col !== 'inicial'), { col, desc: padraoDesc }];
}

// ---------------------------------------------------------------- Setor × Prioridade

export const COLUNAS_MATRIZ: { id: Segmento; rotulo: string }[] = [
  { id: 'a1', rotulo: 'A1' },
  { id: 'A2', rotulo: 'A2' },
  { id: 'B1', rotulo: 'B1' },
  { id: 'B2', rotulo: 'B2' },
  { id: 'C', rotulo: 'C' },
  { id: 'sem_metrica', rotulo: 'Sem métrica' },
];

export interface MatrizSetor {
  linhas: { setor: string; celulas: Record<Segmento, number>; total: number }[];
  totaisColuna: Record<Segmento, number>;
  total: number;
}

export function setorPorPrioridade(linhas: LinhaPrioridade[], ordem: 'a1' | 'candidata' | 'nome' = 'a1'): MatrizSetor {
  const vazio = () => Object.fromEntries(SEGMENTOS.map(s => [s.id, 0])) as Record<Segmento, number>;
  const m = new Map<string, Record<Segmento, number>>();
  const totaisColuna = vazio();
  for (const l of linhas) {
    const s = l.setor ?? SEM_SETOR;
    const seg = segmentoDe(l.visao);
    const c = m.get(s) ?? vazio();
    c[seg]++;
    totaisColuna[seg]++;
    m.set(s, c);
  }
  // "mais a investigar": contas classificadas com 3 de 4 no setor
  const investigar = new Map<string, number>();
  for (const l of linhas) if (l.visao.cobertura === 3) investigar.set(l.setor ?? SEM_SETOR, (investigar.get(l.setor ?? SEM_SETOR) ?? 0) + 1);
  const rows = [...m.entries()].map(([setor, celulas]) => ({ setor, celulas, total: Object.values(celulas).reduce((a, b) => a + b, 0) }));
  rows.sort((a, b) =>
    ordem === 'nome'
      ? a.setor.localeCompare(b.setor, 'pt-BR')
      : // "mais no sweet spot" soma A1 e A2 (decisão D2)
        (ordem === 'a1' ? b.celulas.a1 + b.celulas.A2 - a.celulas.a1 - a.celulas.A2 : (investigar.get(b.setor) ?? 0) - (investigar.get(a.setor) ?? 0)) || b.total - a.total || a.setor.localeCompare(b.setor, 'pt-BR'),
  );
  return { linhas: rows, totaisColuna, total: linhas.length };
}

// ---------------------------------------------------------------- cruzar duas dimensões

export { faixaNota };
/** Faixas de 1 ponto: [1,2), [2,3), [3,4), [4,5]. */
export const FAIXAS_NOTA = [
  { id: 1, rotulo: '1 a 2' },
  { id: 2, rotulo: '2 a 3' },
  { id: 3, rotulo: '3 a 4' },
  { id: 4, rotulo: '4 a 5' },
] as const;

export interface Cruzamento {
  x: Dimensao;
  y: Dimensao;
  /** celulas[fy][fx] = contas */
  celulas: Record<number, Record<number, number>>;
  semAvaliacao: number;
  total: number;
}

export function cruzar(linhas: LinhaPrioridade[], x: Dimensao, y: Dimensao): Cruzamento {
  const celulas: Cruzamento['celulas'] = {};
  for (const fy of [1, 2, 3, 4]) celulas[fy] = { 1: 0, 2: 0, 3: 0, 4: 0 };
  let semAvaliacao = 0;
  for (const l of linhas) {
    const nx = notaValida(l, x), ny = notaValida(l, y);
    if (nx === null || ny === null) semAvaliacao++;
    else celulas[faixaNota(ny)]![faixaNota(nx)]!++;
  }
  return { x, y, celulas, semAvaliacao, total: linhas.length };
}

/** Quadrante nomeado em texto (alto = faixa 3 a 5). */
export const quadrante = (x: Dimensao, y: Dimensao, fx: number, fy: number) =>
  `${ROTULO_CURTO[y]} ${fy >= 3 ? 'alto' : 'baixo'}, ${ROTULO_CURTO[x]} ${fx >= 3 ? 'alto' : 'baixo'}`;

/** Contas de uma célula do cruzamento (para filtrar a lista). */
export const naCelula = (l: LinhaPrioridade, x: Dimensao, y: Dimensao, fx: number, fy: number) => {
  const nx = notaValida(l, x), ny = notaValida(l, y);
  return nx !== null && ny !== null && faixaNota(nx) === fx && faixaNota(ny) === fy;
};

// ---------------------------------------------------------------- resumo do setor

export interface ResumoSetor {
  setor: string;
  contas: number;
  /** média de cada dimensão só das contas avaliadas, sempre com o n; nunca uma nota integrada do setor */
  medias: Record<Dimensao, { media: number | null; n: number }>;
}

export function resumoSetor(linhas: LinhaPrioridade[], setor: string): ResumoSetor {
  const doSetor = linhas.filter(l => (l.setor ?? SEM_SETOR) === setor);
  const medias = Object.fromEntries(
    DIMENSOES.map(d => {
      const ns = doSetor.map(l => notaValida(l, d)).filter((n): n is number => n !== null);
      return [d, { media: ns.length ? ns.reduce((a, b) => a + b, 0) / ns.length : null, n: ns.length }];
    }),
  ) as ResumoSetor['medias'];
  return { setor, contas: doSetor.length, medias };
}
