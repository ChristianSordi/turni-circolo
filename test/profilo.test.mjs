import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizzaNome, maiuscole, nomeValido, pinValido, chiave, attesa, idTentativi } from '../profilo.js';

test('normalizzaNome toglie spazi in eccesso', () => {
  assert.equal(normalizzaNome('  Mario   Rossi \t'), 'Mario Rossi');
});

test('nome e cognome obbligatori, max 60 caratteri', () => {
  assert.equal(nomeValido('Mario Rossi'), true);
  assert.equal(nomeValido('  Maria  De Luca '), true);
  assert.equal(nomeValido('Mario'), false);
  assert.equal(nomeValido('   '), false);
  assert.equal(nomeValido('Mario ' + 'x'.repeat(60)), false);
});

test('PIN di 4 cifre', () => {
  assert.equal(pinValido('0123'), true);
  for (const p of ['123', '12345', '12a4', '', ' 1234']) assert.equal(pinValido(p), false, p);
});

test('chiave = SHA-256 di nome minuscolo normalizzato + PIN', async () => {
  const attesa = createHash('sha256').update('turni-circolo:mario rossi:1234').digest('hex');
  assert.equal(await chiave('Mario Rossi', '1234'), attesa);
  assert.equal(await chiave('  mario   ROSSI ', '1234'), attesa);
  assert.notEqual(await chiave('Mario Rossi', '1235'), attesa);
  assert.notEqual(await chiave('Mario Rossa', '1234'), attesa);
});

test('apostrofo tipografico (iPhone) = apostrofo normale', async () => {
  assert.equal(normalizzaNome('Maria D’Amico'), "Maria D'Amico");
  assert.equal(await chiave('Maria D’Amico', '1234'), await chiave("Maria D'Amico", '1234'));
});

test('maiuscole: solo la prima lettera di nome e cognome', async () => {
  assert.equal(maiuscole('GABRIELE  MASSACCESI'), 'Gabriele Massaccesi');
  assert.equal(maiuscole('maria d’amico'), "Maria D'Amico");
  assert.equal(maiuscole('anna maria rossi-bianchi'), 'Anna Maria Rossi-Bianchi');
  assert.equal(maiuscole('Élodie DE LUCA'), 'Élodie De Luca');
  assert.equal(await chiave(maiuscole('GABRIELE MASSACCESI'), '1234'), await chiave('GABRIELE MASSACCESI', '1234'));
});

test('blocco dopo 5 PIN sbagliati per nome: 15 minuti, poi raddoppia ogni 5 errori; a 20 fermo', () => {
  const m = 60e3;
  assert.equal(attesa(4, 0, 0), 0);
  assert.equal(attesa(5, 0, 0), 15 * m);
  assert.equal(attesa(5, 0, 10 * m), 5 * m);
  assert.equal(attesa(9, 0, 15 * m), 0);
  assert.equal(attesa(10, 0, 0), 30 * m);
  assert.equal(attesa(15, 0, 0), 60 * m);
  assert.equal(attesa(19, 0, 0), 60 * m);
  assert.equal(attesa(20, 0, 0), Infinity);
  assert.equal(attesa(20, 0, 365 * 24 * 60 * m), Infinity); // non passa col tempo
  assert.equal(attesa(500, 0, 0), Infinity);
});

test('idTentativi: stesso nome comunque scritto, niente barre', () => {
  assert.equal(idTentativi('  MARIO   Rossi'), idTentativi('mario rossi'));
  assert.ok(!idTentativi('Mario A/B').includes('/'));
});
