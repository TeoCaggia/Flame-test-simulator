# Revisione materiali e illuminazione — 3 ottobre 2026

## Vincoli da conservare
- Rendering massimo 30 FPS, fiamma a risoluzione piena. Hardware utente misurato con ?bench: Intel HD Graphics 400 (ANGLE D3D11), canvas 920x709, pixel ratio 1 (il riferimento precedente a UHD 630 era errato).
- L'innesto del filo è una boccola opaca MeshLambertMaterial: non ripristinare la punta riflettente in vetro.
- Conservare interazioni, transizioni, modalità rapida, centro camera sull'uscita Bunsen e file della versione statica.
- Nessun push/commit richiesto. Le modifiche esistenti a spettri e dati non fanno parte di questa revisione.

## Obiettivo
Migliorare legno, finiture dei materiali e luce della fiamma con costi contenuti. Evitare rumore artificiale, texture sporche uniformi e nuovi passaggi GPU costosi.

## Stato
- Prima revisione completata e incorporata in `../output/flame_viewer.html`.
- Il ritaglio 300×56 è sostituito da `viewer/textures/dark-walnut-albedo.png` (1774×887, circa 1,9 MB), generata con imagegen integrato. Una singola immagine condivisa, quattro orientamenti/porzioni UV per piano, cassetti, struttura e bordi. Roughness a bassa risoluzione e basso contrasto derivata dall'albedo, senza falsi rilievi o sporco aggiunto.
- `flame_generator.py` incorpora l'asset in `sceneTextures.wood`. Il caricamento attende la decodifica prima di creare/preparare la scena. Rimossi dal precaricamento i vecchi sfondi non usati; i file restano conservati.
- Finiture: legno satinato con riflesso largo, piastrelle ceramiche distinte dalle fughe, grigi metallici differenziati, ottone meno lucido, gomma morbida, carta e polvere più opache, rilievo del sughero ridotto per evitare rumore a distanza.
- Illuminazione: ambiente di riflessione più morbido (PMREM .09), ambiente .26, luce principale .38, riempimento posteriore .08, esposizione 1.05. Luce colorata conserva il colore sRGB dell'elemento e aggiunge una modulazione d'intensità di soli ±5,3%, senza spostare la sorgente.
- Ombre colorate: quattro volumi analitici morbidi per contenuto/tappo del barattolo, canna e base del Bunsen. Sono un'approssimazione deliberata per evitare sei passaggi di shadow map cubica; non simulano caustiche o occlusione esatta di ogni parte. Le ombre direzionali e la trasmissione attenuata del vetro restano presenti.
- Nessun aumento di DPR, risoluzione della fiamma, numero di luci o passaggi di rendering. Costo aggiunto: calcoli analitici nel fragment shader e nuova texture; prestazioni globali e utilizzo GPU non misurati.
- Verifiche PASS: sintassi JS, rigenerazione, diff whitespace, corrispondenza sorgenti incorporate, test CPU con geometrie Three reali per mappe/filtro, boccola Lambert opaca, preload, colori dei sali, transizioni dei reagenti e neutro, ritorno bacchetta, 30 FPS e 64 campioni della fiamma. Compilazione nativa GPU di tre shader reali espansi (vetro, metallo, legno con clearcoat) riuscita.
- Verifica visiva del viewer e fluidità su hardware utente ancora da fare.
- Nota dati: `files/elements.json` contiene 11 elementi; il generatore mantiene l'esclusione già esistente di Fe (`VIEWER_EXCLUDED_ELEMENTS`). Questa revisione non cambia gli elementi pubblicati né i dati spettrali.

## Prompt dell'asset (imagegen integrato)
Create a production-ready photorealistic diffuse/albedo texture for a dark walnut laboratory workbench and matching cabinet. A single flat rectangular wood surface filling the entire frame, viewed exactly orthographically from above, grain runs horizontally left to right. Fine real walnut pores and gently irregular long grain, subtle broad warm brown variation, restrained small natural knots, dark chocolate brown but enough midtone detail to remain readable in a dim laboratory. Satin oiled wood. Completely even shadow-free diffuse illumination, no baked highlights, no vignette, no perspective, no objects, no labels, no borders, no deep scratches, no artificial grain/noise, no panel gaps. High resolution landscape image, ideally 2048x1024. This will be mapped onto 3D furniture; it must be a texture asset, not a furniture photograph.

