import {
  ACTIONS,
  CADENCE_STATUSES,
  TIER_LABELS,
  addDays,
  addSignal,
  buildQueue,
  calibrate,
  daysBetween,
  digestText,
  evaluateAccount,
  formatDate,
  importAccounts,
  importSignals,
  isValidCnpj,
  lintApproach,
  metrics,
  parseCsv,
  parseDate,
  queueRows,
  resolveProfile,
  toCsv,
  todayIso
} from './core.mjs';
import { profiles, profileById } from './profiles/index.mjs';
import * as store from './store.mjs';

const TABS = [
  ['fila', 'Fila da semana'],
  ['contas', 'Contas'],
  ['sinais', 'Sinais'],
  ['resultados', 'Resultados'],
  ['perfil', 'Perfil']
];
const $ = sel => document.querySelector(sel);
const view = $('#view');
const dialog = $('#dialog');

const state = {
  wsId: null,
  data: null,
  profile: null,
  tab: 'fila',
  today: todayIso(),
  filter: { text: '', action: '' },
  lastReport: null
};

const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const strengthLabel = { F: 'Forte', M: 'Médio', N: 'Negativo' };

// ---------- espaço de trabalho ----------

function openWorkspace(id) {
  const meta = store.listWorkspaces().find(w => w.id === id);
  const base = meta && profileById(meta.profileId);
  if (!base) return;
  state.wsId = id;
  state.data = store.loadWorkspace(id);
  state.data.drafts ||= {};
  state.base = base;
  state.profile = resolveProfile(base, state.data.overrides);
  state.lastReport = null;
  try {
    localStorage.setItem('radar:ultimo', id);
  } catch {}
  render();
}

function save() {
  state.profile = resolveProfile(state.base, state.data.overrides);
  if (!store.saveWorkspace(state.wsId, state.data)) toast('Não foi possível salvar no navegador.');
}

function ensureWorkspace() {
  let list = store.listWorkspaces();
  if (!list.length) (store.createWorkspace('Velora', 'velora'), (list = store.listWorkspaces()));
  let last = null;
  try {
    last = localStorage.getItem('radar:ultimo');
  } catch {}
  openWorkspace(list.some(w => w.id === last) ? last : list[0].id);
}

// ---------- utilidades de interface ----------

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.textContent = msg;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3200);
}

function download(name, content, type = 'text/csv;charset=utf-8') {
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

async function copy(text) {
  try {
    await navigator.clipboard.writeText(text);
    toast('Copiado.');
  } catch {
    toast('Não foi possível copiar; selecione o texto manualmente.');
  }
}

const readFile = file =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });

const accountById = id => state.data.accounts.find(a => a.id === id);
const evaluate = a => evaluateAccount(a, state.data.signals, state.profile, state.today);
const latestCadence = id =>
  state.data.cadence.filter(c => c.accountId === id).sort((a, b) => (a.iniciadaEm < b.iniciadaEm ? 1 : -1))[0];

function abcBadge(ev) {
  return `<span class="badge ${esc(ev.abc)}">${esc(ev.abc)}${ev.promoted ? ' → B' : ''}</span>`;
}
function actionBadge(action) {
  const cls = action === 'bloqueada' || action === 'fora_icp' ? 'bad' : ACTIONS[action].contact ? '' : 'plain';
  return `<span class="badge ${cls}">${esc(ACTIONS[action].label)}</span>`;
}
function signalLine(entry) {
  const { signal, def } = entry;
  const link = signal.url ? ` · <a href="${esc(signal.url)}" target="_blank" rel="noopener">link</a>` : '';
  return `<div class="small"><span class="badge plain">${esc(strengthLabel[def.strength])}</span> ${esc(def.label)}
    <span class="muted">· ${esc(signal.source)} · ${esc(formatDate(signal.date))}${signal.detail ? ` · ${esc(signal.detail)}` : ''}</span>${link}</div>`;
}

// ---------- renderização ----------

function renderHeader() {
  const list = store.listWorkspaces();
  $('#workspace').innerHTML = list
    .map(w => `<option value="${esc(w.id)}" ${w.id === state.wsId ? 'selected' : ''}>${esc(w.name)}</option>`)
    .join('');
  $('#ref-date').value = state.today;
  $('#tabs').innerHTML = TABS.map(
    ([id, label]) => `<button role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${esc(label)}</button>`
  ).join('');
}

function render() {
  renderHeader();
  const scroll = window.scrollY;
  view.innerHTML = {
    fila: renderQueue,
    contas: renderAccounts,
    sinais: renderSignals,
    resultados: renderResults,
    perfil: renderProfile
  }[state.tab]();
  window.scrollTo(0, scroll);
}

function emptyBase() {
  return `<section class="panel"><div class="empty">Nenhuma conta na base ainda.<br />
    <button class="primary" data-action="goto" data-tab="contas" style="margin-top:12px">Importar contas</button></div></section>`;
}

