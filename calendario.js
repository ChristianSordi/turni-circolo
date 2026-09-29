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

export const giornoLeggibile = (s) =>
  new Date(s.slice(0, 4), s.slice(5, 7) - 1, s.slice(8)).toLocaleDateString('it-IT', {
    weekday: 'long', day: 'numeric', month: 'long',
  });
