# Turni Circolo Arci San Liberato — Implementation Plan

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Pagina web unica, senza account, dove i soci del Circolo Arci San Liberato si segnano per un turno al giorno.

**Architecture:** `index.html` statico (GitHub Pages) che parla direttamente con Firestore tramite l'SDK Firebase da CDN. Firebase Anonymous Auth dà a ogni browser un `uid` invisibile; le regole Firestore (`firestore.rules`) sono l'unico backend e applicano tutte le garanzie (un turno al giorno, si cancella solo il proprio, admin). Il multi-dispositivo passa da un link personale `?io=<segreto>`; l'accesso al circolo da un codice nel link `?circolo=<codice>`.

**Tech Stack:** HTML/CSS/JS vanilla (ES modules), Firebase JS SDK 12.19.0 da `https://www.gstatic.com/firebasejs/12.19.0/`, Firestore + Anonymous Auth (piano Spark). Test: `node:test`, `@firebase/rules-unit-testing` 5.x, `firebase-tools` 15.x (emulatore, richiede **Java 21+**).

**Spec:** `docs/superpowers/specs/2026-09-29-turni-circolo-design.md`

## Global Constraints

- Titolo pagina e intestazione: `Circolo Arci San Liberato — Turni`.
- Tutti i testi visibili in italiano.
- Un solo turno al giorno; chiave documento turno = data `AAAA-MM-GG`.
- Nome: 1–60 caratteri dopo `trim()`.
- Nessuna registrazione/login visibile; unica domanda al primo accesso: "Come ti chiami?".
- Giorni passati: nessuna prenotazione né cancellazione (tranne admin).
- Il `segreto` personale non deve mai comparire nei documenti `turni`.
- Parola segreta admin nel file del repo = `CAMBIAMI` (segnaposto); quella vera si mette solo nella console Firebase, mai nel repo.
- Codice del circolo nel file del repo = `CODICE-CIRCOLO` (segnaposto); stesso trattamento. Link del circolo: `…/?circolo=<codice>`.
- Senza codice del circolo non si crea un profilo e non si leggono i turni (blocco nelle regole).
- Nessun build step, nessun framework per la pagina; `npm` solo per i test.
- I nomi degli utenti si mostrano sempre con `textContent`, mai `innerHTML`.

## Review Focus

1. Nome con caratteri HTML (es. `<img src=x onerror=alert(1)>`) → mostrato come testo, nessuno script eseguito per gli altri utenti. (Task 3, step di verifica manuale)
2. Uso vicino a mezzanotte in Italia → il giorno "oggi" e le date sono quelle locali, non UTC. (Task 2, test con `TZ=Europe/Rome`)
3. Link personale sbagliato o di un'altra persona → "Link personale non valido" oppure conferma esplicita "Vuoi usare questo dispositivo come X?", mai un cambio d'identità silenzioso. (Task 1 test regole segreto sbagliato; Task 3 verifica manuale)
4. Nome vuoto, solo spazi o troppo lungo → rifiutato. (Task 1 test regole; Task 3 `trim()` + `maxlength`)
5. Due persone toccano lo stesso giorno insieme → solo la prima passa, la seconda vede "Questo giorno è appena stato preso." (Task 1 test regole; Task 3 verifica manuale)

---

### Task 1: Progetto, regole di sicurezza e loro test

**Files:**
- Create: `package.json`, `firebase.json`, `.gitignore`
- Create: `firestore.rules`
- Test: `test/rules.test.mjs`

**Interfaces:**
- Produces: modello dati usato dalla pagina (Task 3):
  - `persone/{segreto}` = `{ id: string, nome: string, codice: string }` — `id` = uid del primo dispositivo, `codice` = codice del circolo
  - `dispositivi/{uid}` = `{ id: string, segreto: string }`
  - `turni/{AAAA-MM-GG}` = `{ id: string, nome: string }`
  - `admin/{uid}` = `{ chiave: string }`