function renderQueue() {
  if (!state.data.accounts.length) return emptyBase();
  const q = buildQueue({ ...state.data, profile: state.profile, today: state.today });
  state.queue = q;
  const cards = q.items
    .map((ev, i) => {
      const id = ev.account.id;
      const text = state.data.drafts[id] ?? ev.hook.text;
      const warnings = lintApproach(text, state.profile);
      return `<div class="card">
        <div class="head"><span class="muted">#${i + 1}</span><strong>${esc(ev.account.nome)}</strong>${abcBadge(ev)}${actionBadge(ev.action)}
          <span class="badge plain">${esc(TIER_LABELS[ev.tier])} · ${ev.score}</span></div>
        <div style="margin:8px 0">${ev.active.map(signalLine).join('')}</div>
        <div class="small"><b>Decisor sugerido:</b> ${esc(ev.hook.decisor.nome || 'a definir')}${ev.hook.decisor.cargo ? ` · ${esc(ev.hook.decisor.cargo)}` : ''}
          ${ev.account.linkedin ? ` · <a href="${esc(ev.account.linkedin)}" target="_blank" rel="noopener">LinkedIn</a>` : ''}</div>
        <label class="field" style="margin-top:8px">Primeira linha de abordagem (revise antes de enviar)
          <textarea data-draft="${esc(id)}">${esc(text)}</textarea></label>
        <div class="row small" style="justify-content:space-between;margin-top:4px">
          <span class="${warnings.length ? 'warn' : 'muted'}" data-warn="${esc(id)}">${warnings.length ? esc(warnings.join(' · ')) : `${text.length} caracteres`}</span>
          <span class="row">
            ${state.data.drafts[id] != null ? `<button class="link" data-action="reset-draft" data-id="${esc(id)}">Restaurar sugestão</button>` : ''}
            <button data-action="copy-hook" data-id="${esc(id)}">Copiar</button>
            <button class="primary" data-action="start-cadence" data-id="${esc(id)}">Convite enviado</button>
          </span>
        </div>
      </div>`;
    })
    .join('');
  const list = (title, items, extra = ev => '') =>
    items.length
      ? `<h3>${esc(title)} (${items.length})</h3><div class="table-wrap"><table><tbody>${items
          .map(
            ev => `<tr><td><button class="link" data-action="open-account" data-id="${esc(ev.account.id)}">${esc(ev.account.nome)}</button></td>
            <td>${abcBadge(ev)}</td><td>${actionBadge(ev.action)}</td><td class="small muted">${esc(ev.top?.def.label || '')}${extra(ev)}</td></tr>`
          )
          .join('')}</tbody></table></div>`
      : '';
  return `<section class="panel">
      <div class="row" style="justify-content:space-between">
        <div><h2 style="margin:0">Fila da semana de ${esc(formatDate(q.weekStart))}</h2>
          <div class="muted small">${q.items.length} de ${q.capacity} vagas da semana preenchidas · sinais valem ${state.profile.scoring.validDays} dias</div></div>
        <div class="row">
          <button data-action="copy-digest" ${q.items.length ? '' : 'disabled'}>Copiar resumo para e-mail</button>
          <button data-action="export-queue" ${q.items.length ? '' : 'disabled'}>Exportar CSV</button>
        </div>
      </div>
    </section>
    <section class="panel">${cards || '<div class="empty">Nenhuma conta com sinal para contato nesta semana. Registre sinais na aba Sinais.</div>'}
      ${list('Aguardando vaga na próxima semana', q.overflow)}
      ${list('Aquecimento: conteúdo e interação', q.warming)}
      ${list('Retidas pela cadência', q.held, ev => ` · ${esc(ev.block)}`)}
    </section>`;
}

function renderImportReport() {
  const r = state.lastReport;
  if (!r) return '';
  const lines = [];
  if (r.kind === 'contas')
    lines.push(
      `${r.added} contas novas, ${r.merged} atualizadas por CNPJ, site ou nome${r.derived ? `, ${r.derived} sinais de headcount gerados` : ''}.`
    );
  else lines.push(`${r.added} sinais adicionados, ${r.duplicates} já existentes.`);
  for (const w of [...(r.warnings || []), ...(r.skipped || [])]) lines.push(`Linha ${w.line}: ${w.reason}`);
  return `<div class="report">${lines.map(esc).join('<br />')}</div>`;
}

