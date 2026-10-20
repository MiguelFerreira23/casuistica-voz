// Gravação de áudio (MediaRecorder) e ponte para o worker de transcrição.

export const MODELS = {
  'onnx-community/whisper-tiny': { label: 'Rápido (tiny, ~45 MB)', size: 45 },
  'onnx-community/whisper-base': { label: 'Equilibrado (base, ~80 MB)', size: 80 },
  'onnx-community/whisper-small': { label: 'Mais preciso (small, ~250 MB)', size: 250 },
};

let worker = null;
let seq = 0;
const pending = new Map();
let listeners = { progress: () => {}, status: () => {} };

function getWorker() {
  if (worker) return worker;
  worker = new Worker(new URL('./stt-worker.js', import.meta.url), { type: 'module' });
  worker.onmessage = (ev) => {
    const d = ev.data;
    if (d.type === 'progress') return listeners.progress(d);
    if (d.type === 'status') return listeners.status(d);
    const p = pending.get(d.id);
    if (!p) return;
    pending.delete(d.id);
    if (d.type === 'error') p.reject(new Error(d.message));
    else p.resolve(d);
  };
  worker.onerror = (e) => { for (const p of pending.values()) p.reject(new Error(e.message || 'Erro no worker')); pending.clear(); };
  return worker;
}

function call(msg, transfer) {
  const id = ++seq;
  return new Promise((resolve, reject) => {
    pending.set(id, { resolve, reject });
    getWorker().postMessage({ ...msg, id }, transfer || []);
  });
}

export function onSttEvents(l) { listeners = { ...listeners, ...l }; }
export const loadModel = (model, useGpu) => call({ type: 'load', model, useGpu });

export async function transcribe(blob, model, useGpu) {
  const audio = await toMono16k(blob);
  const res = await call({ type: 'transcribe', model, useGpu, audio }, [audio.buffer]);
  return res.text;
}

async function toMono16k(blob) {
  const buf = await blob.arrayBuffer();
  const Ctx = window.AudioContext || window.webkitAudioContext;
  const ctx = new Ctx();
  const decoded = await new Promise((res, rej) => ctx.decodeAudioData(buf, res, rej));
  ctx.close && ctx.close();
  const rate = 16000;
  const off = new OfflineAudioContext(1, Math.ceil(decoded.duration * rate), rate);
  const srcNode = off.createBufferSource();
  srcNode.buffer = decoded;
  srcNode.connect(off.destination);
  srcNode.start();
  const rendered = await off.startRendering();
  return new Float32Array(rendered.getChannelData(0));
}

// --- Gravação -------------------------------------------------------------

export class Recorder {
  constructor() { this.stream = null; this.rec = null; this.chunks = []; this.analyser = null; }

  async start() {
    this.stream = await navigator.mediaDevices.getUserMedia({ audio: { echoCancellation: true, noiseSuppression: true, channelCount: 1 } });
    const types = ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm'];
    const mimeType = types.find((t) => window.MediaRecorder && MediaRecorder.isTypeSupported(t));
    this.rec = new MediaRecorder(this.stream, mimeType ? { mimeType } : undefined);
    this.chunks = [];
    this.rec.ondataavailable = (e) => e.data.size && this.chunks.push(e.data);
    this.rec.start(1000);
    try {
      const Ctx = window.AudioContext || window.webkitAudioContext;
      this.actx = new Ctx();
      const s = this.actx.createMediaStreamSource(this.stream);
      this.analyser = this.actx.createAnalyser();
      this.analyser.fftSize = 512;
      s.connect(this.analyser);
    } catch { this.analyser = null; }
  }

  level() {
    if (!this.analyser) return 0;
    const a = new Uint8Array(this.analyser.fftSize);
    this.analyser.getByteTimeDomainData(a);
    let sum = 0;
    for (const v of a) sum += ((v - 128) / 128) ** 2;
    return Math.min(1, Math.sqrt(sum / a.length) * 4);
  }

  stop() {
    return new Promise((resolve) => {
      this.rec.onstop = () => {
        this.stream.getTracks().forEach((t) => t.stop());
        this.actx && this.actx.close && this.actx.close();
        resolve(new Blob(this.chunks, { type: this.rec.mimeType || 'audio/mp4' }));
      };
      this.rec.stop();
    });
  }
}
