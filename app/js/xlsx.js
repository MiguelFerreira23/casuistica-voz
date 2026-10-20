// Acrescenta linhas a um .xlsx existente editando diretamente o XML da folha,
// para manter intactas as validações, fórmulas, formatação e restantes folhas.

import { COLUMNS } from './schema.js';

const MAIN_SHEET = 'Casuística';
const COMPLEX_SHEET = 'Casos Complexos';

const colLetter = (n) => { let s = ''; for (n++; n > 0; n = Math.floor((n - 1) / 26)) s = String.fromCharCode(65 + ((n - 1) % 26)) + s; return s; };
const colIndex = (letters) => [...letters].reduce((a, c) => a * 26 + c.charCodeAt(0) - 64, 0) - 1;
const esc = (s) => String(s).replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;')
  // caracteres de controlo não são válidos em XML
  .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, '');

export function dateSerial(iso) {
  const [y, m, d] = iso.split('-').map(Number);
  return (Date.UTC(y, m - 1, d) - Date.UTC(1899, 11, 30)) / 86400000;
}

async function sheetPath(zip, name) {
  const wb = await zip.file('xl/workbook.xml').async('string');
  const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
  const sheet = [...wb.matchAll(/<sheet\b[^>]*>/g)].map((m) => m[0]).find((t) => decodeXml(attr(t, 'name')) === name);
  if (!sheet) return null;
  const rid = attr(sheet, 'r:id');
  const rel = [...rels.matchAll(/<Relationship\b[^>]*>/g)].map((m) => m[0]).find((t) => attr(t, 'Id') === rid);
  let target = attr(rel, 'Target');
  target = target.startsWith('/') ? target.slice(1) : 'xl/' + target;
  return target;
}
const attr = (tag, name) => { const m = new RegExp(`\\s${name.replace(':', '\\:')}="([^"]*)"`).exec(tag); return m ? m[1] : null; };
const decodeXml = (s) => s && s.replace(/&quot;/g, '"').replace(/&apos;/g, "'").replace(/&lt;/g, '<').replace(/&gt;/g, '>').replace(/&amp;/g, '&');

// Divide <sheetData> em linhas editáveis.
function splitSheet(xml) {
  const m = /<sheetData\b[^>]*?(?:\/>|>([\s\S]*?)<\/sheetData>)/.exec(xml);
  if (!m) throw new Error('Folha sem <sheetData>');
  const inner = m[1] || '';
  const rows = [];
  const re = /<row\b[^>]*?(?:\/>|>[\s\S]*?<\/row>)/g;
  let r;
  while ((r = re.exec(inner))) rows.push({ r: Number(attr(r[0], 'r')), xml: r[0] });
  return {
    rows,
    join: () => xml.slice(0, m.index) + '<sheetData>' + rows.map((x) => x.xml).join('') + '</sheetData>' + xml.slice(m.index + m[0].length),
  };
}

const cellRe = /<c\b[^>]*?(?:\/>|>[\s\S]*?<\/c>)/g;
const hasValue = (cellXml) => /<v>[^<]+<\/v>|<is>|<f[\s>]/.test(cellXml);

function lastFilledRow(rows, firstRow, maxCol) {
  let last = firstRow - 1;
  for (const row of rows) {
    if (row.r < firstRow) continue;
    for (const c of row.xml.match(cellRe) || []) {
      const ref = attr(c, 'r');
      if (ref && colIndex(ref.replace(/\d+/g, '')) < maxCol && hasValue(c)) { last = Math.max(last, row.r); break; }
    }
  }
  return last;
}

function cellXml(ref, style, value) {
  const s = style ? ` s="${style}"` : '';
  if (value === '' || value == null) return `<c r="${ref}"${s}/>`;
  if (typeof value === 'number') return `<c r="${ref}"${s}><v>${value}</v></c>`;
  return `<c r="${ref}"${s} t="inlineStr"><is><t xml:space="preserve">${esc(value)}</t></is></c>`;
}

function setCell(sheet, rowNum, col, value, fallbackStyle) {
  const ref = colLetter(col) + rowNum;
  let row = sheet.rows.find((x) => x.r === rowNum);
  if (!row) {
    row = { r: rowNum, xml: `<row r="${rowNum}"></row>` };
    const idx = sheet.rows.findIndex((x) => x.r > rowNum);
    if (idx < 0) sheet.rows.push(row); else sheet.rows.splice(idx, 0, row);
  }
  if (/\/>$/.test(row.xml)) row.xml = row.xml.replace(/\s*\/>$/, '></row>');
  const open = /^<row\b[^>]*>/.exec(row.xml)[0];
  const cells = (row.xml.slice(open.length, -'</row>'.length).match(cellRe) || []);
  const i = cells.findIndex((c) => attr(c, 'r') === ref);
  const style = i >= 0 ? attr(cells[i], 's') : fallbackStyle;
  const next = cellXml(ref, style, value);
  if (i >= 0) cells[i] = next;
  else {
    const pos = cells.findIndex((c) => colIndex(attr(c, 'r').replace(/\d+/g, '')) > col);
    if (pos < 0) cells.push(next); else cells.splice(pos, 0, next);
  }
  row.xml = open.replace(/\sspans="[^"]*"/, '') + cells.join('') + '</row>';
}

