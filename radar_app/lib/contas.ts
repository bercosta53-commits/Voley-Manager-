import type { Conta } from './tipos';

export type Familia = 'cooperativa' | 'consorcio' | 'seguro' | 'banco' | 'tecnologia';

export const FAMILIAS: { id: Familia; rotulo: string }[] = [
  { id: 'cooperativa', rotulo: 'Cooperativas' },
  { id: 'banco', rotulo: 'Bancos e crédito' },
  { id: 'seguro', rotulo: 'Seguros' },
  { id: 'consorcio', rotulo: 'Consórcios' },
  { id: 'tecnologia', rotulo: 'Tecnologia' },
];

/** Agrupa os subsegmentos da planilha em poucas famílias, para filtrar. */
export function familia(c: Pick<Conta, 'segmento' | 'braco'>): Familia {
  const s = `${c.segmento} ${c.braco}`.toLowerCase();
  if (s.includes('cooperat') || s.includes('central')) return 'cooperativa';
  if (s.includes('consórc') || s.includes('consorc')) return 'consorcio';
  if (s.includes('segur') || s.includes('previd')) return 'seguro';
  if (s.includes('tecnolog') || s.includes('fintech') || s.includes('pagamento')) return 'tecnologia';
  return 'banco';
}

export type Status = 'ativar' | 'nutrir' | 'nao_abordar';

export const STATUS: { id: Status; rotulo: string; dica: string }[] = [
  { id: 'ativar', rotulo: 'Ativar', dica: 'Pronta para abordagem' },
  { id: 'nutrir', rotulo: 'Nutrir', dica: 'Nutrir e validar bloqueios antes de abordar' },
  { id: 'nao_abordar', rotulo: 'Não abordar', dica: 'Dados insuficientes para abordar' },
];

/** "ATIVAR", "NUTRIR / VALIDAR BLOQUEIO", "INSUFICIENTE — NÃO ABORDAR" → id curto. */
export function status(c: Pick<Conta, 'statusComercial'>): Status {
  const s = c.statusComercial.toUpperCase();
  if (s.includes('ATIVAR')) return 'ativar';
  if (s.includes('NUTRIR')) return 'nutrir';
  return 'nao_abordar';
}

export const rotuloStatus = (c: Pick<Conta, 'statusComercial'>) => STATUS.find(s => s.id === status(c))!.rotulo;

export type Sentido = 'sobe' | 'desce' | 'estavel';
export const sentido = (tendencia: number): Sentido => (tendencia >= 3 ? 'sobe' : tendencia <= -3 ? 'desce' : 'estavel');

export const primeiraMaiuscula = (t: string) => (t ? t.charAt(0).toUpperCase() + t.slice(1) : t);

/** Remove acentos e caixa, para busca. */
export const normalizar = (t: string) =>
  t
    .normalize('NFD')
    .replace(/\p{Diacritic}/gu, '')
    .toLowerCase();

export const hrefConta = (id: string) => `/contas/${id}`;
