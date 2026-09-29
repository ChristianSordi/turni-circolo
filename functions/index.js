// Promemoria dei turni: ogni mattina una notifica a chi ha il turno tra 7 giorni o domani,
// su ogni telefono dove ha attivato i promemoria. Chiavi VAPID in functions/.env (fuori da git).
process.env.TZ = 'Europe/Rome'; // il server gira in UTC: "domani" è quello italiano
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { iso, avvisi } from './calendario.js'; // copiato dalla radice prima del deploy (firebase.json)

initializeApp();

// Tutto al minimo, per restare nella quota gratuita: 1 istanza, nessuna sempre accesa, niente riprovi.
export const promemoria = onSchedule({
  schedule: 'every day 09:00', timeZone: 'Europe/Rome', region: 'europe-west1',
  memory: '256MiB', timeoutSeconds: 60, maxInstances: 1, minInstances: 0, retryCount: 0,
}, async () => {
  const db = getFirestore();
  webpush.setVapidDetails('https://christiansordi.github.io/turni-circolo/', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);
  const oggi = new Date();
  const futuri = await db.collection('turni').where(FieldPath.documentId(), '>=', iso(oggi)).get();
  const turni = Object.fromEntries(futuri.docs.map((d) => [d.id, d.data()]));
  const orari = (await db.doc('impostazioni/circolo').get()).data();

  let inviati = 0;
  for (const a of avvisi(oggi, turni, orari)) {
    for (const p of (await db.collection('promemoria').where('id', '==', a.id).get()).docs) {
      // Telefono ancora suo? Dopo un reset PIN o un socio eliminato, il vecchio telefono non riceve più nulla.
      const d = (await db.doc(`dispositivi/${p.id}`).get()).data();
      const persona = d && (await db.doc(`persone/${d.segreto}`).get()).data();
      if (persona?.id !== a.id) { await p.ref.delete(); continue; }
      const { endpoint, p256dh, auth } = p.data();
      try {
        await webpush.sendNotification({ endpoint, keys: { p256dh, auth } },
          JSON.stringify({ titolo: a.titolo, testo: a.testo }), { TTL: 12 * 3600 });
        inviati++;
      } catch (e) {
        if (e.statusCode === 404 || e.statusCode === 410) await p.ref.delete(); // promemoria disattivati dal telefono
        else console.error('Promemoria non inviato', p.id, e.statusCode, e.body);
      }
    }
  }
  console.log(`Promemoria inviati: ${inviati}`);
});
