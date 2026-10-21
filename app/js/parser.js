// Interpreta o texto ditado e preenche os campos da casuística.
// Tudo corre localmente: regras + dicionário de sinónimos, sem serviços externos.

import { fold, wordsToDigits } from './numbers.js';
import { correctTranscript } from './corrections.js';
import { LISTS, COLUMNS, ageGroup, todayIso } from './schema.js';

// ---------------------------------------------------------------------------
// Dicionário. Padrões escritos em minúsculas e sem acentos.
// "+" num padrão aceita "+", "mais", "com" ou "e".

const PLUS = '\\s*(?:\\+|mais|com|e)\\s*';
const src = (p) => p.replace(/\+/g, PLUS).replace(/ /g, '\\s+');

// Etiquetas: palavras-chave que introduzem um campo ou um contexto.
// free: o valor é o texto que se segue (short = termina no próximo termo conhecido ou ponto final).
const LABELS = [
  { key: 'diag', free: true, short: true, p: '(?:diagnosticos?|dx|com quadro de|por quadro de|admitid[oa] por|internad[oa] por)(?: (?:de|do|da|foi|e))?' },
  { key: 'proc', free: true, short: true, p: '(?:procedimentos?|intervencao|operacao|cirurgia realizada|cirurgia efetuada|proposto para|proposta para|submetid[oa] a|realizou-se|realizad[oa])(?: (?:de|do|da|foi|e))?' },
  { key: 'part', free: true, p: '(?:particularidades?|antecedentes(?: pessoais)?|comorbilidades|de notar)' },
  { key: 'compl', free: true, p: '(?:complicac(?:ao|oes)|intercorrencias?)' },
  { key: 'obs', free: true, p: '(?:observac(?:ao|oes)|obs|notas?)' },
  // contextos / terminadores
  { key: 'np', p: '(?:numero (?:de |do )?processo|n (?:de )?processo|processo|np|n p)' },
  { key: 'idade', p: 'idade' },
  { key: 'sexo', p: 'sexo' },
  { key: 'asa', p: 'asa(?= (?:nivel|grau|classe|\\d|i|ii|iii|iv|v|vi)\\b)' },
  { key: 'regime', p: 'regime' },
  { key: 'esp', p: 'especialidade' },
  { key: 'local', ctx: 'local', p: 'local(?: fora do (?:bo|bloco))?' },
  { key: 'dur', p: '(?:duracao|durou|demorou)' },
  { key: 'tec', p: 'tecnica(?: anestesica)?' },
  { key: 'monit', p: 'monitorizac(?:ao|oes)' },
  { key: 'va', ctx: 'va', p: '(?:via aerea|abordagem da via aerea)' },
  { key: 'neuro', ctx: 'neuro', p: 'neuroeixo' },
  { key: 'bp', ctx: 'bp', p: '(?:bloqueios?(?: perifericos?| de nervos? perifericos?| de nervo)?)' },
  { key: 'la', ctx: 'la', p: '(?:linha arterial|cateter arterial|cateterizacao arterial|arterial)' },
  { key: 'cvc', ctx: 'cvc', p: '(?:cvc|cateter venoso central|cateter central|acesso venoso central|acesso central|cateter venoso)' },
  { key: 'destino', ctx: 'destino', p: '(?:destino|(?:vai|foi|seguiu|segue|saiu|sai|transferid[oa]|teve alta) (?:para|pra)(?: (?:a|o))?)' },
  { key: 'complexo', p: 'caso' },
  { key: 'data', p: '(?:data|dia)' },
];

// Regras de valores. set: campos a preencher. ctx: contexto que a menção abre.
// amb: valor que depende do contexto atual. weak: só vale imediatamente após a etiqueta do contexto.
const R = [];
const rule = (p, set, extra = {}) => R.push({ p, set, ...extra });

// Ruído: expressões que não devem ser interpretadas como outra coisa.
rule('(?:hipertensao|tensao|pressao) arterial(?! invasiva)', {});
rule('estado geral', {});
rule('anestesia local', {});

// Sexo
rule('(?:sexo )?masculino|homem|senhor|rapaz|menino|miudo', { sexo: 'Masculino' });
rule('(?:sexo )?feminino|mulher|senhora|rapariga|menina|miuda|gravida|gestante|puerpera|parturiente', { sexo: 'Feminino' });

// Regime
rule('urgencia|urgente|emergente', { regime: 'Urgência' });
rule('(?:cirurgia )?(?:programad[oa]|eletiv[oa]|electiv[oa])', { regime: 'Internamento (programada)' });
rule('ambulatori[oa]', { regime: 'Ambulatório (programada)' });

// Especialidade
rule('cirurgia geral', { esp: 'Cirurgia Geral' });
rule('cirurgia pediatrica|pediatrica', { esp: 'Cirurgia Pediátrica' });
rule('cirurgia plastica|plastica|queimados', { esp: 'Cirurgia Plástica' });
rule('cirurgia vascular|vascular', { esp: 'Cirurgia Vascular' });
rule('ginecologia(?: ?(?:/|e) ?obstetricia)?|obstetricia|gineco|obstetra|cesariana|parto', { esp: 'Ginecologia/Obstetrícia' });
rule('neurocirurgia|neuro', { esp: 'Neurocirurgia' });
rule('oftalmologia|oftalmo', { esp: 'Oftalmologia' });
rule('orl|otorrino(?:laringologia)?', { esp: 'ORL' });
rule('ortopedia|orto|traumatologia', { esp: 'Ortopedia' });
rule('urologia|uro', { esp: 'Urologia' });
rule('fora do (?:bloco|bo)', { esp: 'Fora do Bloco' });
rule('(?:unidade de )?tecnicas de gastro(?:enterologia)?|gastroenterologia|gastro|endoscopia|eda|cpre|colonoscopia|ecoendoscopia', { esp: 'Fora do Bloco', local: 'Gastroenterologia' });
rule('doente critico|emergencia interna|equipa de emergencia|via verde(?: avc| coronaria| trauma)?', { esp: 'Doente Crítico' });

