// Envio para Google Sheets através do Apps Script do utilizador (app/Code.gs).
// Só é enviada a linha final já validada; a interpretação do texto continua no dispositivo.

import { COLUMNS } from './schema.js';

// Aceita o URL completo da app para a Web ou só o ID de implementação ("AKfycb…").
// Devolve o URL /exec, ou null se não for reconhecido.
export function scriptUrl(input) {
  const v = String(input || '').trim();
  if (!v) return null;
  const m = /^https:\/\/script\.google\.com\/(a\/macros\/[^/]+|macros)\/s\/([A-Za-z0-9_-]{20,})(?:\/(?:exec|dev))?\/?(?:[?#].*)?$/.exec(v);
  if (m) return `https://script.google.com/${m[1]}/s/${m[2]}/exec`;
  if (/^[A-Za-z0-9_-]{30,}$/.test(v)) return `https://script.google.com/macros/s/${v}/exec`;
  return null;
}

async function post(cfg, body) {
  const url = scriptUrl(cfg.url);
  if (!url) throw new Error(cfg.url ? 'O URL ou ID do Apps Script não foi reconhecido.' : 'Falta o URL ou o ID do Apps Script (Definições).');
  // text/plain evita o pedido de "preflight" CORS, que o Apps Script não suporta
  const sheet = parseSheetLink(cfg.sheetLink);
  if (!sheet) throw new Error('Falta o link da Google Sheet (Definições).');
  if (!cfg.token || cfg.token.length < 8) throw new Error('O token tem de ter pelo menos 8 caracteres.');
  let res;
  try {
    res = await fetch(url, { method: 'POST', body: JSON.stringify({ ...body, token: cfg.token, sheetId: sheet.id, gid: sheet.gid }), redirect: 'follow' });
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