function renderAccounts() {
  const evs = state.data.accounts.map(evaluate);
  const text = state.filter.text.toLowerCase();
  const shown = evs
    .filter(ev => !state.filter.action || ev.action === state.filter.action)
    .filter(
      ev =>
        !text ||
        [ev.account.nome, ev.account.cnpj, ev.account.decisor, ev.account.cidade].join(' ').toLowerCase().includes(text)
    )
    .sort((a, b) => ACTIONS[a.action].rank - ACTIONS[b.action].rank || b.score - a.score);
  const arms = state.profile.icp.arms;
  const rows = shown
    .map(ev => {
      const a = ev.account;
      const last = latestCadence(a.id);
      return `<tr>
        <td><button class="link" data-action="open-account" data-id="${esc(a.id)}">${esc(a.nome)}</button>
          <div class="small muted">${esc([a.cidade, a.uf].filter(Boolean).join(' · '))}${a.cnpj ? '' : ' · sem CNPJ'}</div></td>
        <td class="small">${esc(arms[a.braco]?.label || '—')}</td>
        <td><select data-field="abc" data-id="${esc(a.id)}">${['', 'A', 'B', 'C']
          .map(v => `<option value="${v}" ${a.abc === v ? 'selected' : ''}>${v || '—'}</option>`)
          .join('')}</select></td>
        <td class="small">${esc(a.decisor || '—')}${a.cargo ? `<div class="muted">${esc(a.cargo)}</div>` : ''}</td>
        <td>${actionBadge(ev.action)}<div class="small muted">${esc(TIER_LABELS[ev.tier])}${ev.active.length ? ` · ${ev.active.length} sinal(is)` : ''}</div></td>
        <td><select data-field="cadence" data-id="${esc(a.id)}"><option value="">—</option>${CADENCE_STATUSES.map(
          s => `<option value="${s.id}" ${last?.status === s.id ? 'selected' : ''}>${esc(s.label)}</option>`
        ).join('')}</select></td>
      </tr>`;
    })
    .join('');
  return `<section class="panel">
      <h2>Importar base de contas</h2>
      <p class="small muted">Planilha CSV (separada por ponto e vírgula ou vírgula). Colunas reconhecidas: empresa, cnpj, site, uf, cidade, setor, braço, abc, decisor, cargo, linkedin, uf_decisor, headcount, headcount_6m, observações. Contas repetidas são casadas pela raiz do CNPJ, pelo site ou pelo nome; campos vazios não apagam o que já existe.</p>
      <div class="row"><input type="file" accept=".csv,text/csv" data-import="contas" />
        <button data-action="template-accounts">Baixar modelo</button>
        <button data-action="export-accounts" ${state.data.accounts.length ? '' : 'disabled'}>Exportar base</button></div>
      ${state.lastReport?.kind === 'contas' ? renderImportReport() : ''}
    </section>
    <section class="panel">
      <div class="row" style="justify-content:space-between;margin-bottom:8px">
        <h2 style="margin:0">Contas (${shown.length} de ${evs.length})</h2>
        <div class="row">
          <input type="search" placeholder="Buscar" value="${esc(state.filter.text)}" data-filter="text" />
          <select data-filter="action"><option value="">Todas as ações</option>${Object.entries(ACTIONS)
            .map(
              ([k, v]) => `<option value="${k}" ${state.filter.action === k ? 'selected' : ''}>${esc(v.label)}</option>`
            )
            .join('')}</select>
        </div>
      </div>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>Conta</th><th>Braço</th><th>ABC</th><th>Decisor</th><th>Ação</th><th>Cadência</th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nenhuma conta.</div>'}
    </section>`;
}

function signalTypeOptions(selected = '') {
  const { families, signals } = state.profile;
  return Object.entries(families)
    .map(
      ([fid, flabel]) =>
        `<optgroup label="${esc(flabel)}">${signals
          .filter(s => s.family === fid)
          .map(
            s =>
              `<option value="${s.id}" ${s.id === selected ? 'selected' : ''} ${s.enabled ? '' : 'disabled'}>${esc(s.label)} (${strengthLabel[s.strength]})${s.enabled ? '' : ' · desligado'}</option>`
          )
          .join('')}</optgroup>`
    )
    .join('');
}

function renderSignals() {
  if (!state.data.accounts.length) return emptyBase();
  const { validDays } = state.profile.scoring;
  const recent = state.data.signals
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .slice(0, 200);
  const rows = recent
    .map(s => {
      const def = state.profile.signalById[s.type];
      const acc = accountById(s.accountId);
      const age = daysBetween(s.date, state.today);
      const valid = def && def.enabled && age >= 0 && age <= (def.validDays ?? validDays);
      return `<tr>
        <td>${formatDate(s.date)}</td>
        <td>${acc ? `<button class="link" data-action="open-account" data-id="${esc(acc.id)}">${esc(acc.nome)}</button>` : '<span class="muted">conta removida</span>'}</td>
        <td class="small">${esc(def?.label || s.type)}${s.detail ? `<div class="muted">${esc(s.detail)}</div>` : ''}</td>
        <td class="small">${esc(s.source)}</td>
        <td>${valid ? '<span class="badge">Ativo</span>' : '<span class="badge plain">Expirado</span>'}</td>
        <td><button class="link" data-action="delete-signal" data-id="${esc(s.id)}">Remover</button></td>
      </tr>`;
    })
    .join('');
  return `<section class="panel">
      <h2>Registrar sinal</h2>
      <form id="signal-form" class="grid-form">
        <label class="field">Conta<input name="conta" list="accounts-list" required placeholder="Nome da conta" /></label>
        <label class="field">Tipo de sinal<select name="tipo" required>${signalTypeOptions()}</select></label>
        <label class="field">Data<input type="date" name="data" value="${esc(state.today)}" required /></label>
        <label class="field">Fonte<input name="fonte" placeholder="Ex.: Sales Navigator" /></label>
        <label class="field">Pessoa (se houver)<input name="pessoa" placeholder="Ex.: novo CMO" /></label>
        <label class="field">Link<input name="url" type="url" placeholder="https://" /></label>
        <label class="field" style="grid-column:1/-1">Detalhe (entra no gancho)<input name="detalhe" placeholder="Ex.: Vaga de analista de mídia paga publicada na Gupy" /></label>
        <div><button class="primary" type="submit">Registrar</button></div>
      </form>
      <datalist id="accounts-list">${state.data.accounts.map(a => `<option value="${esc(a.nome)}"></option>`).join('')}</datalist>
    </section>
    <section class="panel">
      <h2>Importar sinais</h2>
      <p class="small muted">CSV com as colunas cnpj ou empresa, tipo (código ou nome do sinal), data, fonte, detalhe, url e pessoa. É o formato de entrada para coletores e pesquisas em lote.</p>
      <div class="row"><input type="file" accept=".csv,text/csv" data-import="sinais" />
        <button data-action="template-signals">Baixar modelo</button></div>
      ${state.lastReport?.kind === 'sinais' ? renderImportReport() : ''}
    </section>
    <section class="panel">
      <h2>Sinais registrados (${state.data.signals.length})</h2>
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Conta</th><th>Sinal</th><th>Fonte</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : '<div class="empty">Nenhum sinal registrado.</div>'}
    </section>`;
}

