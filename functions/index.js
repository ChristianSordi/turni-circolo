// Ingresso e iscrizione dei soci, promemoria dei turni (ogni mattina), storico dei turni con gli avvisi di
// "Cerco un sostituto" (a ogni modifica). Chiavi VAPID e codice del circolo in functions/.env (fuori da git).
process.env.TZ = 'Europe/Rome'; // il server gira in UTC: "domani" è quello italiano
import { onSchedule } from 'firebase-functions/v2/scheduler';
import { onDocumentWritten, onDocumentWrittenWithAuthContext } from 'firebase-functions/v2/firestore';
import { onCall, HttpsError } from 'firebase-functions/v2/https';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore, FieldPath, FieldValue } from 'firebase-admin/firestore';
import webpush from 'web-push';
import { iso, avvisi, movimenti, movimentiChiavi, giornoLeggibile, serataAperta, datiIncasso, permessoIncasso, euro } from './calendario.js'; // copiati dalla radice prima del deploy (firebase.json)
import { maiuscole, nomeValido, pinValido, chiave, idTentativi, attesa, ERRORI_MAX } from './profilo.js';

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
// non lo trova; errori: resource-exhausted { minuti } o { fermo } (20 errori: l'admin riceve un avviso),
// permission-denied { motivo: 'chiuse' | 'link' }.
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
    if (minuti === Infinity) return { fermo: true }; // anche col PIN giusto: altrimenti il blocco direbbe qual è
    if (minuti > 0) return { minuti };
    if (p.exists) {
      const io = { id: p.data().id, nome: p.data().nome, segreto };
      tx.delete(conto);
      tx.set(telefono, { id: io.id, segreto });
      return { io };
    }
    const socio = Object.values(el.data()?.soci ?? {}).find((n) => idTentativi(n) === idTentativi(nome));
    if (socio) tx.set(conto, { errori: errori + 1, ultimo: new Date() });
    const avvisa = socio && errori + 1 === ERRORI_MAX ? socio : null; // appena fermato: una volta sola
    const aperte = isc.data()?.fino?.toMillis() > Date.now();
    if (codice === undefined) return { iscrizioni: aperte, avvisa };
    // Un telefono già collegato non si reiscrive: dopo un reset PIN non riprende l'identità (id = suo uid).
    if (codice !== process.env.CODICE_CIRCOLO || !aperte || d.exists) return { negata: aperte ? 'link' : 'chiuse', avvisa };
    const io = { id: uid, nome: maiuscole(nome), segreto };
    tx.create(db.doc(`persone/${segreto}`), { id: io.id, nome: io.nome });
    tx.set(telefono, { id: io.id, segreto });
    return { io, avvisa };
  });
  const { avvisa, ...risposta } = esito;
  if (avvisa) await avvisaAdmin(db, avvisa).catch((e) => console.error('Avviso agli admin non inviato', e));
  if (esito.fermo) throw new HttpsError('resource-exhausted', 'nome fermo', { fermo: true });
  if (esito.minuti) throw new HttpsError('resource-exhausted', 'troppi tentativi', { minuti: esito.minuti });
  if (esito.negata) throw new HttpsError('permission-denied', 'iscrizione negata', { motivo: esito.negata });
  return risposta;
});

// Id dei soci admin (admin/{id}: uid del telefono o id del socio), per gli avvisi.
async function idAdmin(db) {
  const ids = new Set();
  for (const a of (await db.collection('admin').get()).docs) {
    ids.add((await db.doc(`dispositivi/${a.id}`).get()).data()?.id ?? a.id);
  }
  return ids;
}

// Avviso agli admin quando un nome si ferma per troppi PIN sbagliati.
async function avvisaAdmin(db, nome) {
  vapid();
  for (const a of await idAdmin(db)) {
    await invia(db, { a, titolo: 'Troppi PIN sbagliati', testo: `Con il nome ${nome} sono stati provati ${ERRORI_MAX} PIN sbagliati: il nome è bloccato. Se non è stato il socio, qualcuno ci sta provando. Per sbloccarlo: Soci → Reimposta PIN.` });
  }
}

