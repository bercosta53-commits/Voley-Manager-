import type { Conta } from './tipos';

export type Familia = 'cooperativa' | 'consorcio' | 'seguro' | 'banco' | 'tecnologia' | 'outro';

export const FAMILIAS: { id: Familia; rotulo: string }[] = [
  { id: 'cooperativa', rotulo: 'Cooperativas' },
  { id: 'banco', rotulo: 'Bancos e crédito' },
  { id: 'seguro', rotulo: 'Seguros' },
  { id: 'consorcio', rotulo: 'Consórcios' },
  { id: 'tecnologia', rotulo: 'Tecnologia' },
  { id: 'outro', rotulo: 'Outros' },
];

/** Agrupa os subsegmentos da planilha em poucas famílias, para filtrar. */
export function familia(c: Pick<Conta, 'segmento' | 'braco'>): Familia {
  const s = `${c.segmento} ${c.braco}`.toLowerCase();
  if (s.includes('cooperat') || s.includes('central')) return 'cooperativa';
  if (s.includes('consórc') || s.includes('consorc')) return 'consorcio';
  if (s.includes('segur') || s.includes('previd')) return 'seguro';
  if (s.includes('tecnolog') || s.includes('fintech') || s.includes('pagamento')) return 'tecnologia';
  if (s.includes('banc') || s.includes('crédit') || s.includes('credit')) return 'banco';
  return 'outro';
}

/** Subsegmento de TI — mistura vertical (quem a empresa atende) e modelo de negócio (o que ela vende),
 * porque é assim que esse mercado se descreve na prática. Classificado por fonte externa (nome + CNAE +
 * segmento + site), não derivado de um campo só — por isso fica como subsegmentoTI em Conta, não aqui. */
export const SUBSEGMENTOS_TI: { id: string; rotulo: string }[] = [
  { id: 'saas_horizontal', rotulo: 'SaaS horizontal' },
  { id: 'fabrica_software', rotulo: 'Fábrica de software' },
  { id: 'healthtech', rotulo: 'Healthtech' },
  { id: 'edtech', rotulo: 'Edtech' },
  { id: 'fintech', rotulo: 'Fintech' },
  { id: 'martech', rotulo: 'Martech' },
  { id: 'legaltech', rotulo: 'Legaltech' },
  { id: 'hrtech', rotulo: 'HRtech' },
  { id: 'agrotech', rotulo: 'Agrotech' },
  { id: 'cloud_infra', rotulo: 'Cloud e infraestrutura' },
  { id: 'seguranca', rotulo: 'Segurança da informação' },
  { id: 'dados_ia', rotulo: 'Dados e IA' },
  { id: 'outsourcing_ti', rotulo: 'Outsourcing de TI' },
  { id: 'erp_gestao', rotulo: 'ERP e gestão' },
  { id: 'ecommerce_varejo', rotulo: 'E-commerce e varejo' },
  { id: 'outro', rotulo: 'Outro' },
];
export const rotuloSubsegmentoTI = (id: string) => SUBSEGMENTOS_TI.find(s => s.id === id)?.rotulo ?? id;

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

/** Sem dado de status ainda (ex.: lista recém-importada, sem planilha de classificação comercial) é
 * diferente de "não abordar" — isso é uma decisão, aquilo é só falta de classificar. */
export const rotuloStatus = (c: Pick<Conta, 'statusComercial'>) => (c.statusComercial.trim() ? STATUS.find(s => s.id === status(c))!.rotulo : 'A classificar');

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
