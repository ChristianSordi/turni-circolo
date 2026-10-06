process.env.TZ = 'Europe/Rome'; // prima di qualsiasi Date: fa emergere l'errore UTC di toISOString
import { test } from 'node:test';
import assert from 'node:assert/strict';
import { iso, griglia, giornoLeggibile, classifica, chiuso, testoChiusura, fascia, avvisi, quandoTurno, movimenti, fraseStorico, titoloGiorno, coperti, movimentiChiavi, fraseChiavi, serataAperta, fineSerata, centesimi, euro, fondo, datiIncasso, permessoIncasso, righeIncassi, totale, fraseIncasso } from '../calendario.js';

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

const ANNA = { id: 'anna', nome: 'Anna Rossi' };
const BRUNO = { id: 'bruno', nome: 'Bruno Bianchi' };
const SAB = '2026-10-10'; // sabato
const ORARI = { apre: '18:00', chiude: '00:00' };

test('quandoTurno: giorno con maiuscola e fascia oraria se c\'è', () => {
  assert.equal(quandoTurno(SAB, ORARI), 'Sabato 10 ottobre, dalle 18:00 alle 24:00');
  assert.equal(quandoTurno(SAB), 'Sabato 10 ottobre');
});

test('movimenti: segna, toglie, tolto dall\'admin, tolto da chi non si sa', () => {
  assert.deepEqual(movimenti(SAB, null, ANNA, 'anna'),
    { righe: [{ socio: 'anna', nome: 'Anna Rossi', azione: 'segna', giorno: SAB }], notifiche: [] });
  assert.equal(movimenti(SAB, ANNA, null, 'anna').righe[0].azione, 'toglie');
  assert.equal(movimenti(SAB, ANNA, null, 'capo').righe[0].azione, 'tolto-admin');
  assert.equal(movimenti(SAB, ANNA, null, null).righe[0].azione, 'tolto');
  assert.equal(movimenti(SAB, null, ANNA, null).righe[0].azione, 'segna');
  assert.equal(movimenti(SAB, null, ANNA, 'capo').righe[0].azione, 'segnato-admin');
});

test('movimenti: cerca un sostituto avvisa tutti tranne chi cede', () => {
  assert.deepEqual(movimenti(SAB, ANNA, { ...ANNA, cedo: true }, 'anna', ORARI), {
    righe: [{ socio: 'anna', nome: 'Anna Rossi', azione: 'cerca', giorno: SAB }],
    notifiche: [{ tranne: 'anna', titolo: 'Cercasi sostituto',
      testo: 'Sabato 10 ottobre, dalle 18:00 alle 24:00. Anna Rossi cerca un sostituto: apri Turni per prendere il turno.' }],
  });
});

test('movimenti: ci ripensa, oppure un altro prende il turno', () => {
  assert.deepEqual(movimenti(SAB, { ...ANNA, cedo: true }, ANNA, 'anna'),
    { righe: [{ socio: 'anna', nome: 'Anna Rossi', azione: 'ritira', giorno: SAB }], notifiche: [] });
  assert.deepEqual(movimenti(SAB, { ...ANNA, cedo: true }, BRUNO, 'bruno'), {
    righe: [
      { socio: 'bruno', nome: 'Bruno Bianchi', azione: 'prende', giorno: SAB, altro: 'Anna Rossi' },
      { socio: 'anna', nome: 'Anna Rossi', azione: 'cede', giorno: SAB, altro: 'Bruno Bianchi' },
    ],
    notifiche: [{ a: 'anna', titolo: 'Turno passato', testo: 'Bruno Bianchi ha preso il tuo turno di sabato 10 ottobre.' }],
  });
  assert.deepEqual(movimenti(SAB, ANNA, ANNA, 'anna'), { righe: [], notifiche: [] });
});

test('fraseStorico: frasi intere, e la nota sulle righe importate', () => {
  assert.equal(fraseStorico({ azione: 'segna', giorno: SAB }), 'ha segnato il turno di sabato 10 ottobre');
  assert.equal(fraseStorico({ azione: 'tolto-admin', giorno: SAB }), 'l\'amministratore ha tolto il turno di sabato 10 ottobre');
  assert.equal(fraseStorico({ azione: 'cede', giorno: SAB, altro: 'Bruno Bianchi' }), 'ha ceduto il turno di sabato 10 ottobre a Bruno Bianchi');
  assert.equal(fraseStorico({ azione: 'prende', giorno: SAB, altro: 'Anna Rossi' }), 'ha preso il turno di sabato 10 ottobre da Anna Rossi');
  assert.equal(fraseStorico({ azione: 'segna', giorno: SAB, importato: true }),
    'ha segnato il turno di sabato 10 ottobre (da prima dello storico)');
});