// Local fora do BO
rule('uci pediatrica|ucip|cuidados intensivos pediatricos', { local: 'UCI Pediátrica' });
rule('servico de urgencia|sala de emergencia|sala de reanimacao|reanimacao|su', { local: 'Serviço de Urgência' });
rule('imagiologia|radiologia|neurorradiologia|angiografia|tac|ressonancia', { local: 'Imagiologia' });
rule('uci|smi|cuidados intensivos|medicina intensiva', null, { amb: { destino: { destino: 'UCI' }, local: { local: 'UCI' }, _: { _uci: 'UCI' } } });
rule('enfermaria', null, { amb: { destino: { destino: 'Enfermaria' }, local: { local: 'Enfermaria' }, _: { _uci: 'Enfermaria' } } });

// Destino
rule('ucpa|recobro|unidade de cuidados pos-? ?anestesicos', { destino: 'UCPA' });
rule('sala de observacao', { destino: 'SO' });
rule('so|s o', null, { weak: true, amb: { destino: { destino: 'SO' } } });
rule('buc', { destino: 'BUC' });
rule('obito|faleceu|morreu', { destino: 'Óbito' });

// Técnica anestésica
rule('anestesia geral|geral', { tec: 'Geral' });
rule('anestesia regional|regional', { tec: 'Regional' });
rule('anestesia combinada|combinada', { tec: 'Combinada' });
rule('sedacao|sedoanalgesia|sedad[oa]|sedar', { tec: 'Sedoanalgesia' });
rule('monitorizacao anestesica|cam|cuidados anestesicos monitorizados|vigilancia anestesica', { tec: 'Monitorização (CAM)' });

// Anestesia geral
rule('(?:anestesia )?(?:geral )?balanceada', { ag: 'Balanceada', tec: 'Geral' });
rule('(?:anestesia )?(?:geral )?endovenosa(?: total)?|tiva|tci', { ag: 'Endovenosa', tec: 'Geral' });
rule('(?:anestesia )?(?:geral )?inalatoria', { ag: 'Inalatória', tec: 'Geral' });

// Neuroeixo
rule('raqui(?:anestesia)?|raquidiana|(?:bloqueio )?subaracnoideu|subaracnoideia|bsa', { neuro: 'Bloqueio Subaracnoideu' }, { ctx: 'neuro' });
rule('(?:epidural|peridural) lombar', { neuro: 'Epidural Lombar' }, { ctx: 'neuro' });
rule('(?:epidural|peridural) toracica', { neuro: 'Epidural Torácica' }, { ctx: 'neuro' });
rule('epidural|peridural', { neuro: 'Epidural Lombar' }, { ctx: 'neuro', guess: ['neuro'] });
rule('sequencial|combinada sequencial|raqui ?-?epidural|epidural e raqui|cse', { neuro: 'Sequencial' }, { ctx: 'neuro' });

// Bloqueios periféricos
const bp = (p, v) => rule(p, { _bp: v }, { ctx: 'bp' });
bp('(?:bloqueio )?(?:do )?(?:plano )?(?:do )?transverso do abdomen|transverso abdominal|tap', 'Plano do Transverso do Abdómen (TAP)');
bp('(?:bloqueio )?(?:da )?bainha dos re(?:c)?tos|bainha dos re(?:c)?tos', 'Bainha dos Retos');
bp('(?:bloqueio )?(?:do )?(?:plano )?(?:do )?(?:eretor|erector) da espinha|erector spinae|esp', 'Eretor da Espinha');
bp('(?:bloqueio )?(?:do )?(?:plano )?serratus(?: anterior)?|serratil', 'Plano Serratus Anterior');
bp('(?:bloqueio )?paravertebral', 'Paravertebral');
bp('(?:bloqueio )?(?:do )?(?:plexo braquial )?(?:via )?interescalenic[oa]|interescaleno', 'Plexo braquial - Interescalénico');
bp('(?:bloqueio )?(?:do )?(?:plexo braquial )?(?:via )?supra-? ?clavicular', 'Plexo braquial - Supraclavicular');
bp('(?:bloqueio )?(?:do )?(?:plexo braquial )?(?:via )?infra-? ?clavicular', 'Plexo braquial - Infraclavicular');
bp('(?:bloqueio )?(?:do )?plexo braquial (?:via )?axilar', 'Plexo braquial - Axilar');
bp('(?:bloqueio )?(?:da )?fascia -?iliaca|ficb|iliaca', 'Fáscia Ilíaca');
bp('(?:bloqueio )?(?:do )?(?:nervo )?ciatico popliteu|(?:ciatico )?popliteo|popliteu|ciatico', 'Ciático Poplíteu');
bp('(?:bloqueio )?(?:do )?canal dos adutores|adutores|safeno', 'Canal dos adutores');
rule('bloqueio femoral|bloqueio do nervo femoral', { _bp: 'Femoral' }, { ctx: 'bp' });
rule('femoral', null, { amb: { la: { la: 'Femoral' }, cvc: { cvc: 'Femoral' }, bp: { _bp: 'Femoral' }, _: { _bp: 'Femoral' } } });
rule('axilar', null, { amb: { cvc: { cvc: 'Axilar' }, bp: { _bp: 'Plexo braquial - Axilar' }, _: { _bp: 'Plexo braquial - Axilar' } } });