- Produces: `npm test` (esegue tutti i `*.test.mjs` dentro l'emulatore) e `npm run emulatori` (auth 9099 + firestore 8080, progetto `demo-turni`).

- [ ] **Step 1: Java 21 per l'emulatore**

`firebase-tools` 15 rifiuta Java < 21. Sulla macchina c'è sdkman con Java 8 e 17.

```bash
source ~/.sdkman/bin/sdkman-init.sh
sdk list java | grep -E '\| 21\.[0-9.]+-tem'   # prendi l'identificatore, es. 21.0.8-tem
sdk install java <identificatore>               # rispondi "n" a "set as default"
sdk use java <identificatore>
java -version                                   # atteso: 21.x
```

- [ ] **Step 2: Scaffolding npm e firebase**

`package.json`:

```json
{
  "name": "turni-circolo",
  "private": true,
  "type": "module",
  "scripts": {
    "test": "firebase emulators:exec --only firestore --project demo-turni \"node --test\"",
    "emulatori": "firebase emulators:start --only auth,firestore --project demo-turni"
  }
}
```

```bash
cd /home/christian/Projects/turni-circolo
npm i -D firebase-tools@15 @firebase/rules-unit-testing@5 firebase@12
```

`firebase.json`:

```json
{
  "firestore": { "rules": "firestore.rules" },
  "emulators": {
    "auth": { "port": 9099 },
    "firestore": { "port": 8080 },
    "ui": { "enabled": false },
    "singleProjectMode": true
  }
}
```

`.gitignore`:

```
node_modules/
*-debug.log
```

- [ ] **Step 3: Regole "chiudi tutto" (per vedere i test fallire)**

`firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {
    match /{x=**} { allow read, write: if false; }
  }
}
```

- [ ] **Step 4: Scrivi i test delle regole**

`test/rules.test.mjs`:

```js
import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs } from 'firebase/firestore';

const SEGRETO_ANNA = 'segreto-anna-0123456789';
const SEGRETO_BRUNO = 'segreto-bruno-0123456789';
const GIORNO = '2026-10-12';
const CODICE = 'CODICE-CIRCOLO';
let env;

before(async () => {
  env = await initializeTestEnvironment({
    projectId: 'demo-turni',
    firestore: { rules: readFileSync('firestore.rules', 'utf8') },
  });
});
after(() => env.cleanup());
beforeEach(async () => {
  await env.clearFirestore();
  await env.withSecurityRulesDisabled(async (ctx) => {
    const db = ctx.firestore();
    await setDoc(doc(db, 'persone', SEGRETO_ANNA), { id: 'anna', nome: 'Anna', codice: CODICE });
    await setDoc(doc(db, 'dispositivi', 'anna'), { id: 'anna', segreto: SEGRETO_ANNA });
    await setDoc(doc(db, 'persone', SEGRETO_BRUNO), { id: 'bruno', nome: 'Bruno', codice: CODICE });
    await setDoc(doc(db, 'dispositivi', 'bruno'), { id: 'bruno', segreto: SEGRETO_BRUNO });
  });
});

const db = (uid) => env.authenticatedContext(uid).firestore();
const segnaAnna = () => setDoc(doc(db('anna'), 'turni', GIORNO), { id: 'anna', nome: 'Anna' });

test('nuovo utente crea il suo profilo e collega il dispositivo', async () => {
  const s = 'segreto-carla-0123456789';
  await assertSucceeds(setDoc(doc(db('carla'), 'persone', s), { id: 'carla', nome: 'Carla', codice: CODICE }));
  await assertSucceeds(setDoc(doc(db('carla'), 'dispositivi', 'carla'), { id: 'carla', segreto: s }));
});

test('senza codice del circolo giusto non si crea il profilo', async () => {
  await assertFails(setDoc(doc(db('carla'), 'persone', 'segreto-senza-0123456789'), { id: 'carla', nome: 'Carla' }));
  await assertFails(setDoc(doc(db('carla'), 'persone', 'segreto-errato-0123456789'), { id: 'carla', nome: 'Carla', codice: 'vecchio' }));
});

test('non si crea un profilo con id di un altro', async () => {
  await assertFails(setDoc(doc(db('carla'), 'persone', 'segreto-finto-0123456789'), { id: 'anna', nome: 'Anna', codice: CODICE }));
});

test('nome vuoto o oltre 60 caratteri rifiutato', async () => {
  await assertFails(setDoc(doc(db('carla'), 'persone', 'segreto-vuoto-0123456789'), { id: 'carla', nome: '', codice: CODICE }));
  await assertFails(setDoc(doc(db('carla'), 'persone', 'segreto-lungo-0123456789'), { id: 'carla', nome: 'x'.repeat(61), codice: CODICE }));
});

test('persone non è elencabile ma si legge conoscendo il segreto', async () => {
  await assertFails(getDocs(collection(db('carla'), 'persone')));
  await assertSucceeds(getDoc(doc(db('carla'), 'persone', SEGRETO_ANNA)));
});

test('dispositivo di un altro non leggibile', async () => {
  await assertFails(getDoc(doc(db('bruno'), 'dispositivi', 'anna')));
});

test('ci si segna in un giorno libero; nessun altro può prenderlo o modificarlo', async () => {
  await assertSucceeds(segnaAnna());
  await assertFails(setDoc(doc(db('bruno'), 'turni', GIORNO), { id: 'bruno', nome: 'Bruno' }));
  await assertFails(setDoc(doc(db('anna'), 'turni', GIORNO), { id: 'anna', nome: 'Anna 2' }));
});

test('non ci si segna con id o nome di un altro', async () => {
  await assertFails(setDoc(doc(db('bruno'), 'turni', '2026-10-13'), { id: 'anna', nome: 'Anna' }));
  await assertFails(setDoc(doc(db('bruno'), 'turni', '2026-10-13'), { id: 'bruno', nome: 'Anna' }));
});

test('senza profilo non ci si segna', async () => {
  await assertFails(setDoc(doc(db('carla'), 'turni', GIORNO), { id: 'carla', nome: 'Carla' }));
});

test('chiave turno deve essere una data AAAA-MM-GG', async () => {
  await assertFails(setDoc(doc(db('anna'), 'turni', 'domani'), { id: 'anna', nome: 'Anna' }));
});

test('i membri leggono i turni, un estraneo no', async () => {
  await segnaAnna();
  await assertSucceeds(getDoc(doc(db('bruno'), 'turni', GIORNO)));
  await assertFails(getDocs(collection(db('estraneo'), 'turni')));
});

test('solo il proprietario cancella il suo turno', async () => {
  await segnaAnna();
  await assertFails(deleteDoc(doc(db('bruno'), 'turni', GIORNO)));
  await assertSucceeds(deleteDoc(doc(db('anna'), 'turni', GIORNO)));
});

test('secondo dispositivo con il link personale diventa la stessa persona', async () => {
  await segnaAnna();
  await assertFails(setDoc(doc(db('anna-pc'), 'dispositivi', 'anna-pc'), { id: 'anna', segreto: 'segreto-sbagliato-0123' }));
  await assertFails(setDoc(doc(db('anna-pc'), 'dispositivi', 'anna-pc'), { id: 'anna', segreto: SEGRETO_BRUNO }));
  await assertFails(setDoc(doc(db('anna-pc'), 'dispositivi', 'anna'), { id: 'anna', segreto: SEGRETO_ANNA }));
  await assertSucceeds(setDoc(doc(db('anna-pc'), 'dispositivi', 'anna-pc'), { id: 'anna', segreto: SEGRETO_ANNA }));
  await assertSucceeds(deleteDoc(doc(db('anna-pc'), 'turni', GIORNO)));
});

test('admin solo con la chiave giusta, e può cancellare qualsiasi turno', async () => {
  await segnaAnna();
  await assertFails(setDoc(doc(db('capo'), 'admin', 'capo'), { chiave: 'sbagliata' }));
  await assertFails(setDoc(doc(db('capo'), 'admin', 'altro'), { chiave: 'CAMBIAMI' }));
  await assertSucceeds(setDoc(doc(db('capo'), 'admin', 'capo'), { chiave: 'CAMBIAMI' }));
  await assertSucceeds(getDoc(doc(db('capo'), 'admin', 'capo')));
  await assertSucceeds(deleteDoc(doc(db('capo'), 'turni', GIORNO)));
});
```

- [ ] **Step 5: Esegui i test e verifica che falliscano**

Run: `npm test`
Expected: FAIL — i test con `assertSucceeds` falliscono (regole "chiudi tutto"), quelli con solo `assertFails` passano.

- [ ] **Step 6: Scrivi le regole vere**

`firestore.rules`:

```
rules_version = '2';
service cloud.firestore {
  match /databases/{database}/documents {

    function dispositivo() {
      return get(/databases/$(database)/documents/dispositivi/$(request.auth.uid)).data;
    }
    function persona(segreto) {
      return get(/databases/$(database)/documents/persone/$(segreto)).data;
    }
    function isAdmin() {
      return exists(/databases/$(database)/documents/admin/$(request.auth.uid));
    }

    // Profilo: la chiave è il segreto personale. Si legge solo conoscendolo, mai in elenco.
    match /persone/{segreto} {
      allow get: if request.auth != null;
      allow create: if request.auth != null
        && segreto.size() >= 20
        && request.resource.data.keys().hasOnly(['id', 'nome', 'codice'])
        // Sostituisci CODICE-CIRCOLO SOLO nella console Firebase, mai nel repo.
        && request.resource.data.codice == 'CODICE-CIRCOLO'
        && request.resource.data.id == request.auth.uid
        && request.resource.data.nome is string
        && request.resource.data.nome.size() >= 1
        && request.resource.data.nome.size() <= 60;
    }

    // Collega un dispositivo (uid anonimo) a una persona: serve il suo segreto.
    match /dispositivi/{uid} {
      allow read: if request.auth.uid == uid;
      allow create, update: if request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['id', 'segreto'])
        && persona(request.resource.data.segreto).id == request.resource.data.id;
    }

    // Un documento per giorno: "create" riesce solo se il giorno è libero.
    match /turni/{data} {
      allow read: if exists(/databases/$(database)/documents/dispositivi/$(request.auth.uid));
      allow create: if data.matches('^[0-9]{4}-[0-9]{2}-[0-9]{2}$')
        && request.resource.data.keys().hasOnly(['id', 'nome'])
        && request.resource.data.id == persona(dispositivo().segreto).id
        && request.resource.data.nome == persona(dispositivo().segreto).nome;
      allow delete: if isAdmin() || resource.data.id == dispositivo().id;
    }

    // Sostituisci CAMBIAMI con la parola segreta SOLO nella console Firebase, mai nel repo.
    match /admin/{uid} {
      allow read: if request.auth.uid == uid;
      allow create: if request.auth.uid == uid
        && request.resource.data.keys().hasOnly(['chiave'])
        && request.resource.data.chiave == 'CAMBIAMI';
    }
  }
}
```

- [ ] **Step 7: Esegui i test e verifica che passino**

Run: `npm test`
Expected: PASS, 14 test, 0 falliti.

- [ ] **Step 8: Commit**

```bash
git add package.json package-lock.json firebase.json .gitignore firestore.rules test/rules.test.mjs
git commit -m "Regole Firestore con test: un turno al giorno, cancella solo il proprietario, admin"
```

---

### Task 2: Logica del calendario

**Files:**
- Create: `calendario.js`
- Test: `test/calendario.test.mjs`

**Interfaces:**
- Produces (usati da `index.html`, Task 3):
  - `iso(d: Date): string` → `'AAAA-MM-GG'` in ora locale
  - `griglia(anno: number, mese: number /* 0-11 */): (string|null)[]` → celle del mese, settimana da lunedì, `null` = casella vuota prima del giorno 1
  - `giornoLeggibile(s: string): string` → es. `'giovedì 1 ottobre'`

- [ ] **Step 1: Scrivi il test**

`test/calendario.test.mjs`:

```js
process.env.TZ = 'Europe/Rome'; // prima di qualsiasi Date: fa emergere l'errore UTC di toISOString
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, griglia, giornoLeggibile } from '../calendario.js';

test('iso usa la data locale anche subito dopo mezzanotte', () => {
  assert.equal(iso(new Date(2026, 9, 12, 0, 30)), '2026-10-12');
});

test('ottobre 2026 parte di giovedì: 3 caselle vuote, 31 giorni', () => {
  const g = griglia(2026, 9);
  assert.deepEqual(g.slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(g.length, 3 + 31);
  assert.equal(g.at(-1), '2026-10-31');
});

test('febbraio 2026 parte di domenica: 6 vuote, 28 giorni', () => {
  const g = griglia(2026, 1);
  assert.equal(g.filter((c) => c === null).length, 6);
  assert.equal(g.at(-1), '2026-02-28');
});

test('febbraio 2028 bisestile parte di martedì', () => {
  const g = griglia(2028, 1);
  assert.deepEqual(g.slice(0, 2), [null, '2028-02-01']);
  assert.equal(g.at(-1), '2028-02-29');
});

test('giornoLeggibile in italiano', () => {
  assert.equal(giornoLeggibile('2026-10-01'), 'giovedì 1 ottobre');
});
```

- [ ] **Step 2: Verifica che fallisca**

Run: `node --test test/calendario.test.mjs`
Expected: FAIL con `Cannot find module '.../calendario.js'`.

- [ ] **Step 3: Implementa**

`calendario.js`:

```js
// Data locale AAAA-MM-GG (toISOString è UTC e sbaglia giorno vicino a mezzanotte).
export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Celle del mese con settimana da lunedì; null = casella vuota prima del giorno 1.
export function griglia(anno, mese) {
  const vuote = (new Date(anno, mese, 1).getDay() + 6) % 7;
  const giorni = new Date(anno, mese + 1, 0).getDate();
  return [
    ...Array(vuote).fill(null),
    ...Array.from({ length: giorni }, (_, i) => iso(new Date(anno, mese, i + 1))),
  ];
}

export const giornoLeggibile = (s) =>
  new Date(s.slice(0, 4), s.slice(5, 7) - 1, s.slice(8)).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
```

- [ ] **Step 4: Verifica che passi**

Run: `node --test test/calendario.test.mjs` poi `npm test`
Expected: PASS (5 test calendario; con `npm test` 19 in totale).

- [ ] **Step 5: Commit**

```bash
git add calendario.js test/calendario.test.mjs
git commit -m "Griglia mensile del calendario con date locali"
```

---

### Task 3: La pagina

**Files:**
- Create: `index.html`

**Interfaces:**
- Consumes: `iso`, `griglia`, `giornoLeggibile` da `./calendario.js` (Task 2); modello dati e `npm run emulatori` (Task 1).
- Produces: pagina completa. Su `localhost`/`127.0.0.1` si collega automaticamente agli emulatori; altrove usa `firebaseConfig`.

- [ ] **Step 1: Scrivi `index.html`**

```html
<!doctype html>
<html lang="it">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width, initial-scale=1">
<title>Circolo Arci San Liberato — Turni</title>
<style>
  :root { --verde: #2e7d32; --verde-chiaro: #c8e6c9; --grigio: #e0e0e0; --testo: #222; --sfondo: #fff; }
  * { box-sizing: border-box; }
  body { max-width: 700px; margin: 0 auto; padding: 16px; font: 18px/1.4 system-ui, sans-serif; color: var(--testo); background: var(--sfondo); }
  h1 { font-size: 1.4rem; text-align: center; margin: 0 0 12px; }
  button { font: inherit; cursor: pointer; color: inherit; }
  .mese { display: flex; align-items: center; justify-content: space-between; margin-bottom: 8px; }
  .mese button { font-size: 1.6rem; padding: 4px 18px; border: 1px solid #999; border-radius: 8px; background: #fff; }
  .mese h2 { margin: 0; font-size: 1.3rem; text-transform: capitalize; }
  .griglia { display: grid; grid-template-columns: repeat(7, 1fr); gap: 4px; }
  .intestazione { text-align: center; font-weight: bold; font-size: .9rem; }
  .giorno { min-height: 64px; padding: 4px 2px; border: 1px solid #bbb; border-radius: 6px; background: #fff;
            display: flex; flex-direction: column; align-items: center; overflow: hidden; }
  .giorno .num { font-weight: bold; }
  .giorno .nome { font-size: .7rem; text-align: center; overflow-wrap: anywhere; }
  .giorno.altro { background: var(--grigio); }
  .giorno.mio { background: var(--verde-chiaro); border-color: var(--verde); }
  .giorno.passato { opacity: .45; }
  .giorno.oggi { outline: 3px solid #1565c0; }
  input { font: inherit; width: 100%; padding: 12px; margin-top: 8px; border: 1px solid #999; border-radius: 8px; }
  .grande { display: block; width: 100%; margin-top: 10px; padding: 14px; border: 0; border-radius: 8px;
            background: var(--verde); color: #fff; font-weight: bold; }
  .link { margin-top: 24px; padding: 12px; border: 1px solid #ccc; border-radius: 8px; }
  .link code { display: block; overflow-wrap: anywhere; font-size: .8rem; margin: 6px 0; }
  .grigio { color: #666; font-size: .9rem; }
  [hidden] { display: none !important; }
</style>
</head>
<body>
<h1>Circolo Arci San Liberato — Turni</h1>
<p id="stato" class="grigio">Caricamento…</p>

<form id="benvenuto" hidden>
  <label for="nome">Come ti chiami? (nome e cognome)</label>
  <input id="nome" maxlength="60" autocomplete="name" required>
  <button class="grande">Salva</button>
</form>

<main id="agenda" hidden>
  <div class="mese">
    <button id="prima" aria-label="Mese precedente">‹</button>
    <h2 id="titolo-mese"></h2>
    <button id="dopo" aria-label="Mese successivo">›</button>
  </div>
  <div id="griglia" class="griglia"></div>
  <p class="grigio">Tocca un giorno libero per segnarti.</p>
  <div class="link">
    <strong>Il tuo link personale</strong>
    <div class="grigio">Aprilo su un altro telefono o computer per usare lo stesso nome. Non darlo ad altri.</div>
    <code id="mio-link"></code>
    <button id="whatsapp" class="grande">Invia su WhatsApp</button>
    <button id="copia" class="grande">Copia</button>
  </div>
</main>

<script type="module">
import { initializeApp } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-app.js';
import { getAuth, signInAnonymously, connectAuthEmulator } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-auth.js';
import { getFirestore, connectFirestoreEmulator, doc, getDoc, setDoc, deleteDoc, collection, onSnapshot }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { iso, griglia, giornoLeggibile } from './calendario.js';

// Config web dalla console Firebase (Impostazioni progetto → Le tue app). Non è segreta.
const firebaseConfig = {
  apiKey: 'INCOLLA-DALLA-CONSOLE',
  authDomain: 'INCOLLA-DALLA-CONSOLE',
  projectId: 'INCOLLA-DALLA-CONSOLE',
  appId: 'INCOLLA-DALLA-CONSOLE',
};

const locale = ['localhost', '127.0.0.1'].includes(location.hostname);
const app = initializeApp(locale ? { apiKey: 'demo', projectId: 'demo-turni' } : firebaseConfig);
const auth = getAuth(app);
const db = getFirestore(app);
if (locale) {
  connectAuthEmulator(auth, 'http://127.0.0.1:9099', { disableWarnings: true });
  connectFirestoreEmulator(db, '127.0.0.1', 8080);
}

const $ = (id) => document.getElementById(id);
const oggi = iso(new Date());
let io = null;       // { id, nome, segreto }
let admin = false;
let turni = {};      // 'AAAA-MM-GG' → { id, nome }
let anno = new Date().getFullYear();
let mese = new Date().getMonth();

function el(tag, classe = '', testo = '') {
  const e = document.createElement(tag);
  if (classe) e.className = classe;
  e.textContent = testo; // mai innerHTML: i nomi li scrivono gli utenti
  return e;
}

async function profilo(uid) {
  const url = new URL(location.href);
  const chiaveAdmin = url.searchParams.get('admin');
  const segretoLink = url.searchParams.get('io');

  admin = (await getDoc(doc(db, 'admin', uid))).exists();
  if (chiaveAdmin && !admin) {
    try { await setDoc(doc(db, 'admin', uid), { chiave: chiaveAdmin }); admin = true; }
    catch { alert('Chiave amministratore non valida.'); }
  }

  const mioDispositivo = await getDoc(doc(db, 'dispositivi', uid));
  let segreto = mioDispositivo.exists() ? mioDispositivo.data().segreto : null;

  if (segretoLink && segretoLink !== segreto) {
    const p = await getDoc(doc(db, 'persone', segretoLink));
    if (!p.exists()) alert('Link personale non valido.');
    else if (confirm(`Questo link è di ${p.data().nome}. Vuoi usare questo dispositivo come ${p.data().nome}?`)) {
      await setDoc(doc(db, 'dispositivi', uid), { id: p.data().id, segreto: segretoLink });
      segreto = segretoLink;
    }
  }
  if (!segreto) return null;
  const p = await getDoc(doc(db, 'persone', segreto));
  return { ...p.data(), segreto };
}

async function creaProfilo(uid, nome, codice) {
  const segreto = crypto.randomUUID();
  await setDoc(doc(db, 'persone', segreto), { id: uid, nome, codice });
  await setDoc(doc(db, 'dispositivi', uid), { id: uid, segreto });
  return { id: uid, nome, segreto };
}

function disegna() {
  $('titolo-mese').textContent = new Date(anno, mese).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });
  const g = $('griglia');
  g.replaceChildren(...['L', 'M', 'M', 'G', 'V', 'S', 'D'].map((l) => el('div', 'intestazione', l)));
  for (const data of griglia(anno, mese)) {
    if (!data) { g.append(el('div')); continue; }
    const t = turni[data];
    const b = el('button', 'giorno');
    b.append(el('span', 'num', String(Number(data.slice(8)))), el('span', 'nome', t ? t.nome : ''));
    if (t) b.classList.add(t.id === io.id ? 'mio' : 'altro');
    if (data < oggi) b.classList.add('passato');
    if (data === oggi) b.classList.add('oggi');
    b.onclick = () => tocca(data);
    g.append(b);
  }
}

function cambiaMese(delta) {
  const d = new Date(anno, mese + delta);
  anno = d.getFullYear();
  mese = d.getMonth();
  disegna();
}

async function tocca(data) {
  const t = turni[data];
  const quando = giornoLeggibile(data);
  const passato = data < oggi;
  try {
    if (!t) {
      if (!passato && confirm(`Vuoi segnarti per ${quando}?`)) {
        await setDoc(doc(db, 'turni', data), { id: io.id, nome: io.nome });
      }
    } else if (t.id === io.id && !passato) {
      if (confirm(`Vuoi togliere il tuo turno di ${quando}?`)) await deleteDoc(doc(db, 'turni', data));
    } else if (admin) {
      if (confirm(`Togliere il turno di ${t.nome} di ${quando}?`)) await deleteDoc(doc(db, 'turni', data));
    } else {
      alert(`${quando}: turno di ${t.nome}`);
    }
  } catch (e) {
    alert(e.code === 'permission-denied' && !t
      ? 'Questo giorno è appena stato preso.'
      : 'Operazione non riuscita. Controlla la connessione e riprova.');
  }
}

function mostraAgenda() {
  history.replaceState(null, '', location.pathname); // via ?circolo, ?io, ?admin dalla barra
  $('stato').textContent = `Sei: ${io.nome}${admin ? ' (amministratore)' : ''}`;
  $('stato').hidden = false;
  $('agenda').hidden = false;
  const link = `${location.origin}${location.pathname}?io=${io.segreto}`;
  $('mio-link').textContent = link;
  $('whatsapp').onclick = () =>
    open(`https://wa.me/?text=${encodeURIComponent('Il mio link per i turni del Circolo Arci San Liberato: ' + link)}`);
  $('copia').onclick = () => navigator.clipboard.writeText(link).then(() => alert('Link copiato.'));
  $('prima').onclick = () => cambiaMese(-1);
  $('dopo').onclick = () => cambiaMese(1);
  disegna();
  // ponytail: ascolta tutti i turni di sempre (~365 l'anno); filtrare per mese se diventano migliaia.
  onSnapshot(collection(db, 'turni'), (snap) => {
    turni = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    disegna();
  }, () => { $('stato').textContent = 'Connessione assente. Ricarica la pagina.'; });
}

