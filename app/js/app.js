import { COLUMNS, SECTIONS, LISTS, COL_BY_KEY, emptyRecord, ageGroup, isoToPt, toTsvRow, todayIso, missingFields, REQUIRED_RULES, defaultRequired, autoCellNotes, notRecorded } from './schema.js';
import { parse } from './parser.js';
import { appendToWorkbook } from './xlsx.js';
import { Recorder, transcribe, loadModel, onSttEvents, MODELS } from './stt.js';
import { allRecords as allStored, putRecord, deleteRecord, clearAll, newId, requestPersistence, settings, getBaseFile, setBaseFile, clearBaseFile, putAudio, audiosOf, allAudios, deleteAudio, clearAudios, moveAudios } from './store.js';
import { profiles, activeProfile, setActive, updateProfile, addProfile, removeProfile, belongsTo } from './profiles.js';
import { sheet, editNote, showGuide } from './ui.js';
import { HOWTO } from './howto.js';
import { ping, upsert, parseSheetLink, scriptUrl } from './gsheets.js';

const $ = (s, el = document) => el.querySelector(s);
// registos do destino ativo
const allRecords = async () => { const p = activeProfile(); return (await allStored()).filter((r) => belongsTo(r, p)); };
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
  cellNotes: {},
  autoNotes: new Set(),
  manual: new Set(),
  notes: [],
  dirty: false,
};

