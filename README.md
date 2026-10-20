# Casuística por voz

Aplicação **web** para registar a casuística de anestesia no iPhone. Ditas o caso, o texto é transcrito
e interpretado, e o formulário fica preenchido para confirmares. No fim exportas para o Excel.

Não é preciso instalar nada da App Store nem compilar: é uma página que se abre no Safari.

## Privacidade: tudo corre no telemóvel

| Etapa | Onde corre |
|---|---|
| Gravação de áudio | Safari (MediaRecorder) |
| Voz → texto | Whisper a correr no próprio iPhone (transformers.js / WebAssembly) |
| Texto → campos | Regras em JavaScript (`app/js/parser.js`) |
| Registos | IndexedDB do Safari (só neste dispositivo) |
| Excel | Gerado no próprio browser (`app/js/xlsx.js`) |

A única coisa que vem da internet são o código das bibliotecas e o modelo Whisper, descarregados
**uma vez** (cerca de 80 MB) e guardados em cache. Depois disso a app funciona sem rede.
O áudio e o texto ditado nunca saem do telemóvel. No modo Google Sheets só a linha final,
já confirmada por ti, é enviada para a tua folha.

## Ficheiros

- `Casuistica urgencia IVG - modelo.xlsx`: cópia do Excel sem dados de doentes, com as listas, as validações e as tabelas intactas.
- `app/`: a aplicação. **Só esta pasta é publicada** e não contém dados de doentes.
- `google-apps-script/Code.gs`: script para o modo Google Sheets.
- `tests/parser.test.mjs`: testes do interpretador (`node --test tests/parser.test.mjs`).

## Publicação (GitHub Pages)

O workflow `.github/workflows/pages.yml` corre os testes e publica **só a pasta `app/`** sempre que há
um push para `main`. Os Excel com dados de doentes estão no `.gitignore` e nunca são enviados.
O único Excel no repositório é `app/template.xlsx`, que está vazio.

No iPhone, abre o endereço do Pages no Safari → **Partilhar → Adicionar ao ecrã principal**.
Na primeira utilização, com Wi-Fi: **Definições → Descarregar / testar modelo**.

Para testar no PC: `python -m http.server 8765 --directory app` e abre <http://localhost:8765>.

## Dois modos (Definições → "Onde ficam os registos")

### Excel no iPhone
Os registos ficam na app. Em **Exportar → Abrir / partilhar Excel atual** é gerado um Excel com o
*ficheiro base* (o modelo vazio, ou o teu ficheiro se escolheres "Usar o meu ficheiro como base")
mais todos os registos, ordenados por data. Como o ficheiro é sempre gerado de novo, as correções
aparecem logo. No menu de partilha escolhes "Guardar em Ficheiros" ou "Abrir no Excel".

### Google Sheets
Cada registo guardado é logo enviado para a Google Sheet. Se editares um registo, a mesma linha é
atualizada. Sem rede, o registo fica "por enviar" e segue mais tarde.

Configuração (uma vez). O repositório não tem links nem segredos, porque tudo se configura na app:
1. Em <https://script.google.com> (na tua conta), cria um **Novo projeto** e cola
   `google-apps-script/Code.gs` **tal como está**, sem preencher nada.
2. **Implementar → Nova implementação → Aplicação Web**, com "Executar como: **Eu**" e
   "Quem tem acesso: **Qualquer pessoa**". Autoriza e copia o URL que termina em `/exec`.
3. Na app, em **Definições → Google Sheets**, cola:
   - o **link da Google Sheet** (o separador é reconhecido pelo `gid` do link);
   - o **URL `/exec`**;
   - um **token** à tua escolha, com pelo menos 8 caracteres.
4. Carrega em **Testar ligação**. O primeiro token usado fica gravado no script; a partir daí só são
   aceites pedidos com esse token. O teste também confirma que as 40 colunas coincidem.

O link da folha, o URL e o token ficam guardados só no iPhone. Para mudar o token: no editor do
Apps Script, abre **Definições do projeto → Propriedades do script**, apaga `TOKEN` e testa de novo
com o token novo.

O script só escreve nas colunas A..AN da folha da casuística (e acrescenta uma linha em
"Casos Complexos" quando "Caso complexo = Sim"); não altera nem apaga mais nada.

## Como ditar

Diz os campos pela ordem que quiseres, de forma natural. Por exemplo:

> Processo um dois três quatro cinco seis sete, idade 66, sexo masculino, ASA quatro. Urgência de cirurgia vascular.
> Diagnóstico hematoma inguinal. Procedimento drenagem de hematoma inguinal. Durou duas horas.
> Anestesia geral balanceada, monitorização ASA mais BIS mais PAI, máscara laríngea.
> Linha arterial radial por referências anatómicas com sucesso. CVC ecoguiado com sucesso. Destino UCPA.

Dicas:
- **Diagnóstico**, **procedimento**, **particularidades**, **complicações** e **observações** são texto
  livre. Diz a palavra antes do conteúdo ("diagnóstico …"). O texto termina na palavra-chave seguinte
  ou no ponto final.
- O método e o sucesso ficam associados à técnica dita imediatamente antes ("bloqueio TAP ecoguiado",
  "linha arterial radial com sucesso").
- "Com ajuda" e "não à primeira" contam como **Sucesso** e são acrescentados às Observações
  ("VA com ajuda"), como indicado nas Notas do Excel.
- Podes gravar várias vezes; o texto acumula. Também podes escrever ou corrigir diretamente na caixa de texto.

Cada campo mostra de onde veio o valor:
- **Mencionado** (verde): foi dito ou escrito na caixa de texto.
- **Sugerido** (amarelo): não foi dito, e por baixo do campo aparece o motivo. Por exemplo, "Data de
  hoje", "Calculado a partir da idade (66)" ou "Por teres mencionado Videolaringoscópio". Confirma.
- **Escrito à mão** (azul): preenchido ou corrigido no formulário; já não é reescrito pelo texto.

## Outras exportações

- **Acrescentar a outro ficheiro Excel**: escolhes o teu `.xlsx` (no Ficheiros/iCloud) e as linhas
  entram a seguir à última linha preenchida. Os casos com "Caso complexo = Sim" vão também para a folha
  "Casos Complexos". As tabelas recalculam ao abrir.
- **Copiar linhas**: copia em formato de tabela para colar diretamente no Excel ou no Sheets.

Os registos vivem só no Safari deste iPhone. Exporta com regularidade e usa **Cópia de segurança (JSON)**.

## Ajustar o vocabulário

Os sinónimos estão em `app/js/parser.js` (função `rule(...)`). Se uma expressão tua não for
reconhecida, acrescenta-a lá e junta um caso a `tests/parser.test.mjs`. As opções das listas
estão em `app/js/schema.js` e são iguais às da folha "Listas".
