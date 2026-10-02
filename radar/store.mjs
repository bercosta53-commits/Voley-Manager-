// Persistência por espaço de trabalho. Cada cliente fica separado: os dados de um nunca
// alimentam outro. Publicado no claude.ai, grava no banco do próprio link (capacidade `db`),
// compartilhado por quem abre a página; rodando localmente, grava no navegador.
const PARTS = ['accounts', 'signals', 'cadence', 'config'];
// Um documento do banco aceita até 256 KiB; listas longas são divididas em pedaços.
const CHUNK_BYTES = 180 * 1024;

const emptyData = () => ({ accounts: [], signals: [], cadence: [], overrides: {}, drafts: {}, snoozed: {} });

// ---------- navegador ----------

const localBackend = {
  kind: 'local',
  read(key, fallback) {
    try {
      const raw = localStorage.getItem(key);
      return raw ? JSON.parse(raw) : fallback;
    } catch {
      return fallback;
    }
  },
  write(key, value) {
    try {
      localStorage.setItem(key, JSON.stringify(value));
      return true;
    } catch {
      return false;
    }
  },
  async list() {
    return this.read('radar:espacos', []);
  },
  async saveList(list) {
    if (!this.write('radar:espacos', list)) throw new Error('armazenamento do navegador indisponível');
  },
  async load(id) {
    return { ...emptyData(), ...this.read(`radar:espaco:${id}`, {}) };
  },
  async save(id, data) {
    if (!this.write(`radar:espaco:${id}`, data)) throw new Error('armazenamento do navegador indisponível');
  },
  async remove(id) {
    try {
      localStorage.removeItem(`radar:espaco:${id}`);
    } catch {}
  },
  watch() {
    return () => {};
  },
  // A captação automática só existe no link publicado (grava no banco do link).
  watchInbox(id, onChange) {
    onChange([], null);
    return () => {};
  },
  async setInboxStatus() {}
};

// ---------- banco do artifact ----------

function chunk(items) {
  const chunks = [];
  let current = [],
    size = 0;
  for (const item of items) {
    const bytes = JSON.stringify(item).length * 2;
    if (current.length && size + bytes > CHUNK_BYTES) (chunks.push(current), (current = []), (size = 0));
    current.push(item);
    size += bytes;
  }
  chunks.push(current);
  return chunks;
}

function splitData(data) {
  const docs = {};
  for (const part of PARTS.slice(0, 3))
    chunk(data[part] || []).forEach((items, i, all) => (docs[`${part}-${i}`] = { items, total: all.length }));
  // Tudo o que não é lista (ajustes, rascunhos, ICP desenhado) vai num documento só.
  const { accounts, signals, cadence, ...config } = data;
  docs['config-0'] = config;
  return docs;
}

function joinDocs(docs) {
  const data = emptyData();
  for (const part of PARTS.slice(0, 3)) {
    const pieces = docs.filter(d => d.id.startsWith(part + '-'));
    const total = pieces[0]?.data().total ?? 0;
    for (let i = 0; i < total; i++) {
      const piece = pieces.find(d => d.id === `${part}-${i}`);
      if (piece) data[part].push(...piece.data().items);
    }
  }
  const config = docs.find(d => d.id === 'config-0')?.data();
  if (config) Object.assign(data, structuredClone(config));
  data.accounts = structuredClone(data.accounts);
  data.signals = structuredClone(data.signals);
  data.cadence = structuredClone(data.cadence);
  return data;
}

