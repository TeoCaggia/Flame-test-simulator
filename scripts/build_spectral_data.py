"""Build the viewer data and an ASCII audit from checked-in primary sources."""
import csv
import json
import re
import unicodedata
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
SOURCES = ROOT / 'files' / 'spectral_sources'
ASCII_DIR = ROOT / 'files' / 'spectral_data_ascii'
PAPER = 'https://www.jpyro.co.uk/wp-content/uploads/j18_1_fglk1.pdf'
BORON = 'https://eprints.lib.hokudai.ac.jp/repo/huscap/all/84211/Guo_CNF_manuscript_20190819.pdf'
BORON_BANDS = 'https://digital.library.unt.edu/ark:/67531/metadc1016571/m2/1/high_res_d/4372186.pdf'
FEO = 'https://academic.oup.com/mnras/article/500/4/4296/5974545'

# Median RGB samples taken from the user-supplied visible-spectrum reference.
# Linear interpolation produces the one-nanometre palette embedded in the viewer.
REFERENCE_COLOR_STOPS = [
    (380, (97, 0, 204)), (400, (48, 0, 224)), (420, (0, 0, 245)),
    (440, (1, 128, 252)), (460, (1, 192, 246)), (480, (1, 205, 170)),
    (500, (1, 219, 94)), (520, (2, 232, 19)), (540, (64, 234, 1)),
    (560, (146, 233, 0)), (580, (228, 230, 3)), (600, (243, 207, 2)),
    (620, (242, 178, 2)), (640, (241, 150, 1)), (660, (245, 45, 0)),
    (680, (235, 5, 0)), (700, (229, 1, 2)), (720, (229, 1, 2)),
    (740, (229, 1, 2)), (770, (229, 1, 2)),
]

def reference_color(nm):
    for (left_nm, left_rgb), (right_nm, right_rgb) in zip(REFERENCE_COLOR_STOPS, REFERENCE_COLOR_STOPS[1:]):
        if nm <= right_nm:
            ratio = (nm - left_nm) / (right_nm - left_nm)
            return [round(a + (b-a)*ratio) for a,b in zip(left_rgb, right_rgb)]
    return list(REFERENCE_COLOR_STOPS[-1][1])

# Scale of each atomic spectrum relative to the molecular emitters in the same
# reagent spectrum. Alkalis have no molecular component in the visible model.
ATOMIC_SCALE = {'B': .12, 'Ca': .18, 'Fe': .45, 'Cu': .15, 'Sr': .18, 'Ba': .60}

def flame_atomic_weight(symbol, nm):
    # NIST Rel. int. remains the base value. These two source-response
    # corrections adapt arc/lamp measurements to the observed flame colour.
    if symbol == 'Cs':
        return 1.0 if nm < 430 else (.20 if nm < 650 else .02)
    if symbol == 'Fe':
        return .12 if nm < 450 else (.35 if nm < 560 else (1.0 if nm < 700 else .25))
    return 1.0

