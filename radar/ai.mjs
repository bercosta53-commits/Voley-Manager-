// Tudo o que o Radar pede à IA: o texto de cada pedido e a checagem de cada resposta.
// A IA não navega na internet; ela só lê o que o painel envia. Nada que ela devolve é
// gravado sem passar por aqui e pela revisão de quem usa o painel.
import { normalizeKey, parseDate, stripAccents } from './core.mjs';

const UFS = 'AC AL AP AM BA CE DF ES GO MA MT MS MG PA PB PR PE PI RJ RN RS RO RR SC SP SE TO'.split(' ');
const text = (v, max = 400) =>
  String(v ?? '')
    .replace(/\s+/g, ' ')
    .trim()
    .slice(0, max);
const list = (v, max = 12, len = 80) =>
  (Array.isArray(v) ? v : [])
    .map(x => text(x, len))
    .filter(Boolean)
    .slice(0, max);
const fold = s => stripAccents(s).toLowerCase().trim();

function catalogLines(profile) {
  return profile.signals
    .filter(s => s.strength !== 'N')
    .map(s => `${s.id}: ${s.label}`)
    .join('\n');
}

// ---------- ICP ----------

// Representa o ICP atual do perfil no mesmo formato que a IA devolve, para desenhar e ajustar.
export function icpFromProfile(profile) {
  if (profile.icpDesign) return profile.icpDesign;
  const arms = Object.entries(profile.icp.arms).map(([id, arm]) => ({
    id,
    nome: arm.label,
    descricao: arm.descricao || '',
    setores: arm.setores || (arm.aliases || []).filter(a => a !== id).slice(0, 6),
    porte: arm.porte || '',
    decisores: arm.decisores || [],
    sinaisChave: profile.signals.filter(s => s.enabled && s.arm === id).map(s => s.id)
  }));
  return {
    resumo: profile.description,
    bracos: arms,
    regioes: profile.icp.regions || [],
    exclusoes: profile.icp.excludedSectors || [],
    abc: { ...profile.abcCriteria },
    tom: profile.approach.tone || '',
    termosEvitar: (profile.approach.forbidden || []).map(f => ({ termo: f.term, motivo: f.reason }))
  };
}

const ICP_FORMAT = `{"resumo":"duas frases","bracos":[{"id":"slug-curto","nome":"Nome do braço","descricao":"uma frase","setores":["setor"],"porte":"faixa de porte","decisores":["cargo"],"sinaisChave":["id-do-catalogo"]}],"regioes":["SP"],"exclusoes":["setor"],"abc":{"A":"critério","B":"critério","C":"critério"},"tom":"uma frase sobre o tom de voz","termosEvitar":[{"termo":"palavra","motivo":"por quê"}]}`;

export function buildIcpPrompt({ description, current, instruction, profile }) {
  const parts = [
    'Você é estrategista de marketing baseado em contas (ABM) para empresas B2B no Brasil.',
    current && instruction
      ? 'Ajuste o ICP (perfil de cliente ideal) abaixo conforme o pedido. Mantenha o que o pedido não mencionar.'
      : 'Desenhe o ICP (perfil de cliente ideal) da operação de prospecção descrita abaixo.',
    '',
    `Descrição da operação:\n"""${text(description, 6000)}"""`
  ];
  if (current && instruction)
    parts.push(
      '',
      `ICP atual (JSON):\n${JSON.stringify(current)}`,
      '',
      `Pedido de ajuste:\n"""${text(instruction, 2000)}"""`
    );
  parts.push(
    '',
    'Catálogo de sinais que o radar monitora (id: descrição):',
    catalogLines(profile),
    '',
    'Responda somente com um objeto JSON neste formato:',
    ICP_FORMAT,
    '',
    'Regras:',
    '- De 1 a 4 braços; ids em minúsculas, sem acento, com hífen.',
    '- sinaisChave só com ids do catálogo acima, de 3 a 8 por braço, os que mais indicam momento de compra naquele braço.',
    '- regioes com siglas de UF; lista vazia significa o Brasil todo.',
    '- Critérios ABC objetivos e verificáveis numa pesquisa rápida (porte, setor, complexidade da venda, acesso ao decisor).',
    '- decisores são cargos, nunca nomes de pessoas.',
    '- Escreva em português do Brasil.'
  );
  return parts.join('\n');
}