function renderResults() {
  const m = metrics({ ...state.data, profile: state.profile, today: state.today });
  const progress = Math.min(100, Math.round((m.ready / (m.goal || 1)) * 100));
  const compare = (label, key) =>
    `<tr><td>${label}</td><td class="num">${pct(m.comSinal[key])}</td><td class="num">${pct(m.semSinal[key])}</td></tr>`;
  const months = Object.entries(m.meetingsByMonth).sort();
  const cal = calibrate({ cadence: state.data.cadence, profile: state.profile }).filter(r => r.def.enabled);
  const calRows = cal
    .filter(r => r.enough)
    .map(
      r => `<tr><td class="small">${esc(r.def.label)}</td><td class="num">${r.n}</td><td class="num">${pct(r.responseRate)}</td>
        <td class="num">${r.currentWeight}</td><td class="num"><b>${r.suggestedWeight}</b></td>
        <td>${r.suggestedWeight !== r.currentWeight ? `<button data-action="apply-weight" data-id="${r.def.id}" data-weight="${r.suggestedWeight}">Aplicar</button>` : ''}</td></tr>`
    )
    .join('');
  const pending = cal.filter(r => !r.enough && r.n > 0).length;
  return `<section class="panel">
      <h2>Contas prontas para contato</h2>
      <div class="row" style="justify-content:space-between"><b style="font-size:22px">${m.ready} de ${m.goal}</b>
        <span class="small muted">com ABC, decisor e dentro do ICP, sem sinal negativo</span></div>
      <div class="bar" style="margin-top:8px"><span style="width:${progress}%"></span></div>
      <div class="stats" style="margin-top:16px">${Object.entries(m.byAction)
        .filter(([, n]) => n)
        .map(([k, n]) => `<div class="stat"><b>${n}</b><span class="small muted">${esc(ACTIONS[k].label)}</span></div>`)
        .join('')}</div>
    </section>
    <section class="panel">
      <h2>Sinal melhora a abordagem?</h2>
      <div class="table-wrap"><table><thead><tr><th></th><th class="num">Com sinal</th><th class="num">Sem sinal</th></tr></thead><tbody>
        <tr><td>Convites enviados</td><td class="num">${m.comSinal.enviados}</td><td class="num">${m.semSinal.enviados}</td></tr>
        <tr><td>Com desfecho</td><td class="num">${m.comSinal.comDesfecho}</td><td class="num">${m.semSinal.comDesfecho}</td></tr>
        ${compare('Taxa de aceite de conexão', 'taxaAceite')}
        ${compare('Taxa de resposta', 'taxaResposta')}
        <tr><td>Reuniões</td><td class="num">${m.comSinal.reunioes}</td><td class="num">${m.semSinal.reunioes}</td></tr>
      </tbody></table></div>
      <p class="small muted">Taxas calculadas só sobre convites com desfecho; os ainda sem aceite ficam de fora.</p>
      <h3>Reuniões por mês</h3>
      ${months.length ? `<div class="stats">${months.map(([k, n]) => `<div class="stat"><b>${n}</b><span class="small muted">${esc(k.split('-').reverse().join('/'))}</span></div>`).join('')}</div>` : '<p class="small muted">Nenhuma reunião registrada.</p>'}
    </section>
    <section class="panel">
      <h2>Calibragem dos pesos</h2>
      <p class="small muted">Compara a taxa de resposta de cada tipo de sinal com a das abordagens sem sinal. Só sugere a partir de ${state.profile.scoring.calibration.minSample} abordagens com desfecho, e a mudança é limitada a ±${Math.round(state.profile.scoring.calibration.maxChange * 100)}%. Nada é aplicado sem sua confirmação.</p>
      ${calRows ? `<div class="table-wrap"><table><thead><tr><th>Sinal</th><th class="num">Abordagens</th><th class="num">Resposta</th><th class="num">Peso atual</th><th class="num">Sugerido</th><th></th></tr></thead><tbody>${calRows}</tbody></table></div>` : `<p class="small muted">Ainda sem amostra suficiente${pending ? ` (${pending} tipos de sinal em observação)` : ''}.</p>`}
    </section>`;
}

