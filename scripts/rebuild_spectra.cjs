const fs = require('fs');
const path = require('path');

const ROOT = path.resolve(__dirname, '..');
const ELEMENTS_PATH = path.join(ROOT, 'files', 'elements.json');
const CSV_DIR = path.join(ROOT, 'files', 'spectral_sources', 'definitivo');
const NIST_DIR = path.join(ROOT, 'files', 'spectral_sources', 'nist_asd');
const AUDIT_PATH = path.join(ROOT, 'files', 'spectral_sources', 'theoretical_audit.json');

const TEMPERATURE_K = 2200;
const BOLTZMANN_EV_K = 8.617333262e-5;
const ATOMIC_RELATIVE_THRESHOLD = 1e-6;
const USB2000_SIGMA_NM = 0.84;
const RANGE_NM = [380, 850];

const ATOMIC_COMPONENTS = [
  ['Li', 'Li I', 'Li I'],
  ['Na', 'Na I', 'Na I'],
  ['K', 'K I', 'K I'],
  ['Ca', 'Ca I', 'Ca I'],
  ['Fe', 'Fe I', 'Fe I'],
  ['Cu', 'Cu I', 'Cu I'],
  ['Rb', 'Rb I', 'Rb I'],
  ['Sr', 'Sr I', 'Sr I'],
  ['Cs', 'Cs I', 'Cs I'],
  ['Ba', 'Ba I', 'Ba I'],
  ['Ba', 'Ba II', 'Ba II'],
];

const EXPERIMENTAL_FILES = {
  Li: 'Li_litio.csv', B: 'B_boro.csv', Na: 'Na.csv', K: 'K_potassio.csv',
  Ca: 'Ca_calcio.csv', Cu: 'Cu_rame.csv', Sr: 'Sr_stronzio.csv', Ba: 'Ba_bario.csv',
};

const FIT_RANGES = {
  Li: [430, 720], B: [430, 610], Na: [540, 630], K: [390, 810],
  Ca: [400, 710], Cu: [390, 650], Sr: [440, 735], Ba: [440, 840],
};

const CONTAMINATION_MASKS = {
  Li: [[584, 594], [760, 775]], B: [[584, 651.6], [760, 775]],
  Ca: [[584, 594], [698.9, 700.4], [760, 775]],
  Cu: [[584, 594], [668.9, 674.1], [760, 775]],
  Sr: [[584, 594], [755, 781]], Ba: [[584, 594], [760, 775]],
};

function nistUrl(spectrum) {
  const query = new URLSearchParams({
    spectra: spectrum, limits_type: '0', low_w: String(RANGE_NM[0]), upp_w: String(RANGE_NM[1]),
    unit: '1', format: '3', line_out: '3', en_unit: '1', output: '0', page_size: '5000',
    show_obs_wl: '1', show_calc_wl: '1', intens_out: 'on', enrg_out: 'on', bibrefs: '1',
    order_out: '0', show_av: '2', tsb_value: '0', allowed_out: '1', forbid_out: '1',
    A_out: '0', J_out: 'on',
  });
  return `https://physics.nist.gov/cgi-bin/ASD/lines1.pl?${query}`;
}

function numberFrom(value) {
  const match = String(value ?? '').replaceAll('−', '-').match(/[+-]?(?:\d+\.?\d*|\.\d+)(?:e[+-]?\d+)?/i);
  return match ? Number(match[0]) : NaN;
}

function angularMomentum(value) {
  const text = String(value ?? '').trim().replaceAll('"', '');
  if (/^\d+(?:\.\d+)?$/.test(text)) return Number(text);
  const fraction = text.match(/^(\d+)\s*\/\s*(\d+)$/);
  return fraction ? Number(fraction[1]) / Number(fraction[2]) : NaN;
}

function parseTsv(text) {
  const lines = text.trim().split(/\r?\n/);
  const header = lines.shift().split('\t').map(x => x.trim());
  return lines.map(line => {
    const cells = line.split('\t').map(x => x.replace(/^"|"$/g, '').trim());
    return Object.fromEntries(header.map((key, index) => [key, cells[index] ?? '']));
  });
}