async function avvia() {
  try {
    const { user } = await signInAnonymously(auth);
    io = await profilo(user.uid);
    if (!io) {
      const codice = new URL(location.href).searchParams.get('circolo');
      if (!codice) {
        $('stato').textContent = "Per usare l'agenda apri il link del circolo (lo trovi nel gruppo WhatsApp).";
        return;
      }
      $('stato').hidden = true;
      $('benvenuto').hidden = false;
      const nome = await new Promise((ok) => {
        $('benvenuto').onsubmit = (e) => {
          e.preventDefault();
          const n = $('nome').value.trim();
          if (n) ok(n);
        };
      });
      $('benvenuto').hidden = true;
      try {
        io = await creaProfilo(user.uid, nome, codice);
      } catch (e) {
        if (e.code !== 'permission-denied') throw e;
        $('stato').hidden = false;
        $('stato').textContent = 'Link del circolo non valido o scaduto: chiedi quello nuovo.';
        return;
      }
    }
    mostraAgenda();
  } catch (e) {
    console.error(e);
    $('stato').hidden = false;
    $('stato').textContent = 'Connessione assente. Ricarica la pagina.';
  }
}

avvia();
</script>
</body>
</html>
```

- [ ] **Step 2: Avvia emulatori e server locale**

```bash
source ~/.sdkman/bin/sdkman-init.sh && sdk use java <identificatore-21>
npm run emulatori                  # terminale 1 (lasciare aperto)
python3 -m http.server 8000        # terminale 2
```

- [ ] **Step 3: Verifica manuale nel browser** (`http://localhost:8000`)

