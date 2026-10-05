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

// Passaggi delle chiavi da una modifica a chiavi/circolo (chi le ha lo segna l'admin, poi passano di mano). prima/dopo: { chi: id → nome, consegne: id di chi deve
// confermare → id di chi le ha date }. attore come in movimenti; nomi = elenco/soci per chi non ha le chiavi.
// La consegna in attesa avvisa solo chi le riceve; l'annullamento non si scrive (le chiavi non si sono mosse).
export function movimentiChiavi(prima, dopo, attore, nomi = {}) {
  const nome = (id) => dopo.chi[id] ?? prima.chi[id] ?? nomi[id] ?? 'Un socio';
  const riga = (socio, azione, altro) => ({ socio, nome: nome(socio), azione, ...(altro && { altro: nome(altro) }) });
  const righe = [];
  const fatti = new Set();
  for (const [b, a] of Object.entries(prima.consegne)) {
    if (dopo.consegne[b] === a) continue;
    if (dopo.chi[b] && !prima.chi[b] && prima.chi[a] && !dopo.chi[a]) {
      righe.push(riga(b, 'riceve', a));
      fatti.add(a).add(b);
    } else if (attore === b) righe.push(riga(b, 'rifiuta', a));
  }
  for (const id of Object.keys(dopo.chi)) if (!prima.chi[id] && !fatti.has(id)) righe.push(riga(id, 'assegna'));
  for (const id of Object.keys(prima.chi)) if (!dopo.chi[id] && !fatti.has(id)) righe.push(riga(id, 'toglie'));
  const notifiche = Object.entries(dopo.consegne).filter(([b, a]) => prima.consegne[b] !== a).map(([b, a]) => ({
    a: b, titolo: 'Chiavi del circolo', testo: `${nome(a)} dice di averti dato le chiavi del circolo: apri Turni e conferma.` }));
  return { righe, notifiche };
}

// Una riga dei passaggi delle chiavi, in parole, per tutti.
export const fraseChiavi = ({ azione, nome, altro }) => ({
  assegna: `l'amministratore ha segnato che ${nome} ha le chiavi`,
  toglie: `l'amministratore ha segnato che ${nome} non ha più le chiavi`,
  riceve: `${altro} ha dato le chiavi a ${nome}, che ha confermato`,
  rifiuta: `${nome} dice di non aver ricevuto le chiavi da ${altro}`,
}[azione] ?? `${nome}: ${azione}`);