function atomicPeaks(rows) {
  const candidates = [];
  const seen = new Set();
  for (const row of rows) {
    const nm = numberFrom(row['obs_wl_air(nm)']) || numberFrom(row['ritz_wl_air(nm)']);
    const aki = numberFrom(row['Aki(s^-1)']);
    const upperEnergy = numberFrom(row['Ek(eV)']);
    const upperJ = angularMomentum(row.J_k);
    if (![nm, aki, upperEnergy, upperJ].every(Number.isFinite) || nm < RANGE_NM[0] || nm > RANGE_NM[1] || aki <= 0) continue;
    const key = `${nm.toFixed(6)}|${aki}|${upperEnergy}|${upperJ}`;
    if (seen.has(key)) continue;
    seen.add(key);
    const emissivity = (2 * upperJ + 1) * aki * Math.exp(-upperEnergy / (BOLTZMANN_EV_K * TEMPERATURE_K)) / nm;
    candidates.push({ nm, emissivity });
  }
  if (!candidates.length) return [];
  const maximum = Math.max(...candidates.map(x => x.emissivity));
  return candidates
    .map(x => ({ nm: Number(x.nm.toFixed(6)), strength: x.emissivity / maximum }))
    .filter(x => x.strength >= ATOMIC_RELATIVE_THRESHOLD)
    .sort((a, b) => a.nm - b.nm);
}

function readCsv(file) {
  return fs.readFileSync(path.join(CSV_DIR, file), 'utf8').split(/\r?\n/)
    .filter(line => line && !line.startsWith('#') && !line.startsWith('wavelength'))
    .map(line => line.split(',').map(Number));
}

function profile(component, nm) {
  let value = 0;
  for (const peak of component.peaks) {
    const sigma = component.kind === 'atomic' ? component.instrument_sigma_nm : peak.sigma_nm;
    const distance = (nm - peak.nm) / sigma;
    if (Math.abs(distance) <= 6) value += peak.strength * Math.exp(-0.5 * distance * distance);
  }
  return value;
}

function solveNonnegative(element, samples, y, shiftNm) {
  const columns = element.spectral_components.map(component => samples.map(([nm]) => profile(component, nm - shiftNm)));
  const coefficients = columns.map(() => 0);
  const prediction = y.map(() => 0);
  for (let iteration = 0; iteration < 4000; iteration++) {
    let largestChange = 0;
    for (let columnIndex = 0; columnIndex < columns.length; columnIndex++) {
      const column = columns[columnIndex];
      const old = coefficients[columnIndex];
      let numerator = 0;
      let denominator = 0;
      for (let i = 0; i < y.length; i++) {
        numerator += column[i] * (y[i] - prediction[i] + old * column[i]);
        denominator += column[i] * column[i];
      }
      const next = denominator ? Math.max(0, numerator / denominator) : 0;
      const delta = next - old;
      if (delta) for (let i = 0; i < prediction.length; i++) prediction[i] += delta * column[i];
      coefficients[columnIndex] = next;
      largestChange = Math.max(largestChange, Math.abs(delta));
    }
    if (largestChange < 1e-12) break;
  }
  const rmse = Math.sqrt(y.reduce((sum, value, i) => sum + (value - prediction[i]) ** 2, 0) / y.length);
  return { shiftNm, columns, coefficients, prediction, rmse };
}

function fitComponents(element) {
  const range = FIT_RANGES[element.symbol];
  const file = EXPERIMENTAL_FILES[element.symbol];
  if (!range || !file || !element.spectral_components?.length) return null;
  const masks = CONTAMINATION_MASKS[element.symbol] ?? [];
  const samples = readCsv(file).filter(([nm]) => nm >= range[0] && nm <= range[1] && !masks.some(([low, high]) => nm >= low && nm <= high));
  const maximum = Math.max(...samples.map(([, y]) => Math.max(0, y)));
  const y = samples.map(([, value]) => Math.max(0, value) / maximum);
  let best = null;
  for (let step = -100; step <= 100; step++) {
    const candidate = solveNonnegative(element, samples, y, step * 0.02);
    if (!best || candidate.rmse < best.rmse) best = candidate;
  }
  const { coefficients, rmse, shiftNm } = best;
  const coefficientMaximum = Math.max(...coefficients, 1e-30);
  element.spectral_components.forEach((component, index) => {
    component.scale = element.spectral_components.length === 1 ? 1 : Number((coefficients[index] / coefficientMaximum).toFixed(6));
    component.method = component.method.replace(/\s*La scala complessiva[^.]*\./g, '').replace(/\s*Scala complessiva[^.]*\./g, '').replace(/\s*scala complessiva[^.]*\./g, '');
    if (element.spectral_components.length > 1) {
      component.method += ' Scala complessiva ottenuta con fit non negativo sullo spettro USB2000 della fiamma di metanolo.';
    }
  });
  return {
    rmse, shift_nm: Number(shiftNm.toFixed(3)),
    coefficients: Object.fromEntries(element.spectral_components.map((component, index) => [component.id, component.scale])),
  };
}