function dbBackend(db) {
  const written = new Map(); // caminho -> JSON do último conteúdo gravado
  const parts = id => db.collection(`espacos/${id}/partes`);
  let queue = Promise.resolve();
  return {
    kind: 'db',
    async list() {
      const snap = await db.collection('espacos').get();
      return snap.docs
        .map(d => ({ id: d.id, ...d.data() }))
        .sort((a, b) => String(a.criadoEm).localeCompare(String(b.criadoEm)));
    },
    async saveList(list, changed) {
      for (const w of changed.added)
        await db.doc(`espacos/${w.id}`).set({ name: w.name, profileId: w.profileId, criadoEm: w.criadoEm });
      for (const w of changed.removed) await db.doc(`espacos/${w.id}`).delete();
    },
    async load(id) {
      const snap = await parts(id).get();
      for (const d of snap.docs) written.set(`${id}/${d.id}`, JSON.stringify(d.data()));
      return joinDocs(snap.docs);
    },
    // Grava só os pedaços que mudaram, um de cada vez, em ordem.
    save(id, data) {
      const docs = splitData(data);
      queue = queue.then(async () => {
        for (const [name, body] of Object.entries(docs)) {
          const key = `${id}/${name}`,
            json = JSON.stringify(body);
          if (written.get(key) === json) continue;
          // Marca antes de gravar para que o eco da própria gravação não pareça alteração alheia.
          written.set(key, json);
          try {
            await parts(id).doc(name).set(body);
          } catch (err) {
            written.delete(key);
            throw err;
          }
        }
        for (const key of [...written.keys()])
          if (key.startsWith(id + '/') && !(key.slice(id.length + 1) in docs)) {
            await parts(id)
              .doc(key.slice(id.length + 1))
              .delete();
            written.delete(key);
          }
      });
      return queue;
    },
    async remove(id) {
      const snap = await parts(id).get();
      for (const d of snap.docs) {
        await parts(id).doc(d.id).delete();
        written.delete(`${id}/${d.id}`);
      }
    },
    // Caixa de sinais captados pela IA fora da página, à espera de revisão, e o resumo da última coleta.
    watchInbox(id, onChange) {
      let items = [],
        status = null;
      const emit = () => onChange(items, status);
      const stopItems = db
        .collection(`espacos/${id}/caixa`)
        .where('status', '==', 'pendente')
        .onSnapshot(
          snap => ((items = snap.docs.map(d => ({ docId: d.id, ...d.data() }))), emit()),
          () => {}
        );
      const stopStatus = db.doc(`espacos/${id}/coleta/estado`).onSnapshot(
        snap => ((status = snap.exists ? snap.data() : null), emit()),
        () => {}
      );
      return () => (stopItems(), stopStatus());
    },
    async setInboxStatus(id, docId, status) {
      await db.doc(`espacos/${id}/caixa/${docId}`).update({ status, revisadoEm: new Date().toISOString() });
    },
    // Avisa quando outra pessoa altera o espaço aberto.
    watch(id, onChange) {
      let first = true;
      return parts(id).onSnapshot(
        snap => {
          if (first) return void (first = false);
          if (snap.metadata.hasPendingWrites) return;
          const fresh = snap.docs.some(d => written.get(`${id}/${d.id}`) !== JSON.stringify(d.data()));
          if (!fresh) return;
          for (const d of snap.docs) written.set(`${id}/${d.id}`, JSON.stringify(d.data()));
          onChange(joinDocs(snap.docs));
        },
        () => {}
      );
    }
  };
}

// ---------- API usada pelo painel ----------

let backend = localBackend;
let workspaces = [];

export async function init() {
  const db = window.claude?.use ? await window.claude.use('db').catch(() => null) : null;
  if (db) backend = dbBackend(db);
  workspaces = await backend.list();
  return backend.kind;
}

export const storageKind = () => backend.kind;
export const listWorkspaces = () => workspaces.slice();

export async function createWorkspace(name, profileId, data = emptyData()) {
  const ws = { id: `${profileId}-${Date.now().toString(36)}`, name, profileId, criadoEm: new Date().toISOString() };
  workspaces.push(ws);
  await backend.saveList(workspaces, { added: [ws], removed: [] });
  await backend.save(ws.id, { ...emptyData(), ...data });
  return ws.id;
}

export async function deleteWorkspace(id) {
  const ws = workspaces.find(w => w.id === id);
  workspaces = workspaces.filter(w => w.id !== id);
  await backend.saveList(workspaces, { added: [], removed: ws ? [ws] : [] });
  await backend.remove(id);
}

export const loadWorkspace = async id => ({ ...emptyData(), ...(await backend.load(id)) });
export const saveWorkspace = (id, data) => backend.save(id, data);
export const watchWorkspace = (id, onChange) => backend.watch(id, onChange);
export const watchInbox = (id, onChange) => backend.watchInbox(id, onChange);
export const setInboxStatus = (id, docId, status) => backend.setInboxStatus(id, docId, status);

export function exportBackup(id, data) {
  const meta = workspaces.find(w => w.id === id);
  return JSON.stringify({ formato: 'radar-backup-1', espaco: meta, dados: data }, null, 2);
}

export async function importBackup(text) {
  const parsed = JSON.parse(text);
  if (parsed.formato !== 'radar-backup-1' || !parsed.espaco?.profileId) throw new Error('arquivo de backup inválido');
  return createWorkspace(parsed.espaco.name + ' (restaurado)', parsed.espaco.profileId, parsed.dados);
}
