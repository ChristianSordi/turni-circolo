// Scheda Chiavi, per tutti: se hai le chiavi, darle a un altro socio; se non le hai, chiederle a chi le ha (l'altro
// conferma); chi le ha adesso e, in fondo, i passaggi. L'admin in più aggiunge e toglie mazzi. Di solito un socio ha
// un mazzo: il numero si vede solo quando sono di più. Cosa può fare ognuno lo decide firestore.rules
// (passaggioChiavi); i passaggi li scrive functions/index.js. Stessi URL di Firebase di index.html.
import { doc, onSnapshot, runTransaction, collection, query, orderBy, limit }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { iso, fraseChiavi, titoloGiorno, mazzi } from './calendario.js?v=7'; // ?v=: vedi admin.js

const senza = (m, id) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id));
const piuMazzi = (n) => (n > 1 ? `${n} mazzi` : '');

export function avviaChiavi({ db, io, admin, soci, $, el, chiedi, avvisoBreve, mostraVista }) {
  const ref = doc(db, 'chiavi', 'circolo');
  let stato = { chi: {}, richieste: {} }; // chi: id → mazzi; richieste: id di chi la fa → { da, a }
  let passaggi = [];                      // storico-chiavi, dal più recente (per "l'ultimo te l'ha dato")
  const nome = (id) => soci()[id] ?? 'un socio';
  const quanti = (id) => mazzi(stato.chi?.[id]);
  const richieste = () => Object.entries(stato.richieste ?? {});

  // Legge e riscrive in una transazione: due telefoni che cambiano insieme non si cancellano a vicenda.
  async function cambia(fn, fatto) {
    try {
      await runTransaction(db, async (tx) => {
        const s = (await tx.get(ref)).data() ?? {};
        tx.set(ref, fn({ chi: s.chi ?? {}, richieste: s.richieste ?? {} }));
      });
      avvisoBreve(fatto);
    } catch (e) {
      await chiedi(e.code === 'permission-denied' ? 'Le chiavi sono appena cambiate: guarda di nuovo la scheda Chiavi.'
        : 'Controlla la connessione e riprova.', { titolo: 'Operazione non riuscita' });
    }
  }

  // Elenco a tendina dei soci indicati, in ordine alfabetico. Si ridisegna spesso: tiene la scelta fatta.
  function scelta(select, ids, prima, etichetta = nome) {
    select.replaceChildren(el('option', '', 'Scegli un socio…'), ...ids
      .sort((a, b) => nome(a).localeCompare(nome(b), 'it'))
      .map((id) => { const o = el('option', '', etichetta(id)); o.value = id; return o; }));
    select.firstChild.value = '';
    select.value = ids.includes(prima) ? prima : '';
  }

  // Richiesta di chi guarda: dà un mazzo (da = io) o lo chiede (a = io). L'altro conferma.
  async function richiedi(da, a) {
    const dai = da === io.id;
    if (!(dai ? a : da)) return chiedi(dai ? 'Scegli il socio a cui hai dato le chiavi.' : 'Scegli il socio a cui chiedi le chiavi.');
    const altro = nome(dai ? a : da);
    if (await chiedi(dai
      ? `Le chiavi restano a te finché ${altro} non conferma di averle ricevute. Se ha i promemoria attivi, riceve un avviso.`
      : `${altro} deve confermare di averti dato le chiavi. Se ha i promemoria attivi, riceve un avviso.`, {
      titolo: dai ? `Hai dato le chiavi a ${altro}?` : `Chiedi le chiavi a ${altro}?`,
      ok: dai ? 'Sì, gliele ho date' : 'Chiedi le chiavi', annulla: 'Annulla',
    })) await cambia((s) => ({ ...s, richieste: { ...s.richieste, [io.id]: { da, a } } }), `Fatto: ora ${altro} deve confermare`);
  }

  const togliRichiesta = (k, fatto) => cambia((s) => ({ ...s, richieste: senza(s.richieste, k), fatto: k }), fatto);

  // Conferma dell'altro: un mazzo passa da chi lo dà a chi lo riceve.
  const conferma = (k) => cambia((s) => {
    const { da, a } = s.richieste[k];
    const chi = { ...s.chi, [a]: mazzi(s.chi[a]) + 1 };
    if (mazzi(s.chi[da]) > 1) chi[da] = mazzi(s.chi[da]) - 1;
    else delete chi[da];
    return { chi, richieste: senza(s.richieste, k), fatto: k };
  }, 'Fatto: le chiavi sono passate di mano');

  async function rifiuta(k, { da, a }) {
    if (k === a) return togliRichiesta(k, 'Richiesta rifiutata');
    if (await chiedi(`Le chiavi restano a ${nome(da)}. Resterà scritto nei passaggi, che vedono tutti, che non le hai ricevute.`, {
      titolo: 'Non hai ricevuto le chiavi?', ok: 'Non le ho ricevute', annulla: 'Annulla',
    })) await togliRichiesta(k, `Fatto: le chiavi restano a ${nome(da)}`);
  }

  // Admin: un mazzo in più o in meno; chi resta senza non ha più richieste in cui le dà.
  function admin1(delta) {
    const x = $('chiavi-a-chi').value;
    if (!x) return chiedi('Scegli il socio.');
    if (delta < 0 && !quanti(x)) return chiedi(`${nome(x)} non ha le chiavi.`);
    cambia((s) => {
      const n = mazzi(s.chi[x]) + delta;
      if (n > 0) return { ...s, chi: { ...s.chi, [x]: n } };
      return { chi: senza(s.chi, x), richieste: Object.fromEntries(Object.entries(s.richieste).filter(([, r]) => r.da !== x)) };
    }, delta > 0 ? `Fatto: un mazzo in più a ${nome(x)}` : `Fatto: un mazzo in meno a ${nome(x)}`);
  }

  // In cima a tutte le schede: la prima richiesta a cui chi guarda deve rispondere.
  function disegnaArrivo() {
    const [k, r] = richieste().find(([k, { da, a }]) => k !== io.id && (da === io.id || a === io.id)) ?? [];
    $('chiavi-arrivo').hidden = !k;
    if (!k) return;
    const dice = k === r.da; // "le ho date a te" oppure "le chiedo a te"
    $('chiavi-arrivo-testo').replaceChildren(el('strong', '', nome(k)),
      dice ? ' dice di averti dato le chiavi del circolo. Le hai ricevute?' : ' ti chiede le chiavi del circolo. Gliele hai date?');
    $('chiavi-conferma').textContent = dice ? 'Sì, le ho ricevute' : 'Sì, gliele ho date';
    $('chiavi-rifiuta').textContent = dice ? 'No, non le ho ricevute' : 'No';
    $('chiavi-conferma').onclick = () => conferma(k);
    $('chiavi-rifiuta').onclick = () => rifiuta(k, r);
  }

  // In cima alla scheda: hai le chiavi o no, poi cosa puoi fare.
  function disegnaMie() {
    const n = quanti(io.id);
    const ultimo = passaggi.find((r) => r.azione === 'riceve' && r.socio === io.id)?.altro;
    $('stato-chiavi').classList.toggle('senza', !n);
    $('chiavi-io').textContent = !n ? 'Non hai nessun mazzo di chiavi' : n === 1 ? 'Hai un mazzo di chiavi' : `Hai ${n} mazzi di chiavi`;
    $('chiavi-io-nota').textContent = !n ? 'Se ti servono, chiedile a chi le ha.'
      : n > 1 && ultimo ? `L'ultimo te l'ha dato ${ultimo}.` : 'Sei tra chi ha le chiavi del circolo.';

    const box = $('chiavi-mie');
    const mia = stato.richieste?.[io.id];
    const bottone = (classe, testo, azione) => { const b = el('button', classe, testo); b.onclick = azione; return b; };
    if (mia) {
      const altro = nome(mia.da === io.id ? mia.a : mia.da);
      box.replaceChildren(el('p', '', mia.da === io.id
        ? `Aspetti che ${altro} confermi di aver ricevuto le chiavi. Fino ad allora risultano a te.`
        : `Hai chiesto le chiavi a ${altro}: aspetti che confermi di avertele date.`),
      bottone('secondario', mia.da === io.id ? 'Annulla: non gliele ho date' : 'Annulla la richiesta',
        () => togliRichiesta(io.id, 'Richiesta annullata')));
      return;
    }
    const dai = n > 0;
    const ids = dai ? Object.keys(soci()).filter((id) => id !== io.id) : Object.keys(stato.chi ?? {}).filter((id) => id !== io.id);
    if (!ids.length) return box.replaceChildren(el('p', '', 'Nessuno ha le chiavi, per ora: le segna l\'amministratore.'));
    const select = el('select');
    select.id = 'chiavi-altro';
    scelta(select, ids, $('chiavi-altro')?.value);
    const label = el('label', '', dai ? 'Dai le chiavi a' : 'Chiedi le chiavi a');
    label.append(select);
    box.replaceChildren(label, bottone('grande', dai ? 'Ho dato le chiavi' : 'Chiedi le chiavi',
      () => (dai ? richiedi(io.id, select.value) : richiedi(select.value, io.id))));
  }

  function disegna() {
    disegnaArrivo();
    disegnaMie();
    const ho = quanti(io.id) > 0;
    const altri = Object.keys(stato.chi ?? {}).filter((id) => id !== io.id).sort((a, b) => nome(a).localeCompare(nome(b), 'it'));
    $('chiavi-altri').textContent = ho ? 'Gli altri che hanno le chiavi' : 'Chi ha le chiavi adesso';
    $('elenco-chiavi-soci').replaceChildren(...altri.map((id) => {
      const li = el('li', '', nome(id));
      if (quanti(id) > 1) li.append(' ', el('small', '', `(${piuMazzi(quanti(id))})`));
      return li;
    }));
    $('chiavi-vuoto').hidden = altri.length > 0;
    if (admin) {
      const tutti = Object.keys(soci());
      scelta($('chiavi-a-chi'), tutti, $('chiavi-a-chi').value,
        (id) => (quanti(id) ? `${nome(id)} (${piuMazzi(quanti(id)) || 'ha le chiavi'})` : nome(id)));
    }
  }

  // Passaggi: si ascoltano dalla prima apertura della scheda (sono pochi, cambiano di rado).
  let storico = null;
  function ascoltaStorico() {
    if (storico) return;
    const s = $('chiavi-stato');
    s.textContent = 'Caricamento…';
    s.hidden = false;
    storico = onSnapshot(query(collection(db, 'storico-chiavi'), orderBy('quando', 'desc'), limit(100)), (snap) => {
      passaggi = snap.docs.map((d) => d.data());
      const oggi = iso(new Date());
      let prima = '';
      const voci = [];
      for (const r of passaggi) {
        const quando = r.quando.toDate();
        if (iso(quando) !== prima) {
          prima = iso(quando);
          voci.push(el('li', 'titolo', titoloGiorno(prima, oggi)));
        }
        const frase = fraseChiavi(r);
        const li = el('li');
        li.append(el('span', 'ora', quando.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })),
          frase[0].toUpperCase() + frase.slice(1)); // testo, mai HTML: i nomi li scrivono gli utenti
        voci.push(li);
      }
      s.textContent = 'Nessun passaggio, per ora.';
      s.hidden = voci.length > 0;
      $('elenco-chiavi').replaceChildren(...voci);
      disegnaMie();
    }, () => { s.textContent = 'Controlla la connessione e riprova.'; storico = null; });
  }

  $('scheda-chiavi').onclick = () => { mostraVista('chiavi'); ascoltaStorico(); };
  $('chiavi-admin').hidden = !admin;
  $('chiavi-piu').onclick = () => admin1(1);
  $('chiavi-meno').onclick = () => admin1(-1);
  onSnapshot(ref, (snap) => { stato = snap.data() ?? { chi: {}, richieste: {} }; disegna(); }, () => {});
  return { disegna };
}
