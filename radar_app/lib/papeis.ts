import type { Conta, PapelAbm, Pessoa } from './tipos';

/** Papel no comitê de compra: rótulo e cor, iguais em Decisores, no comitê da conta e no cartão de Hoje. */
export const PAPEIS: { id: PapelAbm; rotulo: string }[] = [
  { id: 'assina_cheque', rotulo: 'Assina o cheque' },
  { id: 'decisor', rotulo: 'Decisor' },
  { id: 'dono_da_dor', rotulo: 'Dono da dor' },
  { id: 'trava', rotulo: 'Trava' },
  { id: 'influenciador', rotulo: 'Influenciador' },
];
export const rotuloPapel = (p?: PapelAbm) => PAPEIS.find(x => x.id === p)?.rotulo;

/** Lugar de cada pessoa no comitê: papel ABM quando já classificado; senão, o mapa antigo por área. */
export function papelNoComite(p: Pessoa): PapelAbm {
  if (p.papelAbm) return p.papelAbm;
  if (p.area === 'executivo') return 'assina_cheque';
  if ((p.area === 'marketing' || p.area === 'comercial') && p.papel === 'decisor') return 'decisor';
  if (p.area === 'marketing' || p.area === 'comercial') return 'dono_da_dor';
  return 'influenciador';
}

/** Os três lugares que fazem o comitê completo (quem trava e influenciadores ficam à parte). */
export const LUGARES_ESSENCIAIS: { papel: PapelAbm; rotulo: string }[] = [
  { papel: 'assina_cheque', rotulo: 'Assina o cheque' },
  { papel: 'decisor', rotulo: 'Decisor' },
  { papel: 'dono_da_dor', rotulo: 'Dono da dor' },
];

/** A pessoa ocupa este lugar? (papel principal ou um dos extras) */
export const ocupa = (p: Pessoa, papel: PapelAbm) => papelNoComite(p) === papel || !!p.papeisExtras?.includes(papel);

/**
 * Lugares essenciais sem ninguém na conta. Usa o que o motor gravou (comiteFaltando) quando vem na carga;
 * senão, a mesma leitura por cargo do comitê da conta. Ausência do campo nunca vale como "comitê completo".
 */
export function faltandoNoComite(c: Pick<Conta, 'comite' | 'comiteFaltando'>): string[] {
  if (Array.isArray(c.comiteFaltando)) return c.comiteFaltando;
  return LUGARES_ESSENCIAIS.filter(l => !c.comite.some(p => ocupa(p, l.papel))).map(l => l.rotulo);
}

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

/** Nível do sinal no VSCS: score_base ≥ 75 = A, 50–74 = B, < 50 = C. */
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

/** Categoria do VSCS em rótulo curto (chips de contagem). */
export const CATEGORIA_ROTULO_CURTO: Record<string, string> = {
  lideranca: 'Liderança',
  expansao: 'Expansão e investimento',
  gtm: 'GTM',
  contratacao: 'Contratações',
  estrategia: 'Movimentos estratégicos',
  intencao: 'Intenção',
  contexto: 'Contexto',
  negativo: 'Negativos',
};