function resetState() {
  Object.assign(state, { id: null, draftId: newId(), createdAt: null, exportedAt: null, sync: null, profileId: null, values: emptyRecord(), origin: {}, why: {}, cellNotes: {}, autoNotes: new Set(), manual: new Set(), notes: [], dirty: false });
  $('#transcript').value = '';
  reparse();
  $('#btn-delete').hidden = true;
  $('#btn-save').textContent = 'Rever e guardar';
  renderAudios();
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

const icon = (id, cls = 'ic') => `<svg class="${cls}" aria-hidden="true"><use href="#i-${id}"/></svg>`;

function buildForm() {
  const form = $('#form');
  form.innerHTML = '';
  for (const sec of SECTIONS) {
    const d = document.createElement('details');
    d.className = 'section';
    d.dataset.section = sec.key;
    d.open = ['demo', 'reg', 'diag', 'evol'].includes(sec.key);
    d.innerHTML = `<summary>${icon('chev')}${sec.label}<span class="count"></span></summary><div class="cells"></div>
      <button type="button" class="link-btn note-add">Acrescentar nota…</button>`;
    const box = $('.cells', d);
    for (const c of COLUMNS.filter((x) => x.section === sec.key)) {
      const w = document.createElement('div');
      w.className = 'f' + (['text', 'long'].includes(c.type) && c.key !== 'np' ? ' wide' : '');
      w.dataset.key = c.key;
      const id = 'f-' + c.key;
      let ctl;
      if (c.type === 'list') {
        ctl = `<select id="${id}" class="val"><option value="">—</option>${LISTS[c.list].map((o) => `<option>${escapeHtml(o)}</option>`).join('')}</select>`;
      } else if (c.type === 'long') {
        ctl = `<textarea id="${id}" class="val" rows="1"></textarea>`;
      } else if (c.type === 'date') {
        ctl = `<input id="${id}" class="val" type="date">`;
      } else if (c.type === 'number') {
        ctl = `<input id="${id}" class="val" type="text" inputmode="decimal" placeholder="—">`;
      } else {
        ctl = `<input id="${id}" class="val" type="text"${c.inputmode ? ` inputmode="${c.inputmode}"` : ''} placeholder="${c.type === 'text' && c.key !== 'np' ? 'Escrever…' : '—'}">`;
      }
      w.innerHTML = `<label class="row" for="${id}"><span class="lbl"><span class="dot"></span>${c.label}<span class="req" hidden>*</span></span>${ctl}</label>
        <div class="why"></div><button type="button" class="cnote" hidden></button>`;
      $('.cnote', w).onclick = () => noteFor(c);
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
    $('.note-add', d).onclick = () => noteFor(null, sec.key);
    form.appendChild(d);
  }
  const legend = document.createElement('div');
  legend.className = 'legend';
  legend.innerHTML = '<span><i class="dot voz"></i>Mencionado</span><span><i class="dot sug"></i>Sugerido</span><span><i class="dot man"></i>Escrito à mão</span>';
  form.appendChild(legend);
}

// Nota numa célula: de um campo (c) ou escolhendo o campo dentro de uma secção
async function noteFor(c, sectionKey) {
  let col = c;
  if (!col) {
    const cols = COLUMNS.filter((x) => x.section === sectionKey);
    const first = cols.find((x) => missingFields(state.values, activeProfile().required, state.cellNotes).some((m) => m.key === x.key)) || cols[0];
    const pick = await sheet({
      title: 'Nota numa célula',
      html: `<label class="muted small" for="note-col">Campo</label><select id="note-col">${cols.map((x) => `<option value="${x.key}" ${x === first ? 'selected' : ''}>${escapeHtml(x.label)}${state.cellNotes[x.key] ? ' (tem nota)' : ''}</option>`).join('')}</select>`,
      buttons: [{ label: 'Cancelar', value: null }, { label: 'Continuar', primary: true, value: (el) => el.querySelector('#note-col').value }],
    });
    if (!pick) return;
    col = COL_BY_KEY[pick];
  }
  const r = await editNote({ label: col.label, note: state.cellNotes[col.key], presets: [notRecorded(col), 'Confirmar', 'Deduzido; confirmar'] });
  if (r === null) return;
  if (r) state.cellNotes[col.key] = r; else delete state.cellNotes[col.key];
  state.autoNotes.delete(col.key);
  state.dirty = true;
  updateForm();
}

function updateForm(skipKey) {
  // notas automáticas (ex.: doente crítico sem técnica); não substituem notas escritas por ti
  for (const k of state.autoNotes) delete state.cellNotes[k];
  state.autoNotes.clear();
  for (const [k, n] of Object.entries(autoCellNotes(state.values))) {
    if (!state.cellNotes[k]) { state.cellNotes[k] = n; state.autoNotes.add(k); }
  }
  const prof = activeProfile();
  const missing = new Set(missingFields(state.values, prof.required, {}).map((c) => c.key));
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
    w.classList.remove('voz', 'sug', 'man', 'missing', 'noted');
    const o = state.origin[c.key];
    if (v !== '' && o) w.classList.add(o);
    $('.why', w).textContent = v !== '' && o === 'sug' ? state.why[c.key] || '' : '';
    const rule = REQUIRED_RULES[c.key] || {};
    $('.req', w).hidden = !(prof.required[c.key] && (!rule.when || rule.when(state.values)));
    if (missing.has(c.key)) w.classList.add('missing');
    const note = state.cellNotes[c.key] || '';
    const cn = $('.cnote', w);
    cn.hidden = !note;
    cn.innerHTML = note ? `${icon('note')}<span>${escapeHtml(note)}</span>` : '';
    if (note) w.classList.add('noted');
  }
  for (const d of $$('.section')) {
    const cols = COLUMNS.filter((c) => c.section === d.dataset.section);
    const n = cols.filter((c) => state.values[c.key] !== '').length;
    $('.count', d).textContent = n ? `${n} de ${cols.length}` : '';
    if (n && !d.open && !d.dataset.touched) d.open = true;
  }
  renderSummary();
}

function renderSummary() {
  const filled = COLUMNS.filter((c) => state.values[c.key] !== '');
  const count = (o) => filled.filter((c) => state.origin[c.key] === o).length;
  const miss = missingFields(state.values, activeProfile().required, state.cellNotes);
  const nNotes = Object.keys(state.cellNotes).length;
  const parts = [];
  if (count('voz')) parts.push(`<span><i class="dot voz"></i>${count('voz')} mencionados</span>`);
  if (count('sug')) parts.push(`<span><i class="dot sug"></i>${count('sug')} sugeridos</span>`);
  if (count('man')) parts.push(`<span><i class="dot man"></i>${count('man')} à mão</span>`);
  if (nNotes) parts.push(`<span>${nNotes} ${nNotes === 1 ? 'nota' : 'notas'}</span>`);
  let html = parts.join('<span class="sep">·</span>');
  if (miss.length) html += `<span class="miss">Falta: ${miss.map((c) => `<button type="button" data-k="${c.key}">${escapeHtml(c.label)}</button>`).join(', ')}</span>`;
  $('#summary').innerHTML = html;
  for (const b of $$('#summary .miss button')) b.onclick = () => {
    const w = $(`.f[data-key="${b.dataset.k}"]`);
    w.closest('details').open = true;
    w.scrollIntoView({ block: 'center', behavior: 'smooth' });
    setTimeout(() => $('.val', w).focus({ preventScroll: true }), 350);
  };
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
    // 1.º guardar a gravação (fica como memória mesmo que a transcrição falhe)
    const audio = { id: newId(), ownerId: ownerId(), createdAt: Date.now(), mime: blob.type || 'audio/mp4', data: await blob.arrayBuffer(), seconds: Math.round(recorder.seconds || 0), status: 'pendente', transcript: '' };
    await putAudio(audio);
    state.dirty = true;
    renderAudios();
    await transcribeAudio(audio, true);
  } catch (e) {
    console.error(e);
    setStatus('Não foi possível gravar', e.message);
  } finally {
    busy = false;
    btn.classList.remove('busy');
    $('#progress').hidden = true;
  }
}

