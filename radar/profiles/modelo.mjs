// Perfil-modelo do braço de serviços profissionais (escritórios de advocacia), ponto de partida
// para clientes como a Lefosse. Reaproveita o catálogo da Velora e muda só o que é do cliente:
// ICP, pesos por setor, tom de voz e regras de publicidade da OAB.
// Os valores abaixo são sugestões e devem ser revistos no onboarding.
import velora from './velora.mjs';

const overrides = {
  // No jurídico, sócios e rankings pesam mais; engajamento é com o conteúdo do próprio cliente.
  novo_socio_diretor: { enabled: true, strength: 'F', arm: null },
  novos_socios: { arm: null },
  ranking_setorial: { enabled: true, strength: 'F' },
  licitacao_vencida: { enabled: true },
  visita_site: {
    hook: 'obrigado pelo interesse nos nossos conteúdos. Se for útil, posso compartilhar nossa análise sobre o tema pensando no contexto da {empresa}.'
  },
  download_white_paper: {
    hook: 'obrigado por baixar nosso material. Fiquei curioso para saber quais pontos são mais relevantes para a {empresa}.'
  },
  interacao_posts: {
    hook: 'obrigado por acompanhar nossas publicações. Seria bom conectar e trocar impressões sobre o tema.'
  }
};

export default {
  ...velora,
  id: 'modelo-juridico',
  name: 'Modelo · serviços profissionais (jurídico)',
  description: 'Perfil-modelo para escritórios de advocacia; base para o piloto da Lefosse.',
  icp: {
    ...velora.icp,
    regions: [],
    excludedSectors: ['saude']
  },
  capacity: { weeklyContacts: 20, cooldownDays: 90 },
  goals: { readyAccounts: 80 },
  approach: {
    ...velora.approach,
    fallbackHook: 'acompanho a {empresa} e gostaria de conectar para trocar impressões sobre temas do setor.',
    forbidden: [
      { term: 'garantimos', reason: 'Código de Ética da OAB veda promessa de resultado' },
      { term: 'melhor escritório', reason: 'publicidade da advocacia não admite autoengrandecimento' },
      { term: 'preço', reason: 'publicidade da advocacia não pode mencionar honorários ou captação por preço' },
      { term: 'desconto', reason: 'vedada a mercantilização da advocacia' },
      { term: 'honorários', reason: 'vedada a mercantilização da advocacia' }
    ]
  },
  families: { ...velora.families, engajamento: 'Engajamento com o escritório' },
  signals: velora.signals.map(s => (overrides[s.id] ? { ...s, ...overrides[s.id] } : s))
};
