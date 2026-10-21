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
- `app/Code.gs`: script para o modo Google Sheets (a app permite copiá-lo diretamente).
- `tests/parser.test.mjs`: testes do interpretador (`node --test tests/parser.test.mjs`).

## Publicação (GitHub Pages)

O workflow `.github/workflows/pages.yml` corre os testes e publica **só a pasta `app/`** sempre que há
um push para `main`. Os Excel com dados de doentes estão no `.gitignore` e nunca são enviados.
O único Excel no repositório é `app/template.xlsx`, que está vazio.

No iPhone, abre o endereço do Pages no Safari → **Partilhar → Adicionar ao ecrã principal**.
Na primeira utilização, com Wi-Fi: **Definições → Descarregar / testar modelo**.

Para testar no PC: `python -m http.server 8765 --directory app` e abre <http://localhost:8765>.

## Primeira utilização

Na primeira vez que a app é aberta aparece um **guia** curto: o que a app faz, como ditar, como rever,
onde ficam os registos e o download do modelo de voz. Para o voltar a ver: **Definições → Ver o guia**.

## Destinos (Definições → Destino)

Um destino é um sítio para onde vão os registos, com a sua própria configuração. Podes ter vários,
por exemplo um por ficheiro, por folha do Google ou por serviço. Os registos de cada destino ficam
separados, e o destino ativo aparece no canto superior direito.

### Excel no iPhone
Os registos ficam na app. Em **Exportar → Abrir / partilhar Excel atual** é gerado um Excel com o
*ficheiro base* (o modelo vazio, ou o teu ficheiro se escolheres "Usar o meu ficheiro como base")
mais todos os registos do destino, ordenados por data. Como o ficheiro é sempre gerado de novo, as
correções aparecem logo.

### Google Sheets

Cada registo confirmado é enviado para a Google Sheet, com as notas das células. Editar um registo
atualiza a mesma linha. Os casos complexos também vão para a folha "Casos Complexos". Sem rede, os
registos ficam "por enviar" e seguem depois. Há duas formas de ligar:

**1. Conta Google (recomendada; configura-se só no telemóvel)**
1. Em **Definições → Destino → Google Sheets**, cola o **link da folha**.
2. Carrega em **Ligar com a Google** e escolhe a conta. A conta tem de ter permissão de edição na folha.
3. Carrega em **Testar ligação**. Deve aparecer "As 40 colunas coincidem".

Também há **Criar uma folha nova com estas colunas**, para quem ainda não tem folha.

Como funciona:
- A app pede à Google uma autorização temporária (cerca de 1 hora) e escreve diretamente na folha,
  sem servidor nem script pelo meio.
- A autorização fica só na memória da sessão e expira sozinha.
- Quando expira, volta a ser pedida no toque em **Confirmar e enviar** ou **Enviar pendentes**.
- Quem pode escrever é decidido pela partilha da própria folha.

Configuração única do programador, já feita:
- projeto Google Cloud `casuistica-por-voz`, na conta Google do programador, com a Google Sheets
  API ativa;