function normalizeMolecular(component) {
  if (!component.raw_values?.length || component.raw_values.length !== component.peaks.length) return false;
  const maximum = Math.max(...component.raw_values.map(([, value]) => value));
  for (let index = 0; index < component.peaks.length; index++) {
    const [nm, value] = component.raw_values[index];
    component.peaks[index].nm = nm;
    component.peaks[index].strength = value / maximum;
  }
  return true;
}

function residualPeaks(element, shiftNm = 0) {
  const file = EXPERIMENTAL_FILES[element.symbol];
  if (!file) return [];
  const masks = CONTAMINATION_MASKS[element.symbol] ?? [];
  const samples = readCsv(file).filter(([nm]) => nm >= RANGE_NM[0] && nm <= RANGE_NM[1]
    && !masks.some(([low, high]) => nm >= low && nm <= high));
  const experimentalMaximum = Math.max(...samples.map(([, y]) => Math.max(0, y)));
  const theoretical = samples.map(([nm]) => element.spectral_components.reduce((sum, component) => sum + component.scale * profile(component, nm - shiftNm), 0));
  const theoreticalMaximum = Math.max(...theoretical, 1e-30);
  const residual = samples.map(([, y], index) => Math.max(0, y) / experimentalMaximum - theoretical[index] / theoreticalMaximum);
  const peaks = [];
  for (let i = 3; i < residual.length - 3; i++) {
    if (residual[i] < 0.05 || residual[i] <= residual[i - 1] || residual[i] < residual[i + 1]) continue;
    const wing = (residual[i - 3] + residual[i + 3]) / 2;
    if (residual[i] - wing < 0.015) continue;
    peaks.push({ nm: samples[i][0], residual: residual[i] });
  }
  return peaks.sort((a, b) => b.residual - a.residual).slice(0, 12).map(x => ({ nm: x.nm, residual: Number(x.residual.toFixed(4)) }));
}

