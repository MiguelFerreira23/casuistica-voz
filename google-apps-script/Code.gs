/**
 * Ponte entre a app "Casuística por voz" e uma Google Sheet.
 *
 * Este ficheiro NÃO tem nada para preencher: o link da folha e o token configuram-se na app.
 *
 * Instalação (uma vez, na tua conta Google):
 *  1. https://script.google.com → Novo projeto → cola este ficheiro tal como está.
 *  2. Implementar → Nova implementação → tipo "Aplicação Web"
 *       Executar como: Eu  ·  Quem tem acesso: Qualquer pessoa
 *  3. Autoriza e copia o URL que termina em /exec.
 *  4. Na app (Definições → Google Sheets): cola esse URL, o link da folha e escolhe um token.
 *     Em "Testar ligação", o primeiro token usado fica gravado neste script; a partir daí
 *     só pedidos com esse token são aceites.
 *
 * Para mudar o token: no editor do Apps Script, Definições do projeto → Propriedades do script
 * → apaga "TOKEN" e volta a testar a ligação na app com o token novo.
 *
 * Segurança: o script só aceita pedidos com o token e só escreve nas folhas autorizadas
 * (a primeira testada fica registada em "SHEETS"; para outra folha, acrescenta o ID a SHEETS,
 * separado por vírgula). Não devolve dados das linhas.
 *
 * O script só acrescenta ou atualiza linhas (valores e notas) nas colunas A..AN da folha da casuística e, para casos
 * complexos, acrescenta uma linha em "Casos Complexos". Não apaga nada.
 */

const SHEET_NAME = 'Casuística';
const COMPLEX_SHEET_NAME = 'Casos Complexos';
const HEADER_ROW = 2;
const FIRST_ROW = 3;
const NCOLS = 40; // A..AN

function doPost(e) {
  const lock = LockService.getScriptLock();
  lock.waitLock(20000);
  try {
    const req = JSON.parse(e.postData.contents);
    const auth = checkToken(req.token);
    if (auth) return out({ ok: false, error: auth });
    if (!req.sheetId) return out({ ok: false, error: 'Falta o link da folha (Definições da app).' });
    const allowed = checkSheet(String(req.sheetId));
    if (allowed) return out({ ok: false, error: allowed });

    const ss = SpreadsheetApp.openById(req.sheetId);
    const sh = mainSheet(ss, req.gid);
    if (!sh) return out({ ok: false, error: 'Folha da casuística não encontrada nesse ficheiro.' });

    if (req.action === 'ping') {
      const headers = sh.getRange(HEADER_ROW, 1, 1, NCOLS).getDisplayValues()[0];
      return out({ ok: true, spreadsheet: ss.getName(), sheet: sh.getName(), headers: headers, lastRow: lastDataRow(sh) });
    }

    if (req.action === 'upsert') {
      const values = toCells(req.values);
      let row = findRow(sh, req.row, req.match);
      const isNew = !row;
      if (isNew) row = lastDataRow(sh) + 1;
      sh.getRange(row, 1, 1, NCOLS).setValues([values]);
      // notas das células (vazias limpam notas antigas desta linha)
      if (Array.isArray(req.notes)) {
        const notes = req.notes.slice(0, NCOLS).map(function (n) { return n ? String(n) : ''; });
        while (notes.length < NCOLS) notes.push('');
        sh.getRange(row, 1, 1, NCOLS).setNotes([notes]);
      }
      if (isNew && req.complex) appendComplex(ss, req.complex);
      return out({ ok: true, row: row, created: isNew });
    }
    return out({ ok: false, error: 'Ação desconhecida' });
  } catch (err) {
    return out({ ok: false, error: String((err && err.message) || err) });
  } finally {
    lock.releaseLock();
  }
}

function doGet() {
  return out({ ok: true, info: 'Casuística: usar POST' });
}

// O primeiro token recebido fica guardado nas propriedades do script.
function checkToken(token) {
  if (!token || String(token).length < 8) return 'Token em falta ou curto demais (mínimo 8 caracteres).';
  const props = PropertiesService.getScriptProperties();
  const saved = props.getProperty('TOKEN');
  if (!saved) { props.setProperty('TOKEN', String(token)); return null; }
  return saved === String(token) ? null : 'Token inválido.';
}

