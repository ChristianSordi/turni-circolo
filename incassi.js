// Registro degli incassi (si carica solo se l'admin l'ha acceso: impostazioni/incassi). Una serata = un incasso con il
// fondo cassa lasciato per il turno dopo. Si scrive solo dalla funzione incasso (functions/index.js), che controlla
// chi può cosa e scrive la storia: qui si legge, si mostra e si chiede. Stessi URL di Firebase di index.html.
import { collection, onSnapshot, query, orderBy, getDocs } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-firestore.js';
import { httpsCallable } from 'https://www.gstatic.com/firebasejs/12.19.0/firebase-functions.js';
import { giornoLeggibile, serataAperta, fineSerata, centesimi, euro, fondo, permessoIncasso, righeIncassi, totale, fraseIncasso }
  from './calendario.js?v=7'; // ?v=: vedi admin.js

// Rifiuti del server (details.motivo) in parole.
const MOTIVI = {
  spenti: 'Il registro degli incassi è spento.',
  'non-socio': 'Il tuo profilo non è più valido: ricarica la pagina ed entra di nuovo.',
  chiusa: 'Il tempo per questa serata è finito: chiedi all\'amministratore.',
  'non-tuo': 'L\'incasso lo correggono solo chi l\'ha inserito e il turnista. Chiedi a loro o all\'amministratore.',
  'non-ultimo': 'Si aggiorna solo il fondo cassa più recente, quello che c\'è adesso nel cassetto.',
  esiste: 'Qualcuno ha appena inserito l\'incasso di questa serata: guardalo nella scheda Incassi.',
  manca: 'Questo incasso non c\'è: ricarica la pagina.',
  uguale: 'Non hai cambiato niente.',
  dati: 'Controlla i numeri e il motivo, poi riprova.',
};
const CAMPI = { inserisci: ['incasso', 'banconote', 'monete', 'cinquanta'], incasso: ['incasso'], fondo: ['banconote', 'monete', 'cinquanta'] };
const NOMI = { incasso: 'L\'incasso', banconote: 'Le banconote', monete: 'Le monete da 1 e 2 €', cinquanta: 'Le monete da 50 centesimi' };
const perCampo = (c) => (c / 100).toFixed(2).replace('.', ',');
const giornoBreve = (g) => new Date(g.slice(0, 4), g.slice(5, 7) - 1, g.slice(8)).toLocaleDateString('it-IT', { weekday: 'short', day: 'numeric' });
const nomeMese = (p) => new Date(p.slice(0, 4), p.slice(5, 7) - 1).toLocaleDateString('it-IT', { month: 'long', year: 'numeric' });