// Confere e limpa o ICP devolvido pela IA. Lança erro com mensagem legível se não servir.
export function sanitizeIcp(raw, profile) {
  if (!raw || typeof raw !== 'object' || Array.isArray(raw)) throw new Error('a resposta não veio no formato esperado');
  const known = new Set(profile.signals.filter(s => s.strength !== 'N').map(s => s.id));
  const used = new Set();
  const bracos = (Array.isArray(raw.bracos) ? raw.bracos : [])
    .filter(b => text(b?.id) || text(b?.nome))
    .slice(0, 4)
    .map(b => {
      let id =
        normalizeKey(b?.id || b?.nome)
          .replace(/_/g, '-')
          .slice(0, 24) || 'braco';
      while (used.has(id)) id += '-2';
      used.add(id);
      return {
        id,
        nome: text(b?.nome, 60) || id,
        descricao: text(b?.descricao, 240),
        setores: list(b?.setores, 10, 60),
        porte: text(b?.porte, 120),
        decisores: list(b?.decisores, 6, 60),
        sinaisChave: [...new Set(list(b?.sinaisChave, 12, 40))].filter(id => known.has(id))
      };
    });
  if (!bracos.length) throw new Error('a IA não devolveu nenhum braço de ICP');
  const abc = {};
  for (const k of ['A', 'B', 'C']) abc[k] = text(raw.abc?.[k], 300) || profile.abcCriteria[k] || '';
  return {
    resumo: text(raw.resumo, 400),
    bracos,
    regioes: [...new Set(list(raw.regioes, 27, 4).map(u => u.toUpperCase()))].filter(u => UFS.includes(u)),
    exclusoes: list(raw.exclusoes, 12, 60),
    abc,
    tom: text(raw.tom, 240),
    termosEvitar: (Array.isArray(raw.termosEvitar) ? raw.termosEvitar : [])
      .slice(0, 12)
      .map(t => ({ termo: text(t?.termo, 40), motivo: text(t?.motivo, 120) }))
      .filter(t => t.termo)
  };
}

// Converte um ICP desenhado em ajustes do espaço (overrides), sem tocar no perfil-base.
export function applyIcpDraft(overrides, draft, profile) {
  const arms = Object.fromEntries(
    draft.bracos.map(b => [
      b.id,
      {
        label: b.nome,
        aliases: [b.id, b.nome, ...b.setores],
        descricao: b.descricao,
        setores: b.setores,
        porte: b.porte,
        decisores: b.decisores
      }
    ])
  );
  const signals = { ...overrides.signals };
  for (const s of profile.signals) {
    if (s.strength === 'N') continue;
    const owners = draft.bracos.filter(b => b.sinaisChave.includes(s.id)).map(b => b.id);
    // Sinal-chave de um único braço pesa mais nele; de vários ou de nenhum, vale igual para todos.
    const entry = { ...signals[s.id], arm: owners.length === 1 ? owners[0] : null };
    if (owners.length) entry.enabled = true;
    signals[s.id] = entry;
  }
  const baseForbidden = (profile.approach.forbidden || []).filter(
    f => !draft.termosEvitar.some(t => fold(t.termo) === fold(f.term))
  );
  return {
    ...overrides,
    icp: { arms, regions: draft.regioes, excludedSectors: draft.exclusoes.map(e => fold(e)) },
    abcCriteria: { ...draft.abc },
    approach: {
      ...overrides.approach,
      tone: draft.tom,
      forbidden: [
        ...baseForbidden,
        ...draft.termosEvitar.map(t => ({ term: t.termo, reason: t.motivo || 'definido no ICP' }))
      ]
    },
    signals,
    icpDesign: draft
  };
}

function icpBrief(profile) {
  const arms = Object.entries(profile.icp.arms)
    .map(
      ([id, a]) =>
        `- ${id}: ${a.label}${a.setores?.length ? ` — setores: ${a.setores.join(', ')}` : ''}${a.porte ? `; porte: ${a.porte}` : ''}${a.decisores?.length ? `; decisores: ${a.decisores.join(', ')}` : ''}`
    )
    .join('\n');
  return [
    'Braços do ICP (id: descrição):',
    arms,
    `Geografia: ${profile.icp.regions?.length ? profile.icp.regions.join(', ') : 'Brasil todo'}`,
    `Fora do ICP: ${profile.icp.excludedSectors?.join(', ') || 'nada'}`,
    'Critérios ABC:',
    ...['A', 'B', 'C'].map(k => `- ${k}: ${profile.abcCriteria[k]}`)
  ].join('\n');
}

// ---------- classificação de contas (passo 2) ----------

export function buildClassifyPrompt(accounts, profile) {
  const rows = accounts.map(a =>
    JSON.stringify({
      id: a.id,
      nome: a.nome,
      setor: a.setor || undefined,
      cidade: a.cidade || undefined,
      uf: a.uf || undefined,
      site: a.dominio || undefined,
      observacoes: a.observacoes ? text(a.observacoes, 200) : undefined
    })
  );
  return [
    'Classifique as contas de uma base de prospecção B2B segundo o ICP abaixo.',
    '',
    icpBrief(profile),
    '',
    'Contas (uma por linha, JSON):',
    ...rows,
    '',
    'Responda somente com um array JSON, um objeto por conta, neste formato:',
    '[{"id":"id da conta","abc":"A","braco":"id do braço ou vazio","cargo":"cargo do decisor a procurar","decisor":"","confianca":"alta","motivo":"até 15 palavras"}]',
    '',
    'Regras:',
    '- abc é A, B ou C conforme os critérios. braco é um dos ids acima, ou vazio se não se encaixar.',
    '- Use o que você sabe sobre a empresa quando ela for conhecida; senão, deduza pelo nome, setor e site e use confianca "baixa".',
    '- decisor: só o nome de uma pessoa pública que você tenha alta certeza de ocupar o cargo hoje; na dúvida, deixe vazio. Nunca invente nomes.',
    '- confianca é "alta", "media" ou "baixa".'
  ].join('\n');
}

