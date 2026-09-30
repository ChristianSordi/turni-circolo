import { test, before, after, beforeEach } from 'node:test';
import { readFileSync } from 'node:fs';
import { initializeTestEnvironment, assertSucceeds, assertFails } from '@firebase/rules-unit-testing';
import { doc, getDoc, setDoc, deleteDoc, collection, getDocs, query, where, increment, serverTimestamp } from 'firebase/firestore';

const CHIAVE_ANNA = 'chiave-anna-0123456789';
const CHIAVE_BRUNO = 'chiave-bruno-0123456789';
const NUOVA_ANNA = 'chiave-anna-nuova-0123456789';
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
    await setDoc(doc(db, 'persone', CHIAVE_ANNA), { id: 'anna', nome: 'Anna Rossi', codice: CODICE });
    await setDoc(doc(db, 'dispositivi', 'anna'), { id: 'anna', segreto: CHIAVE_ANNA });
    await setDoc(doc(db, 'persone', CHIAVE_BRUNO), { id: 'bruno', nome: 'Bruno Bianchi', codice: CODICE });
    await setDoc(doc(db, 'dispositivi', 'bruno'), { id: 'bruno', segreto: CHIAVE_BRUNO });
  });
});

const db = (uid) => env.authenticatedContext(uid).firestore();
const segnaAnna = () => setDoc(doc(db('anna'), 'turni', GIORNO), { id: 'anna', nome: 'Anna Rossi' });
const diventaAdmin = (uid) => setDoc(doc(db(uid), 'admin', uid), { chiave: 'CAMBIAMI' });

test('iscrizione con il codice del circolo', async () => {
  const k = 'chiave-carla-0123456789';
  await assertSucceeds(setDoc(doc(db('carla'), 'persone', k), { id: 'carla', nome: 'Carla Verdi', codice: CODICE }));
  await assertSucceeds(setDoc(doc(db('carla'), 'dispositivi', 'carla'), { id: 'carla', segreto: k }));
});

test('senza codice del circolo giusto non ci si iscrive', async () => {
  await assertFails(setDoc(doc(db('carla'), 'persone', 'chiave-senza-0123456789'), { id: 'carla', nome: 'Carla Verdi' }));
  await assertFails(setDoc(doc(db('carla'), 'persone', 'chiave-errata-0123456789'), { id: 'carla', nome: 'Carla Verdi', codice: 'vecchio' }));
});

test('non ci si iscrive con id di un altro', async () => {
  await assertFails(setDoc(doc(db('carla'), 'persone', 'chiave-finta-0123456789'), { id: 'anna', nome: 'Anna Rossi', codice: CODICE }));
});

test('nome: obbligatori nome e cognome, spazi singoli, max 60', async () => {
  for (const nome of ['', 'Carla', ' Carla Verdi', 'Carla  Verdi', 'Carla Verdi ', 'Carla ' + 'x'.repeat(60)]) {
    await assertFails(setDoc(doc(db('carla'), 'persone', 'chiave-nome-0123456789'), { id: 'carla', nome, codice: CODICE }));
  }
});

test('persone: si legge conoscendo la chiave, l\'elenco solo l\'admin', async () => {
  await assertSucceeds(getDoc(doc(db('carla'), 'persone', CHIAVE_ANNA)));
  await assertFails(getDocs(collection(db('bruno'), 'persone')));
  await diventaAdmin('capo');
  await assertSucceeds(getDocs(collection(db('capo'), 'persone')));
});

test('dispositivo di un altro non leggibile', async () => {
  await assertFails(getDoc(doc(db('bruno'), 'dispositivi', 'anna')));
});

test('ci si segna in un giorno libero; nessun altro può prenderlo o modificarlo', async () => {
  await assertSucceeds(segnaAnna());
  await assertFails(setDoc(doc(db('bruno'), 'turni', GIORNO), { id: 'bruno', nome: 'Bruno Bianchi' }));
  await assertFails(setDoc(doc(db('anna'), 'turni', GIORNO), { id: 'anna', nome: 'Anna Rossi Due' }));
});

test('non ci si segna con id o nome di un altro', async () => {
  await assertFails(setDoc(doc(db('bruno'), 'turni', '2026-10-13'), { id: 'anna', nome: 'Anna Rossi' }));
  await assertFails(setDoc(doc(db('bruno'), 'turni', '2026-10-13'), { id: 'bruno', nome: 'Anna Rossi' }));
});

