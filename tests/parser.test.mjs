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

test('sem texto não há valores deduzidos nem por omissão', () => {
  const { values, origin } = parse('', { today });
  assert.deepEqual(Object.values(values).filter((x) => x !== ''), []);
  assert.deepEqual(origin, {});
});

test('valores por omissão marcados como "def"', () => {
  const { values: v, origin } = parse('idade 40, ortopedia', { today });
  assert.equal(v.data, today);
  assert.equal(origin.data, 'def');
  assert.equal(origin.regime, 'def');
  assert.equal(origin.complexo, 'def');
  assert.equal(origin.grupo, 'auto');
});
