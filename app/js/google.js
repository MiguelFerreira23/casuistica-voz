// "Ligar com a Google": a app escreve diretamente na Google Sheet com uma autorização
// temporária (~1 h) da conta do utilizador. Não há servidor nem script: o pedido vai do
// telemóvel para a Google. A autorização vive só em memória e expira sozinha.

import { COLUMNS } from './schema.js';
import { parseSheetLink } from './gsheets.js';
import { dateSerial } from './xlsx.js';

// ID de cliente OAuth (público; só funciona em páginas do domínio autorizado).
export const CLIENT_ID = '';
const SCOPE = 'https://www.googleapis.com/auth/spreadsheets openid email';
const API = 'https://sheets.googleapis.com/v4/spreadsheets';
const MAIN_SHEET = 'Casuística';
const COMPLEX_SHEET = 'Casos Complexos';
const NCOLS = COLUMNS.length; // A..AN
const FIRST_ROW = 3;

let token = null; // { access_token, expires }
let gisReady = null;

export const configured = () => !!CLIENT_ID;
export const hasToken = () => !!(token && token.expires > Date.now() + 60_000);

function loadGis() {
  gisReady ??= new Promise((resolve, reject) => {
    if (window.google && google.accounts && google.accounts.oauth2) return resolve();
    const s = document.createElement('script');
    s.src = 'https://accounts.google.com/gsi/client';
    s.async = true;
    s.onload = () => resolve();
    s.onerror = () => { gisReady = null; reject(new Error('Sem ligação à Google.')); };
    document.head.appendChild(s);
  });
  return gisReady;
}

// Pré-carrega a biblioteca da Google, para que o pedido de autorização possa abrir
// a janela logo no toque (o Safari bloqueia janelas que abrem fora de um toque).
export const preload = () => (configured() ? loadGis().catch(() => {}) : Promise.resolve());

/**
 * Pede autorização (abre a janela da Google). Tem de ser chamado dentro de um toque.
 * @param {string} hint email da conta já usada, para não ter de a escolher outra vez
 */
export function authorize(hint) {
  if (!configured()) return Promise.reject(new Error('A ligação Google ainda não está configurada nesta versão da app.'));
  if (!(window.google && google.accounts && google.accounts.oauth2)) {
    loadGis();
    return Promise.reject(new Error('A preparar a ligação à Google… toca outra vez.'));
  }
  return new Promise((resolve, reject) => {
    const client = google.accounts.oauth2.initTokenClient({
      client_id: CLIENT_ID,
      scope: SCOPE,
      hint: hint || undefined,
      prompt: hint ? '' : 'select_account',
      callback: async (r) => {
        if (r.error) return reject(new Error(r.error === 'access_denied' ? 'Autorização recusada.' : r.error));
        if (!google.accounts.oauth2.hasGrantedAllScopes(r, 'https://www.googleapis.com/auth/spreadsheets')) {
          return reject(new Error('É preciso permitir o acesso às folhas de cálculo.'));
        }
        token = { access_token: r.access_token, expires: Date.now() + (Number(r.expires_in) || 3600) * 1000 };
        let email = '';
        try {
          const u = await fetch('https://openidconnect.googleapis.com/v1/userinfo', { headers: { Authorization: `Bearer ${token.access_token}` } });
          email = (await u.json()).email || '';
        } catch {}
        resolve({ email });
      },
      error_callback: (e) => reject(new Error(e && e.type === 'popup_closed' ? 'A janela da Google foi fechada.' : 'Não foi possível abrir a janela da Google.')),
    });
    client.requestAccessToken();
  });
}

export function signOut() {
  if (token && window.google && google.accounts) google.accounts.oauth2.revoke(token.access_token, () => {});
  token = null;
}

async function api(path, opts = {}) {
  if (!hasToken()) { const e = new Error('A autorização Google expirou. Toca em enviar para voltar a autenticar.'); e.auth = true; throw e; }
  let res;
  try {
    res = await fetch(`${API}/${path}`, { ...opts, headers: { Authorization: `Bearer ${token.access_token}`, 'Content-Type': 'application/json', ...(opts.headers || {}) } });
  } catch {
    throw new Error(navigator.onLine === false ? 'Sem rede' : 'Não foi possível contactar a Google.');
  }
  if (res.status === 401) { token = null; const e = new Error('A autorização Google expirou. Toca em enviar para voltar a autenticar.'); e.auth = true; throw e; }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = (data.error && data.error.message) || `Erro ${res.status}`;
    if (res.status === 403) throw new Error('Esta conta não tem permissão de edição nesta folha.');
    if (res.status === 404) throw new Error('Folha não encontrada. Confirma o link.');
    throw new Error(msg);
  }
  return data;
}

