// Promemoria dei turni (ogni mattina) e storico dei turni con gli avvisi di "Cerco un sostituto" (a ogni modifica).
// Chiavi VAPID in functions/.env (fuori da git).
process.env.TZ = 'Europe/Rome'; // il server gira in UTC: "domani" è quello italiano
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { iso, avvisi, movimenti } from './calendario.js'; // copiato dalla radice prima del deploy (firebase.json)

initializeApp();

// Tutto al minimo, per restare nella quota gratuita: 1 istanza, nessuna sempre accesa, niente riprovi.
const MINIMO = { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 1, minInstances: 0 };
const vapid = () => webpush.setVapidDetails('https://christiansordi.github.io/turni-circolo/', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

// Notifica ai telefoni con i promemoria attivi: di un socio (a) o di tutti tranne uno (tranne).
// Telefono non più suo (reset PIN, socio eliminato) o promemoria disattivati: l'iscrizione si cancella.
async function invia(db, { a, tranne, titolo, testo }) {
  const iscritti = a ? db.collection('promemoria').where('id', '==', a) : db.collection('promemoria');
  let inviati = 0;
  for (const p of (await iscritti.get()).docs) {
    const { id, endpoint, p256dh, auth } = p.data();
    if (id === tranne) continue;
    const d = (await db.doc(`dispositivi/${p.id}`).get()).data();
    const persona = d && (await db.doc(`persone/${d.segreto}`).get()).data();
    if (persona?.id !== id) { await p.ref.delete(); continue; }
    try {
      await webpush.sendNotification({ endpoint, keys: { p256dh, auth } }, JSON.stringify({ titolo, testo }), { TTL: 12 * 3600 });
      inviati++;
    } catch (e) {
      if (e.statusCode === 404 || e.statusCode === 410) await p.ref.delete();
      else console.error('Notifica non inviata', p.id, e.statusCode, e.body);
    }
  }
  return inviati;
}

export const promemoria = onSchedule({ ...MINIMO, schedule: 'every day 09:00', timeZone: 'Europe/Rome', retryCount: 0 }, async () => {
  const db = getFirestore();
  vapid();
  const oggi = new Date();
  const futuri = await db.collection('turni').where(FieldPath.documentId(), '>=', iso(oggi)).get();
  const turni = Object.fromEntries(futuri.docs.map((d) => [d.id, d.data()]));
  const orari = (await db.doc('impostazioni/circolo').get()).data();
  let inviati = 0;
  for (const x of avvisi(oggi, turni, orari)) inviati += await invia(db, { a: x.id, titolo: x.titolo, testo: x.testo });
  console.log(`Promemoria inviati: ${inviati}`);
});

// Storico: una riga per ogni turno segnato, tolto, in cerca di sostituto o passato a un altro.
// L'id è quello dell'evento: se Google lo consegna due volte, la riga si sovrascrive.
export const attivita = onDocumentWrittenWithAuthContext({ ...MINIMO, document: 'turni/{giorno}' }, async (event) => {
  const db = getFirestore();
  const prima = event.data.before.data() ?? null;
  const dopo = event.data.after.data() ?? null;
  // Chi è stato: il socio del telefono (authId = uid anonimo). Nessun telefono = console → null.
  const telefono = event.authId ? (await db.doc(`dispositivi/${event.authId}`).get()).data() : null;
  const orari = (await db.doc('impostazioni/circolo').get()).data();
  const { righe, notifiche } = movimenti(event.params.giorno, prima, dopo, telefono?.id ?? null, orari);
  const quando = new Date(event.time);
  const batch = db.batch();
  righe.forEach((r, i) => batch.set(db.doc(`attivita/${event.id}-${i}`), { ...r, quando }));
  await batch.commit();
  if (notifiche.length) vapid();
  for (const x of notifiche) await invia(db, x);
});
