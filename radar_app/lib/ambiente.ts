/**
 * Ambiente do Radar: cada conta num alvo cujo centro é o sweet spot.
 * - Distância ao centro = pontos de nota que faltam para cumprir os critérios do sweet spot (regras de A2):
 *   o maior entre a soma do que falta em cada dimensão até o mínimo e o que falta na soma ponderada para a
 *   nota integrada chegar ao piso (convertido pela dimensão de maior peso).
 * - Direção = a força da conta: a soma dos eixos ponderada por quanto cada dimensão passa do mínimo do sweet spot
 *   (ICP no topo, Sinais à direita, Clima embaixo, Oportunidade digital à esquerda, como no losango). A conta fica
 *   do lado do que ela já tem; o que falta é a distância ao centro (e a lacuna, no painel de decisão).
 * - Faixas: centro (no sweet spot), próximo, em aproximação, distante. Uma dimensão faltando: a posição usa o
 *   que se sabe e a conta fica marcada "a investigar"; duas ou mais faltando ficam fora do mapa (contadas).
 * Método de leitura visual: não muda nota, classe nem critério. Função pura; testes em scripts/tests/ambiente.test.mjs.
 */
import { DIMENSOES, PESOS, REGRAS, type Dimensao } from './prioridade-config';
import type { LinhaPrioridade } from './prioridade-filtros';

export type FaixaAmbiente = 'centro' | 'proximo' | 'aproximacao' | 'distante';
export const FAIXAS_AMBIENTE: { id: FaixaAmbiente; rotulo: string; descricao: string }[] = [
  { id: 'centro', rotulo: 'No sweet spot', descricao: 'Cumpre todos os critérios (A1 ou A2)' },
  { id: 'proximo', rotulo: 'Próximo', descricao: 'Falta até 1,5 ponto de nota, ou uma dimensão a investigar que pode levar ao sweet spot' },
  { id: 'aproximacao', rotulo: 'Em aproximação', descricao: 'Faltam de 1,5 a 4 pontos de nota' },
  { id: 'distante', rotulo: 'Distante', descricao: 'Faltam mais de 4 pontos de nota' },
];
/** limites das faixas, em pontos de nota que faltam */
export const LIMITE_PROXIMO = 1.5;
export const LIMITE_APROXIMACAO = 4;

/** vetor unitário de cada eixo (y para baixo, como no SVG) */
export const EIXO: Record<Dimensao, [number, number]> = { icp: [0, -1], sinais: [1, 0], clima: [0, 1], oportunidadeDigital: [-1, 0] };

export interface PontoAmbiente {
  linha: LinhaPrioridade;
  faixa: FaixaAmbiente;
  /** pontos de nota que faltam (0 no sweet spot); com dimensão faltando, é o mínimo conhecido */
  falta: number;
  /** ângulo em radianos (0 = direita, sentido horário no SVG) */
  angulo: number;
  /** 0 (centro) a 1 (borda) */
  raio: number;
  /** dimensão que mais afasta a conta do centro (a faltante, quando há uma) */
  lacuna: Dimensao | null;
  /** dimensão em que a conta mais passa do mínimo (o lado em que ela fica no alvo) */
  forca: Dimensao | null;
  /** uma dimensão sem avaliação */
  aInvestigar: boolean;
}

export interface Ambiente {
  pontos: PontoAmbiente[];
  porFaixa: Record<FaixaAmbiente, number>;
  /** contas com duas ou mais dimensões sem avaliação (fora do mapa) */
  semDados: number;
  /** em quantas contas fora do centro cada dimensão é a que mais afasta */
  porLacuna: Record<Dimensao, number>;
  /** em quantas contas cada dimensão é a força principal */
  porForca: Record<Dimensao, number>;
}

const nota = (l: LinhaPrioridade, d: Dimensao) => {
  const x = l.visao.dimensoes[d];
  return x.nota !== null && x.entraNoCalculo ? x.nota : null;
};

/** hash estável do id, para espalhar contas na mesma posição sem sorteio */
function hash(s: string) {
  let h = 2166136261;
  for (let i = 0; i < s.length; i++) h = Math.imul(h ^ s.charCodeAt(i), 16777619);
  return ((h >>> 0) % 10_000) / 10_000;
}

/**
 * Pontos de nota que faltam para o sweet spot, só com as dimensões avaliadas (com três, a média é das três):
 * o maior entre a soma do que falta em cada uma até o mínimo e o que falta na soma ponderada para a média chegar
 * ao piso de A2, convertido em pontos pela dimensão de maior peso.
 */
export function pontosQueFaltam(notas: Partial<Record<Dimensao, number>>): number {
  const r = REGRAS.A2;
  const ds = DIMENSOES.filter(d => notas[d] !== undefined);
  if (!ds.length) return 0;
  const porDimensao = ds.reduce((s, d) => s + Math.max(0, r.minimos[d] - notas[d]!), 0);
  const pesoTotal = ds.reduce((s, d) => s + PESOS[d], 0);
  const pesoMax = Math.max(...ds.map(d => PESOS[d]));
  const faltaSoma = r.nota * pesoTotal - ds.reduce((s, d) => s + notas[d]! * PESOS[d], 0);
  return Math.round(Math.max(porDimensao, Math.max(0, faltaSoma) / pesoMax) * 100) / 100;
}

