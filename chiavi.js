// Scheda Chiavi, per tutti: chi ha le chiavi del circolo, la consegna a un altro socio (che conferma) e i passaggi.
// Solo l'admin dice chi ha le chiavi e gliele toglie. Cosa può fare ognuno lo decide firestore.rules (passaggioChiavi); i passaggi li
// scrive functions/index.js. Stessi URL di Firebase di index.html: altrimenti db non è riconosciuto.
import { doc, onSnapshot, runTransaction, collection, query, orderBy, limit }
  from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { iso, fraseChiavi, titoloGiorno } from './calendario.js?v=4'; // ?v=: vedi admin.js

const senza = (m, id) => Object.fromEntries(Object.entries(m).filter(([k]) => k !== id));

export function avviaChiavi({ db, io, admin, soci, $, el, chiedi, avvisoBreve, mostraVista }) {
  const ref = doc(db, 'chiavi', 'circolo');
  let stato = { chi: {}, consegne: {} }; // chi: id → nome; consegne: id di chi deve confermare → id di chi le ha date
  const nome = (id) => stato.chi[id] ?? soci()[id] ?? 'un socio';
  const consegnaDi = (id) => Object.keys(stato.consegne).find((b) => stato.consegne[b] === id); // a chi le sta dando

  // Legge e riscrive in una transazione: due telefoni che cambiano insieme non si cancellano a vicenda.
  async function cambia(fn, fatto) {
    try {
      await runTransaction(db, async (tx) => {
        tx.set(ref, fn((await tx.get(ref)).data() ?? { chi: {}, consegne: {} }));
      });
      avvisoBreve(fatto);
    } catch (e) {
      await chiedi(e.code === 'permission-denied' ? 'Le chiavi sono appena cambiate: guarda di nuovo chi le ha.'
        : 'Controlla la connessione e riprova.', { titolo: 'Operazione non riuscita' });
    }
  }

  // Elenco a tendina dei soci, in ordine alfabetico, tranne gli esclusi. Si ridisegna spesso: tiene la scelta fatta.
  function scelta(select, esclusi, prima = select.value) {
    select.replaceChildren(el('option', '', 'Scegli un socio…'), ...Object.entries(soci())
      .filter(([id]) => !esclusi.includes(id)).sort(([, a], [, b]) => a.localeCompare(b, 'it'))
      .map(([id, n]) => { const o = el('option', '', n); o.value = id; return o; }));
    select.firstChild.value = '';
    select.value = prima;
    if (select.value !== prima) select.value = '';
  }

  async function consegna() {
    const b = $('chiavi-ricevente').value;
    if (!b) return chiedi('Scegli il socio a cui hai dato le chiavi.');
    if (await chiedi(`Le chiavi restano a te finché ${nome(b)} non conferma di averle ricevute. Se ha i promemoria attivi, riceve un avviso.`, {
      titolo: `Hai dato le chiavi a ${nome(b)}?`, ok: 'Sì, gliele ho date', annulla: 'Annulla',
    })) await cambia((s) => ({ ...s, consegne: { ...s.consegne, [b]: io.id } }), `Fatto: ora ${nome(b)} deve confermare`);
  }

  const annulla = () => cambia((s) => ({ ...s, consegne: Object.fromEntries(Object.entries(s.consegne).filter(([, a]) => a !== io.id)) }),
    'Consegna annullata: le chiavi risultano a te');

  const conferma = () => cambia((s) => ({ chi: { ...senza(s.chi, s.consegne[io.id]), [io.id]: io.nome }, consegne: senza(s.consegne, io.id) }),
    'Fatto: ora le chiavi risultano a te');

  async function rifiuta() {
    const da = nome(stato.consegne[io.id]);
    if (await chiedi(`Le chiavi restano a ${da}. Resterà scritto nei passaggi, che vedono tutti, che non le hai ricevute.`, {
      titolo: 'Non hai ricevuto le chiavi?', ok: 'Non le ho ricevute', annulla: 'Annulla',
    })) await cambia((s) => ({ ...s, consegne: senza(s.consegne, io.id) }), `Fatto: le chiavi restano a ${da}`);
  }

  // Admin: chi riceve le chiavi non aspetta più consegne; chi le perde non ne sta più facendo.
  async function dai() {
    const x = $('chiavi-a-chi').value;
    if (!x) return chiedi('Scegli il socio che ha le chiavi.');
    await cambia((s) => ({ chi: { ...s.chi, [x]: soci()[x] }, consegne: senza(s.consegne, x) }), `Fatto: ${nome(x)} ha le chiavi`);
  }
  async function togli(x) {
    if (await chiedi(`${nome(x)} non avrà più le chiavi. Resterà scritto nei passaggi, che vedono tutti.`, {
      titolo: 'Togliere le chiavi?', ok: 'Togli le chiavi', annulla: 'Annulla',
    })) await cambia((s) => ({ chi: senza(s.chi, x), consegne: Object.fromEntries(Object.entries(s.consegne).filter(([, a]) => a !== x)) }),
      `Fatto: ${nome(x)} non ha più le chiavi`);
  }

  // Il riquadro sotto i cartellini cambia con quello che può fare chi guarda.
  function disegnaMie() {
    const box = $('chiavi-mie');
    const verso = consegnaDi(io.id);
    const bottone = (classe, testo, azione) => { const b = el('button', classe, testo); b.onclick = azione; return b; };
    box.hidden = Boolean(stato.consegne[io.id]); // c'è già l'avviso in cima
    if (stato.chi[io.id] && verso) {
      box.replaceChildren(el('p', '', `Aspetti che ${nome(verso)} confermi di aver ricevuto le chiavi. Fino ad allora risultano a te.`),
        bottone('secondario', 'Annulla: non gliele ho date', annulla));
    } else if (stato.chi[io.id]) {
      const select = el('select');
      select.id = 'chiavi-ricevente';
      scelta(select, [...Object.keys(stato.chi), ...Object.keys(stato.consegne)], $('chiavi-ricevente')?.value);
      const label = el('label', '', 'A chi le hai date?');
      label.append(select);
      box.replaceChildren(el('p', '', "Hai le chiavi. Quando le dai a un altro socio, segnalo qui: passano all'altro socio appena conferma."),
        label, bottone('grande', 'Ho dato le chiavi', consegna));
    } else {
      box.hidden ||= admin; // l'admin si segna da solo, dal riquadro sotto
      box.replaceChildren(el('p', '', 'Hai le chiavi e non sei nell\'elenco? Dillo all\'amministratore. Se un socio ti dà le chiavi, qui in cima ti chiederemo di confermare.'));
    }
  }

  function disegna() {
    const chi = Object.entries(stato.chi).sort(([, a], [, b]) => a.localeCompare(b, 'it'));
    $('portachiavi').replaceChildren(...chi.map(([id, n]) => {
      const li = el('li', 'cartellino');
      const testo = el('span');
      testo.append(el('span', 'chi', id === io.id ? `${n} (tu)` : n));
      const verso = consegnaDi(id);
      if (verso) testo.append(el('small', '', `le sta dando a ${nome(verso)}`));
      li.append(testo);
      if (admin) {
        const x = el('button', '', 'Togli');
        x.setAttribute('aria-label', `Togli le chiavi a ${n}`);
        x.onclick = () => togli(id);
        li.append(x);
      }
      return li;
    }));
    $('chiavi-vuoto').hidden = chi.length > 0;
    const da = stato.consegne[io.id];
    $('chiavi-arrivo').hidden = !da;
    if (da) $('chiavi-arrivo-testo').replaceChildren(el('strong', '', nome(da)), ' dice di averti dato le chiavi del circolo. Le hai?');
    disegnaMie();
    if (admin) scelta($('chiavi-a-chi'), Object.keys(stato.chi));
  }

  // Passaggi: si ascoltano dalla prima apertura della scheda (sono pochi, cambiano di rado).
  let storico = null;
  function ascoltaStorico() {
    if (storico) return;
    const s = $('chiavi-stato');
    s.textContent = 'Caricamento…';
    s.hidden = false;
    storico = onSnapshot(query(collection(db, 'storico-chiavi'), orderBy('quando', 'desc'), limit(100)), (snap) => {
      const oggi = iso(new Date());
      let prima = '';
      const voci = [];
      for (const d of snap.docs) {
        const r = d.data();
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
    }, () => { s.textContent = 'Controlla la connessione e riprova.'; storico = null; });
  }

  $('scheda-chiavi').onclick = () => { mostraVista('chiavi'); ascoltaStorico(); };
  $('chiavi-conferma').onclick = conferma;
  $('chiavi-rifiuta').onclick = rifiuta;
  $('chiavi-admin').hidden = !admin;
  $('chiavi-dai').onclick = dai;
  onSnapshot(ref, (snap) => { stato = snap.data() ?? { chi: {}, consegne: {} }; disegna(); }, () => {});
  return { disegna };
}
