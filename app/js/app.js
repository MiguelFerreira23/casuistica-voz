import { COLUMNS, SECTIONS, LISTS, COL_BY_KEY, emptyRecord, ageGroup, isoToPt, toTsvRow, todayIso } from './schema.js';
import { parse, missingFields } from './parser.js';
import { appendToWorkbook } from './xlsx.js';
import { Recorder, transcribe, loadModel, onSttEvents, MODELS } from './stt.js';
import { allRecords, putRecord, deleteRecord, clearAll, newId, requestPersistence, settings, getBaseFile, setBaseFile, clearBaseFile } from './store.js';
import { ping, upsert, parseSheetLink } from './gsheets.js';

const $ = (s, el = document) => el.querySelector(s);
const $$ = (s, el = document) => [...el.querySelectorAll(s)];

// ---------------------------------------------------------------------------
// Estado do registo em edição

const state = {
  id: null,
  createdAt: null,
  exportedAt: null,
  sync: null,
  values: emptyRecord(),
  origin: {},
  why: {},
  manual: new Set(),
  notes: [],
  dirty: false,
};

function resetState() {
  Object.assign(state, { id: null, createdAt: null, exportedAt: null, sync: null, values: emptyRecord(), origin: {}, why: {}, manual: new Set(), notes: [], dirty: false });
  $('#transcript').value = '';
  reparse();
  $('#btn-delete').hidden = true;
  $('#btn-save').textContent = 'Guardar registo';
  setTitle();
}

function reparse() {
  const res = parse($('#transcript').value, { today: todayIso() });
  for (const c of COLUMNS) {
    if (state.manual.has(c.key)) continue;
    state.values[c.key] = res.values[c.key] ?? '';
    state.origin[c.key] = res.origin[c.key] || '';
    state.why[c.key] = res.why[c.key] || '';
  }
  syncAgeGroup();
  state.notes = res.notes;
  updateForm();
}

// O grupo etário segue a idade, mesmo que a idade tenha sido escrita à mão.
function syncAgeGroup() {
  if (state.manual.has('grupo') || state.values.idade === '') return;
  const idade = Number(String(state.values.idade).replace(',', '.'));
  state.values.grupo = ageGroup(idade);
  state.origin.grupo = 'sug';
  state.why.grupo = `Calculado a partir da idade (${state.values.idade})`;
}

// ---------------------------------------------------------------------------
// Formulário

function buildForm() {
  const form = $('#form');
  form.innerHTML = '';
  for (const sec of SECTIONS) {
    const d = document.createElement('details');
    d.className = 'section';
    d.dataset.section = sec.key;
    d.open = ['demo', 'reg', 'diag', 'evol'].includes(sec.key);
    d.innerHTML = `<summary>${sec.label}<span class="count"></span></summary><div class="fields"></div>`;
    const box = $('.fields', d);
    for (const c of COLUMNS.filter((x) => x.section === sec.key)) {
      const w = document.createElement('div');
      w.className = 'f' + (['text', 'long'].includes(c.type) && c.key !== 'np' ? ' wide' : '');
      w.dataset.key = c.key;
      const id = 'f-' + c.key;
      let ctl;
      if (c.type === 'list') {
        ctl = `<select id="${id}"><option value="">—</option>${LISTS[c.list].map((o) => `<option>${escapeHtml(o)}</option>`).join('')}</select>`;
      } else if (c.type === 'long') {
        ctl = `<textarea id="${id}" rows="2"></textarea>`;
      } else if (c.type === 'date') {
        ctl = `<input id="${id}" type="date">`;
      } else if (c.type === 'number') {
        ctl = `<input id="${id}" type="text" inputmode="decimal">`;
      } else {
        ctl = `<input id="${id}" type="text"${c.inputmode ? ` inputmode="${c.inputmode}"` : ''}>`;
      }
      w.innerHTML = `<label for="${id}"><span class="dot"></span>${c.label}</label>${ctl}<div class="why"></div>`;
      box.appendChild(w);
      const el = $('#' + id, w);
      el.addEventListener(c.type === 'list' || c.type === 'date' ? 'change' : 'input', () => {
        state.values[c.key] = el.value;
        state.origin[c.key] = 'man';
        state.manual.add(c.key);
        state.dirty = true;
        state.why[c.key] = '';
        if (c.key === 'idade') syncAgeGroup();
        updateForm(c.key);
      });
    }
    form.appendChild(d);
  }
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = '<span class="l-voz">Mencionado</span><span class="l-sug">Sugerido (o motivo aparece por baixo)</span><span class="l-man">Escrito à mão</span>';
  form.appendChild(legend);
}

