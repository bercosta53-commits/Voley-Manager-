import type { Base, Conta, ContribuicaoVscs, EstadoSinal, StatusVscs } from './tipos';

/**
 * Avaliação de relevância que a pessoa dá a cada sinal (1, 2 ou 3) e o efeito dela na classificação:
 * 1 mantém, 2 soma 10% e 3 soma 15% ao s do sinal (teto 100). O VSCS da conta é recombinado com a mesma
 * regra do scripts/score_v2.py (VSCS 3.0): 100 × [1 − Π(1 − 0,5·s/100)] + bônus de convergência.
 */
export type Relevancia = 1 | 2 | 3;
export const BONUS_RELEVANCIA: Record<Relevancia, number> = { 1: 1, 2: 1.1, 3: 1.15 };
export const ROTULO_RELEVANCIA: Record<Relevancia, string> = {
  1: 'Relevância 1 · mantém o peso',
  2: 'Relevância 2 · +10% no sinal',
  3: 'Relevância 3 · +15% no sinal',
};

const K = 0.5;
const JANELA_CONVERGENCIA = 45;
const S_MINIMO_CONVERGENCIA = 40;
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

const dia = (iso: string) => Date.parse(iso) / 86_400_000;

export function bonusConvergencia(contribs: Pick<ContribuicaoVscs, 's' | 'categoria' | 'data'>[]) {
  const fortes = contribs.filter(c => c.s >= S_MINIMO_CONVERGENCIA);
  let maximo = 0;
  for (const a of fortes) {
    const naJanela = fortes.filter(c => dia(c.data) - dia(a.data) >= 0 && dia(c.data) - dia(a.data) <= JANELA_CONVERGENCIA);
    maximo = Math.max(maximo, new Set(naJanela.map(c => c.categoria)).size);
  }
  return maximo >= 3 ? 8 : maximo === 2 ? 5 : 0;
}

/** VSCS e o que cada sinal somou (do mais forte para o mais fraco). */
export function combinar(contribs: Pick<ContribuicaoVscs, 'id' | 's' | 'categoria' | 'data'>[]) {
  const ordem = contribs.filter(c => c.s > 0).sort((a, b) => b.s - a.s);
  let resto = 1;
  const pontos = new Map<string, number>();
  for (const c of ordem) {
    pontos.set(c.id, 100 * resto * K * (c.s / 100));
    resto *= 1 - (K * c.s) / 100;
  }
  return { vscs: Math.min(100, 100 * (1 - resto) + bonusConvergencia(ordem)), pontos };
}

/** VSCS da conta depois das avaliações dela e os pontos de cada sinal (null = nada avaliado acima de 1). */
function ajustarConta(conta: Conta, estados: Record<string, EstadoSinal>) {
  let mudou = false;
  const ajustadas = (conta.v2?.contribuicoes ?? []).map(c => {
    const r = estados[c.id]?.relevancia;
    if (!r || r === 1) return c;
    mudou = true;
    return { ...c, s: Math.min(100, c.s * BONUS_RELEVANCIA[r]) };
  });
  if (!mudou) return null;
  const { vscs, pontos } = combinar(ajustadas);
  return { score: Math.round(vscs), pontos };
}

/** A base como a pessoa a vê: VSCS das contas e pontos dos sinais já com as avaliações de relevância. */
export function aplicarAvaliacoes(base: Base, estados: Record<string, EstadoSinal>): Base {
  if (!Object.values(estados).some(e => e?.relevancia && e.relevancia > 1)) return base;
  const pontosAjustados = new Map<string, number>();
  const contas = base.contas.map(c => {
    const ajuste = ajustarConta(c, estados);
    if (!ajuste) return c;
    ajuste.pontos.forEach((v, k) => pontosAjustados.set(k, Math.round(v)));
    const { score } = ajuste;
    if (score === c.score) return c;
    const serie = c.serie.length ? [...c.serie.slice(0, -1), score] : c.serie;
    const tier = (c.v2?.tier ?? c.icp?.tier ?? 'B') as 'A' | 'B' | 'C';
    return {
      ...c,
      score,
      tendencia: c.tendencia + (score - c.score),
      serie,
      vscsStatus: statusVscs(score),
      acaoRecomendada: MATRIZ_ICP[tier][faixaVscs(score)],
    };
  });
  const sinais = base.sinais.map(s => (pontosAjustados.has(s.id) ? { ...s, pontos: pontosAjustados.get(s.id)! } : s));
  return { ...base, contas, sinais };
}
