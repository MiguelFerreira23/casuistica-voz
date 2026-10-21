// Registos guardados no próprio dispositivo (IndexedDB).

const DB = 'casuistica';
const STORE = 'records';
const FILES = 'files';

function open() {
  return new Promise((resolve, reject) => {
    const req = indexedDB.open(DB, 2);
    req.onupgradeneeded = () => {
      const db = req.result;
      if (!db.objectStoreNames.contains(STORE)) db.createObjectStore(STORE, { keyPath: 'id' });
      if (!db.objectStoreNames.contains(FILES)) db.createObjectStore(FILES);
    };
    req.onsuccess = () => resolve(req.result);
    req.onerror = () => reject(req.error);
  });
}

async function tx(mode, fn, store = STORE) {
  const db = await open();
  return new Promise((resolve, reject) => {
    const t = db.transaction(store, mode);
    const out = fn(t.objectStore(store));
    t.oncomplete = () => resolve(out && 'result' in out ? out.result : out);
    t.onerror = () => reject(t.error);
  });
}

export const allRecords = async () => (await tx('readonly', (s) => s.getAll())).sort((a, b) => (b.values.data || '').localeCompare(a.values.data || '') || b.createdAt - a.createdAt);
export const putRecord = (r) => tx('readwrite', (s) => s.put(r));
export const deleteRecord = (id) => tx('readwrite', (s) => s.delete(id));
export const clearAll = () => tx('readwrite', (s) => s.clear());

// Ficheiro Excel base do modo "Excel no iPhone", um por destino: { name, buffer, savedAt }
export const getBaseFile = async (profileId) => (await tx('readonly', (s) => s.get('base:' + profileId), FILES)) || (profileId === 'p1' ? tx('readonly', (s) => s.get('base'), FILES) : undefined);
export const setBaseFile = (profileId, f) => tx('readwrite', (s) => { s.delete('base'); return s.put(f, 'base:' + profileId); }, FILES);
export const clearBaseFile = (profileId) => tx('readwrite', (s) => { s.delete('base'); return s.delete('base:' + profileId); }, FILES);

export const newId = () => (crypto.randomUUID ? crypto.randomUUID() : String(Date.now()) + Math.random().toString(16).slice(2));

export async function requestPersistence() {
  try { if (navigator.storage && navigator.storage.persist) return await navigator.storage.persist(); } catch {}
  return false;
}

export const settings = {
  get(k, d) { try { const v = localStorage.getItem('cas.' + k); return v == null ? d : JSON.parse(v); } catch { return d; } },
  set(k, v) { try { localStorage.setItem('cas.' + k, JSON.stringify(v)); } catch {} },
};
