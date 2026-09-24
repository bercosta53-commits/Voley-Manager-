import {
  ACCOUNT_FIELD_LABELS,
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
  isReady,
  isValidCnpj,
  lintApproach,
  mapAccountColumns,
  metrics,
  parseCsv,
  parseDate,
  queueRows,
  resolveProfile,
  staleCadence,
  stripAccents,
  toCsv,
  todayIso,
  weekStart
} from './core.mjs';
import {
  applyIcpDraft,
  buildClassifyPrompt,
  buildHooksPrompt,
  buildIcpPrompt,
  buildSignalExtractPrompt,
  icpFromProfile,
  sanitizeClassification,
  sanitizeExtractedSignals,
  sanitizeHooks,
  sanitizeIcp
} from './ai.mjs';
import { profiles, profileById } from './profiles/index.mjs';
import * as store from './store.mjs';

const $ = sel => document.querySelector(sel);
const view = $('#view');
const dialog = $('#dialog');

const state = {
  wsId: null,
  data: null,
  profile: null,
  tab: 'semana',
  today: todayIso(),
  filter: { text: '', group: 'todas' },
  signalFilter: 'ativos',
  lastReport: null,
  queue: null
};

const esc = v =>
  String(v ?? '').replace(
    /[&<>"']/g,
    c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' })[c]
  );
const pct = v => (v == null ? '—' : `${Math.round(v * 100)}%`);
const plural = (n, one, many) => `${n} ${n === 1 ? one : many}`;
const strengthLabel = { F: 'Forte', M: 'Médio', N: 'Negativo' };
const fold = s => stripAccents(s).toLowerCase().trim();
const statusLabel = id => CADENCE_STATUSES.find(s => s.id === id)?.label || id;

// ---------- espaço de trabalho ----------

let stopWatching = () => {};
let stopInbox = () => {};
// Sinais que a captação semanal encontrou na web e ainda esperam revisão.
let inbox = { items: [], status: null };
let pendingRemote = null;

async function openWorkspace(id) {
  const meta = store.listWorkspaces().find(w => w.id === id);
  const base = meta && profileById(meta.profileId);
  if (!base) return;
  await flushSave();
  stopWatching();
  state.wsId = id;
  state.data = normalizeData(await store.loadWorkspace(id));
  state.base = base;
  state.profile = resolveProfile(base, state.data.overrides);
  state.lastReport = null;
  try {
    localStorage.setItem('radar:ultimo', id);
  } catch {}
  stopWatching = store.watchWorkspace(id, data => {
    pendingRemote = data;
    applyRemote();
  });
  stopInbox();
  inbox = { items: [], status: null };
  stopInbox = store.watchInbox(id, (items, status) => {
    inbox = { items, status };
    if (state.data) render();
  });
  render();
}

function normalizeData(data) {
  data.drafts ||= {};
  data.snoozed ||= {};
  data.overrides ||= {};
  data.icpHistory ||= [];
  return data;
}

// Alterações feitas por outra pessoa entram quando ninguém está digitando aqui.
function applyRemote() {
  if (!pendingRemote) return;
  const active = document.activeElement;
  if (dialog.open || (active && /^(INPUT|TEXTAREA|SELECT)$/.test(active.tagName) && view.contains(active)))
    return void setTimeout(applyRemote, 2000);
  state.data = normalizeData({ ...pendingRemote });
  pendingRemote = null;
  state.profile = resolveProfile(state.base, state.data.overrides);
  render();
}

// Grava depois de uma pausa, para que digitar não gere uma gravação por tecla.
let saveTimer = null;
function save() {
  state.profile = resolveProfile(state.base, state.data.overrides);
  clearTimeout(saveTimer);
  saveTimer = setTimeout(flushSave, 700);
}
async function flushSave() {
  if (!saveTimer) return;
  clearTimeout(saveTimer);
  saveTimer = null;
  try {
    await store.saveWorkspace(state.wsId, state.data);
  } catch (err) {
    toast(`Não foi possível salvar: ${err.message || err.code || 'erro desconhecido'}.`);
  }
}
window.addEventListener('pagehide', flushSave);

async function ensureWorkspace() {
  let list = store.listWorkspaces();
  if (!list.length) (await store.createWorkspace('Velora', 'velora'), (list = store.listWorkspaces()));
  let last = null;
  try {
    last = localStorage.getItem('radar:ultimo');
  } catch {}
  await openWorkspace(list.some(w => w.id === last) ? last : list[0].id);
}

// ---------- utilidades de interface ----------

// Confirmação dentro da própria página (a janela confirm() do navegador nem sempre aparece).
function ask(message, confirmLabel) {
  const box = $('#confirm');
  box.querySelector('p').textContent = message;
  box.querySelector('[value="ok"]').textContent = confirmLabel;
  box.returnValue = '';
  box.showModal();
  return new Promise(resolve => box.addEventListener('close', () => resolve(box.returnValue === 'ok'), { once: true }));
}

let toastTimer;
function toast(msg) {
  document.querySelector('.toast')?.remove();
  const el = document.createElement('div');
  el.className = 'toast';
  el.setAttribute('role', 'status');
  el.textContent = msg;
  document.body.append(el);
  clearTimeout(toastTimer);
  toastTimer = setTimeout(() => el.remove(), 3500);
}

let downloads = null;
async function download(name, content, type = 'text/csv;charset=utf-8') {
  if (downloads) {
    try {
      await downloads.save({ filename: name, data: content });
      toast('Arquivo salvo.');
    } catch (err) {
      if (err?.code !== 'declined') toast('Não foi possível salvar o arquivo aqui.');
    }
    return;
  }
  const url = URL.createObjectURL(new Blob([content], { type }));
  const a = Object.assign(document.createElement('a'), { href: url, download: name });
  document.body.append(a);
  a.click();
  a.remove();
  setTimeout(() => URL.revokeObjectURL(url), 1000);
}

function copy(text) {
  navigator.clipboard.writeText(text).then(
    () => toast('Copiado. Cole no Sales Navigator.'),
    () => toast('Não foi possível copiar; selecione o texto e copie manualmente.')
  );
}

const readFile = file =>
  new Promise((resolve, reject) => {
    const r = new FileReader();
    r.onload = () => resolve(r.result);
    r.onerror = () => reject(r.error);
    r.readAsText(file, 'utf-8');
  });

function openDialog(html) {
  dialog.innerHTML = html;
  dialog.returnValue = '';
  if (!dialog.open) dialog.showModal();
  dialog.querySelector('[autofocus]')?.focus();
}

const accountById = id => state.data.accounts.find(a => a.id === id);
const evaluate = a => evaluateAccount(a, state.data.signals, state.profile, state.today);
const cadenceOf = id =>
  state.data.cadence.filter(c => c.accountId === id).sort((a, b) => (a.iniciadaEm < b.iniciadaEm ? 1 : -1))[0];
const openCadence = () => state.data.cadence.filter(c => CADENCE_STATUSES.find(s => s.id === c.status)?.open);

function findAccountByName(text) {
  const q = fold(text);
  if (!q) return { error: 'Informe a conta.' };
  const exact = state.data.accounts.find(a => fold(a.nome) === q);
  if (exact) return { account: exact };
  const partial = state.data.accounts.filter(a => fold(a.nome).includes(q));
  if (partial.length === 1) return { account: partial[0] };
  if (partial.length > 1)
    return {
      error: `Mais de uma conta combina com “${text}”: ${partial
        .slice(0, 3)
        .map(a => a.nome)
        .join(', ')}…`
    };
  return { error: `Nenhuma conta chamada “${text}”. Cadastre a conta antes de registrar o sinal.` };
}

function abcBadge(ev) {
  if (!ev.account.abc) return '<span class="badge warnb" title="Sem classe ABC">ABC?</span>';
  return `<span class="badge ${esc(ev.abc)}" title="Classe ${esc(ev.abc)}${ev.promoted ? ', promovida a B pelo sinal' : ''}">${esc(ev.abc)}${ev.promoted ? ' → B' : ''}</span>`;
}
function actionBadge(action) {
  const cls = action === 'bloqueada' || action === 'fora_icp' ? 'bad' : ACTIONS[action].contact ? '' : 'plain';
  return `<span class="badge ${cls}">${esc(ACTIONS[action].label)}</span>`;
}
function signalLine(entry, { removable = false } = {}) {
  const { signal, def } = entry;
  const link = signal.url ? ` · <a href="${esc(signal.url)}" target="_blank" rel="noopener">ver fonte</a>` : '';
  const remove = removable
    ? ` <button class="link danger" data-action="delete-signal" data-id="${esc(signal.id)}">remover</button>`
    : '';
  return `<div class="signal"><span class="dot ${def.strength}" title="${esc(strengthLabel[def.strength])}"></span><div>${esc(def.label)}
    <div class="muted small">${esc(signal.source)} · ${esc(formatDate(signal.date))}${signal.detail ? ` · ${esc(signal.detail)}` : ''}${link}${remove}</div></div></div>`;
}
function linkedinSearch(account, decisor) {
  const who = decisor.nome || decisor.cargo.split('/')[0].trim();
  const q = encodeURIComponent([who, account.nome].filter(Boolean).join(' '));
  return `https://www.linkedin.com/search/results/people/?keywords=${q}`;
}

// ---------- estrutura ----------

const TABS = [
  ['semana', 'Semana'],
  ['cadencia', 'Cadência'],
  ['contas', 'Contas'],
  ['sinais', 'Sinais'],
  ['icp', 'ICP'],
  ['resultados', 'Resultados'],
  ['configurar', 'Configurar']
];

function renderHeader() {
  const list = store.listWorkspaces();
  $('#workspace').innerHTML = list
    .map(w => `<option value="${esc(w.id)}" ${w.id === state.wsId ? 'selected' : ''}>${esc(w.name)}</option>`)
    .join('');
  const stale = staleCadence(state.data.cadence, state.today, state.profile.capacity.staleDays ?? 14).length;
  const counts = {
    semana: state.queue.items.length,
    cadencia: openCadence().length,
    contas: state.data.accounts.length,
    sinais: inbox.items.length
  };
  $('#tabs').innerHTML = TABS.map(
    ([id, label]) =>
      `<button role="tab" data-tab="${id}" aria-selected="${state.tab === id}">${esc(label)}${
        counts[id] ? ` <span class="count">${counts[id]}</span>` : ''
      }${id === 'cadencia' && stale ? ' <span class="count alert" title="Convites parados">!</span>' : ''}</button>`
  ).join('');
  $('#today').textContent = state.today === todayIso() ? '' : `Simulando o dia ${formatDate(state.today)}`;
}

function render() {
  state.queue = buildQueue({ ...state.data, profile: state.profile, today: state.today });
  renderHeader();
  const scroll = window.scrollY;
  view.innerHTML = {
    semana: renderWeek,
    cadencia: renderCadence,
    contas: renderAccounts,
    sinais: renderSignals,
    icp: renderIcp,
    resultados: renderResults,
    configurar: renderSettings
  }[state.tab]();
  window.scrollTo(0, scroll);
}

// ---------- semana ----------

function renderGuide() {
  const evs = state.queue.evaluations;
  const ready = evs.filter(ev => isReady(ev.account, ev)).length;
  const steps = [
    {
      done: state.data.accounts.length > 0,
      title: 'Coloque as contas na base',
      text: state.data.accounts.length
        ? plural(state.data.accounts.length, 'conta cadastrada', 'contas cadastradas')
        : 'Cole da planilha, envie um CSV ou cadastre uma a uma.',
      button: '<button class="primary" data-action="import" data-kind="contas">Importar contas</button>'
    },
    {
      done: ready > 0,
      title: 'Defina ABC e decisor',
      text: `${ready} de ${state.profile.goals.readyAccounts} contas prontas. A IA classifica pelo ICP e indica o cargo a procurar.`,
      button:
        aiButton('ai-classify', 'Classificar com IA') +
        '<button data-action="filter-accounts" data-group="pendentes">Fazer manualmente</button>'
    },
    {
      done: state.data.signals.length > 0,
      title: 'Registre os sinais',
      text: inbox.items.length
        ? `A IA captou ${plural(inbox.items.length, 'sinal', 'sinais')} na web. Aprove os que valem.`
        : 'Toda segunda a IA capta sinais das suas contas na web. Você também pode colar material para ela ler.',
      button:
        (inbox.items.length
          ? `<button class="primary" data-action="goto" data-tab="sinais">Revisar ${plural(inbox.items.length, 'sinal captado', 'sinais captados')}</button>`
          : aiButton('ai-signals', 'Ler material com IA')) +
        '<button data-action="new-signal">Registrar manualmente</button>'
    },
    {
      done: state.data.cadence.length > 0,
      title: 'Envie o primeiro convite da fila',
      text: 'A IA escreve as abordagens; você revisa, envia pelo Sales Navigator e marca aqui.',
      button: state.queue.items.length ? aiButton('ai-hooks', 'Escrever abordagens com IA') : ''
    }
  ];
  if (steps.every(s => s.done)) return '';
  const next = steps.findIndex(s => !s.done);
  return `<section class="panel guide">
    <div class="row between"><h2>Primeiros passos</h2>
      ${state.data.accounts.length ? '' : '<button class="link" data-action="load-example">Prefiro ver com dados de exemplo</button>'}</div>
    <ol class="steps">${steps
      .map(
        (s, i) => `<li class="${s.done ? 'done' : i === next ? 'current' : ''}">
          <span class="mark" aria-hidden="true">${s.done ? '✓' : i + 1}</span>
          <div><b>${esc(s.title)}</b><div class="small muted">${esc(s.text)}</div></div>
          <div class="row">${!s.done && i === next ? s.button : ''}</div>
        </li>`
      )
      .join('')}</ol>
    ${aiNote()}
  </section>`;
}

function renderWeek() {
  const guide = renderGuide();
  if (!state.data.accounts.length) return guide;
  const q = state.queue;
  const cards = q.items
    .map((ev, i) => {
      const id = ev.account.id;
      const text = state.data.drafts[id] ?? ev.hook.text;
      const warnings = lintApproach(text, state.profile);
      const d = ev.hook.decisor;
      const who = d.nome
        ? `<b>${esc(d.nome)}</b>${d.cargo ? ` · ${esc(d.cargo)}` : ''}`
        : `<span class="warn">Decisor a definir</span>${d.cargo ? ` · procure ${esc(d.cargo)}` : ''}`;
      const profileLink = ev.account.linkedin
        ? `<a href="${esc(ev.account.linkedin)}" target="_blank" rel="noopener">Abrir perfil</a>`
        : `<a href="${esc(linkedinSearch(ev.account, d))}" target="_blank" rel="noopener">Buscar no LinkedIn</a>`;
      return `<article class="card">
        <div class="head"><span class="pos">${i + 1}</span>
          <button class="link title" data-action="open-account" data-id="${esc(id)}">${esc(ev.account.nome)}</button>
          ${abcBadge(ev)}${actionBadge(ev.action)}</div>
        <div class="signals">${ev.active.map(e => signalLine(e)).join('')}</div>
        <div class="small who">${who} · ${profileLink}</div>
        <label class="field">Primeira linha da abordagem
          <textarea data-draft="${esc(id)}" rows="3">${esc(text)}</textarea></label>
        <div class="row between small">
          <span class="${warnings.length ? 'warn' : 'muted'}" data-warn="${esc(id)}">${warnings.length ? esc(warnings.join(' · ')) : `${text.length}/${state.profile.approach.maxChars} caracteres`}</span>
          <span class="row">${ai ? `<button class="link" data-action="ai-hook-one" data-id="${esc(id)}">Reescrever com IA</button>` : ''}
          ${state.data.drafts[id] != null ? `<button class="link" data-action="reset-draft" data-id="${esc(id)}">Voltar à sugestão</button>` : ''}</span>
        </div>
        <div class="row actions">
          <button data-action="snooze" data-id="${esc(id)}" title="Tira a conta da fila até a próxima segunda">Adiar 1 semana</button>
          <span class="grow"></span>
          <button data-action="copy-hook" data-id="${esc(id)}">Copiar abordagem</button>
          <button class="primary" data-action="start-cadence" data-id="${esc(id)}">Marcar convite enviado</button>
        </div>
      </article>`;
    })
    .join('');
  const list = (title, items, extra = () => '', note = '') =>
    items.length
      ? `<details class="more"><summary>${esc(title)} <span class="count">${items.length}</span></summary>
          ${note ? `<p class="small muted">${esc(note)}</p>` : ''}
          <ul class="plain">${items
            .map(
              ev => `<li><button class="link" data-action="open-account" data-id="${esc(ev.account.id)}">${esc(ev.account.nome)}</button>
                ${abcBadge(ev)} <span class="small muted">${esc(ev.top?.def.label || ACTIONS[ev.action].label)}</span>${extra(ev)}</li>`
            )
            .join('')}</ul></details>`
      : '';
  const empty = `<div class="empty">Nenhuma conta com sinal para contato nesta semana.<br />
    <button class="primary" data-action="new-signal" style="margin-top:12px">Registrar sinal</button></div>`;
  return `${guide}
    <section class="panel">
      <div class="row between">
        <div><h2>Fila da semana de ${esc(formatDate(q.weekStart))}</h2>
          <div class="muted small">${q.items.length} de ${q.capacity} contatos da semana · ordem pela matriz ABC × sinal</div></div>
        <div class="row">
          ${q.items.length ? aiButton('ai-hooks', 'Escrever abordagens com IA', '') : ''}
          <button data-action="copy-digest" ${q.items.length ? '' : 'disabled'}>Copiar resumo</button>
          <button data-action="export-queue" ${q.items.length ? '' : 'disabled'}>Exportar CSV</button>
        </div>
      </div>
      <div class="bar" style="margin-top:10px" aria-hidden="true"><span style="width:${Math.min(100, Math.round((q.items.length / q.capacity) * 100))}%"></span></div>
    </section>
    <section class="cards">${cards || `<div class="card">${empty}</div>`}</section>
    <section class="panel">
      ${list('Aguardando vaga na próxima semana', q.overflow, () => '', 'Passaram do limite de contatos desta semana.')}
      ${list('Aquecimento: conteúdo e interação', q.warming, () => '', 'Contas A sem sinal: interaja com posts e envie conteúdo antes de abordar.')}
      ${list('Fora da fila por enquanto', q.held, ev =>
        ev.snoozedUntil
          ? ` <span class="small muted">· ${esc(ev.block)}</span> <button class="link" data-action="unsnooze" data-id="${esc(ev.account.id)}">Trazer de volta</button>`
          : ` <span class="small muted">· ${esc(ev.block)}</span>`
      )}
      ${q.overflow.length || q.warming.length || q.held.length ? '' : '<p class="small muted">Nenhuma conta aguardando.</p>'}
    </section>`;
}

// ---------- cadência ----------

const NEXT_STEPS = {
  convite_enviado: [
    ['aceito', 'Aceitou'],
    ['sem_resposta', 'Sem resposta']
  ],
  aceito: [
    ['respondeu', 'Respondeu'],
    ['sem_resposta', 'Sem resposta']
  ],
  respondeu: [
    ['reuniao', 'Reunião marcada'],
    ['descartada', 'Descartar']
  ]
};

function cadenceItem(c, staleIds) {
  const a = accountById(c.accountId);
  if (!a) return '';
  const days = daysBetween(c.atualizadaEm || c.iniciadaEm, state.today);
  const signal = c.tiposSinal?.length ? state.profile.signalById[c.tiposSinal[0]]?.label : 'Sem sinal';
  const stale = staleIds.has(c.id);
  return `<li class="citem ${stale ? 'stale' : ''}">
    <div class="row between"><button class="link title" data-action="open-account" data-id="${esc(a.id)}">${esc(a.nome)}</button>
      <span class="small ${stale ? 'warn' : 'muted'}">${days === 0 ? 'hoje' : `há ${plural(days, 'dia', 'dias')}`}</span></div>
    <div class="small muted">${esc(a.decisor || 'decisor a definir')} · ${esc(signal || '')}</div>
    <div class="row actions">${(NEXT_STEPS[c.status] || [])
      .map(
        ([status, label], i) =>
          `<button class="${i === 0 ? 'primary' : ''}" data-action="cadence-step" data-id="${esc(c.id)}" data-status="${status}">${esc(label)}</button>`
      )
      .join(
        ''
      )}<span class="grow"></span><button class="link" data-action="cadence-undo" data-id="${esc(c.id)}">Desfazer</button></div>
  </li>`;
}

function renderCadence() {
  const staleDays = state.profile.capacity.staleDays ?? 14;
  const stale = staleCadence(state.data.cadence, state.today, staleDays);
  const staleIds = new Set(stale.map(c => c.id));
  const open = openCadence().sort((a, b) => (a.atualizadaEm < b.atualizadaEm ? -1 : 1));
  const columns = [
    ['convite_enviado', 'Aguardando aceite'],
    ['aceito', 'Conectadas'],
    ['respondeu', 'Em conversa']
  ];
  const closed = state.data.cadence
    .filter(c => !CADENCE_STATUSES.find(s => s.id === c.status)?.open)
    .sort((a, b) => (a.atualizadaEm < b.atualizadaEm ? 1 : -1))
    .slice(0, 30);
  if (!state.data.cadence.length)
    return `<section class="panel"><div class="empty">Nenhuma conta em cadência ainda.<br />
      Na aba Semana, envie o convite pelo Sales Navigator e clique em “Marcar convite enviado”.
      <div style="margin-top:12px"><button class="primary" data-action="goto" data-tab="semana">Ir para a fila da semana</button></div></div></section>`;
  return `${
    stale.length
      ? `<section class="panel notice"><b>${plural(stale.length, 'convite parado', 'convites parados')} há mais de ${staleDays} dias.</b>
          <span class="small">Se não houve retorno, marque “Sem resposta”: a conta volta à fila depois de ${state.profile.capacity.cooldownDays} dias.</span></section>`
      : ''
  }
    <section class="board">${columns
      .map(([status, title]) => {
        const items = open.filter(c => c.status === status);
        return `<div class="column"><h2>${esc(title)} <span class="count">${items.length}</span></h2>
          ${items.length ? `<ul class="plain">${items.map(c => cadenceItem(c, staleIds)).join('')}</ul>` : '<p class="small muted">Nenhuma.</p>'}</div>`;
      })
      .join('')}</section>
    ${
      closed.length
        ? `<section class="panel"><h2>Encerradas recentemente</h2><div class="table-wrap"><table><tbody>${closed
            .map(c => {
              const a = accountById(c.accountId);
              return a
                ? `<tr><td><button class="link" data-action="open-account" data-id="${esc(a.id)}">${esc(a.nome)}</button></td>
                  <td><span class="badge ${c.status === 'reuniao' ? 'A' : 'plain'}">${esc(statusLabel(c.status))}</span></td>
                  <td class="small muted">${esc(formatDate(c.atualizadaEm))}</td>
                  <td><button class="link" data-action="cadence-undo" data-id="${esc(c.id)}">Desfazer</button></td></tr>`
                : '';
            })
            .join('')}</tbody></table></div></section>`
        : ''
    }`;
}

// ---------- contas ----------

const ACCOUNT_GROUPS = [
  ['todas', 'Todas', () => true],
  ['prontas', 'Prontas', (ev, ready) => ready],
  ['pendentes', 'Faltando dados', ev => !ev.account.abc || !ev.account.decisor],
  ['com_sinal', 'Com sinal ativo', ev => ev.active.length > 0],
  ['cadencia', 'Em cadência', ev => openCadence().some(c => c.accountId === ev.account.id)],
  ['fora', 'Fora do ICP ou bloqueadas', ev => ev.action === 'fora_icp' || ev.action === 'bloqueada']
];

function renderAccounts() {
  const evs = state.queue.evaluations;
  const readyMap = new Map(evs.map(ev => [ev.account.id, isReady(ev.account, ev)]));
  const groups = ACCOUNT_GROUPS.map(([id, label, fn]) => ({
    id,
    label,
    items: evs.filter(ev => fn(ev, readyMap.get(ev.account.id)))
  }));
  const current = groups.find(g => g.id === state.filter.group) || groups[0];
  const text = fold(state.filter.text);
  const shown = current.items
    .filter(
      ev =>
        !text ||
        fold([ev.account.nome, ev.account.cnpj, ev.account.decisor, ev.account.cidade].join(' ')).includes(text)
    )
    .sort(
      (a, b) =>
        ACTIONS[a.action].rank - ACTIONS[b.action].rank ||
        b.score - a.score ||
        a.account.nome.localeCompare(b.account.nome, 'pt-BR')
    );
  const rows = shown
    .slice(0, 300)
    .map(ev => {
      const a = ev.account;
      const c = cadenceOf(a.id);
      return `<tr>
        <td><button class="link title" data-action="open-account" data-id="${esc(a.id)}">${esc(a.nome)}</button>
          <div class="small muted">${esc([a.cidade, a.uf].filter(Boolean).join(' · ') || '—')}</div></td>
        <td><select data-field="abc" data-id="${esc(a.id)}" aria-label="Classe ABC de ${esc(a.nome)}">${[
          '',
          'A',
          'B',
          'C'
        ]
          .map(v => `<option value="${v}" ${a.abc === v ? 'selected' : ''}>${v || '—'}</option>`)
          .join('')}</select></td>
        <td class="small">${a.decisor ? `${esc(a.decisor)}${a.decisorIA ? ' <span class="badge warnb" title="Sugerido pela IA; confirme no LinkedIn">IA · confirmar</span>' : ''}${a.cargo ? `<div class="muted">${esc(a.cargo)}</div>` : ''}` : `<button class="link" data-action="open-account" data-id="${esc(a.id)}" data-focus="decisor">Adicionar decisor</button>`}</td>
        <td>${actionBadge(ev.action)}${ev.active.length ? `<div class="small muted">${esc(ev.top.def.label)}${ev.active.length > 1 ? ` +${ev.active.length - 1}` : ''}</div>` : ''}</td>
        <td class="small">${c ? esc(statusLabel(c.status)) : '<span class="muted">—</span>'}</td>
        <td><button data-action="new-signal" data-id="${esc(a.id)}" title="Registrar sinal para esta conta">+ Sinal</button></td>
      </tr>`;
    })
    .join('');
  return `<section class="panel">
      <div class="row between">
        <h2>Contas</h2>
        <div class="row">
          <button class="primary" data-action="import" data-kind="contas">Importar contas</button>
          <button data-action="new-account">Nova conta</button>
          <button data-action="export-accounts" ${state.data.accounts.length ? '' : 'disabled'}>Exportar</button>
        </div>
      </div>
      ${state.lastReport?.kind === 'contas' ? renderImportReport() : ''}
      <div class="chips" role="group" aria-label="Filtrar contas">${groups
        .map(
          g =>
            `<button class="chip" data-action="filter-accounts" data-group="${g.id}" aria-pressed="${g.id === current.id}">${esc(g.label)} <span class="count">${g.items.length}</span></button>`
        )
        .join('')}</div>
      <input type="search" id="account-search" placeholder="Buscar por nome, CNPJ, decisor ou cidade" value="${esc(state.filter.text)}" data-filter="text" />
    </section>
    <section class="panel">
      ${
        rows
          ? `<div class="table-wrap"><table><thead><tr><th>Conta</th><th>ABC</th><th>Decisor</th><th>Situação</th><th>Cadência</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>
            ${shown.length > 300 ? `<p class="small muted">Mostrando 300 de ${shown.length}. Use a busca para achar as demais.</p>` : ''}`
          : `<div class="empty">${state.data.accounts.length ? 'Nenhuma conta neste filtro.' : 'Nenhuma conta ainda. Importe a base ou cadastre a primeira.'}</div>`
      }
    </section>`;
}

function renderImportReport() {
  const r = state.lastReport;
  const lines =
    r.kind === 'contas'
      ? [
          `${plural(r.added, 'conta nova', 'contas novas')}, ${plural(r.merged, 'atualizada', 'atualizadas')}${r.derived ? `, ${plural(r.derived, 'sinal de headcount gerado', 'sinais de headcount gerados')}` : ''}.`
        ]
      : [
          `${plural(r.added, 'sinal adicionado', 'sinais adicionados')}, ${plural(r.duplicates, 'já existente', 'já existentes')}.`
        ];
  const issues = [...(r.warnings || []), ...(r.skipped || [])];
  return `<div class="report" role="status"><div class="row between"><span>${esc(lines[0])}</span>
    <button class="link" data-action="dismiss-report">Fechar</button></div>
    ${issues.length ? `<details><summary>${plural(issues.length, 'aviso', 'avisos')}</summary>${issues.map(w => `<div>Linha ${w.line}: ${esc(w.reason)}</div>`).join('')}</details>` : ''}</div>`;
}

// ---------- sinais ----------

function renderSignals() {
  const { validDays } = state.profile.scoring;
  const isActive = s => {
    const def = state.profile.signalById[s.type];
    const age = daysBetween(s.date, state.today);
    return def && def.enabled && age >= 0 && age <= (def.validDays ?? validDays);
  };
  const all = state.data.signals.slice().sort((a, b) => (a.date < b.date ? 1 : -1));
  const active = all.filter(isActive);
  const list = (state.signalFilter === 'ativos' ? active : all).slice(0, 300);
  const rows = list
    .map(s => {
      const def = state.profile.signalById[s.type];
      const acc = accountById(s.accountId);
      return `<tr>
        <td class="small">${formatDate(s.date)}</td>
        <td>${acc ? `<button class="link" data-action="open-account" data-id="${esc(acc.id)}">${esc(acc.nome)}</button>` : '<span class="muted">conta removida</span>'}</td>
        <td class="small"><span class="dot ${def?.strength || 'M'}"></span> ${esc(def?.label || s.type)}${s.detail ? `<div class="muted">${esc(s.detail)}</div>` : ''}</td>
        <td class="small">${esc(s.source)}</td>
        <td>${isActive(s) ? '<span class="badge">Ativo</span>' : '<span class="badge plain">Expirado</span>'}</td>
        <td><button class="link danger" data-action="delete-signal" data-id="${esc(s.id)}">Remover</button></td>
      </tr>`;
    })
    .join('');
  return `${renderInbox()}<section class="panel">
      <div class="row between">
        <div><h2>Sinais</h2><div class="small muted">Cada sinal vale ${validDays} dias. Sinais diferentes na mesma conta somam.</div></div>
        <div class="row">
          ${aiButton('ai-signals', 'Ler material com IA', '')}
          <button class="primary" data-action="new-signal" ${state.data.accounts.length ? '' : 'disabled'}>Registrar sinal</button>
          <button data-action="import" data-kind="sinais" ${state.data.accounts.length ? '' : 'disabled'}>Importar em lote</button>
        </div>
      </div>
      ${state.lastReport?.kind === 'sinais' ? renderImportReport() : ''}
      <div class="chips" role="group" aria-label="Filtrar sinais">
        <button class="chip" data-action="signal-filter" data-value="ativos" aria-pressed="${state.signalFilter === 'ativos'}">Ativos <span class="count">${active.length}</span></button>
        <button class="chip" data-action="signal-filter" data-value="todos" aria-pressed="${state.signalFilter === 'todos'}">Todos <span class="count">${all.length}</span></button>
      </div>
    </section>
    <section class="panel">
      ${rows ? `<div class="table-wrap"><table><thead><tr><th>Data</th><th>Conta</th><th>Sinal</th><th>Fonte</th><th>Status</th><th></th></tr></thead><tbody>${rows}</tbody></table></div>` : `<div class="empty">${state.data.accounts.length ? 'Nenhum sinal aqui ainda.' : 'Cadastre contas antes de registrar sinais.'}</div>`}
    </section>`;
}

function renderInbox() {
  const st = inbox.status;
  const last = st?.ultimaExecucao
    ? `Última captação: ${formatDate(String(st.ultimaExecucao).slice(0, 10))} · ${plural(st.contasVerificadas || 0, 'conta pesquisada', 'contas pesquisadas')}, ${plural(st.sinaisEncontrados || 0, 'sinal encontrado', 'sinais encontrados')}.`
    : 'A captação automática roda toda segunda de manhã e pesquisa as contas na web.';
  if (store.storageKind() !== 'db') return '';
  const items = inbox.items
    .slice()
    .sort((a, b) => (a.date < b.date ? 1 : -1))
    .map(it => {
      const def = state.profile.signalById[it.type];
      const acc = accountById(it.accountId);
      return `<li class="found">
        <span class="dot ${def?.strength || 'M'}" aria-hidden="true"></span>
        <div>
          <div class="row between"><div><b>${esc(acc?.nome || it.conta)}</b> · ${esc(def?.label || it.type)} <span class="small muted">· ${esc(formatDate(it.date))}</span></div>
            <span class="row">
              <button class="link danger" data-action="inbox-discard" data-id="${esc(it.docId)}">Descartar</button>
              <button class="primary" data-action="inbox-approve" data-id="${esc(it.docId)}" ${acc && def ? '' : 'disabled'}>Aprovar</button>
            </span></div>
          ${it.detail ? `<div class="small">${esc(it.detail)}</div>` : ''}
          ${it.evidence ? `<div class="small muted quote">“${esc(it.evidence)}”</div>` : ''}
          <div class="small muted">${esc(it.source || 'Web')}${it.url ? ` · <a href="${esc(it.url)}" target="_blank" rel="noopener">abrir fonte</a>` : ''}</div>
        </div>
      </li>`;
    })
    .join('');
  return `<section class="panel inbox">
    <div class="row between"><div><h2>Captados pela IA <span class="count">${inbox.items.length}</span></h2>
      <div class="small muted">${esc(last)}</div></div>
      ${inbox.items.length > 1 ? '<button data-action="inbox-approve-all">Aprovar todos</button>' : ''}</div>
    ${items ? `<ul class="plain">${items}</ul>` : '<p class="small muted">Nada esperando revisão.</p>'}
  </section>`;
}

async function approveInbox(docId) {
  const it = inbox.items.find(x => x.docId === docId);
  if (!it || !accountById(it.accountId) || !state.profile.signalById[it.type]) return false;
  const r = addSignal(state.data.signals, {
    accountId: it.accountId,
    type: it.type,
    date: parseDate(it.date) || state.today,
    source: it.source || 'Captação com IA',
    detail: it.detail || '',
    url: it.url || '',
    person: it.person || ''
  });
  state.data.signals = r.signals;
  await store.setInboxStatus(state.wsId, docId, 'aprovado');
  return true;
}

// ---------- resultados ----------

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
  return `<section class="panel turn">
      <h2>Contas prontas para contato</h2>
      <div class="row between" style="margin-top:14px"><b class="big">${m.ready}<mark>/${m.goal}</mark></b>
        <span class="small muted">com ABC, decisor e dentro do ICP, sem sinal negativo</span></div>
      <div class="bar" style="margin-top:8px"><span style="width:${progress}%"></span></div>
      <div class="stats" style="margin-top:16px">${Object.entries(m.byAction)
        .filter(([, n]) => n)
        .map(([k, n]) => `<div class="stat"><b>${n}</b><span class="small muted">${esc(ACTIONS[k].label)}</span></div>`)
        .join('')}</div>
    </section>
    <section class="panel">
      <h2>O sinal melhora a abordagem?</h2>
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
      ${calRows ? `<div class="table-wrap"><table><thead><tr><th>Sinal</th><th class="num">Abordagens</th><th class="num">Resposta</th><th class="num">Peso atual</th><th class="num">Sugerido</th><th></th></tr></thead><tbody>${calRows}</tbody></table></div>` : `<p class="small muted">Ainda sem amostra suficiente${pending ? ` (${plural(pending, 'tipo de sinal', 'tipos de sinal')} em observação)` : ''}.</p>`}
    </section>`;
}

