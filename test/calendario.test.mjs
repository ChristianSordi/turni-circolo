process.env.TZ = 'Europe/Rome'; // prima di qualsiasi Date: fa emergere l'errore UTC di toISOString
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, griglia, giornoLeggibile, classifica, chiuso, testoChiusura, fascia, avvisi } from '../calendario.js';

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

test('classifica: solo turni fatti, per socio, pari merito, filtro anno, nome più recente', () => {
  const turni = {
    '2025-12-31': { id: 'a', nome: 'Anna Bianchi' },
    '2026-01-02': { id: 'b', nome: 'Bruno Neri' },
    '2026-01-03': { id: 'c', nome: 'Carla Verdi' },
    '2026-02-01': { id: 'a', nome: 'Anna Bianchi Rossi' },
    '2026-02-02': { id: 'c', nome: 'Carla Verdi' },
    '2026-03-01': { id: 'd', nome: 'Dino Gialli' },
    '2026-03-10': { id: 'b', nome: 'Bruno Neri' }, // oggi: non ancora fatto
    '2026-04-01': { id: 'b', nome: 'Bruno Neri' }, // futuro
  };
  const oggi = '2026-03-10';
  assert.deepEqual(classifica(turni, oggi, '2026').map((r) => [r.posto, r.id, r.turni]),
    [[1, 'c', 2], [2, 'a', 1], [2, 'b', 1], [2, 'd', 1]]);
  assert.deepEqual(classifica(turni, oggi).map((r) => [r.posto, r.id]), [[1, 'a'], [1, 'c'], [3, 'b'], [3, 'd']]);
  assert.equal(classifica(turni, oggi)[0].nome, 'Anna Bianchi Rossi');
  assert.deepEqual(classifica({}, oggi, '2026'), []);
});

test('giorno di chiusura e orari', () => {
  assert.equal(chiuso('2026-10-05', 1), true); // lunedì
  assert.equal(chiuso('2026-10-04', 1), false);
  assert.equal(chiuso('2026-10-04', 0), true); // domenica = 0, non "falso"
  assert.equal(chiuso('2026-10-05', null), false);
  assert.equal(testoChiusura(1), 'chiuso il lunedì');
  assert.equal(testoChiusura(0), 'chiuso la domenica');
  assert.equal(testoChiusura(null), '');
  assert.equal(fascia({ apre: '18:00', chiude: '00:00' }), 'dalle 18:00 alle 24:00');
  assert.equal(fascia({ apre: '18:00', chiude: '' }), '');
  assert.equal(fascia(), '');
});

test('promemoria: una settimana prima e il giorno prima, anche a cavallo del mese', () => {
  const turni = {
    '2026-11-06': { id: 'a', nome: 'Anna Bianchi' }, // +7
    '2026-10-31': { id: 'b', nome: 'Bruno Neri' },   // +1
    '2026-11-01': { id: 'c', nome: 'Carla Verdi' },  // +2: niente
  };
  assert.deepEqual(avvisi(new Date(2026, 9, 30, 9), turni, { apre: '18:00', chiude: '00:00' }), [
    { id: 'a', titolo: 'Tra una settimana hai il turno al circolo', testo: 'Venerdì 6 novembre, dalle 18:00 alle 24:00' },
    { id: 'b', titolo: 'Domani hai il turno al circolo', testo: 'Sabato 31 ottobre, dalle 18:00 alle 24:00' },
  ]);
  assert.equal(avvisi(new Date(2026, 9, 30), turni)[1].testo, 'Sabato 31 ottobre');
  assert.deepEqual(avvisi(new Date(2026, 0, 1), turni), []);
});