export function faixaPorFalta(falta: number): FaixaAmbiente {
  return falta <= 1e-9 ? 'centro' : falta <= LIMITE_PROXIMO + 1e-9 ? 'proximo' : falta <= LIMITE_APROXIMACAO + 1e-9 ? 'aproximacao' : 'distante';
}

/** raio por faixa: centro 0–0,2 · próximo 0,2–0,45 · aproximação 0,45–0,7 · distante 0,7–0,95 */
function raioDe(faixa: FaixaAmbiente, falta: number, media: number | null, h: number) {
  if (faixa === 'centro') return 0.04 + 0.14 * Math.min(1, Math.max(0, (5 - (media ?? 4)) / 1.2)) * (0.6 + 0.4 * h);
  if (faixa === 'proximo') return 0.22 + 0.21 * Math.min(1, falta / LIMITE_PROXIMO);
  if (faixa === 'aproximacao') return 0.47 + 0.21 * ((falta - LIMITE_PROXIMO) / (LIMITE_APROXIMACAO - LIMITE_PROXIMO));
  return 0.72 + 0.21 * Math.min(1, (falta - LIMITE_APROXIMACAO) / 6);
}

export function ambiente(linhas: LinhaPrioridade[]): Ambiente {
  const porFaixa: Record<FaixaAmbiente, number> = { centro: 0, proximo: 0, aproximacao: 0, distante: 0 };
  const porLacuna = Object.fromEntries(DIMENSOES.map(d => [d, 0])) as Record<Dimensao, number>;
  const porForca = Object.fromEntries(DIMENSOES.map(d => [d, 0])) as Record<Dimensao, number>;
  const pontos: PontoAmbiente[] = [];
  let semDados = 0;
  for (const l of linhas) {
    const v = l.visao;
    const notas = Object.fromEntries(DIMENSOES.flatMap(d => (nota(l, d) === null ? [] : [[d, nota(l, d)!]]))) as Partial<Record<Dimensao, number>>;
    const faltantes = DIMENSOES.filter(d => notas[d] === undefined);
    if (faltantes.length >= 2) {
      semDados++;
      continue;
    }
    const aInvestigar = faltantes.length === 1;
    let falta = v.situacaoSweetSpot === 'sweet_spot' ? 0 : pontosQueFaltam(notas);
    let faixa = faixaPorFalta(falta);
    // candidata: a faltante, se vier alta o bastante, leva ao sweet spot; fica em "próximo"
    if (v.situacaoSweetSpot === 'candidata') faixa = 'proximo';
    if (faixa === 'centro' && v.situacaoSweetSpot !== 'sweet_spot') faixa = 'proximo';
    if (v.situacaoSweetSpot === 'candidata') falta = Math.max(falta, 0.5);

    // direção: o quanto cada dimensão está abaixo de 5; a faltante pesa como a maior lacuna possível
    let x = 0;
    let y = 0;
    let lacuna: Dimensao | null = null;
    let maior = -1;
    // direção: a força, quanto cada dimensão passa do mínimo (a faltante não puxa: não se sabe a nota)
    let forca: Dimensao | null = null;
    let melhor = 0;
    for (const d of DIMENSOES) {
      const sobra = notas[d] === undefined ? 0 : Math.max(0, notas[d]! - REGRAS.A2.minimos[d]);
      x += EIXO[d][0] * sobra;
      y += EIXO[d][1] * sobra;
      if (sobra > melhor + 1e-9) (melhor = sobra), (forca = d);
      // lacuna: a dimensão conhecida mais abaixo do mínimo; sem nenhuma abaixo, a faltante
      const abaixoDoMinimo = notas[d] === undefined ? 0 : REGRAS.A2.minimos[d] - notas[d]!;
      if (abaixoDoMinimo > 1e-9 && abaixoDoMinimo > maior) (maior = abaixoDoMinimo), (lacuna = d);
    }
    if (!lacuna && faltantes.length) lacuna = faltantes[0]!;
    // nenhuma abaixo do mínimo e nada faltando: o que segura é a nota integrada; aponta a mais fraca
    if (!lacuna && v.situacaoSweetSpot !== 'sweet_spot') lacuna = DIMENSOES.reduce((a, d) => (notas[d]! - REGRAS.A2.minimos[d] < notas[a]! - REGRAS.A2.minimos[a] ? d : a));
    const h = hash(l.contaId);
    const base = Math.hypot(x, y) < 1e-6 ? h * 2 * Math.PI : Math.atan2(y, x);
    const h2 = hash(`${l.contaId}·r`);
    const angulo = base + (h - 0.5) * 1.1; // espalha ±31° quem está no mesmo lugar, sem sair do quadrante
    const raio = Math.max(0.03, raioDe(faixa, falta, v.notaIntegrada, h) + (faixa === 'centro' ? 0 : (h2 - 0.5) * 0.06));
    if (faixa !== 'centro' && lacuna) porLacuna[lacuna]++;
    porFaixa[faixa]++;
    if (forca) porForca[forca]++;
    pontos.push({ linha: l, faixa, falta, angulo, raio, lacuna: faixa === 'centro' ? null : lacuna, forca, aInvestigar });
  }
  return { pontos, porFaixa, semDados, porLacuna, porForca };
}