// ---------- IA ----------

// A IA só existe no link publicado no claude.ai; rodando localmente, os botões somem.
let ai = null;
let aiChecked = false;
let aiRun = null; // { controller, label } enquanto um pedido está em andamento

function aiButton(action, label, cls = 'primary') {
  if (!ai) return '';
  const busy = aiRun ? 'disabled' : '';
  return `<button class="${cls} ai" data-action="${action}" ${busy}><span class="spark" aria-hidden="true">✦</span> ${esc(label)}</button>`;
}
function aiNote() {
  if (ai || !aiChecked) return '';
  return '<p class="small muted">Os recursos de IA aparecem quando o painel é aberto pelo link publicado no claude.ai.</p>';
}

const AI_ERRORS = {
  not_granted: 'O uso da IA não foi autorizado nesta página. Recarregue para autorizar de novo.',
  sampling_disabled: 'A IA não está disponível para esta conta.',
  not_declared: 'A IA não está disponível nesta versão da página.',
  capability_disabled: 'A IA não está disponível nesta visualização.',
  rate_limited: 'Muitos pedidos seguidos ou limite de uso atingido. Tente de novo em alguns minutos.',
  session_expired: 'Sua sessão expirou. Entre de novo no claude.ai.',
  prompt_too_large: 'Material grande demais para um pedido. Envie menos de cada vez.',
  refused: 'A IA recusou este pedido. Reformule o texto.',
  empty_completion: 'A IA não respondeu nada. Tente pedir menos de cada vez.',
  invalid_json: 'A resposta da IA veio num formato inesperado. Tente de novo.'
};