function updateForm(skipKey) {
  for (const c of COLUMNS) {
    const w = $(`.f[data-key="${c.key}"]`);
    const el = $('input,select,textarea', w);
    const v = state.values[c.key] ?? '';
    if (c.key !== skipKey) {
      if (c.type === 'list' && v && !LISTS[c.list].includes(v) && !$$('option', el).some((o) => o.value === v)) {
        const o = document.createElement('option');
        o.textContent = v;
        el.appendChild(o);
      }
      if (el.value !== String(v)) el.value = v;
    }
    w.classList.remove('voz', 'sug', 'man', 'missing');
    const o = state.origin[c.key];
    if (v !== '' && o) w.classList.add(o);
    $('.why', w).textContent = v !== '' && o === 'sug' ? state.why[c.key] || '' : '';
    if (c.required && v === '') w.classList.add('missing');
  }
  for (const d of $$('.section')) {
    const cols = COLUMNS.filter((c) => c.section === d.dataset.section);
    const n = cols.filter((c) => state.values[c.key] !== '').length;
    $('.count', d).textContent = n ? `${n}/${cols.length}` : '';
    if (n && !d.open && !d.dataset.touched) d.open = true;
  }
  renderSummary();
}

function renderSummary() {
  const filled = COLUMNS.filter((c) => state.values[c.key] !== '');
  const voz = filled.filter((c) => state.origin[c.key] === 'voz').length;
  const sug = filled.filter((c) => state.origin[c.key] === 'sug').length;
  const man = filled.filter((c) => state.origin[c.key] === 'man').length;
  const miss = missingFields(state.values);
  const chips = [];
  if (voz) chips.push(`<span class="chip voz">${voz} mencionados</span>`);
  if (sug) chips.push(`<span class="chip sug">${sug} sugeridos</span>`);
  if (man) chips.push(`<span class="chip man">${man} escritos à mão</span>`);
  if (miss.length) chips.push(`<span class="chip miss">Falta: ${miss.join(', ')}</span>`);
  $('#summary').innerHTML = chips.join('');
  $('#notes').innerHTML = state.notes.map((n) => `<li>${escapeHtml(n)}</li>`).join('');
}

// ---------------------------------------------------------------------------
// Gravação

const recorder = new Recorder();
let recording = false;
let busy = false;
let timer = null;