// Registro degli incassi: l'unica porta per scriverlo (firestore.rules vieta il telefono). Inserisci, correggi
// l'incasso o aggiorna il fondo: controlla chi può cosa (calendario.js, permessoIncasso) e, nella stessa transazione,
// salva i numeri e una riga di storia che non si tocca più. Serata senza turno: chi inserisce diventa il turnista.
// Rifiuti: failed-precondition con details.motivo (vedi permessoIncasso, più spenti, non-socio, uguale, dati).
export const incasso = onCall({ ...MINIMO, maxInstances: 3 }, async (req) => {
  const db = getFirestore();
  const no = (motivo) => { throw new HttpsError('failed-precondition', motivo, { motivo }); };
  const azione = req.data?.azione;
  const dati = datiIncasso(azione, req.data ?? {});
  if (!req.auth?.uid || !dati) no('dati');
  const { giorno, valori, motivo } = dati;
  const ref = db.doc(`incassi/${giorno}`);
  const esito = await db.runTransaction(async (tx) => {
    const tel = (await tx.get(db.doc(`dispositivi/${req.auth.uid}`))).data();
    const p = tel && (await tx.get(db.doc(`persone/${tel.segreto}`))).data();
    if (!p) return { no: 'non-socio' };
    const io = { id: p.id, nome: p.nome };
    const [imp, circolo, attuale, turno, adminTel, adminSocio] = await tx.getAll(db.doc('impostazioni/incassi'),
      db.doc('impostazioni/circolo'), ref, db.doc(`turni/${giorno}`), db.doc(`admin/${req.auth.uid}`), db.doc(`admin/${io.id}`));
    if (!imp.data()?.attivi) return { no: 'spenti' };
    // l'emulatore non fa orderBy desc sull'id: basta sapere se esiste un incasso più recente di questo giorno
    const ultimo = (await tx.get(db.collection('incassi').where(FieldPath.documentId(), '>', giorno).limit(1))).docs[0]?.id ?? giorno;
    const prima = attuale.data() ?? null;
    const negato = permessoIncasso({ azione, giorno, io: io.id, admin: adminTel.exists || adminSocio.exists, incasso: prima,
      ultimo, serata: serataAperta(new Date(), circolo.data()?.apre) });
    if (negato) return { no: negato };
    const quando = FieldValue.serverTimestamp();
    const storia = ref.collection('storia').doc();
    if (!prima) {
      const t = turno.data();
      const turnista = t ? { id: t.id, nome: t.nome } : io;
      if (!t) tx.create(db.doc(`turni/${giorno}`), io); // la funzione attivita lo scrive nello storico dei turni
      tx.create(ref, { ...valori, turnista, inseritoDa: io, inserito: quando });
      tx.create(storia, { chi: io, quando, cosa: 'inserito', prima: null, dopo: valori });
      return turnista.id === io.id ? {} : { avvisa: { a: turnista.id, titolo: 'Incasso inserito',
        testo: `${io.nome} ha inserito l'incasso del tuo turno di ${giornoLeggibile(giorno)}: ${euro(valori.incasso)}.` } };
    }
    const vecchi = { incasso: prima.incasso, banconote: prima.banconote, monete: prima.monete, cinquanta: prima.cinquanta };
    if (Object.keys(valori).every((k) => valori[k] === vecchi[k])) return { no: 'uguale' };
    tx.update(ref, { ...valori, modificato: true });
    tx.create(storia, { chi: io, quando, cosa: azione, prima: vecchi, dopo: { ...vecchi, ...valori }, motivo });
    return {};
  });
  if (esito.no) no(esito.no);
  if (esito.avvisa) {
    vapid();
    await invia(db, esito.avvisa).catch((e) => console.error('Avviso al turnista non inviato', e));
  }
  return { ok: true };
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

// Alle 11: se il registro e l'avviso sono accesi e ieri sera c'era un turno senza incasso, avvisa il turnista e gli
// admin. Le serate prima dell'accensione (dal) non contano.
export const incassiMancanti = onSchedule({ ...MINIMO, schedule: 'every day 11:00', timeZone: 'Europe/Rome', retryCount: 0 }, async () => {
  const db = getFirestore();
  const imp = (await db.doc('impostazioni/incassi').get()).data();
  const oggi = new Date();
  const ieri = iso(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() - 1));
  if (!imp?.attivi || !imp.avvisoMancante || ieri < imp.dal) return;
  const [t, i, c] = await db.getAll(db.doc(`turni/${ieri}`), db.doc(`incassi/${ieri}`), db.doc('impostazioni/circolo'));
  if (!t.exists || i.exists) return;
  vapid();
  const testo = `Manca l'incasso di ${giornoLeggibile(ieri)} (turno di ${t.data().nome}): inseriscilo entro le ${c.data()?.apre || '21:00'}.`;
  let inviati = 0;
  for (const a of new Set([t.data().id, ...await idAdmin(db)])) inviati += await invia(db, { a, titolo: 'Incasso mancante', testo });
  console.log(`Avvisi di incasso mancante: ${inviati}`);
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
