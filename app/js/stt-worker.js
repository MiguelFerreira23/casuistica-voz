// Web Worker: transcrição com Whisper a correr no próprio dispositivo (transformers.js).
// O áudio nunca sai do telemóvel; só o modelo é descarregado (uma vez) e fica em cache.

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.useBrowserCache = true;

// Vocabulário de contexto: ajuda o Whisper a escrever bem os termos da casuística.
const VOCAB = 'Casuística de anestesia. Número de processo, idade, sexo masculino, ASA 4, urgência, cirurgia vascular. ' +
  'Diagnóstico: hematoma inguinal. Procedimento: Fogarty. Duração 1 a 3 horas. Técnica anestésica geral, anestesia geral balanceada. ' +
  'Monitorização ASA mais BIS mais TOF mais PAI. Tipo de via aérea máscara laríngea, intubação orotraqueal, videolaringoscopia, Cormack-Lehane, sucesso. ' +
  'Raquianestesia, epidural, bloqueio TAP ecoguiado, linha arterial radial, CVC. Destino UCPA, SO, UCI. Caso complexo não. Observações.';

const RATE = 16000;
const MAX_SEG = 28; // segundos por parte (o Whisper processa no máximo 30)

let asr = null;
let loadedKey = null;

async function webgpuAvailable() {
  try { return !!(navigator.gpu && (await navigator.gpu.requestAdapter())); } catch { return false; }
}

async function load(model, useGpu) {
  const device = useGpu && (await webgpuAvailable()) ? 'webgpu' : 'wasm';
  const key = model + '|' + device;
  if (asr && loadedKey === key) return device;
  asr = null;
  const progress_callback = (p) => {
    if (p.status === 'progress') self.postMessage({ type: 'progress', file: p.file, loaded: p.loaded, total: p.total });
  };
  const dtype = device === 'webgpu' ? { encoder_model: 'fp32', decoder_model_merged: 'q4' } : 'q8';
  try {
    asr = await pipeline('automatic-speech-recognition', model, { device, dtype, progress_callback });
  } catch (e) {
    if (device !== 'webgpu') throw e;
    asr = await pipeline('automatic-speech-recognition', model, { device: 'wasm', dtype: 'q8', progress_callback });
    loadedKey = model + '|wasm';
    return 'wasm';
  }
  loadedKey = key;
  return device;
}

// Divide o áudio em partes ≤ MAX_SEG, cortando no momento mais silencioso dos últimos 4 s de cada parte.
function split(audio) {
  const parts = [];
  let start = 0;
  const max = MAX_SEG * RATE;
  while (audio.length - start > max) {
    const from = start + max - 4 * RATE;
    const win = 0.05 * RATE;
    let best = start + max, bestE = Infinity;
    for (let i = from; i + win < start + max; i += win / 2) {
      let e = 0;
      for (let j = i; j < i + win; j += 4) e += audio[j] * audio[j];
      if (e < bestE) { bestE = e; best = i + win / 2; }
    }
    best = Math.floor(best);
    parts.push(audio.subarray(start, best));
    start = best;
  }
  parts.push(audio.subarray(start));
  return parts.filter((p) => p.length > 0.3 * RATE);
}

const tokenId = (t) => asr.tokenizer.model.tokens_to_ids.get(t);

// Transcrição com vocabulário de contexto (<|startofprev|>), parte a parte.
async function transcribePrompted(audio) {
  const ids = ['<|startofprev|>', '<|startoftranscript|>', '<|pt|>', '<|transcribe|>', '<|notimestamps|>'].map(tokenId);
  if (ids.some((x) => x == null)) throw new Error('tokens especiais em falta');
  const [prev, sot, pt, transcribe, notime] = ids;
  const out = [];
  for (const seg of split(audio)) {
    // contexto: vocabulário + fim do texto já transcrito (máx. ~220 tokens, como no Whisper)
    const context = (VOCAB + ' ' + out.join(' ').slice(-300)).trim();
    const promptIds = asr.tokenizer.encode(' ' + context, { add_special_tokens: false }).slice(-220);
    const init = [prev, ...promptIds, sot, pt, transcribe, notime];
    const { input_features } = await asr.processor(seg);
    const gen = await asr.model.generate({ inputs: input_features, decoder_input_ids: init, max_new_tokens: 200 });
    const seq = (gen.sequences || gen).tolist()[0].map(Number).slice(init.length);
    const text = asr.tokenizer.decode(seq, { skip_special_tokens: true }).trim();
    // segurança: o Whisper às vezes repete o contexto quando a parte está em silêncio
    if (text && !VOCAB.includes(text)) out.push(text);
  }
  return out.join(' ');
}

async function transcribePlain(audio) {
  const out = await asr(audio, { language: 'portuguese', task: 'transcribe', chunk_length_s: 30, stride_length_s: 5 });
  return Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text;
}

const clean = (t) => t.replace(/\[[^\]]*\]|\([^)]*\)/g, ' ') // "[música]", "(tosse)"
  .replace(/\s+/g, ' ').trim();

self.onmessage = async (ev) => {
  const { id, type, model, useGpu, audio, prompt = true } = ev.data;
  try {
    if (type === 'load') {
      const device = await load(model, useGpu);
      self.postMessage({ id, type: 'ready', device });
    } else if (type === 'transcribe') {
      const device = await load(model, useGpu);
      self.postMessage({ type: 'status', text: 'A transcrever…', device });
      let text;
      if (prompt) {
        try { text = await transcribePrompted(audio); } catch (e) { console.warn('Sem vocabulário:', e); text = await transcribePlain(audio); }
      } else text = await transcribePlain(audio);
      self.postMessage({ id, type: 'result', text: clean(text) });
    }
  } catch (e) {
    self.postMessage({ id, type: 'error', message: String(e && e.message ? e.message : e) });
  }
};
