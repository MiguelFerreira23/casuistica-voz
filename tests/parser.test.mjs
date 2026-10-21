import { test } from 'node:test';
import assert from 'node:assert/strict';
import { parse } from '../app/js/parser.js';
import { wordsToDigits } from '../app/js/numbers.js';

const today = '2026-01-23';

test('números por extenso', () => {
  assert.equal(wordsToDigits('oito oito sete um dois'), '8 8 7 1 2');
  assert.equal(wordsToDigits('um doente com uma fratura'), 'um doente com uma fratura');
  assert.equal(wordsToDigits('processo um dois três'), 'processo 1 2 3');
  assert.equal(wordsToDigits('sessenta e seis anos'), '66 anos');
  assert.equal(wordsToDigits('dois mil e vinte e seis'), '2026');
  assert.equal(wordsToDigits('uma hora e meia'), '1 hora e meia');
  assert.equal(wordsToDigits('cento e vinte e três'), '123');
});

test('exemplo do utilizador', () => {
  const t = 'O número de processo é um dois três quatro cinco seis sete, idade 66, sexo masculino, ASA nível quatro. ' +
    'Urgência de cirurgia vascular. Diagnóstico hematoma inguinal. Procedimento drenagem de hematoma inguinal. ' +
    'Durou duas horas. Anestesia geral balanceada, monitorização ASA mais BIS mais PAI, máscara laríngea. ' +
    'Linha arterial radial por referências anatómicas com sucesso. CVC ecoguiado com sucesso. Destino UCPA. Caso complexo não.';
  const { values: v, origin, notes } = parse(t, { today });
  console.log(v, origin, notes);
  assert.equal(v.np, '1234567');
  assert.equal(v.idade, 66);
  assert.equal(v.grupo, '> 65 anos a 85 anos');
  assert.equal(v.sexo, 'Masculino');
  assert.equal(v.asa, 'IV');
  assert.equal(v.regime, 'Urgência');
  assert.equal(v.esp, 'Cirurgia Vascular');
  assert.equal(v.diag, 'hematoma inguinal');
  assert.equal(v.proc, 'drenagem de hematoma inguinal');
  assert.equal(v.dur, '1 a 3 horas');
  assert.equal(v.tec, 'Geral');
  assert.equal(v.ag, 'Balanceada');
  assert.equal(v.monit, 'ASA + BIS + PAI');
  assert.equal(v.tva, 'Máscara Laríngea');
  assert.equal(v.la, 'Radial');
  assert.equal(v.laMet, 'Referências Anatómicas');
  assert.equal(v.laSuc, 'Sucesso');
  assert.equal(v.cvc, 'Não registado');
  assert.equal(v.cvcMet, 'Ecoguiado');
  assert.equal(v.cvcSuc, 'Sucesso');
  assert.equal(v.destino, 'UCPA');
  assert.equal(v.complexo, 'Não');
  assert.equal(v.data, today);
});

test('IOT com videolaringoscópio, raqui, bloqueios e contexto', () => {
  const t = 'Ontem, doente do sexo feminino de 51 anos, ASA 2, neurocirurgia, diagnóstico hematoma subdural subagudo, ' +
    'procedimento trépanos, uma hora e meia. Intubação orotraqueal com videolaringoscopia com condutor, Cormack 3, com ajuda. ' +
    'Bloqueio TAP e bainha dos retos ecoguiado analgésico. Vai para a UCI. Observações doente ansiosa.';
  const { values: v, notes } = parse(t, { today });
  console.log(v, notes);
  assert.equal(v.data, '2026-01-22');
  assert.equal(v.sexo, 'Feminino');
  assert.equal(v.idade, 51);
  assert.equal(v.asa, 'II');
  assert.equal(v.esp, 'Neurocirurgia');
  assert.equal(v.diag, 'hematoma subdural subagudo');
  assert.equal(v.proc, 'trépanos');
  assert.equal(v.dur, '1 a 3 horas');
  assert.equal(v.tva, 'Intubação Orotraqueal');
  assert.equal(v.tecva, 'Videolaringoscopia');
  assert.equal(v.laring, 'Videolaringoscópio + Condutor');
  assert.equal(v.cl, 'Difícil (CL 3-4)');
  assert.equal(v.sucva, 'Sucesso');
  assert.match(v.obs, /VA com ajuda/);
  assert.match(v.obs, /doente ansiosa/);
  assert.equal(v.bp1, 'Plano do Transverso do Abdómen (TAP)');
  assert.equal(v.bp2, 'Bainha dos Retos');
  assert.equal(v.bpMet, 'Ecoguiado');
  assert.equal(v.bpInt, 'Analgésico');
  assert.equal(v.tec, 'Combinada');
  assert.equal(v.destino, 'UCI');
});