function renderProfile() {
  const p = state.profile;
  const o = state.data.overrides;
  const rows = Object.entries(p.families)
    .map(
      ([fid, flabel]) =>
        `<tr><th colspan="6" style="padding-top:14px">${esc(flabel)}</th></tr>` +
        p.signals
          .filter(s => s.family === fid)
          .map(
            s => `<tr>
            <td><input type="checkbox" data-sig-enabled="${s.id}" ${s.enabled ? 'checked' : ''} aria-label="Ativar ${esc(s.label)}" /></td>
            <td class="small">${esc(s.label)}${s.mvp ? ' <span class="badge plain">MVP</span>' : ''}<div class="muted">${esc(s.sources.join(', '))}</div></td>
            <td class="small">${esc(strengthLabel[s.strength])}${s.arm ? ` <span class="muted">(${esc(p.icp.arms[s.arm]?.label || s.arm)})</span>` : ''}</td>
            <td>${s.strength === 'N' ? '' : `<input type="number" step="0.1" min="0" style="width:72px" data-sig-weight="${s.id}" value="${s.weight ?? ''}" placeholder="${p.scoring.weights[s.strength]}" />`}</td>
            <td class="small num">${s.validDays ?? p.scoring.validDays} dias</td>
          </tr>`
          )
          .join('')
    )
    .join('');
  const hasOverrides = Object.keys(o).length > 0;
  return `<section class="panel">
      <h2>${esc(p.name)}</h2>
      <p class="small muted">${esc(p.description)}</p>
      <div class="grid-form">
        <div><h3>Braços do ICP</h3>${Object.values(p.icp.arms)
          .map(a => `<div class="small">${esc(a.label)}</div>`)
          .join('')}</div>
        <div><h3>Geografia</h3><div class="small">${esc(p.icp.regions.join(', ') || 'Sem restrição')}</div>
          <h3>Fora do ICP</h3><div class="small">${esc(p.icp.excludedSectors.join(', ') || '—')}</div></div>
        <div><h3>Critérios ABC</h3>${Object.entries(p.abcCriteria)
          .map(([k, v]) => `<div class="small"><b>${k}</b>: ${esc(v)}</div>`)
          .join('')}</div>
      </div>
    </section>
    <section class="panel">
      <h2>Capacidade e pontuação</h2>
      <div class="grid-form">
        <label class="field">Contas por semana (teto do Sales Navigator)<input type="number" min="1" data-capacity="weeklyContacts" value="${p.capacity.weeklyContacts}" /></label>
        <label class="field">Dias de espera após “sem resposta”<input type="number" min="0" data-capacity="cooldownDays" value="${p.capacity.cooldownDays}" /></label>
        <label class="field">Validade do sinal (dias)<input type="number" min="1" data-scoring="validDays" value="${p.scoring.validDays}" /></label>
        <label class="field">Pontos para sinal forte<input type="number" min="0.1" step="0.1" data-scoring="strongThreshold" value="${p.scoring.strongThreshold}" /></label>
      </div>
      <p class="small muted">Peso padrão: forte ${p.scoring.weights.F}, médio ${p.scoring.weights.M}. Sinais combinados em ${p.scoring.validDays} dias ganham +${Math.round(p.scoring.comboBonus * 100)}%; fora do braço do ICP valem ${Math.round(p.scoring.armOffMultiplier * 100)}% do peso.</p>
    </section>
    <section class="panel">
      <div class="row" style="justify-content:space-between"><h2 style="margin:0">Catálogo de sinais (${p.signals.filter(s => s.enabled).length} de ${p.signals.length} ativos)</h2>
        <button data-action="reset-overrides" ${hasOverrides ? '' : 'disabled'}>Voltar ao padrão do perfil</button></div>
      <div class="table-wrap"><table><thead><tr><th></th><th>Sinal e fonte</th><th>Peso</th><th>Peso próprio</th><th class="num">Validade</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
    <section class="panel">
      <h2>Espaço de trabalho</h2>
      <p class="small muted">Os dados ficam só neste navegador, separados por espaço. Faça backup regularmente.</p>
      <div class="row">
        <button data-action="backup">Baixar backup</button>
        <label class="btn">Restaurar backup<input type="file" accept="application/json,.json" data-import="backup" hidden /></label>
        <button data-action="delete-workspace">Excluir este espaço</button>
      </div>
    </section>`;
}

// ---------- detalhe da conta ----------

