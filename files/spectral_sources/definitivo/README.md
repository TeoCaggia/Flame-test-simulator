# Scelte definitive — saggi alla fiamma, 21–22 settembre 2026

Ocean Optics **USB2000 S/N USB2G16606**, 176,5–877,1 nm, 0,34 nm/pixel,
larghezza strumentale **FWHM ≈ 1,3 nm**. Asse corretto da `calibration.py`
(offset −1,865 nm; sul residuo vedi la nota nel README della cartella sopra).

Contenuto:

| file | cosa |
| --- | --- |
| `00_confronto.png` | i dieci elementi in un grafico solo, normalizzati |
| `<El>_<nome>.png` | un elemento per figura: spettro completo + finestra diagnostica |
| `<El>_<nome>.csv` | lo spettro scelto, 2043 punti, con la provenienza nell'intestazione |
| `scelte.csv` | una riga per ogni riga/banda attesa, con altezza e S/R |

Rigenerabile con `python analisi_fiamma/analisi_fiamma.py`.

## Come sono state scelte

Su **oltre settanta registrazioni** della giornata, per ogni elemento il
programma tiene quella che mostra più righe attese sopra S/R 10, e a parità
quella col S/R mediano migliore. Le righe dello spettrogramma vengono ordinate
sull'altezza **sopra il continuo locale** nella finestra dove vive la firma
dell'elemento — non sul massimo assoluto, che quasi sempre è il sodio
contaminante o, quando l'ansa si arroventa, il continuo di incandescenza.

Su ogni spettro: fondo strumentale sottratto (pixel caldi presi dalla
registrazione stessa), punte larghe 1–2 pixel rimosse, righe tosate dal
fondoscala riconosciute dalla cima piatta e mascherate pixel per pixel,
**Na 589 e K 766/770 cancellati** e sostituiti col continuo interpolato
(tranne, ovviamente, negli spettri del sodio e del potassio).

## Risultati

| el | registrazione | integr. | selezione | rumore | righe viste (S/R) |
| --- | --- | --- | --- | --- | --- |
| **Li** | `nightli_usb2000_spettrogramma_20260921_231929` | 800 ms | media delle 2 righe piu intense in 665-675 nm (su 14 | 0.89 | 1/3: Li I 670,8 3877 cts |
| **Na** | `napiudidimiopartesopra_usb2000_spettrogramma_20260922_000450` | 30 ms | media delle 57 righe piu intense in 585-595 nm (su 5 | 0.17 | 3/3: Na I D 589,0/589,6 1420 cts · Na I 818,3/819,5 696 cts · Na I 568,5 724 cts |
| **K** | `fk_usb2000_spettrogramma_20260921_162948` | 200 ms | media delle 8 righe piu intense in 760-775 nm (su 25 | 0.22 | 2/3: K I 766,5 2986 cts · K I 769,9 2560 cts |
| **Mg** | `nightmg_usb2000_spettrogramma_20260921_233744` | 30 ms | riga piu intensa in 492-508 nm (1 righe) | 0.15 | 7/8: Mg I b 517,3 74 cts · MgOH ~371 3 cts · MgOH ~384 9 cts · MgO ~445 7 cts · MgO ~478 14 cts · MgO ~500 186 cts · MgO ~521 74 cts |
| **Ca** | `nightca_usb2000_spettrogramma_20260921_231521` | 800 ms | media delle 2 righe piu intense in 615-630 nm (su 14 | 0.93 | 2/3: CaOH 554 35 cts · CaOH 622 38 cts |
| **Sr** | `fsr_usb2000_spettrogramma_20260921_161953` | 200 ms | media delle 12 righe piu intense in 595-690 nm (su 1 | 0.25 | 5/5: Sr I 460,7 35 cts · SrOH 605 612 cts · SrOH 646 46 cts · SrOH 668 254 cts · SrOH 682 442 cts |
| **Ba** | `ba3_usb2000_spettrogramma_20260921_183643` | 600 ms | media delle 2 righe piu intense in 548-557 nm (su 7) | 1.80 | 5/5: Ba I 553,5 161 cts · BaOH 487 49 cts · BaOH 512 87 cts · BaOH 535 51 cts · BaO 604 62 cts |
| **B** | `fb2_usb2000_spettrogramma_20260921_163915` | 200 ms | media delle 12 righe piu intense in 510-555 nm (su 2 | 0.26 | 5/5: BO2 493,6 18 cts · BO2 518,0 61 cts · BO2 548,0 96 cts · BO2 580,5 24 cts · BO2 620 6 cts |
| **Cu** | `fcu2_usb2000_spettrogramma_20260921_164106` | 200 ms | media delle 8 righe piu intense in 500-560 nm (su 26 | 0.26 | 2/6: Cu I 510,6 3 cts · Cu I 521,8 6 cts |
| **Fe** | `ffe_usb2000_spettrogramma_20260921_162437` | 200 ms | riga piu intensa in 365-445 nm (7 righe) | 0.40 | 0/5:  |

**Sette elementi su dieci identificati senza ambiguità.** Restano:

- **Rame**: le righe atomiche non emergono dal sistema di bande CuOH/CuCl
  490–560 nm, che però è inconfondibile. Identificato dalla banda, non dalle righe.
- **Litio**: la 670,8 è enorme (3877 conteggi) ma le altre due non sono
  raggiungibili in fiamma a gas — i livelli alti stanno a 3,88 e 4,54 eV contro
  1,85 eV, cioè popolazioni 10⁻⁶ e 10⁻⁸ volte. Non è un problema di misura.
- **Ferro**: nessun segnale, come previsto. Le righe Fe I chiedono ~3700 K, fuori
  portata per qualunque fiamma chimica (acetilene/N₂O arriva a ~3000 K).

Due risultati che meritano una riga:

- **Sodio.** La ripresa delle 00:04 mostra anche **818,3/819,5 e 568,5**, che al
  pomeriggio erano a 3 e 1 conteggi. Il rapporto D/818 vale 2, mentre la 818
  dovrebbe essere molto più debole: la riga D è **autoassorbita**, satura otticamente,
  e mentre lei non cresce più le righe deboli continuano a salire.
- **Magnesio.** Tutto molecolare — MgO 500 (il più forte di tutti, 186 conteggi
  in 30 ms) più MgO 478/445/521 e MgOH 371/384, su un continuo largo che è
  l'MgO incandescente. La riga di risonanza Mg I 285,2 non c'è. È l'elemento più
  luminoso per unità di tempo dopo Na e K: 6,2 conteggi/ms, 13 volte il boro.

## Limiti

- Il magnesio è una registrazione da **una riga sola, 30 ms, 2 secondi**: niente
  media, niente fondo dalla registrazione. Il segnale è abbondante, manca la
  statistica.
- Nessuna correzione per la risposta spettrale: le ampiezze si confrontano fra
  campioni alla stessa lunghezza d'onda, non fra lunghezze d'onda diverse.
- Le posizioni delle teste di banda molecolari sono valori di letteratura
  arrotondati: 1–2 nm di scarto col massimo misurato non indicano un errore di
  calibrazione, a differenza delle righe atomiche.
- Il sodio contamina tutti e dieci i campioni, e il potassio è forte nello
  stronzio: entrambi cancellati, ma sotto le finestre cancellate non c'è più
  informazione.
