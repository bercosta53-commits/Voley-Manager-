import type { PapelAbm } from './tipos';

/** Papel no comitê de compra: rótulo e cor, iguais em Decisores, no comitê da conta e no cartão de Hoje. */
export const PAPEIS: { id: PapelAbm; rotulo: string }[] = [
  { id: 'assina_cheque', rotulo: 'Assina o cheque' },
  { id: 'decisor', rotulo: 'Decisor' },
  { id: 'dono_da_dor', rotulo: 'Dono da dor' },
  { id: 'trava', rotulo: 'Trava' },
  { id: 'influenciador', rotulo: 'Influenciador' },
];
export const rotuloPapel = (p?: PapelAbm) => PAPEIS.find(x => x.id === p)?.rotulo;

/** Uma cor por papel: verde aprova o orçamento, azul decide, âmbar sente a dor, vermelho pode travar. */
export const COR_PAPEL: Record<PapelAbm, string> = {
  assina_cheque: 'bg-ok-bg text-ok',
  decisor: 'bg-cool-bg text-cool',
  dono_da_dor: 'bg-warm-bg text-warm',
  trava: 'bg-risk-bg text-risk',
  influenciador: 'bg-secondary text-text-2',
};
// classes por extenso: o Tailwind só gera o que aparece escrito no código
export const COR_BARRA: Record<PapelAbm, string> = {
  assina_cheque: 'bg-ok',
  decisor: 'bg-cool',
  dono_da_dor: 'bg-warm',
  trava: 'bg-risk',
  influenciador: 'bg-text-3',
};

/** Nível do gatilho no score v2.1 (A forte, B médio, C contexto). */
export const NIVEL_GATILHO = {
  A: { rotulo: 'Gatilho forte', cor: 'bg-warm-bg text-warm', ponto: 'var(--vr-warm)' },
  B: { rotulo: 'Gatilho médio', cor: 'bg-cool-bg text-cool', ponto: 'var(--vr-cool)' },
  C: { rotulo: 'Contexto', cor: 'bg-secondary text-text-2', ponto: 'var(--vr-text-3)' },
} as const;

export const COR_TIER: Record<string, string> = {
  A: 'bg-ok-bg text-ok',
  B: 'bg-cool-bg text-cool',
  C: 'bg-secondary text-text-3',
};
