# Turni — Circolo Arci San Liberato

Agenda condivisa dei turni del circolo: https://christiansordi.github.io/turni-circolo/

La prima volta si apre il link del circolo (quello del gruppo WhatsApp), si scrivono nome e cognome e
si sceglie un PIN di 4 cifre. Poi basta toccare un giorno libero per segnarsi. Nessun account, niente
da installare. La scheda **Classifica** conta i turni già fatti, dell'anno o da sempre.

## Per i soci

- **Telefono nuovo o pagina che non ti riconosce più:** apri la pagina e scrivi gli stessi nome,
  cognome e PIN: ritrovi i tuoi turni. Maiuscole e spazi non contano.
- **PIN dimenticato:** chiedi all'amministratore di reimpostarlo.
- **Non puoi più fare un turno?** Tocca il tuo giorno → "Cerco un sostituto". Il giorno diventa arancione
  con la scritta "cercasi" e chi ha i promemoria attivi riceve un avviso. Il turno resta tuo finché qualcuno
  non lo prende: allora, se hai attivato i promemoria, ti arriva un avviso; altrimenti lo vedi in calendario. Ci hai ripensato? Tocca il giorno → "Lo faccio io".
- **Vuoi prendere il turno di un altro?** Tocca un giorno arancione → "Prendo io il turno".
- **Promemoria sul telefono** (una settimana prima e il giorno prima del turno): in fondo al calendario
  tocca "Attiva promemoria" e accetta le notifiche. Su **Android** basta Chrome. Su **iPhone** (iOS 16.4
  o successivo) prima tocca Condividi → "Aggiungi alla schermata Home", apri Turni dall'icona e rientra
  con nome, cognome e PIN: da Safari normale Apple non manda notifiche. Chi aveva già l'icona sulla
  Home da prima la toglie e la rimette. I promemoria valgono per il telefono dove li attivi.

## Per l'amministratore

- **Diventare admin:** apri una volta dal telefono il link del circolo con in più `&admin=<parola-segreta>`.
- **Togliere un turno:** tocca il giorno occupato.
- **Reimpostare un PIN:** in fondo al calendario, elenco **Soci** → "Reimposta PIN" → comunica il nuovo
  PIN al socio. I turni restano suoi e il vecchio PIN smette di funzionare ovunque.
- **Storico e accessi:** nell'elenco **Soci** ogni riga dice quanti turni, quante volte ha aperto l'app e
  quando l'ultima volta. "Storico" mostra chi ha segnato, tolto, cercato un sostituto o preso un turno, e
  quando. Lo scrive la funzione `attivita`, parte dal giorno in cui è stata attivata; i turni già segnati prima hanno la
  nota "(da prima dello storico)". Un accesso = apertura, o ritorno all'app dopo almeno 30 minuti.
- **Correggere un nome:** console Firebase → Firestore → `persone` → modifica `nome` (sempre nome e
  cognome), **poi** tocca "Reimposta PIN" per quel socio, altrimenti non riesce più a entrare. I turni
  già segnati tengono il vecchio nome: correggili in `turni`.
- **Eliminare un socio** (se lo chiede, o se non fa più parte del circolo): elenco **Soci** → "Elimina".
  Poi scegli se eliminare anche i suoi turni (tutti, anche quelli già fatti, quindi sparisce dalla
  classifica) o tenerli in calendario e in classifica. Se chiede di cancellare i suoi dati, eliminali.
  "Elimina" non cancella lo storico né il contatore accessi: per cancellare TUTTO di un socio, dopo "Elimina"
  vai nella console Firebase → Firestore ed elimina `accessi/<id del socio>` e i documenti di `attivita` con
  `socio` = quell'id (filtra sul campo). L'id lo vedi in `persone` prima di eliminare, o nel campo `socio` delle sue righe in `attivita`.
  Da quel telefono non potrà più iscriversi: se deve tornare, lo fa da un altro browser o telefono.
- **Orari e giorno di chiusura:** in fondo al calendario, **Orari del circolo** → "Salva orari".
  Gli orari compaiono in cima alla pagina per tutti; nel giorno di chiusura nessuno può segnarsi
  (i turni già segnati quel giorno restano).
- **Link del circolo finito in mani sbagliate:** cambia il codice del circolo nelle regole (vedi sotto)
  e manda il link nuovo nel gruppo. Chi è già iscritto non si accorge di nulla.

