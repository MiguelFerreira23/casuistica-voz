// Passos ilustrados para ligar a app a uma Google Sheet (Definições → Como configurar).
// Prints tirados de uma configuração real; o email foi tapado.

const img = (f, alt) => `<img src="guide/${f}" alt="${alt}" loading="lazy" width="760">`;
const link = (href, text) => `<a href="${href}" target="_blank" rel="noopener">${text}</a>`;

export const HOWTO = `<ol>
  <li>Copia o código do script:
    <div class="code-actions">
      <button type="button" class="btn small-btn" id="btn-copy-code">Copiar o código</button>
      <button type="button" class="btn small-btn ghost-btn" id="btn-show-code">Ver o código</button>
    </div>
    <pre class="code" id="code-view" hidden></pre></li>
  <li>${link('https://script.google.com/create', 'Abre um projeto novo no Apps Script')} (com a tua conta Google).
    Apaga o que lá está, cola o código e guarda (<code>Ctrl+S</code> ou o ícone da disquete). Dá um nome ao projeto, por exemplo “Casuística por voz”.
    ${img('1-codigo.jpg', 'Editor do Apps Script com o código colado')}</li>
  <li>Carrega em <b>Implementar → Nova implementação</b>.
    ${img('2-implementar.jpg', 'Menu Implementar com a opção Nova implementação')}</li>
  <li>Na roda dentada, escolhe <b>App para a Web</b>.
    ${img('3-tipo.jpg', 'Escolha do tipo App para a Web')}</li>
  <li>Em <b>Executar como</b> deixa <b>Eu</b>, e em <b>Quem tem acesso</b> escolhe <b>Qualquer pessoa</b>. Carrega em <b>Implementar</b>.
    ${img('4-config.jpg', 'Configuração: executar como Eu, acesso Qualquer pessoa')}
    <p class="muted">“Qualquer pessoa” só permite <i>chamar</i> o endereço; ninguém vê a folha. O script recusa pedidos sem o teu token, só escreve nas folhas que autorizares e não devolve dados de doentes.</p></li>
  <li>Carrega em <b>Autorizar acesso</b>, escolhe a tua conta e, no aviso “A Google não validou esta app”, carrega em <b>Avançadas → Aceder a … (não seguro)</b> e depois em <b>Permitir</b>.
    ${img('5-autorizar.jpg', 'Botão Autorizar acesso')}</li>
  <li>Copia o <b>ID de implementação</b> (ou o URL que termina em <code>/exec</code>) e cola-o acima. Se fechaste a janela: ${link('https://script.google.com/home', 'os teus projetos')} → o projeto → <b>Implementar → Gerir implementações → Copiar</b>.</li>
  <li>Acima: cola o link da folha, carrega em <b>Gerar um token forte</b> e depois em <b>Testar ligação</b>. O primeiro token e a primeira folha testados ficam associados ao script.</li>
</ol>
<p class="muted small howto-foot">Outra folha no mesmo script: no projeto, abre <b>Definições do projeto → Propriedades do script</b> e acrescenta o ID da folha a <code>SHEETS</code>, separado por vírgula.</p>`;

// Liga os botões do código. O texto é lido antes do toque, porque o Safari só deixa copiar
// para a área de transferência dentro do próprio toque.
export function bindHowto(root, toast) {
  let code = '';
  const ready = fetch('Code.gs', { cache: 'no-cache' }).then((r) => r.text()).then((t) => { code = t; }).catch(() => {});
  const copy = root.querySelector('#btn-copy-code');
  const view = root.querySelector('#code-view');
  copy.onclick = async () => {
    if (!code) await ready;
    if (!code) return toast('Não foi possível obter o código. Tenta com rede.');
    try {
      await navigator.clipboard.writeText(code);
      copy.textContent = 'Código copiado';
      setTimeout(() => { copy.textContent = 'Copiar o código'; }, 2500);
    } catch {
      // alternativa: mostrar e selecionar o texto para copiar à mão
      view.hidden = false;
      view.textContent = code;
      const r = document.createRange();
      r.selectNodeContents(view);
      const sel = getSelection();
      sel.removeAllRanges();
      sel.addRange(r);
      toast('Seleciona e copia o código mostrado.');
    }
  };
  root.querySelector('#btn-show-code').onclick = async (e) => {
    if (!code) await ready;
    view.textContent = code || 'Sem rede: não foi possível obter o código.';
    view.hidden = !view.hidden;
    e.target.textContent = view.hidden ? 'Ver o código' : 'Esconder o código';
  };
}
