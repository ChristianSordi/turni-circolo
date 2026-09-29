# Turni Circolo Arci San Liberato — Design

Data: 2026-09-29 (rev. 2: identità con nome + PIN al posto del link personale)

## Obiettivo

Agenda condivisa per i turni del **Circolo Arci San Liberato**. Ognuno, dal telefono o dal computer,
apre un link, vede i turni di tutti e si segna in un giorno libero. Nessun account.
Utenti anche anziani: deve essere il più semplice possibile.

## Requisiti

- Un solo turno al giorno, una sola persona per turno.
- Nessun account: al primo accesso si chiedono solo **nome e cognome** (obbligatori entrambi) e
  un **PIN di 4 cifre**, con l'avviso "Importante: ricorda assolutamente il tuo PIN".
- Identità robusta: se il telefono "dimentica" l'utente (Safari su iPhone cancella i dati dei siti
  non aperti per 7 giorni, pulizia del browser, telefono nuovo, altro computer) si rientra
  scrivendo **lo stesso nome e PIN**, senza link e senza l'intervento di nessuno.
- Tutti i membri del circolo vedono tutti i turni (nome di chi lo fa). Chi non è membro non vede nulla.
- Ci si può segnare solo in un giorno libero.
- Si può togliere solo il proprio turno.
- Giorni passati: sola consultazione (niente prenotazioni né cancellazioni).
- Admin: un link segreto rende amministratore il dispositivo che lo apre; l'admin può
  togliere qualsiasi turno e **reimpostare il PIN** di qualsiasi socio.
- Tutto gratuito: GitHub Pages + Firebase (piano Spark).
- Si distribuisce **un solo link del circolo** a tutti (es. gruppo WhatsApp), che contiene il
  **codice del circolo**: `…/?circolo=CODICE`. Serve **solo per iscriversi** (blocco lato server);
  per rientrare con nome e PIN non serve. Il codice vive solo nelle regole della console Firebase;
  se il link esce dal gruppo, si cambia lì e chi è già iscritto continua a funzionare.

## Fuori scope

- Cambio nome dopo l'iscrizione (lo può correggere l'admin dalla console Firebase).
- Più turni al giorno, notifiche, promemoria, esportazione.
- Protezione del PIN contro un attacco automatico deciso (vedi Limiti).

## Interfaccia

Una sola pagina, in italiano, caratteri grandi, pensata per telefono.
Intestazione e titolo della pagina: **"Circolo Arci San Liberato — Turni"**.

1. **Schermata di ingresso** (quando il dispositivo non è collegato a nessuno):
   - campo "Nome e cognome" (obbligatori entrambi), campo "PIN (4 cifre)" (tastiera numerica);
   - riquadro evidenziato: "**Importante:** ricorda assolutamente il tuo PIN! Ti servirà per
     rientrare se cambi telefono o se il telefono si dimentica di te.";
   - tasto **Entra**; sotto: "Già iscritto? Scrivi lo stesso nome e PIN e ritrovi i tuoi turni.";
   - nome di una sola parola → "Scrivi nome e cognome (es. Mario Rossi)."; PIN non di 4 cifre →
     "Il PIN deve essere di 4 cifre.";
   - nome + PIN trovati → si rientra;
   - non trovati, con codice del circolo nel link → conferma "Non ti abbiamo trovato. Se sei nuovo
     tocca OK per iscriverti come X. Se sei già iscritto tocca Annulla e ricontrolla nome e PIN.";
   - non trovati, senza codice → "Non ti abbiamo trovato: controlla nome e PIN. Se sei nuovo, apri
     il link del circolo che trovi nel gruppo WhatsApp.";
   - codice del circolo sbagliato/cambiato → "Link del circolo non valido o scaduto: chiedi quello
     nuovo nel gruppo."
2. **Calendario mensile** con frecce ‹ › per cambiare mese.
   - Giorno libero: bianco. Giorno di un altro: grigio con il nome. Giorno mio: verde con il mio nome.
   - Giorno passato: attenuato, non cliccabile per modifiche. Oggi: bordato (ricalcolato a ogni
     disegno, la pagina può restare aperta per giorni).
3. **Tocco su un giorno** (dialog nativi `confirm`/`alert`):
   - libero → "Vuoi segnarti per giovedì 12 ottobre?"
   - mio → "Vuoi togliere il tuo turno di …?"
   - di un altro → "…: turno di Mario Rossi" (se admin: "Togliere il turno di Mario Rossi di …?")
4. Sotto il calendario: "Consiglio: aggiungi questa pagina alla schermata Home."
5. **Solo admin — elenco "Soci"**: nomi in ordine alfabetico, con il numero di turni segnati, e
   tasto **"Reimposta PIN"** → chiede il nuovo PIN → "Fatto: comunica a Mario Rossi il nuovo PIN."
6. Aggiornamento **in tempo reale** (listener Firestore `onSnapshot`).

## Architettura

- `index.html`: HTML + CSS + JS, SDK Firebase modulare da CDN (gstatic). Niente build.
- `calendario.js`: date e griglia del mese. `profilo.js`: normalizzazione nome, validazione
  nome/PIN, calcolo della chiave del profilo.
- `firestore.rules`: le regole di sicurezza, unico "backend".
- Firebase Anonymous Auth: ogni browser ottiene un `uid`, senza schermate di login.

### Chiave del profilo

`chiave = SHA-256("turni-circolo:" + nomeNormalizzato.toLowerCase() + ":" + pin)` in esadecimale
(64 caratteri). `nomeNormalizzato` = spazi iniziali/finali tolti e spazi multipli ridotti a uno.
Quindi "mario rossi" e "Mario  Rossi" sono la stessa persona; il nome mostrato resta come scritto
all'iscrizione (spazi normalizzati).

