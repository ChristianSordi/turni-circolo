// Identità del socio: nome e cognome + PIN. Stesse regole del nome di firestore.rules.
// Apostrofi tipografici (iPhone li mette da solo) → ' : "D’Amico" e "D'Amico" sono la stessa persona.
export const normalizzaNome = (s) => s.normalize('NFC').replace(/[’‘`´]/g, "'").trim().replace(/\s+/g, ' ');

export function nomeValido(s) {
  const n = normalizzaNome(s);
  return n.length <= 60 && /^[^ ]+( [^ ]+)+$/.test(n);
}

export const pinValido = (p) => /^[0-9]{4}$/.test(p);

// ponytail: SHA-256 semplice; con 4 cifre il PIN resta indovinabile in 10 000 tentativi (spec, "Limiti").
export async function chiave(nome, pin) {
  const dati = new TextEncoder().encode(`turni-circolo:${normalizzaNome(nome).toLowerCase()}:${pin}`);
  const hash = await crypto.subtle.digest('SHA-256', dati);
  return [...new Uint8Array(hash)].map((b) => b.toString(16).padStart(2, '0')).join('');
}