## Ripresa
Leggere questo file e `viewer/bunsen_scene.js`. Anche le altre sei texture sono ora completate, vedere aggiornamento sotto. Ripartire dalla verifica visiva richiesta all'utente (inquadratura iniziale, materiali, riflessi, ombre di Na/Cu/K, ritorno al neutro); non ripetere generazione o test già passati se non cambia il codice. Se il carico è troppo alto, misurare prima il costo dei volumi analitici; mantenere texture e fiamma a risoluzione piena. Non è stato creato un monitor o un riavvio automatico dopo il rinnovo della quota.

Generazione: `C:\Users\teoca\.cache\codex-runtimes\codex-primary-runtime\dependencies\python\python.exe flame_generator.py` dalla radice del progetto. Scrivere i file UTF-8 esplicitamente per evitare conversioni Windows cp1252. I file di test temporanei di questa revisione sono stati eliminati.

## Aggiornamento: altre texture
- Sei asset indipendenti generati con imagegen integrato e salvati in `viewer/textures/`: `metal.png`, `ceramic.png`, `rubber.png`, `cork.png`, `paper.png`, `salt.png`. Prompt completi in `viewer/textures/README.md`.
- Metallo: una mappa di rugosità condivisa tra canna/base/anello del Bunsen e raccordi, mantenendo le differenze di finitura dei materiali. Gomma: mappa di rugosità dedicata, colore rosso invariato. Piastrelle: albedo a contrasto molto ridotto e rugosità dello smalto; flangia gialla usa solo la stessa rugosità.
- Sughero: albedo fotografica sostituisce i puntini procedurali; eliminata la vecchia bump map. Sale: albedo neutra attenuata, tinta specifica del reagente conservata. Carta: sfondo fotografico sotto il testo dinamico, anche al cambio elemento.
- Mappe albedo alla risoluzione originale; sole mappe di rugosità a 512×512, calcolate una volta al caricamento. Mipmap, filtro anisotropico fino a 8 e ripetizione speculare limitano aliasing e giunzioni. Nessun nuovo passaggio di rendering, luce o geometria; nuove texture richiedono memoria e campionamenti aggiuntivi, costo su UHD 630 non misurato.
- Tutti e sette gli asset (legno incluso) incorporati in `sceneTextures`, decodificati prima della creazione della scena e del warmup. Output rigenerato.
- PASS: sintassi dei due JS, generazione, diff whitespace; costruzione CPU con Three reale e renderer simulato, preload/warmup, mappe condivise e filtri, carta/formule per tutti i 10 elementi pubblicati, ritorno al neutro, vetro e boccola Lambert preservati, uguaglianza byte degli asset incorporati e dei sorgenti JS.
- Nessun browser aperto in questo aggiornamento. Verifica visiva nel viewer e misurazione GPU restano non eseguite. Limite 30 FPS, fiamma, illuminazione, animazioni e interazioni invariati.

## Aggiornamento 4 ottobre 2026: armadietto dei reagenti e fiamma
- Armadietto a ripiani in noce a sinistra sul banco (3 ripiani, binari in ottone; cartellini sul bordo rimossi su richiesta), un barattolo a bocca larga con tappo di sughero ed etichetta per ogni elemento pubblicato (`elements` passato da `viewer.js` a `createBunsenScene`).
- Selezione: il barattolo sul banco torna al suo posto e, superata la metà del rientro, quello nuovo viene sollevato oltre il binario, estratto e posato accanto al Bunsen (`transitionElement`). `setElement` sposta i barattoli all'istante solo fuori dalle transizioni. Cliccabile solo il barattolo fermo sul banco.
- Ombra analitica del vetro e occlusione della luce colorata seguono il barattolo in movimento; ombra di contatto che sfuma al sollevamento. Shadow camera estesa all'armadietto, pozza di luce spostata a sinistra.
- Bunsen: aggiunta valvola a spillo con manopola zigrinata. Fiamma: cono interno a guscio luminoso, mantello violaceo, punta e pennacchio colorato sfrangiati dalla turbolenza, zona più brillante sopra la perlina.
- PASS: sintassi, scena reale con renderer simulato in Node, 6 transizioni e deselezione senza collisioni (ripiani, binari, fianchi, altri barattoli, bruciatore), anteprima software della composizione, porting CPU dello shader della fiamma. Verifica nel browser e costo GPU non misurati.

