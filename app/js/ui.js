// Janelas simples (folha que sobe do fundo) e guia da primeira utilização.

const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));

/**
 * Folha com título, conteúdo HTML e botões. Devolve uma Promise com o valor do botão escolhido
 * (ou null se fechar). onOpen(el) permite ligar eventos ao conteúdo.
 */
export function sheet({ title, html = '', buttons = [{ label: 'OK', value: true, primary: true }], onOpen }) {
  return new Promise((resolve) => {
    const wrap = document.createElement('div');
    wrap.className = 'sheet-wrap';
    wrap.innerHTML = `<div class="sheet" role="dialog" aria-modal="true" aria-label="${esc(title)}">
      <div class="sheet-grip"></div><h2>${esc(title)}</h2><div class="sheet-body">${html}</div>
      <div class="sheet-actions">${buttons.map((b, i) => `<button class="btn ${b.primary ? 'primary' : b.danger ? 'danger' : ''}" data-i="${i}">${esc(b.label)}</button>`).join('')}</div></div>`;
    const close = (v) => { wrap.classList.remove('open'); setTimeout(() => wrap.remove(), 200); resolve(v); };
    wrap.addEventListener('click', (e) => { if (e.target === wrap) close(null); });
    wrap.querySelectorAll('.sheet-actions button').forEach((b) => {
      b.onclick = () => {
        const btn = buttons[+b.dataset.i];
        close(typeof btn.value === 'function' ? btn.value(wrap) : btn.value);
      };
    });
    document.body.appendChild(wrap);
    requestAnimationFrame(() => wrap.classList.add('open'));
    if (onOpen) onOpen(wrap);
  });
}

// Nota de uma célula: texto livre + sugestões rápidas
export async function editNote({ label, note, presets }) {
  return sheet({
    title: `Nota: ${label}`,
    html: `<p class="muted small">Vai para a célula do Excel (comentário) ou do Google Sheets. Serve para explicar um valor ou um campo vazio.</p>
      <div class="chips">${presets.map((p) => `<button type="button" class="chip-btn">${esc(p)}</button>`).join('')}</div>
      <textarea id="note-text" rows="3" placeholder="Escreve a nota…">${esc(note || '')}</textarea>`,
    buttons: [
      ...(note ? [{ label: 'Remover', value: '', danger: true }] : []),
      { label: 'Cancelar', value: null },
      { label: 'Guardar', primary: true, value: (el) => el.querySelector('#note-text').value.trim() },
    ],
    onOpen(el) {
      const ta = el.querySelector('#note-text');
      el.querySelectorAll('.chip-btn').forEach((b) => { b.onclick = () => { ta.value = b.textContent; ta.focus(); }; });
    },
  });
}

// ---------------------------------------------------------------------------
// Guia (aparece na primeira vez; volta a abrir em Definições → Ver o guia)

