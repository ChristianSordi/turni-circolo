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