## Ripresa 4 ottobre 2026 (dopo interruzione)
- Verificato che la sessione precedente era completa: output rigenerato dopo l'ultima modifica, moduli `bunsen_scene.js`/`bunsen_flame.js` incorporati identici, sintassi dei tre JS OK (Node in `codex-primary-runtime\dependencies\node\bin`), nessun errore di spazi nel diff.
- Prossimo passo invariato: verifica visiva e di fluidità da parte dell'utente su `output/flame_viewer.html`.

## Alleggerimento GPU e fluidità barattoli (4 ottobre 2026)
Riscontro utente: GPU fissa oltre il 90%, barattoli senza collisioni ma movimento molto scattoso.
- Ritmo dei fotogrammi: i due limiti a 30 FPS (`animate` e `render` in `viewer.js`) erano rigidi a 33,3 ms e usavano orologi diversi; con un jitter minimo saltavano un fotogramma (cadenza 33/50/66 ms). Ora hanno 4 ms di tolleranza: 30 FPS regolari su schermi a 60 Hz, limite effettivo circa 34 FPS.
- `animateChange`: avanzamento limitato a [0,1] (il primo timestamp rAF può precedere l'avvio e generava un piccolo salto all'indietro).
- Pass di trasmissione del vetro (copia MSAA della scena opaca + mipmap ogni fotogramma) a `transmissionResolutionScale=.5`: un quarto dei pixel. Rifrazione leggermente più morbida.
- Luci puntiformi: le ombre analitiche (4 volumi + vetro) si calcolano solo se la luce contribuisce (luce colorata spenta senza campione, luce blu oltre il raggio di 6).
- Depth pass per l'occlusione della fiamma ristretto con scissor al riquadro a schermo del volume della fiamma (+8 px).
- Shadow map durante il trasporto di un barattolo: circa 15 aggiornamenti/s invece di uno per fotogramma, aggiornamento esatto all'arrivo. L'ombra analitica del vetro e l'ombra di contatto restano a ogni fotogramma.
- Fiamma: i campioni fuori dal volume emissivo escono prima delle letture di rumore (limite conservativo sul sway). Risoluzione piena, 48 passi, forma invariata.
- PASS: sintassi dei tre JS, rigenerazione, moduli incorporati identici. Non verificati: compilazione GPU dello shader modificato, misura del carico, resa visiva. Da confermare dall'utente.
- Prossime leve se non basta: barattoli dell'armadietto con vetro non trasmissivo, scala trasmissione .35, ombre analitiche solo per la luce principale.

## Vetro davanti alla fiamma e banco di prova GPU (4 ottobre 2026)
Riscontro utente dopo l'alleggerimento: GPU ancora al 99%, cambio barattolo un po' più fluido ma non ottimo, vetro nitido (ok), la fiamma compariva sopra la bacchetta/oggetti che le passano davanti.
- Causa: il vetro (manico della bacchetta, barattoli) era escluso dalla profondità e la fiamma, disegnata dopo, finiva sopra. Ora i materiali trasmissivi sono sul layer 2 e un secondo depth pass (stesso scissor, solo quando la scena cambia) registra la superficie di vetro più vicina. Lo shader della fiamma attenua del 28% l'emissione dietro quella superficie: la fiamma resta visibile attraverso il vetro ma in secondo piano. Gli oggetti opachi la tagliavano già.
- Banco di prova: `output/flame_viewer.html?bench` misura (render + gl.finish, mediana di 45 fotogrammi) il costo con singoli componenti rimossi: fiamma, tutto il vetro/pass di trasmissione, vetro dell'armadietto, ombre analitiche (uniform `glassShadowEnabled`), shadow map, pixel ratio 1, ombre+profondità ogni fotogramma. Riquadro in basso a sinistra, testo copiabile e in console. Rimosso il 4 ottobre 2026 insieme all'uniform `glassShadowEnabled` (vedi "Pulizia del codice morto").
- PASS: sintassi, rigenerazione, incorporamento. In attesa dei numeri dell'utente per scegliere il prossimo taglio.