// Um pedido por vez. Devolve o JSON da IA ou null (cancelado ou com erro já avisado).
async function askAI(prompt, { tier = 'default', label = 'Pensando…', cache = false } = {}) {
  if (!ai || aiRun) return null;
  const controller = new AbortController();
  aiRun = { controller, label };
  renderAiStatus();
  try {
    return await ai.json(prompt, { modelTier: tier, signal: controller.signal, cache });
  } catch (err) {
    if (err?.code === 'cancelled') return null;
    if (
      ['not_granted', 'sampling_disabled', 'not_declared', 'capability_disabled', 'capability_removed'].includes(
        err?.code
      )
    )
      ai = null;
    toast(AI_ERRORS[err?.code] || 'A IA não respondeu. Tente de novo.');
    return null;
  } finally {
    aiRun = null;
    renderAiStatus();
  }
}

// Faixa fixa com o que a IA está fazendo e o botão de parar.
function renderAiStatus() {
  let bar = $('#ai-status');
  if (!aiRun) {
    bar?.remove();
    view.querySelectorAll('button.ai').forEach(b => (b.disabled = false));
    dialog.querySelectorAll('button.ai').forEach(b => (b.disabled = false));
    return;
  }
  if (!bar) {
    bar = document.createElement('div');
    bar.id = 'ai-status';
    bar.setAttribute('role', 'status');
    document.body.append(bar);
  }
  bar.innerHTML = `<span class="pulse" aria-hidden="true"></span><span>${esc(aiRun.label)}</span><button data-stop-ai>Parar</button>`;
  bar.querySelector('[data-stop-ai]').onclick = () => aiRun?.controller.abort();
  view.querySelectorAll('button.ai').forEach(b => (b.disabled = true));
  dialog.querySelectorAll('button.ai').forEach(b => (b.disabled = true));
}