test('titoloGiorno: Oggi, Ieri, altrimenti il giorno per esteso', () => {
  assert.equal(titoloGiorno('2026-10-10', '2026-10-10'), 'Oggi');
  assert.equal(titoloGiorno('2026-10-09', '2026-10-10'), 'Ieri');
  assert.equal(titoloGiorno('2026-09-30', '2026-10-01'), 'Ieri'); // a cavallo del mese
  assert.equal(titoloGiorno('2026-10-03', '2026-10-10'), 'Sabato 3 ottobre');
});

test('coperti: ottobre 2026 ha 4 lunedì; un lunedì aperto da un socio conta', () => {
  const turni = { '2026-10-02': {}, '2026-10-03': {}, '2026-10-05': {}, '2026-11-01': {} }; // il 5 è lunedì
  assert.deepEqual(coperti(2026, 9, turni, 1), [3, 28]);
  assert.deepEqual(coperti(2026, 9, turni, null), [3, 31]); // sempre aperto
});

const NOMI = { anna: 'Anna Rossi', bruno: 'Bruno Bianchi' };

test('chiavi: l\'admin aggiunge e toglie mazzi; i vecchi nomi valgono un mazzo', () => {
  const vuoto = { chi: {}, richieste: {} };
  assert.deepEqual(movimentiChiavi(vuoto, { chi: { anna: 1 }, richieste: {} }, 'capo', NOMI).righe,
    [{ socio: 'anna', nome: 'Anna Rossi', azione: 'assegna', mazzi: 1 }]);
  assert.deepEqual(movimentiChiavi({ chi: { anna: 2 }, richieste: {} }, { chi: { anna: 1 }, richieste: {} }, 'capo', NOMI).righe,
    [{ socio: 'anna', nome: 'Anna Rossi', azione: 'toglie', mazzi: 1 }]);
  // Conversione da { id: nome } a { id: 1 }: nessun passaggio.
  assert.deepEqual(movimentiChiavi({ chi: { anna: 'Anna Rossi' }, consegne: {} }, { chi: { anna: 1 }, richieste: {} }, null, NOMI),
    { righe: [], notifiche: [] });
});

test('chiavi: le dà chi le ha (anche a chi ne ha già) o le chiede chi non le ha; conferma l\'altro', () => {
  const da = { chi: { anna: 1, bruno: 1 }, richieste: {} };
  const dice = { ...da, richieste: { anna: { da: 'anna', a: 'bruno' } } };
  const chiede = { ...da, richieste: { bruno: { da: 'anna', a: 'bruno' } } };
  assert.deepEqual(movimentiChiavi(da, dice, 'anna', NOMI).notifiche, [{ a: 'bruno', titolo: 'Chiavi del circolo',
    testo: 'Anna Rossi dice di averti dato le chiavi del circolo: apri Turni e conferma.' }]);
  assert.deepEqual(movimentiChiavi(da, chiede, 'bruno', NOMI).notifiche, [{ a: 'anna', titolo: 'Chiavi del circolo',
    testo: 'Bruno Bianchi ti chiede le chiavi del circolo: apri Turni e rispondi.' }]);
  const passato = { chi: { bruno: 2 }, richieste: {} };
  for (const [prima, chi] of [[dice, 'bruno'], [chiede, 'anna']]) {
    assert.deepEqual(movimentiChiavi(prima, passato, chi, NOMI).righe,
      [{ socio: 'bruno', nome: 'Bruno Bianchi', azione: 'riceve', altro: 'Anna Rossi' }]);
  }
  assert.deepEqual(movimentiChiavi(dice, da, 'bruno', NOMI).righe,
    [{ socio: 'bruno', nome: 'Bruno Bianchi', azione: 'rifiuta', altro: 'Anna Rossi' }]);
  assert.deepEqual(movimentiChiavi(dice, da, 'anna', NOMI), { righe: [], notifiche: [] });   // annulla
  assert.deepEqual(movimentiChiavi(chiede, da, 'anna', NOMI), { righe: [], notifiche: [] }); // dice di no alla richiesta
});

