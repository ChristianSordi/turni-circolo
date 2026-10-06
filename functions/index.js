// Ingresso e iscrizione dei soci, promemoria dei turni (ogni mattina), storico dei turni con gli avvisi di
// "Cerco un sostituto" (a ogni modifica). Chiavi VAPID e codice del circolo in functions/.env (fuori da git).
process.env.TZ = 'Europe/Rome'; // il server gira in UTC: "domani" è quello italiano
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { iso, avvisi, movimenti, movimentiChiavi } from './calendario.js'; // copiati dalla radice prima del deploy (firebase.json)
import { maiuscole, nomeValido, pinValido, chiave, idTentativi, attesa } from './profilo.js';

initializeApp();

// Tutto al minimo, per restare nella quota gratuita: 1 istanza, nessuna sempre accesa, niente riprovi.
const MINIMO = { region: 'europe-west1', memory: '256MiB', timeoutSeconds: 60, maxInstances: 1, minInstances: 0 };
const vapid = () => webpush.setVapidDetails('https://christiansordi.github.io/turni-circolo/', process.env.VAPID_PUBLIC, process.env.VAPID_PRIVATE);

// Notifica ai telefoni con i promemoria attivi: di un socio (a) o di tutti tranne uno (tranne).
// Telefono non più suo (reset PIN, socio eliminato) o promemoria disattivati: l'iscrizione si cancella.
async function invia(db, { a, tranne, titolo, testo }) {
  // Senza un socio (a) o un escluso (tranne) validi non si avvisa nessuno: mai a tutti per un id mancante.
  const valido = (x) => typeof x === 'string' && x !== '';
  if (!valido(a) && !valido(tranne)) return 0;
  const iscritti = valido(a) ? db.collection('promemoria').where('id', '==', a) : db.collection('promemoria');
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

// Ingresso: nome + PIN giusti collegano questo telefono (uid anonimo) al socio. Il telefono non legge persone da
// solo: gli errori si contano per nome in tentativi/ e dopo 5 si aspetta (profilo.js, attesa). Si contano solo sui
// nomi dei soci (elenco/soci): un nome nuovo non rivela nulla, e chi si iscrive non parte già con degli errori.
// Con codice: iscrizione, solo a iscrizioni aperte dall'admin. Risponde { io } se entra, { iscrizioni: aperte? } se
// non lo trova; errori: resource-exhausted { minuti }, permission-denied { motivo: 'chiuse' | 'link' }.
export const entra = onCall({ ...MINIMO, maxInstances: 3 }, async (req) => {
  const uid = req.auth?.uid;
  const { nome, pin, codice } = req.data ?? {};
  if (!uid || typeof nome !== 'string' || typeof pin !== 'string' || !nomeValido(nome) || !pinValido(pin)) {
    throw new HttpsError('invalid-argument', 'Dati non validi.');
  }
  const db = getFirestore();
  const segreto = await chiave(nome, pin);
  const conto = db.doc(`tentativi/${idTentativi(nome)}`);
  const telefono = db.doc(`dispositivi/${uid}`);
  const esito = await db.runTransaction(async (tx) => {
    const [t, p, isc, d, el] = await tx.getAll(conto, db.doc(`persone/${segreto}`), db.doc('impostazioni/iscrizioni'),
      telefono, db.doc('elenco/soci'));
    const { errori = 0, ultimo } = t.data() ?? {};
    const minuti = Math.ceil(attesa(errori, ultimo?.toMillis() ?? 0, Date.now()) / 60e3);
    if (minuti > 0) return { minuti }; // anche col PIN giusto: altrimenti il blocco direbbe qual è
    if (p.exists) {
      const io = { id: p.data().id, nome: p.data().nome, segreto };
      tx.delete(conto);
      tx.set(telefono, { id: io.id, segreto });
      return { io };
    }
    const socio = Object.values(el.data()?.soci ?? {}).some((n) => idTentativi(n) === idTentativi(nome));
    if (socio) tx.set(conto, { errori: errori + 1, ultimo: new Date() });
    const aperte = isc.data()?.fino?.toMillis() > Date.now();
    if (codice === undefined) return { iscrizioni: aperte };
    // Un telefono già collegato non si reiscrive: dopo un reset PIN non riprende l'identità (id = suo uid).
    if (codice !== process.env.CODICE_CIRCOLO || !aperte || d.exists) return { negata: aperte ? 'link' : 'chiuse' };
    const io = { id: uid, nome: maiuscole(nome), segreto };
    tx.create(db.doc(`persone/${segreto}`), { id: io.id, nome: io.nome });
    tx.set(telefono, { id: io.id, segreto });
    return { io };
  });
  if (esito.minuti) throw new HttpsError('resource-exhausted', 'troppi tentativi', { minuti: esito.minuti });
  if (esito.negata) throw new HttpsError('permission-denied', 'iscrizione negata', { motivo: esito.negata });
  return esito;
});

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
// maxInstances 3: raffiche come "Elimina + i suoi turni" scatenano molti eventi insieme; scala a zero, resta gratis.
export const attivita = onDocumentWrittenWithAuthContext({ ...MINIMO, maxInstances: 3, document: 'turni/{giorno}' }, async (event) => {
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

// Passaggi delle chiavi, per tutti: mazzi passati di mano, consegne rifiutate, mazzi aggiunti o tolti dall'admin.
// A chi deve rispondere a una richiesta arriva un avviso. 1 istanza = in ordine.
export const chiavi = onDocumentWrittenWithAuthContext({ ...MINIMO, document: 'chiavi/circolo' }, async (event) => {
  const db = getFirestore();
  const vuoto = { chi: {}, richieste: {} };
  const telefono = event.authId ? (await db.doc(`dispositivi/${event.authId}`).get()).data() : null;
  const nomi = (await db.doc('elenco/soci').get()).data()?.soci;
  const { righe, notifiche } = movimentiChiavi(event.data.before.data() ?? vuoto, event.data.after.data() ?? vuoto,
    telefono?.id ?? null, nomi);
  const quando = new Date(event.time);
  const batch = db.batch();
  righe.forEach((r, i) => batch.set(db.doc(`storico-chiavi/${event.id}-${i}`), { ...r, quando }));
  await batch.commit();
  if (notifiche.length) vapid();
  for (const x of notifiche) await invia(db, x);
});

// Elenco dei soci (id → nome) che vedono tutti sotto il calendario: le chiavi di persone restano segrete.
// Si rifà da capo a ogni iscrizione, reset PIN, eliminazione o nome corretto in console. 1 istanza = in ordine.
export const elenco = onDocumentWritten({ ...MINIMO, document: 'persone/{chiave}' }, async () => {
  const db = getFirestore();
  const persone = (await db.collection('persone').get()).docs.map((d) => d.data());
  await db.doc('elenco/soci').set({ soci: Object.fromEntries(persone.map((p) => [p.id, p.nome])) });
});