### Modello dati (Firestore)

| Raccolta | Chiave | Campi | Scopo |
|---|---|---|---|
| `persone` | chiave del profilo | `id`, `nome`, `codice`? | Profilo. `id` = uid del dispositivo d'iscrizione (stabile anche dopo reset PIN). `codice` presente se creato da iscrizione. Get conoscendo la chiave; list solo admin. |
| `dispositivi` | `uid` | `id`, `segreto` | Collega un dispositivo a un profilo (`segreto` = chiave del profilo). Leggibile solo dal proprio uid. |
| `turni` | data `AAAA-MM-GG` | `id`, `nome` | Il turno. Leggibile dai dispositivi registrati. La chiave-data garantisce un turno al giorno. |
| `admin` | `uid` | `chiave` | Dispositivi amministratori. Leggibile solo dal proprio uid. |

### Regole di sicurezza

- Nome valido: stringa ≤ 60 caratteri, almeno due parole separate da un solo spazio, senza spazi
  iniziali/finali (`^[^ ]+( [^ ]+)+$`).
- `persone/{chiave}`
  - get: utente autenticato. list: solo admin.
  - create (iscrizione): `id == request.auth.uid`, nome valido, `codice` uguale al codice del
    circolo scritto nelle regole, solo campi `id`,`nome`,`codice`.
  - create (reset admin): admin, nome valido, solo campi `id`,`nome`.
  - delete: solo admin. update: mai.
- `dispositivi/{uid}`
  - read: solo `request.auth.uid == uid`.
  - create/update: solo `request.auth.uid == uid` e `get(persone/segreto).data.id == id`.
  - delete: mai.
- `turni/{data}`
  - read: solo se esiste `dispositivi/uid`.
  - create (solo se il giorno è libero): chiave `AAAA-MM-GG`; `id` e `nome` uguali a quelli del
    profilo collegato al dispositivo.
  - delete: admin, oppure `id` del **profilo ancora esistente** collegato al dispositivo uguale a
    quello del turno (dopo un reset PIN i dispositivi col vecchio PIN non cancellano più nulla).
  - update: mai.
- `admin/{uid}`
  - read: solo proprio uid. create: proprio uid e `chiave` uguale alla parola segreta nelle regole.

Il blocco dei giorni passati è solo lato pagina (igiene dati, non sicurezza).

### Flusso all'apertura

1. `signInAnonymously`.
2. Se l'URL contiene `?admin=K` e il dispositivo non è admin → prova a creare `admin/{uid}`.
3. Legge `dispositivi/{uid}` → `persone/{segreto}`. Se entrambi esistono → calendario.
   (Se il profilo non esiste più = PIN reimpostato → schermata di ingresso.)
4. Schermata di ingresso: calcola la chiave da nome + PIN, legge `persone/{chiave}`:
   trovato → scrive `dispositivi/{uid}` = `{id, segreto: chiave}`; non trovato → iscrizione
   (se c'è `?circolo=`): crea `persone/{chiave}` = `{id: uid, nome, codice}` e `dispositivi/{uid}`.
5. Toglie i parametri dall'URL, mostra il calendario, ascolta `turni`.

### Reset PIN (admin)

Nuova chiave da nome del socio + nuovo PIN → crea `persone/{nuova}` = `{id, nome}` (stesso `id`),
poi cancella `persone/{vecchia}`. I turni restano del socio (stesso `id`). Tutti i suoi dispositivi
tornano alla schermata di ingresso e rientrano col nuovo PIN.

### Limiti (accettati)

- Il PIN di 4 cifre protegge da errori e furbetti, non da un attacco automatico: un socio che vede
  i nomi potrebbe provare i 10 000 PIN di un altro con uno script. Un estraneo dovrebbe indovinare
  anche il nome esatto senza vederlo. Rimedio: l'admin reimposta il PIN.
- Due omonimi con lo stesso PIN sarebbero la stessa persona (improbabile).
- PIN dimenticato: lo reimposta l'admin.

### Errori

- Due persone sullo stesso giorno nello stesso istante: vince la prima, la seconda vede
  "Questo giorno è appena stato preso."
- Errori di rete: "Connessione assente. Ricarica la pagina." / "Operazione non riuscita…"

## Test

- `test/rules.test.mjs` (emulatore): iscrizione con/senza codice; nome di una parola rifiutato;
  profilo con id altrui rifiutato; persone elencabile solo da admin; turni solo ai membri; un turno
  al giorno; niente turni con id/nome altrui; cancella solo il proprietario; secondo dispositivo con
  la chiave giusta = stessa persona; admin con chiave giusta; reset PIN (solo admin, turni conservati,
  vecchi dispositivi tagliati fuori); persone/admin non modificabili.
- `test/profilo.test.mjs`: normalizzazione, validazione, chiave indipendente da maiuscole/spazi.
- `test/calendario.test.mjs`: griglia e date locali.
- La pagina si verifica nel browser contro l'emulatore.

## Messa online (una tantum)

1. Creare progetto Firebase (piano Spark), attivare Authentication → Anonimo e Firestore.
2. Pubblicare le regole con parola admin e codice del circolo veri (lunghi e casuali), mai nel repo.
3. Mettere la config web di Firebase in `index.html`.
4. Repository GitHub pubblico con GitHub Pages.
5. Aprire dal proprio telefono `…/?circolo=CODICE&admin=PAROLASEGRETA` (iscrizione + admin).
6. Mandare `…/?circolo=CODICE` al gruppo del circolo.
