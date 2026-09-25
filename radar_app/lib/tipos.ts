export type Papel = 'decisor' | 'influenciador';

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
}

export interface Sinal {
  id: string;
  contaId: string;
  tipo: string;
  rotulo: string;
  peso: number;
  porQueAgora: string;
  fonte: string;
  data: string;
  url: string;
  /** sinal de exemplo (os coletores ainda não rodaram para ele) */
  exemplo: boolean;
  abordar: { nome: string; cargo: string; papel: Papel };
  pontos: number;
}

export interface Base {
  geradoEm: string;
  contas: Conta[];
  sinais: Sinal[];
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