// ---------- ICP ----------

const ICP_PLACEHOLDER =
  'Ex.: Somos a Velora, consultoria de marketing e vendas B2B. Vendemos diagnóstico comercial e operação de ABM para empresas com venda complexa. Nossos melhores clientes são escritórios de advocacia empresarial com mais de 50 advogados, cooperativas de crédito e empresas de software B2B com mais de 5 anos. Atuamos em SP e no Sul. Não atendemos saúde nem gestoras de investimento. Quem decide a compra costuma ser o sócio-diretor, o CMO ou o diretor comercial.';

function chips(items, cls = '') {
  return items.length
    ? `<div class="chips tight">${items.map(t => `<span class="chip static ${cls}">${esc(t)}</span>`).join('')}</div>`
    : '<span class="small muted">—</span>';
}

function renderIcp() {
  const draft = state.data.icpDraft;
  const current = icpFromProfile(state.profile);
  const shown = draft || current;
  const editable = Boolean(draft);
  const label = s => state.profile.signalById[s]?.label || s;
  const field = (path, value, rows = 2) =>
    editable
      ? `<textarea class="inline" rows="${rows}" data-icp="${path}">${esc(value)}</textarea>`
      : `<div class="small">${esc(value) || '<span class="muted">—</span>'}</div>`;
  const listField = (path, values, cls) =>
    editable
      ? `<input class="inline" data-icp="${path}" data-list value="${esc(values.join(', '))}" placeholder="separe por vírgula" />`
      : chips(values, cls);
  const arms = shown.bracos
    .map(
      (b, i) => `<article class="arm">
        <div class="row between"><span class="eyebrow">Braço ${i + 1}</span>
          ${editable && shown.bracos.length > 1 ? `<button class="link danger small" data-action="icp-remove-arm" data-index="${i}">Remover</button>` : ''}</div>
        ${editable ? `<input class="inline title" data-icp="bracos.${i}.nome" value="${esc(b.nome)}" aria-label="Nome do braço" />` : `<h3 class="arm-name">${esc(b.nome)}</h3>`}
        ${field(`bracos.${i}.descricao`, b.descricao)}
        <div class="kv"><span>Setores</span>${listField(`bracos.${i}.setores`, b.setores)}</div>
        <div class="kv"><span>Porte</span>${editable ? `<input class="inline" data-icp="bracos.${i}.porte" value="${esc(b.porte)}" />` : `<div class="small">${esc(b.porte) || '—'}</div>`}</div>
        <div class="kv"><span>Decisores</span>${listField(`bracos.${i}.decisores`, b.decisores)}</div>
        <div class="kv"><span>Sinais que mais pesam</span>${chips(b.sinaisChave.map(label), 'signal')}</div>
      </article>`
    )
    .join('');
  const abc = ['A', 'B', 'C']
    .map(k => `<div class="abc-col"><span class="badge ${k}">${k}</span>${field(`abc.${k}`, shown.abc[k], 3)}</div>`)
    .join('');
  const history = state.data.icpHistory
    .map(
      (h, i) =>
        `<li><span class="small">${esc(formatDate(h.em))} · ${esc(h.icp.bracos.map(b => b.nome).join(', '))}</span>
          <button class="link" data-action="icp-restore" data-index="${i}">Usar esta versão</button></li>`
    )
    .join('');
  return `<section class="panel">
      <div class="row between"><div><h2>Desenhe o ICP</h2>
        <div class="small muted">Descreva a operação com suas palavras. A IA propõe os braços, os critérios ABC, os decisores e os sinais que mais pesam; você ajusta e aplica.</div></div></div>
      <label class="field" style="margin-top:10px">Sua operação, clientes ideais e o que evitar
        <textarea id="icp-brief" rows="6" placeholder="${esc(ICP_PLACEHOLDER)}">${esc(state.data.icpBrief || '')}</textarea></label>
      <div class="row" style="margin-top:8px">
        ${ai ? aiButton('icp-generate', draft ? 'Desenhar de novo com IA' : 'Desenhar ICP com IA') : '<span class="small muted">O desenho com IA funciona pelo link publicado no claude.ai. Você ainda pode ajustar o ICP abaixo.</span>'}
        ${!draft ? '<button data-action="icp-edit">Editar manualmente</button>' : ''}
      </div>
    </section>
    <section class="panel icp ${editable ? 'is-draft' : ''}">
      <div class="row between">
        <div><h2>${editable ? 'Rascunho do ICP' : 'ICP em uso'}</h2>
          <div class="small ${editable ? 'warn' : 'muted'}">${editable ? 'Ainda não aplicado. Edite os campos à vontade antes de aplicar.' : state.profile.icpDesign ? 'Desenhado neste espaço.' : `Padrão do perfil ${esc(state.profile.name)}.`}</div></div>
        ${editable ? '<div class="row"><button data-action="icp-discard">Descartar</button><button class="primary" data-action="icp-apply">Aplicar ao espaço</button></div>' : ''}
      </div>
      ${shown.resumo ? `<p class="lead">${esc(shown.resumo)}</p>` : ''}
      <div class="arms">${arms}</div>
      <div class="icp-grid">
        <div><h3>Geografia</h3>${listField('regioes', shown.regioes, 'uf')}${!shown.regioes.length && !editable ? '<div class="small muted">Brasil todo</div>' : ''}</div>
        <div><h3>Fora do ICP</h3>${listField('exclusoes', shown.exclusoes, 'out')}</div>
        <div><h3>Tom de voz</h3>${field('tom', shown.tom)}</div>
        <div><h3>Termos a evitar</h3>${chips(
          shown.termosEvitar.map(t => t.termo),
          'out'
        )}</div>
      </div>
      <h3>Critérios ABC</h3>
      <div class="abc">${abc}</div>
      ${
        editable && ai
          ? `<div class="refine"><label class="field">Pedir ajuste à IA
              <textarea id="icp-refine" rows="2" placeholder="Ex.: separe cooperativas de seguradoras e dê mais peso a novos sócios nos escritórios"></textarea></label>
              <div class="row" style="margin-top:6px">${aiButton('icp-refine', 'Ajustar com IA', '')}</div></div>`
          : ''
      }
    </section>
    ${history ? `<section class="panel"><h2>Versões aplicadas</h2><ul class="plain">${history}</ul></section>` : ''}`;
}

function setIcpField(path, value, isList) {
  const draft = state.data.icpDraft;
  const keys = path.split('.');
  let target = draft;
  for (const k of keys.slice(0, -1)) target = target[k];
  const last = keys[keys.length - 1];
  let v = isList
    ? value
        .split(',')
        .map(x => x.trim())
        .filter(Boolean)
    : value;
  if (path === 'regioes') v = v.map(u => u.toUpperCase());
  target[last] = v;
  save();
}

