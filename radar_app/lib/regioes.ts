import type { Conta } from './tipos';

/** Região do país por UF (IBGE). */
export const REGIAO_UF: Record<string, string> = {
  SP: 'Sudeste', RJ: 'Sudeste', MG: 'Sudeste', ES: 'Sudeste',
  PR: 'Sul', SC: 'Sul', RS: 'Sul',
  BA: 'Nordeste', PE: 'Nordeste', CE: 'Nordeste', MA: 'Nordeste', PB: 'Nordeste', RN: 'Nordeste', AL: 'Nordeste', SE: 'Nordeste', PI: 'Nordeste',
  GO: 'Centro-Oeste', DF: 'Centro-Oeste', MT: 'Centro-Oeste', MS: 'Centro-Oeste',
  AM: 'Norte', PA: 'Norte', RO: 'Norte', AC: 'Norte', AP: 'Norte', RR: 'Norte', TO: 'Norte',
};
export const REGIOES = ['Sudeste', 'Sul', 'Nordeste', 'Centro-Oeste', 'Norte'] as const;
export const SEM_UF = 'Sem UF';
export const regiaoDe = (uf?: string) => (uf && REGIAO_UF[uf.toUpperCase()]) || SEM_UF;

/** Porte da Receita (pelo CNPJ). Sem CNPJ confirmado, não há porte. */
export const PORTES = ['Micro', 'Pequena', 'Média ou grande', 'Sem CNPJ'] as const;
export function porteDe(c: Pick<Conta, 'porte' | 'cnpj'>): (typeof PORTES)[number] {
  const p = (c.porte ?? '').toLowerCase();
  if (!c.cnpj || !p) return 'Sem CNPJ';
  if (p.includes('micro')) return 'Micro';
  if (p.includes('pequeno')) return 'Pequena';
  return 'Média ou grande';
}

/** Capital social em faixas (proxy de porte enquanto não há número de funcionários). */
export const FAIXAS_CAPITAL = ['Até R$ 100 mil', 'R$ 100 mil–1 mi', 'R$ 1–10 mi', 'Acima de R$ 10 mi'] as const;
export function faixaCapital(v?: number): (typeof FAIXAS_CAPITAL)[number] | null {
  if (v == null || !(v > 0)) return null;
  if (v <= 100_000) return FAIXAS_CAPITAL[0];
  if (v <= 1_000_000) return FAIXAS_CAPITAL[1];
  if (v <= 10_000_000) return FAIXAS_CAPITAL[2];
  return FAIXAS_CAPITAL[3];
}

/** Funcionários em faixas (quando a base tiver o número: Apollo, LinkedIn à mão, Indeed). */
export const FAIXAS_FUNCIONARIOS = ['1–10', '11–50', '51–200', '201–500', '501–1.000', '1.000+'] as const;
export function faixaFuncionarios(n?: number): (typeof FAIXAS_FUNCIONARIOS)[number] | null {
  if (n == null || !(n > 0)) return null;
  if (n <= 10) return '1–10';
  if (n <= 50) return '11–50';
  if (n <= 200) return '51–200';
  if (n <= 500) return '201–500';
  if (n <= 1000) return '501–1.000';
  return '1.000+';
}