## Risultati ?bench e tagli mirati (4 ottobre 2026)
Misura utente (ms/fotogramma, rumore ~±4 ms): completo 33; senza fiamma 31; senza vetro 21; senza vetro dell'armadietto 21; senza ombre analitiche 26; senza shadow map 36; pixel ratio 1 38 (già 1); ombre+profondità ogni fotogramma 34.
- Il costo del vetro era quasi tutto nei 10 barattoli dell'armadietto (shader trasmissivo con campionamento bicubico), non nel pass di trasmissione. Ora a riposo nell'armadietto usano `shelfGlass` (MeshStandard trasparente, opacità .20, stesse patch di luce); sul banco e durante il trasporto passano a `rodGlass` trasmissivo (assegnazione in `render()`).
- Ombre analitiche ridotte: vetro solo per la luce principale (direzionale 0, unica con ombre, ordinata prima da three), volumi di occlusione solo per la luce colorata (puntiforme 1). La luce di contorno e la luce blu della fiamma non le calcolano più. L'ordine di creazione delle luci puntiformi è ora vincolante (commento nel codice).
- Attesi circa 17-22 ms/fotogramma. Da riverificare con ?bench.

## Vetro dell'armadietto e curve del percorso (4 ottobre 2026)
?bench dopo i tagli: completo 22 ms (fiamma ~2, vetro ~3, ombre analitiche ~3, ombre+profondità ogni fotogramma +4). Riscontro: vetro poco credibile e "scompare" alla partenza, cambio sufficientemente fluido.
- Causa della scomparsa: il vetro trasmissivo nel buio dell'armadietto è quasi invisibile, quello semplice (opacità .20) era lattiginoso; lo scambio lo rendeva evidente.
- `shelfGlass` ora imita il vetro trasmissivo: diffusa nera, riflessi sommati (blending One/OneMinusSrcAlpha), opacità a Fresnel da .03 al centro a .40 sulla silhouette, leggera tinta verde ai bordi. Cache key propria `fresnel-shelf-glass-v1`.
- Percorso dei barattoli: `routeEase` aggiunge un easing dentro ogni segmento (sollevamento, uscita, arco, posa) mescolato al 50% con l'avanzamento globale; la velocità agli spigoli si dimezza. Le posizioni restano sul percorso già verificato senza collisioni; la soglia di partenza del nuovo barattolo ora si misura sulla posizione effettiva lungo il percorso (stessa distanza di prima). Non rieseguito il test di collisione in Node (script eliminati in precedenza).
- Riscontro: texture del vetro molto migliore, leggero stacco allo scambio. Lo scambio `shelfGlass`/`rodGlass` non dipende più da `moving`/`tableJar` ma dalla posizione lungo il percorso: avviene a metà dell'arco verso il banco (fuori dall'armadietto, velocità massima), nello stesso punto al ritorno.