function openAccount(id) {
  const a = accountById(id);
  if (!a) return;
  const ev = evaluate(a);
  const signals = state.data.signals.filter(s => s.accountId === id).sort((x, y) => (x.date < y.date ? 1 : -1));
  const cad = state.data.cadence.filter(c => c.accountId === id).sort((x, y) => (x.iniciadaEm < y.iniciadaEm ? 1 : -1));
  const input = (name, label, value, attrs = '') =>
    `<label class="field">${label}<input name="${name}" value="${esc(value)}" ${attrs} /></label>`;
  const arms = state.profile.icp.arms;
  dialog.innerHTML = `<form method="dialog" id="account-form" data-id="${esc(id)}">
    <div class="row" style="justify-content:space-between"><h2 style="margin:0">${esc(a.nome)}</h2><button type="button" data-action="close-dialog">Fechar</button></div>
    <div class="row" style="margin:8px 0">${abcBadge(ev)}${actionBadge(ev.action)}<span class="badge plain">${esc(TIER_LABELS[ev.tier])} · ${ev.score}</span></div>
    ${ev.icpIssues.map(i => `<div class="warn">${esc(i)}</div>`).join('')}
    ${ev.blockers.map(b => `<div class="warn">Bloqueada até ${esc(formatDate(addDays(b.signal.date, b.def.validDays ?? state.profile.scoring.validDays)))}: ${esc(b.def.label)}</div>`).join('')}
    <div class="grid-form" style="margin-top:12px">
      ${input('nome', 'Nome', a.nome, 'required')}
      ${input('cnpj', `CNPJ${a.cnpj && !isValidCnpj(a.cnpj) ? ' (inválido)' : ''}`, a.cnpj)}
      ${input('uf', 'UF', a.uf)}
      ${input('cidade', 'Cidade', a.cidade)}
      ${input('setor', 'Setor', a.setor)}
      <label class="field">Braço do ICP<select name="braco"><option value="">—</option>${Object.entries(arms)
        .map(([k, v]) => `<option value="${k}" ${a.braco === k ? 'selected' : ''}>${esc(v.label)}</option>`)
        .join('')}</select></label>
      <label class="field">ABC<select name="abc">${['', 'A', 'B', 'C'].map(v => `<option value="${v}" ${a.abc === v ? 'selected' : ''}>${v || '—'}</option>`).join('')}</select></label>
      ${input('decisor', 'Decisor', a.decisor)}
      ${input('cargo', 'Cargo do decisor', a.cargo)}
      ${input('linkedin', 'LinkedIn do decisor', a.linkedin)}
      ${input('ufDecisor', 'UF do decisor', a.ufDecisor)}
      <label class="field" style="grid-column:1/-1">Observações<textarea name="observacoes">${esc(a.observacoes)}</textarea></label>
    </div>
    <div class="row" style="margin-top:12px;justify-content:space-between">
      <button type="button" data-action="delete-account" data-id="${esc(id)}">Excluir conta</button>
      <button class="primary" value="save">Salvar</button>
    </div>
    <h3>Sinais (${signals.length})</h3>
    ${signals.length ? signals.map(s => signalLine({ signal: s, def: state.profile.signalById[s.type] || { label: s.type, strength: 'M' } })).join('') : '<div class="small muted">Nenhum sinal.</div>'}
    <h3>Cadência</h3>
    ${cad.length ? cad.map(c => `<div class="small">${esc(formatDate(c.iniciadaEm))} · <b>${esc(CADENCE_STATUSES.find(s => s.id === c.status)?.label)}</b> <span class="muted">(atualizado ${esc(formatDate(c.atualizadaEm))}${c.tiposSinal?.length ? `; sinais: ${esc(c.tiposSinal.map(t => state.profile.signalById[t]?.label || t).join(', '))}` : '; sem sinal'})</span>${c.abordagem ? `<div class="muted">“${esc(c.abordagem)}”</div>` : ''}</div>`).join('') : '<div class="small muted">Ainda não abordada.</div>'}
  </form>`;
  dialog.returnValue = '';
  dialog.showModal();
}

dialog.addEventListener('close', () => {
  const form = dialog.querySelector('#account-form');
  if (!form || dialog.returnValue !== 'save') return;
  const a = accountById(form.dataset.id);
  if (!a) return;
  const fd = new FormData(form);
  for (const [k, v] of fd.entries()) a[k] = String(v).trim();
  a.uf = a.uf.toUpperCase();
  a.ufDecisor = (a.ufDecisor || '').toUpperCase();
  a.abc = ['A', 'B', 'C'].includes(a.abc) ? a.abc : '';
  a.atualizadaEm = state.today;
  // Reaproveita a normalização da importação para manter CNPJ e nome consistentes.
  const typedCnpj = a.cnpj;
  const [normalized] = importAccounts([], [{ nome: a.nome, cnpj: a.cnpj }], state.profile, state.today).accounts;
  if (normalized)
    Object.assign(a, { cnpj: normalized.cnpj, cnpjRoot: normalized.cnpjRoot, nomeNorm: normalized.nomeNorm });
  save();
  render();
  toast(typedCnpj && !a.cnpj ? 'Conta salva; CNPJ inválido foi descartado.' : 'Conta salva.');
});

// ---------- ações ----------

function setCadence(accountId, status) {
  const last = latestCadence(accountId);
  if (!status) {
    if (last) state.data.cadence = state.data.cadence.filter(c => c !== last);
  } else if (last && (CADENCE_STATUSES.find(s => s.id === last.status)?.open || last.status === status)) {
    last.status = status;
    last.atualizadaEm = state.today;
  } else {
    const ev = evaluate(accountById(accountId));
    state.data.cadence.push({
      id: `cad-${Date.now().toString(36)}`,
      accountId,
      status,
      iniciadaEm: state.today,
      atualizadaEm: state.today,
      tiposSinal: ev.active.map(e => e.def.id),
      nivel: ev.tier
    });
  }
  save();
}