async function generateIcp(refine) {
  const brief = $('#icp-brief')?.value.trim() ?? state.data.icpBrief ?? '';
  state.data.icpBrief = brief;
  save();
  const instruction = refine ? $('#icp-refine')?.value.trim() : '';
  if (!brief && !refine) return toast('Descreva a operação antes de pedir o desenho.');
  if (refine && !instruction) return toast('Escreva o ajuste que você quer.');
  const prompt = buildIcpPrompt({
    description: brief || '(sem descrição; parta do ICP atual)',
    current: refine ? state.data.icpDraft : null,
    instruction,
    profile: state.profile
  });
  const raw = await askAI(prompt, { label: refine ? 'Ajustando o ICP…' : 'Desenhando o ICP…' });
  if (!raw) return;
  try {
    state.data.icpDraft = sanitizeIcp(raw, state.profile);
  } catch (err) {
    return toast(`Não deu para usar a resposta: ${err.message}. Tente de novo.`);
  }
  save();
  render();
  toast('Rascunho pronto. Revise e aplique quando estiver bom.');
}

function applyIcp(draft) {
  const clean = sanitizeIcp(draft, state.profile);
  state.data.overrides = applyIcpDraft(state.data.overrides, clean, state.profile);
  state.data.icpHistory = [{ em: state.today, icp: clean }, ...state.data.icpHistory].slice(0, 5);
  state.data.icpDraft = null;
  save();
  render();
  const known = new Set(Object.keys(state.profile.icp.arms));
  const orphan = state.data.accounts.filter(a => a.braco && !known.has(a.braco)).length;
  toast(
    orphan
      ? `ICP aplicado. ${plural(orphan, 'conta está', 'contas estão')} num braço que não existe mais: reclassifique com IA.`
      : 'ICP aplicado. A fila já usa os novos critérios.'
  );
}

// ---------- IA: classificar contas (passo 2) ----------

let classify = null; // { scope, results: Map, done, total, running }

function classifyTargets(scope) {
  const arms = new Set(Object.keys(state.profile.icp.arms));
  return state.data.accounts.filter(a =>
    scope === 'todas' ? true : !a.abc || !a.braco || !arms.has(a.braco) || !a.decisor
  );
}

function openClassify() {
  classify ||= { scope: 'pendentes', results: new Map(), done: 0, total: 0 };
  renderClassify();
}

function renderClassify() {
  const c = classify;
  const targets = classifyTargets(c.scope);
  const arms = state.profile.icp.arms;
  const rows = [...c.results.values()]
    .map(r => {
      const a = accountById(r.id);
      if (!a) return '';
      return `<tr class="${r.confianca === 'baixa' ? 'low' : ''}">
        <td><input type="checkbox" data-cls-pick="${esc(r.id)}" ${r.pick ? 'checked' : ''} aria-label="Aplicar para ${esc(a.nome)}" /></td>
        <td><b>${esc(a.nome)}</b><div class="small muted">${esc(r.motivo)}</div></td>
        <td><select data-cls-abc="${esc(r.id)}" aria-label="ABC">${['', 'A', 'B', 'C'].map(v => `<option ${r.abc === v ? 'selected' : ''} value="${v}">${v || '—'}</option>`).join('')}</select>${a.abc && a.abc !== r.abc ? `<div class="small muted">era ${esc(a.abc)}</div>` : ''}</td>
        <td class="small">${esc(arms[r.braco]?.label || '—')}</td>
        <td class="small">${esc(r.cargo || '—')}${r.decisor && !a.decisor ? `<div>${esc(r.decisor)} <span class="badge warnb">confirmar</span></div>` : ''}</td>
        <td><span class="badge ${r.confianca === 'alta' ? 'A' : r.confianca === 'media' ? '' : 'C'}">${{ alta: 'alta', media: 'média', baixa: 'baixa' }[r.confianca]}</span></td>
      </tr>`;
    })
    .join('');
  const picked = [...c.results.values()].filter(r => r.pick).length;
  openDialog(`<form data-form="classify" class="wide-dialog">
    <div class="row between"><h2>Classificar contas com IA</h2><button type="button" class="link" data-action="close-dialog">Fechar</button></div>
    <p class="small muted">A IA lê o ICP e os dados de cada conta e sugere a classe ABC, o braço e o cargo do decisor. Nomes de pessoas só aparecem quando a IA tem alta certeza, e sempre marcados para você confirmar. Nada é gravado antes de você aplicar.</p>
    <div class="row">
      <label class="row small"><input type="radio" name="scope" value="pendentes" ${c.scope === 'pendentes' ? 'checked' : ''} /> Só contas com dados faltando</label>
      <label class="row small"><input type="radio" name="scope" value="todas" ${c.scope === 'todas' ? 'checked' : ''} /> Todas as contas</label>
      <span class="grow"></span>
      ${aiButton('ai-classify-run', `Classificar ${plural(targets.length, 'conta', 'contas')}`)}
    </div>
    ${c.total ? `<div class="small muted">${c.done} de ${c.total} contas analisadas</div><div class="bar"><span style="width:${Math.round((c.done / c.total) * 100)}%"></span></div>` : ''}
    ${
      rows
        ? `<div class="table-wrap"><table><thead><tr><th></th><th>Conta</th><th>ABC</th><th>Braço</th><th>Decisor</th><th>Confiança</th></tr></thead><tbody>${rows}</tbody></table></div>
      <div class="row between"><span class="small muted">Confiança baixa vem desmarcada.</span>
        <button class="primary" type="submit" ${picked ? '' : 'disabled'}>Aplicar ${plural(picked, 'sugestão', 'sugestões')}</button></div>`
        : ''
    }
  </form>`);
  renderAiStatus();
}

async function runClassify() {
  const targets = classifyTargets(classify.scope);
  if (!targets.length) return toast('Nenhuma conta para classificar neste filtro.');
  classify.results = new Map();
  classify.total = targets.length;
  classify.done = 0;
  renderClassify();
  const size = 20;
  for (let i = 0; i < targets.length; i += size) {
    const batch = targets.slice(i, i + size);
    const raw = await askAI(buildClassifyPrompt(batch, state.profile), {
      label: `Classificando contas ${i + 1}–${i + batch.length} de ${targets.length}…`
    });
    if (!raw) break;
    for (const r of sanitizeClassification(raw, batch, state.profile))
      classify.results.set(r.id, { ...r, pick: r.confianca !== 'baixa' && Boolean(r.abc) });
    classify.done = Math.min(targets.length, i + batch.length);
    if (dialog.open && dialog.querySelector('[data-form="classify"]')) renderClassify();
  }
}

function applyClassify() {
  let n = 0;
  for (const r of classify.results.values()) {
    if (!r.pick) continue;
    const a = accountById(r.id);
    if (!a) continue;
    if (r.abc) a.abc = r.abc;
    if (r.braco) a.braco = r.braco;
    if (r.cargo && !a.cargo) a.cargo = r.cargo;
    if (r.decisor && !a.decisor) ((a.decisor = r.decisor), (a.decisorIA = true));
    a.motivoIA = r.motivo;
    a.atualizadaEm = state.today;
    n++;
  }
  classify = null;
  save();
  dialog.close();
  render();
  toast(`${plural(n, 'conta atualizada', 'contas atualizadas')} com as sugestões da IA.`);
}

// ---------- IA: sinais a partir de texto (passo 3) ----------

let extracted = null; // { source, items: [] }

function openExtract() {
  extracted ||= { source: '', items: [] };
  renderExtract();
}

function renderExtract() {
  const rows = extracted.items
    .map(
      (s, i) => `<li class="found">
        <input type="checkbox" data-ext-pick="${i}" ${s.pick ? 'checked' : ''} aria-label="Registrar este sinal" />
        <div><div><b>${esc(s.conta)}</b> · <span class="dot ${s.strength}"></span> ${esc(s.label)} <span class="small muted">· ${esc(formatDate(s.date))}</span></div>
          ${s.detail ? `<div class="small">${esc(s.detail)}</div>` : ''}
          ${s.evidence ? `<div class="small muted quote">“${esc(s.evidence)}”</div>` : ''}</div>
      </li>`
    )
    .join('');
  const picked = extracted.items.filter(s => s.pick).length;
  openDialog(`<form data-form="extract" class="wide-dialog">
    <div class="row between"><h2>Encontrar sinais com IA</h2><button type="button" class="link" data-action="close-dialog">Fechar</button></div>
    <p class="small muted">Cole notícias, descrições de vagas, posts do LinkedIn, anotações do Apollo ou do Sales Navigator. A IA procura sinais das contas da sua base nesse material; ela não pesquisa na internet sozinha.</p>
    <label class="field">Material
      <textarea id="extract-text" rows="8" maxlength="30000" placeholder="Cole aqui o texto que você encontrou…">${esc(extracted.source)}</textarea></label>
    <div class="row between"><span class="small muted">Até 30 mil caracteres por vez.</span>${aiButton('ai-signals-run', 'Procurar sinais')}</div>
    ${
      extracted.ran
        ? rows
          ? `<h3>${plural(extracted.items.length, 'sinal encontrado', 'sinais encontrados')}</h3><ul class="plain">${rows}</ul>
            <div class="row" style="justify-content:flex-end"><button class="primary" type="submit" ${picked ? '' : 'disabled'}>Registrar ${plural(picked, 'sinal', 'sinais')}</button></div>`
          : '<p class="small">Nenhum sinal das suas contas nesse material.</p>'
        : ''
    }
  </form>`);
  renderAiStatus();
}

async function runExtract() {
  const source = $('#extract-text').value.trim();
  if (!source) return toast('Cole o material antes.');
  extracted.source = source;
  const raw = await askAI(
    buildSignalExtractPrompt({ source, accounts: state.data.accounts, profile: state.profile, today: state.today }),
    { label: 'Lendo o material e procurando sinais…' }
  );
  if (!raw) return;
  extracted.items = sanitizeExtractedSignals(raw, state.data.accounts, state.profile, state.today).map(s => ({
    ...s,
    pick: true
  }));
  extracted.ran = true;
  if (dialog.open) renderExtract();
}

function applyExtract() {
  let added = 0;
  for (const s of extracted.items.filter(x => x.pick)) {
    const r = addSignal(state.data.signals, {
      accountId: s.accountId,
      type: s.type,
      date: s.date,
      source: s.source,
      detail: s.detail,
      person: s.person,
      url: ''
    });
    state.data.signals = r.signals;
    if (r.added) added++;
  }
  extracted = null;
  save();
  dialog.close();
  render();
  toast(`${plural(added, 'sinal registrado', 'sinais registrados')}.`);
}

// ---------- IA: abordagens (passo 4) ----------

async function writeHooks(ids) {
  const items = state.queue.items
    .filter(ev => ids.includes(ev.account.id))
    .map(ev => ({
      id: ev.account.id,
      empresa: ev.account.nome,
      setor: ev.account.setor || undefined,
      decisor: ev.hook.decisor.nome || undefined,
      cargo: ev.hook.decisor.cargo || undefined,
      sinais: ev.active.map(e => ({ tipo: e.def.label, detalhe: e.signal.detail || undefined, data: e.signal.date })),
      rascunhoAtual: state.data.drafts[ev.account.id] ?? ev.hook.text
    }));
  if (!items.length) return;
  const raw = await askAI(buildHooksPrompt(items, state.profile), {
    label: items.length > 1 ? `Escrevendo ${items.length} abordagens…` : 'Reescrevendo a abordagem…'
  });
  if (!raw) return;
  const hooks = sanitizeHooks(raw, ids);
  for (const h of hooks) state.data.drafts[h.id] = h.texto;
  save();
  render();
  toast(
    hooks.length
      ? `${plural(hooks.length, 'abordagem escrita', 'abordagens escritas')}. Revise antes de enviar.`
      : 'A IA não devolveu abordagens. Tente de novo.'
  );
}

// ---------- configurar ----------

