// Web Worker: transcrição com Whisper a correr no próprio dispositivo (transformers.js).
// O áudio nunca sai do telemóvel; só o modelo é descarregado (uma vez) e fica em cache.

import { pipeline, env } from 'https://cdn.jsdelivr.net/npm/@huggingface/transformers@3.8.1';

env.allowLocalModels = false;
env.useBrowserCache = true;

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

self.onmessage = async (ev) => {
  const { id, type, model, useGpu, audio } = ev.data;
  try {
    if (type === 'load') {
      const device = await load(model, useGpu);
      self.postMessage({ id, type: 'ready', device });
    } else if (type === 'transcribe') {
      const device = await load(model, useGpu);
      self.postMessage({ type: 'status', text: 'A transcrever…', device });
      const out = await asr(audio, {
        language: 'portuguese',
        task: 'transcribe',
        chunk_length_s: 30,
        stride_length_s: 5,
      });
      const text = (Array.isArray(out) ? out.map((o) => o.text).join(' ') : out.text)
        .replace(/\[[^\]]*\]|\([^)]*\)/g, ' ') // "[música]", "(tosse)"
        .replace(/\s+/g, ' ').trim();
      self.postMessage({ id, type: 'result', text });
    }
  } catch (e) {
    self.postMessage({ id, type: 'error', message: String(e && e.message ? e.message : e) });
  }
};
