export type Papel = 'decisor' | 'influenciador';
export type PapelAbm = 'assina_cheque' | 'decisor' | 'dono_da_dor' | 'trava' | 'influenciador';
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
  /** papel no comitê de compra (scripts/qualificar_icp.py) */
  papelAbm?: PapelAbm;
  /** lugares extras que a mesma pessoa ocupa no comitê (ex.: decisor que também é o dono da dor) */
  papeisExtras?: PapelAbm[];
  /** contato da Velora dentro da conta (relacionamento já aberto) */
  contatoVelora?: boolean;
  /** auditoria do contato pela inteligência (ex.: APTO_HISTORICO, VALIDAR_EMAIL_EXISTENTE, BLOQUEADO_AGUARDA_AUDITORIA) */
  statusValidacao?: string;
  /** relevância da pessoa no contexto do ICP */
  relevancia?: 'alta' | 'media' | 'baixa';
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
  /** sinalização rápida (até ~45 caracteres), escrita pelo classificador; sem ela, vale porQueAgora */
  sinal?: string;
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
  /** número de funcionários (Apollo/Indeed/LinkedIn à mão) e de onde veio */
  funcionarios?: number;
  funcionariosFonte?: string;
  /** faixa de funcionários (LinkedIn) e faturamento estimado, quando vêm de pesquisa (importar_chatgpt.py) */
  funcionariosFaixa?: string;
  faturamentoEstimado?: string;
  /** ano de fundação quando não há CNPJ confirmado */
  anoFundacao?: number;
  socios?: Socio[];
  score: number;
  /** pontos ganhos (ou perdidos) nos últimos 30 dias (vscs_delta_30d) */
  tendencia: number;
  /** 90 dias, um ponto a cada 3 dias */
  serie: number[];
  /** Série retrospectiva diária (D−180 a D0), reconstruída ou estimada dos movimentos registrados e ancorada na data do score. */
  serie180?: { ate: string; versao: string; metodo: 'reconstruido' | 'movimentos_registrados'; valores: number[] };
  composicao: Parcela[];
  comite: Pessoa[];
  historico: Evento[];
  /** ramo de TI (28 ramos da planilha Radar Velora) e especialização de mercado (20 + generalista) */
  ramoTI?: { codigo: string; nome: string; familia: string };
  especializacao?: { codigo: string; nome: string };
  modeloNegocio?: 'servico' | 'produto' | 'misto';
  /** o que a empresa faz, em uma frase */
  oQueFaz?: string;
  /** de onde veio a UF: Receita, endereço do site ou sede conhecida a validar */
  ufFonte?: 'receita' | 'site' | 'pesquisa';
  /** tier de ICP (A/B/C, padrão HubSpot) com os motivos */
  icp?: { tier: 'A' | 'B' | 'C'; motivos: string[] };
  /** Evidência de ICP persistida; o simulador não substitui a pesquisa registrada. */
  icpEvidencia?: {
    requalificacao2G?: {
      versao?: string;
      data?: string;
      status?: string;
      sede?: { uf?: string; url?: string; cidade?: string };
      ramoAvaliado?: string;
      modeloAvaliado?: string;
      faturamento?: { status?: string };
      pendencias?: string[];
      gatilhos?: Record<string, { status?: string; contaParaTierA?: boolean; justificativa?: string; fonte?: string | null }>;
    };
  };
  /** papéis do comitê que ainda não têm ninguém mapeado */
  comiteFaltando?: string[];
  /** VSCS 3.0 (scripts/score_v2.py): índice 0–100, status, ação da matriz ICP × VSCS, anel 1-4 (null = fora do radar) */
  v2?: {
    versao?: string;
    calculadoEm?: string;
    vscs?: number;
    vscs_base?: number;
    bonus_convergencia?: number;
    status?: StatusVscs;
    acao?: string;
    tier?: 'A' | 'B' | 'C';
    via_rapida?: boolean;
    sinais_contados?: number;
    categorias?: number;
    anel: number | null;
    frase: string;
    /** VSCS / 100 */
    timing: number;
    proximity: number;
    janela_dupla?: boolean;
    fit?: number;
    access?: number;
    engagement?: number;
    sinal_ativo?: boolean;
    /** um registro por acontecimento: s = base × fonte × tempo × correlação (0–100); pontos = o que somou ao VSCS */
    contribuicoes?: ContribuicaoVscs[];
  };
  /** status do VSCS e ação recomendada (gravados pelo score_v2.py --exibir) */
  vscsStatus?: StatusVscs;
  acaoRecomendada?: string;
  /** true quando a carga não trouxe acaoRecomendada e a tela a derivou da matriz ICP × VSCS ao ler a base
   * (lib/dados.ts). Não vem da carga; serve para a tela dizer que a ação é da matriz, não do motor. */
  acaoDaMatriz?: boolean;
  /** score ainda não certificado pelo motor (a inteligência marca até rodar o VSCS sobre a conta) */
  scorePendente?: boolean;
  /** Conta Qualificada, regra CQ-1, gravada pelo motor (contrato D12); a tela só exibe */
  qualificada?: { status: 'sim' | 'nao' | 'desconhecido'; desde?: string | null; motivo?: string; pendencias?: string[]; regra_versao?: string };
  /** estágio do VSCS na carga anterior, quando comprovável (D12) */
  estagio_anterior?: StatusVscs | null;
}

