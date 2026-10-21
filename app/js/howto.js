// Passos ilustrados para ligar a app a uma Google Sheet (Definições → Como configurar).
// Prints tirados de uma configuração real; o email foi tapado.

const CODE_URL = 'https://github.com/MiguelFerreira23/casuistica-voz/blob/main/google-apps-script/Code.gs';
const img = (f, alt) => `<img src="guide/${f}" alt="${alt}" loading="lazy" width="760">`;

export const HOWTO = `<ol>
  <li>No computador, abre <b>script.google.com</b> com a tua conta Google e carrega em <b>Novo projeto</b>.
    Apaga o que lá está e cola o <a href="${CODE_URL}" target="_blank" rel="noopener">Code.gs</a> tal como está, sem preencher nada.
    Guarda com <code>Ctrl+S</code> e dá um nome ao projeto.
    ${img('1-codigo.jpg', 'Editor do Apps Script com o código colado')}</li>
  <li>Carrega em <b>Implementar → Nova implementação</b>.
    ${img('2-implementar.jpg', 'Menu Implementar com a opção Nova implementação')}</li>
  <li>Na roda dentada, escolhe <b>App para a Web</b>.
    ${img('3-tipo.jpg', 'Escolha do tipo App para a Web')}</li>
  <li>Em <b>Executar como</b> deixa <b>Eu</b>, e em <b>Quem tem acesso</b> escolhe <b>Qualquer pessoa</b>. Depois carrega em <b>Implementar</b>.
    ${img('4-config.jpg', 'Configuração: executar como Eu, acesso Qualquer pessoa')}
    <p class="muted">“Qualquer pessoa” só permite <i>chamar</i> o endereço; ninguém vê a folha. O script recusa pedidos sem o teu token, só escreve nas folhas que autorizares e não devolve dados de doentes. É preciso porque o iPhone fala com o script sem a sessão Google.</p></li>
  <li>Carrega em <b>Autorizar acesso</b>, escolhe a tua conta e, no aviso “A Google não validou esta app”, carrega em <b>Avançadas → Aceder a … (não seguro)</b> e depois em <b>Permitir</b>. O aviso aparece em qualquer script pessoal.
    ${img('5-autorizar.jpg', 'Botão Autorizar acesso')}</li>
  <li>Copia o <b>URL da app para a Web</b> (termina em <code>/exec</code>) ou só o <b>ID de implementação</b>; a app aceita os dois. Envia-o para o iPhone, por exemplo por email para ti próprio.</li>
  <li>Aqui, em cima: cola o <b>link da Google Sheet</b> e o <b>URL</b>, carrega em <b>Gerar um token forte</b> e depois em <b>Testar ligação</b>.
    O primeiro token e a primeira folha testados ficam associados ao script.</li>
</ol>
<p class="muted small" style="margin:0 16px 16px">Outra folha no mesmo script: no editor, abre <b>Definições do projeto → Propriedades do script</b> e acrescenta o ID da folha a <code>SHEETS</code>, separado por vírgula.</p>`;