## Nuova inquadratura iniziale (4 ottobre 2026)
- L'utente ha fornito uno screenshot di riferimento (vista di tre quarti da destra e dall'alto, armadietto intero a sinistra, barattolo sul banco, Bunsen con tubo, fiamma al centro). Camera ricavata con un fit ai minimi quadrati su 8 punti noti (bocca e base del Bunsen, barattolo sul banco, angoli dell'armadietto), scarto tipico 3-5 px: azimut .307 rad (17,6°), elevazione .351 rad (20,1°), distanza 21,45, target (0, 2,57, 0) sull'asse del Bunsen.
- `HOME_AZIMUTH` nuovo; `resetView` torna all'azimut iniziale per la via più breve invece che a 0. La nebbia (20-40) ora tocca leggermente la scena come nello screenshot.

## Cartellini rimossi (4 ottobre 2026)
- Rimossi i cartellini di carta sul bordo dei ripiani (mesh `tag` e `tagGeometry`). Le etichette sui barattoli restano.

## Glow della bacchetta e base del mantello (4 ottobre 2026)
- Bacchetta a riposo sul banco: involucro additivo (`rod-pickup-glow`, capsula r=.19 lungo tutta la bacchetta), luminoso lungo l'asse e sfumato ai bordi, colore caldo. Pulsa con periodo 1,8 s (intensità .06-.36); con riduzione del movimento resta fisso a .6. Entra e si spegne in dissolvenza (~0,2 s) appena la bacchetta lascia la posa di riposo, durante trascinamento, animazioni e ritorno.
- Fiamma: il mantello esterno alla base era largo solo .61 volte la bocca (cono interno .52) e raggiungeva la bocca solo a h≈.06, quindi sembrava partire più in alto del cono. Ora `mantleWidth=max(width, mouth*(1+1.5h)*(1-smoothstep(.10,.20,h)))`: parte dalla bocca, cresce in modo monotono e si unisce al profilo originale entro h≈.08. Cono interno, pennacchio colorato e `sampleIsInsideFlame` invariati.
- Riscontro: il glow deve essere un contorno che segue il modello, sottile sul filo. Sostituita la capsula con gusci a facce posteriori gonfiati lungo le normali, uno per parte (filo .014, boccola .03, manico .034, perlina .03), figli delle parti stesse e con uniform condivisi. Resta visibile solo l'anello attorno alla silhouette, sfumato verso l'esterno. Intensità .10-.65. Possibili piccole fessure agli spigoli del profilo della boccola (normali spezzate del lathe).
- Riscontro: base della fiamma ben posizionata ma poco arrotondata. Mantello da .85 della bocca con crescita a radice (tangente verticale) fino a h=.08, e bordo inferiore curvo: l'inizio verticale sale di .03·d² verso i lati.

## Pulizia del codice morto (4 ottobre 2026)
- Il viewer passa sempre per la scena 3D: rimosso il vecchio viewer 2D da `viewer.js` (shader e fallback canvas della fiamma, bacchetta e barattolo DOM, transizioni degli sfondi), con il relativo markup e CSS. Le dimensioni della scena usano ora le costanti 1536×1024 della foto di riferimento.
- Rimossi `?bench` (`benchmark()`), `dispose()`, `onRodMove` e `referenceImage` da `bunsen_scene.js`.
- Eliminati `viewer/reagent_backgrounds/`, `viewer/sample_rod.png` e `pictures/Fe.png`. Il generatore toglie dal JSON incorporato i metadati spettrali non letti dal viewer; `elements.json` resta completo per `scripts/rebuild_spectra.cjs`.
- PASS: confronto in Chrome headless (Playwright) prima/dopo su neutro, selezione, spettro sperimentale, modalità rapida, frecce, reset, deselezione e ridimensionamento: stato e screenshot equivalenti, nessun nuovo errore in console.

## Movimento realistico del mantello azzurro (4 ottobre 2026)
Riscontro utente: oscillazioni del mantello esterno macchinose e finte.
- Cause: respiro dell'altezza e "attività" guidati da seni periodici; sway campionato nel tempo a ~18 celle di rumore al secondo e quasi uniforme in altezza (il mantello oscillava rigido); rumore della punta che scorreva verso l'alto a ~10 altezze/s (sfarfallio a scatti); anche il cono interno respirava con la fiamma.
- Ora (`advanceMotion` in `bunsen_flame.js`): i disturbi nascono al bordo del becco e salgono col gas. Lo spostamento all'altezza h è lo stato del bordo di age(h) secondi prima (gas a 1,6 altezze/s con accelerazione di galleggiamento 6 altezze/s²): le onde salgono, si allungano e crescono verso la punta, mentre base e cono interno restano fermi. Processi casuali (Ornstein-Uhlenbeck filtrati, risonatore stocastico a ~7,5 Hz per il "puffing", corrente d'aria lenta τ≈2,8 s, deriva della lunghezza della punta), mai periodici.
- La CPU scrive 64 altezze per fotogramma in una striscia half-float (`flowMotion`): una lettura per campione sostituisce le due letture di rumore dello sway. Il rumore dei bordi è letto in coordinate del gas (age−time), con due strati che scivolano tra loro: le lingue cambiano forma salendo invece di scorrere. Stesso trasporto per il rumore del pennacchio colorato.
- Bacchetta: dentro la fiamma rimescola un po' il gas sopra di sé; muovendola trascina il mantello, che si riassesta in circa 0,2 s. Luce colorata modulata dal puffing della fiamma (`flame.flicker`) invece che da due seni.
- Uniform rimossi: `heightPulse`, `movementActivity`; nuovi: `flowMotion`, `tipScale`, `turbulence`. Forma media, colori, early-out, 48 passi e numero di letture texture per campione invariati.
- Verifica: banco di prova isolato (solo fiamma, Chrome headless con SwiftShader) con fotogrammi consecutivi a 30 fps, ogni 0,1 s e ogni 0,7 s, confrontati col vecchio shader, sia neutro sia con Na fermo e in movimento. Sintassi OK, output rigenerato con moduli identici. Il viewer completo non termina il caricamento in SwiftShader: verifica visiva e costo GPU sull'hardware utente ancora da fare.
- Attacco al becco: la fiamma partiva a h=0 con una dissolvenza (40% sul bordo, piena solo ~0,07–0,12 più in alto) e i lati del mantello salivano ancora di più (`rounding=.03d²`), lasciando una fascia scura tra bordo e fiamma. Ora mantello e cono interno raggiungono l'intensità piena appena sotto il bordo (dissolvenza tra h=−0,03 e −0,006, `rounding=.010d²`), con il volume esteso verso il basso di 0,04·altezza; la parte dentro la canna è nascosta dalla profondità opaca tranne dall'alto, dove si vede la base del cono nell'imboccatura. Verificato nel banco di prova con il profilo reale della canna e quattro inquadrature.