// Monitorização
rule('bis|indice bispectral|profundidade anestesica', { _m: 'BIS' });
rule('tof|train of four|monitorizacao (?:do )?bloqueio neuromuscular', { _m: 'TOF' });
rule('pai|pressao arterial invasiva|pa invasiva|tensao arterial invasiva', { _m: 'PAI' }, { ctx: 'la' });
rule('pvc|pressao venosa central', { _m: 'PVC' });
rule('monitorizacao (?:standard|basica|asa|padrao)|standard asa|monitorizacao asa', { _m: 'ASA' });

// Via aérea
rule('ventilacao espontanea|respiracao espontanea|espontanea|oculos nasais', { tva: 'Ventilação Espontânea' }, { ctx: 'va' });
rule('mascara facial', { tva: 'Máscara Facial' }, { ctx: 'va' });
rule('mascara laringea|mascara laringeia|ml|lma|dispositivo supraglotico|supraglotico', { tva: 'Máscara Laríngea' }, { ctx: 'va' });
rule('i ?-?gel|igel|aigel|ai gel', { tva: 'Máscara Laríngea', laring: 'i-Gel' }, { ctx: 'va' });
rule('(?:lma )?supreme', { tva: 'Máscara Laríngea', laring: 'LMA Supreme' }, { ctx: 'va' });
rule('(?:intubacao|entubacao) (?:oro-? ?traqueal|endotraqueal)|iot|tot|tubo orotraqueal|intubad[oa]|entubad[oa]|intubacao|entubacao|intubei|entubei|intubar|entubar', { tva: 'Intubação Orotraqueal' }, { ctx: 'va' });
rule('(?:intubacao|entubacao) (?:naso-? ?traqueal|nasal)|nasotraqueal', { tva: 'Intubação Nasotraqueal' }, { ctx: 'va' });
rule('traqueostomia|traqueotomia|traqueostomizad[oa]', { tva: 'Traqueostomia' }, { ctx: 'va' });
rule('laringoscopia dire(?:c)?ta|laringoscopia convencional', { tecva: 'Laringoscopia direta' }, { ctx: 'va' });
rule('videolaringoscopi[ao]|video-? ?laringoscopi[ao]|vdl|videolaringo|glidescope|mcgrath|airtraq|c-? ?mac', { tecva: 'Videolaringoscopia', laring: 'Videolaringoscópio' }, { ctx: 'va' });
rule('(?:videolaringoscopi[ao]|video-? ?laringoscopi[ao]|vdl|glidescope|mcgrath|c-? ?mac)+(?:condutor|bougie|estilete|guia|frova)', { tecva: 'Videolaringoscopia', laring: 'Videolaringoscópio + Condutor' }, { ctx: 'va' });
rule('(?:laringoscopio )?(?:macintosh|mackintosh|mcintosh)|laringoscopio mac', { laring: 'Macintosh' }, { ctx: 'va' });
rule('(?:laringoscopio )?(?:macintosh|mackintosh|mcintosh|mac)+(?:condutor|bougie|estilete|guia)', { laring: 'Macintosh + Condutor' }, { ctx: 'va' });
rule('(?:laringoscopio )?(?:macintosh|mackintosh|mcintosh|mac)+frova|frova', { laring: 'Macintosh + Frova' }, { ctx: 'va' });
rule('mccoy|mc coy|mac coy|maccoy', { laring: 'McCoy' }, { ctx: 'va' });
rule('condutor|bougie|estilete', { _cond: 1 }, { ctx: 'va' });
rule('fibroscopia (?:vigil|acordad[oa]|awake)|(?:intubacao|entubacao) (?:vigil|acordad[oa])|fibro vigil|awake', { tecva: 'Fibroscopia vigil' }, { ctx: 'va' });
rule('fibroscopia|fibroscopio|broncofibroscopio|fibrotica', { tecva: 'Fibroscopia' }, { ctx: 'va' });

// Linha arterial e CVC (locais)
rule('(?:artéria )?radial', { la: 'Radial' }, { ctx: 'la' });
rule('umeral|braquial', { la: 'Umeral' }, { ctx: 'la' });
rule('cubital', { la: 'Cubital' }, { ctx: 'la' });
rule('(?:veia )?jugular(?: interna)?', { cvc: 'Jugular interna' }, { ctx: 'cvc' });
rule('(?:veia )?subclavia', { cvc: 'Subclávia' }, { ctx: 'cvc' });