async function toggleRecord() {
  if (busy) return;
  const btn = $('#rec');
  if (!recording) {
    try {
      await recorder.start();
    } catch (e) {
      toast('Sem acesso ao microfone. Verifica as permissões do Safari.');
      return;
    }
    recording = true;
    btn.classList.add('recording');
    const t0 = Date.now();
    setStatus('A gravar… toca para parar', '0:00');
    timer = setInterval(() => {
      const s = Math.floor((Date.now() - t0) / 1000);
      $('#rec-sub').textContent = `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
      btn.style.setProperty('--lvl', 1 + recorder.level() * 0.25);
    }, 100);
    return;
  }
  recording = false;
  clearInterval(timer);
  btn.classList.remove('recording');
  btn.classList.add('busy');
  busy = true;
  try {
    const blob = await recorder.stop();
    setStatus('A preparar o modelo…', 'Na primeira vez o modelo é descarregado (fica guardado).');
    const text = await transcribe(blob, currentModel(), settings.get('gpu', false));
    const ta = $('#transcript');
    ta.value = (ta.value.trim() ? ta.value.trim().replace(/[.]?$/, '. ') : '') + text;
    state.dirty = true;
    reparse();
    setStatus('Pronto. Revê os campos ou grava mais.', 'Podes gravar várias vezes; o texto acumula.');
  } catch (e) {
    console.error(e);
    setStatus('Não foi possível transcrever', e.message);
  } finally {
    busy = false;
    btn.classList.remove('busy');
    $('#progress').hidden = true;
  }
}

function setStatus(a, b) { $('#rec-status').textContent = a; $('#rec-sub').textContent = b || ''; }

const fileProgress = new Map();
onSttEvents({
  progress(p) {
    fileProgress.set(p.file, p);
    let l = 0, t = 0;
    for (const x of fileProgress.values()) { l += x.loaded || 0; t += x.total || 0; }
    const pct = t ? Math.round((l / t) * 100) : 0;
    $('#progress').hidden = pct >= 100;
    $('#progress div').style.width = pct + '%';
    const msg = `A descarregar modelo… ${pct}% (${(l / 1e6).toFixed(0)} de ${(t / 1e6).toFixed(0)} MB)`;
    if (busy) setStatus('A preparar o modelo…', msg);
    $('#model-status').textContent = msg;
  },
  status(s) { if (busy) setStatus(s.text, s.device === 'webgpu' ? 'GPU' : 'CPU (WebAssembly)'); },
});

const currentModel = () => settings.get('model', 'onnx-community/whisper-base');

// ---------------------------------------------------------------------------
// Guardar / editar

async function save() {
  const miss = missingFields(state.values);
  if (miss.length && !confirm(`Faltam: ${miss.join(', ')}.\nGuardar mesmo assim?`)) return;
  const now = Date.now();
  const rec = {
    id: state.id || newId(),
    createdAt: state.createdAt || now,
    updatedAt: now,
    exportedAt: state.exportedAt,
    changedAfterExport: !!state.exportedAt,
    sync: mode() === 'sheets' ? { ...(state.sync || {}), state: 'pending' } : state.sync,
    values: { ...state.values },
    origin: { ...state.origin },
    why: { ...state.why },
    manual: [...state.manual],
    transcript: $('#transcript').value,
  };
  await putRecord(rec);
  requestPersistence();
  const updated = !!state.id;
  resetState();
  if (mode() === 'sheets') {
    toast('A enviar para o Google Sheets…');
    const r = await syncRecord(rec);
    toast(r.sync.state === 'ok' ? `Enviado para o Sheets (linha ${r.sync.row})` : `Guardado no iPhone; envio pendente (${r.sync.error})`);
  } else toast(updated ? 'Registo atualizado' : 'Registo guardado');
  refreshBadge();
}

// ---------------------------------------------------------------------------
// Google Sheets

const mode = () => settings.get('mode', 'local');
const gsConfig = () => ({ url: settings.get('gsUrl', ''), token: settings.get('gsToken', ''), sheetLink: settings.get('gsSheet', '') });

async function syncRecord(rec) {
  try {
    const r = await upsert(gsConfig(), rec);
    rec.sync = { state: 'ok', row: r.row, match: r.match, at: Date.now() };
  } catch (e) {
    rec.sync = { ...(rec.sync || {}), state: navigator.onLine === false ? 'pending' : 'error', error: e.message };
  }
  await putRecord(rec);
  return rec;
}

let syncing = false;
async function syncPending(silent) {
  if (syncing || mode() !== 'sheets') return;
  const todo = (await allRecords()).filter((r) => r.sync && r.sync.state !== 'ok');
  if (!todo.length) { if (!silent) toast('Nada pendente.'); return; }
  syncing = true;
  let ok = 0;
  try {
    for (const r of todo.sort((a, b) => a.createdAt - b.createdAt)) if ((await syncRecord(r)).sync.state === 'ok') ok++;
  } finally { syncing = false; }
  if (!silent || ok) toast(`${ok} de ${todo.length} enviado(s)`);
  refreshBadge();
}

function edit(rec) {
  Object.assign(state, {
    id: rec.id, createdAt: rec.createdAt, exportedAt: rec.exportedAt, sync: rec.sync || null,
    values: { ...emptyRecord(), ...rec.values }, origin: Object.fromEntries(Object.entries(rec.origin || {}).map(([k, o]) => [k, ['inf', 'auto', 'def'].includes(o) ? 'sug' : o])), why: { ...(rec.why || {}) },
    manual: new Set(COLUMNS.map((c) => c.key)), // ao editar, nada é reescrito pelo texto
    notes: [], dirty: false,
  });
  $('#transcript').value = rec.transcript || '';
  updateForm();
  $('#btn-delete').hidden = false;
  $('#btn-save').textContent = 'Atualizar registo';
  show('new');
  setTitle('Editar registo');
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Lista

async function renderList() {
  const q = fold($('#search').value.trim());
  const recs = (await allRecords()).filter((r) => !q || fold(Object.values(r.values).join(' ')).includes(q));
  const list = $('#list');
  if (!recs.length) { list.innerHTML = `<div class="empty">${q ? 'Nada encontrado.' : 'Ainda não há registos.<br>Grava o primeiro caso no separador “Novo”.'}</div>`; return; }
  let html = '';
  let day = null;
  for (const r of recs) {
    const v = r.values;
    if (v.data !== day) { day = v.data; html += `<div class="day">${day ? isoToPt(day) : 'Sem data'}</div>`; }
    const tag = recordTag(r);
    const who = [v.np && `NP ${v.np}`, v.idade !== '' && `${v.idade} a`, v.sexo && v.sexo[0], v.asa && `ASA ${v.asa}`].filter(Boolean).join(' · ');
    const what = [v.esp, v.proc || v.diag, v.tec].filter(Boolean).join(' · ');
    html += `<button class="item" data-id="${r.id}"><div class="l1"><span>${escapeHtml(who || 'Sem identificação')}</span>${tag}</div><div class="l2">${escapeHtml(what || '—')}</div></button>`;
  }
  list.innerHTML = html;
  for (const b of $$('.item', list)) b.onclick = () => edit(recs.find((r) => r.id === b.dataset.id));
}

function recordTag(r) {
  if (r.sync) {
    if (r.sync.state === 'ok') return `<span class="tag">Sheets · linha ${r.sync.row}</span>`;
    if (r.sync.state === 'error') return '<span class="tag err">erro no envio</span>';
    return '<span class="tag todo">por enviar</span>';
  }
  if (r.exportedAt) return r.changedAfterExport ? '<span class="tag todo">alterado</span>' : '<span class="tag">exportado</span>';
  return '';
}

async function refreshBadge() {
  const recs = await allRecords();
  const pend = recs.filter((r) => r.sync && r.sync.state !== 'ok').length;
  const b = $('#badge');
  b.hidden = !pend;
  b.textContent = pend;
  const notExported = recs.filter((r) => !r.exportedAt || r.changedAfterExport).length;
  $('#export-count').textContent = `${recs.length} registo(s) no total; ${notExported} nunca exportados para ficheiro.`;
  $('#sync-status').innerHTML = pend ? `<span class="err">${pend} registo(s) por enviar.</span>` : `<span class="ok">Tudo enviado.</span> ${recs.filter((r) => r.sync).length} registo(s) no Sheets.`;
  $('#btn-sync').disabled = !pend;
  const never = recs.filter((r) => !r.sync).length;
  $('#btn-sync-old').hidden = !never;
  $('#btn-sync-old').textContent = `Enviar também ${never} registo(s) criados antes (modo Excel)`;
  const base = await getBaseFile();
  $('#local-status').textContent = `Base: ${base ? `${base.name} (importado a ${new Date(base.savedAt).toLocaleDateString('pt-PT')})` : 'modelo vazio'} · ${recs.length} registo(s) na app.`;
  $('#btn-reset-base').hidden = !base;
  $('#card-sheets').hidden = mode() !== 'sheets';
}

async function openLocalExcel() {
  const recs = (await allRecords()).sort((a, b) => (a.values.data || '').localeCompare(b.values.data || '') || a.createdAt - b.createdAt);
  if (!window.JSZip) return toast('A biblioteca de Excel ainda não carregou. Tenta de novo.');
  const base = await getBaseFile();
  const buf = base ? base.buffer : await (await fetch('template.xlsx')).arrayBuffer();
  const res = await appendToWorkbook(window.JSZip, buf, recs.map((r) => r.values));
  const name = base ? base.name.replace(/\.xlsx$/i, '') : 'Casuistica';
  await deliver(res.blob, `${name}_${todayIso()}.xlsx`);
  if (res.overflow) toast('Atenção: há linhas depois da 302, que as tabelas do Excel não contam.');
}

// ---------------------------------------------------------------------------
// Exportar

async function recordsToExport() {
  const recs = (await allRecords()).filter((r) => !$('#only-new').checked || !r.exportedAt || r.changedAfterExport);
  return recs.sort((a, b) => (a.values.data || '').localeCompare(b.values.data || '') || a.createdAt - b.createdAt);
}

async function markExported(recs) {
  if (!$('#mark-exported').checked) return;
  const now = Date.now();
  for (const r of recs) await putRecord({ ...r, exportedAt: now, changedAfterExport: false });
  refreshBadge();
}

async function exportTo(buffer, filename) {
  const recs = await recordsToExport();
  if (!recs.length) return toast('Não há registos para exportar.');
  if (!window.JSZip) return toast('A biblioteca de Excel ainda não carregou. Tenta de novo.');
  const res = await appendToWorkbook(window.JSZip, buffer, recs.map((r) => r.values));
  await deliver(res.blob, filename);
  await markExported(recs);
  toast(`${recs.length} linha(s) nas linhas ${res.firstRow}–${res.lastRow}` + (res.overflow ? ' — atenção: as tabelas só contam até à linha 302' : ''));
}

async function deliver(blob, filename) {
  const file = new File([blob], filename, { type: blob.type || 'application/vnd.openxmlformats-officedocument.spreadsheetml.sheet' });
  if (navigator.canShare && navigator.canShare({ files: [file] })) {
    try { await navigator.share({ files: [file], title: filename }); return; } catch (e) { if (e.name === 'AbortError') return; }
  }
  const a = document.createElement('a');
  a.href = URL.createObjectURL(file);
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 4000);
}

// ---------------------------------------------------------------------------
// Navegação e arranque

function show(view) {
  for (const v of $$('.view')) v.classList.toggle('active', v.id === 'view-' + view);
  for (const b of $$('.tabbar button')) b.classList.toggle('active', b.dataset.view === view);
  setTitle();
  if (view === 'list') renderList();
  if (view === 'export' || view === 'settings') { refreshBadge(); storageInfo(); }
}

function setTitle(t) {
  const active = $('.tabbar button.active').dataset.view;
  $('#title').textContent = t || { new: state.id ? 'Editar registo' : 'Novo registo', list: 'Registos', export: 'Exportar', settings: 'Definições' }[active];
}

async function storageInfo() {
  const n = (await allRecords()).length;
  let s = `${n} registo(s) guardados neste dispositivo.`;
  try { if (navigator.storage && navigator.storage.persisted && (await navigator.storage.persisted())) s += ' Armazenamento persistente ativo.'; } catch {}
  $('#storage-info').textContent = s;
}

let toastT;
function toast(msg) {
  const t = $('#toast');
  t.textContent = msg;
  t.classList.add('show');
  clearTimeout(toastT);
  toastT = setTimeout(() => t.classList.remove('show'), 3200);
}

function escapeHtml(s) { return String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c])); }
function fold(s) { return s.normalize('NFD').replace(/\p{M}/gu, '').toLowerCase(); }
const debounce = (fn, ms) => { let t; return (...a) => { clearTimeout(t); t = setTimeout(() => fn(...a), ms); }; };

function init() {
  buildForm();
  resetState();

  $('#rec').onclick = toggleRecord;
  $('#transcript').addEventListener('input', debounce(() => { state.dirty = true; reparse(); }, 350));
  $('#form').addEventListener('toggle', (e) => { if (e.target.matches('.section')) e.target.dataset.touched = '1'; }, true);
  $('#btn-save').onclick = save;
  $('#btn-clear').onclick = () => { if (!state.dirty || confirm('Limpar o registo atual?')) resetState(); };
  $('#btn-delete').onclick = async () => {
    if (!state.id || !confirm(state.sync && state.sync.state === 'ok' ? `Apagar este registo da app?\nA linha ${state.sync.row} do Google Sheets não é apagada.` : 'Apagar este registo?')) return;
    await deleteRecord(state.id);
    toast('Registo apagado');
    resetState();
    refreshBadge();
    show('list');
  };
  for (const b of $$('.tabbar button')) b.onclick = () => show(b.dataset.view);
  $('#search').addEventListener('input', debounce(renderList, 200));

  // Exportar
  $('#only-new').onchange = refreshBadge;
  $('#file-append').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try { await exportTo(await f.arrayBuffer(), f.name); } catch (err) { console.error(err); toast('Erro: ' + err.message); }
  };
  $('#btn-copy').onclick = async () => {
    const recs = await recordsToExport();
    if (!recs.length) return toast('Não há registos para copiar.');
    try {
      await navigator.clipboard.writeText(recs.map((r) => toTsvRow(r.values)).join('\n'));
      await markExported(recs);
      toast(`${recs.length} linha(s) copiadas. Cola na primeira coluna livre do Excel.`);
    } catch { toast('Não foi possível copiar.'); }
  };
  $('#btn-backup').onclick = async () => {
    const blob = new Blob([JSON.stringify({ app: 'casuistica', version: 1, records: await allRecords() }, null, 1)], { type: 'application/json' });
    deliver(blob, `casuistica-backup-${todayIso()}.json`);
  };
  $('#file-restore').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    try {
      const data = JSON.parse(await f.text());
      for (const r of data.records || []) await putRecord(r);
      toast(`${(data.records || []).length} registo(s) restaurados`);
      refreshBadge();
    } catch { toast('Ficheiro inválido.'); }
  };

  $('#btn-sync').onclick = () => syncPending(false);
  $('#btn-sync-old').onclick = async () => {
    const old = (await allRecords()).filter((r) => !r.sync);
    if (!confirm(`Enviar ${old.length} registo(s) para o Google Sheets? Confirma que ainda não estão lá, para não duplicar.`)) return;
    for (const r of old) await putRecord({ ...r, sync: { state: 'pending' } });
    syncPending(false);
  };
  $('#btn-open-local').onclick = () => openLocalExcel().catch((e) => { console.error(e); toast('Erro: ' + e.message); });
  $('#file-base').onchange = async (e) => {
    const f = e.target.files[0];
    e.target.value = '';
    if (!f) return;
    const buffer = await f.arrayBuffer();
    try { await appendToWorkbook(window.JSZip, buffer, []); } catch (err) { return toast('Ficheiro inválido: ' + err.message); }
    await setBaseFile({ name: f.name, buffer, savedAt: Date.now() });
    toast('Ficheiro base atualizado');
    refreshBadge();
  };
  $('#btn-reset-base').onclick = async () => {
    if (!confirm('Voltar a usar o modelo vazio como base?')) return;
    await clearBaseFile();
    refreshBadge();
  };

  // Definições: destino
  const applyMode = () => {
    $('#sheets-config').hidden = mode() !== 'sheets';
    for (const r of $$('input[name=mode]')) r.checked = r.value === mode();
    refreshBadge();
  };
  for (const r of $$('input[name=mode]')) r.onchange = () => { settings.set('mode', r.value); applyMode(); };
  const sheetInfo = () => {
    const p = parseSheetLink(settings.get('gsSheet', ''));
    $('#gs-sheet-info').innerHTML = !settings.get('gsSheet', '') ? '' : p ? `<span class="ok">Folha reconhecida</span>${p.gid ? ` · separador ${p.gid}` : ''}` : '<span class="err">Link não reconhecido</span>';
  };
  $('#gs-sheet').value = settings.get('gsSheet', '');
  $('#gs-sheet').oninput = (e) => { settings.set('gsSheet', e.target.value.trim()); sheetInfo(); };
  sheetInfo();
  $('#gs-url').value = settings.get('gsUrl', '');
  $('#gs-token').value = settings.get('gsToken', '');
  $('#gs-url').oninput = (e) => settings.set('gsUrl', e.target.value.trim());
  $('#gs-token').oninput = (e) => settings.set('gsToken', e.target.value);
  $('#btn-gs-test').onclick = async () => {
    const st = $('#gs-status');
    st.textContent = 'A testar…';
    try {
      const d = await ping(gsConfig());
      st.innerHTML = `<span class="ok">Ligado</span> a “${escapeHtml(d.spreadsheet)}”, folha “${escapeHtml(d.sheet)}”. Última linha preenchida: ${d.lastRow}.` +
        (d.mismatch.length ? `<br><span class="err">Colunas diferentes do esperado: ${d.mismatch.slice(0, 4).map((m) => `${escapeHtml(m.exp)} ≠ “${escapeHtml(m.got)}”`).join('; ')}${d.mismatch.length > 4 ? '…' : ''}</span>` : '<br>As 40 colunas coincidem.');
    } catch (e) { st.innerHTML = `<span class="err">${escapeHtml(e.message)}</span>`; }
  };
  applyMode();
  window.addEventListener('online', () => syncPending(true));
  syncPending(true);

  // Definições: voz
  const sel = $('#model');
  sel.innerHTML = Object.entries(MODELS).map(([k, m]) => `<option value="${k}">${m.label}</option>`).join('');
  sel.value = currentModel();
  sel.onchange = () => settings.set('model', sel.value);
  $('#use-gpu').checked = settings.get('gpu', false);
  $('#use-gpu').onchange = (e) => settings.set('gpu', e.target.checked);
  $('#btn-load-model').onclick = async () => {
    $('#model-status').textContent = 'A carregar…';
    try {
      const r = await loadModel(currentModel(), settings.get('gpu', false));
      $('#model-status').textContent = `Modelo pronto (${r.device === 'webgpu' ? 'GPU' : 'CPU'}). Já funciona sem internet.`;
    } catch (e) { $('#model-status').textContent = 'Erro: ' + e.message; }
  };
  $('#btn-wipe').onclick = async () => {
    if (!confirm('Apagar TODOS os registos deste dispositivo? Isto não se pode desfazer.')) return;
    await clearAll();
    toast('Registos apagados');
    refreshBadge();
    storageInfo();
  };

  window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  refreshBadge();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