## Ombra della bacchetta fluida (4 ottobre 2026)
- Riscontro utente: l'ombra della bacchetta sul muro avanzava a scatti. Durante il movimento la shadow map veniva ridisegnata solo ~4 volte al secondo (limite 250 ms, più 120 ms di assestamento).
- Ora, finché la bacchetta si muove, la shadow map si ridisegna a ogni fotogramma (massimo 30/s), quindi l'ombra la segue senza salti; ferma, nessun aggiornamento. Rimossi `rodShadowTime` e `rodMovedAt`. Barattoli invariati (~15/s).
- Costo: un passaggio di shadow map in più per fotogramma soltanto mentre la bacchetta è in movimento; non misurato sull'hardware utente.

## Bacchetta sempre sul banco (4 ottobre 2026)
- Senza elemento selezionato la bacchetta resta appoggiata nella posizione di riposo, con l'ansa pulita (nessun sale), non trascinabile (`onRodStart` rifiuta senza `current`; il trascinamento diventa rotazione della vista) e senza glow (`rodAtRest` richiede `currentReagent` e nessun barattolo in movimento).
- Rimosse le animazioni di scomparsa/comparsa della bacchetta (`scaleRod`, opzioni `hideRod`/`revealRod` di `transitionElement`) e la variabile `rodVisible` del viewer.
- PASS sintassi e rigenerazione; verifica nel browser da fare.

## Selezione dai barattoli (4 ottobre 2026)
- Clic su un barattolo fermo nell'armadietto: `selectElement(symbol)`, identico al pulsante (pulsante acceso aggiornato da `applyElement`). Clic sul barattolo fermo sul banco: stesso simbolo, quindi deselezione e ritorno alla schermata neutra.
- Al passaggio del cursore il barattolo cliccabile mostra lo stesso contorno luminoso della bacchetta (`pickupOutline`, ora condiviso), fisso invece che pulsante, con breve dissolvenza; su vetro e tappo. Niente glow né clic durante transizioni, selezioni, ritorno della bacchetta o trascinamento (`canPickJar` dal viewer).
- Callback `onReagent` sostituito da `onJar`; rimossi `toggleReagentMedia` e `returnToElementVideo`, rimasti senza chiamanti: il clic sul barattolo del banco non apre più la foto/formula del reagente (resta la comparsa automatica in modalità rapida).
- PASS sintassi e rigenerazione; verifica nel browser da fare.

## Barattoli uguali ovunque (4 ottobre 2026)
- Il barattolo passava dal vetro dell'armadietto (`shelfGlass`, imitazione non trasmissiva) al vetro trasmissivo `rodGlass` a metà dell'arco verso il banco. Rimosso lo scambio in `render()`: i barattoli usano sempre `shelfGlass`, quindi sul banco appaiono identici a quelli nell'armadietto. Polvere, tappo ed etichetta erano già gli stessi materiali. Effetto collaterale: un oggetto trasmissivo in meno nel pass di trasmissione quando un barattolo è sul banco.

