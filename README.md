# Turni — Circolo Arci San Liberato

Agenda condivisa dei turni del circolo: https://christiansordi.github.io/turni-circolo/

La prima volta si apre il link del circolo (quello del gruppo WhatsApp), si scrivono nome e cognome e
si sceglie un PIN di 4 cifre. Poi basta toccare un giorno libero per segnarsi. Nessun account, niente
da installare. La scheda **Classifica** conta i turni già fatti, dell'anno o da sempre.

## Per i soci

- **Telefono nuovo o pagina che non ti riconosce più:** apri la pagina e scrivi gli stessi nome,
  cognome e PIN: ritrovi i tuoi turni. Maiuscole e spazi non contano.
- **PIN dimenticato:** chiedi all'amministratore di reimpostarlo.

## Per l'amministratore

- **Diventare admin:** apri una volta dal telefono il link del circolo con in più `&admin=<parola-segreta>`.
- **Togliere un turno:** tocca il giorno occupato.
- **Reimpostare un PIN:** in fondo al calendario, elenco **Soci** → "Reimposta PIN" → comunica il nuovo
  PIN al socio. I turni restano suoi e il vecchio PIN smette di funzionare ovunque.
- **Correggere un nome:** console Firebase → Firestore → `persone` → modifica `nome` (sempre nome e
  cognome), **poi** tocca "Reimposta PIN" per quel socio, altrimenti non riesce più a entrare. I turni
  già segnati tengono il vecchio nome: correggili in `turni`.
- **Cancellare i dati di un socio** (se lo chiede): console Firebase → Firestore → elimina il suo
  documento in `persone` e i suoi giorni in `turni`.
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

Il sito è statico (`index.html`, `calendario.js`, `profilo.js`, `logo.png`, `icona.png`) e si
pubblica da solo con GitHub Pages a ogni push su `master`. I dati stanno su Firebase (Firestore in
Europa, accesso anonimo).

Serve Java 21+ per gli emulatori Firebase (auth 9099, Firestore 8181).

```bash
npm install
npm test                       # regole di sicurezza + calendario + profilo
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
