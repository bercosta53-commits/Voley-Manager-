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
  render();
}

function normalizeData(data) {
  data.drafts ||= {};
  data.snoozed ||= {};
  data.overrides ||= {};
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
    contas: state.data.accounts.length
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
      text: `${ready} de ${state.profile.goals.readyAccounts} contas prontas para contato.`,
      button: '<button data-action="filter-accounts" data-group="pendentes">Ver o que falta</button>'
    },
    {
      done: state.data.signals.length > 0,
      title: 'Registre os sinais que encontrar',
      text: 'Novo CMO, vaga de SDR, rodada, download de white paper…',
      button: '<button data-action="new-signal">Registrar sinal</button>'
    },
    {
      done: state.data.cadence.length > 0,
      title: 'Envie o primeiro convite da fila',
      text: 'Revise a abordagem, copie, envie pelo Sales Navigator e marque aqui.',
      button: ''
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
          <div>${!s.done && i === next ? s.button : ''}</div>
        </li>`
      )
      .join('')}</ol>
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
          ${state.data.drafts[id] != null ? `<button class="link" data-action="reset-draft" data-id="${esc(id)}">Voltar à sugestão</button>` : ''}
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
        <td class="small">${a.decisor ? `${esc(a.decisor)}${a.cargo ? `<div class="muted">${esc(a.cargo)}</div>` : ''}` : `<button class="link" data-action="open-account" data-id="${esc(a.id)}" data-focus="decisor">Adicionar decisor</button>`}</td>
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
  return `<section class="panel">
      <div class="row between">
        <div><h2>Sinais</h2><div class="small muted">Cada sinal vale ${validDays} dias. Sinais diferentes na mesma conta somam.</div></div>
        <div class="row">
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
  return `<section class="panel">
      <h2>Contas prontas para contato</h2>
      <div class="row between"><b class="big">${m.ready} de ${m.goal}</b>
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
      <h2>Perfil: ${esc(p.name)}</h2>
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
      ${input('decisor', 'Decisor', a.decisor, focus === 'decisor' ? 'autofocus' : '')}
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
  if (t.id === 'ref-date') {
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

dialog.addEventListener('change', async e => {
  const t = e.target;
  if (t.id === 'sig-tipo') {
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
