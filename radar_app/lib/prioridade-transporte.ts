import type { LinhaPrioridade } from './prioridade-filtros';
import { visaoIntegrada, type DimensaoIntegrada } from './prioridade';
import { DIMENSOES, type Dimensao, type ModoClima } from './prioridade-config';

/**
 * S-1: o navegador recebe só as quatro dimensões de cada conta, sem o que é vazio, padrão ou igual em todas
 * (origem da nota, motivo fixo do Clima), e recalcula a classe com as mesmas regras (expandirLinhas). A conta
 * do cálculo é barata; mandar o resultado pronto custava mais que a própria base.
 */
export type DimensaoCompacta = Partial<Omit<DimensaoIntegrada, 'origem'>>;
export type LinhaTransporte = Omit<LinhaPrioridade, 'visao'> & { dims: Record<Dimensao, DimensaoCompacta>; /** como o Clima entra na nota (o servidor decide) */ modoClima?: ModoClima };

const PADRAO: Omit<DimensaoIntegrada, 'origem'> = {
  nota: null, resumo: null, status: 'avaliada', motivoSemNota: null, semAchados: false, entraNoCalculo: false,
  motivoExclusao: null, dataReferencia: null, fontes: [], pendenciasQualidade: [],
};

export function compactarDimensao(d: Dimensao, x: DimensaoIntegrada): DimensaoCompacta {
  const fixo = d === 'clima' && x.motivoSemNota === 'metodo_nao_mapeado';
  const limpa: DimensaoCompacta = {};
  for (const k of Object.keys(PADRAO) as (keyof typeof PADRAO)[]) {
    if (k === 'status') continue;
    let v = x[k] as unknown;
    if ((k === 'resumo' || k === 'motivoExclusao') && fixo) v = null;
    if (k === 'motivoExclusao' && v === x.resumo) v = null;
    const padrao = PADRAO[k] as unknown;
    if (v === padrao || (Array.isArray(v) && v.length === 0) || v === null || v === undefined) continue;
    (limpa as Record<string, unknown>)[k] = v;
  }
  // status padrão sai da nota (sem nota = sem avaliação); só vai junto quando é outro (ex.: desatualizada)
  if (x.status !== (x.nota === null ? 'sem_avaliacao' : 'avaliada')) limpa.status = x.status;
  // só o Clima tem a nota do cálculo anterior; vai junto quando existe
  if (x.notaClassica !== undefined && x.notaClassica !== null) limpa.notaClassica = x.notaClassica;
  return limpa;
}

export function expandirDimensao(c: DimensaoCompacta): DimensaoIntegrada {
  const status = c.status ?? (c.nota === undefined || c.nota === null ? 'sem_avaliacao' : 'avaliada');
  // nota ausente no transporte volta como null, nunca como undefined
  return { ...PADRAO, ...c, nota: c.nota ?? null, status, fontes: c.fontes ?? [], pendenciasQualidade: c.pendenciasQualidade ?? [] };
}

/** No navegador: devolve as linhas com a visão integrada recalculada pelas mesmas regras do servidor. */
export function expandirLinhas(ls: LinhaTransporte[], ocultas: Dimensao[] = []): LinhaPrioridade[] {
  return ls.map(({ dims, modoClima, ...resto }) => {
    const dimensoes = Object.fromEntries(DIMENSOES.map(d => [d, expandirDimensao(dims[d] ?? {})])) as Record<Dimensao, DimensaoIntegrada>;
    return { ...resto, visao: visaoIntegrada(resto.contaId, dimensoes, { ocultas, modoClima: modoClima ?? 'media' }) };
  });
}