const actions = {
  goto: el => ((state.tab = el.dataset.tab), render()),
  'close-dialog': () => dialog.close(),
  'open-account': el => openAccount(el.dataset.id),
  'copy-hook': el => {
    const id = el.dataset.id;
    const ev = state.queue.items.find(e => e.account.id === id);
    copy(state.data.drafts[id] ?? ev.hook.text);
  },
  'reset-draft': el => {
    delete state.data.drafts[el.dataset.id];
    save();
    render();
  },
  'start-cadence': el => {
    const id = el.dataset.id;
    const ev = state.queue.items.find(e => e.account.id === id);
    state.data.cadence.push({
      id: `cad-${Date.now().toString(36)}`,
      accountId: id,
      status: 'convite_enviado',
      iniciadaEm: state.today,
      atualizadaEm: state.today,
      tiposSinal: ev.active.map(e => e.def.id),
      nivel: ev.tier,
      abordagem: state.data.drafts[id] ?? ev.hook.text
    });
    delete state.data.drafts[id];
    save();
    render();
    toast(`${ev.account.nome} entrou na cadência.`);
  },
  'copy-digest': () => {
    const q = state.queue;
    const items = q.items.map(ev => ({
      ...ev,
      hook: { ...ev.hook, text: state.data.drafts[ev.account.id] ?? ev.hook.text }
    }));
    copy(digestText({ ...q, items }, state.profile));
  },
  'export-queue': () => {
    const q = state.queue;
    const rows = queueRows(q).map((r, i) => ({
      ...r,
      abordagem: state.data.drafts[q.items[i].account.id] ?? r.abordagem
    }));
    const cols = Object.keys(rows[0]).map(k => ({ key: k, label: k }));
    download(`fila-${state.profile.id}-${q.weekStart}.csv`, toCsv(rows, cols));
  },
  'template-accounts': () =>
    download(
      'modelo-contas.csv',
      toCsv(
        [
          {
            empresa: 'Exemplo Advogados',
            cnpj: '11.222.333/0001-81',
            site: 'exemplo.com.br',
            uf: 'SP',
            cidade: 'São Paulo',
            setor: 'Advocacia',
            braco: 'Serviços profissionais',
            abc: 'A',
            decisor: 'Ana Souza',
            cargo: 'Sócia-diretora',
            linkedin: 'https://www.linkedin.com/in/exemplo',
            uf_decisor: 'SP',
            headcount: 120,
            headcount_6m: 100,
            observacoes: ''
          }
        ],
        [
          'empresa',
          'cnpj',
          'site',
          'uf',
          'cidade',
          'setor',
          'braco',
          'abc',
          'decisor',
          'cargo',
          'linkedin',
          'uf_decisor',
          'headcount',
          'headcount_6m',
          'observacoes'
        ].map(k => ({ key: k, label: k }))
      )
    ),
  'template-signals': () =>
    download(
      'modelo-sinais.csv',
      toCsv(
        [
          {
            cnpj: '11.222.333/0001-81',
            empresa: 'Exemplo Advogados',
            tipo: 'vaga_marketing',
            data: formatDate(state.today),
            fonte: 'Gupy',
            detalhe: 'Vaga de analista de mídia paga',
            url: '',
            pessoa: ''
          }
        ],
        ['cnpj', 'empresa', 'tipo', 'data', 'fonte', 'detalhe', 'url', 'pessoa'].map(k => ({ key: k, label: k }))
      )
    ),
  'export-accounts': () => {
    const rows = state.data.accounts.map(a => {
      const ev = evaluate(a);
      return {
        ...a,
        braco: state.profile.icp.arms[a.braco]?.label || '',
        acao: ACTIONS[ev.action].label,
        score: ev.score,
        cadencia: latestCadence(a.id)?.status || ''
      };
    });
    const keys = [
      'nome',
      'cnpj',
      'dominio',
      'uf',
      'cidade',
      'setor',
      'braco',
      'abc',
      'decisor',
      'cargo',
      'linkedin',
      'ufDecisor',
      'acao',
      'score',
      'cadencia',
      'observacoes'
    ];
    download(
      `contas-${state.profile.id}-${state.today}.csv`,
      toCsv(
        rows,
        keys.map(k => ({ key: k, label: k }))
      )
    );
  },
  'delete-signal': el => {
    state.data.signals = state.data.signals.filter(s => s.id !== el.dataset.id);
    save();
    render();
  },
  'delete-account': el => {
    const a = accountById(el.dataset.id);
    if (!a || !confirm(`Excluir ${a.nome} com seus sinais e histórico de cadência?`)) return;
    state.data.accounts = state.data.accounts.filter(x => x !== a);
    state.data.signals = state.data.signals.filter(s => s.accountId !== a.id);
    state.data.cadence = state.data.cadence.filter(c => c.accountId !== a.id);
    dialog.close();
    save();
    render();
  },
  'apply-weight': el => {
    const o = (state.data.overrides.signals ||= {});
    o[el.dataset.id] = { ...o[el.dataset.id], weight: Number(el.dataset.weight) };
    save();
    render();
    toast('Peso atualizado.');
  },
  'reset-overrides': () => {
    if (!confirm('Voltar pesos, capacidade e sinais ativos ao padrão do perfil?')) return;
    state.data.overrides = {};
    save();
    render();
  },
  backup: () =>
    download(`radar-backup-${state.wsId}-${state.today}.json`, store.exportBackup(state.wsId), 'application/json'),
  'delete-workspace': () => {
    const meta = store.listWorkspaces().find(w => w.id === state.wsId);
    if (!confirm(`Excluir o espaço “${meta?.name}” e todos os seus dados deste navegador?`)) return;
    store.deleteWorkspace(state.wsId);
    ensureWorkspace();
  }
};

view.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});
dialog.addEventListener('click', e => {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) actions[el.dataset.action](el);
});

view.addEventListener('input', e => {
  const t = e.target;
  if (t.dataset.draft != null) {
    const id = t.dataset.draft;
    state.data.drafts[id] = t.value;
    save();
    const warnings = lintApproach(t.value, state.profile);
    const warn = view.querySelector(`[data-warn="${CSS.escape(id)}"]`);
    if (warn) {
      warn.className = warnings.length ? 'warn' : 'muted';
      warn.textContent = warnings.length ? warnings.join(' · ') : `${t.value.length} caracteres`;
    }
  } else if (t.dataset.filter === 'text') {
    state.filter.text = t.value;
    const pos = t.selectionStart;
    render();
    const again = view.querySelector('[data-filter="text"]');
    again.focus();
    again.setSelectionRange(pos, pos);
  }
});

