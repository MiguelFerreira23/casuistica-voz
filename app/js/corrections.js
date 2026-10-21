// Correções de palavras que o reconhecimento de voz costuma trocar em termos da casuística.
// Aplicam-se só ao texto usado para preencher os campos; o texto ditado fica como está.
// Cada entrada: [expressão (sem acentos, minúsculas), substituição]. Os acentos são tolerados.

const RULES = [
  // ASA ("às a 4", "as a quatro", "aza 3") — não confundir com horas ("às 4 horas")
  ['(?:as a|as|aza|a s a)(?= (?:nivel )?(?:\\d|i{1,3}|iv|vi?|um|dois|tres|quatro|cinco|seis)\\b(?! ?(?:h\\b|horas?|min)))', 'ASA'],
  // idade ("e dá de 66", "edade")
  ['(?:e da de|e dade|edade)(?= \\d)', 'idade'],
  // número de processo
  ['(?:no mar|numa|numero|nomero) de processo', 'número de processo'],
  // diagnóstico
  ['(?:no )?dia que nao e (?:e|a)?stico|diag nostico|diagnostico', 'diagnóstico'],
  // procedimento
  ['vestimento|apesitimento|persidimento|precedimento|procidimento|pro cedimento|procedimento', 'procedimento'],
  // termos clínicos frequentes
  ['(?:e |ha )?uma toma(?=[\\s,.])|ematoma', 'hematoma'],
  ['anestia|anestezia', 'anestesia'],
  ['c-?s-?v-?a|ccva|sucesso v a', 'sucesso VA'],
  ['nutriciacao|nutrizacao|monitoriciacao', 'monitorização'],
  ['(?:em|in|en) guinal', 'inguinal'],
  ['fogart(?:e|y|i)?', 'Fogarty'],
  ['(?:a ?|e ?)?lanciada|balanciada|balancada', 'balanceada'],
  ['medizacao|monetizacao|monitorisacao|monitorizacao', 'monitorização'],
  ['bigmas?|biss|bies', 'BIS'],
  ['tof+e|tofe|toff', 'TOF'],
  ['mascara (?:linja|lingea|laringia|laringeia|larinja|larinjea)', 'máscara laríngea'],
  ['tipo (?:ver a|ver|de a|v a)(?= )', 'tipo VA'],
  ['cesseva|sucessa|susseso|sucesso', 'sucesso'],
  ['(?:o|u) ?cpa|u c p a', 'UCPA'],
  ['ortopedica|traumatologia', 'ortopedia'],
  ['raque(?:anestesia)?|raquia', 'raqui'],
  ['epidoral|epidurale', 'epidural'],
  ['video ?laringoscopia|video laringo|vdl', 'videolaringoscopia'],
  ['entubacao|intubassao|entubassao', 'intubação'],
];

// "a" casa com "a", "á", "à", "â", "ã"; etc.
const ACC = { a: '[aáàâã]', e: '[eéê]', i: '[ií]', o: '[oóôõ]', u: '[uúü]', c: '[cç]' };
const flex = (src) => src.replace(/\\.|\[[^\]]*\]|[aeiouc]/g, (m) => (m.length === 1 && ACC[m] ? ACC[m] : m)).replace(/ \?/g, '\\s*').replace(/ /g, '\\s+');

const COMPILED = RULES.map(([p, to]) => [new RegExp(`(?<![\\p{L}\\p{N}])(?:${flex(p)})(?![\\p{L}\\p{N}])`, 'giu'), to]);

export function correctTranscript(text) {
  let s = text || '';
  for (const [re, to] of COMPILED) s = s.replace(re, to);
  return s;
}
