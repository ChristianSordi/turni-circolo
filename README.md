# Circolo Arci San Liberato — Turni

Agenda condivisa dei turni: si apre il link del circolo, la prima volta si scrivono nome e cognome
e si sceglie un PIN di 4 cifre, poi si tocca un giorno libero per segnarsi. Nessun account.

## Messa online (una volta sola)

1. **Firebase** — https://console.firebase.google.com → "Crea progetto" (piano gratuito Spark,
   Google Analytics non serve).
2. **Authentication** → Inizia → Metodo di accesso → **Anonimo** → Attiva.
3. **Firestore Database** → Crea database → località `eur3 (Europe)` → modalità produzione.
4. Firestore → **Regole**: incolla il contenuto di `firestore.rules`, **sostituisci `CAMBIAMI`**
   (parola segreta admin) e **`CODICE-CIRCOLO`** (codice del circolo) con valori tuoi — solo lì,
   non nel repository → Pubblica.
   **Usa valori lunghi e casuali, non parole:** chiunque può provare a indovinarli all'infinito, e
   chi indovina la parola admin può cancellare tutti i turni. Generali così e salvali da parte:
   `node -e "console.log(crypto.randomUUID())"` (uno per la parola admin, uno per il codice).

   ⚠️ **Non usare mai `firebase deploy` dalla cartella del repository**: pubblicherebbe
   `firestore.rules` con i segnaposto `CAMBIAMI` / `CODICE-CIRCOLO` visibili a tutti su GitHub.
   Le regole vere stanno nella cartella locale `prod/` (ignorata da git, insieme a
   `segreti.local.txt`). Dopo aver cambiato `firestore.rules`, riporta la modifica in
   `prod/firestore.rules` mantenendo i valori veri, poi:
   `cd prod && npx firebase deploy --only firestore:rules --project turni-sanliberato`.
5. Impostazioni progetto → Le tue app → icona Web `</>` → registra l'app → copia i valori di
   `firebaseConfig` in `index.html` (non sono segreti).
6. **GitHub** — crea un repository pubblico, carica `index.html`, `calendario.js` e `profilo.js`
   (o fai push di tutto) → Settings → Pages → Branch `main` / root → Save.
7. Authentication → Impostazioni → **Domini autorizzati** → aggiungi `<tuo-utente>.github.io`.
8. Dal tuo telefono apri una volta
   `https://<tuo-utente>.github.io/<repo>/?circolo=<codice-circolo>&admin=<parola-segreta>`:
   entri nel circolo e il telefono diventa amministratore.
9. Manda `https://<tuo-utente>.github.io/<repo>/?circolo=<codice-circolo>` nel gruppo del circolo,
   raccomandando di **ricordare il PIN** e di **aggiungere la pagina alla schermata Home**.

**Se il link del circolo finisce in mani sbagliate:** cambia il codice nelle regole (console →
Firestore → Regole → Pubblica) e manda il link nuovo. Chi è già iscritto continua a funzionare
(il codice serve solo per iscriversi).

## Uso

- **Altro dispositivo, telefono nuovo, o il telefono "si è dimenticato":** si apre la pagina (anche
  senza il link del circolo) e si scrivono lo stesso nome e cognome e lo stesso PIN: si ritrovano i
  propri turni. Maiuscole e spazi non contano. (Su iPhone Safari cancella i dati dei siti non aperti
  per 7 giorni: con il PIN non è un problema.)
- **Admin:** tocca un giorno occupato per togliere il turno di chiunque.
- **PIN dimenticato:** l'admin, in fondo alla pagina, nell'elenco **Soci** tocca "Reimposta PIN"
  accanto al nome, sceglie il nuovo PIN e lo comunica al socio. I turni restano suoi; il vecchio PIN
  smette di funzionare su tutti i dispositivi.
- **Limite:** un PIN di 4 cifre ferma errori e furbetti, non un attacco automatico deciso di un socio.
  In caso di abusi: reimposta il PIN della vittima.
- **Correggere un nome:** console Firebase → Firestore → `persone` → modifica `nome` (sempre nome e
  cognome), **poi nella pagina tocca "Reimposta PIN"** per quel socio: la chiave del profilo dipende
  dal nome, senza reset il socio non riuscirebbe più a rientrare col nome corretto. I turni già
  segnati mantengono il vecchio nome: modificali in `turni`.

## Sviluppo

Serve Java 21+ (emulatore Firebase). Porte: auth 9099, Firestore 8181.

```bash
npm install
npm test                       # regole di sicurezza + calendario
npm run emulatori              # emulatori auth + firestore
python3 -m http.server 8000    # poi apri http://localhost:8000/?circolo=CODICE-CIRCOLO
```