// Método / intuito / sucesso: dependem do contexto (neuroeixo, bloqueio, VA, LA, CVC).
rule('ecoguiad[oa]|eco-? ?guiad[oa]|guiad[oa] por (?:eco(?:grafia)?|ultrassons?)|com eco(?:grafia)?|ecografia|eco', { _met: 'Ecoguiado' });
rule('referencias? anatomicas?|anatomic[oa]|por palpacao|palpacao|as cegas|landmarks?', { _met: 'Referências Anatómicas' });
rule('(?:intuito |finalidade |para )?analgesic[oa]|(?:para )?analgesia', { _int: 'Analgésico' });
rule('(?:intuito |finalidade )?anestesic[oa]|(?:intuito )?cirurgic[oa]|anestesia cirurgica', { _int: 'Anestésico' });
rule('(?:com )?sucesso|conseguid[oa]|consegui|eficaz|bem sucedid[oa]|(?:a |na )?primeira(?: tentativa)?', { _suc: 'Sucesso' });
rule('insucesso|sem sucesso|falhou|falhad[oa]|falha|nao consegui|nao conseguid[oa]|ineficaz', { _suc: 'Insucesso' });
rule('observad[oa]|observei|so observei|vi fazer|assisti', { _suc: 'Observado' });
rule('com ajuda|ajudad[oa]', { _suc: 'Sucesso', _note: 'com ajuda' });
rule('nao (?:foi )?(?:a|na) primeira|(?:a |na )?segunda tentativa|varias tentativas', { _suc: 'Sucesso', _note: 'não à primeira' });

// Caso complexo
rule('caso complexo|complexo', { complexo: 'Sim' });
rule('caso complexo nao|caso nao complexo|nao complexo|nao e complexo|caso simples|caso sem complexidade', { complexo: 'Não' });

// Complicações frequentes ditas sem etiqueta
rule('sem (?:complicac(?:ao|oes)|intercorrencias?|incidentes)|nao houve complicac(?:ao|oes)', { _nocompl: 1 });
const COMPL = ['Hipotensão grave', 'Choque', 'Broncospasmo', 'Laringospasmo', 'Dessaturação', 'Bradicardia', 'Anafilaxia', 'Aspiração', 'Paragem cardiorrespiratória', 'Taquicardia supraventricular', 'Fibrilhação auricular', 'Hemorragia massiva'];
for (const c of COMPL) rule(fold(c).replace(/ /g, ' '), { _compl: c });
rule('choque (?:hemorragico|septico|hipovolemico|cardiogenico)', null, { completeAs: '_compl' });

// ---------------------------------------------------------------------------

const B = '(?<![\\p{L}\\p{N}])';
const E = '(?![\\p{L}\\p{N}])';
const compile = (p) => new RegExp(B + '(?:' + src(p) + ')' + E, 'gu');
for (const l of LABELS) l.re = compile(l.p);
for (const r of R) r.re = compile(r.p);

const CTX_FIELDS = {
  neuro: { met: 'neuroMet', int: 'neuroInt', suc: 'neuroSuc', name: 'neuroeixo' },
  bp: { met: 'bpMet', int: 'bpInt', suc: 'bpSuc', name: 'bloqueio' },
  la: { met: 'laMet', suc: 'laSuc', name: 'LA' },
  cvc: { met: 'cvcMet', suc: 'cvcSuc', name: 'CVC' },
  va: { suc: 'sucva', name: 'VA' },
};
const CTX_OF_FIELD = { neuro: 'neuro', _bp: 'bp', la: 'la', cvc: 'cvc', tva: 'va', tecva: 'va', laring: 'va', cl: 'va' };

const MONTHS = ['janeiro', 'fevereiro', 'marco', 'abril', 'maio', 'junho', 'julho', 'agosto', 'setembro', 'outubro', 'novembro', 'dezembro'];
const ROMAN = { 1: 'I', 2: 'II', 3: 'III', 4: 'IV', 5: 'V', 6: 'VI', i: 'I', ii: 'II', iii: 'III', iv: 'IV', v: 'V', vi: 'VI' };

function allMatches(re, s) {
  re.lastIndex = 0;
  const out = [];
  let m;
  while ((m = re.exec(s))) {
    out.push({ start: m.index, end: m.index + m[0].length, m });
    if (m[0].length === 0) re.lastIndex++;
  }
  return out;
}

const cleanFree = (s) => s.replace(/^[\s,.;:–-]+/, '').replace(/[\s,;:–-]+$/, '').replace(/\.$/, '').trim();

/**
 * @param {string} text  texto ditado
 * @param {{today?: string}} opts  data de hoje em ISO (para testes)
 * @returns {{values: object, origin: object, why: object, notes: string[]}}
 *   origin: 'voz' (mencionado) | 'sug' (sugerido, com o motivo em why)
 */
