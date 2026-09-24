// Persistência por espaço de trabalho. Cada cliente fica numa chave separada:
// os dados de um nunca alimentam outro.
const INDEX_KEY = 'radar:espacos';
const wsKey = id => `radar:espaco:${id}`;

const emptyData = () => ({ accounts: [], signals: [], cadence: [], overrides: {} });

function read(key, fallback) {
  try {
    const raw = localStorage.getItem(key);
    return raw ? JSON.parse(raw) : fallback;
  } catch {
    return fallback;
  }
}
function write(key, value) {
  try {
    localStorage.setItem(key, JSON.stringify(value));
    return true;
  } catch {
    return false;
  }
}

export const listWorkspaces = () => read(INDEX_KEY, []);

export function createWorkspace(name, profileId) {
  const list = listWorkspaces();
  const id = `${profileId}-${Date.now().toString(36)}`;
  list.push({ id, name, profileId });
  write(INDEX_KEY, list);
  write(wsKey(id), emptyData());
  return id;
}

export function deleteWorkspace(id) {
  write(
    INDEX_KEY,
    listWorkspaces().filter(w => w.id !== id)
  );
  try {
    localStorage.removeItem(wsKey(id));
  } catch {}
}

export const loadWorkspace = id => ({ ...emptyData(), ...read(wsKey(id), {}) });
export const saveWorkspace = (id, data) => write(wsKey(id), data);

export function exportBackup(id) {
  const meta = listWorkspaces().find(w => w.id === id);
  return JSON.stringify({ formato: 'radar-backup-1', espaco: meta, dados: loadWorkspace(id) }, null, 2);
}

export function importBackup(text) {
  const parsed = JSON.parse(text);
  if (parsed.formato !== 'radar-backup-1' || !parsed.espaco?.profileId) throw new Error('Arquivo de backup inválido');
  const id = createWorkspace(parsed.espaco.name + ' (restaurado)', parsed.espaco.profileId);
  saveWorkspace(id, { ...emptyData(), ...parsed.dados });
  return id;
}
