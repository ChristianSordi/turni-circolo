// Una volta sola, dal PC: copia di sicurezza di tutto il database, poi storico iniziale dei turni già segnati
// (una riga "segna" con l'ora vera di creazione del turno). Rilanciabile: salta i turni che hanno già un "segna".
// Ogni lancio salva un backup col suo orario (backup-AAAA-MM-GGThh-mm-ss-mmmZ.json): nessuno sostituisce il precedente.
// Uso, dalla radice del repo:
//   GOOGLE_APPLICATION_CREDENTIALS=prod/chiave-servizio.json node functions/importa-storico.js [--solo-backup]
import { writeFileSync } from 'node:fs';
import { initializeApp } from 'firebase-admin/app';
import { getFirestore } from 'firebase-admin/firestore';

initializeApp({ projectId: process.env.GCLOUD_PROJECT ?? 'turni-sanliberato' });
const db = getFirestore();

const tutto = {};
for (const c of await db.listCollections()) {
  tutto[c.id] = Object.fromEntries((await c.get()).docs.map((d) => [d.id, d.data()]));
}
const file = `${process.env.CARTELLA_BACKUP ?? 'prod'}/backup-${new Date().toISOString().replace(/[:.]/g, '-')}.json`;
writeFileSync(file, JSON.stringify(tutto, null, 2));
console.log(`Backup salvato: ${file}`);
if (process.argv.includes('--solo-backup')) process.exit(0);

const segnati = new Set(Object.values(tutto.attivita ?? {}).filter((r) => r.azione === 'segna').map((r) => r.giorno));
const scrittore = db.bulkWriter();
let n = 0;
for (const d of (await db.collection('turni').get()).docs) {
  if (segnati.has(d.id)) continue;
  const { id, nome } = d.data();
  if (typeof id !== 'string' || !id) { console.log(`Saltato ${d.id}: turno senza socio`); continue; }
  scrittore.set(db.doc(`attivita/import-${d.id}`), {
    socio: id, nome, azione: 'segna', giorno: d.id, quando: d.createTime, importato: true,
  });
  n++;
}
await scrittore.close();
console.log(`Storico iniziale: ${n} turni importati`);