# Only species compatible with the displayed reagent or plausible transient
# decomposition/oxidation products in a flame are included. Cross-species
# scales are documented estimates from the cited composite flame spectra.
MOLECULES = {
    'Ca': [
        ('CaCl', 1.00, 2.0, 'molecular vibronic band', PAPER,
         [(581,3),(593,45),(605,11),(608,14),(619,99),(621,100),(633,9),(635,8)],
         'CaCl2 reagent; scale anchored to the dominant CaCl bands in Fig. 14.'),
        ('CaOH', .15, 2.5, 'molecular vibronic band', PAPER,
         [(555,45),(572,1),(594,7),(600,11),(604,14),(625,100),(645,10),(665,1)],
         'Transient hydroxide in the moist flame; relative scale estimated from Fig. 14.'),
    ],
    'Sr': [
        ('SrOH', 1.00, 2.5, 'molecular vibronic band', PAPER,
         [(606,59),(620,2),(626,2),(649,13),(659,33),(671,70),(682,100),(707,9),(722,1)],
         'Dominant molecular emitter from aqueous Sr(NO3)2; Fig. 11.'),
        ('SrO/Sr2O2', .05, 1.8, 'molecular vibronic band; assignment uncertain', PAPER,
         [(593,100),(597,88)],
         'Nitrate decomposition/oxidation product; source explicitly reports an uncertain SrO/Sr2O2 assignment.'),
    ],
    'Ba': [
        ('BaO condensed', .12, 32, 'condensed-phase molecular continuum', PAPER,
         [(750,100)],
         'Broad BaO continuum approximated from Fig. 15b; nitrate decomposition product.'),
        ('BaOH', .65, 2.5, 'molecular vibronic band', PAPER,
         [(488,72),(502,30),(513,100),(524,86),(745,47)],
         'Transient hydroxide in a moist flame; scale estimated from composite Fig. 15a.'),
        ('BaO gas', .70, 2.0, 'molecular vibronic band', PAPER,
         [(485,72),(497,100),(514,87),(526,97),(533,100),(535,90),(546,16),
          (551,68),(567,51),(574,36),(583,32),(589,93),(608,88),(612,59),
          (617,34),(623,32),(626,29),(632,79),(642,26),(653,71),(656,57),
          (663,39),(682,56),(686,33),(693,26),(701,10),(710,50),(718,46),
          (725,14),(734,32),(744,16),(752,26),(761,41)],
         'Gas-phase oxide; Appendix column H. Scale estimated from Fig. 15a/e.'),
    ],
    'Cu': [
        ('CuOH', 1.00, 3.0, 'molecular vibronic band', PAPER,
         [(505,46),(512,44),(524,75),(533,84),(546,100),(605,10)],
         'Dominant copper emitter in the aqueous-flame spectrum; applicable to CuSO4 in a moist flame.'),
        ('CuH', .40, 1.7, 'molecular vibronic band', PAPER,
         [(401,18),(407,12),(413,10),(416,7),(428,100),(433,55),(441,38),(444,24)],
         'Transient hydride in the fuel-rich part of the flame; scale estimated from Fig. 17/18.'),
        ('CuO', .25, 2.2, 'molecular vibronic band', PAPER,
         [(450,25),(453,27),(458,33),(467,52),(471,53),(477,57),(480,66),
          (486,69),(488,83),(492,100),(606,42),(616,59),(632,47)],
         'CuSO4 decomposition/oxidation product; scale estimated from Fig. 17/18.'),
    ],
}

def first_number(text):
    match = re.search(r'[+\-]?(?:\d+\.?\d*|\.\d+)(?:[eE][+\-]?\d+)?', text or '')
    return float(match[0]) if match else None

def ascii_text(value):
    value = unicodedata.normalize('NFKD', str(value)).encode('ascii', 'ignore').decode('ascii')
    return value.replace('|', '/').replace('\r', ' ').replace('\n', ' ')

def atomic(symbol, query_url):
    rows, grouped = [], {}
    path = SOURCES / f'{symbol}_I.tsv'
    with path.open(encoding='utf-8-sig', newline='') as stream:
        for source_row in csv.DictReader(stream, delimiter='\t'):
            obs = source_row.get('obs_wl_air(nm)', '').strip()
            ritz = source_row.get('ritz_wl_air(nm)', '').strip()
            raw_intensity = source_row.get('intens', '').strip()
            # NIST line_out=3 criterion, repeated here to make the build auditable.
            if not (obs or raw_intensity):
                continue
            nm = first_number(obs) if obs else first_number(ritz)
            if nm is None or not 380 <= nm <= 770:
                continue
            numeric = first_number(raw_intensity)
            if numeric is None or numeric <= 0:
                continue
            transition = source_row.get('Type', '').strip() or 'E1'
            row = {
                'species': symbol + ' I', 'wavelength_nm': nm,
                'wavelength_kind': 'observed' if obs else 'Ritz (intensity present)',
                'rel_intensity_raw': raw_intensity,
                'rel_intensity_numeric': numeric,
                'transition_type': transition,
                'line_ref': source_row.get('line_ref', '').strip(),
                'tp_ref': source_row.get('tp_ref', '').strip(),
            }
            rows.append(row)
            grouped[nm] = grouped.get(nm, 0) + numeric * flame_atomic_weight(symbol, nm)
    maximum = max(grouped.values(), default=1)
    scale = ATOMIC_SCALE.get(symbol, 1.0)
    for row in rows:
        value = row['rel_intensity_numeric']
        row['normalized_within_species'] = value * flame_atomic_weight(symbol, row['wavelength_nm']) / maximum if value is not None and value > 0 else None
        row['plotted_relative'] = row['normalized_within_species'] * scale if row['normalized_within_species'] is not None else None
    component = {
        'id': symbol+' I', 'kind': 'atomic', 'scale': scale,
        'method': 'NIST ASD Rel. int.; normalized for this neutral-atom spectrum and balanced for observed flame conditions where required.',
        'source': query_url,
        'peaks': [{'nm':nm, 'strength':value/maximum, 'sigma_nm':.18}
                  for nm,value in sorted(grouped.items())],
        'markers': [],
    }
    return component, rows

