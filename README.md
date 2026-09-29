# Circolo Arci San Liberato — Turni

Agenda condivisa dei turni: si apre il link del circolo, si scrive il proprio nome la prima volta,
si tocca un giorno libero per segnarsi. Nessun account.

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

   ⚠️ **Non usare mai `firebase deploy`**: pubblicherebbe `firestore.rules` del repository, con i
   segnaposto `CAMBIAMI` / `CODICE-CIRCOLO` visibili a tutti su GitHub. Le regole vere stanno solo
   nella console.
5. Impostazioni progetto → Le tue app → icona Web `</>` → registra l'app → copia i valori di
   `firebaseConfig` in `index.html` (non sono segreti).
6. **GitHub** — crea un repository pubblico, carica `index.html` e `calendario.js`
   (o fai push di tutto) → Settings → Pages → Branch `main` / root → Save.
7. Authentication → Impostazioni → **Domini autorizzati** → aggiungi `<tuo-utente>.github.io`.
8. Dal tuo telefono apri una volta
   `https://<tuo-utente>.github.io/<repo>/?circolo=<codice-circolo>&admin=<parola-segreta>`:
   entri nel circolo e il telefono diventa amministratore.
9. Manda `https://<tuo-utente>.github.io/<repo>/?circolo=<codice-circolo>` nel gruppo del circolo,
   con due raccomandazioni: **appena entrati, mandarsi il proprio link personale su WhatsApp**
   (tasto in fondo alla pagina) e **aggiungere la pagina alla schermata Home**. Su iPhone Safari
   cancella i dati dei siti non aperti per 7 giorni: senza link personale si perderebbero i
   propri turni (l'admin può comunque toglierli); dalla schermata Home questo non succede.

**Se il link del circolo finisce in mani sbagliate:** cambia il codice nelle regole (console →
Firestore → Regole → Pubblica) e manda il link nuovo. Chi è già entrato continua a funzionare.

## Uso

- **Altro dispositivo / telefono nuovo:** in fondo alla pagina c'è "Il tuo link personale" →
  "Invia su WhatsApp" a sé stessi → aprilo sull'altro dispositivo.
- **Admin:** tocca un giorno occupato per togliere il turno di chiunque.
- **Correggere un nome:** console Firebase → Firestore → `persone` → modifica `nome`
  (i turni già segnati mantengono il vecchio nome: modificali in `turni`).

## Sviluppo

Serve Java 21+ (emulatore Firebase). Porte: auth 9099, Firestore 8181.

```bash
npm install
npm test                       # regole di sicurezza + calendario
npm run emulatori              # emulatori auth + firestore
python3 -m http.server 8000    # poi apri http://localhost:8000/?circolo=CODICE-CIRCOLO
```