function styleOf(sheet, rowNum, col) {
  const row = sheet.rows.find((x) => x.r === rowNum);
  if (!row) return null;
  const c = (row.xml.match(cellRe) || []).find((x) => attr(x, 'r') === colLetter(col) + rowNum);
  return c ? attr(c, 's') : null;
}

function toCellValue(col, v) {
  if (v === '' || v == null) return '';
  if (col.type === 'date') return dateSerial(v);
  if (col.type === 'number') { const n = Number(String(v).replace(',', '.')); return isNaN(n) ? String(v) : n; }
  if (col.key === 'np' && /^\d{1,15}$/.test(String(v))) return Number(v);
  return String(v);
}

/**
 * @param JSZip  construtor JSZip
 * @param {ArrayBuffer} buffer  ficheiro .xlsx (modelo ou o ficheiro do utilizador)
 * @param {object[]} records  lista de objetos {data, np, ...}
 * @returns {Promise<{blob: Blob|Uint8Array, firstRow: number, lastRow: number, overflow: boolean}>}
 */
export async function appendToWorkbook(JSZip, buffer, records, { type = 'blob' } = {}) {
  const zip = await JSZip.loadAsync(buffer);
  const mainPath = await sheetPath(zip, MAIN_SHEET);
  if (!mainPath) throw new Error(`O ficheiro não tem a folha "${MAIN_SHEET}".`);

  const main = splitSheet(await zip.file(mainPath).async('string'));
  const start = lastFilledRow(main.rows, 3, COLUMNS.length) + 1;
  const dateStyle = styleOf(main, 3, 0);
  records.forEach((rec, i) => {
    const r = start + i;
    COLUMNS.forEach((col, c) => setCell(main, r, c, toCellValue(col, rec[col.key]), styleOf(main, 3, c)));
  });
  zip.file(mainPath, main.join());

  // Casos complexos -> folha própria
  const complex = records.filter((r) => r.complexo === 'Sim');
  const cxPath = complex.length && (await sheetPath(zip, COMPLEX_SHEET));
  if (cxPath) {
    const cx = splitSheet(await zip.file(cxPath).async('string'));
    const s0 = lastFilledRow(cx.rows, 2, 5) + 1;
    complex.forEach((rec, i) => {
      const r = s0 + i;
      const desc = [rec.part, rec.obs].filter(Boolean).join('; ');
      const vals = [rec.data ? dateSerial(rec.data) : '', rec.esp, rec.proc, rec.compl, desc];
      vals.forEach((v, c) => setCell(cx, r, c, v, c === 0 ? dateStyle : styleOf(cx, 2, c)));
    });
    zip.file(cxPath, cx.join());
  }

  // Pedir ao Excel para recalcular as tabelas ao abrir
  let wb = await zip.file('xl/workbook.xml').async('string');
  if (/<calcPr\b/.test(wb)) {
    if (!/fullCalcOnLoad=/.test(wb)) wb = wb.replace(/<calcPr\b/, '<calcPr fullCalcOnLoad="1"');
  } else wb = wb.replace(/(<\/definedNames>|<\/sheets>)(?![\s\S]*(<\/definedNames>))/, '$1<calcPr fullCalcOnLoad="1"/>');
  zip.file('xl/workbook.xml', wb);
  // a cadeia de cálculo antiga pode ficar inválida; o Excel recria-a
  if (zip.file('xl/calcChain.xml')) {
    zip.remove('xl/calcChain.xml');
    const ct = await zip.file('[Content_Types].xml').async('string');
    zip.file('[Content_Types].xml', ct.replace(/<Override[^>]*calcChain[^>]*\/>/, ''));
    const rels = await zip.file('xl/_rels/workbook.xml.rels').async('string');
    zip.file('xl/_rels/workbook.xml.rels', rels.replace(/<Relationship[^>]*calcChain[^>]*\/>/, ''));
  }

  const out = await zip.generateAsync({
    type,
    compression: 'DEFLATE',
    mimeType: 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet',
  });
  const lastRow = start + records.length - 1;
  return { blob: out, firstRow: start, lastRow, overflow: lastRow > 302 };
}