function renderSettings() {
  const p = state.profile;
  const o = state.data.overrides;
  const rows = Object.entries(p.families)
    .map(
      ([fid, flabel]) =>
        `<tr><th colspan="5" class="family">${esc(flabel)}</th></tr>` +
        p.signals
          .filter(s => s.family === fid)
          .map(
            s => `<tr>
            <td><input type="checkbox" id="sig-${s.id}" data-sig-enabled="${s.id}" ${s.enabled ? 'checked' : ''} /></td>
            <td class="small"><label for="sig-${s.id}">${esc(s.label)}</label>${s.mvp ? ' <span class="badge plain">MVP</span>' : ''}<div class="muted">${esc(s.sources.join(', '))}</div></td>
            <td class="small"><span class="dot ${s.strength}"></span> ${esc(strengthLabel[s.strength])}${s.arm ? ` <span class="muted">(${esc(p.icp.arms[s.arm]?.label || s.arm)})</span>` : ''}</td>
            <td>${s.strength === 'N' ? '' : `<input type="number" step="0.1" min="0" class="narrow" data-sig-weight="${s.id}" value="${s.weight ?? ''}" placeholder="${p.scoring.weights[s.strength]}" aria-label="Peso próprio de ${esc(s.label)}" />`}</td>
            <td class="small num">${s.validDays ?? p.scoring.validDays} dias</td>
          </tr>`
          )
          .join('')
    )
    .join('');
  const hasOverrides = Object.keys(o).length > 0;
  const where =
    store.storageKind() === 'db'
      ? 'Os dados ficam guardados neste link e são os mesmos para todos com quem você compartilhar a página.'
      : 'Os dados ficam só neste navegador. Faça backup regularmente.';
  return `<section class="panel">
      <div class="row between"><div><h2>Perfil de partida: ${esc(p.name)}</h2>
        <p class="small muted">${esc(p.description)} O ICP deste espaço é desenhado na aba ICP.</p></div>
        <button data-action="goto" data-tab="icp">Abrir ICP</button></div>
    </section>
    <section class="panel">
      <h2>Ritmo e pontuação</h2>
      <div class="grid-form">
        <label class="field">Contatos por semana<input type="number" min="1" id="cfg-weekly" data-capacity="weeklyContacts" value="${p.capacity.weeklyContacts}" /><span class="hint">Teto do Sales Navigator para a equipe.</span></label>
        <label class="field">Espera após “sem resposta” (dias)<input type="number" min="0" id="cfg-cooldown" data-capacity="cooldownDays" value="${p.capacity.cooldownDays}" /></label>
        <label class="field">Convite parado depois de (dias)<input type="number" min="1" id="cfg-stale" data-capacity="staleDays" value="${p.capacity.staleDays ?? 14}" /></label>
        <label class="field">Validade do sinal (dias)<input type="number" min="1" id="cfg-valid" data-scoring="validDays" value="${p.scoring.validDays}" /></label>
        <label class="field">Pontos para sinal forte<input type="number" min="0.1" step="0.1" id="cfg-strong" data-scoring="strongThreshold" value="${p.scoring.strongThreshold}" /></label>
      </div>
      <p class="small muted">Peso padrão: forte ${p.scoring.weights.F}, médio ${p.scoring.weights.M}. Sinais combinados em ${p.scoring.validDays} dias ganham +${Math.round(p.scoring.comboBonus * 100)}%; fora do braço do ICP valem ${Math.round(p.scoring.armOffMultiplier * 100)}% do peso.</p>
    </section>
    <section class="panel">
      <div class="row between"><h2>Catálogo de sinais <span class="count">${p.signals.filter(s => s.enabled).length} de ${p.signals.length} ativos</span></h2>
        <button data-action="reset-overrides" ${hasOverrides ? '' : 'disabled'}>Voltar ao padrão do perfil</button></div>
      <div class="table-wrap"><table><thead><tr><th>Ativo</th><th>Sinal e fonte</th><th>Peso</th><th>Peso próprio</th><th class="num">Validade</th></tr></thead><tbody>${rows}</tbody></table></div>
    </section>
    <section class="panel">
      <h2>Espaço de trabalho</h2>
      <p class="small muted">${esc(where)}</p>
      <div class="row">
        <button data-action="backup">Baixar backup</button>
        <label class="btn">Restaurar backup<input type="file" accept="application/json,.json" data-import="backup" hidden /></label>
        <button class="danger" data-action="delete-workspace">Excluir este espaço</button>
      </div>
      <h3>Simular outra data</h3>
      <div class="row"><input type="date" id="ref-date" value="${esc(state.today)}" aria-label="Data de referência" />
        ${state.today !== todayIso() ? '<button class="link" data-action="reset-date">Voltar para hoje</button>' : ''}</div>
      <p class="small muted">Mostra a fila como ela estaria nesse dia. Útil para conferir a validade dos sinais.</p>
    </section>`;
}

// ---------- diálogos: conta ----------

function openAccountForm(id, focus) {
  const a = id ? accountById(id) : { nome: '', abc: '', braco: '' };
  if (!a) return;
  const ev = id ? evaluate(a) : null;
  const input = (name, label, value, attrs = '') =>
    `<label class="field">${label}<input name="${name}" id="acc-${name}" value="${esc(value)}" ${attrs} /></label>`;
  const arms = state.profile.icp.arms;
  const signals = id
    ? state.data.signals.filter(s => s.accountId === id).sort((x, y) => (x.date < y.date ? 1 : -1))
    : [];
  const cad = id
    ? state.data.cadence.filter(c => c.accountId === id).sort((x, y) => (x.iniciadaEm < y.iniciadaEm ? 1 : -1))
    : [];
  openDialog(`<form data-form="account" data-id="${esc(id || '')}">
    <div class="row between"><h2>${id ? esc(a.nome) : 'Nova conta'}</h2><button type="button" class="link" data-action="close-dialog">Fechar</button></div>
    ${ev ? `<div class="row">${abcBadge(ev)}${actionBadge(ev.action)}<span class="badge plain">${esc(TIER_LABELS[ev.tier])} · ${ev.score} pts</span></div>` : ''}
    ${ev ? ev.icpIssues.map(i => `<div class="warn small">${esc(i)}</div>`).join('') : ''}
    ${ev ? ev.blockers.map(b => `<div class="warn small">Fora da fila até ${esc(formatDate(addDays(b.signal.date, b.def.validDays ?? state.profile.scoring.validDays)))}: ${esc(b.def.label)}</div>`).join('') : ''}
    <div class="grid-form" style="margin-top:12px">
      ${input('nome', 'Nome da empresa', a.nome, `required ${!focus ? 'autofocus' : ''}`)}
      <label class="field">Classe ABC<select name="abc" id="acc-abc">${['', 'A', 'B', 'C'].map(v => `<option value="${v}" ${a.abc === v ? 'selected' : ''}>${v || 'Não definida'}</option>`).join('')}</select></label>
      <label class="field">Braço do ICP<select name="braco" id="acc-braco"><option value="">Não definido</option>${Object.entries(
        arms
      )
        .map(([k, v]) => `<option value="${k}" ${a.braco === k ? 'selected' : ''}>${esc(v.label)}</option>`)
        .join('')}</select></label>
      ${input('decisor', a.decisorIA ? 'Decisor <span class="badge warnb">sugerido pela IA</span>' : 'Decisor', a.decisor, focus === 'decisor' ? 'autofocus' : '')}
      ${input('cargo', 'Cargo do decisor', a.cargo)}
      ${input('linkedin', 'LinkedIn do decisor', a.linkedin, 'type="url" placeholder="https://www.linkedin.com/in/…"')}
      ${input('cnpj', `CNPJ${a.cnpj && !isValidCnpj(a.cnpj) ? ' (inválido)' : ''}`, a.cnpj, 'inputmode="numeric"')}
      ${input('site', 'Site', a.dominio)}
      ${input('setor', 'Setor', a.setor)}
      ${input('cidade', 'Cidade', a.cidade)}
      ${input('uf', 'UF da sede', a.uf, 'maxlength="2"')}
      ${input('ufDecisor', 'UF do decisor', a.ufDecisor, 'maxlength="2"')}
      <label class="field wide">Observações<textarea name="observacoes" id="acc-obs" rows="2">${esc(a.observacoes)}</textarea></label>
    </div>
    <div class="row between" style="margin-top:12px">
      ${id ? `<button type="button" class="danger" data-action="delete-account" data-id="${esc(id)}">Excluir conta</button>` : '<span></span>'}
      <span class="row"><button type="button" data-action="close-dialog">Cancelar</button><button class="primary" type="submit">${id ? 'Salvar' : 'Cadastrar conta'}</button></span>
    </div>
    ${
      id
        ? `<div class="row between" style="margin-top:16px"><h3>Sinais</h3><button type="button" data-action="new-signal" data-id="${esc(id)}">+ Registrar sinal</button></div>
      ${signals.length ? signals.map(s => signalLine({ signal: s, def: state.profile.signalById[s.type] || { label: s.type, strength: 'M' } }, { removable: true })).join('') : '<div class="small muted">Nenhum sinal.</div>'}
      <h3>Cadência</h3>
      ${cad.length ? cad.map(c => `<div class="small"><b>${esc(statusLabel(c.status))}</b> <span class="muted">· convite em ${esc(formatDate(c.iniciadaEm))}, atualizado em ${esc(formatDate(c.atualizadaEm))}${c.tiposSinal?.length ? ` · sinal: ${esc(c.tiposSinal.map(t => state.profile.signalById[t]?.label || t).join(', '))}` : ' · sem sinal'}</span>${c.abordagem ? `<div class="muted quote">“${esc(c.abordagem)}”</div>` : ''}</div>`).join('') : '<div class="small muted">Ainda não abordada.</div>'}`
        : ''
    }
  </form>`);
}

function saveAccountForm(form) {
  const id = form.dataset.id;
  const fd = Object.fromEntries([...new FormData(form).entries()].map(([k, v]) => [k, String(v).trim()]));
  if (!fd.nome) return toast('Informe o nome da empresa.');
  // Reaproveita a normalização da importação para manter CNPJ, site e nome consistentes.
  const row = { ...fd, uf_decisor: fd.ufDecisor };
  if (!id) {
    const { accounts, report } = importAccounts(state.data.accounts, [row], state.profile, state.today);
    if (report.merged) return toast('Já existe uma conta com esse nome, CNPJ ou site. Edite a conta existente.');
    state.data.accounts = accounts;
    const created = accounts[accounts.length - 1];
    save();
    dialog.close();
    render();
    toast(`${created.nome} cadastrada.`);
    return;
  }
  const a = accountById(id);
  const [n] = importAccounts([], [row], state.profile, state.today).accounts;
  // Salvar a ficha confirma o decisor sugerido pela IA.
  a.decisorIA = false;
  Object.assign(a, {
    nome: n.nome,
    nomeNorm: n.nomeNorm,
    cnpj: n.cnpj,
    cnpjRoot: n.cnpjRoot,
    dominio: n.dominio,
    uf: n.uf,
    cidade: n.cidade,
    setor: n.setor,
    braco: fd.braco,
    abc: n.abc,
    decisor: n.decisor,
    cargo: n.cargo,
    linkedin: n.linkedin,
    ufDecisor: n.ufDecisor,
    observacoes: n.observacoes,
    atualizadaEm: state.today
  });
  save();
  dialog.close();
  render();
  toast(fd.cnpj && !a.cnpj ? 'Conta salva. O CNPJ informado é inválido e foi descartado.' : 'Conta salva.');
}

// ---------- diálogos: sinal ----------

function signalTypeOptions(selected = '') {
  const { families, signals } = state.profile;
  return Object.entries(families)
    .map(([fid, flabel]) => {
      const opts = signals.filter(s => s.family === fid && s.enabled);
      return opts.length
        ? `<optgroup label="${esc(flabel)}">${opts
            .map(s => `<option value="${s.id}" ${s.id === selected ? 'selected' : ''}>${esc(s.label)}</option>`)
            .join('')}</optgroup>`
        : '';
    })
    .join('');
}