def molecular_component(spec):
    name, scale, sigma, transition, source, values, note = spec
    maximum = max(value for _, value in values)
    return {
        'id': name, 'kind': 'molecular', 'scale': scale, 'source': source,
        'method': f'{note} Internal ratios from the cited source; cross-species scale is an explicit visual estimate.',
        'transition_type': transition,
        'peaks': [{'nm':nm, 'strength':value/maximum, 'sigma_nm':sigma} for nm,value in values],
        'markers': [], 'raw_values': values,
    }

def special_molecules(symbol):
    if symbol == 'B':
        return [{
            'id':'BO2', 'kind':'molecular', 'scale':1.0, 'source':BORON,
            'method':'Boric-acid fluctuation bands. Relative heights are approximate readings of the green-flame curve in Guo et al. Fig. 5; 452 nm is constrained by the B-Flame compilation.',
            'transition_type':'molecular chemiluminescence band',
            'peaks':[{'nm':nm,'strength':value/100,'sigma_nm':3.0}
                     for nm,value in [(452,10),(472,20),(493,30),(518,60),(547,100),(580,50)]],
            'markers':[], 'raw_values':[(452,10),(472,20),(493,30),(518,60),(547,100),(580,50)],
            'secondary_source':BORON_BANDS,
        }]
    if symbol == 'Fe':
        return [{
            'id':'FeO', 'kind':'molecular', 'scale':1.0, 'source':FEO,
            'method':'Broad envelopes around the three prominent FeO orange-band peaks. Positions are measured/assigned; relative heights are a conservative visual estimate for a flame spectrum.',
            'transition_type':"FeO D'/D -> X orange-band blend",
            'peaks':[{'nm':nm,'strength':value/100,'sigma_nm':7.0}
                     for nm,value in [(566,85),(591,100),(626,80)]],
            'markers':[], 'raw_values':[(566,85),(591,100),(626,80)],
        }]
    return []