async function transcribeAudio(audio, append) {
  busy = true;
  $('#rec').classList.add('busy');
  setStatus('A preparar o modelo…', 'Na primeira vez o modelo é descarregado (fica guardado).');
  try {
    const text = await transcribe(new Blob([audio.data], { type: audio.mime }), currentModel(), settings.get('gpu', false));
    await putAudio({ ...audio, status: 'transcrito', transcript: text });
    if (append) {
      const ta = $('#transcript');
      ta.value = (ta.value.trim() ? ta.value.trim().replace(/[.]?$/, '. ') : '') + text;
      reparse();
    }
    setStatus('Pronto. Revê os campos ou grava mais.', 'A gravação fica guardada neste registo.');
    return text;
  } catch (e) {
    console.error(e);
    await putAudio({ ...audio, status: 'erro', error: e.message });
    setStatus('A gravação ficou guardada, mas não foi transcrita', 'Podes ouvi-la e escrever à mão, ou tentar de novo mais tarde.');
    return null;
  } finally {
    busy = false;
    $('#rec').classList.remove('busy');
    $('#progress').hidden = true;
    renderAudios();
  }
}

const ownerId = () => state.id || state.draftId;
const fmtDur = (s) => `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
const fmtTime = (t) => new Date(t).toLocaleString('pt-PT', { day: '2-digit', month: '2-digit', hour: '2-digit', minute: '2-digit' });
const STATUS = { pendente: 'por transcrever', transcrito: 'transcrita', erro: 'não transcrita' };

// Lista de gravações do registo em edição
async function renderAudios() {
  const list = await audiosOf(ownerId());
  const box = $('#audios');
  box.hidden = !list.length;
  box.innerHTML = list.length ? `<div class="audios-h">Gravações (${list.length})</div>` + list.map((a, i) => audioRow(a, i)).join('') : '';
  bindAudioRows(box, list, renderAudios);
}

function audioRow(a, i) {
  return `<div class="audio" data-id="${a.id}">
    <button type="button" class="play" aria-label="Ouvir gravação ${i + 1}">${icon('play')}</button>
    <div class="meta"><b>${fmtTime(a.createdAt)}</b> · ${fmtDur(a.seconds || 0)} <span class="st st-${a.status}">${STATUS[a.status] || a.status}</span></div>
    <button type="button" class="more" aria-label="Opções da gravação">${icon('more')}</button></div>`;
}

let player = null;
function bindAudioRows(box, list, refresh) {
  for (const row of $$('.audio', box)) {
    const a = list.find((x) => x.id === row.dataset.id);
    $('.play', row).onclick = () => {
      if (player && player.dataset.id === a.id && !player.paused) { player.pause(); return; }
      if (player) { player.pause(); URL.revokeObjectURL(player.src); }
      player = new Audio(URL.createObjectURL(new Blob([a.data], { type: a.mime })));
      player.dataset.id = a.id;
      const btns = $$('.audio .play');
      const setIcon = (playing) => btns.forEach((b) => { b.innerHTML = icon(playing && b.closest('.audio').dataset.id === a.id ? 'pause' : 'play'); });
      player.onplay = () => setIcon(true);
      player.onpause = player.onended = () => setIcon(false);
      player.play();
    };
    $('.more', row).onclick = async () => {
      const v = await sheet({
        title: `Gravação de ${fmtTime(a.createdAt)}`,
        html: a.transcript ? `<p class="muted small">Transcrição:</p><blockquote class="quote">${escapeHtml(a.transcript)}</blockquote>` : `<p class="muted small">${a.error ? 'Erro: ' + escapeHtml(a.error) : 'Ainda não transcrita.'}</p>`,
        buttons: [
          { label: 'Apagar', value: 'del', danger: true },
          { label: 'Partilhar', value: 'share' },
          { label: a.transcript ? 'Transcrever de novo' : 'Transcrever', value: 'tr', primary: true },
        ],
      });
      if (v === 'del' && confirm('Apagar esta gravação?')) { await deleteAudio(a.id); refresh(); }
      if (v === 'share') deliver(new Blob([a.data], { type: a.mime }), `gravacao-${new Date(a.createdAt).toISOString().slice(0, 16).replace(/[T:]/g, '-')}.${/webm/.test(a.mime) ? 'webm' : 'm4a'}`);
      if (v === 'tr') { await transcribeAudio(a, a.ownerId === ownerId()); refresh(); }
    };
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
    $('#progress div').style.setProperty('--p', pct / 100);
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
  const prof = activeProfile();
  const miss = missingFields(state.values, prof.required, state.cellNotes);
  const ok = await confirmSummary(prof, miss);
  if (!ok) return;
  if (ok.addNotes) for (const c of miss) state.cellNotes[c.key] = notRecorded(c);
  const now = Date.now();
  const rec = {
    id: state.id || newId(),
    createdAt: state.createdAt || now,
    updatedAt: now,
    exportedAt: state.exportedAt,
    changedAfterExport: !!state.exportedAt,
    profileId: state.profileId || prof.id,
    sync: mode() === 'sheets' ? { ...(state.sync || {}), state: 'pending' } : state.sync,
    values: { ...state.values },
    cellNotes: { ...state.cellNotes },
    origin: { ...state.origin },
    why: { ...state.why },
    manual: [...state.manual],
    transcript: $('#transcript').value,
  };
  await putRecord(rec);
  if (!state.id) await moveAudios(state.draftId, rec.id);
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

// Resumo do que vai ser guardado/enviado, para confirmar antes
async function confirmSummary(prof, miss) {
  const dest = prof.mode === 'sheets' ? `Vai ser enviado para o <b>Google Sheets</b> (${escapeHtml(prof.name)})${state.sync && state.sync.row ? `, linha ${state.sync.row}` : ''}.` : `Vai ser guardado no <b>Excel no iPhone</b> (${escapeHtml(prof.name)}).`;
  let rows = '';
  for (const sec of SECTIONS) {
    const cols = COLUMNS.filter((c) => c.section === sec.key && (state.values[c.key] !== '' || state.cellNotes[c.key]));
    if (!cols.length) continue;
    rows += `<div class="sum-sec">${sec.label}</div>` + cols.map((c) => {
      const v = state.values[c.key];
      const shown = c.type === 'date' ? isoToPt(v) : v;
      const o = state.origin[c.key];
      return `<div class="sum-row"><span class="k">${escapeHtml(c.label)}</span><span class="v ${o || ''}">${shown !== '' ? escapeHtml(shown) : '—'}${o === 'sug' ? ' <i>sugerido</i>' : ''}${state.cellNotes[c.key] ? `<small>Nota: ${escapeHtml(state.cellNotes[c.key])}</small>` : ''}</span></div>`;
    }).join('');
  }
  const nSug = COLUMNS.filter((c) => state.values[c.key] !== '' && state.origin[c.key] === 'sug').length;
  const missHtml = miss.length ? `<div class="sum-miss"><b>Faltam ${miss.length} campo(s) obrigatório(s):</b> ${miss.map((c) => escapeHtml(c.label)).join(', ')}
      <label class="check"><input type="checkbox" id="sum-addnotes" checked> Acrescentar a nota “… não registado” a cada um</label></div>` : '';
  return sheet({
    title: 'Confirmar registo',
    html: `<p class="small">${dest}</p>${nSug ? `<p class="muted small">${nSug} valor(es) sugerido(s), marcados abaixo. Confirma se estão certos.</p>` : ''}${missHtml}<div class="sum">${rows}</div>`,
    buttons: [
      { label: 'Voltar a editar', value: null },
      { label: prof.mode === 'sheets' ? 'Confirmar e enviar' : 'Confirmar e guardar', primary: true, value: (el) => ({ addNotes: !!(el.querySelector('#sum-addnotes') || {}).checked }) },
    ],
  });
}

// ---------------------------------------------------------------------------
// Google Sheets

const mode = () => activeProfile().mode;
const gsConfig = () => { const p = activeProfile(); return { url: p.gsUrl, token: p.gsToken, sheetLink: p.gsSheet }; };

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
    id: rec.id, createdAt: rec.createdAt, exportedAt: rec.exportedAt, sync: rec.sync || null, profileId: rec.profileId,
    cellNotes: { ...(rec.cellNotes || {}) }, autoNotes: new Set(),
    values: { ...emptyRecord(), ...rec.values }, origin: Object.fromEntries(Object.entries(rec.origin || {}).map(([k, o]) => [k, ['inf', 'auto', 'def'].includes(o) ? 'sug' : o])), why: { ...(rec.why || {}) },
    manual: new Set(COLUMNS.map((c) => c.key)), // ao editar, nada é reescrito pelo texto
    notes: [], dirty: false,
  });
  $('#transcript').value = rec.transcript || '';
  updateForm();
  $('#btn-delete').hidden = false;
  $('#btn-save').textContent = 'Rever e atualizar';
  renderAudios();
  show('new');
  setTitle('Editar registo');
  window.scrollTo(0, 0);
}

// ---------------------------------------------------------------------------
// Lista

async function renderOrphans() {
  const recIds = new Set((await allStored()).map((r) => r.id));
  const list = (await allAudios()).filter((a) => !recIds.has(a.ownerId) && a.ownerId !== state.draftId);
  const box = $('#orphans');
  box.hidden = !list.length;
  if (!list.length) { box.innerHTML = ''; return; }
  box.innerHTML = `<div class="audios-h">Gravações sem registo (${list.length})</div><p class="muted">Ditados que não chegaram a ser guardados. Ouve-os, ou junta-os ao registo que estás a criar.</p><div class="cells">` +
    list.map((a, i) => audioRow(a, i).replace(/<button type="button" class="more"[^>]*>[\s\S]*?<\/button>/, '<button type="button" class="more">Juntar</button>')).join('') + '</div>';
  bindAudioRows(box, list, renderOrphans);
  for (const row of $$('.audio', box)) {
    $('.more', row).onclick = async () => {
      const a = list.find((x) => x.id === row.dataset.id);
      await putAudio({ ...a, ownerId: ownerId() });
      if (a.transcript) { const ta = $('#transcript'); ta.value = (ta.value.trim() ? ta.value.trim().replace(/[.]?$/, '. ') : '') + a.transcript; reparse(); }
      show('new');
      renderAudios();
      toast(a.transcript ? 'Gravação e texto juntos ao registo atual' : 'Gravação junta ao registo atual');
    };
  }
}

async function renderList() {
  renderOrphans();
  const q = fold($('#search').value.trim());
  const recs = (await allRecords()).filter((r) => !q || fold(Object.values(r.values).join(' ')).includes(q));
  const list = $('#list');
  if (!recs.length) { list.innerHTML = `<div class="empty">${q ? 'Nada encontrado.' : 'Ainda não há registos.<br>Grava o primeiro caso no separador “Novo”.'}</div>`; return; }
  let html = '';
  let day = null;
  for (const r of recs) {
    const v = r.values;
    if (v.data !== day) { if (day !== null) html += '</div>'; day = v.data; html += `<div class="day">${day ? isoToPt(day) : 'Sem data'}</div><div class="cells">`; }
    const tag = recordTag(r);
    const who = [v.np && `NP ${v.np}`, v.idade !== '' && `${v.idade} a`, v.sexo && v.sexo[0], v.asa && `ASA ${v.asa}`].filter(Boolean).join(' · ');
    const what = [v.esp, v.proc || v.diag, v.tec].filter(Boolean).join(' · ');
    html += `<button class="item" data-id="${r.id}"><div class="l1"><span>${escapeHtml(who || 'Sem identificação')}</span>${tag}</div><div class="l2">${escapeHtml(what || '—')}</div></button>`;
  }
  list.innerHTML = html + '</div>';
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
  const base = await getBaseFile(activeProfile().id);
  $('#local-status').textContent = `Base: ${base ? `${base.name} (importado a ${new Date(base.savedAt).toLocaleDateString('pt-PT')})` : 'modelo vazio'} · ${recs.length} registo(s) na app.`;
  $('#btn-reset-base').hidden = !base;
  $('#card-sheets').hidden = mode() !== 'sheets';
}

async function openLocalExcel() {
  const recs = (await allRecords()).sort((a, b) => (a.values.data || '').localeCompare(b.values.data || '') || a.createdAt - b.createdAt);
  if (!window.JSZip) return toast('A biblioteca de Excel ainda não carregou. Tenta de novo.');
  const base = await getBaseFile(activeProfile().id);
  const buf = base ? base.buffer : await (await fetch('template.xlsx')).arrayBuffer();
  const res = await appendToWorkbook(window.JSZip, buf, recs.map((r) => r.values), { notes: recs.map((r) => r.cellNotes || {}) });
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
  const res = await appendToWorkbook(window.JSZip, buffer, recs.map((r) => r.values), { notes: recs.map((r) => r.cellNotes || {}) });
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
  const aud = await allAudios();
  const mb = aud.reduce((t, a) => t + (a.data ? a.data.byteLength : 0), 0) / 1e6;
  let s = `${n} registo(s) neste destino; ${(await allStored()).length} no total neste dispositivo. ${aud.length} gravação(ões), ${mb.toFixed(1)} MB.`;
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

// ---------------------------------------------------------------------------
// Destinos, obrigatórios e guia

function sheetInfo() {
  const link = activeProfile().gsSheet;
  const p = parseSheetLink(link);
  $('#gs-sheet-info').innerHTML = !link ? '' : p ? `<span class="ok">Folha reconhecida</span>${p.gid ? ` · separador ${p.gid}` : ''}.` : '<span class="err">Link da folha não reconhecido.</span>';
  const u = activeProfile().gsUrl;
  $('#gs-url-info').innerHTML = !u ? '' : scriptUrl(u) ? `<span class="ok">${/^https?:/i.test(u.trim()) ? 'URL' : 'ID'} do script reconhecido.</span>` : '<span class="err">URL ou ID do script não reconhecido.</span>';
}

function onProfileChange() {
  const list = profiles();
  const p = activeProfile();
  $('#profile-select').innerHTML = list.map((x) => `<option value="${x.id}" ${x.id === p.id ? 'selected' : ''}>${escapeHtml(x.name)} · ${x.mode === 'sheets' ? 'Google Sheets' : 'Excel'}</option>`).join('');
  $('#profile-chip').textContent = `${p.name} · ${p.mode === 'sheets' ? 'Sheets' : 'Excel'}`;
  $('#profile-chip').title = `Destino: ${p.name} (${p.mode === 'sheets' ? 'Google Sheets' : 'Excel no iPhone'})`;
  for (const r of $$('input[name=mode]')) r.checked = r.value === p.mode;
  $('#sheets-config').hidden = p.mode !== 'sheets';
  $('#gs-sheet').value = p.gsSheet || '';
  $('#gs-url').value = p.gsUrl || '';
  $('#gs-token').value = p.gsToken || '';
  $('#gs-status').textContent = '';
  $('#btn-profile-delete').hidden = list.length < 2;
  $('#btn-profile-rename').textContent = `Mudar o nome (${p.name})`;
  sheetInfo();
  renderRequired();
  updateForm();
  refreshBadge();
  storageInfo();
  if ($('#view-list').classList.contains('active')) renderList();
  syncPending(true);
}

function renderRequired() {
  const p = activeProfile();
  let html = '';
  for (const sec of SECTIONS) {
    html += `<div class="req-sec">${sec.label}</div>`;
    for (const c of COLUMNS.filter((x) => x.section === sec.key)) {
      const r = REQUIRED_RULES[c.key] || {};
      html += `<label class="req-item"><span class="t">${escapeHtml(c.label)}${r.whenText ? `<span class="c">${escapeHtml(r.whenText)}</span>` : ''}</span>
        ${r.on ? '<span class="p">habitual</span>' : ''}<input type="checkbox" class="switch" data-key="${c.key}" ${p.required[c.key] ? 'checked' : ''}></label>`;
    }
  }
  $('#req-list').innerHTML = html;
  for (const cb of $$('#req-list input')) cb.onchange = () => {
    const req = { ...activeProfile().required, [cb.dataset.key]: cb.checked };
    updateProfile(activeProfile().id, { required: req });
    updateForm();
  };
}

function openGuide() {
  showGuide({
    mode: activeProfile().mode,
    onMode: (m) => { updateProfile(activeProfile().id, { mode: m }); onProfileChange(); },
    onLoadModel: () => loadModel(currentModel(), settings.get('gpu', false)),
    onDone: (m) => {
      settings.set('onboarded', true);
      if (m === 'sheets' && !activeProfile().gsUrl) { show('settings'); toast('Preenche os dados do Google Sheets.'); }
    },
  });
}

function init() {
  $('#howto-steps').innerHTML = HOWTO;
  buildForm();
  resetState();

  $('#rec').onclick = toggleRecord;
  $('#transcript').addEventListener('input', debounce(() => { state.dirty = true; reparse(); }, 350));
  $('#form').addEventListener('toggle', (e) => { if (e.target.matches('.section')) e.target.dataset.touched = '1'; }, true);
  $('#btn-save').onclick = save;
  $('#btn-clear').onclick = () => { if (!state.dirty || confirm('Limpar o registo atual?')) resetState(); };
  $('#btn-delete').onclick = async () => {
    if (!state.id || !confirm(state.sync && state.sync.state === 'ok' ? `Apagar este registo da app?\nA linha ${state.sync.row} do Google Sheets não é apagada.` : 'Apagar este registo?')) return;
    for (const a of await audiosOf(state.id)) await deleteAudio(a.id);
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
    const blob = new Blob([JSON.stringify({ app: 'casuistica', version: 2, profiles: profiles().map(({ gsToken, ...p }) => p), records: await allStored() }, null, 1)], { type: 'application/json' });
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
    await setBaseFile(activeProfile().id, { name: f.name, buffer, savedAt: Date.now() });
    toast('Ficheiro base atualizado');
    refreshBadge();
  };
  $('#btn-reset-base').onclick = async () => {
    if (!confirm('Voltar a usar o modelo vazio como base?')) return;
    await clearBaseFile(activeProfile().id);
    refreshBadge();
  };

  // Definições: destinos
  $('#profile-select').onchange = (e) => { setActive(e.target.value); onProfileChange(); };
  $('#profile-chip').onclick = () => show('settings');
  $('#btn-profile-new').onclick = async () => {
    const name = prompt('Nome do novo destino (ex.: “Casuística bloco central”)', '');
    if (!name || !name.trim()) return;
    addProfile(name.trim(), activeProfile());
    onProfileChange();
    toast('Destino criado. Escolhe onde ficam os registos.');
  };
  $('#btn-profile-rename').onclick = () => {
    const p = activeProfile();
    const name = prompt('Novo nome do destino', p.name);
    if (!name || !name.trim()) return;
    updateProfile(p.id, { name: name.trim() });
    onProfileChange();
  };
  $('#btn-profile-delete').onclick = async () => {
    const p = activeProfile();
    const n = (await allRecords()).length;
    if (profiles().length < 2) return toast('Tem de existir pelo menos um destino.');
    if (!confirm(`Apagar o destino “${p.name}”${n ? ` e os seus ${n} registo(s) neste iPhone` : ''}? Os ficheiros e folhas não são alterados.`)) return;
    for (const r of await allRecords()) await deleteRecord(r.id);
    await clearBaseFile(p.id);
    removeProfile(p.id);
    onProfileChange();
  };
  for (const r of $$('input[name=mode]')) r.onchange = () => { updateProfile(activeProfile().id, { mode: r.value }); onProfileChange(); };
  const field = (id, key, after) => { $(id).oninput = (e) => { updateProfile(activeProfile().id, { [key]: e.target.value.trim() }); if (after) after(); }; };
  field('#gs-sheet', 'gsSheet', sheetInfo);
  field('#gs-url', 'gsUrl', sheetInfo);
  $('#gs-token').oninput = (e) => updateProfile(activeProfile().id, { gsToken: e.target.value });
  $('#btn-gs-token').onclick = () => {
    if (activeProfile().gsToken && !confirm('Substituir o token atual? Se já o usaste no script, terás de o apagar lá (Propriedades do script → TOKEN).')) return;
    const b = crypto.getRandomValues(new Uint8Array(24));
    const t = btoa(String.fromCharCode(...b)).replace(/[+/=]/g, '').slice(0, 28);
    $('#gs-token').value = t;
    $('#gs-token').type = 'text';
    updateProfile(activeProfile().id, { gsToken: t });
    toast('Token gerado e guardado neste iPhone');
  };
  $('#btn-gs-test').onclick = async () => {
    const st = $('#gs-status');
    st.textContent = 'A testar…';
    try {
      const d = await ping(gsConfig());
      st.innerHTML = `<span class="ok">Ligado</span> a “${escapeHtml(d.spreadsheet)}”, folha “${escapeHtml(d.sheet)}”. Última linha preenchida: ${d.lastRow}.` +
        (d.mismatch.length ? `<br><span class="err">Colunas diferentes do esperado: ${d.mismatch.slice(0, 4).map((m) => `${escapeHtml(m.exp)} ≠ “${escapeHtml(m.got)}”`).join('; ')}${d.mismatch.length > 4 ? '…' : ''}</span>` : '<br>As 40 colunas coincidem.');
    } catch (e) { st.innerHTML = `<span class="err">${escapeHtml(e.message)}</span>`; }
  };
  $('#btn-req-reset').onclick = () => { updateProfile(activeProfile().id, { required: defaultRequired() }); renderRequired(); updateForm(); };
  $('#btn-guide').onclick = () => openGuide();
  onProfileChange();
  if (!settings.get('onboarded', false)) openGuide();
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
    if (!confirm('Apagar TODOS os registos e gravações deste dispositivo (todos os destinos)? Isto não se pode desfazer.')) return;
    await clearAll();
    await clearAudios();
    toast('Registos e gravações apagados');
    resetState();
    refreshBadge();
    storageInfo();
  };

  window.addEventListener('beforeunload', (e) => { if (state.dirty) { e.preventDefault(); e.returnValue = ''; } });
  refreshBadge();

  if ('serviceWorker' in navigator && location.protocol !== 'file:') navigator.serviceWorker.register('sw.js').catch(() => {});
}

init();