- ecrã de autorização "Casuística por voz", **em produção** e sem verificação da Google, com
  página inicial e [política de privacidade](https://miguelferreira23.github.io/casuistica-voz/privacidade.html);
- ID de cliente OAuth "Aplicativo da Web" para `https://miguelferreira23.github.io` (e
  `http://localhost:8765` para testes). Está em `app/js/google.js`. Não é secreto: só funciona nessas
  origens.

**Quem pode usar:**
- Qualquer conta Google consegue ligar-se, mas só escreve nas folhas onde tem permissão de edição.
- Na primeira ligação aparece o aviso "A Google não validou esta app". Basta carregar em
  **Avançadas → Continuar**.
- Enquanto a app não for verificada pela Google, há um limite de **100 utilizadores** diferentes.
- Para tirar o aviso e o limite, é preciso pedir a verificação em Google Auth Platform → Central de
  verificação. Exige provar o domínio no Google Search Console e explicar o uso do acesso às folhas.

**2. Apps Script (alternativa; precisa de um computador uma vez)**
Configuração (uma vez, no computador). Os passos ilustrados com prints estão na própria app, em
**Definições → Google Sheets → Como configurar**:
1. Em <https://script.google.com>, cria um **Novo projeto** e cola o código (na app: **Copiar o código**; ou `app/Code.gs`) tal como está.
2. **Implementar → Nova implementação → App para a Web**, com "Executar como: **Eu**" e
   "Quem tem acesso: **Qualquer pessoa**".
3. Clica em **Autorizar acesso**. No aviso "A Google não validou esta app", escolhe **Avançadas → Aceder**
   e depois **Permitir**.
4. No iPhone, abre **Definições → Google Sheets** e preenche:
   - o link da folha;
   - o URL `/exec`;
   - um token, com **Gerar um token forte**.

   Depois clica em **Testar ligação**.

**Porquê "Qualquer pessoa" e se é seguro.** Este nome só quer dizer que qualquer pessoa pode *chamar*
o endereço do script; ninguém fica a ver a folha. É necessário porque o iPhone fala com o script sem a
sessão Google (o Safari bloqueia esses cookies entre sites). A segurança vem do script:
- o URL é longo e aleatório;
- só aceita pedidos com o **token**, e o primeiro token testado fica gravado;
- só escreve nas **folhas autorizadas**: a primeira testada fica gravada em `SHEETS`, e outras
  acrescentam-se à mão nas Propriedades do script;
- só acrescenta ou atualiza linhas e notas: nunca apaga e não devolve dados das linhas;
- tudo vai por HTTPS.

## Gravações

Cada ditado fica guardado no iPhone **logo que paras de gravar, antes da transcrição**. Se a transcrição
falhar ou estiver errada, a gravação continua disponível para ouvir e transcrever à mão.

Nos registos, as gravações aparecem por baixo do texto. Em cada uma podes:
- **ouvir**;
- **transcrever de novo**;
- **partilhar** (para guardar em Ficheiros, por exemplo);
- **apagar**.

Ditados de registos que nunca chegaram a ser guardados aparecem em **Registos → Gravações sem registo**.
Daí podes juntá-los ao registo que estás a criar.

## Confirmar antes de guardar

**Rever e guardar** mostra um resumo de tudo o que vai ser escrito:
- o destino (Excel ou Google Sheets);
- cada campo, com os valores sugeridos destacados;
- as notas;
- os obrigatórios em falta, com a opção de lhes juntar "… não registado".

Só depois de **Confirmar** é que o registo é guardado ou enviado.

## Campos obrigatórios e notas

Em **Definições → Campos obrigatórios**, cada cabeçalho tem um visto, guardado por destino. A sugestão
inicial ("habitual") vem do preenchimento real da casuística:

- **Sempre:** Data, Idade, Grupo Etário, Sexo, ASA, Regime, Especialidade, Diagnóstico,
  Procedimento, Duração, Destino e Caso complexo.
- **Exceto Doente Crítico:** Técnica Anestésica, Monitorização e Tipo VA.
- **Condicionais:**
  - Local fora do BO, se a especialidade for Fora do Bloco;
  - Anestesia Geral, se a técnica for Geral ou Combinada;
  - Técnica VA e Laringoscópio, se houver intubação;
  - Sucesso VA, se houver intubação ou máscara laríngea;
  - Método, intuito e sucesso, se houver neuroeixo, bloqueio, LA ou CVC.
- **Não obrigatórios:** NP (só ~15% das linhas o têm), Particularidades, Bloqueios, LA/CVC (o local),
  Cormack-Lehane, Complicações e Observações.

**Notas de célula (📝):** cada campo pode ter uma nota, como as que já existem no Excel.
- Ao **Excel** chegam como comentários; ao **Google Sheets** chegam como notas.
- Um campo obrigatório vazio **com nota** conta como justificado.
- Ao guardar com campos em falta, a app oferece "Guardar com nota", que escreve "… não registado" em cada um.
- Há notas automáticas para casos conhecidos. Por exemplo, num Doente Crítico sem técnica fica
  "Doente crítico: técnica não registada no formulário (não entra na Tabela 19)".

## Outros modelos de ficheiro

Outra folha ou ficheiro **com as mesmas colunas** (A..AN) só precisa de um **novo destino**,
sem código. O "Testar ligação" confirma se as colunas coincidem.

Um modelo com **colunas diferentes** precisa de uma definição nova no código:
- as colunas e listas em `app/js/schema.js`;
- o vocabulário de ditado em `app/js/parser.js`.

Cada destino já guarda o modelo que usa (`model`), por isso os dois modelos podem coexistir.

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
