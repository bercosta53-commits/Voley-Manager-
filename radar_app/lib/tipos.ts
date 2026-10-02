export type Papel = 'decisor' | 'influenciador';
export type Area = 'executivo' | 'marketing' | 'comercial';

export interface Pessoa {
  nome: string;
  cargo: string;
  area: Area;
  papel: Papel;
  /** de onde veio o nome: planilha, Apollo… */
  fonte: string;
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

export interface Conta {
  id: string;
  nome: string;
  razaoSocial: string;
  cnpj: string;
  dominio: string;
  cidade: string;
  uf: string;
  segmento: string;
  braco: string;
  tier: string;
  statusComercial: string;
  decisor: { nome: string; cargo: string };
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
