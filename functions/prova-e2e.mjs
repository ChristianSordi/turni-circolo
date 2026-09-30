// Prova delle funzioni contro l'emulatore Firestore: npm run e2e (dalla radice).
// Chiama i gestori con .run e sostituisce l'invio push, così non serve un servizio di notifiche vero.
import assert from 'node:assert/strict';
import webpush from 'web-push';

process.env.TZ = 'Europe/Rome';
process.env.GCLOUD_PROJECT = 'demo-turni';
const chiavi = webpush.generateVAPIDKeys();
Object.assign(process.env, { VAPID_PUBLIC: chiavi.publicKey, VAPID_PRIVATE: chiavi.privateKey });
const inviate = [];
webpush.sendNotification = async (sub, payload) => { inviate.push({ endpoint: sub.endpoint, ...JSON.parse(payload) }); };

const { promemoria, attivita } = await import('./index.js');
const { getFirestore } = await import('firebase-admin/firestore');
const { iso } = await import('./calendario.js');
const db = getFirestore();

const ANNA = { id: 'anna', nome: 'Anna Rossi' };
const BRUNO = { id: 'bruno', nome: 'Bruno Bianchi' };
for (const [uid, p] of [['anna', ANNA], ['bruno', BRUNO], ['capo', { id: 'capo', nome: 'Capo Circolo' }]]) {
  await db.doc(`persone/chiave-${uid}`).set({ ...p });
  await db.doc(`dispositivi/${uid}`).set({ id: p.id, segreto: `chiave-${uid}` });
  await db.doc(`promemoria/${uid}`).set({ id: p.id, endpoint: `https://push.prova/${uid}`, p256dh: 'x', auth: 'y' });
}

const G = '2026-10-10';
let n = 0;
const evento = (prima, dopo, authId) => ({
  // Un secondo di distanza fra un evento e l'altro: l'ordine dello storico non dipende dalla velocità della prova.
  id: `ev${++n}`, time: new Date(Date.UTC(2026, 8, 30, 12, 0, n)).toISOString(), params: { giorno: G }, authId, authType: 'unknown',
  data: { before: { data: () => prima ?? undefined }, after: { data: () => dopo ?? undefined } },
});
const storico = async () => (await db.collection('attivita').get()).docs.map((d) => d.data())
  .sort((a, b) => a.quando.toMillis() - b.quando.toMillis()); // stesso istante (prende/cede): resta l'ordine degli id

// Segna, cerca sostituto (avvisa tutti tranne Anna), Bruno prende (avvisa Anna), l'admin toglie.
await attivita.run(evento(null, ANNA, 'anna'));
await attivita.run(evento(ANNA, { ...ANNA, cedo: true }, 'anna'));
assert.deepEqual(inviate.map((i) => i.endpoint).sort(), ['https://push.prova/bruno', 'https://push.prova/capo']);
assert.equal(inviate[0].titolo, 'Cercasi sostituto');
inviate.length = 0;
await attivita.run(evento({ ...ANNA, cedo: true }, BRUNO, 'bruno'));
assert.deepEqual(inviate, [{ endpoint: 'https://push.prova/anna', titolo: 'Turno passato',
  testo: 'Bruno Bianchi ha preso il tuo turno di sabato 10 ottobre.' }]);
await attivita.run(evento(BRUNO, null, 'capo'));
await attivita.run(evento(null, ANNA, undefined)); // console Firebase
assert.deepEqual((await storico()).map((r) => `${r.socio}:${r.azione}`),
  ['anna:segna', 'anna:cerca', 'bruno:prende', 'anna:cede', 'bruno:tolto-admin', 'anna:segna']);

// Lo stesso evento consegnato due volte non duplica le righe.
const doppio = evento(null, BRUNO, 'bruno');
await attivita.run(doppio);
await attivita.run(doppio);
assert.equal((await storico()).length, 7);

// Promemoria come prima: turno domani → avviso solo ad Anna; telefono non più suo → iscrizione cancellata.
inviate.length = 0;
const domani = new Date(); domani.setDate(domani.getDate() + 1);
await db.doc(`turni/${iso(domani)}`).set(ANNA);
await db.doc('promemoria/vecchio').set({ id: 'anna', endpoint: 'https://push.prova/vecchio', p256dh: 'x', auth: 'y' });
await promemoria.run({});
assert.deepEqual(inviate.map((i) => i.endpoint), ['https://push.prova/anna']);
assert.equal(inviate[0].titolo, 'Domani hai il turno al circolo');
assert.equal((await db.doc('promemoria/vecchio').get()).exists, false);

// Turno di domani senza id (modificato a mano dalla console): non arriva nessun avviso, a nessuno.
inviate.length = 0;
await db.doc(`turni/${iso(domani)}`).set({ nome: 'Senza id' });
await promemoria.run({});
assert.deepEqual(inviate, []);

console.log('e2e funzioni: tutto ok');
