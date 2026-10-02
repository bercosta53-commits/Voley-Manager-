// Núcleo do Radar de Sinais. Nada aqui é específico de um cliente: tudo o que muda
// de cliente para cliente chega pelo perfil (ver profiles/).

export const CADENCE_STATUSES = [
  { id: 'convite_enviado', label: 'Convite enviado', open: true },
  { id: 'aceito', label: 'Convite aceito', open: true },
  { id: 'respondeu', label: 'Respondeu', open: true },
  { id: 'reuniao', label: 'Reunião marcada', open: false },
  { id: 'sem_resposta', label: 'Sem resposta', open: false },
  { id: 'descartada', label: 'Descartada', open: false }
];
const OPEN_STATUSES = new Set(CADENCE_STATUSES.filter(s => s.open).map(s => s.id));
const ACCEPTED = new Set(['aceito', 'respondeu', 'reuniao']);
const REPLIED = new Set(['respondeu', 'reuniao']);

// Matriz ABC × sinal. `contact` indica se a célula entra na fila de contato.
export const ACTIONS = {
  semana_personalizada: { label: 'Contato nesta semana, abordagem personalizada', rank: 1, contact: true },
  semana: { label: 'Contato nesta semana', rank: 2, contact: true },
  duas_semanas: { label: 'Contato nas próximas 2 semanas', rank: 3, contact: true },
  fila_normal: { label: 'Fila normal', rank: 4, contact: true },
  aquecimento: { label: 'Aquecimento: conteúdo e interação', rank: 5, contact: false },
  monitorar: { label: 'Monitorar', rank: 6, contact: false },
  fora: { label: 'Fora da cadência', rank: 7, contact: false },
  bloqueada: { label: 'Bloqueada por sinal negativo', rank: 8, contact: false },
  fora_icp: { label: 'Fora do ICP', rank: 9, contact: false }
};
export const MATRIX = {
  A: { forte: 'semana_personalizada', medio: 'duas_semanas', nenhum: 'aquecimento' },
  B: { forte: 'semana', medio: 'fila_normal', nenhum: 'monitorar' },
  C: { forte: 'fila_normal', medio: 'monitorar', nenhum: 'fora' }
};
export const TIER_LABELS = { forte: 'Sinal forte recente', medio: 'Sinal médio', nenhum: 'Sem sinal' };

// ---------- texto, CSV e datas ----------

export const stripAccents = s =>
  String(s ?? '')
    .normalize('NFD')
    .replace(/[̀-ͯ]/g, '');