test('senza profilo non ci si segna', async () => {
  await assertFails(setDoc(doc(db('carla'), 'turni', GIORNO), { id: 'carla', nome: 'Carla Verdi' }));
});

test('chiave turno deve essere una data AAAA-MM-GG', async () => {
  await assertFails(setDoc(doc(db('anna'), 'turni', 'domani'), { id: 'anna', nome: 'Anna Rossi' }));
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

test('rientro su un altro dispositivo con la chiave giusta = stessa persona', async () => {
  await segnaAnna();
  await assertFails(setDoc(doc(db('anna-pc'), 'dispositivi', 'anna-pc'), { id: 'anna', segreto: 'chiave-sbagliata-0123' }));
  await assertFails(setDoc(doc(db('anna-pc'), 'dispositivi', 'anna-pc'), { id: 'anna', segreto: CHIAVE_BRUNO }));
  await assertFails(setDoc(doc(db('anna-pc'), 'dispositivi', 'anna'), { id: 'anna', segreto: CHIAVE_ANNA }));
  await assertSucceeds(setDoc(doc(db('anna-pc'), 'dispositivi', 'anna-pc'), { id: 'anna', segreto: CHIAVE_ANNA }));
  await assertSucceeds(deleteDoc(doc(db('anna-pc'), 'turni', GIORNO)));
});

test('admin solo con la chiave giusta, e può cancellare qualsiasi turno', async () => {
  await segnaAnna();
  await assertFails(setDoc(doc(db('capo'), 'admin', 'capo'), { chiave: 'sbagliata' }));
  await assertFails(setDoc(doc(db('capo'), 'admin', 'altro'), { chiave: 'CAMBIAMI' }));
  await assertSucceeds(diventaAdmin('capo'));
  await assertSucceeds(getDoc(doc(db('capo'), 'admin', 'capo')));
  await assertSucceeds(deleteDoc(doc(db('capo'), 'turni', GIORNO)));
});

test('reset PIN: solo l\'admin', async () => {
  await assertFails(setDoc(doc(db('bruno'), 'persone', NUOVA_ANNA), { id: 'anna', nome: 'Anna Rossi' }));
  await assertFails(deleteDoc(doc(db('bruno'), 'persone', CHIAVE_ANNA)));
  await assertFails(deleteDoc(doc(db('anna'), 'persone', CHIAVE_ANNA)));
  await diventaAdmin('capo');
  await assertFails(setDoc(doc(db('capo'), 'persone', NUOVA_ANNA), { id: 'anna', nome: 'Anna' }));
  await assertSucceeds(setDoc(doc(db('capo'), 'persone', NUOVA_ANNA), { id: 'anna', nome: 'Anna Rossi' }));
  await assertSucceeds(deleteDoc(doc(db('capo'), 'persone', CHIAVE_ANNA)));
});

test('dopo il reset: vecchio PIN tagliato fuori, nuovo PIN ritrova i turni', async () => {
  await segnaAnna();
  await diventaAdmin('capo');
  await setDoc(doc(db('capo'), 'persone', NUOVA_ANNA), { id: 'anna', nome: 'Anna Rossi' });
  await deleteDoc(doc(db('capo'), 'persone', CHIAVE_ANNA));
  await assertFails(deleteDoc(doc(db('anna'), 'turni', GIORNO)));
  await assertFails(setDoc(doc(db('anna'), 'turni', '2026-10-14'), { id: 'anna', nome: 'Anna Rossi' }));
  await assertSucceeds(setDoc(doc(db('anna'), 'dispositivi', 'anna'), { id: 'anna', segreto: NUOVA_ANNA }));
  await assertSucceeds(setDoc(doc(db('anna'), 'turni', '2026-10-14'), { id: 'anna', nome: 'Anna Rossi' }));
  await assertSucceeds(deleteDoc(doc(db('anna'), 'turni', GIORNO)));
});

test('profili e admin non modificabili', async () => {
  await assertFails(setDoc(doc(db('anna'), 'persone', CHIAVE_ANNA), { id: 'anna', nome: 'Anna Verdi', codice: CODICE }));
  await diventaAdmin('capo');
  await assertFails(setDoc(doc(db('capo'), 'admin', 'capo'), { chiave: 'CAMBIAMI' }));
});

test('dopo il reset il dispositivo d\'iscrizione non si riprende l\'identità iscrivendosi di nuovo', async () => {
  await diventaAdmin('capo');
  await setDoc(doc(db('capo'), 'persone', NUOVA_ANNA), { id: 'anna', nome: 'Anna Rossi' });
  await deleteDoc(doc(db('capo'), 'persone', CHIAVE_ANNA));
  await assertFails(setDoc(doc(db('anna'), 'persone', CHIAVE_ANNA), { id: 'anna', nome: 'Anna Rossi', codice: CODICE }));
  await assertFails(setDoc(doc(db('anna'), 'persone', 'chiave-anna-altra-0123456789'), { id: 'anna', nome: 'Anna Rossi', codice: CODICE }));
});

test('dopo il reset il vecchio dispositivo non legge più i turni', async () => {
  await segnaAnna();
  await diventaAdmin('capo');
  await setDoc(doc(db('capo'), 'persone', NUOVA_ANNA), { id: 'anna', nome: 'Anna Rossi' });
  await deleteDoc(doc(db('capo'), 'persone', CHIAVE_ANNA));
  await assertFails(getDocs(collection(db('anna'), 'turni')));
  await assertSucceeds(getDocs(collection(db('bruno'), 'turni')));
});

test('orari: li legge chiunque, li scrive solo l\'admin, solo valori sensati', async () => {
  const orari = (uid) => doc(db(uid), 'impostazioni', 'circolo');
  const buoni = { chiusura: 1, apre: '18:00', chiude: '00:00' };
  await assertFails(setDoc(orari('anna'), buoni));
  await diventaAdmin('capo');
  await assertSucceeds(setDoc(orari('capo'), buoni));
  await assertSucceeds(setDoc(orari('capo'), { chiusura: null, apre: '', chiude: '' }));
  await assertSucceeds(getDoc(doc(env.unauthenticatedContext().firestore(), 'impostazioni', 'circolo')));
  for (const male of [{ ...buoni, chiusura: 7 }, { ...buoni, apre: '25:00' }, { ...buoni, apre: '<b>' }, { ...buoni, extra: 1 }]) {
    await assertFails(setDoc(orari('capo'), male));
  }
  await assertFails(setDoc(doc(db('capo'), 'impostazioni', 'altro'), buoni));
});

test('promemoria: ognuno iscrive solo il proprio telefono, a nome suo', async () => {
  const sub = { id: 'anna', endpoint: 'https://push.example/abc', p256dh: 'chiave', auth: 'segreto' };
  await assertSucceeds(setDoc(doc(db('anna'), 'promemoria', 'anna'), sub));
  await assertSucceeds(getDoc(doc(db('anna'), 'promemoria', 'anna')));
  await assertFails(getDoc(doc(db('bruno'), 'promemoria', 'anna')));
  await assertFails(deleteDoc(doc(db('bruno'), 'promemoria', 'anna')));
  await assertFails(setDoc(doc(db('bruno'), 'promemoria', 'bruno'), sub)); // a nome di Anna
  await assertFails(setDoc(doc(db('bruno'), 'promemoria', 'anna'), { ...sub, id: 'bruno' }));
  await assertFails(setDoc(doc(db('carla'), 'promemoria', 'carla'), { ...sub, id: 'carla' })); // senza profilo
  await assertFails(setDoc(doc(db('anna'), 'promemoria', 'anna'), { ...sub, endpoint: 'http://push.example/abc' }));
  await assertFails(setDoc(doc(db('anna'), 'promemoria', 'anna'), { ...sub, extra: 1 }));
  await assertSucceeds(deleteDoc(doc(db('anna'), 'promemoria', 'anna')));
});

const NOMI = { anna: 'Anna Rossi', bruno: 'Bruno Bianchi' };
const traGiorni = (n) => { const d = new Date(); d.setDate(d.getDate() + n); return d.toISOString().slice(0, 10); };
const FUTURO = traGiorni(10);
const PASSATO = '2020-01-06';
const semina = (giorno, dati) => env.withSecurityRulesDisabled((ctx) => setDoc(doc(ctx.firestore(), 'turni', giorno), dati));
const scrivi = (uid, giorno, dati) => setDoc(doc(db(uid), 'turni', giorno), dati);

test('cerca sostituto: solo chi ha il turno, e cambia solo "cedo"', async () => {
  await semina(FUTURO, { id: 'anna', nome: NOMI.anna });
  await assertFails(scrivi('bruno', FUTURO, { id: 'anna', nome: NOMI.anna, cedo: true }));
  await assertFails(scrivi('anna', FUTURO, { id: 'anna', nome: 'Anna Rossi Due', cedo: true }));
  await assertFails(scrivi('anna', FUTURO, { id: 'anna', nome: NOMI.anna, cedo: false }));
  await assertFails(scrivi('anna', FUTURO, { id: 'anna', nome: NOMI.anna, cedo: true, altro: 1 }));
  await assertSucceeds(scrivi('anna', FUTURO, { id: 'anna', nome: NOMI.anna, cedo: true }));
  await assertSucceeds(scrivi('anna', FUTURO, { id: 'anna', nome: NOMI.anna })); // ci ripensa
});

test('prendere: solo un turno che cerca sostituto, solo per sé, e uno solo vince', async () => {
  await semina(FUTURO, { id: 'anna', nome: NOMI.anna });
  await assertFails(scrivi('bruno', FUTURO, { id: 'bruno', nome: NOMI.bruno })); // non cerca sostituto
  await semina(FUTURO, { id: 'anna', nome: NOMI.anna, cedo: true });
  await assertFails(scrivi('bruno', FUTURO, { id: 'anna', nome: NOMI.bruno }));
  await assertFails(scrivi('bruno', FUTURO, { id: 'bruno', nome: NOMI.anna }));
  await assertFails(scrivi('bruno', FUTURO, { id: 'bruno', nome: NOMI.bruno, cedo: true }));
  await assertFails(scrivi('carla', FUTURO, { id: 'carla', nome: 'Carla Verdi' })); // senza profilo
  await assertSucceeds(scrivi('bruno', FUTURO, { id: 'bruno', nome: NOMI.bruno }));
  // Il secondo arriva tardi: il turno non cerca più sostituto.
  await assertFails(scrivi('anna', FUTURO, { id: 'anna', nome: NOMI.anna }));
});

test('giorni passati: niente cerca sostituto né prendere', async () => {
  await semina(PASSATO, { id: 'anna', nome: NOMI.anna });
  await assertFails(scrivi('anna', PASSATO, { id: 'anna', nome: NOMI.anna, cedo: true }));
  await semina(PASSATO, { id: 'anna', nome: NOMI.anna, cedo: true });
  await assertFails(scrivi('bruno', PASSATO, { id: 'bruno', nome: NOMI.bruno }));
});

test('un turno che cerca sostituto si toglie come gli altri', async () => {
  await semina(FUTURO, { id: 'anna', nome: NOMI.anna, cedo: true });
  await assertFails(deleteDoc(doc(db('bruno'), 'turni', FUTURO)));
  await assertSucceeds(deleteDoc(doc(db('anna'), 'turni', FUTURO)));
});

test('accessi: solo il proprio, solo +1 con l\'ora del server, lo legge solo l\'admin', async () => {
  const accesso = (uid, socio, dati) => setDoc(doc(db(uid), 'accessi', socio), dati, { merge: true });
  const piuUno = { n: increment(1), ultimo: serverTimestamp() };
  await assertSucceeds(accesso('anna', 'anna', piuUno));
  await assertSucceeds(accesso('anna', 'anna', piuUno));
  await assertFails(accesso('anna', 'anna', { n: 10, ultimo: serverTimestamp() }));
  await assertFails(accesso('anna', 'anna', { n: increment(1), ultimo: new Date(2020, 0, 1) }));
  await assertFails(accesso('anna', 'bruno', piuUno));
  await assertFails(accesso('carla', 'carla', piuUno)); // senza profilo
  await assertFails(getDoc(doc(db('anna'), 'accessi', 'anna')));
  await diventaAdmin('capo');
  const tutti = await assertSucceeds(getDocs(collection(db('capo'), 'accessi')));
  if (tutti.docs[0].data().n !== 2) throw new Error(`n = ${tutti.docs[0].data().n}, atteso 2`);
});

test('storico: lo legge solo l\'admin, nessuno lo scrive dall\'app', async () => {
  await env.withSecurityRulesDisabled((ctx) =>
    setDoc(doc(ctx.firestore(), 'attivita', 'x'), { socio: 'anna', nome: NOMI.anna, azione: 'segna', giorno: FUTURO }));
  await assertFails(getDocs(query(collection(db('anna'), 'attivita'), where('socio', '==', 'anna'))));
  await assertFails(setDoc(doc(db('anna'), 'attivita', 'y'), { socio: 'anna' }));
  await diventaAdmin('capo');
  await assertSucceeds(getDocs(query(collection(db('capo'), 'attivita'), where('socio', '==', 'anna'))));
  await assertFails(setDoc(doc(db('capo'), 'attivita', 'y'), { socio: 'anna' }));
});