// Só as folhas autorizadas: a primeira usada fica registada; outras acrescentam-se à mão em
// Definições do projeto → Propriedades do script → SHEETS (IDs separados por vírgulas).
function checkSheet(id) {
  const props = PropertiesService.getScriptProperties();
  const list = (props.getProperty('SHEETS') || '').split(',').map(function (x) { return x.trim(); }).filter(String);
  if (!list.length) { props.setProperty('SHEETS', id); return null; }
  return list.indexOf(id) >= 0 ? null : 'Esta folha não está autorizada neste script. Acrescenta o ID em Propriedades do script → SHEETS.';
}

function mainSheet(ss, gid) {
  const sheets = ss.getSheets();
  if (gid !== undefined && gid !== null && gid !== '') {
    const byGid = sheets.filter(function (s) { return String(s.getSheetId()) === String(gid); })[0];
    if (byGid) return byGid;
  }
  return ss.getSheetByName(SHEET_NAME) || sheets.filter(function (s) {
    return String(s.getRange(HEADER_ROW, 2).getDisplayValue()).trim() === 'NP';
  })[0];
}

// Última linha com conteúdo em A..AN (ignora linhas só com formatação/validação)
function lastDataRow(sh) {
  const max = sh.getMaxRows();
  if (max < FIRST_ROW) return FIRST_ROW - 1;
  const data = sh.getRange(FIRST_ROW, 1, max - FIRST_ROW + 1, NCOLS).getDisplayValues();
  for (let i = data.length - 1; i >= 0; i--) {
    if (data[i].some(function (v) { return String(v).trim() !== ''; })) return FIRST_ROW + i;
  }
  return FIRST_ROW - 1;
}

// Encontra a linha já enviada antes: confirma que ainda tem o mesmo NP/data, senão procura.
function findRow(sh, row, match) {
  if (!match) return null;
  const same = function (r) {
    return String(r[1]).trim() === String(match.np || '').trim() && normDate(r[0]) === (match.data || '');
  };
  if (row && row >= FIRST_ROW && row <= sh.getMaxRows()) {
    const r = sh.getRange(row, 1, 1, 2).getValues()[0];
    if (same(r)) return row;
  }
  if (!match.np) return null;
  const last = lastDataRow(sh);
  if (last < FIRST_ROW) return null;
  const rows = sh.getRange(FIRST_ROW, 1, last - FIRST_ROW + 1, 2).getValues();
  const hits = [];
  rows.forEach(function (r, i) { if (same(r)) hits.push(FIRST_ROW + i); });
  return hits.length === 1 ? hits[0] : null;
}

function normDate(v) {
  if (v instanceof Date) return Utilities.formatDate(v, Session.getScriptTimeZone(), 'yyyy-MM-dd');
  const m = /^(\d{1,2})\/(\d{1,2})\/(\d{4})$/.exec(String(v).trim());
  return m ? m[3] + '-' + ('0' + m[2]).slice(-2) + '-' + ('0' + m[1]).slice(-2) : String(v);
}

function toDate(iso) {
  const m = /^(\d{4})-(\d{2})-(\d{2})$/.exec(iso || '');
  return m ? new Date(Number(m[1]), Number(m[2]) - 1, Number(m[3])) : '';
}

// values: lista com 40 valores pela ordem das colunas A..AN
function toCells(values) {
  const v = (values || []).slice(0, NCOLS);
  while (v.length < NCOLS) v.push('');
  v[0] = toDate(v[0]);                                         // Data
  if (/^\d+$/.test(String(v[1]))) v[1] = Number(v[1]);           // NP
  if (v[2] !== '' && !isNaN(Number(v[2]))) v[2] = Number(v[2]);  // Idade
  return v;
}

function appendComplex(ss, c) {
  const sh = ss.getSheetByName(COMPLEX_SHEET_NAME);
  if (!sh) return;
  const data = sh.getRange(2, 1, Math.max(1, sh.getMaxRows() - 1), 5).getDisplayValues();
  let last = 1;
  data.forEach(function (r, i) { if (r.some(function (x) { return String(x).trim() !== ''; })) last = 2 + i; });
  sh.getRange(last + 1, 1, 1, 5).setValues([[toDate(c.data), c.esp || '', c.proc || '', c.compl || '', c.desc || '']]);
}

function out(o) {
  return ContentService.createTextOutput(JSON.stringify(o)).setMimeType(ContentService.MimeType.JSON);
}
