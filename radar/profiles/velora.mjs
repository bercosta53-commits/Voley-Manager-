// Perfil de cliente da Velora: ICP, catálogo de sinais, pesos, capacidade e tom de voz.
// Para um cliente novo, copie este arquivo, ajuste o que muda e registre em profiles/index.mjs.
//
// strength: F = forte, M = médio, N = negativo (tira a conta da fila enquanto válido).
// arm: braço do ICP onde o sinal pesa mais; fora dele vale `armOffMultiplier` do peso.
// mvp: um dos 15 tipos do MVP (fontes gratuitas ou já contratadas). Os demais começam
// desligados e entram na fase de calibragem.

const S = (id, family, label, strength, sources, extra = {}) => ({
  id,
  family,
  label,
  strength,
  sources,
  arm: null,
  mvp: false,
  ...extra,
  enabled: extra.enabled ?? (extra.mvp || strength === 'N')
});

export const families = {
  pessoas: 'Pessoas e liderança',
  contratacao: 'Contratação',
  corporativo: 'Movimento corporativo',
  mercado: 'Mercado e regulação',
  digital: 'Pegada digital',
  engajamento: 'Engajamento com a Velora',
  negativo: 'Sinais negativos'
};

const signals = [
  // 1. Pessoas e liderança
  S('novo_cmo', 'pessoas', 'Novo CMO, head de marketing ou growth', 'F', ['Sales Navigator', 'Apollo'], {
    mvp: true,
    decisor: 'CMO / head de marketing',
    hook: 'parabéns pela nova posição na {empresa}. Os primeiros meses costumam ser quando a estratégia de aquisição é revista; tenho acompanhado empresas do setor nesse momento e gostaria de trocar ideias.'
  }),
  S('novo_diretor_comercial', 'pessoas', 'Novo diretor comercial ou CRO', 'F', ['Sales Navigator', 'Apollo'], {
    mvp: true,
    decisor: 'Diretor comercial / CRO',
    hook: 'vi que você assumiu a área comercial da {empresa}. É o momento em que processo e metas costumam ser redesenhados; seria bom conectar e trocar referências.'
  }),
  S('novo_ceo', 'pessoas', 'Novo CEO ou presidente', 'F', ['Sales Navigator', 'Notícias'], {
    decisor: 'CEO',
    hook: 'acompanhei a mudança de liderança na {empresa}. {detalhe} Novas gestões costumam revisitar o crescimento comercial; gostaria de conectar.'
  }),
  S('novo_socio_diretor', 'pessoas', 'Novo sócio-diretor ou managing partner', 'F', ['Site', 'Notícias'], {
    arm: 'prof',
    decisor: 'Sócio-diretor / managing partner',
    hook: 'vi a nova composição da liderança da {empresa}. {detalhe} Gostaria de conectar e trocar ideias sobre desenvolvimento de negócios em escritórios.'
  }),
  S('saida_lider_marketing', 'pessoas', 'Saída do líder de marketing sem substituto', 'M', ['Sales Navigator'], {
    decisor: 'CEO / diretor comercial',
    hook: 'notei uma transição na área de marketing da {empresa}. Se estiverem repensando a estrutura, posso compartilhar como outras empresas do setor organizaram essa frente.'
  }),
  S('champion_mudou', 'pessoas', 'Contato da base mudou de empresa (champion)', 'F', ['Apollo', 'Sales Navigator'], {
    mvp: true,
    decisor: 'Champion (contato conhecido)',
    hook: 'vi que você está agora na {empresa}, parabéns! Seria ótimo retomar a conversa e entender os desafios comerciais nesse novo desafio.'
  }),
  S('promocao_marketing', 'pessoas', 'Promoção interna para liderança de marketing', 'M', ['Sales Navigator'], {
    decisor: 'Líder de marketing',
    hook: 'parabéns pela promoção na {empresa}! Novas responsabilidades costumam trazer novas metas; gostaria de conectar.'
  }),

  // 2. Contratação
  S(
    'vaga_marketing',
    'contratacao',
    'Vaga de marketing, growth ou mídia paga',
    'F',
    ['LinkedIn Vagas', 'Gupy', 'Site de carreiras'],
    {
      mvp: true,
      decisor: 'Líder de marketing',
      hook: 'vi que a {empresa} está contratando para marketing. {detalhe} Estruturar o processo antes da chegada da pessoa acelera muito a curva; posso compartilhar o que temos visto.'
    }
  ),
  S('vaga_sdr', 'contratacao', 'Vaga de SDR, BDR ou inside sales', 'F', ['LinkedIn Vagas', 'Gupy'], {
    mvp: true,
    decisor: 'Diretor comercial',
    hook: 'vi que a {empresa} está montando time de pré-vendas. {detalhe} A qualidade da lista e dos gatilhos pesa tanto quanto o time; gostaria de trocar ideias.'
  }),
  S('vaga_revops', 'contratacao', 'Vaga de RevOps, CRM ou automação', 'F', ['LinkedIn Vagas', 'Gupy'], {
    mvp: true,
    decisor: 'Diretor comercial / RevOps',
    hook: 'vi a vaga de operações de receita na {empresa}. {detalhe} É um bom momento para alinhar dados, CRM e processo comercial; gostaria de conectar.'
  }),
  S('vaga_dados_marketing', 'contratacao', 'Vaga de dados ou BI de marketing', 'M', ['LinkedIn Vagas', 'Gupy'], {
    decisor: 'Líder de marketing',
    hook: 'vi que a {empresa} está investindo em dados de marketing. Gostaria de conectar e trocar referências sobre mensuração de aquisição B2B.'
  }),
  S('vaga_executivo_regiao', 'contratacao', 'Vaga de executivo de contas em nova região', 'M', ['LinkedIn Vagas'], {
    decisor: 'Diretor comercial',
    hook: 'vi que a {empresa} está expandindo o time comercial para novas regiões. {detalhe} Gostaria de conectar e entender os planos.'
  }),
  S('headcount_crescendo', 'contratacao', 'Headcount crescendo acima de 10% em 6 meses', 'M', ['Apollo'], {
    mvp: true,
    decisor: 'CEO / diretor comercial',
    hook: 'acompanho o crescimento do time da {empresa} nos últimos meses. {detalhe} Crescer assim costuma pressionar a geração de demanda; gostaria de conectar.'
  }),
  S(
    'vaga_gestao_agencias',
    'contratacao',
    'Vaga para agency manager ou gestão de fornecedores',
    'F',
    ['LinkedIn Vagas'],
    {
      decisor: 'Líder de marketing',
      hook: 'vi que a {empresa} está estruturando a gestão de agências e fornecedores. Gostaria de conectar e entender o que buscam.'
    }
  ),

  // 3. Movimento corporativo
  S('fusao_aquisicao', 'corporativo', 'Fusão ou aquisição', 'F', ['Notícias', 'CVM'], {
    mvp: true,
    decisor: 'CEO / CMO',
    hook: 'acompanhei a notícia sobre a {empresa}. {detalhe} Integrações assim costumam pedir revisão de marca e de processo comercial; gostaria de conectar.'
  }),
  S('incorporacao_cooperativas', 'corporativo', 'Incorporação entre cooperativas', 'F', ['Banco Central', 'Notícias'], {
    arm: 'fin',
    decisor: 'Superintendente / diretor de negócios',
    hook: 'acompanhei a incorporação envolvendo a {empresa}. {detalhe} Gostaria de conectar e trocar ideias sobre como unificar a frente comercial.'
  }),
  S('novos_socios', 'corporativo', 'Entrada de novos sócios', 'F', ['Receita Federal (quadro societário)', 'Site'], {
    arm: 'prof',
    mvp: true,
    decisor: 'Sócio-diretor',
    hook: 'vi a entrada de novos sócios na {empresa}. {detalhe} É um momento natural para revisar posicionamento e originação de negócios; gostaria de conectar.'
  }),
  S('rodada_investimento', 'corporativo', 'Rodada de investimento', 'F', ['Notícias', 'Apollo'], {
    arm: 'tech',
    mvp: true,
    decisor: 'CEO / CRO',
    hook: 'parabéns pela rodada da {empresa}! {detalhe} Depois da captação, a meta de receita costuma acelerar; gostaria de conectar e trocar ideias sobre go-to-market.'
  }),
  S(
    'nova_filial',
    'corporativo',
    'Abertura de filial ou nova unidade',
    'F',
    ['Receita Federal (CNPJ de filial)', 'Notícias'],
    {
      mvp: true,
      decisor: 'Diretor comercial',
      hook: 'vi que a {empresa} abriu nova unidade. {detalhe} Gostaria de conectar e entender como estão pensando a geração de demanda na nova praça.'
    }
  ),
  S('novo_estado', 'corporativo', 'Entrada em novo estado', 'F', ['Receita Federal', 'Notícias'], {
    decisor: 'Diretor comercial',
    hook: 'vi que a {empresa} está chegando a um novo estado. {detalhe} Gostaria de conectar e trocar ideias sobre entrada em mercado B2B.'
  }),
  S(
    'lancamento_produto',
    'corporativo',
    'Lançamento de produto ou nova linha',
    'M',
    ['Site', 'Notícias', 'LinkedIn da empresa'],
    {
      decisor: 'CMO / head de produto',
      hook: 'vi o lançamento da {empresa}. {detalhe} Gostaria de conectar e acompanhar como está a estratégia de chegada ao mercado.'
    }
  ),
  S('rebranding', 'corporativo', 'Rebranding ou mudança de nome', 'M', ['Receita Federal', 'Site'], {
    decisor: 'CMO',
    hook: 'vi a nova marca da {empresa}. {detalhe} Gostaria de conectar e trocar ideias sobre como levar o reposicionamento para a prospecção.'
  }),
  S(
    'resultado_crescimento',
    'corporativo',
    'Resultado anual divulgado com crescimento',
    'M',
    ['Balanços', 'Banco Central', 'SUSEP'],
    {
      arm: 'fin',
      decisor: 'Diretor de negócios',
      hook: 'vi o resultado divulgado pela {empresa}, parabéns. {detalhe} Gostaria de conectar e entender os planos de crescimento.'
    }
  ),

  // 4. Mercado e regulação
  S(
    'norma_nova',
    'mercado',
    'Norma nova que muda a forma de vender',
    'F',
    ['Banco Central', 'SUSEP', 'CVM', 'Diário Oficial'],
    {
      arm: 'fin',
      decisor: 'Diretor comercial',
      hook: 'a nova regulação do setor muda a forma como empresas como a {empresa} vendem. {detalhe} Gostaria de conectar e trocar ideias sobre a adaptação comercial.'
    }
  ),
  S('open_finance', 'mercado', 'Movimento de Open Finance ou Open Insurance', 'M', ['Banco Central', 'SUSEP'], {
    arm: 'fin',
    decisor: 'Diretor de negócios',
    hook: 'vi o movimento da {empresa} em Open Finance. {detalhe} Gostaria de conectar e trocar ideias.'
  }),
  S(
    'ranking_setorial',
    'mercado',
    'Entrada ou subida em ranking setorial',
    'M',
    ['Análise Advocacia', 'Valor 1000', 'Rankings de cooperativas'],
    {
      decisor: 'Sócio-diretor / CEO',
      hook: 'parabéns pelo reconhecimento da {empresa}. {detalhe} Gostaria de conectar.'
    }
  ),
  S('concorrente_moveu', 'mercado', 'Concorrente direto fez aquisição ou captou', 'M', ['Notícias'], {
    decisor: 'CEO / diretor comercial',
    hook: 'o mercado da {empresa} está se movendo rápido. {detalhe} Gostaria de conectar e trocar ideias sobre como reagir comercialmente.'
  }),
  S(
    'licitacao_vencida',
    'mercado',
    'Licitação ou contrato relevante vencido',
    'M',
    ['Diário Oficial', 'Portais de compras'],
    {
      decisor: 'Diretor comercial',
      hook: 'vi o contrato conquistado pela {empresa}, parabéns. {detalhe} Gostaria de conectar.'
    }
  ),

  // 5. Pegada digital
  S(
    'comecou_anuncios',
    'digital',
    'Começou a anunciar no Google, Meta ou LinkedIn',
    'F',
    ['Central de Transparência do Google', 'Biblioteca de Anúncios da Meta', 'Biblioteca de Anúncios do LinkedIn'],
    {
      mvp: true,
      decisor: 'Líder de marketing',
      hook: 'vi que a {empresa} começou a investir em mídia. {detalhe} Em B2B complexo, o que acontece depois do clique costuma decidir o retorno; gostaria de trocar ideias.'
    }
  ),
  S('pausou_anuncios', 'digital', 'Pausou anúncios após período ativo', 'M', ['Bibliotecas de anúncios'], {
    decisor: 'Líder de marketing',
    hook: 'notei uma mudança na presença em mídia da {empresa}. Se estiverem reavaliando canais, posso compartilhar o que temos visto no setor.'
  }),
  S('site_novo', 'digital', 'Site novo ou redesenhado', 'M', ['Monitor de mudanças no site'], {
    decisor: 'Líder de marketing',
    hook: 'vi o novo site da {empresa}, ficou muito bom. Gostaria de conectar e trocar ideias sobre como transformar o site em geração de demanda.'
  }),
  S('troca_crm', 'digital', 'Troca ou instalação de CRM ou automação', 'F', ['Detecção de tecnologia no site'], {
    mvp: true,
    decisor: 'Diretor comercial / RevOps',
    hook: 'notei que a {empresa} está com nova ferramenta de CRM ou automação. {detalhe} A implantação é o melhor momento para redesenhar o processo; gostaria de conectar.'
  }),
  S(
    'nova_landing',
    'digital',
    'Nova página de captura ou landing page',
    'M',
    ['Monitor de site', 'Bibliotecas de anúncios'],
    {
      decisor: 'Líder de marketing',
      hook: 'vi a nova página de captura da {empresa}. {detalhe} Gostaria de conectar e trocar ideias sobre conversão em B2B.'
    }
  ),
  S('mais_publicacoes', 'digital', 'Aumento de publicações no LinkedIn da empresa', 'M', ['LinkedIn da empresa'], {
    arm: 'tech',
    decisor: 'Líder de marketing',
    hook: 'tenho acompanhado os conteúdos da {empresa} no LinkedIn. Gostaria de conectar e trocar ideias sobre como transformar audiência em pipeline.'
  }),
  S('rfp_agencia', 'digital', 'Publicação de RFP ou busca de agência', 'F', ['Notícias', 'LinkedIn'], {
    decisor: 'Líder de marketing',
    hook: 'vi que a {empresa} está buscando parceiro de marketing. {detalhe} Gostaria de conectar e entender o escopo.'
  }),

  // 6. Engajamento com a Velora
  S('visita_site', 'engajamento', 'Visita a páginas de serviço ou cases', 'F', ['Analytics do site'], {
    mvp: true,
    decisor: 'Líder de marketing / diretor comercial',
    hook: 'obrigado pelo interesse nos conteúdos da Velora. Se fizer sentido, posso compartilhar como aplicamos isso em empresas parecidas com a {empresa}.'
  }),
  S('download_white_paper', 'engajamento', 'Download de white paper por ICP', 'F', ['Formulário do site'], {
    mvp: true,
    decisor: 'Quem baixou',
    hook: 'obrigado por baixar nosso material. Fiquei curioso para saber o que mais chamou sua atenção pensando na {empresa}.'
  }),
  S('interacao_posts', 'engajamento', 'Interação com posts dos sócios', 'M', ['LinkedIn'], {
    decisor: 'Quem interagiu',
    hook: 'obrigado por acompanhar nossas publicações. Seria bom conectar e entender como está o cenário comercial na {empresa}.'
  }),
  S('aceite_conexao', 'engajamento', 'Aceite de convite de conexão', 'M', ['Sales Navigator'], {
    decisor: 'Quem aceitou',
    hook: 'obrigado por aceitar o convite. Tenho acompanhado empresas como a {empresa} e gostaria de entender seus desafios comerciais.'
  }),
  S('presenca_evento', 'engajamento', 'Presença em evento, palestra ou aula', 'F', ['Lista de inscritos'], {
    decisor: 'Participante',
    hook: 'obrigado pela presença no nosso encontro. Seria ótimo continuar a conversa pensando no momento da {empresa}.'
  }),

  // 7. Sinais negativos
  S('demissoes_congelamento', 'negativo', 'Demissões em massa ou congelamento de vagas', 'N', ['Notícias', 'Apollo'], {
    validDays: 90
  }),
  S('recuperacao_judicial', 'negativo', 'Recuperação judicial', 'N', ['Tribunais', 'Notícias'], { validDays: 365 }),
  S(
    'contratou_concorrente',
    'negativo',
    'Contratou consultoria ou agência concorrente há menos de 6 meses',
    'N',
    ['Notícias', 'LinkedIn'],
    {
      validDays: 180
    }
  ),
  S('queda_headcount', 'negativo', 'Queda de headcount acima de 10% em 6 meses', 'N', ['Apollo'], { validDays: 180 })
];