export function parse(text, opts = {}) {
  const today = opts.today || todayIso();
  const values = Object.fromEntries(COLUMNS.map((c) => [c.key, '']));
  const origin = {};
  const why = {};
  const notes = [];
  const set = (k, v, o = 'voz') => { values[k] = v; origin[k] = o; };

  const pre = wordsToDigits(correctTranscript(text || ''));
  const f = fold(pre);
  // m: igual a f mas sem pontuação (mesmo comprimento, mesmas posições)
  const m = f.replace(/[^\p{L}\p{N}+/\-\s]/gu, ' ');

  // 1. etiquetas e regras, maior correspondência primeiro, sem sobreposição
  const hits = [];
  for (const l of LABELS) for (const h of allMatches(l.re, m)) hits.push({ ...h, label: l });
  for (const r of R) for (const h of allMatches(r.re, m)) hits.push({ ...h, rule: r });
  hits.sort((a, b) => (b.end - b.start) - (a.end - a.start) || a.start - b.start);
  const taken = [];
  const free = (s, e) => taken.every((t) => e <= t.start || s >= t.end);
  const accepted = [];
  for (const h of hits) if (free(h.start, h.end)) { taken.push(h); accepted.push(h); }
  accepted.sort((a, b) => a.start - b.start);

  // 2. extratores numéricos (posições usadas como terminadores do texto livre)
  const ext = extract(m, f, today);

  // 3. texto livre: do fim da etiqueta até à próxima etiqueta (ou termo/ponto, se "short")
  const freeSpans = [];
  const labelHits = accepted.filter((h) => h.label);
  for (const h of labelHits) {
    if (!h.label.free) continue;
    if (freeSpans.some((s) => h.start >= s.start && h.start < s.end)) continue;
    if (h.label.key === 'compl' && /sem\s+$/.test(m.slice(Math.max(0, h.start - 5), h.start))) continue;
    let end = pre.length;
    for (const o of labelHits) if (o.start >= h.end && o.start < end) { end = o.start; break; }
    let keepRules = false;
    if (h.label.short) {
      const firstRule = accepted.find((o) => o.rule && o.start >= h.end && o.start < end && (o.rule.amb || Object.keys(o.rule.set || {}).length !== 0));
      // termo conhecido logo a seguir à etiqueta ("procedimento entubação"): o texto vai até à pontuação
      // e o termo continua a contar para o seu campo
      if (firstRule && !/\S/.test(m.slice(h.end, firstRule.start))) {
        keepRules = true;
        const stop = m.slice(h.end, end).search(/[,;.]|\s(?:e|com|sob)\s/);
        const p2 = f.slice(h.end, end).search(/[,;.]/);
        if (p2 >= 0) end = h.end + p2;
        else if (stop >= 0) end = h.end + stop;
      } else if (firstRule) end = firstRule.start;
      for (const e of ext.spans) if (e.start >= h.end && e.start < end) end = e.start;
      // ignora a pontuação logo a seguir à etiqueta ("diagnóstico. hematoma…")
      const lead = f.slice(h.end, end).match(/^[\s,.;:–-]*/)[0].length;
      const dot = f.slice(h.end + lead, end).search(/[.;\n](?:\s|$)/);
      if (dot >= 0) end = h.end + lead + dot;
    }
    const value = cleanFree(pre.slice(h.end, end));
    freeSpans.push({ start: h.end, end, key: h.label.key, keepRules });
    if (value) {
      const prev = values[h.label.key];
      set(h.label.key, prev && prev !== value ? `${prev}; ${value}` : value);
    }
  }
  const inFree = (pos) => freeSpans.some((s) => !s.keepRules && pos >= s.start && pos < s.end);

  // 4. aplicar regras na ordem do texto, com contexto
  let ctx = null; // { name, pos }
  const ctxSeen = new Set();
  const bps = [];
  const mon = new Set();
  const compl = [];
  let cond = false;
  let uciPending = null;
  const pendingCtx = []; // método/sucesso ditos antes de qualquer contexto
  const notesByCtx = {};

  const applyCtxField = (kind, val, c, note) => {
    const fields = CTX_FIELDS[c];
    if (!fields) return false;
    if (kind && fields[kind]) set(fields[kind], val);
    else if (kind) return false;
    if (note) (notesByCtx[c] = notesByCtx[c] || new Set()).add(note);
    return true;
  };

  for (const h of accepted) {
    if (inFree(h.start)) continue;
    if (h.label) {
      if (h.label.ctx) { ctx = { name: h.label.ctx, pos: h.end }; ctxSeen.add(h.label.ctx); }
      continue;
    }
    const r = h.rule;
    let s = r.set;
    if (r.amb) {
      const near = ctx && h.start - ctx.pos <= 30;
      if (r.weak) s = ctx && near ? r.amb[ctx.name] : null;
      else s = (ctx && r.amb[ctx.name]) || r.amb._;
      if (!s) continue;
    }
    if (r.completeAs) { compl.push(cleanFree(pre.slice(h.start, h.end)).replace(/^./, (c) => c.toUpperCase())); continue; }
    if (r.ctx) { ctx = { name: r.ctx, pos: h.end }; ctxSeen.add(r.ctx); }
    for (const [k, v] of Object.entries(s)) {
      if (k === '_bp') { if (!bps.includes(v)) bps.push(v); ctxSeen.add('bp'); ctx = { name: 'bp', pos: h.end }; }
      else if (k === '_m') mon.add(v);
      else if (k === '_cond') cond = true;
      else if (k === '_uci') uciPending = v;
      else if (k === '_compl') { if (!compl.includes(v)) compl.push(v); }
      else if (k === '_nocompl') set('compl', '', 'voz');
      else if (k === '_note') { /* tratado com _suc */ }
      else if (k === '_met' || k === '_int' || k === '_suc') {
        const kind = k.slice(1);
        const note = s._note;
        if (!ctx || !applyCtxField(kind, v, ctx.name, kind === 'suc' ? note : null)) pendingCtx.push({ kind, v, note });
      } else {
        if (k in CTX_OF_FIELD) ctxSeen.add(CTX_OF_FIELD[k]);
        set(k, v);
      }
    }
  }

  // 5. extratores
  if (ext.np) set('np', ext.np);
  if (ext.idade !== undefined) set('idade', ext.idade);
  if (ext.asa) set('asa', ext.asa);
  if (ext.data) set('data', ext.data);
  if (ext.dur) set('dur', ext.dur);
  if (ext.cl) { set('cl', ext.cl); ctxSeen.add('va'); }

  // 6. combinar e deduzir
  if (bps[0]) set('bp1', bps[0]);
  if (bps[1]) set('bp2', bps[1]);
  if (bps.length > 2) notes.push(`Foram ditos ${bps.length} bloqueios; só cabem 2 (${bps.slice(2).join(', ')} ficou de fora).`);

  if (uciPending) {
    if (!values.destino) set('destino', uciPending);
    else if (!values.local) set('local', uciPending);
  }

  // método/sucesso ditos sem contexto: atribuir ao único procedimento existente
  if (pendingCtx.length) {
    const present = ['va', 'neuro', 'bp', 'la', 'cvc'].filter((c) => ctxSeen.has(c));
    for (const p of pendingCtx) {
      const target = present.find((c) => CTX_FIELDS[c][p.kind]);
      if (present.length === 1 && target) applyCtxField(p.kind, p.v, target, p.kind === 'suc' ? p.note : null);
      else notes.push(`"${p.v}" foi dito mas não percebi a que técnica se refere.`);
    }
  }

  if (cond) {
    if (values.laring === 'Macintosh') set('laring', 'Macintosh + Condutor');
    else if (values.laring === 'Videolaringoscópio') set('laring', 'Videolaringoscópio + Condutor');
    else if (!values.laring) { set('laring', 'Macintosh + Condutor', 'sug'); why.laring = 'Foi mencionado condutor sem dizer o laringoscópio'; }
  }

  // observações automáticas ("VA com ajuda", "BSA não à primeira")
  const autoObs = [];
  for (const [c, set_] of Object.entries(notesByCtx)) {
    let name = CTX_FIELDS[c].name;
    if (c === 'neuro') name = values.neuro === 'Bloqueio Subaracnoideu' ? 'BSA' : (values.neuro || 'neuroeixo');
    for (const n of set_) autoObs.push(`${name} ${n}`);
  }
  if (autoObs.length) {
    const joined = autoObs.join('; ');
    set('obs', values.obs ? `${joined}; ${values.obs}` : joined);
  }

  if (compl.length && origin.compl !== 'voz') set('compl', compl.join(', '));
  else if (compl.length && values.compl) {
    const extra = compl.filter((c) => !fold(values.compl).includes(fold(c)));
    if (extra.length) set('compl', `${values.compl}, ${extra.join(', ')}`);
  }

  inferDefaults(values, origin, why, { mon, ctxSeen }, notes);
  applyDefaults(values, origin, why, today);
  return { values, origin, why, notes, transcriptNormalized: pre };
}