## Sale alla deselezione (4 ottobre 2026)
- Richiesta: dopo la deselezione il sale dell'ultimo elemento resta sulla punta della bacchetta anche nella schermata neutra. Prima del primo utilizzo l'ansa è pulita.
- `setElement(null)` non nasconde più la perlina; `holdBead()` non la nasconde più (l'ansa tiene il sale vecchio fino al nuovo intingimento); `prepare()` ripristina visibilità e colore della perlina dopo il fotogramma di preparazione. Rimossa la breve animazione `clearBead` introdotta per errore.
- PASS sintassi e rigenerazione; verifica nel browser da fare.

## Rimozione delle foto dei reagenti (5 ottobre 2026)
- Eliminata `files/pictures/` e ogni riferimento: `REAGENT_PICTURES` e `reagentImage` nel generatore, i due `<img id="reagent-image…">` e il riquadro formula/"Foto non ancora disponibile" in `index.html`, le regole `.reagent-image`, `.reagent-unavailable`, `.reagent-formula`, `has-image`/`has-unavailable` in `style.css`.
- In `viewer.js` rimossi `showReagentFormula`, `setFormulaText`, `reagentAutoReveal` e `reagentImageIndex` (percorso già irraggiungibile dopo la rimozione di `toggleReagentMedia`). Il pannello mostra solo il video o "Video non ancora disponibile".
- PASS rigenerazione e caricamento in Chrome headless senza errori in console; verifica interattiva nel browser da fare.

## Oscillazione del cono interno e vetro dei barattoli (5 ottobre 2026)
- Cono interno (`bunsen_flame.js`): prima era quasi fermo, perché lo spostamento del mantello vale circa zero alla sua altezza. Ora ha processi casuali propri (Ornstein-Uhlenbeck, niente sinusoidi) più rapidi e molto più deboli del mantello: la punta si sposta lateralmente di circa 0,006 altezze di fiamma con la base ancorata alla bocca (spostamento ∝ (h/hcono)²), l'altezza respira di circa ±2 % insieme al pulsare della fiamma, e leggere increspature salgono col gas lungo la superficie. Costo: un lookup di rumore in più, solo per i campioni vicini al cono. Con riduzione del movimento l'ampiezza scala come il resto (`calm`).
- Vetro dei barattoli (`shelfGlass`, ancora non trasmissivo): riflessione di Schlick (n=1,5), vetro più spesso, denso e verdognolo su fondo, spalla e bordo arrotolato, leggere ondulazioni orizzontali irregolari nelle normali, come nel vetro stampato. Tutto analitico, senza texture né passate aggiuntive.
- PASS rigenerazione, nessun errore di shader in Chrome (GPU, via CDP); confronto visivo prima/dopo su armadietto e fotogrammi successivi del cono.

## Sfumature della fiamma colorata (5 ottobre 2026)
- Prima il pennacchio colorato emetteva un unico colore piatto (`warm=tint`). Ora (`bunsen_flame.js`, `emission`) il colore varia con la concentrazione del vapore salino, sempre nella tinta dell'elemento: subito sopra la perlina è la forma più luminosa e satura della tinta (`peak`, tinta normalizzata al canale massimo) con una traccia di bianco, fino al 40 % dove evapora il sale; salendo e verso i bordi il vapore si diluisce e il colore si scurisce e si satura (esponente fino a 1,65 e luminosità fino a 0,55 verso la punta, dove il gas si raffredda); filamenti verticali trasportati dal gas (`streak`, un lookup di rumore in più solo dentro il pennacchio) sono alternativamente più ricchi e più poveri, in colore e densità.
- PASS rigenerazione, nessun errore di shader in Chrome headless (GPU, via CDP); confronto prima/dopo su Na, K, Cu, Sr in modalità rapida.

## Luce della scena guidata dal moto della fiamma (5 ottobre 2026)
- Prima solo la luce colorata pulsava (±4 % con `flame.flicker`) e restava ferma; la luce blu del becco era costante. Ora `advanceMotion` calcola `castLight` (esposto come `flame.light`): potenza relativa `pulse` dal pulsare della fiamma (~7,5 Hz stocastico) e dalla deriva della lunghezza della punta, circa ±8 %, ×1,5 quando la bacchetta rimescola il gas; baricentro della luce che segue lo spostamento del mantello a metà altezza (stesso valore scritto nella striscia di moto: turbolenza, corrente d'aria, scia della bacchetta) e sale con l'allungarsi della punta.
- `bunsen_scene.js`: la luce colorata usa `pulse` e lo spostamento pieni; la luce blu (`flameLight`, base `flameLightBase`) 0,6 di entrambi, perché il cono su cui è ancorata si muove poco. Anche l'alone (`halo`) segue posizione e potenza. Rimosso il getter `flicker`, rimasto senza usi. Con riduzione del movimento tutto scala con `calm` come il resto.
- Misura in Chrome headless (Na, modalità rapida, 24 fotogrammi): luminosità media del muro invariata, escursione da 4–7 % a 13–23 % ai lati della fiamma. Nessun costo GPU aggiuntivo.