def write_ascii(element, components, atomic_rows):
    lines = [
        '# Flame-test spectral data used by the viewer',
        '# element: ' + ascii_text(element['name']) + ' (' + element['symbol'] + ')',
        '# reagent: ' + ascii_text(element['reagentName']) + ' (' + element['reagentFormula'] + ')',
        '# range_nm: 380-770 air wavelengths',
        '# NIST criterion: line_out=3, Only with observed wavelengths or intensities',
        '# Atomic intensity: numeric part of NIST Rel. int.; source-dependent and qualitative.',
        '# Molecular intensity: within-species source ratio; cross-species scale is an explicit estimate.',
        '# Emissions without a positive numeric relative intensity are excluded.',
        '# fields: species|wavelength_nm|wavelength_kind|rel_intensity_raw|rel_intensity_numeric|normalized_within_species|component_scale|plotted_relative|transition_type|source_ref|notes',
    ]
    atomic_component = next(c for c in components if c['kind'] == 'atomic')
    for row in atomic_rows:
        fields = [row['species'], f"{row['wavelength_nm']:.8f}".rstrip('0').rstrip('.'),
                  row['wavelength_kind'], row['rel_intensity_raw'],
                  '' if row['rel_intensity_numeric'] is None else f"{row['rel_intensity_numeric']:g}",
                  '' if row['normalized_within_species'] is None else f"{row['normalized_within_species']:.9g}",
                  f"{atomic_component['scale']:.6g}",
                  '' if row['plotted_relative'] is None else f"{row['plotted_relative']:.9g}",
                  row['transition_type'], row['line_ref'] or row['tp_ref'],
                  'NIST ASD Rel. int. descriptor preserved in raw field']
        lines.append('|'.join(ascii_text(v) for v in fields))
    for component in components:
        if component['kind'] != 'molecular':
            continue
        for nm, raw in component['raw_values']:
            strength = next(p['strength'] for p in component['peaks'] if p['nm'] == nm)
            fields = [component['id'], f'{nm:g}', 'band center', f'{raw:g}', f'{raw:g}',
                      f'{strength:.9g}', f"{component['scale']:.6g}",
                      f"{strength*component['scale']:.9g}", component['transition_type'],
                      component['source'], component['method']]
            lines.append('|'.join(ascii_text(v) for v in fields))
    (ASCII_DIR / f"{element['symbol']}_spectrum.txt").write_text('\n'.join(lines)+'\n', encoding='ascii')

def build_documentation(data, queries):
    lines = [
        '# Dati spettrali e criteri del visualizzatore', '',
        'Verifica: 20 settembre 2026. Intervallo: **380-770 nm in aria**.', '',
        '## Righe atomiche', '',
        'Per ogni elemento neutro e stata usata la query NIST ASD con `line_out=3`, cioe',
        '"Only with observed wavelengths or intensities". Non sono applicati filtri su energia,',
        'probabilita o tipo: sono incluse anche le transizioni proibite presenti nel risultato.',
        'Se la lunghezza osservata manca ma e presente `Rel. int.`, viene usata la lunghezza Ritz.',
        'L intensita del picco e la parte numerica di `Rel. int.`, normalizzata al massimo dello',
        'stesso spettro atomico. I descrittori NIST (`bl`, `c`, `h`, `l`, `*`, ecc.) restano nel',
        'campo grezzo dei file ASCII. Le emissioni senza `Rel. int.` numerica sono escluse',
        'completamente dai dati usati e dal grafico.', '',
        'NIST precisa che le intensita relative dipendono dalla fonte, non hanno una scala comune',
        'e sono qualitative. Il visualizzatore segue comunque `Rel. int.` come richiesto.', '',
        '## Bande molecolari', '',
        'Sono incluse solo specie compatibili con il reagente mostrato o con prodotti/transienti',
        'plausibili della sua decomposizione in fiamma: BO2; CaCl e CaOH; FeO; CuOH, CuH e CuO;',
        'SrOH e SrO/Sr2O2; BaOH e BaO. Non compaiono CuCl, SrCl o BaCl perche i reagenti mostrati',
        'sono rispettivamente CuSO4, Sr(NO3)2 e Ba(NO3)2. Per LiCl, NaCl, KCl, RbCl e CsCl non',
        'sono state aggiunte bande molecolari visibili prive di una base sperimentale pertinente.', '',
        'I rapporti interni delle bande provengono dalle fonti. La scala molecola/atomo e stimata',
        'dai loro spettri compositi ed e dichiarata in ogni file ASCII: e verosimile, non una',
        'calibrazione assoluta per questo specifico bunsen, concentrazione o tempo di esposizione.', '',
        '## Disegno e colore', '',
        'Le posizioni non sono spostate. Le righe hanno sigma 0,18 nm; le bande usano larghezze',
        'illustrative dichiarate nei dati. La curva piu alta della vista arriva vicino al bordo',
        'superiore. Il tratto e 1,2375, il 25% meno di 1,65. Il gradiente a 1 nm deriva dai',
        'campioni RGB mediani della barra cromatica di riferimento fornita dall utente.', '',
        '## File ASCII', '',
        'La cartella `files/spectral_data_ascii/` contiene un file per elemento. Ogni riga indica',
        'specie, lunghezza d onda, intensita grezza e numerica, intensita normalizzata, scala della',
        'specie, altezza effettiva nel grafico, tipo di transizione, riferimento e note.', '',
        '## Fonti', '',
        '- [NIST ASD - Lines Form](https://physics.nist.gov/PhysRefData/ASD/lines_form.html)',
        '- [NIST ASD - Lines Help](https://physics.nist.gov/PhysRefData/ASD/Html/lineshelp.html)',
        '- [Meyerriecks e Kosanke 2003 - emettitori molecolari in fiamma](https://www.jpyro.co.uk/wp-content/uploads/j18_1_fglk1.pdf)',
        '- [Guo et al. 2020 - BO2, figura 5](https://eprints.lib.hokudai.ac.jp/repo/huscap/all/84211/Guo_CNF_manuscript_20190819.pdf)',
        '- [B-Flame Emission 1970 - teste di banda BO2](https://digital.library.unt.edu/ark:/67531/metadc1016571/m2/1/high_res_d/4372186.pdf)',
        '- [FeO orange bands - teste e inviluppi](https://academic.oup.com/mnras/article/500/4/4296/5974545)', '',
        '### Query NIST esatte', ''
    ]
    lines += [f'- [{symbol} I]({url})' for symbol,url in queries['nist'].items()]
    lines += ['', '### Contenuto visualizzato', '', '| Elemento | Specie: segnali con intensita |', '|---|---|']
    for element in data['elements']:
        counts = '; '.join(f"{c['id']}: {len(c['peaks'])}" for c in element['spectral_components'])
        lines.append(f"| {element['symbol']} | {counts} |")
    lines += ['', '## Riproduzione', '',
              '1. `scripts/fetch_spectral_sources.ps1 -Force` aggiorna i dati NIST.',
              '2. `python scripts/build_spectral_data.py` ricostruisce JSON e file ASCII.',
              '3. `node scripts/check_spectra.cjs` esegue la regressione numerica/SVG.',
              '4. `python flame_generator.py` genera l HTML autonomo.']
    (ROOT / 'SPECTRAL_SOURCES.md').write_text('\n'.join(lines)+'\n', encoding='utf-8')

