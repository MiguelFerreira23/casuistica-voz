// Estrutura da folha "Casuística" (colunas A..AN) e listas da folha "Listas".

export const LISTS = {
  grupo: ['< 24 horas', '24 horas a 1 mês', '> 1 mês a 6 meses', '> 6 meses a 4 anos', '> 4 anos a 12 anos', '> 12 anos a 65 anos', '> 65 anos a 85 anos', '> 85 anos'],
  sexo: ['Feminino', 'Masculino'],
  asa: ['I', 'II', 'III', 'IV', 'V', 'VI'],
  regime: ['Urgência', 'Internamento (programada)', 'Ambulatório (programada)'],
  esp: ['Cirurgia Geral', 'Cirurgia Pediátrica', 'Cirurgia Plástica', 'Cirurgia Vascular', 'Ginecologia/Obstetrícia', 'Neurocirurgia', 'Oftalmologia', 'ORL', 'Ortopedia', 'Urologia', 'Fora do Bloco', 'Doente Crítico'],
  local: ['Gastroenterologia', 'UCI Pediátrica', 'UCI', 'Serviço de Urgência', 'Imagiologia', 'Enfermaria'],
  dur: ['< 1h', '1 a 3 horas', '> 3 horas'],
  tec: ['Geral', 'Regional', 'Combinada', 'Sedoanalgesia', 'Monitorização (CAM)'],
  ag: ['Balanceada', 'Endovenosa', 'Inalatória'],
  neuro: ['Bloqueio Subaracnoideu', 'Epidural Lombar', 'Epidural Torácica', 'Sequencial'],
  bp: ['Plano do Transverso do Abdómen (TAP)', 'Bainha dos Retos', 'Eretor da Espinha', 'Plano Serratus Anterior', 'Paravertebral', 'Plexo braquial - Interescalénico', 'Plexo braquial - Supraclavicular', 'Plexo braquial - Infraclavicular', 'Plexo braquial - Axilar', 'Fáscia Ilíaca', 'Femoral', 'Ciático Poplíteu', 'Canal dos adutores'],
  metodo: ['Ecoguiado', 'Referências Anatómicas'],
  intuito: ['Analgésico', 'Anestésico'],
  sucesso: ['Sucesso', 'Insucesso', 'Observado'],
  monit: ['ASA', 'ASA + BIS', 'ASA + TOF', 'ASA + PAI', 'ASA + BIS + TOF', 'ASA + BIS + PAI', 'ASA + BIS + TOF + PAI', 'ASA + BIS + TOF + PAI + PVC'],
  tva: ['Ventilação Espontânea', 'Máscara Facial', 'Máscara Laríngea', 'Intubação Orotraqueal', 'Intubação Nasotraqueal', 'Traqueostomia'],
  tecva: ['Laringoscopia direta', 'Videolaringoscopia', 'Fibroscopia', 'Fibroscopia vigil'],
  laring: ['Macintosh', 'Macintosh + Condutor', 'Macintosh + Frova', 'McCoy', 'Videolaringoscópio', 'Videolaringoscópio + Condutor', 'i-Gel', 'LMA Supreme'],
  cl: ['Fácil (CL 1-2)', 'Difícil (CL 3-4)'],
  la: ['Radial', 'Umeral', 'Femoral', 'Cubital', 'Não registado'],
  cvc: ['Jugular interna', 'Subclávia', 'Femoral', 'Axilar', 'Não registado'],
  destino: ['UCPA', 'SO', 'UCI', 'BUC', 'Enfermaria', 'Óbito'],
  simnao: ['Sim', 'Não'],
};

