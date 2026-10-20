// Converte números ditos por extenso (pt-PT/pt-BR) em algarismos.
// "sessenta e seis" -> "66"; "oito oito sete" -> "8 8 7"; "dois mil e vinte e seis" -> "2026".

export const fold = (s) =>
  s.split('').map((c) => c.normalize('NFD')[0].toLowerCase()[0] || c).join('');

const UNIT = { zero: 0, um: 1, uma: 1, dois: 2, duas: 2, tres: 3, quatro: 4, cinco: 5, seis: 6, sete: 7, oito: 8, nove: 9 };
const TEEN = { dez: 10, onze: 11, doze: 12, treze: 13, catorze: 14, quatorze: 14, quinze: 15, dezasseis: 16, dezesseis: 16, dezassete: 17, dezessete: 17, dezoito: 18, dezanove: 19, dezenove: 19 };
const TEN = { vinte: 20, trinta: 30, quarenta: 40, cinquenta: 50, sessenta: 60, setenta: 70, oitenta: 80, noventa: 90 };
const HUNDRED = { cem: 100, cento: 100, duzentos: 200, duzentas: 200, trezentos: 300, trezentas: 300, quatrocentos: 400, quatrocentas: 400, quinhentos: 500, quinhentas: 500, seiscentos: 600, seiscentas: 600, setecentos: 700, setecentas: 700, oitocentos: 800, oitocentas: 800, novecentos: 900, novecentas: 900 };

function kindOf(w) {
  if (w in UNIT) return ['unit', UNIT[w]];
  if (w in TEEN) return ['teen', TEEN[w]];
  if (w in TEN) return ['ten', TEN[w]];
  if (w in HUNDRED) return ['hundred', HUNDRED[w]];
  if (w === 'mil') return ['thousand', 1000];
  return null;
}

// Que tipos podem seguir cada tipo (com "e" pelo meio, ou diretamente).
const AFTER_E = { hundred: ['ten', 'teen', 'unit'], ten: ['unit'], thousand: ['hundred', 'ten', 'teen', 'unit'] };
const DIRECT = { hundred: [], thousand: ['hundred'], unit: ['thousand'], teen: ['thousand'], ten: ['thousand'] };

export function wordsToDigits(text) {
  const tokens = text.match(/[\p{L}\p{N}]+|[^\p{L}\p{N}]+/gu) || [];
  const out = [];
  let i = 0;
  const isWord = (t) => t && /^[\p{L}\p{N}]/u.test(t);
  const isSpace = (t) => t && /^\s+$/.test(t);
  while (i < tokens.length) {
    const t = tokens[i];
    const k = isWord(t) ? kindOf(fold(t)) : null;
    // "um"/"uma" só conta como número antes de unidades de medida ou junto de outros números
    // ("uma hora", "um dois três"), para não converter o artigo ("um doente").
    const isArticle = (fold(t) === 'um' || fold(t) === 'uma') &&
      !/^\s+(hora|horas|ano|anos|mes|meses|dia|dias|semana|semanas|minuto|minutos|mil)\b/.test(fold(tokens.slice(i + 1, i + 3).join(''))) &&
      !(isSpace(tokens[i + 1]) && tokens[i + 2] && (/^\d/.test(tokens[i + 2]) || kindOf(fold(tokens[i + 2])))) &&
      !(isSpace(out[out.length - 1]) && /^\d+$/.test(out[out.length - 2] || ''));
    if (!k || isArticle) {
      out.push(t);
      i++;
      continue;
    }
    let total = 0;
    let cur = k[1];
    let last = k[0];
    if (last === 'thousand') { total = 1000; cur = 0; }
    let j = i + 1;
    for (;;) {
      // tentar "<espaço> e <espaço> palavra"
      if (isSpace(tokens[j]) && tokens[j + 1] && fold(tokens[j + 1]) === 'e' && isSpace(tokens[j + 2]) && isWord(tokens[j + 3])) {
        const k2 = kindOf(fold(tokens[j + 3]));
        if (k2 && (AFTER_E[last] || []).includes(k2[0])) {
          if (k2[0] === 'thousand') { total = (cur || 1) * 1000; cur = 0; } else cur += k2[1];
          last = k2[0];
          j += 4;
          continue;
        }
      }
      // tentar "<espaço> palavra" diretamente
      if (isSpace(tokens[j]) && isWord(tokens[j + 1])) {
        const k2 = kindOf(fold(tokens[j + 1]));
        if (k2 && (DIRECT[last] || []).includes(k2[0])) {
          if (k2[0] === 'thousand') { total = (cur || 1) * 1000; cur = 0; } else cur += k2[1];
          last = k2[0];
          j += 2;
          continue;
        }
      }
      break;
    }
    out.push(String(total + cur));
    i = j;
  }
  return out.join('');
}