view.addEventListener('change', async e => {
  const t = e.target;
  const o = state.data.overrides;
  if (t.dataset.filter === 'action') ((state.filter.action = t.value), render());
  else if (t.dataset.field === 'abc') {
    accountById(t.dataset.id).abc = t.value;
    save();
    render();
  } else if (t.dataset.field === 'cadence') {
    setCadence(t.dataset.id, t.value);
    render();
  } else if (t.dataset.sigEnabled) {
    const id = t.dataset.sigEnabled;
    (o.signals ||= {})[id] = { ...o.signals[id], enabled: t.checked };
    save();
    render();
  } else if (t.dataset.sigWeight) {
    const id = t.dataset.sigWeight;
    const entry = { ...(o.signals ||= {})[id] };
    if (t.value === '') delete entry.weight;
    else entry.weight = Math.max(0, Number(t.value));
    o.signals[id] = entry;
    save();
    render();
  } else if (t.dataset.capacity || t.dataset.scoring) {
    const group = t.dataset.capacity ? 'capacity' : 'scoring';
    const key = t.dataset.capacity || t.dataset.scoring;
    const value = Number(t.value);
    if (!(value > 0) && !(group === 'capacity' && key === 'cooldownDays' && value === 0)) return render();
    o[group] = { ...o[group], [key]: value };
    save();
    render();
  } else if (t.dataset.import) {
    const file = t.files?.[0];
    if (!file) return;
    try {
      await handleImport(t.dataset.import, await readFile(file));
    } catch (err) {
      toast(`Falha na importação: ${err.message}`);
    }
    t.value = '';
  }
});

async function handleImport(kind, text) {
  if (kind === 'backup') {
    const id = store.importBackup(text);
    if (!profileById(store.listWorkspaces().find(w => w.id === id)?.profileId)) throw new Error('perfil desconhecido');
    openWorkspace(id);
    toast('Backup restaurado em um novo espaço.');
    return;
  }
  const rows = parseCsv(text);
  if (!rows.length) throw new Error('planilha vazia');
  if (kind === 'contas') {
    const { accounts, report } = importAccounts(state.data.accounts, rows, state.profile, state.today);
    state.data.accounts = accounts;
    let derived = 0;
    for (const s of report.derivedSignals) {
      const r = addSignal(state.data.signals, s);
      state.data.signals = r.signals;
      if (r.added) derived++;
    }
    state.lastReport = { kind, ...report, derived };
  } else {
    const { signals, report } = importSignals(
      state.data.accounts,
      state.data.signals,
      rows,
      state.profile,
      state.today
    );
    state.data.signals = signals;
    state.lastReport = { kind, ...report };
  }
  save();
  render();
}

view.addEventListener('submit', e => {
  if (e.target.id !== 'signal-form') return;
  e.preventDefault();
  const fd = new FormData(e.target);
  const name = String(fd.get('conta')).trim().toLowerCase();
  const acc = state.data.accounts.find(a => a.nome.toLowerCase() === name);
  if (!acc) return toast('Conta não encontrada. Escolha um nome da lista.');
  const def = state.profile.signalById[fd.get('tipo')];
  const date = parseDate(fd.get('data'));
  if (!def || !date) return toast('Tipo ou data inválidos.');
  const r = addSignal(state.data.signals, {
    accountId: acc.id,
    type: def.id,
    date,
    source: String(fd.get('fonte')).trim() || def.sources[0],
    detail: String(fd.get('detalhe')).trim(),
    url: String(fd.get('url')).trim(),
    person: String(fd.get('pessoa')).trim()
  });
  if (!r.added) return toast('Esse sinal já está registrado para a conta nessa data.');
  state.data.signals = r.signals;
  save();
  render();
  const ev = evaluate(acc);
  toast(`${acc.nome}: ${ACTIONS[ev.action].label}.`);
});

// ---------- cabeçalho ----------

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) ((state.tab = b.dataset.tab), render());
});
$('#workspace').addEventListener('change', e => openWorkspace(e.target.value));
$('#ref-date').addEventListener('change', e => {
  const d = parseDate(e.target.value);
  if (d) ((state.today = d), render());
});
$('#new-workspace').addEventListener('click', () => {
  dialog.innerHTML = `<form method="dialog" id="ws-form">
    <h2>Novo espaço de trabalho</h2>
    <p class="small muted">Cada espaço é isolado: contas, sinais e resultados de um cliente nunca se misturam com os de outro.</p>
    <div class="grid-form">
      <label class="field">Nome<input name="nome" required placeholder="Ex.: Lefosse" /></label>
      <label class="field">Perfil de partida<select name="perfil">${profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
    </div>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button type="button" data-action="close-dialog">Cancelar</button><button class="primary" value="create">Criar</button></div>
  </form>`;
  dialog.returnValue = '';
  dialog.showModal();
});
dialog.addEventListener('close', () => {
  const form = dialog.querySelector('#ws-form');
  if (!form || dialog.returnValue !== 'create') return;
  const fd = new FormData(form);
  openWorkspace(store.createWorkspace(String(fd.get('nome')).trim() || 'Sem nome', String(fd.get('perfil'))));
});

ensureWorkspace();