Limite noto: un PIN di 4 cifre ferma errori e furbetti, non un attacco automatico deciso. In caso di
abusi, reimposta il PIN della vittima.

## Regole di sicurezza

`firestore.rules` nel repository contiene i segnaposto `CAMBIAMI` (parola admin) e `CODICE-CIRCOLO`.
Le regole vere, con i valori segreti, stanno solo nella cartella locale `prod/` (fuori da git, come
`segreti.local.txt`).

⚠️ **Mai `firebase deploy` dalla cartella del repository**: pubblicherebbe i segnaposto. Dopo aver
cambiato `firestore.rules`, riporta la modifica in `prod/firestore.rules` mantenendo i valori veri, poi:

```bash
cd prod && npx firebase deploy --only firestore:rules --project turni-sanliberato
```

Parola admin e codice del circolo devono essere lunghi e casuali, non parole:
`node -e "console.log(crypto.randomUUID())"`.

## Sviluppo

Il sito è statico (`index.html`, `admin.js`, `calendario.js`, `profilo.js`, `sw.js`, `manifest.webmanifest`,
immagini) e si
pubblica da solo con GitHub Pages a ogni push su `master`. I dati stanno su Firebase (Firestore in
Europa, accesso anonimo).

Serve Java 21+ per gli emulatori Firebase (auth 9099, Firestore 8181).

I promemoria li manda ogni mattina alle 9 la funzione `functions/index.js` (Cloud Functions,
`europe-west1`). Pubblicarla è sicuro anche dalla cartella del repository, perché `--only functions`
non tocca le regole:

```bash
npx firebase deploy --only functions --project turni-sanliberato
```

Le chiavi delle notifiche (VAPID) stanno in `functions/.env` (fuori da git, copia in
`prod/vapid.local.json`); la pubblica è anche in `index.html`. Se si cambiano, i promemoria vanno
riattivati su ogni telefono.

La funzione `attivita` (stesso file, stessa regione) scatta a ogni modifica di un turno: scrive lo storico
e manda gli avvisi di "Cerco un sostituto". `npm run e2e` prova entrambe le funzioni sull'emulatore.

Backup e storico iniziale (una volta sola): console Firebase → Impostazioni progetto → Account di servizio →
Genera nuova chiave privata → salvala come `prod/chiave-servizio.json`, poi dalla radice
`GOOGLE_APPLICATION_CREDENTIALS=prod/chiave-servizio.json node functions/importa-storico.js`
(`--solo-backup` per la sola copia in `prod/backup-<data e ora>.json`). Dopo l'uso revoca la chiave da
Google Cloud → IAM → Account di servizio.

**Costi: zero.** Il progetto è sul piano Blaze solo per la funzione programmata; tutto resta nelle
quote gratuite (1 job di Cloud Scheduler su 3 gratis, ~30 esecuzioni al mese su 2 milioni). Le vecchie
immagini della funzione si cancellano da sole dopo 1 giorno (`functions:artifacts:setpolicy`). Un
avviso di budget a 1 € in Google Cloud → Fatturazione → Budget e avvisi manda un'email se qualcosa
cambia: l'avviso non blocca la spesa, avvisa soltanto.

```bash
npm install
npm test                       # regole di sicurezza + calendario + profilo
npm run e2e                    # funzioni (promemoria e storico) sull'emulatore
npm run emulatori              # emulatori auth + firestore
python3 -m http.server 8000    # poi apri http://localhost:8000/?circolo=CODICE-CIRCOLO
```

<details>
<summary>Rifare tutto da zero (nuovo progetto Firebase)</summary>

1. https://console.firebase.google.com → Crea progetto (piano gratuito Spark, senza Analytics).
2. Authentication → Metodo di accesso → **Anonimo** → Attiva.
3. Firestore Database → Crea database → `eur3 (Europe)` → modalità produzione.
4. Firestore → Regole: incolla `firestore.rules` con i valori veri al posto dei segnaposto → Pubblica.
5. Impostazioni progetto → Le tue app → Web `</>` → copia `firebaseConfig` in `index.html` (non è segreta).
6. GitHub → Settings → Pages → Branch `master` / root → Save.
7. Authentication → Impostazioni → Domini autorizzati → aggiungi `<utente>.github.io`.
8. Diventa admin (vedi sopra) e manda nel gruppo `https://<utente>.github.io/<repo>/?circolo=<codice>`,
   raccomandando di ricordare il PIN e di aggiungere la pagina alla schermata Home.

</details>