test('raqui, fora do bloco, só não é SO', () => {
  const { values: v } = parse('Raquianestesia com sucesso à segunda tentativa, só com ajuda. Ortopedia, 80 anos, destino SO.', { today });
  assert.equal(v.neuro, 'Bloqueio Subaracnoideu');
  assert.equal(v.neuroSuc, 'Sucesso');
  assert.equal(v.tec, 'Regional');
  assert.equal(v.destino, 'SO');
  assert.equal(v.idade, 80);
  const { values: w } = parse('Fora do bloco, EDA com sedação, 45 anos, sexo feminino, ASA 3, destino enfermaria', { today });
  assert.equal(w.esp, 'Fora do Bloco');
  assert.equal(w.local, 'Gastroenterologia');
  assert.equal(w.tec, 'Sedoanalgesia');
  assert.equal(w.destino, 'Enfermaria');
});

test('registo vazio: só as sugestões por omissão, cada uma com motivo', () => {
  const { values, origin, why } = parse('', { today });
  const filled = Object.entries(values).filter(([, x]) => x !== '').map(([k]) => k).sort();
  assert.deepEqual(filled, ['complexo', 'data', 'regime']);
  for (const k of filled) { assert.equal(origin[k], 'sug'); assert.ok(why[k]); }
});

test('todas as sugestões dizem de onde vieram', () => {
  const { values: v, origin, why } = parse('idade 40, ortopedia, raqui, linha arterial, videolaringoscopia', { today });
  assert.equal(origin.grupo, 'sug');
  assert.match(why.grupo, /idade/);
  assert.equal(v.tva, 'Intubação Orotraqueal');
  assert.match(why.tva, /Videolaringosc/);
  for (const [k, o] of Object.entries(origin)) if (o === 'sug') assert.ok(why[k], `sem motivo: ${k}`);
});

import { missingFields, defaultRequired, autoCellNotes } from '../app/js/schema.js';

test('obrigatórios com condições', () => {
  const base = { data: today, idade: 50, grupo: 'x', sexo: 'F', asa: 'II', regime: 'Urgência', diag: 'd', proc: 'p', dur: '< 1h', monit: 'ASA', tva: 'Máscara Laríngea', sucva: 'Sucesso', destino: 'UCPA', complexo: 'Não', ag: 'Balanceada' };
  const keys = (v, notes) => missingFields(v, defaultRequired(), notes).map((c) => c.key);
  assert.deepEqual(keys({ ...base, esp: 'Cirurgia Geral', tec: 'Geral' }), []);
  assert.deepEqual(keys({ ...base, esp: 'Fora do Bloco', tec: 'Sedoanalgesia' }), ['local']);
  assert.deepEqual(keys({ ...base, esp: 'Doente Crítico', tec: '' }), []);          // técnica não se aplica
  assert.deepEqual(keys({ ...base, esp: 'Cirurgia Geral', tec: 'Geral', la: 'Radial' }), ['laMet', 'laSuc']);
  assert.deepEqual(keys({ ...base, esp: 'Cirurgia Geral', tec: 'Geral', la: 'Radial' }, { laMet: 'Método não registado', laSuc: 'x' }), []);
  assert.ok(!defaultRequired().np, 'NP não é obrigatório por omissão');
});