const q = (sheetTitle, range) => encodeURIComponent(`'${sheetTitle.replace(/'/g, "''")}'!${range}`);

async function sheetInfo(link) {
  const s = parseSheetLink(link);
  if (!s) throw new Error('Falta o link da Google Sheet (Definições).');
  const meta = await api(`${s.id}?fields=properties.title,sheets.properties(sheetId,title)`);
  const sheets = meta.sheets.map((x) => x.properties);
  const main = (s.gid && sheets.find((x) => String(x.sheetId) === String(s.gid))) || sheets.find((x) => x.title === MAIN_SHEET) || sheets[0];
  const complex = sheets.find((x) => x.title === COMPLEX_SHEET);
  return { id: s.id, title: meta.properties.title, main, complex };
}

// Última linha preenchida em A..AN (a API omite as linhas vazias do fim)
async function lastRow(id, title, first) {
  const d = await api(`${id}/values/${q(title, `A${first}:AN`)}?majorDimension=ROWS&fields=values`);
  const rows = d.values || [];
  for (let i = rows.length - 1; i >= 0; i--) if (rows[i].some((v) => String(v).trim() !== '')) return first + i;
  return first - 1;
}

const isoFromCell = (v) => {
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v).trim());
  return m ? `${m[3]}-${m[2].padStart(2, '0')}-${m[1].padStart(2, '0')}` : String(v).trim();
};

async function findRow(info, row, match) {
  if (!match) return null;
  const same = (r) => r && String(r[1] ?? '').trim() === String(match.np || '').trim() && isoFromCell(r[0] ?? '') === (match.data || '');
  if (row && row >= FIRST_ROW) {
    const d = await api(`${info.id}/values/${q(info.main.title, `A${row}:B${row}`)}?fields=values`);
    if (same((d.values || [])[0])) return row;
  }
  if (!match.np) return null;
  const d = await api(`${info.id}/values/${q(info.main.title, `A${FIRST_ROW}:B`)}?fields=values`);
  const hits = [];
  (d.values || []).forEach((r, i) => { if (same(r)) hits.push(FIRST_ROW + i); });
  return hits.length === 1 ? hits[0] : null;
}

function toCells(v) {
  return COLUMNS.map((c) => {
    const x = v[c.key];
    if (x === '' || x == null) return '';
    if (c.type === 'date') return dateSerial(x);
    if (c.type === 'number' || (c.key === 'np' && /^\d{1,15}$/.test(String(x)))) { const n = Number(String(x).replace(',', '.')); return isNaN(n) ? String(x) : n; }
    return String(x);
  });
}

export async function ping(link) {
  const info = await sheetInfo(link);
  const h = await api(`${info.id}/values/${q(info.main.title, 'A2:AN2')}?fields=values`);
  const headers = (h.values || [[]])[0];
  return { spreadsheet: info.title, sheet: info.main.title, headers, lastRow: await lastRow(info.id, info.main.title, FIRST_ROW) };
}

export async function upsert(link, rec) {
  const info = await sheetInfo(link);
  const v = rec.values;
  let row = await findRow(info, rec.sync && rec.sync.row, rec.sync && rec.sync.match);
  const created = !row;
  if (created) row = (await lastRow(info.id, info.main.title, FIRST_ROW)) + 1;
  // valores (RAW: a data vai como número de série e fica com o formato de data da coluna)
  await api(`${info.id}/values/${q(info.main.title, `A${row}:AN${row}`)}?valueInputOption=RAW`, {
    method: 'PUT', body: JSON.stringify({ values: [toCells(v)] }),
  });
  // notas das células (vazias limpam notas antigas desta linha)
  const notes = rec.cellNotes || {};
  const requests = [{
    updateCells: {
      range: { sheetId: info.main.sheetId, startRowIndex: row - 1, endRowIndex: row, startColumnIndex: 0, endColumnIndex: NCOLS },
      rows: [{ values: COLUMNS.map((c) => ({ note: notes[c.key] || '' })) }],
      fields: 'note',
    },
  }];
  await api(`${info.id}:batchUpdate`, { method: 'POST', body: JSON.stringify({ requests }) });
  // casos complexos: uma linha na folha própria, só quando o registo é novo
  if (created && v.complexo === 'Sim' && info.complex) {
    const r2 = (await lastRow(info.id, info.complex.title, 2)) + 1;
    await api(`${info.id}/values/${q(info.complex.title, `A${r2}:E${r2}`)}?valueInputOption=RAW`, {
      method: 'PUT',
      body: JSON.stringify({ values: [[v.data ? dateSerial(v.data) : '', v.esp || '', v.proc || '', v.compl || '', [v.part, v.obs].filter(Boolean).join('; ')]] }),
    });
  }
  return { row, created, match: { np: String(v.np || ''), data: v.data || '' } };
}