export default {
  id: 'velora',
  name: 'Velora',
  description: 'Prospecção própria da Velora: base-mãe de ABM no Sul e em São Paulo.',
  icp: {
    arms: {
      prof: {
        label: 'Serviços profissionais B2B',
        aliases: [
          'prof',
          'servicos profissionais',
          'advocacia',
          'juridico',
          'consultoria',
          'contabilidade',
          'auditoria'
        ]
      },
      fin: {
        label: 'Serviços financeiros (exceto investimentos)',
        aliases: [
          'fin',
          'servicos financeiros',
          'financeiro',
          'cooperativa',
          'seguros',
          'seguradora',
          'banco',
          'credito'
        ]
      },
      tech: { label: 'Tecnologia B2B madura', aliases: ['tech', 'tecnologia', 'software', 'saas', 'ti'] }
    },
    regions: ['SP', 'PR', 'SC', 'RS'],
    excludedSectors: ['saude', 'hospital', 'clinica', 'investimento']
  },
  abcCriteria: {
    A: 'Fit máximo com o ICP: complexidade, porte e acesso ao decisor.',
    B: 'Fit bom, com alguma ressalva de porte, momento ou acesso.',
    C: 'Fit parcial: entra na cadência só com sinal.'
  },
  scoring: {
    weights: { F: 3, M: 1.5, N: -3 },
    strongThreshold: 3,
    comboBonus: 0.25,
    armOffMultiplier: 0.6,
    validDays: 30,
    headcountThresholds: { growth: 0.1, drop: 0.1 },
    calibration: { minSample: 5, maxChange: 0.5 }
  },
  // Sales Navigator define o teto: 25 contas por semana leva as 100 contas em 4 semanas.
  capacity: { weeklyContacts: 25, cooldownDays: 60, staleDays: 14 },
  goals: { readyAccounts: 100 },
  approach: {
    greeting: 'Olá, {decisor},',
    fallbackHook:
      'acompanho empresas como a {empresa} e gostaria de conectar para trocar ideias sobre crescimento comercial.',
    signature: '',
    // Limite da nota de convite do LinkedIn.
    maxChars: 300,
    forbidden: [
      { term: 'garantimos', reason: 'promessa de resultado soa genérica e pouco crível' },
      { term: 'oportunidade imperdível', reason: 'tom de venda agressiva' },
      { term: 'robô', reason: 'o Radar prepara, a pessoa envia' }
    ]
  },
  families,
  signals
};