test('notas automáticas', () => {
  assert.match(autoCellNotes({ esp: 'Doente Crítico', tec: '' }).tec, /não entra na Tabela 19/);
  assert.match(autoCellNotes({ esp: 'Cirurgia Geral', tec: 'Geral', bp1: 'Bainha dos Retos' }).tec, /Combinada/);
  assert.deepEqual(autoCellNotes({ esp: 'Cirurgia Geral', tec: 'Geral' }), {});
});

test('doente crítico e termo logo após a etiqueta', () => {
  const { values: v } = parse('Doente crítico, 72 anos, masculino, ASA 5, diagnóstico politrauma com TCE, procedimento entubação, menos de uma hora.', { today });
  assert.equal(v.esp, 'Doente Crítico');
  assert.equal(v.proc, 'intubação');
  assert.equal(v.tva, 'Intubação Orotraqueal');
  assert.equal(v.tec, '');
  assert.equal(v.dur, '< 1h');
  assert.equal(v.diag, 'politrauma com TCE');
});

import { scriptUrl } from '../app/js/gsheets.js';

test('URL ou ID do Apps Script', () => {
  const id = 'AKfycbx' + 'A'.repeat(60);
  const exec = `https://script.google.com/macros/s/${id}/exec`;
  assert.equal(scriptUrl(id), exec);
  assert.equal(scriptUrl(`  ${id}  `), exec);
  assert.equal(scriptUrl(exec), exec);
  assert.equal(scriptUrl(`https://script.google.com/macros/s/${id}/dev`), exec);
  assert.equal(scriptUrl(`https://script.google.com/macros/s/${id}`), exec);
  assert.equal(scriptUrl(`https://script.google.com/a/macros/hospital.pt/s/${id}/exec?x=1`), `https://script.google.com/a/macros/hospital.pt/s/${id}/exec`);
  assert.equal(scriptUrl('https://example.com/macros/s/abc/exec'), null);
  assert.equal(scriptUrl('olá'), null);
  assert.equal(scriptUrl(''), null);
});

test('teste real com erros típicos do reconhecimento de voz', () => {
  const t = 'Portanto, número de processo 12345 e dá de 66, masculino, às a 4, urgência, cirurgia vascular, no dia que não é estico. É uma toma em guinal, vestimento, fogarte. A duração foi de 1h, técnica anestesica foi geral, anestesia geral é alanciada. A medização foi asa mais bígmas de toffe, tipo ver a máscara línja, césseva foi césseva, destino o CPA caso complexo não.';
  const { values: v } = parse(t, { today });
  assert.equal(v.np, '12345');
  assert.equal(v.idade, 66);
  assert.equal(v.sexo, 'Masculino');
  assert.equal(v.asa, 'IV');
  assert.equal(v.regime, 'Urgência');
  assert.equal(v.esp, 'Cirurgia Vascular');
  assert.equal(v.diag, 'hematoma inguinal');
  assert.equal(v.proc, 'Fogarty');
  assert.equal(v.dur, '1 a 3 horas');
  assert.equal(v.tec, 'Geral');
  assert.equal(v.ag, 'Balanceada');
  assert.equal(v.monit, 'ASA + BIS + TOF');
  assert.equal(v.tva, 'Máscara Laríngea');
  assert.equal(v.sucva, 'Sucesso');
  assert.equal(v.destino, 'UCPA');
  assert.equal(v.complexo, 'Não');
});

test('correções não estragam horas nem texto normal', async () => {
  const { correctTranscript } = await import('../app/js/corrections.js');
  assert.equal(correctTranscript('às 4 horas'), 'às 4 horas');
  assert.equal(correctTranscript('às a 4'), 'ASA 4');
  assert.equal(correctTranscript('uma tomada de decisão'), 'uma tomada de decisão');
});