// ---------------------------------------------------------------------------
// Extratores de números, datas e durações

function extract(m, f, today) {
  const out = { spans: [] };
  const add = (start, end) => out.spans.push({ start, end });

  // NP
  {
    const re = /(?<![\p{L}\p{N}])(?:numero (?:de |do )?processo|n (?:de )?processo|processo|np|n p)\s*(?:e|:|de|numero|n)?\s*((?:\d+\s*)+)/gu;
    let x;
    while ((x = re.exec(m))) {
      // não engolir o número seguinte se for uma idade ("1234567 66 anos")
      const groups = x[1].trim().split(/\s+/);
      const after = m.slice(x.index + x[0].length);
      if (groups.length > 1 && /^\s*(anos?|meses|mes|dias?)\b/.test(after)) groups.pop();
      const digits = groups.join('');
      if (digits.length >= 3) { out.np = digits; add(x.index, x.index + x[0].length); }
    }
  }

  // Idade
  {
    const conv = (n, unit) => {
      n = Number(n);
      if (!unit || /^ano/.test(unit)) return n;
      if (/^mes/.test(unit)) return Math.round((n / 12) * 100) / 100;
      if (/^semana/.test(unit)) return Math.round(((n * 7) / 365.25) * 1000) / 1000;
      if (/^dia/.test(unit)) return Math.round((n / 365.25) * 1000) / 1000;
      if (/^hora/.test(unit)) return 0;
      return n;
    };
    const re1 = /(?<![\p{L}\p{N}])idade\s*(?:de|e|:)?\s*(\d{1,3})(?:\s*(anos?|meses|mes|semanas?|dias?|horas?))?/gu;
    let x = re1.exec(m);
    if (x) { out.idade = conv(x[1], x[2]); add(x.index, x.index + x[0].length); }
    else {
      const re2 = /(?<![\p{L}\p{N}])(\d{1,3})\s*(anos?|meses|semanas?|dias?)(?:\s+de\s+idade)?(?![\p{L}\p{N}])/gu;
      while ((x = re2.exec(m))) {
        const before = m.slice(Math.max(0, x.index - 12), x.index);
        if (/(?:(?<![\p{L}\p{N}])(?:ha|desde|apos|durante|\d+\s*a)|[<>])\s*$/u.test(before)) continue; // "há 2 anos", "1 a 3 anos"
        out.idade = conv(x[1], x[2]);
        add(x.index, x.index + x[0].length);
        break;
      }
    }
  }

  // ASA
  {
    const re = /(?<![\p{L}\p{N}])asa\s*(?:nivel|grau|classe|de)?\s*(\d|vi|v|iv|iii|ii|i)(?:\s*e)?(?![\p{L}\p{N}])/gu;
    let x;
    while ((x = re.exec(m))) { const r = ROMAN[x[1]]; if (r) { out.asa = r; add(x.index, x.index + x[0].length); } }
  }

  // Data
  {
    const base = new Date(today + 'T12:00:00');
    const iso = (d) => `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
    const mk = (d, mo, y) => {
      let year = y ? Number(y) : base.getFullYear();
      if (year < 100) year += 2000;
      const dt = new Date(year, mo - 1, d, 12);
      if (dt.getMonth() !== mo - 1) return null;
      if (!y && dt > base) dt.setFullYear(year - 1);
      return iso(dt);
    };
    let x;
    const reNum = /(?<![\p{L}\p{N}])(\d{1,2})\s*[/.-]\s*(\d{1,2})(?:\s*[/.-]\s*(\d{2,4}))?(?![\p{L}\p{N}])/gu;
    const reTxt = new RegExp(`(?<![\\p{L}\\p{N}])(?:dia\\s+)?(\\d{1,2})\\s+(?:de\\s+)?(${MONTHS.join('|')})(?:\\s+(?:de\\s+)?(\\d{4}))?`, 'gu');
    if ((x = reTxt.exec(m))) { out.data = mk(+x[1], MONTHS.indexOf(x[2]) + 1, x[3]); add(x.index, x.index + x[0].length); }
    else if ((x = reNum.exec(f)) && /(?:data|dia)\s*$/.test(m.slice(Math.max(0, x.index - 8), x.index)) || (x && x[3])) { out.data = mk(+x[1], +x[2], x[3]); add(x.index, x.index + x[0].length); }
    else if ((x = /(?<![\p{L}\p{N}])anteontem(?![\p{L}\p{N}])/u.exec(m))) { const d = new Date(base); d.setDate(d.getDate() - 2); out.data = iso(d); add(x.index, x.index + x[0].length); }
    else if ((x = /(?<![\p{L}\p{N}])ontem(?![\p{L}\p{N}])/u.exec(m))) { const d = new Date(base); d.setDate(d.getDate() - 1); out.data = iso(d); add(x.index, x.index + x[0].length); }
    else if ((x = /(?<![\p{L}\p{N}])hoje(?![\p{L}\p{N}])/u.exec(m))) { out.data = today; add(x.index, x.index + x[0].length); }
    else if ((x = /(?<![\p{L}\p{N}])(?:data|dia)\s+(?:de\s+)?(\d{1,2})(?![\p{L}\p{N}])(?!\s*(?:de\s+)?(?:anos?|horas?|h|min|minutos|dias?|meses))/u.exec(m))) {
      const d = new Date(base); d.setDate(+x[1]);
      if (d > base) d.setMonth(d.getMonth() - 1);
      if (+x[1] >= 1 && +x[1] <= 31) { out.data = iso(d); add(x.index, x.index + x[0].length); }
    }
    if (out.data === null) delete out.data;
  }

  // Duração
  {
    let x;
    const lab = '(?:duracao|durou|demorou|cirurgia de|procedimento de)?\\s*(?:de|foi|cerca de|aproximadamente|uns|umas)?\\s*';
    if ((x = new RegExp(`(?<![\\p{L}\\p{N}])(?:entre\\s+)?1\\s*(?:a|-|e)\\s*3\\s*h(?:oras?)?(?![\\p{L}\\p{N}])`, 'u').exec(m))) { out.dur = '1 a 3 horas'; add(x.index, x.index + x[0].length); }
    else if ((x = /(?<![\p{L}\p{N}])(?:menos de|inferior a|abaixo de)\s*(?:1|uma)\s*h(?:ora)?(?![\p{L}\p{N}])/u.exec(m))) { out.dur = '< 1h'; add(x.index, x.index + x[0].length); }
    else if ((x = /(?<![\p{L}\p{N}])(?:mais de|superior a|acima de)\s*3\s*h(?:oras)?(?![\p{L}\p{N}])/u.exec(m))) { out.dur = '> 3 horas'; add(x.index, x.index + x[0].length); }
    else {
      const re = new RegExp(`(?<![\\p{L}\\p{N}])${lab}(\\d+(?:[.,]\\d+)?)\\s*(h|horas?|min|minutos?)(?:\\s*e\\s*(meia|\\d+)(?:\\s*(?:min|minutos?))?)?(?![\\p{L}\\p{N}])`, 'gu');
      while ((x = re.exec(m))) {
        const before = m.slice(Math.max(0, x.index - 6), x.index);
        if (/(?<![\p{L}\p{N}])(?:ha|apos|as)\s*$/u.test(before) && !/durou|duracao|demorou/.test(x[0])) continue; // "há 2 horas", "às 3 h"
        let min = parseFloat(x[1].replace(',', '.')) * (/^h/.test(x[2]) ? 60 : 1);
        if (x[3] === 'meia') min += 30; else if (x[3]) min += Number(x[3]);
        out.dur = min < 60 ? '< 1h' : min <= 180 ? '1 a 3 horas' : '> 3 horas';
        add(x.index, x.index + x[0].length);
        break;
      }
    }
  }

  // Cormack-Lehane
  {
    const re = /(?<![\p{L}\p{N}])(?:cormack|cormac|kormack|cormaque)?(?:\s*-?\s*(?:lehane|lihein|lehan))?\s*(?:cl|grau|de)?\s*(?:cl\s*)?(\d|iv|iii|ii|i|facil|dificil)(?![\p{L}\p{N}])/gu;
    let x;
    while ((x = re.exec(m))) {
      if (!/cormack|cormac|kormack|cormaque|lehane|lihein|lehan|cl/.test(x[0])) continue;
      const v = x[1];
      const n = { i: 1, ii: 2, iii: 3, iv: 4 }[v] || Number(v);
      if (v === 'facil' || (n >= 1 && n <= 2)) out.cl = 'Fácil (CL 1-2)';
      else if (v === 'dificil' || (n >= 3 && n <= 4)) out.cl = 'Difícil (CL 3-4)';
      add(x.index, x.index + x[0].length);
    }
  }
  return out;
}

// ---------------------------------------------------------------------------
// Sugestões: valores que não foram ditos, cada um com o motivo (why) para o utilizador perceber
// de onde veio. Origem "sug".

const MON_ORDER = ['BIS', 'TOF', 'PAI', 'PVC'];

function inferDefaults(v, origin, why, { mon, ctxSeen }, notes) {
  const sug = (k, val, reason) => { if (!v[k] && val) { v[k] = val; origin[k] = 'sug'; why[k] = reason; } };

  if (v.idade !== '' && !v.grupo) sug('grupo', ageGroup(v.idade), `Calculado a partir da idade (${v.idade})`);
  if (v.esp === 'Fora do Bloco') sug('local', 'Gastroenterologia', '“Fora do Bloco” é a Unidade de Técnicas de Gastroenterologia (Notas do Excel)');

  // Linha arterial / CVC sem local
  if (ctxSeen.has('la') && !v.la && (v.laMet || v.laSuc || mon.has('PAI'))) sug('la', 'Não registado', 'Foi mencionada linha arterial sem dizer o local');
  if (ctxSeen.has('cvc') && !v.cvc) sug('cvc', 'Não registado', 'Foi mencionado CVC sem dizer o local');

  // Via aérea
  if (!v.tecva && v.laring) sug('tecva', /^Video/.test(v.laring) ? 'Videolaringoscopia' : /^(Macintosh|McCoy)/.test(v.laring) ? 'Laringoscopia direta' : '', `Por teres mencionado ${v.laring}`);
  if (!v.tva && (v.tecva || v.cl || /^(Macintosh|McCoy|Video)/.test(v.laring))) sug('tva', 'Intubação Orotraqueal', `Por teres mencionado ${v.tecva || v.laring || 'Cormack-Lehane'}`);

  // Técnica anestésica
  const gaWhy = v.ag ? `anestesia ${v.ag.toLowerCase()}` : ['Intubação Orotraqueal', 'Intubação Nasotraqueal', 'Máscara Laríngea'].includes(v.tva) ? v.tva : '';
  const regWhy = [v.neuro, v.bp1].filter(Boolean).join(' e ');
  if (!v.tec && v.esp !== 'Doente Crítico') sug('tec', gaWhy && regWhy ? 'Combinada' : gaWhy ? 'Geral' : regWhy ? 'Regional' : '', `Por haver ${[gaWhy, regWhy].filter(Boolean).join(" + ")}`);
  else if (v.tec === 'Geral' && regWhy && origin.tec === 'voz' && v.bpInt !== 'Analgésico' && v.neuroInt !== 'Analgésico') notes.push('Técnica "Geral" com técnica regional: confirma se não é "Combinada".');
  if (['Geral', 'Combinada'].includes(v.tec)) sug('ag', 'Balanceada', 'A anestesia geral mais habitual; não foi dito o tipo');

  // Monitorização
  if (v.la && !mon.has('PAI')) mon.add('PAI*');
  const flags = MON_ORDER.filter((x) => mon.has(x) || mon.has(x + '*'));
  if (flags.length || mon.has('ASA') || v.tec) {
    const val = ['ASA', ...flags].join(' + ');
    const said = [...mon].filter((x) => !x.endsWith('*'));
    v.monit = val;
    if (said.length && said.length === [...mon].length) origin.monit = 'voz';
    else {
      origin.monit = 'sug';
      why.monit = said.length ? 'Acrescentado PAI por haver linha arterial' : mon.has('PAI*') ? 'ASA (standard) + PAI por haver linha arterial' : 'Monitorização standard ASA; não foi dita outra';
    }
    if (!LISTS.monit.includes(val)) notes.push(`A monitorização "${val}" não existe na lista do Excel; escolhe a mais próxima.`);
  }

  // Neuroeixo / bloqueios / dispositivos: método e sucesso habituais quando não ditos
  const usual = 'Não foi dito; é o mais habitual';
  if (v.neuro) {
    sug('neuroMet', 'Referências Anatómicas', usual);
    sug('neuroInt', v.neuro === 'Bloqueio Subaracnoideu' ? 'Anestésico' : '', 'Raquianestesia é normalmente com intuito anestésico');
    sug('neuroSuc', 'Sucesso', 'Não foi dito insucesso');
  }
  if (v.bp1) { sug('bpMet', 'Ecoguiado', usual); sug('bpSuc', 'Sucesso', 'Não foi dito insucesso'); }
  if (['Máscara Laríngea', 'Intubação Orotraqueal', 'Intubação Nasotraqueal'].includes(v.tva)) sug('sucva', 'Sucesso', 'Não foi dito insucesso');
  if (v.la) sug('laSuc', 'Sucesso', 'Não foi dito insucesso');
  if (v.cvc) { sug('cvcMet', 'Ecoguiado', usual); sug('cvcSuc', 'Sucesso', 'Não foi dito insucesso'); }
}

// Valores por omissão: aparecem logo num registo novo, como sugestão.
export const DEFAULTS = {
  data: { value: (today) => today, why: 'Data de hoje' },
  regime: { value: () => 'Urgência', why: 'Esta casuística é de urgência' },
  complexo: { value: () => 'Não', why: 'Por omissão; diz “caso complexo” para mudar' },
};

export function applyDefaults(v, origin, why, today = todayIso()) {
  for (const [k, d] of Object.entries(DEFAULTS)) if (!v[k]) { v[k] = d.value(today); origin[k] = 'sug'; why[k] = d.why; }
}