test('fraseChiavi: frasi intere con i nomi, anche per le righe di prima dei mazzi', () => {
  assert.equal(fraseChiavi({ azione: 'assegna', nome: 'Anna Rossi' }), 'l\'amministratore ha segnato che Anna Rossi ha un mazzo di chiavi');
  assert.equal(fraseChiavi({ azione: 'assegna', nome: 'Anna Rossi', mazzi: 2 }), 'l\'amministratore ha segnato che Anna Rossi ha 2 mazzi di chiavi');
  assert.equal(fraseChiavi({ azione: 'toglie', nome: 'Anna Rossi' }), 'l\'amministratore ha segnato che Anna Rossi non ha più le chiavi');
  assert.equal(fraseChiavi({ azione: 'riceve', nome: 'Bruno Bianchi', altro: 'Anna Rossi' }), 'Anna Rossi ha dato le chiavi a Bruno Bianchi');
});

test('serataAperta: prima dell\'apertura è ieri sera, da quell\'ora in poi stasera', () => {
  assert.equal(serataAperta(new Date(2026, 9, 10, 0, 40), '21:00'), '2026-10-09'); // sabato 00:40 → venerdì
  assert.equal(serataAperta(new Date(2026, 9, 10, 20, 59), '21:00'), '2026-10-09');
  assert.equal(serataAperta(new Date(2026, 9, 10, 21, 0), '21:00'), '2026-10-10');
  assert.equal(serataAperta(new Date(2026, 9, 10, 18, 30), '18:00'), '2026-10-10');
  assert.equal(serataAperta(new Date(2026, 9, 10, 20, 0), ''), '2026-10-09'); // orario mancante = 21:00
  assert.equal(serataAperta(new Date(2026, 9, 1, 3, 0), undefined), '2026-09-30'); // a cavallo del mese
});

test('fineSerata: fino all\'apertura del giorno dopo', () => {
  assert.equal(fineSerata('2026-10-09', '21:00'), 'sabato alle 21:00');
  assert.equal(fineSerata('2026-10-11', ''), 'lunedì alle 21:00');
});

test('centesimi: virgola o punto, spazi, vuoto = 0; il resto è rifiutato', () => {
  assert.equal(centesimi('312,50'), 31250);
  assert.equal(centesimi('312.50'), 31250);
  assert.equal(centesimi(' 312,5 '), 31250);
  assert.equal(centesimi('312'), 31200);
  assert.equal(centesimi('0'), 0);
  assert.equal(centesimi(''), 0);
  assert.equal(centesimi('  '), 0);
  for (const male of ['1.290,50', '€ 50', '50,', '12,345', '-5', 'dieci', '1e3', '100000']) assert.equal(centesimi(male), null, male);
});

test('euro: sempre due decimali e il punto delle migliaia', () => {
  assert.equal(euro(31250), '€ 312,50');
  assert.equal(euro(0), '€ 0,00');
  assert.equal(euro(5), '€ 0,05');
  assert.equal(euro(129050), '€ 1.290,50');
  assert.equal(euro(1000000), '€ 10.000,00');
});

test('fondo: banconote + monete + 50 centesimi, i campi mancanti valgono 0', () => {
  assert.equal(fondo({ banconote: 6000, monete: 1000, cinquanta: 150 }), 7150);
  assert.equal(fondo({ banconote: 6000 }), 6000);
});

test('datiIncasso: campi giusti per ogni azione, interi tra 0 e 1 000 000, motivo nelle modifiche', () => {
  const n = { incasso: 31250, banconote: 6000, monete: 1000, cinquanta: 0 };
  assert.deepEqual(datiIncasso('inserisci', { giorno: '2026-10-09', ...n, motivo: 'ignorato' }), { giorno: '2026-10-09', valori: n });
  assert.deepEqual(datiIncasso('incasso', { giorno: '2026-10-09', incasso: 100, banconote: 5, motivo: '  conto rifatto ' }),
    { giorno: '2026-10-09', valori: { incasso: 100 }, motivo: 'conto rifatto' });
  assert.deepEqual(datiIncasso('fondo', { giorno: '2026-10-09', banconote: 1, monete: 2, cinquanta: 3, motivo: 'aperitivo' }),
    { giorno: '2026-10-09', valori: { banconote: 1, monete: 2, cinquanta: 3 }, motivo: 'aperitivo' });
  for (const male of [
    ['inserisci', { giorno: '2026-10-09', ...n, incasso: -1 }],
    ['inserisci', { giorno: '2026-10-09', ...n, incasso: 1.5 }],
    ['inserisci', { giorno: '2026-10-09', ...n, incasso: 1000001 }],
    ['inserisci', { giorno: '2026-10-09', ...n, incasso: '100' }],
    ['inserisci', { giorno: '9 ottobre', ...n }],
    ['incasso', { giorno: '2026-10-09', incasso: 100 }],
    ['incasso', { giorno: '2026-10-09', incasso: 100, motivo: ' ok ' }],
    ['fondo', { giorno: '2026-10-09', banconote: 1, monete: 2, cinquanta: 3, motivo: 'x'.repeat(201) }],
    ['cancella', { giorno: '2026-10-09' }],
  ]) assert.equal(datiIncasso(...male), null, JSON.stringify(male));
});