function signalHint(typeId) {
  const def = state.profile.signalById[typeId];
  if (!def) return '';
  const days = def.validDays ?? state.profile.scoring.validDays;
  if (def.strength === 'N') return `Sinal negativo: tira a conta da fila por ${days} dias.`;
  return `${strengthLabel[def.strength]} · vale ${days} dias${def.arm ? ` · pesa mais em ${state.profile.icp.arms[def.arm]?.label}` : ''} · fontes: ${def.sources.join(', ')}`;
}

function openSignalForm(accountId) {
  const acc = accountId ? accountById(accountId) : null;
  const first = state.profile.signals.find(s => s.enabled)?.id;
  openDialog(`<form data-form="signal">
    <div class="row between"><h2>Registrar sinal</h2><button type="button" class="link" data-action="close-dialog">Fechar</button></div>
    <div class="grid-form">
      <label class="field wide">Conta<input name="conta" id="sig-conta" list="accounts-list" required autocomplete="off" value="${esc(acc?.nome || '')}" ${acc ? '' : 'autofocus'} placeholder="Digite parte do nome" /></label>
      <label class="field wide">O que aconteceu<select name="tipo" id="sig-tipo" required ${acc ? 'autofocus' : ''}>${signalTypeOptions(first)}</select>
        <span class="hint" id="sig-hint">${esc(signalHint(first))}</span></label>
      <label class="field">Quando<input type="date" name="data" id="sig-data" value="${esc(state.today)}" max="${esc(state.today)}" required /></label>
      <label class="field">Onde viu<input name="fonte" id="sig-fonte" placeholder="${esc(state.profile.signalById[first]?.sources[0] || '')}" /></label>
      <label class="field wide">Detalhe (entra na abordagem)<input name="detalhe" id="sig-detalhe" placeholder="Ex.: Vaga de analista de mídia paga publicada na Gupy" /></label>
      <label class="field">Pessoa envolvida<input name="pessoa" id="sig-pessoa" placeholder="Ex.: nome do novo CMO" /></label>
      <label class="field">Link<input name="url" id="sig-url" type="url" placeholder="https://" /></label>
    </div>
    <datalist id="accounts-list">${state.data.accounts.map(a => `<option value="${esc(a.nome)}"></option>`).join('')}</datalist>
    <div class="row" style="margin-top:12px;justify-content:flex-end">
      <button type="submit" name="again" value="1">Registrar e adicionar outro</button>
      <button class="primary" type="submit">Registrar</button>
    </div>
  </form>`);
}

function saveSignalForm(form, again) {
  const fd = new FormData(form);
  const found = findAccountByName(String(fd.get('conta')));
  if (found.error) return toast(found.error);
  const acc = found.account;
  const def = state.profile.signalById[fd.get('tipo')];
  const date = parseDate(fd.get('data'));
  if (!def || !date) return toast('Escolha o tipo de sinal e a data.');
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
  const ev = evaluate(acc);
  toast(`${acc.nome}: ${ACTIONS[ev.action].label}.`);
  render();
  if (again) {
    openSignalForm();
  } else dialog.close();
}

// ---------- diálogos: importação ----------

function openImport(kind) {
  const isAccounts = kind === 'contas';
  openDialog(`<form data-form="import-source" data-kind="${kind}">
    <div class="row between"><h2>${isAccounts ? 'Importar contas' : 'Importar sinais em lote'}</h2><button type="button" class="link" data-action="close-dialog">Fechar</button></div>
    <p class="small muted">${
      isAccounts
        ? 'Copie as linhas da planilha (com o cabeçalho) e cole abaixo, ou envie um arquivo CSV. Contas repetidas são reconhecidas pelo CNPJ, pelo site ou pelo nome, e campos vazios não apagam o que já existe.'
        : 'Colunas: empresa ou cnpj, tipo (nome ou código do sinal), data, fonte, detalhe, url e pessoa. É o formato que os coletores automáticos vão gerar.'
    }</p>
    <label class="field">Colar da planilha<textarea name="texto" id="import-text" rows="7" autofocus placeholder="${isAccounts ? 'empresa	cnpj	uf	abc	decisor…' : 'empresa	tipo	data	fonte	detalhe'}"></textarea></label>
    <div class="row between" style="margin-top:8px">
      <label class="btn">Escolher arquivo CSV<input type="file" accept=".csv,.tsv,.txt,text/csv" data-import-file hidden /></label>
      <button type="button" class="link" data-action="${isAccounts ? 'template-accounts' : 'template-signals'}">Baixar planilha modelo</button>
    </div>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button class="primary" type="submit">Conferir antes de importar</button></div>
  </form>`);
}

let pendingImport = null;

function previewImport(kind, text) {
  const rows = parseCsv(text);
  if (!rows.length) return toast('Não encontrei linhas. Inclua o cabeçalho e ao menos uma linha de dados.');
  const headers = Object.keys(rows[0]);
  let body;
  if (kind === 'contas') {
    const columns = mapAccountColumns(headers);
    if (!columns.some(c => c.field === 'nome' || c.field === 'cnpj'))
      return toast('Não encontrei a coluna com o nome da empresa ou o CNPJ. Confira o cabeçalho.');
    const { report } = importAccounts(state.data.accounts, rows, state.profile, state.today);
    const issues = [...report.warnings, ...report.skipped];
    body = `<ul class="plain summary">
        <li><b>${plural(report.added, 'conta nova', 'contas novas')}</b></li>
        <li>${plural(report.merged, 'conta já existente será atualizada', 'contas já existentes serão atualizadas')}</li>
        ${report.derivedSignals.length ? `<li>${plural(report.derivedSignals.length, 'sinal de headcount será gerado', 'sinais de headcount serão gerados')}</li>` : ''}
      </ul>
      <h3>Colunas</h3>
      <ul class="plain cols">${columns
        .map(c =>
          c.field
            ? `<li><span class="ok">✓</span> ${esc(c.header)} → ${esc(ACCOUNT_FIELD_LABELS[c.field])}</li>`
            : `<li class="muted"><span>–</span> ${esc(c.header)} (ignorada)</li>`
        )
        .join('')}</ul>`;
    body += issuesBlock(issues);
    pendingImport = { kind, rows, count: report.added + report.merged };
  } else {
    const { report } = importSignals(state.data.accounts, state.data.signals, rows, state.profile, state.today);
    body = `<ul class="plain summary">
        <li><b>${plural(report.added, 'sinal novo', 'sinais novos')}</b></li>
        <li>${plural(report.duplicates, 'já registrado será ignorado', 'já registrados serão ignorados')}</li>
      </ul>${issuesBlock(report.skipped)}`;
    pendingImport = { kind, rows, count: report.added };
  }
  openDialog(`<form data-form="import-confirm">
    <div class="row between"><h2>Conferir importação</h2><button type="button" class="link" data-action="close-dialog">Fechar</button></div>
    <p class="small muted">${plural(rows.length, 'linha lida', 'linhas lidas')}. Nada foi gravado ainda.</p>
    ${body}
    <div class="row between" style="margin-top:12px">
      <button type="button" data-action="import" data-kind="${kind}">Voltar</button>
      <button class="primary" type="submit" ${pendingImport.count ? '' : 'disabled'}>Importar ${pendingImport.count}</button>
    </div>
  </form>`);
}

function issuesBlock(issues) {
  if (!issues.length) return '';
  return `<h3>${plural(issues.length, 'linha com aviso', 'linhas com aviso')}</h3>
    <div class="report">${issues
      .slice(0, 8)
      .map(w => `<div>Linha ${w.line}: ${esc(w.reason)}</div>`)
      .join('')}${issues.length > 8 ? `<div class="muted">e mais ${issues.length - 8}…</div>` : ''}</div>`;
}

function applyImport(kind, rows) {
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
}

// ---------- ações ----------

function newCadence(ev, extra = {}) {
  return {
    id: `cad-${Date.now().toString(36)}${Math.random().toString(36).slice(2, 5)}`,
    accountId: ev.account.id,
    status: 'convite_enviado',
    iniciadaEm: state.today,
    atualizadaEm: state.today,
    tiposSinal: ev.active.map(e => e.def.id),
    nivel: ev.tier,
    historico: [],
    ...extra
  };
}