// type: date | text | number | long (texto livre longo) | list
export const COLUMNS = [
  { key: 'data', label: 'Data', type: 'date', section: 'demo', required: true },
  { key: 'np', label: 'NP', type: 'text', section: 'demo', required: true, inputmode: 'numeric' },
  { key: 'idade', label: 'Idade', type: 'number', section: 'demo', required: true },
  { key: 'grupo', label: 'Grupo Etário', type: 'list', list: 'grupo', section: 'demo', required: true },
  { key: 'sexo', label: 'Sexo', type: 'list', list: 'sexo', section: 'demo', required: true },
  { key: 'asa', label: 'ASA', type: 'list', list: 'asa', section: 'demo', required: true },
  { key: 'regime', label: 'Regime', type: 'list', list: 'regime', section: 'reg', required: true },
  { key: 'esp', label: 'Especialidade', type: 'list', list: 'esp', section: 'reg', required: true },
  { key: 'local', label: 'Local fora do BO', type: 'list', list: 'local', section: 'reg' },
  { key: 'diag', label: 'Diagnóstico', type: 'text', section: 'diag', required: true },
  { key: 'part', label: 'Particularidades', type: 'long', section: 'diag' },
  { key: 'proc', label: 'Procedimento', type: 'text', section: 'diag', required: true },
  { key: 'dur', label: 'Duração', type: 'list', list: 'dur', section: 'diag', required: true },
  { key: 'tec', label: 'Técnica Anestésica', type: 'list', list: 'tec', section: 'tec' },
  { key: 'ag', label: 'Anestesia Geral', type: 'list', list: 'ag', section: 'tec' },
  { key: 'neuro', label: 'Neuroeixo', type: 'list', list: 'neuro', section: 'neuro' },
  { key: 'neuroMet', label: 'Método', type: 'list', list: 'metodo', section: 'neuro' },
  { key: 'neuroInt', label: 'Intuito', type: 'list', list: 'intuito', section: 'neuro' },
  { key: 'neuroSuc', label: 'Sucesso', type: 'list', list: 'sucesso', section: 'neuro' },
  { key: 'bp1', label: 'Bloqueio Periférico 1', type: 'list', list: 'bp', section: 'bp' },
  { key: 'bp2', label: 'Bloqueio Periférico 2', type: 'list', list: 'bp', section: 'bp' },
  { key: 'bpMet', label: 'Método', type: 'list', list: 'metodo', section: 'bp' },
  { key: 'bpInt', label: 'Intuito', type: 'list', list: 'intuito', section: 'bp' },
  { key: 'bpSuc', label: 'Sucesso', type: 'list', list: 'sucesso', section: 'bp' },
  { key: 'monit', label: 'Monitorização', type: 'list', list: 'monit', section: 'monit' },
  { key: 'tva', label: 'Tipo VA', type: 'list', list: 'tva', section: 'va' },
  { key: 'tecva', label: 'Técnica VA', type: 'list', list: 'tecva', section: 'va' },
  { key: 'laring', label: 'Laringoscópio e Adjuvantes', type: 'list', list: 'laring', section: 'va' },
  { key: 'cl', label: 'Cormack-Lehane', type: 'list', list: 'cl', section: 'va' },
  { key: 'sucva', label: 'Sucesso VA', type: 'list', list: 'sucesso', section: 'va' },
  { key: 'la', label: 'Linha Arterial', type: 'list', list: 'la', section: 'disp' },
  { key: 'laMet', label: 'Método LA', type: 'list', list: 'metodo', section: 'disp' },
  { key: 'laSuc', label: 'Sucesso LA', type: 'list', list: 'sucesso', section: 'disp' },
  { key: 'cvc', label: 'CVC', type: 'list', list: 'cvc', section: 'disp' },
  { key: 'cvcMet', label: 'Método CVC', type: 'list', list: 'metodo', section: 'disp' },
  { key: 'cvcSuc', label: 'Sucesso CVC', type: 'list', list: 'sucesso', section: 'disp' },
  { key: 'destino', label: 'Destino', type: 'list', list: 'destino', section: 'evol', required: true },
  { key: 'compl', label: 'Complicações', type: 'long', section: 'evol' },
  { key: 'complexo', label: 'Caso complexo', type: 'list', list: 'simnao', section: 'evol' },
  { key: 'obs', label: 'Observações', type: 'long', section: 'evol' },
];

export const SECTIONS = [
  { key: 'demo', label: 'Dados demográficos' },
  { key: 'reg', label: 'Regime e especialidade' },
  { key: 'diag', label: 'Diagnóstico e procedimento' },
  { key: 'tec', label: 'Técnica anestésica' },
  { key: 'neuro', label: 'Neuroeixo' },
  { key: 'bp', label: 'Bloqueios periféricos' },
  { key: 'monit', label: 'Monitorização' },
  { key: 'va', label: 'Via aérea' },
  { key: 'disp', label: 'Dispositivos' },
  { key: 'evol', label: 'Evolução' },
];

export const COL_BY_KEY = Object.fromEntries(COLUMNS.map((c) => [c.key, c]));

export function emptyRecord() {
  return Object.fromEntries(COLUMNS.map((c) => [c.key, '']));
}

export function ageGroup(years) {
  if (years === '' || years == null || isNaN(years)) return '';
  const days = Number(years) * 365.25;
  if (days < 1) return '< 24 horas';
  if (days <= 31) return '24 horas a 1 mês';
  if (days <= 183) return '> 1 mês a 6 meses';
  if (years <= 4) return '> 6 meses a 4 anos';
  if (years <= 12) return '> 4 anos a 12 anos';
  if (years <= 65) return '> 12 anos a 65 anos';
  if (years <= 85) return '> 65 anos a 85 anos';
  return '> 85 anos';
}

// "2026-01-23" -> "23/01/2026"
export function isoToPt(iso) {
  if (!iso) return '';
  const [y, m, d] = iso.split('-');
  return `${d}/${m}/${y}`;
}

export function todayIso(now = new Date()) {
  const p = (n) => String(n).padStart(2, '0');
  return `${now.getFullYear()}-${p(now.getMonth() + 1)}-${p(now.getDate())}`;
}

// Linha separada por tabs, pronta a colar no Excel.
export function toTsvRow(values) {
  return COLUMNS.map((c) => {
    let v = values[c.key] ?? '';
    if (c.type === 'date') v = isoToPt(v);
    return String(v).replace(/[\t\r\n]+/g, ' ');
  }).join('\t');
}
