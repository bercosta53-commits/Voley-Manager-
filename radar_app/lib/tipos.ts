export type Papel = 'decisor' | 'influenciador';
/** O Comitê de compra (3 lugares) só olha executivo/marketing/comercial; as demais áreas aparecem
 * na lista completa de decisores, não nesses 3 lugares fixos. */
export type Area = 'executivo' | 'marketing' | 'comercial' | 'produto' | 'financeiro' | 'compras' | 'juridico' | 'ti' | 'operacoes' | 'rh' | 'outro';

export interface Pessoa {
  nome: string;
  cargo: string;
  area: Area;
  papel: Papel;
  /** de onde veio o nome: planilha, Apollo… */
  fonte: string;
  email?: string;
  linkedin?: string;
}

/** Uma parcela do score: quanto cada coisa somou. */
export interface Parcela {
  rotulo: string;
  detalhe: string;
  pontos: number;
  /** data do fato, quando a parcela é um sinal */
  data?: string;
}

/** Fato antigo da conta (já fora da caixa), para a linha do tempo. */
export interface Evento {
  tipo: string;
  rotulo: string;
  porQueAgora: string;
  fonte: string;
  data: string;
  url: string;
  exemplo: boolean;
}

/** Sócio da Receita Federal (QSA) — referência, não entra no comitê de compra (não dá pra casar com
 * segurança com quem veio do Snov sem risco de duplicar a mesma pessoa sob nomes levemente diferentes). */
export interface Socio {
  nome: string;
  qualificacao: string;
}

export interface Conta {
  id: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  dominio: string;
  cidade: string;
  uf: string;
  segmento: string;
  /** subsegmento de TI (ver SUBSEGMENTOS_TI em lib/contas.ts) — não é todo mundo que dá pra classificar */
  subsegmentoTI?: string;
  braco: string;
  tier: string;
  statusComercial: string;
  decisor: { nome: string; cargo: string };
  /** CNAE fiscal: "6202-3/00 Desenvolvimento e licenciamento de programas de computador customizáveis" */
  cnae?: string;
  porte?: string;
  situacaoCadastral?: string;
  /** data de abertura (AAAA-MM-DD) */
  dataAbertura?: string;
  capitalSocial?: number;
  socios?: Socio[];
  score: number;
  /** pontos ganhos (ou perdidos) nos últimos 14 dias */
  tendencia: number;
  /** 90 dias, um ponto a cada 3 dias */
  serie: number[];
  composicao: Parcela[];
  comite: Pessoa[];
  historico: Evento[];
}

export interface Sinal {
  id: string;
  contaId: string;
  tipo: string;
  rotulo: string;
  peso: number;
  porQueAgora: string;
  fonte: string;
  /** data do fato */
  data: string;
  /** data em que o radar avisou */
  alertaEm: string;
  url: string;
  /** sinal de exemplo (os coletores ainda não rodaram para ele) */
  exemplo: boolean;
  abordar: { nome: string; cargo: string; papel: Papel };
  pontos: number;
}

export type StatusFonte = 'ok' | 'atencao' | 'erro';

export interface Fonte {
  id: string;
  nome: string;
  busca: string;
  onde: string;
  intervaloDias: number;
  /** o que falta para rodar (vazio quando nada falta) */
  requisito: string;
  status: StatusFonte;
  resumo: string;
  ultimaColeta: string;
  itensUltima: number;
  errosUltima: number;
  execucoes: number;
  /** sinais reais que esta fonte já trouxe */
  sinais: number;
  /** uso e custo do mês (provedores pagos), em texto simples */
  custo: string;
}

export interface Base {
  geradoEm: string;
  contas: Conta[];
  sinais: Sinal[];
  fontes: Fonte[];
  /** true quando a base é a de exemplo (empresas fictícias) */
  ficticia?: boolean;
}

export type Acao = 'abordado' | 'adiado' | 'arquivado';
export type Avaliacao = 'util' | 'ruido';

export interface EstadoSinal {
  acao?: Acao;
  ate?: string; // adiado até (AAAA-MM-DD)
  avaliacao?: Avaliacao;
  em?: string;
}
