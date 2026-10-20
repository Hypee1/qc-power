# MACE POWER — Quality Control System (GitHub Pages + Firebase)

Copia del gestionale qualità (controlli di accettazione, NC, scadenziario, DDT, commesse, audit) con:

- **Accesso protetto**: due profili, *Biagio (Admin)* e *Ospite*, ognuno con la sua password (Firebase Authentication).
- **Ospite in sola lettura**: vede tutto ma non modifica niente. Su ogni controllo, NC, DDT e commessa ha il tasto **Sollecita** e sotto **"Vuoi aggiungere note?"**.
- **Segnalazioni**: solleciti e note arrivano in tempo reale nel portale admin (campanella + pagina Segnalazioni). Puoi rispondere e l'ospite vede la risposta.
- **Console accessi** (solo admin): login riusciti e falliti, IP, città, provider, tipo di dispositivo, sistema operativo, browser, sessioni online e cosa ha guardato l'ospite.
- Firme digitali, allegati (foto compresse in automatico, PDF fino a 700 KB), PDF stampabili, export CSV, backup JSON.
- Disconnessione automatica dopo 30 minuti di inattività. La sessione dura finché non chiudi il browser.

> In parole povere: il codice su GitHub è come la **porta del magazzino**, la vedono tutti. I **dati** sono dentro Firebase, chiusi a chiave: senza la password giusta il database risponde "accesso negato". Per questo il file `seed-data.json` **non va mai caricato su GitHub**.

---

## Messa in funzione (circa 15 minuti, una volta sola)

### 1. Firebase: crea i due utenti
1. Apri <https://console.firebase.google.com> → progetto **controllo-quality**.
2. **Authentication** → *Inizia* → scheda **Metodo di accesso** → abilita **Email/password**.
3. Scheda **Utenti** → *Aggiungi utente*:
   - `admin@macepower.qc` → una password forte, solo tua.
   - `ospite@macepower.qc` → la password da dare ai superiori.

   Le email non devono esistere davvero: servono solo come "nome utente".

### 2. Firebase: crea il database e incolla le regole
1. **Firestore Database** → *Crea database* → modalità **produzione** → regione `europe-west8 (Milano)`.
2. Scheda **Regole** → cancella tutto → incolla il contenuto del file `firestore.rules` → **Pubblica**.

### 3. Firebase: autorizza il dominio GitHub
**Authentication → Impostazioni → Domini autorizzati → Aggiungi dominio** → `hypee1.github.io`
(se usi un altro account GitHub, metti `<tuo-utente>.github.io`).

### 4. GitHub: pubblica il sito
1. Crea un nuovo repository, ad esempio `qc-macepower`.
2. Carica **tutti i file di questa cartella** (`index.html`, `css/`, `js/`, `vendor/`, `firestore.rules`, `.nojekyll`, …), **ma non** `seed-data.json`.
3. **Settings → Pages → Build and deployment** → *Deploy from a branch* → `main` / `(root)` → Save.
4. Dopo 1-2 minuti il sito è su `https://hypee1.github.io/qc-macepower/`.

### 5. Carica i dati del vecchio sito
1. Apri il sito ed entra come **Biagio (Admin)**.
2. Menu **Impostazioni & Import** → *Scegli file JSON* → scegli `seed-data.json` → **Importa nel database**.
3. Fatto: 159 controlli, 135 NC, 7 DDT e 6 commesse. Se ripeti l'import non si creano doppioni.

### 6. Consigliato: blocca la chiave API sul tuo dominio
<https://console.cloud.google.com/apis/credentials> (progetto *controllo-quality*) → la chiave "Browser key" →
**Restrizioni applicazione: Referrer HTTP** → aggiungi `https://hypee1.github.io/*` → Salva.

---

## Cosa è stato portato dal vecchio sistema

| Dato | Quantità | Note |
|---|---|---|
| Controlli accettazione | 159 (42 carpenteria + 117 produzione) | 185 quote recuperate dal vecchio database su 37 controlli che su Emergent erano vuoti; dati vernice su 32 controlli |
| Non conformità | 135 | origini uniformate (es. `reclamo_cliente` → *Reclamo Cliente*); 27 aggiornamenti storici; firme Emergent conservate |
| Certificati & DDT | 7 | con materiali e flag certificato |
| Commesse | 6 | con distinta materiali (erano state eliminate da Emergent: puoi deselezionarle all'import) |
| Allegati vecchi | 105 controlli + 104 NC | solo **nome file**: i file veri stavano sul server Altervista. Se li recuperi, imposta `legacyFilesBase` in `js/config.js` |

Non importate: 7 NC di prova del vecchio database ("Rapporto1", "Funzione1"…).

## Migliorie rispetto al sito Emergent
- Esito PASS/FAIL che accetta la **virgola** (`1803,5`). Prima `1,1` veniva letto come `1`.
- Senza tolleranza l'esito è **n.d.**, non FAIL. Avviso se ci sono quote FAIL e la conformità è "Conforme"; pulsante per impostarla dagli esiti.
- **Modelli di quote** per tipo (Cassa, Coperchio, Nucleo…), colonna U.M. e Δ, pulsante **Duplica** controllo.
- Numero NC suggerito nel formato che usi davvero (**28/26**) e avviso se il numero esiste già.
- Ogni firma ha il **suo firmatario** (prima tutte prendevano il nome del responsabile rilevazione).
- Origine NC con **Reclamo Fornitore**; **Vista completa** della NC su una pagina (comoda per i superiori).
- Colonna "Tipo" dei DDT corretta (prima mostrava BOZZA / CON RISERVA).
- **Storico aggiornamenti** sulle NC, fornitori suggeriti mentre scrivi, filtri per anno e classe, export CSV, backup JSON.
- Allegati salvati a parte (non appesantiscono le schede) e compressi in automatico.

## Note tecniche
- Nessuna build: HTML + JavaScript (moduli ES). Le librerie sono nella cartella `vendor/` (Preact + htm, Firebase 11, jsPDF), così il sito non dipende da CDN esterni.
- Piano Firebase gratuito (Spark): bastano 50.000 letture al giorno. Gli allegati stanno in Firestore, quindi non serve Storage, che richiede il piano a pagamento.
- IP e città vengono dai servizi gratuiti `ipapi.co`, `ipwho.is` e `ipify`. Se un antivirus o un adblock li blocca, l'IP risulta "n.d." ma il resto viene registrato lo stesso.
- Il registro audit e gli accessi **non si possono modificare né cancellare** dal sito (lo impediscono le regole).
- Per cambiare le email degli account: `js/config.js` **e** `firestore.rules`, devono essere identiche.
