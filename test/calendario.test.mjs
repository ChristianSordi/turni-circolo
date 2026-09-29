process.env.TZ = 'Europe/Rome'; // prima di qualsiasi Date: fa emergere l'errore UTC di toISOString
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, griglia, giornoLeggibile } from '../calendario.js';

test('iso usa la data locale anche subito dopo mezzanotte', () => {
  assert.equal(iso(new Date(2026, 9, 12, 0, 30)), '2026-10-12');
});

test('ottobre 2026 parte di giovedì: 3 caselle vuote, 31 giorni', () => {
  const g = griglia(2026, 9);
  assert.deepEqual(g.slice(0, 4), [null, null, null, '2026-10-01']);
  assert.equal(g.length, 3 + 31);
  assert.equal(g.at(-1), '2026-10-31');
});

test('febbraio 2026 parte di domenica: 6 vuote, 28 giorni', () => {
  const g = griglia(2026, 1);
  assert.equal(g.filter((c) => c === null).length, 6);
  assert.equal(g.at(-1), '2026-02-28');
});

test('febbraio 2028 bisestile parte di martedì', () => {
  const g = griglia(2028, 1);
  assert.deepEqual(g.slice(0, 2), [null, '2028-02-01']);
  assert.equal(g.at(-1), '2028-02-29');
});

test('giornoLeggibile in italiano', () => {
  assert.equal(giornoLeggibile('2026-10-01'), 'giovedì 1 ottobre');
});
