# Circolo Arci San Liberato — Turni

Agenda condivisa dei turni: si apre il link del circolo, si scrive il proprio nome la prima volta,
si tocca un giorno libero per segnarsi. Nessun account.

## Messa online (una volta sola)

1. **Firebase** — https://console.firebase.google.com → "Crea progetto" (piano gratuito Spark,
   Google Analytics non serve).
2. **Authentication** → Inizia → Metodo di accesso → **Anonimo** → Attiva.
3. **Firestore Database** → Crea database → località `eur3 (Europe)` → modalità produzione.
4. Firestore → **Regole**: incolla il contenuto di `firestore.rules`, **sostituisci `CAMBIAMI`**
   (parola segreta admin) e **`CODICE-CIRCOLO`** (codice del circolo, es. `sanliberato-7k2m`)
   con valori tuoi — solo lì, non nel repository → Pubblica.
5. Impostazioni progetto → Le tue app → icona Web `</>` → registra l'app → copia i valori di
   `firebaseConfig` in `index.html` (non sono segreti).
6. **GitHub** — crea un repository pubblico, carica `index.html` e `calendario.js`
   (o fai push di tutto) → Settings → Pages → Branch `main` / root → Save.
7. Authentication → Impostazioni → **Domini autorizzati** → aggiungi `<tuo-utente>.github.io`.
8. Dal tuo telefono apri una volta
   `https://<tuo-utente>.github.io/<repo>/?circolo=<codice-circolo>&admin=<parola-segreta>`:
   entri nel circolo e il telefono diventa amministratore.
9. Manda `https://<tuo-utente>.github.io/<repo>/?circolo=<codice-circolo>` nel gruppo del circolo.

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
