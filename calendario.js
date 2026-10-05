// Data locale AAAA-MM-GG (toISOString è UTC e sbaglia giorno vicino a mezzanotte).
export const iso = (d) =>
  `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;

// Celle del mese con settimana da lunedì; null = casella vuota prima del giorno 1.
export function griglia(anno, mese) {
  const vuote = (new Date(anno, mese, 1).getDay() + 6) % 7;
  const giorni = new Date(anno, mese + 1, 0).getDate();
  return [
    ...Array(vuote).fill(null),
    ...Array.from({ length: giorni }, (_, i) => iso(new Date(anno, mese, i + 1))),
  ];
}

const giorno = (s) => new Date(s.slice(0, 4), s.slice(5, 7) - 1, s.slice(8));

export const giornoLeggibile = (s) =>
  giorno(s).toLocaleDateString('it-IT', { weekday: 'long', day: 'numeric', month: 'long' });

// Giorno di chiusura settimanale come getDay (0 = domenica … 6 = sabato); null = sempre aperto.
export const GIORNI = ['domenica', 'lunedì', 'martedì', 'mercoledì', 'giovedì', 'venerdì', 'sabato'];
export const chiuso = (s, chiusura) => chiusura != null && giorno(s).getDay() === chiusura;
// Turni coperti nel mese: [giorni aperti con un turno, giorni aperti]. I giorni di chiusura contano solo se un
// socio ha deciso di aprire lo stesso (c'è un turno).
export function coperti(anno, mese, turni, chiusura) {
  const aperti = griglia(anno, mese).filter((d) => d && (!chiuso(d, chiusura) || turni[d]));
  return [aperti.filter((d) => turni[d]).length, aperti.length];
}
export const testoChiusura = (c) => (c == null ? '' : `chiuso ${c === 0 ? 'la' : 'il'} ${GIORNI[c]}`);

// "dalle 18:00 alle 24:00": mezzanotte si legge 24:00. Vuoto se manca un orario.
export const fascia = ({ apre, chiude } = {}) =>
  apre && chiude ? `dalle ${apre} alle ${chiude === '00:00' ? '24:00' : chiude}` : '';

// Classifica turni fatti per socio (per id, col nome più recente): contano solo i giorni prima di `oggi`.
// anno 'AAAA' o null = da sempre.
// A pari turni stessa posizione (1, 2, 2, 4).
export function classifica(turni, oggi, anno = null) {
  const conta = new Map();
  for (const [data, t] of Object.entries(turni).sort()) {
    if (data >= oggi || (anno && !data.startsWith(anno))) continue;
    conta.set(t.id, { id: t.id, nome: t.nome, turni: (conta.get(t.id)?.turni ?? 0) + 1 });
  }
  const righe = [...conta.values()].sort((a, b) => b.turni - a.turni || a.nome.localeCompare(b.nome, 'it'));
  righe.forEach((r, i) => { r.posto = i && r.turni === righe[i - 1].turni ? righe[i - 1].posto : i + 1; });
  return righe;
}

// "Sabato 10 ottobre, dalle 18:00 alle 24:00": per le notifiche.
export const quandoTurno = (giorno, orari = {}) => {
  const t = [giornoLeggibile(giorno), fascia(orari)].filter(Boolean).join(', ');
  return t[0].toUpperCase() + t.slice(1);
};

// Promemoria del mattino: chi ha il turno tra 7 giorni e chi domani. oggi = Date locale.
export const avvisi = (oggi, turni, orari = {}) =>
  [[7, 'Tra una settimana'], [1, 'Domani']].flatMap(([n, quando]) => {
    const data = iso(new Date(oggi.getFullYear(), oggi.getMonth(), oggi.getDate() + n));
    const t = turni[data];
    return t ? [{ id: t.id, titolo: `${quando} hai il turno al circolo`, testo: quandoTurno(data, orari) }] : [];
  });

// Storico e notifiche di una modifica a turni/{giorno}. prima/dopo: { id, nome, cedo? } o null.
// attore: id del socio che l'ha fatta; null = non si sa (console Firebase).
export function movimenti(giorno, prima, dopo, attore, orari = {}) {
  const riga = (t, azione, altro) => ({ socio: t.id, nome: t.nome, azione, giorno, ...(altro && { altro }) });
  const solo = (r) => ({ righe: [r], notifiche: [] });
  if (!prima) return solo(riga(dopo, 'segna'));
  if (!dopo) return solo(riga(prima, attore === null ? 'tolto' : attore === prima.id ? 'toglie' : 'tolto-admin'));
  if (prima.id !== dopo.id) {
    return {
      righe: [riga(dopo, 'prende', prima.nome), riga(prima, 'cede', dopo.nome)],
      notifiche: [{ a: prima.id, titolo: 'Turno passato', testo: `${dopo.nome} ha preso il tuo turno di ${giornoLeggibile(giorno)}.` }],
    };
  }
  if (!prima.cedo && dopo.cedo) {
    return {
      righe: [riga(dopo, 'cerca')],
      notifiche: [{ tranne: dopo.id, titolo: 'Cercasi sostituto',
        testo: `${quandoTurno(giorno, orari)}. ${dopo.nome} cerca un sostituto: apri Turni per prendere il turno.` }],
    };
  }
  if (prima.cedo && !dopo.cedo) return solo(riga(dopo, 'ritira'));
  return { righe: [], notifiche: [] };
}

// Una riga dello storico per l'admin, in parole: "ha ceduto il turno di sabato 10 ottobre a Bruno Bianchi".
export function fraseStorico({ azione, giorno, altro, importato }) {
  const g = `il turno di ${giornoLeggibile(giorno)}`;
  const frase = {
    segna: `ha segnato ${g}`,
    toglie: `ha tolto ${g}`,
    'tolto-admin': `l'amministratore ha tolto ${g}`,
    tolto: `è stato tolto ${g}`,
    cerca: `cerca un sostituto per ${g}`,
    ritira: `farà ${g}: non cerca più un sostituto`,
    prende: `ha preso ${g} da ${altro}`,
    cede: `ha ceduto ${g} a ${altro}`,
  }[azione] ?? `${azione}: ${g}`;
  return importato ? `${frase} (da prima dello storico)` : frase;
}

