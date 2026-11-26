/**
 * Prioridade integrada (experimental) — módulo único de configuração. O cálculo (lib/prioridade.ts), o painel
 * "Como ler a prioridade" e os testes leem daqui: mudar um limite aqui muda a regra e o texto da tela juntos.
 *
 * Tudo aqui é PROPOSTA ainda não calibrada com a base real (briefing v2 de 25/11, seções 2, 8 e 13).
 * A nota integrada e as classes A1–C NÃO substituem o VSCS, o Tier ICP nem a regra CQ-1, e não autorizam
 * abordagem: elegibilidade e contatos seguem o contrato oficial.
 */

export const VERSAO_MODELO = 'integrado-experimental-1' as const;
export const SELO_MODELO = 'Modelo experimental 1 · pesos iguais · limites ainda não calibrados';

export type Dimensao = 'icp' | 'sinais' | 'clima' | 'oportunidadeDigital';
export const DIMENSOES: Dimensao[] = ['icp', 'sinais', 'clima', 'oportunidadeDigital'];
export const ROTULO_DIMENSAO: Record<Dimensao, string> = {
  icp: 'ICP',
  sinais: 'Sinais',
  clima: 'Clima do setor',
  oportunidadeDigital: 'Oportunidade digital',
};
export const ROTULO_CURTO: Record<Dimensao, string> = { icp: 'ICP', sinais: 'Sinais', clima: 'Clima', oportunidadeDigital: 'Digital' };
export const PERGUNTA_DIMENSAO: Record<Dimensao, string> = {
  icp: 'Esta empresa é um bom cliente para a Velora?',
  sinais: 'Há fatos que justificam uma conversa agora?',
  clima: 'O contexto do setor favorece investimento e mudança?',
  oportunidadeDigital: 'Há espaço relevante e viável para melhorar aquisição e conversão?',
};

/** Comparação de limites com tolerância fixa (proteção de ponto flutuante, não arredondamento). */
export const TOLERANCIA = 1e-9;

/** Pesos iguais: hipótese inicial transparente. */
export const PESOS: Record<Dimensao, number> = { icp: 1, sinais: 1, clima: 1, oportunidadeDigital: 1 };

export type Classe = 'A1' | 'A2' | 'B1' | 'B2' | 'C';
export const CLASSES: Classe[] = ['A1', 'A2', 'B1', 'B2', 'C'];

/** Regras na ordem em que são aplicadas, só em avaliações completas (briefing 8.2). */
export const REGRAS = {
  C: { icpAbaixoDe: 3, notaAbaixoDe: 2.5 },
  // Clima entra como contexto: mínimo 2 em A1/A2 (decisão de Bernardo, 26/11). Pesa na média e só barra setor muito ruim.
  A1: { nota: 4.5, minimos: { icp: 4, sinais: 4, clima: 2, oportunidadeDigital: 3 } as Record<Dimensao, number> },
  A2: { nota: 4.0, minimos: { icp: 4, sinais: 3, clima: 2, oportunidadeDigital: 3 } as Record<Dimensao, number> },
  B1: { nota: 3.25 },
} as const;

/**
 * Sweet spot = A1 ou A2 (decisão D2 de Bernardo, 26/11). A entrada no sweet spot segue as regras de A2; A1 é o
 * topo, com a maior convergência. Candidata = uma dimensão faltando e A2 ainda alcançável.
 */
export const SWEET_SPOT: Classe[] = ['A1', 'A2'];
export const ENTRADA_SWEET_SPOT = 'A2' as const;

export const LEITURA_CLASSE: Record<Classe, string> = {
  A1: 'Sweet spot, topo: maior convergência',
  A2: 'Sweet spot: alta prioridade',
  B1: 'Boa conta para desenvolvimento',
  B2: 'Monitorar ou validar antes de priorizar',
  C: 'Baixa prioridade no modelo integrado',
};

/** Atalhos de visão (experimentais). */
export const ATALHOS = {
  bomEncaixeTimingFraco: { icpMin: 4, sinaisAbaixoDe: 3 },
  timingForteEncaixeDuvidoso: { sinaisMin: 4, icpAbaixoDe: 4 },
  pertoDoSweetSpot: { criteriosEntrada: 4 },
} as const;

/**
 * Como cada eixo vira nota de 1 a 5 (origem → escala). "documentado" = transformação definida pela própria
 * escala do método; "proposto" = normalização sugerida aqui, experimental, à espera de decisão (D5/D6);
 * "indisponivel" = sem dado por conta hoje. Nada que não esteja aqui entra no cálculo.
 */
export const ORIGEM = {
  icp: {
    campoOrigem: 'conta.icp.tier (ou conta.tier)',
    escalaOriginal: 'Tier ICP A / B / C (regras em data/icp.json)',
    transformacao: 'A → 5,0 · B → 3,0 · C → 2,0 (decisão D5, 26/11)',
    mapeamento: 'documentado' as const,
    nota: { A: 5, B: 3, C: 2 } as Record<string, number>,
  },
  sinais: {
    campoOrigem: 'conta.score (= v2.vscs, VSCS 3.0)',
    escalaOriginal: '0–100 (só fatos observados; o ICP não muda o número)',
    transformacao: '1 + 4 × VSCS / 100',
    mapeamento: 'documentado' as const,
  },
  clima: {
    campoOrigem: 'data/clima.json: vertical do Clima ligada à conta pelo código de especialização (ESP01–ESP20; sem código, Generalista = macro)',
    escalaOriginal: 'Nível S de −1 a +1 (40% macro, 45% setorial, 15% notícias): avaliação editorial da Velora sobre indicadores com data e fonte',
    transformacao: '3 + 2 × S (neutro = 3, melhor = 5, pior = 1)',
    mapeamento: 'documentado' as const,
    motivo: 'Edição do Clima mais antiga que a validade ou sem vertical para a conta.',
    validadeDias: 21, // edição semanal: três semanas sem atualizar e o eixo sai do cálculo
  },
  oportunidadeDigital: {
    campoOrigem: 'data/aquisicao.json (auditoria web), ligado à conta pelo domínio',
    escalaOriginal: 'Nível de maturidade L1–L5 (lib/aquisicao-maturidade.ts)',
    transformacao: 'L1 → 2 · L2 → 4 · L3 → 4 · L4 → 2 · L5 → 1 (mais espaço viável = nota maior)',
    mapeamento: 'proposto' as const,
    nota: { 1: 2, 2: 4, 3: 4, 4: 2, 5: 1 } as Record<number, number>,
    /** validade proposta para a auditoria web; mais antiga que isso, mostra a nota mas não entra no cálculo */
    validadeDias: 135, // decisão D7 (26/11): um trimestre e meio
  },
};

/** Política para VSCS ainda não certificado pelo motor (scorePendente): entra no cálculo, com pendência visível. */
export const SINAIS_PENDENTES_ENTRAM = true;

/** O que resolveria a dimensão faltante (investigação acionável). */
export const EVIDENCIA_NECESSARIA: Record<Dimensao, string> = {
  icp: 'Classificar o Tier ICP da conta pelas regras de data/icp.json (ramo, sede, faturamento).',
  sinais: 'Rodar o VSCS sobre a conta (fatos datados com fonte).',
  clima: 'Nota do Clima para o setor da conta, com a vertical do Clima ligada ao setor da conta.',
  oportunidadeDigital: 'Auditoria web do domínio (mensuração, mídia, captação e CRM observáveis).',
};
