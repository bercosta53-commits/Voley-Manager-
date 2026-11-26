import type { Conta } from './tipos';

/** Conta real usada como exemplo em "Como o score é calculado": dentro do ICP (tier A/B), com pelo menos dois
 * fatos no VSCS, a de maior score. Compartilhada pelo servidor (para mandar só a decomposição dela) e pela tela. */
export function exemploMetodologia<C extends Pick<Conta, 'tier' | 'score' | 'v2'>>(contas: C[]): C | undefined {
  return [...contas]
    .filter(c => (c.v2?.contribuicoes?.length ?? 0) >= 2)
    .sort((a, b) => Number((a.v2?.tier ?? a.tier) === 'C') - Number((b.v2?.tier ?? b.tier) === 'C') || b.score - a.score)[0];
}