Usa una finestra normale (utente A) e una finestra in incognito (utente B). Apri sempre `http://localhost:8000/?circolo=CODICE-CIRCOLO` salvo dove indicato.

0. Nuova finestra incognito su `http://localhost:8000/` (senza codice) → solo "Per usare l'agenda apri il link del circolo…", niente calendario. Con `?circolo=sbagliato` → dopo il nome: "Link del circolo non valido o scaduto…".
1. A: compare "Come ti chiami?". Solo spazi + Salva → non succede niente. Scrivi `Anna Rossi` → compare il calendario del mese corrente, oggi bordato di blu, "Sei: Anna Rossi"; l'URL non contiene più `?circolo=`.
2. A: ricarica (ora senza codice nell'URL) → nessuna domanda, stesso nome, calendario visibile.
3. A: tocca un giorno futuro libero → conferma → diventa verde con "Anna Rossi".
4. B: nome `<img src=x onerror=alert(1)>` → nessun alert parte; il testo compare letteralmente. B vede il giorno di Anna grigio; toccandolo compare "…: turno di Anna Rossi".
5. B: prenota un altro giorno; A lo vede apparire **senza ricaricare**.
6. A e B: aprite lo stesso giorno libero, fate comparire la conferma in entrambe, confermate prima A poi B → B vede "Questo giorno è appena stato preso."
7. A: tocca il suo giorno → "Vuoi togliere…" → sì → torna bianco.
8. Giorno passato: nessuna conferma di prenotazione.
9. Copia il link personale di A, aprilo in una terza finestra (altro profilo del browser) → "Questo link è di Anna Rossi. Vuoi usare…?" → sì → "Sei: Anna Rossi", l'URL non contiene più `?io=`; può togliere i turni di Anna.
10. Apri `http://localhost:8000/?io=inventato` in una nuova finestra incognito → "Link personale non valido." e poi domanda del nome.
11. In B apri `http://localhost:8000/?admin=sbagliata` → "Chiave amministratore non valida." Poi `?admin=CAMBIAMI` → "(amministratore)"; B può togliere il turno di Anna. Riapri `?admin=CAMBIAMI` → nessun messaggio di errore.
12. Telefono: DevTools → vista mobile 360px → nessuno scroll orizzontale, nomi leggibili.

- [ ] **Step 4: Commit**

```bash
git add index.html
git commit -m "Pagina turni: calendario, prenotazione, link personale, admin"
```

---

### Task 4: README con messa online

**Files:**
- Create: `README.md`

- [ ] **Step 1: Scrivi `README.md`**

````markdown
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

Serve Java 21+ (emulatore Firebase).

```bash
npm install
npm test                       # regole di sicurezza + calendario
npm run emulatori              # emulatori auth + firestore
python3 -m http.server 8000    # poi apri http://localhost:8000/?circolo=CODICE-CIRCOLO
```
````

- [ ] **Step 2: Commit**

```bash
git add README.md
git commit -m "README: messa online e sviluppo"
```
