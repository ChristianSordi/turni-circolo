import { test } from 'node:test';
import assert from 'node:assert/strict';
import { createHash } from 'node:crypto';
import { normalizzaNome, nomeValido, pinValido, chiave } from '../profilo.js';

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
