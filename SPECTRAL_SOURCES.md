# Dati spettrali e criteri del visualizzatore

Verifica: 20 settembre 2026. Intervallo: **380-770 nm in aria**.

## Righe atomiche

Per ogni elemento neutro e stata usata la query NIST ASD con `line_out=3`, cioe
"Only with observed wavelengths or intensities". Non sono applicati filtri su energia,
probabilita o tipo: sono incluse anche le transizioni proibite presenti nel risultato.
Se la lunghezza osservata manca ma e presente `Rel. int.`, viene usata la lunghezza Ritz.
L intensita del picco e la parte numerica di `Rel. int.`, normalizzata al massimo dello
stesso spettro atomico. I descrittori NIST (`bl`, `c`, `h`, `l`, `*`, ecc.) restano nel
campo grezzo dei file ASCII. Le emissioni senza `Rel. int.` numerica sono escluse
completamente dai dati usati e dal grafico.

NIST precisa che le intensita relative dipendono dalla fonte, non hanno una scala comune
e sono qualitative. Il visualizzatore segue comunque `Rel. int.` come richiesto.

## Bande molecolari

Sono incluse solo specie compatibili con il reagente mostrato o con prodotti/transienti
plausibili della sua decomposizione in fiamma: BO2; CaCl e CaOH; FeO; CuOH, CuH e CuO;
SrOH e SrO/Sr2O2; BaOH e BaO. Non compaiono CuCl, SrCl o BaCl perche i reagenti mostrati
sono rispettivamente CuSO4, Sr(NO3)2 e Ba(NO3)2. Per LiCl, NaCl, KCl, RbCl e CsCl non
sono state aggiunte bande molecolari visibili prive di una base sperimentale pertinente.

I rapporti interni delle bande provengono dalle fonti. La scala molecola/atomo e stimata
dai loro spettri compositi ed e dichiarata in ogni file ASCII: e verosimile, non una
calibrazione assoluta per questo specifico bunsen, concentrazione o tempo di esposizione.

## Disegno e colore

Le posizioni non sono spostate. Le righe hanno sigma 0,18 nm; le bande usano larghezze
illustrative dichiarate nei dati. La curva piu alta della vista arriva vicino al bordo
superiore. Il tratto e 1,2375, il 25% meno di 1,65. Il gradiente a 1 nm deriva dai
campioni RGB mediani della barra cromatica di riferimento fornita dall utente.

## File ASCII

La cartella `files/spectral_data_ascii/` contiene un file per elemento. Ogni riga indica
specie, lunghezza d onda, intensita grezza e numerica, intensita normalizzata, scala della
specie, altezza effettiva nel grafico, tipo di transizione, riferimento e note.

## Fonti

- [NIST ASD - Lines Form](https://physics.nist.gov/PhysRefData/ASD/lines_form.html)
- [NIST ASD - Lines Help](https://physics.nist.gov/PhysRefData/ASD/Html/lineshelp.html)
- [Meyerriecks e Kosanke 2003 - emettitori molecolari in fiamma](https://www.jpyro.co.uk/wp-content/uploads/j18_1_fglk1.pdf)
- [Guo et al. 2020 - BO2, figura 5](https://eprints.lib.hokudai.ac.jp/repo/huscap/all/84211/Guo_CNF_manuscript_20190819.pdf)
- [B-Flame Emission 1970 - teste di banda BO2](https://digital.library.unt.edu/ark:/67531/metadc1016571/m2/1/high_res_d/4372186.pdf)
- [FeO orange bands - teste e inviluppi](https://academic.oup.com/mnras/article/500/4/4296/5974545)

### Query NIST esatte

- [Li I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Li%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [B I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=B%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [Na I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Na%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [K I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=K%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [Ca I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Ca%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [Fe I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Fe%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [Cu I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Cu%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [Rb I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Rb%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [Sr I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Sr%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [Cs I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Cs%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)
- [Ba I](https://physics.nist.gov/cgi-bin/ASD/lines1.pl?spectra=Ba%20I&limits_type=0&low_w=380&upp_w=770&unit=1&format=3&line_out=3&en_unit=1&output=0&page_size=5000&show_obs_wl=1&show_calc_wl=1&intens_out=on&enrg_out=on&bibrefs=1&order_out=0&show_av=2&tsb_value=0&allowed_out=1&forbid_out=1&A_out=0&J_out=on)

### Contenuto visualizzato

| Elemento | Specie: segnali con intensita |
|---|---|
| Li | Li I: 16 |
| B | B I: 7; BO2: 6 |
| Na | Na I: 62 |
| K | K I: 39 |
| Ca | Ca I: 75; CaCl: 8; CaOH: 8 |
| Fe | Fe I: 2466; FeO: 3 |
| Cu | Cu I: 167; CuOH: 6; CuH: 8; CuO: 13 |
| Rb | Rb I: 30 |
| Sr | Sr I: 177; SrOH: 9; SrO/Sr2O2: 2 |
| Cs | Cs I: 10 |
| Ba | Ba I: 125; BaO condensed: 1; BaOH: 5; BaO gas: 33 |

## Riproduzione

1. `scripts/fetch_spectral_sources.ps1 -Force` aggiorna i dati NIST.
2. `python scripts/build_spectral_data.py` ricostruisce JSON e file ASCII.
3. `node scripts/check_spectra.cjs` esegue la regressione numerica/SVG.
4. `python flame_generator.py` genera l HTML autonomo.