export function avviaIncassi({ db, funzioni, io, admin, turni, orari, impostazioni, $, el, chiedi, avvisoBreve, mostraVista }) {
  const chiama = httpsCallable(funzioni, 'incasso');
  let incassi = {}; // 'AAAA-MM-GG' → documento di incassi/
  let acceso = !!impostazioni().attivi;
  let anno = new Date().getFullYear();
  let mese = new Date().getMonth();
  const serata = () => serataAperta(new Date(), orari().apre);
  const ultimo = () => Object.keys(incassi).sort().at(-1) ?? null;
  const puo = (azione, g, comeAdmin = admin) => permessoIncasso({ azione, giorno: g, io: io.id, admin: comeAdmin,
    incasso: incassi[g] ?? null, ultimo: ultimo(), serata: serata() }) === null;
  const turnista = (g) => incassi[g]?.turnista ?? turni()[g] ?? null;

  // Numeri di un incasso, come nel quaderno: incasso, poi il fondo e il suo totale.
  function righeNumeri(n) {
    const dl = el('dl', 'riep');
    const riga = (nome, valore, forte = false) => {
      const r = el('div', forte ? 'forte' : '');
      r.append(el('dt', '', nome), el('dd', '', euro(valore)));
      dl.append(r);
    };
    if (n.incasso !== undefined) riga('Incasso', n.incasso, true);
    if (n.banconote !== undefined) {
      riga('Banconote', n.banconote);
      riga('Monete da 1 e 2 €', n.monete);
      if (n.cinquanta) riga('Monete da 50 centesimi', n.cinquanta);
      riga('Fondo cassa', fondo(n), true);
    }
    return dl;
  }

  // Modulo: 'inserisci' (incasso + fondo), 'incasso' o 'fondo' (solo quei campi, già compilati, più il motivo).
  // Prima i numeri, poi "Tutto giusto?", poi il server. Risolve i valori salvati, o null.
  function modulo(azione, g) {
    const d = $('dialogo-incasso');
    const prima = incassi[g] ?? null;
    const t = turnista(g);
    const campi = CAMPI[azione];
    const modifica = azione !== 'inserisci';
    $('fi-titolo').textContent = { inserisci: `Incasso di ${giornoLeggibile(g)}`, incasso: 'Correggi l\'incasso', fondo: 'Aggiorna il fondo cassa' }[azione];
    $('fi-sotto').textContent = modifica ? `${giornoLeggibile(g)} · turno di ${t.nome}`
      : t ? `Turno di ${t.nome}` : 'Nessuno si era segnato: il turno di questa serata diventa tuo.';
    for (const c of CAMPI.inserisci) $(`fi-${c}`).value = modifica && campi.includes(c) ? perCampo(prima[c]) : '';
    $('fi-incasso-box').hidden = azione === 'fondo';
    $('fi-fondo-box').hidden = azione === 'incasso';
    $('fi-cinquanta-box').hidden = !(modifica && prima.cinquanta);
    $('fi-mostra-cinquanta').hidden = !$('fi-cinquanta-box').hidden;
    $('fi-motivo-box').hidden = !modifica;
    $('fi-motivo').value = '';
    $('fi-mostra-cinquanta').onclick = () => {
      $('fi-cinquanta-box').hidden = false;
      $('fi-mostra-cinquanta').hidden = true;
      $('fi-cinquanta').focus();
    };
    const totaleFondo = () => {
      const f = ['banconote', 'monete', 'cinquanta'].map((c) => centesimi($(`fi-${c}`).value));
      $('fi-totale').textContent = f.includes(null) ? '—' : euro(f[0] + f[1] + f[2]);
    };
    $('fi-fondo-box').oninput = totaleFondo;
    totaleFondo();
    const errore = (testo) => { $('fi-errore').textContent = testo; $('fi-errore').hidden = !testo; };
    let riepilogo = false;
    const passo = (r) => {
      riepilogo = r;
      $('fi-campi').hidden = r;
      $('fi-riepilogo').hidden = !r;
      $('fi-ok').textContent = r ? (modifica ? 'Conferma la modifica' : 'Conferma l\'incasso') : 'Continua';
      $('fi-annulla').textContent = r ? 'Correggo' : 'Annulla';
    };
    errore('');
    passo(false);
    d.showModal();
    return new Promise((fine) => {
      const chiudi = (v) => { d.close(); fine(v); };
      d.oncancel = (e) => { e.preventDefault(); chiudi(null); }; // tasto indietro / Esc
      $('fi-annulla').onclick = () => (riepilogo ? passo(false) : chiudi(null));
      $('f-incasso').onsubmit = async (e) => {
        e.preventDefault();
        const v = Object.fromEntries(campi.map((c) => [c, centesimi($(`fi-${c}`).value)]));
        const motivo = $('fi-motivo').value.trim();
        if (!riepilogo) {
          for (const c of campi) { // un campo alla volta, dall'alto: il messaggio parla del primo da sistemare
            if (c !== 'cinquanta' && $(`fi-${c}`).value.trim() === '') return errore(`${NOMI[c]}: scrivi la cifra in euro. Se è zero, scrivi 0.`);
            if (v[c] === null || v[c] > 1000000) return errore(`${NOMI[c]}: scrivi solo la cifra in euro, senza punti delle migliaia, per esempio 1290,50.`);
          }
          if (modifica && motivo.length < 3) return errore('Scrivi il motivo della modifica: lo vedranno tutti.');
          if (modifica && campi.every((c) => v[c] === prima[c])) return errore(MOTIVI.uguale);
          errore('');
          const box = el('div');
          box.append(el('p', 'nota', modifica ? 'La modifica resterà scritta nella storia, con il motivo.' : 'Dopo si potrà correggere, ma resterà scritto.'),
            righeNumeri(v));
          if (azione === 'incasso') box.append(el('p', 'nota', `Prima: ${euro(prima.incasso)}`));
          if (azione === 'fondo') box.append(el('p', 'nota', `Prima: ${euro(fondo(prima))}`));
          if (modifica) box.append(el('p', 'nota', `Motivo: ${motivo}`));
          $('fi-riepilogo').replaceChildren(box);
          return passo(true);
        }
        $('fi-ok').disabled = true;
        try {
          await chiama({ azione, giorno: g, ...v, ...(modifica && { motivo }) });
          chiudi(v);
        } catch (err) {
          passo(false);
          errore(MOTIVI[err.details?.motivo] ?? 'Controlla la connessione e riprova.');
        } finally {
          $('fi-ok').disabled = false;
        }
      };
    });
  }

  async function inserisci(g) {
    const t = turnista(g) ?? io;
    const v = await modulo('inserisci', g);
    if (!v) return;
    await chiedi(`Ora il foglietto: scrivi «${giornoLeggibile(g)} · ${euro(v.incasso)} · ${t.nome}» e mettilo con i soldi nella cassetta.`,
      { titolo: 'Incasso salvato ✓', ok: 'Fatto' });
  }

  async function correggi(azione, g) {
    if (await modulo(azione, g)) avvisoBreve(azione === 'incasso' ? 'Incasso corretto' : 'Fondo cassa aggiornato');
  }

  // Dettaglio di una serata: numeri, storia completa, e solo i pulsanti che chi guarda può usare.
  async function mostraSerata(g) {
    const i = incassi[g];
    const d = $('dialogo-serata');
    $('ds-titolo').textContent = giornoLeggibile(g);
    $('ds-sotto').textContent = [`Turno di ${i.turnista.nome}`, i.inseritoDa.id !== i.turnista.id && `inserito da ${i.inseritoDa.nome}`]
      .filter(Boolean).join(' · ');
    $('ds-numeri').replaceChildren(righeNumeri(i));
    $('ds-storia').replaceChildren(el('li', 'nota', 'Caricamento…'));
    const tasto = (testo, classe, fn) => {
      const b = el('button', classe, testo);
      b.type = 'button';
      b.onclick = () => { d.close(); fn(); };
      return b;
    };
    const azioni = [];
    if (puo('incasso', g)) azioni.push(tasto('Correggi l\'incasso', 'grande', () => correggi('incasso', g)));
    if (puo('fondo', g)) azioni.push(tasto('Aggiorna il fondo cassa', 'secondario', () => correggi('fondo', g)));
    azioni.push(tasto('Chiudi', 'secondario', () => {}));
    $('ds-azioni').replaceChildren(...azioni);
    d.showModal();
    try {
      const righe = (await getDocs(query(collection(db, 'incassi', g, 'storia'), orderBy('quando')))).docs.map((s) => s.data());
      $('ds-storia').replaceChildren(...righe.map((r) => {
        const li = el('li', r.cosa === 'inserito' ? '' : 'modifica');
        li.append(el('span', '', fraseIncasso(r))); // testo, mai HTML: nomi e motivi li scrivono gli utenti
        if (r.motivo) li.append(el('span', 'motivo', `«${r.motivo}»`));
        li.append(el('span', 'quando', r.quando.toDate().toLocaleString('it-IT',
          { weekday: 'long', day: 'numeric', month: 'long', hour: '2-digit', minute: '2-digit' })));
        return li;
      }));
    } catch {
      $('ds-storia').replaceChildren(el('li', 'errore', 'Storia non caricata: controlla la connessione.'));
    }
  }

  const apri = (g) => (incassi[g] ? mostraSerata(g) : inserisci(g));

  // In cima alla pagina, solo per il turnista della serata aperta, finché l'incasso manca.
  function disegnaArrivo() {
    const s = serata();
    const mostra = acceso && turni()[s]?.id === io.id && !incassi[s];
    $('incasso-arrivo').hidden = !mostra;
    if (!mostra) return;
    $('incasso-arrivo-testo').replaceChildren(el('strong', '', `Incasso di ${giornoLeggibile(s)}`),
      ` · da inserire fino a ${fineSerata(s, orari().apre)}`);
    $('incasso-arrivo-tasto').onclick = () => inserisci(s);
  }

  function disegnaCassetto() {
    const u = ultimo();
    if (!u) return $('cassetto').replaceChildren(el('p', 'nota', 'Nessun incasso ancora: qui comparirà il fondo cassa che c\'è nel cassetto.'));
    const i = incassi[u];
    const b = el('button', 'secondario', 'Aggiorna il fondo cassa');
    b.onclick = () => correggi('fondo', u);
    $('cassetto').replaceChildren(el('h3', '', `Nel cassetto adesso: ${euro(fondo(i))}`),
      el('p', 'nota', `Fondo della serata di ${giornoLeggibile(u)} · banconote ${euro(i.banconote)} · monete ${euro(i.monete + i.cinquanta)}`), b);
  }

  function disegnaRegistro() {
    const s = serata();
    const prefisso = `${anno}-${String(mese + 1).padStart(2, '0')}`;
    const righe = righeIncassi(anno, mese, turni(), incassi, s, impostazioni().dal ?? s);
    const fatte = righe.filter((r) => r.incasso).length;
    $('incassi-mese').textContent = nomeMese(prefisso);
    $('incassi-totale').textContent = fatte ? `Totale del mese: ${euro(totale(incassi, prefisso))} · ${fatte} ${fatte === 1 ? 'serata' : 'serate'}` : '';
    $('incassi-vuoto').hidden = righe.length > 0;
    $('elenco-incassi').replaceChildren(...righe.map(({ giorno: g, incasso: i, turno: t }) => {
      const b = el('button', i ? '' : 'manca');
      const chi = el('span', 'chi', `${giornoBreve(g)} · ${i ? i.turnista.nome : t.nome}`);
      if (i?.modificato) chi.append(' ', el('span', 'bollo', 'modificato'));
      const nota = i ? [i.inseritoDa.id !== i.turnista.id && `inserito da ${i.inseritoDa.nome}`, `fondo ${euro(fondo(i))}`].filter(Boolean).join(' · ')
        : g === s ? `da inserire fino a ${fineSerata(g, orari().apre)}` : 'non inserito';
      b.append(chi, el('span', 'soldi', i ? euro(i.incasso) : 'manca'), el('span', 'nota', nota));
      b.onclick = () => (i ? mostraSerata(g) : puo('inserisci', g) ? inserisci(g)
        : chiedi('L\'incasso di una serata passata lo inserisce solo l\'amministratore.', { titolo: 'Incasso mancante' }));
      const li = el('li');
      li.append(b);
      return li;
    }));
    disegnaCassetto();
  }

  // Stampa del mese ('AAAA-MM') o dell'anno ('AAAA', con i totali di ogni mese): poi la stampa del telefono (anche PDF).
  function stampa(prefisso) {
    const anno1 = prefisso.length === 4;
    const titolo = anno1 ? `Incassi del ${prefisso}` : `Incassi di ${nomeMese(prefisso)}`;
    const giorni = Object.keys(incassi).filter((g) => g.startsWith(prefisso)).sort();
    if (!giorni.length) return chiedi('Non ci sono incassi da stampare in questo periodo.', { titolo });
    const corpo = el('tbody');
    const riga = (celle, classe = '') => {
      const r = el('tr', classe);
      for (const c of celle) r.append(el('td', '', c));
      corpo.append(r);
    };
    const subtotale = (m) => riga([`Totale di ${nomeMese(m)}`, '', euro(totale(incassi, m)), ''], 'subtotale');
    let m = '';
    for (const g of giorni) {
      if (anno1 && g.slice(0, 7) !== m) { if (m) subtotale(m); m = g.slice(0, 7); }
      const i = incassi[g];
      riga([giornoLeggibile(g), i.turnista.nome, euro(i.incasso), euro(fondo(i))]);
    }
    if (anno1) subtotale(m);
    riga([anno1 ? `Totale del ${prefisso}` : 'Totale del mese', `${giorni.length} ${giorni.length === 1 ? 'serata' : 'serate'}`,
      euro(totale(incassi, prefisso)), ''], 'subtotale finale');
    const testa = el('tr');
    for (const h of ['Data', 'Turnista', 'Incasso', 'Fondo cassa']) testa.append(el('th', '', h));
    const thead = el('thead');
    thead.append(testa);
    const tabella = el('table');
    tabella.append(thead, corpo);
    $('stampa').replaceChildren(el('h1', '', titolo),
      el('p', '', `Circolo Arci San Liberato · stampato il ${new Date().toLocaleDateString('it-IT', { day: 'numeric', month: 'long', year: 'numeric' })}`),
      tabella);
    window.print();
  }

  function disegna() {
    disegnaArrivo();
    disegnaRegistro();
  }

  function accendi(si) {
    acceso = si;
    $('scheda-incassi').hidden = !si;
    if (!si && !$('vista-incassi').hidden) mostraVista('calendario');
    disegna();
  }

  // Calendario (index.html): nella serata aperta "Inserisci l'incasso" per tutti, in una serata con l'incasso "Vedi".
  const etichetta = (g) => (!acceso ? null : incassi[g] ? 'Vedi l\'incasso' : puo('inserisci', g, false) ? 'Inserisci l\'incasso' : null);

  const cambiaMese = (n) => {
    const d = new Date(anno, mese + n);
    anno = d.getFullYear();
    mese = d.getMonth();
    disegnaRegistro();
  };
  $('scheda-incassi').onclick = () => mostraVista('incassi');
  $('incassi-prima').onclick = () => cambiaMese(-1);
  $('incassi-dopo').onclick = () => cambiaMese(1);
  $('stampa-mese').onclick = () => stampa(`${anno}-${String(mese + 1).padStart(2, '0')}`);
  $('stampa-anno').onclick = () => stampa(String(anno));
  // ponytail: ascolta tutti gli incassi di sempre (~365 l'anno, come i turni); filtrare per anno se diventano migliaia.
  onSnapshot(collection(db, 'incassi'), (snap) => {
    incassi = Object.fromEntries(snap.docs.map((d) => [d.id, d.data()]));
    disegna();
  }, () => {});
  setInterval(disegna, 60e3); // la serata aperta cambia all'orario di apertura: il riquadro in cima va ridisegnato
  accendi(acceso);
  return { disegna, accendi, etichetta, apri };
}
