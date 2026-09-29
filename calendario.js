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