export type StatusVscs = 'Monitoramento' | 'Atenção' | 'Oportunidade emergente' | 'Alta prioridade' | 'Prioridade máxima';

export interface HorizontePlano {
  tipo: string;
  dataAnuncio: string;
  inicio: string;
  fim: string;
  status: string;
  fase?: string;
  ultimaConfirmacaoConsiderada?: string;
  a_revalidar?: boolean;
  revalidar?: boolean;
  vigente?: boolean;
  fator?: number;
}
export interface ContribuicaoVscs {
  id: string;
  chave?: string;
  tipo: string;
  categoria: string;
  nivel: 'A' | 'B' | 'C';
  base: number;
  fonte: number;
  tempo: number;
  correlacao: number;
  s: number;
  horizontePlano?: HorizontePlano | null;
  vaga_aberta?: boolean;
  revalidar_vaga?: boolean;
  janela_lideranca?: string | null;
  maturacao?: string | null;
  /** s / 100 */
  valor: number;
  pontos: number;
  data: string;
  texto: string;
}

export interface Sinal {
  id: string;
  horizontePlano?: HorizontePlano | null;
  contaId: string;
  tipo: string;
  rotulo: string;
  peso: number;
  /** sinalização rápida, em destaque no cartão: "Expansão para o Paraná", "Abertura de 30 vagas de
   * marketing e vendas". Vem do classificador (notícias) ou do coletor de vagas. */
  sinal?: string;
  /** o fato numa frase (começa por verbo): vai no "Por quê" e no rascunho da mensagem */
  porQueAgora: string;
  /** todos os veículos que noticiaram o mesmo fato (o principal incluído), quando foi mais de um */
  fontes?: { fonte: string; url: string; data: string }[];
  /** quando a carga diária coletou o fato e quanto confia nele (contrato D2, opcionais) */
  coletadoEm?: string;
  confianca?: 'alta' | 'media' | 'baixa';
  /** pessoa do comitê citada na matéria (coletor de veículos) */
  pessoa?: string;
  /** nível (A/B/C) e tipo do VSCS a que o sinal pertence (scripts/score_v2.py --exibir) */
  nivel?: 'A' | 'B' | 'C' | null;
  tipoSpec?: string;
  /** s / 100 do VSCS (base × fonte × tempo × correlação); `pontos` é o que o sinal soma de fato ao VSCS */
  valor?: number;
  /** categoria do VSCS (lideranca, expansao, gtm, contratacao, estrategia, intencao, contexto) */
  categoria?: string;
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

/** Evento dos próximos 60 dias com as contas que estarão lá (scripts/coletar_eventos.py). */
export interface EventoAgenda {
  id: string;
  nome: string;
  inicio: string;
  fim: string;
  cidade: string;
  uf: string;
  presencas: { contaId: string; conta: string; papel: string; pessoa: string; cargo: string; score: number }[];
}

export interface Base {
  geradoEm: string;
  /** versão do motor de score que gerou esta base (ex.: vscs-3.0) */
  scoreVersao?: string;
  /** data e hora da última atualização da base (score_v2.py --exibir) */
  atualizadoEm?: string;
  contas: Conta[];
  sinais: Sinal[];
  fontes: Fonte[];
  /** agenda presencial: eventos dos próximos 60 dias com contas da base */
  agenda?: EventoAgenda[];
  /** última varredura por conta e fonte: separa "sem fato" de "não varrido" (lib/varredura.ts, docs/varreduras.md) */
  varreduras?: import('./varredura').Varreduras;
  /** true quando a base é a de exemplo (empresas fictícias) */
  ficticia?: boolean;
  /** preenchido na leitura (lib/dados.ts), nunca gravado: o que foi retirado e quanto a leitura custou */
  diagnostico?: DiagnosticoBase;
}

export interface DiagnosticoBase {
  lidoEm: string;
  ms: number;
  bytes: number;
  descartados: { exemplo: number; semConta: number; dataInvalida: number; historicoExemplo: number };
  sinaisSemEvidencia: number;
}

export type Acao = 'abordado' | 'adiado' | 'arquivado';
export type Avaliacao = 'util' | 'ruido';

export interface EstadoSinal {
  acao?: Acao;
  ate?: string; // adiado até (AAAA-MM-DD)
  avaliacao?: Avaliacao;
  /** relevância que a pessoa deu ao sinal: 1 mantém, 2 soma 10%, 3 soma 15% (lib/avaliacao.ts) */
  relevancia?: Relevancia3;
  em?: string;
  /** quem fez a última marcação (e-mail do Access), quando o registro compartilhado está ligado */
  por?: string;
}

export type Relevancia3 = 1 | 2 | 3;
