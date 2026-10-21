// Destinos: cada um é um sítio para onde vão os registos (Excel no iPhone ou uma Google Sheet),
// com a sua configuração de campos obrigatórios. Tudo guardado só neste dispositivo.

import { settings } from './store.js';
import { defaultRequired } from './schema.js';

const newProfile = (over = {}) => ({
  id: 'p' + Date.now().toString(36),
  name: 'Casuística de urgência',
  model: 'urgencia', // modelo de colunas (schema.js); outros modelos podem ser acrescentados no futuro
  mode: 'local',
  gsSheet: '',
  gsUrl: '',
  gsToken: '',
  required: defaultRequired(),
  ...over,
});

export function profiles() {
  let list = settings.get('profiles', null);
  if (!list || !list.length) {
    // migração da configuração antiga (um só destino)
    list = [newProfile({
      id: 'p1',
      mode: settings.get('mode', 'local'),
      gsSheet: settings.get('gsSheet', ''),
      gsUrl: settings.get('gsUrl', ''),
      gsToken: settings.get('gsToken', ''),
    })];
    settings.set('profiles', list);
    settings.set('activeProfile', 'p1');
  }
  // campos novos no esquema ficam com a sugestão por omissão
  const def = defaultRequired();
  for (const p of list) p.required = { ...def, ...(p.required || {}) };
  return list;
}

export function activeProfile() {
  const list = profiles();
  return list.find((p) => p.id === settings.get('activeProfile')) || list[0];
}

export function setActive(id) { settings.set('activeProfile', id); }

export function updateProfile(id, patch) {
  const list = profiles().map((p) => (p.id === id ? { ...p, ...patch } : p));
  settings.set('profiles', list);
  return list.find((p) => p.id === id);
}

export function addProfile(name, copyFrom) {
  const p = newProfile({ name, required: copyFrom ? { ...copyFrom.required } : defaultRequired() });
  settings.set('profiles', [...profiles(), p]);
  setActive(p.id);
  return p;
}

export function removeProfile(id) {
  const list = profiles().filter((p) => p.id !== id);
  if (!list.length) return false;
  settings.set('profiles', list);
  if (settings.get('activeProfile') === id) setActive(list[0].id);
  return true;
}

// Registos antigos (sem destino) pertencem ao primeiro destino
export const belongsTo = (rec, profile) => (rec.profileId || profiles()[0].id) === profile.id;