def main():
    path = ROOT / 'files' / 'elements.json'
    data = json.loads(path.read_text(encoding='utf-8'))
    queries = json.loads((SOURCES / 'queries.json').read_text(encoding='utf-8-sig'))
    ASCII_DIR.mkdir(parents=True, exist_ok=True)
    audit = {}
    for element in data['elements']:
        symbol = element['symbol']
        atom, atomic_rows = atomic(symbol, queries['nist'][symbol])
        components = [atom]
        components += [molecular_component(spec) for spec in MOLECULES.get(symbol, [])]
        components += special_molecules(symbol)
        for key in ['lines_nm','line_strengths','background_lines_nm','background_line_strengths','molecular_bands']:
            element.pop(key, None)
        element['spectral_components'] = components
        audit[symbol] = atomic_rows
        write_ascii(element, components, atomic_rows)
        print(symbol, ', '.join(f"{c['id']}: {len(c['peaks'])} peaks" for c in components))
    data['spectralPalette'] = [[nm, reference_color(nm)] for nm in range(380, 771)]
    data['spectralMethod'] = ('380-770 nm in aria. Righe atomiche: NIST line_out=3 e Rel. int. normalizzata. '
        'Bande molecolari: rapporti sperimentali e scala rispetto agli atomi stimata dai relativi spettri di fiamma. '
        'La scala cromatica deriva dall immagine di riferimento fornita. Le posizioni senza intensita numerica '
        'sono escluse.')
    path.write_text(json.dumps(data, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    (SOURCES / 'atomic_audit.json').write_text(json.dumps(audit, ensure_ascii=False, indent=2)+'\n', encoding='utf-8')
    build_documentation(data, queries)

if __name__ == '__main__':
    main()