test('permessoIncasso: chi può cosa, e quando', () => {
  const serata = '2026-10-09';
  const i = { inseritoDa: { id: 'anna' }, turnista: { id: 'bruno' } };
  const p = (o) => permessoIncasso({ azione: 'inserisci', giorno: serata, io: 'carla', admin: false, incasso: null, ultimo: null, serata, ...o });
  assert.equal(p({}), null);
  assert.equal(p({ incasso: i }), 'esiste');
  assert.equal(p({ giorno: '2026-10-08' }), 'chiusa');
  assert.equal(p({ giorno: '2026-10-08', admin: true }), null);
  assert.equal(p({ giorno: '2026-10-10', admin: true }), 'chiusa'); // il futuro nemmeno l'admin
  assert.equal(p({ azione: 'incasso' }), 'manca');
  assert.equal(p({ azione: 'incasso', incasso: i }), 'non-tuo');
  assert.equal(p({ azione: 'incasso', incasso: i, io: 'anna' }), null);
  assert.equal(p({ azione: 'incasso', incasso: i, io: 'bruno' }), null);
  assert.equal(p({ azione: 'incasso', incasso: i, io: 'bruno', giorno: '2026-10-08' }), 'chiusa');
  assert.equal(p({ azione: 'incasso', incasso: i, giorno: '2026-10-01', admin: true }), null);
  assert.equal(p({ azione: 'fondo', incasso: i, ultimo: serata }), null);
  assert.equal(p({ azione: 'fondo', incasso: i, giorno: '2026-10-08', ultimo: serata }), 'non-ultimo');
  assert.equal(p({ azione: 'fondo', incasso: i, giorno: '2026-10-08', ultimo: '2026-10-08' }), null); // è il più recente
  assert.equal(p({ azione: 'fondo', incasso: i, giorno: '2026-10-01', ultimo: serata, admin: true }), null);
  assert.equal(p({ azione: 'boh', incasso: i }), 'dati');
});

test('righeIncassi: serate con incasso e, da dal alla serata aperta, quelle col turno senza incasso', () => {
  const turni = { '2026-10-01': { id: 'a', nome: 'Anna' }, '2026-10-03': { id: 'b', nome: 'Bruno' },
    '2026-10-05': { id: 'c', nome: 'Carla' }, '2026-10-09': { id: 'a', nome: 'Anna' }, '2026-10-20': { id: 'b', nome: 'Bruno' } };
  const incassi = { '2026-10-03': { incasso: 100 }, '2026-09-30': { incasso: 5 } };
  assert.deepEqual(righeIncassi(2026, 9, turni, incassi, '2026-10-09', '2026-10-02').map((r) => `${r.giorno}:${r.incasso ? 'ok' : 'manca'}`),
    ['2026-10-09:manca', '2026-10-05:manca', '2026-10-03:ok']); // 1 ottobre prima di dal, 20 nel futuro
  assert.deepEqual(righeIncassi(2026, 9, turni, incassi, '2026-10-09', '2026-10-02')[2], { giorno: '2026-10-03', incasso: { incasso: 100 }, turno: turni['2026-10-03'] });
});

test('totale: somma degli incassi del mese o dell\'anno', () => {
  const incassi = { '2026-09-30': { incasso: 5 }, '2026-10-03': { incasso: 100 }, '2026-10-09': { incasso: 250 } };
  assert.equal(totale(incassi, '2026-10'), 350);
  assert.equal(totale(incassi, '2026'), 355);
  assert.equal(totale(incassi, '2025'), 0);
});

test('fraseIncasso: la storia in parole', () => {
  const chi = { id: 'b', nome: 'Bruno Neri' };
  const n = { incasso: 18000, banconote: 6000, monete: 1000, cinquanta: 0 };
  assert.equal(fraseIncasso({ cosa: 'inserito', chi, prima: null, dopo: n }), 'Bruno Neri l\'ha inserito: incasso € 180,00, fondo cassa € 70,00');
  assert.equal(fraseIncasso({ cosa: 'incasso', chi, prima: n, dopo: { ...n, incasso: 18800 } }), 'Bruno Neri ha corretto l\'incasso: € 180,00 → € 188,00');
  assert.equal(fraseIncasso({ cosa: 'fondo', chi, prima: n, dopo: { ...n, monete: 1500 } }), 'Bruno Neri ha aggiornato il fondo cassa: € 70,00 → € 75,00');
});
