// Envio para Google Sheets através do Apps Script do utilizador (google-apps-script/Code.gs).
// Só é enviada a linha final já validada; a interpretação do texto continua no dispositivo.

import { COLUMNS } from './schema.js';

async function post(cfg, body) {
  if (!cfg.url) throw new Error('Falta o URL do Apps Script (Definições).');
  // text/plain evita o pedido de "preflight" CORS, que o Apps Script não suporta
  const sheet = parseSheetLink(cfg.sheetLink);
  if (!sheet) throw new Error('Falta o link da Google Sheet (Definições).');
  if (!cfg.token || cfg.token.length < 8) throw new Error('O token tem de ter pelo menos 8 caracteres.');
  let res;
  try {
    res = await fetch(cfg.url, { method: 'POST', body: JSON.stringify({ ...body, token: cfg.token, sheetId: sheet.id, gid: sheet.gid }), redirect: 'follow' });
  } catch {
    throw new Error(navigator.onLine === false ? 'Sem rede' : 'Não foi possível contactar o Apps Script (URL errado ou sem rede).');
  }
  let data;
  try { data = await res.json(); } catch { throw new Error(`Resposta inválida (${res.status}). Confirma o URL /exec e o acesso "Qualquer pessoa".`); }
  if (!data.ok) throw new Error(data.error || 'Erro no Apps Script');
  return data;
}

// "https://docs.google.com/spreadsheets/d/<id>/edit?gid=<gid>#gid=<gid>" -> { id, gid }
export function parseSheetLink(link) {
  const m = /\/spreadsheets\/d\/([A-Za-z0-9_-]{20,})/.exec(link || '') || /^\s*([A-Za-z0-9_-]{30,})\s*$/.exec(link || '');
  if (!m) return null;
  const g = /[#?&]gid=(\d+)/.exec(link);
  return { id: m[1], gid: g ? g[1] : null };
}

const norm = (s) => String(s || '').normalize('NFD').replace(/\p{M}/gu, '').toLowerCase().trim();

export async function ping(cfg) {
  const d = await post(cfg, { action: 'ping' });
  const mismatch = COLUMNS.map((c, i) => ({ exp: c.label, got: d.headers[i] || '' }))
    .filter((x) => norm(x.exp) !== norm(x.got) && !norm(x.got).startsWith(norm(x.exp)));
  return { ...d, mismatch };
}

export async function upsert(cfg, rec) {
  const v = rec.values;
  const prev = rec.sync && rec.sync.match;
  const body = {
    action: 'upsert',
    values: COLUMNS.map((c) => v[c.key] ?? ''),
    notes: COLUMNS.map((c) => (rec.cellNotes || {})[c.key] || ''),
    row: rec.sync && rec.sync.row,
    match: prev || null,
    complex: v.complexo === 'Sim' ? { data: v.data, esp: v.esp, proc: v.proc, compl: v.compl, desc: [v.part, v.obs].filter(Boolean).join('; ') } : null,
  };
  const d = await post(cfg, body);
  return { row: d.row, created: d.created, match: { np: String(v.np || ''), data: v.data || '' } };
}
