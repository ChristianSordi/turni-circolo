// Identità del socio: nome e cognome + PIN. Stesse regole del nome di firestore.rules.
// Apostrofi tipografici (iPhone li mette da solo) → ' : "D’Amico" e "D'Amico" sono la stessa persona.
export const normalizzaNome = (s) => s.normalize('NFC').replace(/[’‘`´]/g, "'").trim().replace(/\s+/g, ' ');

// Come si mostra: "GABRIELE MASSACCESI" e "maria d'amico" → "Gabriele Massaccesi", "Maria D'Amico".
export const maiuscole = (s) => normalizzaNome(s).toLowerCase().replace(/(^|[ '-])(\p{L})/gu, (_, a, b) => a + b.toUpperCase());

export function nomeValido(s) {
  const n = normalizzaNome(s);
  return n.length <= 60 && /^[^ ]+( [^ ]+)+$/.test(n);
}

export const pinValido = (p) => /^[0-9]{4}$/.test(p);

// SHA-256 semplice: i 10 000 PIN non si provano a raffica perché il controllo è sul server, con attesa() sotto.
export async function chiave(nome, pin) {
  const dati = new TextEncoder().encode(`turni-circolo:${normalizzaNome(nome).toLowerCase()}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', dati);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}

// Contro chi prova i 10 000 PIN: gli errori si contano per nome (non per telefono, che si rifà gratis) in
// functions/index.js. Dopo 5 errori 15 minuti di attesa dall'ultimo, il doppio ogni altri 5, al massimo 16 ore.
// Un PIN giusto o il reset dell'admin azzerano il conto.
export const idTentativi = (nome) => encodeURIComponent(normalizzaNome(nome).toLowerCase());
export function attesa(errori, ultimo, ora) {
  if (errori < 5) return 0;
  return Math.max(0, ultimo + 15 * 60e3 * 2 ** Math.min(Math.floor(errori / 5) - 1, 6) - ora);
}
