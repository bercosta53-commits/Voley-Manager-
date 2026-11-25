import type { StatusVscs } from './tipos';

/**
 * Avaliação de relevância que a pessoa dá a cada sinal (1, 2 ou 3). É retorno do time para calibrar o modelo
 * (P3-3), gravado com o resto das ações; não muda o score na tela. O VSCS é um só, o do motor
 * (scripts/score_v2.py), igual para todo mundo (P1-8). Faixas e matriz abaixo são as da especificação.
 */
export type Relevancia = 1 | 2 | 3;
export const ROTULO_RELEVANCIA: Record<Relevancia, string> = {
  1: 'Relevância 1 · sinal comum',
  2: 'Relevância 2 · sinal forte',
  3: 'Relevância 3 · sinal decisivo',
};

export const FAIXAS_VSCS: [number, StatusVscs][] = [
  [85, 'Prioridade máxima'],
  [70, 'Alta prioridade'],
  [55, 'Oportunidade emergente'],
  [40, 'Atenção'],
  [0, 'Monitoramento'],
];
/** seção 6 do modelo: ação = ICP × faixa (0 monitoramento … 4 máxima) */
export const MATRIZ_ICP: Record<'A' | 'B' | 'C', string[]> = {
  A: ['Monitorar', 'Ampliar pesquisa', 'Abordagem contextualizada', 'ABM personalizado', '1:1 executivo'],
  B: ['Monitorar', 'Monitorar', 'Ampliar pesquisa', 'Abordagem contextualizada', 'ABM personalizado'],
  C: ['Ignorar', 'Monitorar', 'Monitorar', 'Revisar ICP da conta', 'Revisar ICP da conta'],
};
export const ACOES_DE_ABORDAGEM = new Set(['Abordagem contextualizada', 'ABM personalizado', '1:1 executivo']);

export const faixaVscs = (v: number) => 4 - FAIXAS_VSCS.findIndex(([piso]) => v >= piso);
export const statusVscs = (v: number): StatusVscs => FAIXAS_VSCS[4 - faixaVscs(v)][1];