async function main() {
  const offline = process.argv.includes('--offline');
  fs.mkdirSync(NIST_DIR, { recursive: true });
  const data = JSON.parse(fs.readFileSync(ELEMENTS_PATH, 'utf8'));
  const audit = {
    generated_at: new Date().toISOString(), temperature_K: TEMPERATURE_K,
    atomic_relative_threshold: ATOMIC_RELATIVE_THRESHOLD, usb2000_sigma_nm: USB2000_SIGMA_NM,
    range_nm: RANGE_NM, atomic: {}, molecular: {}, fits: {}, residual_peaks: {},
    limitations: [
      'Le intensita atomiche descrivono emissione otticamente sottile in LTE; autoassorbimento e frazioni di ionizzazione sono assorbiti solo nei fit tra componenti.',
      'Le bande molecolari senza intensita numeriche nella fonte non sono convertite arbitrariamente in picchi quantitativi.',
      'FeO resta un inviluppo sperimentale semplificato: la fonte dichiara non praticabile una simulazione rovibronica quantitativa completa.',
      'I residui sperimentali sono diagnostici e non vengono trasformati automaticamente in nuove emissioni.',
    ],
  };

  for (const [symbol, componentId, spectrum] of ATOMIC_COMPONENTS) {
    const url = nistUrl(spectrum);
    const cachePath = path.join(NIST_DIR, `${spectrum.replace(' ', '_')}.tsv`);
    let text;
    if (offline) {
      text = fs.readFileSync(cachePath, 'utf8').replace(/^# .*\r?\n/, '');
    } else {
      const response = await fetch(url);
      if (!response.ok) throw new Error(`NIST ${spectrum}: HTTP ${response.status}`);
      text = await response.text();
      fs.writeFileSync(cachePath, `# ${url}\n${text}`);
    }
    if (!text.startsWith('obs_wl')) throw new Error(`NIST ${spectrum}: unexpected response`);
    const rows = parseTsv(text);
    const peaks = atomicPeaks(rows);
    if (!peaks.length) throw new Error(`NIST ${spectrum}: no complete lines above threshold`);
    const element = data.elements.find(item => item.symbol === symbol);
    const component = element.spectral_components.find(item => item.id === componentId);
    component.peaks = peaks;
    component.scale = 1;
    component.profile = 'stick';
    component.instrument_sigma_nm = USB2000_SIGMA_NM;
    component.source = url;
    component.method = `Emissività LTE relativa a ${TEMPERATURE_K} K da un unico dataset NIST ASD: g_k*A_ki*exp(-E_k/kT)/lambda, normalizzata al massimo della componente; incluse tutte le righe tra ${RANGE_NM[0]} e ${RANGE_NM[1]} nm con A_ki, E_k e J_k disponibili e intensità relativa >= ${ATOMIC_RELATIVE_THRESHOLD}. Nello spettro teorico ogni transizione è una riga verticale ideale; sigma strumentale USB2000 = ${USB2000_SIGMA_NM} nm usata esclusivamente per fit e confronto sperimentale.`;
    audit.atomic[componentId] = { spectrum, source: url, database_rows: rows.length, retained_lines: peaks.length };
  }

  for (const element of data.elements) {
    for (const component of element.spectral_components ?? []) {
      if (component.kind !== 'molecular') continue;
      const normalized = normalizeMolecular(component);
      if (element.symbol === 'Fe' && component.id === 'FeO') {
        component.method = 'Inviluppo sperimentale semplificato del quasi-continuo FeO tra 530 e 660 nm, normalizzato al massimo intorno a 591 nm. La fonte dichiara non praticabile una simulazione rovibronica quantitativa completa; in assenza di uno spettro USB2000 del ferro, la scala rispetto a Fe I non è calibrata.';
      }
      audit.molecular[`${element.symbol}:${component.id}`] = {
        source: component.source, peaks: component.peaks.length, normalized_from_raw_values: normalized,
      };
    }
  }

  for (const element of data.elements) {
    const fit = fitComponents(element);
    if (fit) audit.fits[element.symbol] = { rmse: Number(fit.rmse.toFixed(6)), shift_nm: fit.shift_nm, scales: fit.coefficients };
    if (EXPERIMENTAL_FILES[element.symbol]) audit.residual_peaks[element.symbol] = residualPeaks(element, fit?.shift_nm ?? 0);
  }

  data.spectralMethod = `Intervallo ${RANGE_NM[0]}-${RANGE_NM[1]} nm in aria. Righe atomiche ideali verticali: unico dataset NIST ASD per specie; emissività relativa otticamente sottile in LTE a ${TEMPERATURE_K} K calcolata come g_k*A_ki*exp(-E_k/kT)/lambda, con soglia relativa ${ATOMIC_RELATIVE_THRESHOLD}. Bande molecolari: profili estesi con rapporti numerici degli spettri isolati citati, senza conversione arbitraria delle sole classificazioni qualitative. La convoluzione USB2000 con sigma = ${USB2000_SIGMA_NM} nm è usata esclusivamente nei fit e nei confronti sperimentali, non nella forma dello spettro teorico. Le scale tra specie dello stesso elemento sono ottenute, quando è disponibile un CSV sperimentale, mediante fit non negativo; i residui non assegnati restano esclusi dal modello.`;

  fs.writeFileSync(ELEMENTS_PATH, `${JSON.stringify(data, null, 2)}\n`);
  fs.writeFileSync(AUDIT_PATH, `${JSON.stringify(audit, null, 2)}\n`);
  console.log(JSON.stringify(audit, null, 2));
}

main().catch(error => {
  console.error(error.stack || error);
  process.exitCode = 1;
});