// Titolo di una giornata nella pagina Attività: "Oggi", "Ieri" o "Sabato 3 ottobre". giorno e oggi: AAAA-MM-GG.
export function titoloGiorno(g, oggi) {
  if (g === oggi) return 'Oggi';
  const ieri = giorno(oggi);
  ieri.setDate(ieri.getDate() - 1);
  if (g === iso(ieri)) return 'Ieri';
  const t = giornoLeggibile(g);
  return t[0].toUpperCase() + t.slice(1);
}

// Mazzi di chiavi: chiavi/circolo = { chi: id → quanti mazzi, richieste: id di chi la fa → { da, a } }. Una richiesta
// la fa chi dà un mazzo ("le ho date a…") o chi lo chiede ("le chiedo a…"); l'altro conferma o rifiuta.
// Prima dei mazzi chi era id → nome: vale un mazzo.
export const mazzi = (v) => (typeof v === 'number' ? v : v ? 1 : 0);

// Passaggi delle chiavi da una modifica a chiavi/circolo. attore come in movimenti; nomi = elenco/soci.
// Una richiesta nuova avvisa l'altro; annullare o rifiutare una richiesta non si scrive, tranne chi dice di non
// aver ricevuto un mazzo che l'altro dice di avergli dato. Il resto dei mazzi in più o in meno è dell'admin.
export function movimentiChiavi(prima, dopo, attore, nomi = {}) {
  const nome = (id) => nomi[id] ?? 'Un socio';
  const [pr, dr] = [prima.richieste ?? {}, dopo.richieste ?? {}];
  const delta = {};
  for (const id of new Set([...Object.keys(prima.chi ?? {}), ...Object.keys(dopo.chi ?? {})])) {
    delta[id] = mazzi(dopo.chi?.[id]) - mazzi(prima.chi?.[id]);
  }
  const righe = [];
  for (const [k, { da, a }] of Object.entries(pr)) {
    if (dr[k]) continue;
    if (delta[da] < 0 && delta[a] > 0) {
      righe.push({ socio: a, nome: nome(a), azione: 'riceve', altro: nome(da) });
      delta[da]++;
      delta[a]--;
    } else if (k === da && attore === a) righe.push({ socio: a, nome: nome(a), azione: 'rifiuta', altro: nome(da) });
  }
  for (const [id, d] of Object.entries(delta)) {
    if (d) righe.push({ socio: id, nome: nome(id), azione: d > 0 ? 'assegna' : 'toglie', mazzi: mazzi(dopo.chi?.[id]) });
  }
  const notifiche = Object.entries(dr).filter(([k, r]) => pr[k]?.da !== r.da || pr[k]?.a !== r.a).map(([k, { da, a }]) => (k === da
    ? { a, titolo: 'Chiavi del circolo', testo: `${nome(da)} dice di averti dato le chiavi del circolo: apri Turni e conferma.` }
    : { a: da, titolo: 'Chiavi del circolo', testo: `${nome(a)} ti chiede le chiavi del circolo: apri Turni e rispondi.` }));
  return { righe, notifiche };
}

// Una riga dei passaggi delle chiavi, in parole, per tutti. Le righe di prima dei mazzi non hanno "mazzi".
const segnato = (nome, n) => `l'amministratore ha segnato che ${nome} ${
  n === 0 ? 'non ha più le chiavi' : n === 1 ? 'ha un mazzo di chiavi' : `ha ${n} mazzi di chiavi`}`;
export const fraseChiavi = ({ azione, nome, altro, mazzi: n }) => ({
  assegna: segnato(nome, n ?? 1),
  toglie: segnato(nome, n ?? 0),
  riceve: `${altro} ha dato le chiavi a ${nome}`,
  rifiuta: `${nome} dice di non aver ricevuto le chiavi da ${altro}`,
}[azione] ?? `${nome}: ${azione}`);