export const normalizeKey = s =>
  stripAccents(s)
    .toLowerCase()
    .trim()
    .replace(/[^a-z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
export const onlyDigits = s => String(s ?? '').replace(/\D/g, '');

export function parseCsv(text) {
  text = String(text ?? '').replace(/^﻿/, '');
  const firstLine = text.split(/\r?\n/, 1)[0];
  // Tabulação vem de células coladas do Excel ou do Google Planilhas.
  const count = ch => firstLine.split(ch).length - 1;
  const delim = ['\t', ';', ','].reduce((best, ch) => (count(ch) > count(best) ? ch : best), ',');
  const rows = [];
  let row = [],
    field = '',
    quoted = false;
  for (let i = 0; i < text.length; i++) {
    const ch = text[i];
    if (quoted) {
      if (ch === '"' && text[i + 1] === '"') ((field += '"'), i++);
      else if (ch === '"') quoted = false;
      else field += ch;
    } else if (ch === '"') quoted = true;
    else if (ch === delim) (row.push(field), (field = ''));
    else if (ch === '\n' || ch === '\r') {
      if (ch === '\r' && text[i + 1] === '\n') i++;
      (row.push(field), rows.push(row), (row = []), (field = ''));
    } else field += ch;
  }
  if (field !== '' || row.length) (row.push(field), rows.push(row));
  const nonEmpty = rows.filter(r => r.some(c => c.trim() !== ''));
  if (!nonEmpty.length) return [];
  const header = nonEmpty[0].map(normalizeKey);
  return nonEmpty.slice(1).map(r => Object.fromEntries(header.map((h, i) => [h, (r[i] ?? '').trim()])));
}

export function toCsv(rows, columns) {
  const esc = v => {
    const s = String(v ?? '');
    return /[;"\n\r]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [columns.map(c => esc(c.label)).join(';')];
  for (const r of rows) lines.push(columns.map(c => esc(typeof c.get === 'function' ? c.get(r) : r[c.key])).join(';'));
  return '﻿' + lines.join('\r\n') + '\r\n';
}

export function parseDate(s) {
  s = String(s ?? '').trim();
  let m = s.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (m) return valid(+m[1], +m[2], +m[3]);
  m = s.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})$/);
  if (m) return valid(+m[3], +m[2], +m[1]);
  return null;
  function valid(y, mo, d) {
    const dt = new Date(Date.UTC(y, mo - 1, d));
    return dt.getUTCFullYear() === y && dt.getUTCMonth() === mo - 1 && dt.getUTCDate() === d
      ? dt.toISOString().slice(0, 10)
      : null;
  }
}
const dayNumber = iso => Math.floor(Date.parse(iso + 'T00:00:00Z') / 86400000);
export const daysBetween = (from, to) => dayNumber(to) - dayNumber(from);
export const addDays = (iso, n) => new Date((dayNumber(iso) + n) * 86400000).toISOString().slice(0, 10);
export const todayIso = (d = new Date()) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
// Segunda-feira da semana que contém `iso`.
export const weekStart = iso => addDays(iso, -((new Date(iso + 'T00:00:00Z').getUTCDay() + 6) % 7));

// ---------- identificação de contas ----------

export function isValidCnpj(value) {
  const d = onlyDigits(value);
  if (d.length !== 14 || /^(\d)\1{13}$/.test(d)) return false;
  const check = len => {
    const weights = len === 12 ? [5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2] : [6, 5, 4, 3, 2, 9, 8, 7, 6, 5, 4, 3, 2];
    const sum = weights.reduce((acc, w, i) => acc + w * +d[i], 0);
    const r = sum % 11;
    return r < 2 ? 0 : 11 - r;
  };
  return check(12) === +d[12] && check(13) === +d[13];
}
// Matriz e filiais compartilham os 8 primeiros dígitos: casam como a mesma conta.
export const cnpjRoot = value => {
  const d = onlyDigits(value);
  return d.length === 14 ? d.slice(0, 8) : '';
};
export const normDomain = value =>
  String(value ?? '')
    .trim()
    .toLowerCase()
    .replace(/^https?:\/\//, '')
    .replace(/^www\./, '')
    .split(/[/?#]/)[0];
const LEGAL_SUFFIXES = /\b(ltda|s\/?a|eireli|me|epp|sociedade de advogados|advogados associados)\b\.?/g;
export const normName = value =>
  stripAccents(value)
    .toLowerCase()
    .replace(LEGAL_SUFFIXES, ' ')
    .replace(/[^a-z0-9]+/g, ' ')
    .trim();

// ---------- perfil ----------

// Aplica ajustes feitos no painel (pesos, capacidade) sobre o perfil-base, sem alterá-lo.
export function resolveProfile(base, overrides = {}) {
  const signals = base.signals.map(s => {
    const o = overrides.signals?.[s.id];
    return o ? { ...s, ...o } : s;
  });
  // Um ICP desenhado no painel substitui braços, geografia e exclusões do perfil-base.
  const icp = overrides.icp ? { ...base.icp, ...overrides.icp } : base.icp;
  return {
    ...base,
    icp,
    abcCriteria: { ...base.abcCriteria, ...overrides.abcCriteria },
    approach: { ...base.approach, ...overrides.approach },
    icpDesign: overrides.icpDesign || null,
    scoring: { ...base.scoring, ...overrides.scoring },
    capacity: { ...base.capacity, ...overrides.capacity },
    signals,
    signalById: Object.fromEntries(signals.map(s => [s.id, s]))
  };
}

export function findSignalType(profile, value) {
  const key = normalizeKey(value);
  if (!key) return null;
  return profile.signals.find(s => s.id === key || normalizeKey(s.id) === key || normalizeKey(s.label) === key) || null;
}

const HEADER_ALIASES = {
  nome: ['nome', 'empresa', 'conta', 'razao_social', 'nome_fantasia', 'company', 'account'],
  cnpj: ['cnpj'],
  site: ['site', 'dominio', 'website', 'url', 'domain'],
  uf: ['uf', 'estado', 'state'],
  cidade: ['cidade', 'municipio', 'city'],
  setor: ['setor', 'segmento', 'industria', 'industry', 'vertical'],
  braco: ['braco', 'braco_icp', 'icp', 'arm'],
  abc: ['abc', 'classe', 'curva_abc', 'tier', 'classificacao'],
  decisor: ['decisor', 'contato', 'decisor_sugerido', 'nome_decisor'],
  cargo: ['cargo', 'cargo_decisor', 'titulo', 'title'],
  linkedin: ['linkedin', 'linkedin_decisor', 'perfil_linkedin'],
  uf_decisor: ['uf_decisor', 'estado_decisor'],
  headcount: ['headcount', 'funcionarios', 'colaboradores', 'employees'],
  headcount_6m: ['headcount_6m', 'headcount_6_meses', 'funcionarios_6m', 'headcount_anterior'],
  observacoes: ['observacoes', 'obs', 'notas', 'notes']
};
export const ACCOUNT_FIELD_LABELS = {
  nome: 'Nome da empresa',
  cnpj: 'CNPJ',
  site: 'Site',
  uf: 'UF',
  cidade: 'Cidade',
  setor: 'Setor',
  braco: 'Braço do ICP',
  abc: 'Classe ABC',
  decisor: 'Decisor',
  cargo: 'Cargo do decisor',
  linkedin: 'LinkedIn do decisor',
  uf_decisor: 'UF do decisor',
  headcount: 'Headcount atual',
  headcount_6m: 'Headcount 6 meses atrás',
  observacoes: 'Observações'
};

// Diz, para cada coluna da planilha, qual campo da conta ela preenche (ou nenhum).
export function mapAccountColumns(headers) {
  return headers.map(header => ({
    header,
    field: Object.keys(HEADER_ALIASES).find(f => HEADER_ALIASES[f].includes(header)) || null
  }));
}

function pick(row, field) {
  for (const alias of HEADER_ALIASES[field]) if (row[alias] != null && row[alias] !== '') return row[alias];
  return '';
}

export function parseArm(value, profile) {
  const key = normalizeKey(value);
  if (!key) return '';
  for (const [id, arm] of Object.entries(profile.icp.arms))
    if (key === id || [arm.label, ...(arm.aliases || [])].some(a => key.startsWith(normalizeKey(a)))) return id;
  return '';
}

export function icpIssues(account, profile) {
  const issues = [];
  const { regions, excludedSectors = [] } = profile.icp;
  if (regions?.length) {
    const ufs = [account.uf, account.ufDecisor].map(u => String(u || '').toUpperCase()).filter(Boolean);
    if (ufs.length && !ufs.some(u => regions.includes(u)))
      issues.push(`Fora da geografia (${ufs.join('/')}; aceitas: ${regions.join(', ')})`);
  }
  const sector = normalizeKey(account.setor);
  const hit = excludedSectors.find(s => sector.includes(normalizeKey(s)));
  if (hit) issues.push(`Setor fora do ICP: ${hit}`);
  return issues;
}

// ---------- importação ----------

export function importAccounts(existing, rows, profile, today = todayIso()) {
  const accounts = existing.map(a => ({ ...a }));
  const byRoot = new Map(),
    byDomain = new Map(),
    byName = new Map();
  const index = a => {
    if (a.cnpjRoot) byRoot.set(a.cnpjRoot, a);
    if (a.dominio) byDomain.set(a.dominio, a);
    if (a.nomeNorm) byName.set(a.nomeNorm, a);
  };
  accounts.forEach(index);
  const report = { added: 0, merged: 0, skipped: [], warnings: [], derivedSignals: [] };
  rows.forEach((row, i) => {
    const line = i + 2;
    const nome = pick(row, 'nome');
    const cnpjRaw = pick(row, 'cnpj');
    if (!nome && !cnpjRaw) return report.skipped.push({ line, reason: 'Linha sem nome nem CNPJ' });
    const cnpj = onlyDigits(cnpjRaw);
    if (cnpjRaw && !isValidCnpj(cnpj)) report.warnings.push({ line, reason: `CNPJ inválido: ${cnpjRaw}` });
    const abcRaw = pick(row, 'abc').toUpperCase();
    const abc = ['A', 'B', 'C'].includes(abcRaw) ? abcRaw : '';
    if (abcRaw && !abc) report.warnings.push({ line, reason: `Classe ABC desconhecida: ${abcRaw}` });
    const incoming = {
      nome,
      cnpj: isValidCnpj(cnpj) ? cnpj : '',
      cnpjRoot: isValidCnpj(cnpj) ? cnpjRoot(cnpj) : '',
      dominio: normDomain(pick(row, 'site')),
      nomeNorm: normName(nome),
      uf: pick(row, 'uf').toUpperCase(),
      cidade: pick(row, 'cidade'),
      setor: pick(row, 'setor'),
      braco: parseArm(pick(row, 'braco'), profile),
      abc,
      decisor: pick(row, 'decisor'),
      cargo: pick(row, 'cargo'),
      linkedin: pick(row, 'linkedin'),
      ufDecisor: pick(row, 'uf_decisor').toUpperCase(),
      observacoes: pick(row, 'observacoes')
    };
    const match =
      (incoming.cnpjRoot && byRoot.get(incoming.cnpjRoot)) ||
      (incoming.dominio && byDomain.get(incoming.dominio)) ||
      (incoming.nomeNorm && byName.get(incoming.nomeNorm));
    let account;
    if (match) {
      // Campos preenchidos na planilha nova atualizam; vazios não apagam o que já existe.
      for (const [k, v] of Object.entries(incoming)) if (v) match[k] = v;
      match.atualizadaEm = today;
      account = match;
      report.merged++;
    } else {
      account = {
        id: incoming.cnpjRoot ? `cnpj-${incoming.cnpjRoot}` : `conta-${uid()}`,
        ...incoming,
        criadaEm: today,
        atualizadaEm: today
      };
      if (!account.nome) account.nome = `CNPJ ${cnpjRaw}`;
      accounts.push(account);
      report.added++;
    }
    index(account);
    const hc = Number(onlyDigits(pick(row, 'headcount'))),
      hc6 = Number(onlyDigits(pick(row, 'headcount_6m')));
    if (hc > 0 && hc6 > 0) {
      const variation = (hc - hc6) / hc6;
      const { growth, drop } = profile.scoring.headcountThresholds;
      const type = variation > growth ? 'headcount_crescendo' : variation < -drop ? 'queda_headcount' : '';
      if (type && profile.signalById[type])
        report.derivedSignals.push({
          accountId: account.id,
          type,
          date: today,
          source: 'Planilha (headcount)',
          detail: `${hc6} → ${hc} pessoas (${variation > 0 ? '+' : ''}${Math.round(variation * 100)}% em 6 meses)`
        });
    }
  });
  return { accounts, report };
}

export function findAccount(accounts, ref) {
  const root = cnpjRoot(ref.cnpj);
  const domain = normDomain(ref.site);
  const name = normName(ref.nome);
  return (
    (root && accounts.find(a => a.cnpjRoot === root)) ||
    (domain && accounts.find(a => a.dominio === domain)) ||
    (name && accounts.find(a => a.nomeNorm === name)) ||
    null
  );
}

export function importSignals(accounts, existing, rows, profile, today = todayIso()) {
  const report = { added: 0, duplicates: 0, skipped: [] };
  let signals = existing.slice();
  rows.forEach((row, i) => {
    const line = i + 2;
    const account = findAccount(accounts, {
      cnpj: row.cnpj,
      site: row.site || row.dominio,
      nome: row.empresa || row.nome || row.conta
    });
    if (!account) return report.skipped.push({ line, reason: 'Conta não encontrada na base' });
    const def = findSignalType(profile, row.tipo || row.sinal || row.tipo_sinal);
    if (!def)
      return report.skipped.push({ line, reason: `Tipo de sinal desconhecido: ${row.tipo || row.sinal || ''}` });
    const date = row.data ? parseDate(row.data) : today;
    if (!date) return report.skipped.push({ line, reason: `Data inválida: ${row.data}` });
    const result = addSignal(signals, {
      accountId: account.id,
      type: def.id,
      date,
      source: row.fonte || def.sources[0] || '',
      detail: row.detalhe || row.descricao || '',
      url: row.url || row.link || '',
      person: row.pessoa || row.decisor || ''
    });
    signals = result.signals;
    result.added ? report.added++ : report.duplicates++;
  });
  return { signals, report };
}

// Mesmo tipo, mesma conta, mesma data: é o mesmo sinal.
export function addSignal(signals, signal) {
  const dup = signals.some(s => s.accountId === signal.accountId && s.type === signal.type && s.date === signal.date);
  if (dup) return { signals, added: false };
  return { signals: [...signals, { id: `sinal-${uid()}`, ...signal }], added: true };
}

// ---------- pontuação ----------

export function signalValue(def, account, profile) {
  const { weights, armOffMultiplier } = profile.scoring;
  const base = def.weight ?? weights[def.strength] ?? 0;
  if (def.strength === 'N' || !def.arm || !account.braco || def.arm === account.braco) return base;
  return base * armOffMultiplier;
}

export function evaluateAccount(account, signals, profile, today = todayIso()) {
  const { validDays, comboBonus, strongThreshold } = profile.scoring;
  const issues = icpIssues(account, profile);
  const active = [],
    blockers = [];
  const bestByType = new Map();
  for (const s of signals) {
    if (s.accountId !== account.id) continue;
    const def = profile.signalById[s.type];
    if (!def || !def.enabled) continue;
    const age = daysBetween(s.date, today);
    if (age < 0 || age > (def.validDays ?? validDays)) continue;
    const entry = { signal: s, def, age, value: signalValue(def, account, profile) };
    if (def.strength === 'N') {
      blockers.push(entry);
      continue;
    }
    // Repetições do mesmo tipo contam uma vez: fica a mais recente.
    const prev = bestByType.get(def.id);
    if (!prev || entry.age < prev.age) bestByType.set(def.id, entry);
  }
  active.push(...bestByType.values());
  active.sort((a, b) => b.value - a.value || a.age - b.age);
  const raw = active.reduce((sum, e) => sum + e.value, 0);
  // Sinais combinados na janela valem mais que isolados.
  const score = active.length > 1 ? raw * (1 + comboBonus) : raw;
  const tier = score >= strongThreshold ? 'forte' : score > 0 ? 'medio' : 'nenhum';
  const abc = account.abc || 'C';
  // Sinal forte promove C a B, nunca a A; A continua sendo decisão de fit.
  const effectiveAbc = abc === 'C' && tier === 'forte' ? 'B' : abc;
  let action = MATRIX[abc][tier];
  if (blockers.length) action = 'bloqueada';
  if (issues.length) action = 'fora_icp';
  return {
    account,
    abc,
    effectiveAbc,
    promoted: effectiveAbc !== abc,
    tier,
    score: Math.round(score * 100) / 100,
    active,
    blockers,
    icpIssues: issues,
    action,
    top: active[0] || null
  };
}

// ---------- abordagem ----------

export function fillTemplate(template, vars) {
  return template
    .replace(/\{(\w+)\}/g, (_, k) => vars[k] ?? '')
    .replace(/\s+([,.;:!?])/g, '$1')
    .replace(/\s{2,}/g, ' ')
    .trim();
}

export function lintApproach(text, profile) {
  const rules = profile.approach;
  const warnings = [];
  if (rules.maxChars && text.length > rules.maxChars)
    warnings.push(`Passa do limite de ${rules.maxChars} caracteres (${text.length})`);
  const norm = stripAccents(text).toLowerCase();
  for (const f of rules.forbidden || [])
    if (norm.includes(stripAccents(f.term).toLowerCase())) warnings.push(`Evitar “${f.term}”: ${f.reason}`);
  return warnings;
}

export function suggestDecisor(account, top) {
  if (top?.signal.person) return { nome: top.signal.person, cargo: top.def.decisor || '' };
  if (account.decisor) return { nome: account.decisor, cargo: account.cargo || '' };
  return { nome: '', cargo: top?.def.decisor || '' };
}

export function makeHook(evaluation, profile) {
  const { account, top } = evaluation;
  const decisor = suggestDecisor(account, top);
  const firstName = decisor.nome.split(/\s+/)[0] || '';
  const detail = String(top?.signal.detail || '').trim();
  const vars = {
    empresa: account.nome,
    decisor: firstName,
    cargo: decisor.cargo,
    detalhe: detail && !/[.!?]$/.test(detail) ? detail + '.' : detail,
    cidade: account.cidade || account.uf || '',
    assinatura: profile.approach.signature || ''
  };
  const template = top?.def.hook || profile.approach.fallbackHook;
  let text = fillTemplate(template, vars);
  if (firstName && profile.approach.greeting) text = fillTemplate(profile.approach.greeting, vars) + ' ' + text;
  else text = text.charAt(0).toUpperCase() + text.slice(1);
  return { text, decisor, warnings: lintApproach(text, profile) };
}

// ---------- fila semanal ----------

export function openCadence(cadence, accountId) {
  return cadence.find(c => c.accountId === accountId && OPEN_STATUSES.has(c.status)) || null;
}
function lastCadence(cadence, accountId) {
  return cadence.filter(c => c.accountId === accountId).sort((a, b) => (a.iniciadaEm < b.iniciadaEm ? 1 : -1))[0];
}

export function cadenceBlock(cadence, accountId, profile, today) {
  if (openCadence(cadence, accountId)) return 'Já em cadência';
  const last = lastCadence(cadence, accountId);
  if (!last) return '';
  if (last.status === 'reuniao') return 'Reunião já gerada';
  if (last.status === 'descartada') return 'Descartada';
  if (last.status === 'sem_resposta' && daysBetween(last.atualizadaEm, today) < profile.capacity.cooldownDays)
    return `Sem resposta há menos de ${profile.capacity.cooldownDays} dias`;
  return '';
}

// `snoozed` guarda, por conta, até quando ela fica fora da fila (adiada pelo time).
export function buildQueue({ accounts, signals, cadence = [], snoozed = {}, profile, today = todayIso() }) {
  const evaluations = accounts.map(a => evaluateAccount(a, signals, profile, today));
  const eligible = [],
    held = [];
  for (const ev of evaluations) {
    if (!ACTIONS[ev.action].contact) continue;
    const until = snoozed[ev.account.id];
    const block =
      cadenceBlock(cadence, ev.account.id, profile, today) ||
      (until && until > today ? `Adiada até ${formatDate(until)}` : '');
    block ? held.push({ ...ev, block, snoozedUntil: until > today ? until : null }) : eligible.push(ev);
  }
  eligible.sort(
    (a, b) =>
      ACTIONS[a.action].rank - ACTIONS[b.action].rank ||
      b.score - a.score ||
      (a.top?.age ?? 99) - (b.top?.age ?? 99) ||
      a.account.nome.localeCompare(b.account.nome, 'pt-BR')
  );
  const capacity = profile.capacity.weeklyContacts;
  const withHook = eligible.map(ev => ({ ...ev, hook: makeHook(ev, profile) }));
  return {
    weekStart: weekStart(today),
    today,
    capacity,
    items: withHook.slice(0, capacity),
    overflow: withHook.slice(capacity),
    held,
    warming: evaluations.filter(e => e.action === 'aquecimento'),
    evaluations
  };
}

export function queueRows(queue) {
  return queue.items.map((ev, i) => ({
    posicao: i + 1,
    conta: ev.account.nome,
    cnpj: ev.account.cnpj,
    abc: ev.abc + (ev.promoted ? '→B' : ''),
    acao: ACTIONS[ev.action].label,
    score: ev.score,
    sinal: ev.top?.def.label || '',
    data_sinal: ev.top?.signal.date || '',
    fonte: ev.top?.signal.source || '',
    link: ev.top?.signal.url || '',
    decisor: ev.hook.decisor.nome,
    cargo: ev.hook.decisor.cargo,
    linkedin: ev.account.linkedin,
    abordagem: ev.hook.text,
    alertas: ev.hook.warnings.join(' | ')
  }));
}

export function digestText(queue, profile) {
  const lines = [
    `${profile.name} · fila da semana de ${formatDate(queue.weekStart)}`,
    `${queue.items.length} de ${queue.capacity} vagas preenchidas${queue.overflow.length ? `; ${queue.overflow.length} contas aguardando` : ''}.`,
    ''
  ];
  queue.items.forEach((ev, i) => {
    lines.push(`${i + 1}. ${ev.account.nome} [${ev.abc}${ev.promoted ? '→B' : ''}] · ${ACTIONS[ev.action].label}`);
    if (ev.top)
      lines.push(`   Sinal: ${ev.top.def.label} (${ev.top.signal.source}, ${formatDate(ev.top.signal.date)})`);
    if (ev.hook.decisor.nome || ev.hook.decisor.cargo)
      lines.push(`   Decisor: ${[ev.hook.decisor.nome, ev.hook.decisor.cargo].filter(Boolean).join(' · ')}`);
    lines.push(`   Abordagem: ${ev.hook.text}`);
    lines.push('');
  });
  return lines.join('\n');
}

export const formatDate = iso => (iso ? iso.split('-').reverse().join('/') : '');

// Convites parados há mais de `days` dias sem mudança de status.
export function staleCadence(cadence, today, days) {
  return cadence.filter(
    c => ['convite_enviado', 'aceito'].includes(c.status) && daysBetween(c.atualizadaEm || c.iniciadaEm, today) > days
  );
}

// ---------- resultado e calibragem ----------

export function isReady(account, evaluation) {
  return Boolean(account.abc && account.decisor && !['fora_icp', 'bloqueada'].includes(evaluation.action));
}

const rate = (num, den) => (den ? num / den : null);

export function metrics({ accounts, signals, cadence, profile, today = todayIso() }) {
  const evaluations = accounts.map(a => evaluateAccount(a, signals, profile, today));
  const ready = evaluations.filter(ev => isReady(ev.account, ev)).length;
  const groups = { com: [], sem: [] };
  for (const c of cadence) groups[c.tiposSinal?.length ? 'com' : 'sem'].push(c);
  const summarize = list => {
    // Taxas só sobre convites com desfecho; os pendentes ainda podem ser aceitos.
    const settled = list.filter(c => c.status !== 'convite_enviado');
    const aceitos = list.filter(c => ACCEPTED.has(c.status)).length;
    const respostas = list.filter(c => REPLIED.has(c.status)).length;
    return {
      enviados: list.length,
      comDesfecho: settled.length,
      aceitos,
      respostas,
      reunioes: list.filter(c => c.status === 'reuniao').length,
      taxaAceite: rate(aceitos, settled.length),
      taxaResposta: rate(respostas, settled.length)
    };
  };
  const meetingsByMonth = {};
  for (const c of cadence)
    if (c.status === 'reuniao') {
      const month = (c.atualizadaEm || c.iniciadaEm).slice(0, 7);
      meetingsByMonth[month] = (meetingsByMonth[month] || 0) + 1;
    }
  return {
    ready,
    goal: profile.goals.readyAccounts,
    total: accounts.length,
    comSinal: summarize(groups.com),
    semSinal: summarize(groups.sem),
    meetingsByMonth,
    byAction: Object.fromEntries(Object.keys(ACTIONS).map(k => [k, evaluations.filter(ev => ev.action === k).length]))
  };
}

// Compara a taxa de resposta de cada tipo de sinal com a das abordagens sem sinal e sugere
// um novo peso. A sugestão só aparece com amostra mínima e nunca é aplicada sozinha.
export function calibrate({ cadence, profile }) {
  const { minSample, maxChange } = profile.scoring.calibration;
  // Convite ainda sem desfecho não entra na conta.
  const closed = cadence.filter(c => c.status !== 'convite_enviado');
  const baseList = closed.filter(c => !c.tiposSinal?.length);
  // Suavização de Laplace para amostras pequenas não produzirem taxas extremas.
  const smooth = list => (list.filter(c => REPLIED.has(c.status)).length + 1) / (list.length + 2);
  const baseline = smooth(baseList.length ? baseList : closed);
  return profile.signals
    .filter(def => def.strength !== 'N')
    .map(def => {
      const list = closed.filter(c => c.tiposSinal?.includes(def.id));
      const currentWeight = def.weight ?? profile.scoring.weights[def.strength];
      if (list.length < minSample) return { def, n: list.length, enough: false };
      const ratio = Math.min(1 + maxChange, Math.max(1 - maxChange, smooth(list) / baseline));
      return {
        def,
        n: list.length,
        enough: true,
        responseRate: rate(list.filter(c => REPLIED.has(c.status)).length, list.length),
        ratio,
        currentWeight,
        suggestedWeight: Math.round(currentWeight * ratio * 10) / 10
      };
    });
}

let counter = 0;
function uid() {
  counter = (counter + 1) % 1e6;
  return Date.now().toString(36) + counter.toString(36) + Math.random().toString(36).slice(2, 6);
}
