/**
 * Simulação da prioridade com o OGI como 5ª dimensão. NÃO É O MODELO OFICIAL: não muda VSCS, nota integrada,
 * classe, Tier nem a tela; serve para comparar a classe atual (4 dimensões) com a classe simulada (5).
 *
 * Regras simuladas (direcionamento de 27/11):
 * - As quatro dimensões originais ficam como estão (ICP 1, Sinais 1, Clima 0,5, Digital 1); OGI com peso 1.
 * - O OGI soma na média como as outras e tem mínimo próprio para o sweet spot (3 = neutro); os mínimos e as
 *   travas originais continuam (ICP < 3 → C). Nada promove Tier: o Tier vem só do ICP.
 * - Ausência do OGI conta como dimensão faltante (como as outras): classifica com até `maxFaltantes` faltando.
 * Função pura; testes em scripts/tests/ogi.test.mjs.
 */
import { DIMENSOES, PESOS, REGRAS, TOLERANCIA, type Classe, type Dimensao } from './prioridade-config';
import { classificar, type Notas } from './prioridade';

export const PESO_OGI = 1;
export const MINIMO_OGI_SWEET = 3;

export interface OpcoesSimulacao {
  pesoOgi?: number;
  minimoOgi?: number;
  /** dimensões que podem faltar (das cinco) e a conta ainda ser classificada; padrão 1 */
  maxFaltantes?: number;
  /**
   * 'media': o OGI é mais uma dimensão na média ponderada (neutro 3 puxa toda conta para 3: dilui as fortes e
   * levanta as fracas). 'ancorado': só o afastamento do neutro mexe na nota (nota4 + peso × (OGI − 3) / peso
   * total das cinco); ruído e estagnação neutra não mudam nada.
   */
  modo?: 'media' | 'ancorado';
}

const atinge = (v: number, limite: number) => v >= limite - TOLERANCIA;

export function notaComOgi(n: Partial<Notas>, ogi: number | null, pesoOgi = PESO_OGI, modo: 'media' | 'ancorado' = 'media'): number | null {
  const ds = DIMENSOES.filter(d => n[d] !== undefined);
  const peso4 = ds.reduce((s, d) => s + PESOS[d], 0);
  const peso = peso4 + (ogi === null ? 0 : pesoOgi);
  if (!peso) return null;
  if (modo === 'ancorado') {
    if (!peso4) return null;
    const media4 = ds.reduce((s, d) => s + n[d]! * PESOS[d], 0) / peso4;
    return ogi === null ? media4 : Math.min(5, Math.max(1, media4 + (pesoOgi * (ogi - 3)) / peso));
  }
  return (ds.reduce((s, d) => s + n[d]! * PESOS[d], 0) + (ogi === null ? 0 : ogi * pesoOgi)) / peso;
}

/** Classe com cinco dimensões; null quando falta mais do que o permitido. */
export function classificarComOgi(n: Partial<Notas>, ogi: number | null, o: OpcoesSimulacao = {}): Classe | null {
  const faltantes = DIMENSOES.filter(d => n[d] === undefined).length + (ogi === null ? 1 : 0);
  if (faltantes > (o.maxFaltantes ?? 1)) return null;
  const media = notaComOgi(n, ogi, o.pesoOgi ?? PESO_OGI, o.modo ?? 'media');
  if (media === null) return null;
  if ((n.icp !== undefined && !atinge(n.icp, REGRAS.C.icpAbaixoDe)) || !atinge(media, REGRAS.C.notaAbaixoDe)) return 'C';
  const minimoOgi = o.minimoOgi ?? MINIMO_OGI_SWEET;
  const cumpre = (regra: { nota: number; minimos: Record<Dimensao, number> }) =>
    atinge(media, regra.nota) && DIMENSOES.every(d => n[d] === undefined || atinge(n[d]!, regra.minimos[d])) && (ogi === null || atinge(ogi, minimoOgi));
  if (cumpre(REGRAS.A1)) return 'A1';
  if (cumpre(REGRAS.A2)) return 'A2';
  if (atinge(media, REGRAS.B1.nota)) return 'B1';
  return 'B2';
}

/** Classe atual (4 dimensões, a regra em vigor), com a mesma tolerância de faltantes do modelo: até 1. */
export function classeAtual(n: Partial<Notas>): Classe | null {
  return DIMENSOES.filter(d => n[d] === undefined).length > 1 ? null : classificar(n);
}

const ORDEM: (Classe | 'sem')[] = ['A1', 'A2', 'B1', 'B2', 'C', 'sem'];
export type Movimento = 'sobe' | 'desce' | 'igual' | 'entra' | 'sai';
export function movimento(antes: Classe | null, depois: Classe | null): Movimento {
  if (antes === depois) return 'igual';
  if (antes === null) return 'entra';
  if (depois === null) return 'sai';
  return ORDEM.indexOf(depois) < ORDEM.indexOf(antes) ? 'sobe' : 'desce';
}

export interface LinhaSimulada {
  contaId: string;
  antes: Classe | null;
  depois: Classe | null;
  notaAntes: number | null;
  notaDepois: number | null;
  movimento: Movimento;
}

export interface ResumoSimulacao {
  total: number;
  matriz: Record<string, Record<string, number>>;
  porMovimento: Record<Movimento, number>;
  sweetAntes: number;
  sweetDepois: number;
}

export function resumir(linhas: LinhaSimulada[]): ResumoSimulacao {
  const chave = (c: Classe | null) => c ?? 'sem';
  const matriz = Object.fromEntries(ORDEM.map(a => [a, Object.fromEntries(ORDEM.map(b => [b, 0]))])) as Record<string, Record<string, number>>;
  const porMovimento: Record<Movimento, number> = { sobe: 0, desce: 0, igual: 0, entra: 0, sai: 0 };
  for (const l of linhas) {
    matriz[chave(l.antes)]![chave(l.depois)]!++;
    porMovimento[l.movimento]++;
  }
  const sweet = (c: Classe | null) => c === 'A1' || c === 'A2';
  return { total: linhas.length, matriz, porMovimento, sweetAntes: linhas.filter(l => sweet(l.antes)).length, sweetDepois: linhas.filter(l => sweet(l.depois)).length };
}
