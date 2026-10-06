// Pannello dell'amministratore: le schede Soci (turni, accessi, storico, reset PIN, elimina), Attività (le azioni
// di tutti) e Orari del circolo.
// Lo carica index.html solo per l'admin. Stessi URL di Firebase di index.html: altrimenti db non è riconosciuto.
import { doc, getDocs, onSnapshot, setDoc, deleteDoc, collection, query, where, orderBy, limit, writeBatch }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { chiave, pinValido } from './profilo.js';
// ?v=: GitHub Pages lascia i file in cache 10 minuti; senza, un telefono può unire questo admin.js nuovo a un
// calendario.js vecchio. ponytail: v da aumentare a mano quando calendario.js cambia.
import { iso, fraseStorico, titoloGiorno } from './calendario.js?v=6';

export function avviaAdmin({ db, io, turni, $, el, chiedi, avvisoBreve, turniN, mostraVista }) {
  let soci = [];      // [{ id, nome, segreto }]
  let accessi = {};   // id socio → { n, ultimo }

  async function caricaSoci() {
    const persone = await getDocs(collection(db, 'persone'));
    soci = persone.docs.map((d) => ({ ...d.data(), segreto: d.id })).sort((a, b) => a.nome.localeCompare(b.nome, 'it'));
    disegnaSoci();
  }

  // ultimo è null finché il server non conferma la scrittura dell'admin stesso: vale "adesso".
  const giornoMese = (t) => (t ? t.toDate() : new Date()).toLocaleDateString('it-IT', { day: 'numeric', month: 'numeric' });
  function dati(s) {
    const quanti = Object.values(turni()).filter((t) => t.id === s.id).length;
    const a = accessi[s.id];
    const riga = el('span', 'dati');
    const voce = (n, testo) => { const v = el('span'); v.append(el('strong', '', n), ` ${testo}`); return v; };
    riga.append(voce(String(quanti), quanti === 1 ? 'turno' : 'turni'));
    if (a) riga.append(voce(String(a.n), a.n === 1 ? 'accesso' : 'accessi'), voce(giornoMese(a.ultimo), 'ultimo accesso'));
    return riga;
  }

  function disegnaSoci() {
    if (!soci.length) return;
    $('elenco-soci').replaceChildren(...soci.map((s) => {
      const comandi = el('span', 'comandi');
      const vedi = el('button', '', 'Storico');
      vedi.onclick = () => storico(s);
      const pin = el('button', '', 'Reimposta PIN');
      pin.onclick = () => reimpostaPin(s);
      comandi.append(vedi, pin);
      if (s.id !== io.id) { // l'admin non elimina se stesso
        const x = el('button', 'elimina', 'Elimina');
        x.onclick = () => eliminaSocio(s);
        comandi.append(x);
      }
      const li = el('li', s.id === io.id ? 'io' : '');
      li.append(el('span', 'chi', s.id === io.id ? `${s.nome} (tu)` : s.nome), dati(s), comandi);
      return li;
    }));
    $('soci-conta').textContent = `${soci.length} ${soci.length === 1 ? 'socio iscritto' : 'soci iscritti'}, in ordine alfabetico.`;
  }

  // Storico del socio, dalla riga più recente. Lo scrive functions/index.js a ogni modifica dei turni.
  const ora = (t) => t.toDate().toLocaleString('it-IT', { day: 'numeric', month: 'numeric', year: '2-digit', hour: '2-digit', minute: '2-digit' });
  async function storico(s) {
    let righe;
    try {
      righe = (await getDocs(query(collection(db, 'attivita'), where('socio', '==', s.id)))).docs.map((d) => d.data());
    } catch {
      return chiedi('Controlla la connessione e riprova.', { titolo: 'Storico non disponibile' });
    }
    // ponytail: tutto lo storico del socio, ordinato qui (decine di righe l'anno); orderBy + limit + indice se diventano migliaia.
    righe.sort((a, b) => b.quando.toMillis() - a.quando.toMillis());
    await chiedi(righe.map((r) => `${ora(r.quando)} — ${fraseStorico(r)}`).join('\n\n') || 'Nessuna attività registrata.',
      { titolo: `Storico di ${s.nome}` });
  }

  // Reset PIN: stesso id (i turni restano suoi), nuova chiave; la vecchia chiave smette di funzionare.
  async function reimpostaPin(s) {
    const pin = await chiedi('Scegli un nuovo PIN di 4 cifre e comunicalo al socio.', {
      titolo: s.nome, ok: 'Reimposta PIN', annulla: 'Annulla', input: true,
    });
    if (pin === undefined) return;
    if (!pinValido(pin)) return chiedi('Il PIN deve essere di 4 cifre.');
    const nuova = await chiave(s.nome, pin);
    if (nuova === s.segreto) return chiedi('È lo stesso PIN di prima.');
    try {
      await setDoc(doc(db, 'persone', nuova), { id: s.id, nome: s.nome });
      await deleteDoc(doc(db, 'persone', s.segreto));
      await chiedi(`Comunica a ${s.nome} il nuovo PIN.`, { titolo: 'PIN reimpostato' });
    } catch {
      await chiedi('Forse un omonimo ha già questo PIN: scegline un altro.', { titolo: 'PIN non reimpostato' });
    }
    if (s.segreto === io.segreto) return location.reload(); // PIN dell'admin stesso
    await caricaSoci();
  }

  // Elimina il profilo e, se l'admin vuole, tutti i suoi turni (anche passati): tutto o niente.
  async function eliminaSocio(s) {
    if (!await chiedi(`Elimini ${s.nome}? Non potrà più entrare. Non si torna indietro.`, {
      titolo: 'Eliminare il socio?', ok: 'Elimina', annulla: 'Annulla',
    })) return;
    const giorni = Object.entries(turni()).filter(([, t]) => t.id === s.id).map(([d]) => d);
    const n = giorni.length;
    // Chiudere la finestra = tenere i turni: la scelta che non perde dati.
    const via = n > 0 && await chiedi(n === 1
      ? 'Ha 1 turno segnato. Lo elimino o resta in calendario e in classifica?'
      : `Ha ${n} turni segnati. Li elimino o restano in calendario e in classifica?`, {
      titolo: 'E i suoi turni?', ok: n === 1 ? 'Elimina il turno' : 'Elimina i turni', annulla: n === 1 ? 'Tienilo' : 'Tienili',
    });
    const batch = writeBatch(db);
    batch.delete(doc(db, 'persone', s.segreto));
    if (via) giorni.forEach((d) => batch.delete(doc(db, 'turni', d)));
    try {
      await batch.commit();
      avvisoBreve(`${s.nome} eliminato`);
    } catch {
      await chiedi('Controlla la connessione e riprova.', { titolo: 'Socio non eliminato' });
    }
    await caricaSoci();
  }

  async function salvaOrari(e) {
    e.preventDefault();
    const [apre, chiude, c] = [$('apre').value, $('chiude').value, $('chiusura').value];
    if (!apre !== !chiude) return chiedi('Scrivi sia l\'apertura sia la chiusura, oppure lascia vuoti entrambi.');
    $('salva-orari').disabled = true;
    try {
      await setDoc(doc(db, 'impostazioni', 'circolo'), { apre, chiude, chiusura: c === '' ? null : Number(c) });
      avvisoBreve('Orari salvati');
    } catch {
      await chiedi('Controlla la connessione e riprova.', { titolo: 'Orari non salvati' });
    }
    $('salva-orari').disabled = false;
  }

  // Scheda Attività: le ultime 200 azioni di tutti i soci, per giorno, dalla più recente (indice automatico su quando).
  // "cede" non si mostra: è la stessa azione del "prende" dell'altro socio.
  async function caricaAttivita() {
    const stato = $('attivita-stato');
    stato.textContent = 'Caricamento…';
    stato.hidden = false;
    let righe;
    try {
      righe = (await getDocs(query(collection(db, 'attivita'), orderBy('quando', 'desc'), limit(200)))).docs
        .map((d) => d.data()).filter((r) => r.azione !== 'cede');
    } catch {
      stato.textContent = 'Controlla la connessione e riprova.';
      return;
    }
    stato.textContent = 'Nessuna attività registrata.';
    stato.hidden = righe.length > 0;
    const oggi = iso(new Date());
    let prima = '';
    const voci = [];
    for (const r of righe) {
      const quando = r.quando.toDate();
      if (iso(quando) !== prima) {
        prima = iso(quando);
        voci.push(el('li', 'titolo', titoloGiorno(prima, oggi)));
      }
      const li = el('li');
      li.append(el('span', 'ora', quando.toLocaleTimeString('it-IT', { hour: '2-digit', minute: '2-digit' })),
        el('strong', '', r.nome), `: ${fraseStorico(r)}`); // testo, mai HTML: i nomi li scrivono gli utenti
      voci.push(li);
    }
    $('elenco-attivita').replaceChildren(...voci);
  }

  $('schede-admin').hidden = false;
  $('scheda-soci').onclick = () => mostraVista('soci');
  $('scheda-attivita').onclick = () => { mostraVista('attivita'); caricaAttivita(); };
  $('scheda-orari').onclick = () => mostraVista('orari');
  $('form-orari').onsubmit = salvaOrari;
  caricaSoci();
  // Accessi dal vivo: l'app dell'admin resta aperta per ore (iPhone), letti una volta sola restano vecchi.
  onSnapshot(collection(db, 'accessi'), (snap) => {
    accessi = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    disegnaSoci();
  }, () => {}); // contatore non leggibile: l'elenco si vede lo stesso
  return { disegnaSoci };
}