export function sanitizeClassification(raw, accounts, profile) {
  const ids = new Set(accounts.map(a => a.id));
  const arms = new Set(Object.keys(profile.icp.arms));
  const seen = new Set();
  return (Array.isArray(raw) ? raw : [])
    .filter(r => r && ids.has(String(r.id)) && !seen.has(String(r.id)) && seen.add(String(r.id)))
    .map(r => ({
      id: String(r.id),
      abc: ['A', 'B', 'C'].includes(String(r.abc).toUpperCase()) ? String(r.abc).toUpperCase() : '',
      braco: arms.has(String(r.braco)) ? String(r.braco) : '',
      cargo: text(r.cargo, 80),
      decisor: text(r.decisor, 80),
      confianca: ['alta', 'media', 'baixa'].includes(fold(r.confianca)) ? fold(r.confianca) : 'baixa',
      motivo: text(r.motivo, 160)
    }));
}

// ---------- sinais a partir de texto colado (passo 3) ----------

export function buildSignalExtractPrompt({ source, accounts, profile, today }) {
  return [
    'Leia o material abaixo (notícias, vagas, posts, anotações de pesquisa) e identifique sinais de compra das contas da lista.',
    `Data de hoje: ${today}.`,
    '',
    'Contas da base (uma por linha):',
    ...accounts.map(a => a.nome),
    '',
    'Tipos de sinal (id: descrição):',
    profile.signals
      .filter(s => s.enabled)
      .map(s => `${s.id}: ${s.label}${s.strength === 'N' ? ' (negativo)' : ''}`)
      .join('\n'),
    '',
    `Material:\n"""${text(source, 30000)}"""`,
    '',
    'Responda somente com um array JSON neste formato (array vazio se não houver sinal):',
    '[{"conta":"nome exatamente como na lista","tipo":"id do sinal","data":"AAAA-MM-DD","detalhe":"até 15 palavras","pessoa":"","fonte":"de onde veio a informação","trecho":"frase do material que comprova"}]',
    '',
    'Regras: só inclua sinais com evidência no material e contas presentes na lista. Sem data no material, use a data de hoje. Não invente.'
  ].join('\n');
}

export function sanitizeExtractedSignals(raw, accounts, profile, today) {
  const byName = new Map(accounts.map(a => [fold(a.nome), a]));
  return (Array.isArray(raw) ? raw : [])
    .map(r => {
      const account = byName.get(fold(r?.conta));
      const def = profile.signalById[String(r?.tipo)];
      const date = parseDate(r?.data) || today;
      if (!account || !def || !def.enabled || date > today) return null;
      return {
        accountId: account.id,
        conta: account.nome,
        type: def.id,
        label: def.label,
        strength: def.strength,
        date,
        detail: text(r.detalhe, 160),
        person: text(r.pessoa, 80),
        source: text(r.fonte, 80) || 'Pesquisa com IA',
        evidence: text(r.trecho, 240)
      };
    })
    .filter(Boolean);
}

// ---------- abordagens (passo 4) ----------

export function buildHooksPrompt(items, profile) {
  const rules = profile.approach;
  return [
    `Escreva a primeira linha de abordagem (nota do convite de conexão no LinkedIn) que a equipe de ${profile.name} vai revisar e enviar para cada conta.`,
    '',
    'Regras:',
    `- No máximo ${rules.maxChars || 300} caracteres, em português do Brasil.`,
    '- Comece com "Olá, <primeiro nome>," quando houver decisor; sem decisor, comece direto.',
    '- Cite o sinal de forma natural e específica; nada de elogio genérico.',
    '- Sem promessa de resultado, sem preço, sem pedir reunião logo de cara.',
    rules.tone ? `- Tom: ${rules.tone}` : '- Tom: consultivo, direto e cordial.',
    rules.forbidden?.length ? `- Nunca use: ${rules.forbidden.map(f => f.term).join(', ')}.` : '',
    '',
    'Contas (JSON):',
    JSON.stringify(items),
    '',
    'Responda somente com um array JSON: [{"id":"id da conta","texto":"a abordagem"}]'
  ]
    .filter(line => line !== '')
    .join('\n');
}

export function sanitizeHooks(raw, ids) {
  const allowed = new Set(ids);
  return (Array.isArray(raw) ? raw : [])
    .filter(r => r && allowed.has(String(r.id)) && text(r.texto))
    .map(r => ({ id: String(r.id), texto: text(r.texto, 600) }));
}
