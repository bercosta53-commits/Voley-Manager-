import type { Base, Conta, EstadoSinal, Sinal } from './tipos';

/**
 * Avaliação de relevância que a pessoa dá a cada sinal (1, 2 ou 3) e o efeito dela na classificação:
 * 1 mantém, 2 soma 10% e 3 soma 15% à contribuição do sinal (teto 1). O score da conta é recombinado
 * com a mesma regra do score v2.1 (scripts/score_v2.py): gatilhos A e B por noisy-OR, contexto (C) com
 * teto de 0.25, um valor por tipo — o mais forte.
 */
export type Relevancia = 1 | 2 | 3;
export const BONUS_RELEVANCIA: Record<Relevancia, number> = { 1: 1, 2: 1.1, 3: 1.15 };
export const ROTULO_RELEVANCIA: Record<Relevancia, string> = {
  1: 'Relevância 1 · mantém o peso',
  2: 'Relevância 2 · +10% no sinal',
  3: 'Relevância 3 · +15% no sinal',
};
const TETO_CONTEXTO = 0.25;

function noisyOr(valores: number[]) {
  return 1 - valores.reduce((r, v) => r * (1 - v), 1);
}

export function combinar(contribs: { nivel: string; valor: number }[]) {
  const gatilhos = noisyOr(contribs.filter(c => c.nivel !== 'C').map(c => c.valor));
  const contexto = Math.min(TETO_CONTEXTO, noisyOr(contribs.filter(c => c.nivel === 'C').map(c => c.valor)));
  return 1 - (1 - gatilhos) * (1 - contexto);
}

/** Valor ajustado do sinal (0–1) e o score da conta depois das avaliações dela. */
function ajustarConta(conta: Conta, sinais: Sinal[], estados: Record<string, EstadoSinal>) {
  const contribs = new Map((conta.v2?.contribuicoes ?? []).map(c => [c.tipo, { ...c }]));
  const pontos = new Map<string, number>();
  let mudou = false;
  for (const s of sinais) {
    const r = estados[s.id]?.relevancia;
    if (!r || r === 1 || !s.tipoSpec || !s.nivel) continue;
    const ajustado = Math.min(1, (s.pontos / 100) * BONUS_RELEVANCIA[r]);
    pontos.set(s.id, Math.round(ajustado * 100));
    const atual = contribs.get(s.tipoSpec);
    if (!atual || ajustado > atual.valor) {
      contribs.set(s.tipoSpec, { tipo: s.tipoSpec, nivel: s.nivel, valor: ajustado, data: s.data, texto: s.sinal ?? s.porQueAgora });
      mudou = true;
    }
  }
  if (!mudou) return { score: conta.score, pontos };
  return { score: Math.round(100 * combinar([...contribs.values()])), pontos };
}

/** A base como a pessoa a vê: score das contas e pontos dos sinais já com as avaliações de relevância. */
export function aplicarAvaliacoes(base: Base, estados: Record<string, EstadoSinal>): Base {
  if (!Object.values(estados).some(e => e?.relevancia && e.relevancia > 1)) return base;
  const porConta = new Map<string, Sinal[]>();
  for (const s of base.sinais) porConta.set(s.contaId, [...(porConta.get(s.contaId) ?? []), s]);
  const pontosAjustados = new Map<string, number>();
  const contas = base.contas.map(c => {
    const { score, pontos } = ajustarConta(c, porConta.get(c.id) ?? [], estados);
    pontos.forEach((v, k) => pontosAjustados.set(k, v));
    if (score === c.score) return c;
    const serie = c.serie.length ? [...c.serie.slice(0, -1), score] : c.serie;
    return { ...c, score, tendencia: c.tendencia + (score - c.score), serie, composicao: c.composicao };
  });
  const sinais = base.sinais.map(s => (pontosAjustados.has(s.id) ? { ...s, pontos: pontosAjustados.get(s.id)! } : s));
  return { ...base, contas, sinais };
}
