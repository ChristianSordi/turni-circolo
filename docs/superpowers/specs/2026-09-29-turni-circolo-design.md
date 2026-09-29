# Turni Circolo Arci San Liberato — Design

Data: 2026-09-29

## Obiettivo

Agenda condivisa per i turni del **Circolo Arci San Liberato**. Ognuno, dal telefono o dal computer,
apre un link, vede i turni di tutti e si segna in un giorno libero. Nessun account.
Utenti anche anziani: deve essere il più semplice possibile.

## Requisiti

- Un solo turno al giorno, una sola persona per turno.
- Nessuna registrazione: al primo accesso si chiede solo "Come ti chiami?".
- Chiunque vede tutti i turni (nome di chi lo fa).
- Ci si può segnare solo in un giorno libero.
- Si può togliere solo il proprio turno.
- Giorni passati: sola consultazione (niente prenotazioni né cancellazioni).
- Multi-dispositivo: ogni utente ha un **link personale**, sempre visibile nella sua
  schermata, che può inviarsi (WhatsApp / copia) per usare lo stesso profilo su un
  altro dispositivo. Serve anche in caso di cambio telefono.
- Admin: un link segreto rende amministratore il dispositivo che lo apre; l'admin può
  togliere qualsiasi turno.
- Tutto gratuito: GitHub Pages + Firebase (piano Spark).
- Si distribuisce **un solo link pubblico** a tutti (es. gruppo WhatsApp).

## Fuori scope (v1)

- Cambio nome dopo il primo inserimento (lo può correggere l'admin dalla console Firebase).
- Più turni al giorno, notifiche, promemoria, esportazione.

## Interfaccia

Una sola pagina, in italiano, caratteri grandi, pensata per telefono.
Intestazione e titolo della pagina: **"Circolo Arci San Liberato — Turni"**.

1. **Primo accesso:** schermata con "Come ti chiami?" + campo + tasto "Salva".
2. **Calendario mensile** con frecce ‹ › per cambiare mese.
   - Giorno libero: bianco.
   - Giorno di un altro: grigio con il nome.
   - Giorno mio: verde con il mio nome.
   - Giorno passato: attenuato, non cliccabile per modifiche.
3. **Tocco su un giorno** (conferma con dialog nativo `confirm`/`alert`):
   - libero → "Vuoi segnarti il 12 ottobre?" Sì/No
   - mio → "Vuoi togliere il tuo turno del 12 ottobre?" Sì/No
   - di un altro → "Turno di Mario Rossi" (se admin: "Togliere il turno di Mario Rossi?")
4. **Sotto il calendario, "Il tuo link personale":** il link, tasto "Invia su WhatsApp"
   (`https://wa.me/?text=...`) e tasto "Copia". Testo: "Aprilo su un altro telefono o
   computer per usare lo stesso nome."
5. Aggiornamento **in tempo reale** (listener Firestore `onSnapshot`).

## Architettura

- `index.html` unico: HTML + CSS + JS, SDK Firebase modulare da CDN (gstatic). Niente
  build, niente npm per la pagina.
- `firestore.rules`: le regole di sicurezza, unico "backend".
- Firebase Anonymous Auth: ogni browser ottiene un `uid` stabile, senza schermate di login.

### Modello dati (Firestore)

| Raccolta | Chiave | Campi | Scopo |
|---|---|---|---|
| `persone` | `segreto` (casuale, 20+ caratteri) | `id`, `nome` | Profilo della persona. `id` = uid del primo dispositivo. Leggibile solo conoscendo il segreto (get sì, list no). |
| `dispositivi` | `uid` | `id`, `segreto` | Collega un dispositivo a una persona. Leggibile solo dal proprio uid. |
| `turni` | data `AAAA-MM-GG` | `id`, `nome` | Il turno. Leggibile da tutti. La chiave-data garantisce un turno al giorno. |
| `admin` | `uid` | `chiave` | Dispositivi amministratori. Leggibile solo dal proprio uid. |

Il `segreto` non compare mai in `turni`: nel calendario si vedono solo nomi e `id` pubblici.

### Regole di sicurezza

- `persone/{segreto}`
  - get: utente autenticato. list: mai.
  - create: `id == request.auth.uid`, `nome` stringa 1–60 caratteri, solo campi `id`,`nome`.
  - update/delete: mai.
- `dispositivi/{uid}`
  - read: solo `request.auth.uid == uid`.
  - create/update: solo `request.auth.uid == uid` e
    `get(persone/segreto).data.id == request.resource.data.id`.
  - delete: mai.
- `turni/{data}`
  - read: utente autenticato.
  - create (solo se il documento non esiste — garantito da Firestore): `data` nel formato
    `AAAA-MM-GG`; `id` e `nome` uguali a quelli della persona collegata al dispositivo
    (`dispositivi/uid` → `persone/segreto`). Niente spacciarsi per altri.
  - update: mai.
  - delete: `resource.data.id` uguale all'`id` del proprio dispositivo, oppure `admin/uid` esiste.
- `admin/{uid}`
  - read: solo `request.auth.uid == uid`.
  - create: `request.auth.uid == uid` e `chiave` uguale alla parola segreta scritta nelle
    regole (non presente nella pagina).

Il blocco dei giorni passati è solo lato pagina (igiene dati, non sicurezza).

### Flusso all'apertura

1. `signInAnonymously`.
2. Se l'URL contiene `?admin=K` → prova a creare `admin/{uid}` con `chiave: K`; poi toglie
   il parametro dall'URL (`history.replaceState`).
3. Se l'URL contiene `?io=S` → legge `persone/S`; se esiste scrive `dispositivi/{uid}` =
   `{id, segreto: S}`; toglie il parametro dall'URL. Se non esiste: "Link non valido".
4. Altrimenti legge `dispositivi/{uid}`: se esiste → legge `persone/{segreto}` per il nome.
5. Se non c'è profilo → chiede il nome, genera `segreto = crypto.randomUUID()`, crea
   `persone/{segreto}` = `{id: uid, nome}` e `dispositivi/{uid}` = `{id: uid, segreto}`.
6. Mostra il calendario e si mette in ascolto su `turni`.

### Errori

- Due persone sullo stesso giorno nello stesso istante: Firestore accetta solo la prima
  `create`; la seconda riceve `permission-denied` → "Questo giorno è appena stato preso."
- Errori di rete: messaggio "Connessione assente, riprova."
- Link personale non valido: messaggio e si prosegue come nuovo utente.

## Test

Un solo file `test/rules.test.mjs` (node:test + `@firebase/rules-unit-testing` +
emulatore Firestore) che verifica:

- non si può prenotare un giorno già preso;
- non si può prenotare con `id`/`nome` di un altro;
- non si può cancellare il turno di un altro;
- l'admin (con chiave giusta) può cancellare; chiave sbagliata → niente admin;
- un secondo dispositivo con il segreto giusto può cancellare i turni della persona;
- `persone` non è elencabile.

La pagina si verifica a mano nel browser contro l'emulatore.

## Messa online (una tantum, a cura del proprietario)

1. Creare progetto Firebase (piano Spark), attivare Authentication → Anonimo e Firestore.
2. Incollare `firestore.rules` (con la propria parola segreta admin) nella console.
3. Incollare la config web di Firebase in `index.html`.
4. Creare repository GitHub pubblico, caricare `index.html`, attivare GitHub Pages.
5. Aprire una volta `…/?admin=PAROLASEGRETA` dal proprio telefono.
6. Mandare il link pubblico al gruppo del circolo.