const STEPS = [
  {
    title: 'Casuística por voz',
    html: `<p>Regista cada doente a <b>falar</b>, e a app preenche sozinha a linha da casuística.</p>
      <p>No fim exportas para o <b>Excel</b> ou envias para o <b>Google Sheets</b>.</p>
      <p class="note"><svg class="ic" aria-hidden="true"><use href="#i-lock"/></svg><span>A gravação, a transcrição e a interpretação correm só neste telemóvel. As gravações ficam guardadas aqui, para as poderes ouvir mais tarde.</span></p>`,
  },
  {
    title: '1. Dita o caso',
    html: `<p>Toca no botão vermelho e diz o que fizeste, pela ordem que quiseres:</p>
      <blockquote>“Processo 1234567, 66 anos, masculino, ASA 4. Cirurgia vascular. Diagnóstico hematoma inguinal. Procedimento drenagem. Duas horas. Geral balanceada, máscara laríngea. Destino UCPA.”</blockquote>
      <ul><li>Para <b>diagnóstico</b>, <b>procedimento</b>, <b>observações</b> e <b>complicações</b>, diz a palavra antes do texto.</li>
      <li>Podes gravar várias vezes: o texto acumula.</li>
      <li>Também podes escrever na caixa de texto ou preencher o formulário à mão.</li></ul>`,
  },
  {
    title: '2. Revê o formulário',
    html: `<p>Cada campo mostra de onde veio o valor:</p>
      <ul class="legend-list"><li><i class="dot voz"></i><span><b>Mencionado</b>: foi dito</span></li>
      <li><i class="dot sug"></i><span><b>Sugerido</b>: não foi dito; o motivo aparece por baixo</span></li>
      <li><i class="dot man"></i><span><b>Escrito à mão</b>: preenchido ou corrigido por ti</span></li></ul>
      <p>Os campos com <b>*</b> são obrigatórios; escolhes quais em Definições.</p>
      <p>Antes de guardar vês um resumo. Se faltar um dado, podes deixar uma nota na célula, como “Método não registado”.</p>`,
  },
  {
    title: '3. Onde ficam os registos',
    html: `<p>Escolhe agora; podes mudar ou criar mais destinos em <b>Definições</b>.</p>
      <div class="choice">
        <button type="button" data-mode="local"><b>Excel no iPhone</b><span>Os registos ficam no telemóvel. Abres ou partilhas o Excel quando quiseres.</span></button>
        <button type="button" data-mode="sheets"><b>Google Sheets</b><span>Cada registo vai direto para uma folha do Google. Ligas a tua conta Google aqui no telemóvel.</span></button>
      </div>`,
  },
  {
    title: 'Pronto',
    html: `<p>Antes do primeiro ditado, descarrega o <b>modelo de voz</b> (cerca de 80 MB, de preferência com Wi-Fi). Só é preciso uma vez.</p>
      <button type="button" class="btn block" id="guide-model">Descarregar o modelo de voz</button>
      <p class="muted small" id="guide-model-status"></p>
      <p class="muted small">Os registos e as gravações ficam neste browser. Exporta ou faz uma cópia de segurança com regularidade.</p>`,
  },
];

export function showGuide({ mode, onMode, onLoadModel, onDone }) {
  let i = 0;
  const wrap = document.createElement('div');
  wrap.className = 'guide';
  document.body.appendChild(wrap);
  const render = () => {
    const s = STEPS[i];
    wrap.innerHTML = `<div class="guide-top"><button class="guide-skip" type="button">${i === STEPS.length - 1 ? '' : 'Saltar'}</button></div>
      <div class="guide-card" role="dialog" aria-modal="true" aria-label="Guia">
      <h2>${s.title}</h2><div class="guide-body">${s.html}</div>
      <div class="guide-dots">${STEPS.map((_, k) => `<span class="${k === i ? 'on' : ''}"></span>`).join('')}</div>
      <div class="guide-nav">
        <button class="btn ghost" type="button" data-nav="-1" ${i === 0 ? 'hidden' : ''}>Anterior</button>
        <button class="btn primary" type="button" data-nav="1">${i === STEPS.length - 1 ? 'Começar' : 'Seguinte'}</button>
      </div></div>`;
    wrap.querySelector('.guide-skip').onclick = finish;
    wrap.querySelectorAll('[data-nav]').forEach((b) => {
      b.onclick = () => { const n = i + Number(b.dataset.nav); if (n >= STEPS.length) finish(); else { i = n; render(); } };
    });
    wrap.querySelectorAll('[data-mode]').forEach((b) => {
      b.classList.toggle('on', b.dataset.mode === mode);
      b.onclick = () => { mode = b.dataset.mode; onMode(mode); render(); };
    });
    const mb = wrap.querySelector('#guide-model');
    if (mb) mb.onclick = async () => {
      mb.disabled = true;
      const st = wrap.querySelector('#guide-model-status');
      st.textContent = 'A descarregar… podes continuar, termina em segundo plano.';
      try { await onLoadModel(); st.textContent = 'Modelo pronto.'; } catch (e) { st.textContent = 'Erro: ' + e.message; mb.disabled = false; }
    };
  };
  function finish() { wrap.remove(); onDone(mode); }
  render();
}