const actions = {
  goto: el => ((state.tab = el.dataset.tab), render()),
  'ai-classify': () => openClassify(),
  'ai-classify-run': () => runClassify(),
  'ai-signals': () => openExtract(),
  'inbox-approve': async el => {
    try {
      if (await approveInbox(el.dataset.id)) {
        save();
        render();
        toast('Sinal aprovado; já conta na fila.');
      }
    } catch {
      toast('Não foi possível aprovar agora. Tente de novo.');
    }
  },
  'inbox-approve-all': async () => {
    let n = 0;
    for (const it of inbox.items.slice()) if (await approveInbox(it.docId).catch(() => false)) n++;
    save();
    render();
    toast(`${plural(n, 'sinal aprovado', 'sinais aprovados')}.`);
  },
  'inbox-discard': async el => {
    await store
      .setInboxStatus(state.wsId, el.dataset.id, 'descartado')
      .catch(() => toast('Não foi possível descartar agora.'));
  },
  'ai-signals-run': () => runExtract(),
  'ai-hooks': () => writeHooks(state.queue.items.map(ev => ev.account.id)),
  'ai-hook-one': el => writeHooks([el.dataset.id]),
  'icp-generate': () => generateIcp(false),
  'icp-refine': () => generateIcp(true),
  'icp-edit': () => {
    state.data.icpDraft = structuredClone(icpFromProfile(state.profile));
    save();
    render();
  },
  'icp-discard': () => {
    state.data.icpDraft = null;
    save();
    render();
  },
  'icp-apply': () => {
    try {
      applyIcp(state.data.icpDraft);
    } catch (err) {
      toast(`Não foi possível aplicar: ${err.message}.`);
    }
  },
  'icp-remove-arm': el => {
    state.data.icpDraft.bracos.splice(Number(el.dataset.index), 1);
    save();
    render();
  },
  'icp-restore': el => applyIcp(state.data.icpHistory[Number(el.dataset.index)].icp),
  'close-dialog': () => dialog.close(),
  'open-account': el => openAccountForm(el.dataset.id, el.dataset.focus),
  'new-account': () => openAccountForm(null),
  'new-signal': el => openSignalForm(el.dataset.id),
  import: el => openImport(el.dataset.kind),
  'dismiss-report': () => ((state.lastReport = null), render()),
  'filter-accounts': el => {
    state.filter.group = el.dataset.group;
    state.tab = 'contas';
    render();
  },
  'signal-filter': el => ((state.signalFilter = el.dataset.value), render()),
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
  snooze: el => {
    const a = accountById(el.dataset.id);
    state.data.snoozed[a.id] = addDays(weekStart(state.today), 7);
    save();
    render();
    toast(`${a.nome} volta para a fila em ${formatDate(state.data.snoozed[a.id])}.`);
  },
  unsnooze: el => {
    delete state.data.snoozed[el.dataset.id];
    save();
    render();
  },
  'start-cadence': el => {
    const id = el.dataset.id;
    const ev = state.queue.items.find(e => e.account.id === id);
    state.data.cadence.push(newCadence(ev, { abordagem: state.data.drafts[id] ?? ev.hook.text }));
    delete state.data.drafts[id];
    save();
    render();
    toast(`${ev.account.nome} foi para a Cadência, em “Aguardando aceite”.`);
  },
  'cadence-step': el => {
    const c = state.data.cadence.find(x => x.id === el.dataset.id);
    if (!c) return;
    (c.historico ||= []).push({ status: c.status, em: c.atualizadaEm });
    c.status = el.dataset.status;
    c.atualizadaEm = state.today;
    save();
    render();
    const name = accountById(c.accountId)?.nome;
    toast(
      c.status === 'reuniao'
        ? `Reunião com ${name} registrada.`
        : c.status === 'sem_resposta'
          ? `${name} volta à fila em ${state.profile.capacity.cooldownDays} dias, se tiver sinal.`
          : `${name}: ${statusLabel(c.status)}.`
    );
  },
  'cadence-undo': el => {
    const c = state.data.cadence.find(x => x.id === el.dataset.id);
    if (!c) return;
    const prev = c.historico?.pop();
    if (prev) Object.assign(c, { status: prev.status, atualizadaEm: prev.em });
    else state.data.cadence = state.data.cadence.filter(x => x !== c);
    save();
    render();
    toast(prev ? `Voltou para “${statusLabel(prev.status)}”.` : 'Envio desfeito; a conta voltou para a fila.');
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
    download(
      `fila-${state.profile.id}-${q.weekStart}.csv`,
      toCsv(
        rows,
        Object.keys(rows[0]).map(k => ({ key: k, label: k }))
      )
    );
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
            tipo: 'Vaga de marketing, growth ou mídia paga',
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
        cadencia: statusLabel(cadenceOf(a.id)?.status || '')
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
  'delete-signal': async el => {
    const s = state.data.signals.find(x => x.id === el.dataset.id);
    if (!s) return;
    const reopen = dialog.open ? s.accountId : null;
    state.data.signals = state.data.signals.filter(x => x !== s);
    save();
    render();
    if (reopen) openAccountForm(reopen);
    toast('Sinal removido.');
  },
  'delete-account': async el => {
    const a = accountById(el.dataset.id);
    if (!a) return;
    dialog.close();
    if (!(await ask(`Excluir ${a.nome} com seus sinais e histórico de cadência?`, 'Excluir conta'))) return;
    state.data.accounts = state.data.accounts.filter(x => x !== a);
    state.data.signals = state.data.signals.filter(s => s.accountId !== a.id);
    state.data.cadence = state.data.cadence.filter(c => c.accountId !== a.id);
    delete state.data.snoozed[a.id];
    delete state.data.drafts[a.id];
    save();
    render();
    toast(`${a.nome} excluída.`);
  },
  'apply-weight': el => {
    const o = (state.data.overrides.signals ||= {});
    o[el.dataset.id] = { ...o[el.dataset.id], weight: Number(el.dataset.weight) };
    save();
    render();
    toast('Peso atualizado.');
  },
  'reset-overrides': async () => {
    if (!(await ask('Voltar pesos, ritmo e sinais ativos ao padrão do perfil?', 'Voltar ao padrão'))) return;
    state.data.overrides = {};
    save();
    render();
  },
  'reset-date': () => ((state.today = todayIso()), render()),
  backup: () =>
    download(
      `radar-backup-${state.wsId}-${state.today}.json`,
      store.exportBackup(state.wsId, state.data),
      'application/json'
    ),
  'delete-workspace': async () => {
    const meta = store.listWorkspaces().find(w => w.id === state.wsId);
    if (!(await ask(`Excluir o espaço “${meta?.name}” com todas as contas, sinais e resultados?`, 'Excluir espaço')))
      return;
    clearTimeout(saveTimer);
    saveTimer = null;
    stopWatching();
    await store.deleteWorkspace(state.wsId);
    await ensureWorkspace();
  },
  'load-example': async () => {
    const id = await store.createWorkspace('Exemplo (dados fictícios)', 'velora');
    await openWorkspace(id);
    applyImport('contas', parseCsv(EXAMPLE_ACCOUNTS));
    applyImport('sinais', parseCsv(EXAMPLE_SIGNALS.replaceAll('{hoje}', formatDate(state.today))));
    state.tab = 'semana';
    state.lastReport = null;
    render();
    toast('Espaço de exemplo criado. Troque de espaço no topo para voltar aos seus dados.');
  }
};

function runAction(e) {
  const el = e.target.closest('[data-action]');
  if (el && actions[el.dataset.action]) {
    e.preventDefault();
    actions[el.dataset.action](el);
  }
}
view.addEventListener('click', runAction);
dialog.addEventListener('click', runAction);

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
      warn.textContent = warnings.length
        ? warnings.join(' · ')
        : `${t.value.length}/${state.profile.approach.maxChars} caracteres`;
    }
  } else if (t.dataset.filter === 'text') {
    state.filter.text = t.value;
    const pos = t.selectionStart;
    render();
    const again = $('#account-search');
    again.focus();
    again.setSelectionRange(pos, pos);
  }
});

view.addEventListener('change', async e => {
  const t = e.target;
  const o = state.data.overrides;
  if (t.dataset.icp) {
    setIcpField(t.dataset.icp, t.value, 'list' in t.dataset);
  } else if (t.id === 'icp-brief') {
    state.data.icpBrief = t.value;
    save();
  } else if (t.id === 'ref-date') {
    const d = parseDate(t.value);
    if (d) ((state.today = d), render());
  } else if (t.dataset.field === 'abc') {
    accountById(t.dataset.id).abc = t.value;
    save();
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
    if (!(value > 0) && !(key === 'cooldownDays' && value === 0)) return render();
    o[group] = { ...o[group], [key]: value };
    save();
    render();
  } else if (t.dataset.import === 'backup') {
    const file = t.files?.[0];
    if (!file) return;
    try {
      const text = await readFile(file);
      const parsed = JSON.parse(text);
      if (!profileById(parsed.espaco?.profileId)) throw new Error('perfil desconhecido');
      await openWorkspace(await store.importBackup(text));
      toast('Backup restaurado em um novo espaço.');
    } catch (err) {
      toast(`Não foi possível restaurar: ${err.message}.`);
    }
    t.value = '';
  }
});

dialog.addEventListener('input', e => {
  if (e.target.id === 'extract-text' && extracted) extracted.source = e.target.value;
});

dialog.addEventListener('change', async e => {
  const t = e.target;
  if (t.dataset.clsPick) {
    classify.results.get(t.dataset.clsPick).pick = t.checked;
    renderClassify();
  } else if (t.dataset.clsAbc) {
    classify.results.get(t.dataset.clsAbc).abc = t.value;
  } else if (t.name === 'scope' && classify) {
    classify.scope = t.value;
    renderClassify();
  } else if (t.dataset.extPick != null) {
    extracted.items[Number(t.dataset.extPick)].pick = t.checked;
    renderExtract();
  } else if (t.id === 'sig-tipo') {
    $('#sig-hint').textContent = signalHint(t.value);
    $('#sig-fonte').placeholder = state.profile.signalById[t.value]?.sources[0] || '';
  } else if (t.dataset.importFile != null) {
    const file = t.files?.[0];
    if (!file) return;
    try {
      previewImport(dialog.querySelector('form').dataset.kind, await readFile(file));
    } catch (err) {
      toast(`Não foi possível ler o arquivo: ${err.message}.`);
    }
  }
});

dialog.addEventListener('submit', e => {
  e.preventDefault();
  const form = e.target;
  const kind = form.dataset.form;
  if (kind === 'account') saveAccountForm(form);
  else if (kind === 'classify') applyClassify();
  else if (kind === 'extract') applyExtract();
  else if (kind === 'signal') saveSignalForm(form, e.submitter?.name === 'again');
  else if (kind === 'import-source') {
    const text = form.querySelector('#import-text').value;
    if (!text.trim()) return toast('Cole as linhas da planilha ou escolha um arquivo.');
    previewImport(form.dataset.kind, text);
  } else if (kind === 'import-confirm' && pendingImport) {
    const { kind: what, rows } = pendingImport;
    pendingImport = null;
    applyImport(what, rows);
    dialog.close();
    state.tab = what === 'contas' ? 'contas' : 'sinais';
    render();
    toast('Importação concluída.');
  } else if (kind === 'workspace') {
    const fd = new FormData(form);
    dialog.close();
    store
      .createWorkspace(String(fd.get('nome')).trim() || 'Sem nome', String(fd.get('perfil')))
      .then(openWorkspace)
      .catch(err => toast(`Não foi possível criar o espaço: ${err.message || err.code}.`));
  }
});

// ---------- cabeçalho ----------

$('#tabs').addEventListener('click', e => {
  const b = e.target.closest('[data-tab]');
  if (b) ((state.tab = b.dataset.tab), render());
});
$('#workspace').addEventListener('change', e => openWorkspace(e.target.value));
$('#new-workspace').addEventListener('click', () =>
  openDialog(`<form data-form="workspace">
    <h2>Novo espaço de trabalho</h2>
    <p class="small muted">Cada espaço é isolado: contas, sinais e resultados de um cliente nunca se misturam com os de outro.</p>
    <div class="grid-form">
      <label class="field">Nome<input name="nome" id="ws-nome" required autofocus placeholder="Ex.: Lefosse" /></label>
      <label class="field">Perfil de partida<select name="perfil" id="ws-perfil">${profiles.map(p => `<option value="${p.id}">${esc(p.name)}</option>`).join('')}</select></label>
    </div>
    <div class="row" style="margin-top:12px;justify-content:flex-end"><button type="button" data-action="close-dialog">Cancelar</button><button class="primary" type="submit">Criar</button></div>
  </form>`)
);

// Base fictícia para conhecer o painel sem mexer nos dados reais.
const EXAMPLE_ACCOUNTS = `empresa;cnpj;site;uf;cidade;setor;braco;abc;decisor;cargo;headcount;headcount_6m
Exemplo Alfa Advogados;11.222.333/0001-81;alfa.exemplo;SP;São Paulo;Advocacia;prof;A;Ana Souza;Sócia-diretora;;
Exemplo Beta Seguros;;beta.exemplo;PR;Curitiba;Seguros;fin;B;Bruno Lima;Diretor comercial;130;100
Exemplo Gama Software;;gama.exemplo;SC;Florianópolis;Software;tech;C;;;;
Exemplo Delta Consultoria;;delta.exemplo;RS;Porto Alegre;Consultoria;prof;A;Eva Reis;CEO;;
Exemplo Épsilon Cooperativa;;epsilon.exemplo;RS;Caxias do Sul;Cooperativa de crédito;fin;B;Caio Prado;Superintendente;;
Exemplo Zeta Clínica;;zeta.exemplo;SP;Campinas;Saúde;;B;Dora;;;`;
const EXAMPLE_SIGNALS = `empresa;tipo;data;fonte;detalhe
Exemplo Alfa Advogados;novo_cmo;{hoje};Sales Navigator;
Exemplo Gama Software;rodada_investimento;{hoje};Notícias;Série A de R$ 20 milhões
Exemplo Beta Seguros;vaga_sdr;{hoje};Gupy;Vaga para SDR em Curitiba
Exemplo Delta Consultoria;download_white_paper;{hoje};Formulário do site;`;

view.innerHTML = '<div class="empty">Carregando…</div>';
store
  .init()
  .then(() => ensureWorkspace())
  .catch(
    err =>
      (view.innerHTML = `<div class="empty">Não foi possível abrir os dados: ${esc(err.message || err.code)}.</div>`)
  );
window.claude
  ?.use?.('downloads')
  .then(ns => (downloads = ns))
  .catch(() => {});
// A IA chega depois do primeiro desenho da página; quando chega, os botões aparecem.
(window.claude?.use ? window.claude.use('sample') : Promise.resolve(null))
  .catch(() => null)
  .then(ns => {
    ai = ns;
    aiChecked = true;
    if (state.data) render();
  });
