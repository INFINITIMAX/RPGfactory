// Teste pentru public/merge-state.js (T-06) — merge pe 3 căi (base/local/
// remote) pentru starea de arhivare, folosit de frontend la conflict 409.
//
// merge-state.js e script clasic (fără `export`/`module.exports`), la fel ca
// public/app.js. Îl încărcăm cu `node:vm` (același tipar ca test/app.test.mjs)
// ca să obținem mergeSet/mergeMap/mergeState REALE ca funcții apelabile,
// fără să reimplementăm logica lor aici.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import vm from 'node:vm';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = path.dirname(fileURLToPath(import.meta.url));
const MERGE_JS_PATH = path.join(__dirname, '..', 'public', 'merge-state.js');
const MERGE_SOURCE = fs.readFileSync(MERGE_JS_PATH, 'utf8');

// Obiectele/array-urile create în interiorul vm.Context aparțin altui
// "realm" — au un Array.prototype/Object.prototype distinct de cel din
// acest fișier de test. Structural sunt identice, dar assert.deepEqual
// le respinge ("same structure but are not reference-equal"), pentru că
// verifică și identitatea prototipului, nu doar proprietățile. Rotunjim
// fiecare rezultat prin JSON ca să-l aducem înapoi în realm-ul normal —
// nu schimbă ce testăm (valorile rămân exact aceleași), doar containerul.
function toPlain(value) {
  return JSON.parse(JSON.stringify(value));
}

function loadMergeState() {
  const context = {};
  vm.createContext(context);
  vm.runInContext(MERGE_SOURCE, context);
  return {
    mergeSet: (...args) => toPlain(context.mergeSet(...args)),
    mergeMap: (...args) => toPlain(context.mergeMap(...args)),
    mergeState: (...args) => toPlain(context.mergeState(...args)),
    // sameValue întoarce un boolean, nu are nevoie de trecerea prin toPlain
    sameValue: (...args) => context.sameValue(...args),
  };
}

const { mergeSet, mergeMap, mergeState, sameValue } = loadMergeState();

// --- mergeSet ----------------------------------------------------------------

test('mergeSet: adăugare locală (nu în base, e în local) supraviețuiește chiar dacă remote n-o are', () => {
  const base = ['a'];
  const local = ['a', 'b']; // b adăugat local
  const remote = ['a']; // remote nu știe încă de b
  const result = mergeSet(base, local, remote);
  assert.deepEqual(result, ['a', 'b']);
});

test('mergeSet: ștergere locală (era în base, nu mai e în local) elimină id-ul din rezultat, chiar dacă remote îl are (un-archive nu trebuie să reînvie)', () => {
  const base = ['a', 'b'];
  const local = ['a']; // b a fost dezarhivat local
  const remote = ['a', 'b', 'c']; // remote încă are b (scris de altcineva între timp)
  const result = mergeSet(base, local, remote);
  assert.deepEqual(result, ['a', 'c']);
  assert.ok(!result.includes('b'), 'b a fost șters local și nu trebuie să reînvie din remote');
});

test('mergeSet: id adăugat de "cealaltă parte" (în remote, nu în base, nu în local) supraviețuiește', () => {
  const base = ['a'];
  const local = ['a'];
  const remote = ['a', 'z']; // z adăugat de altcineva
  const result = mergeSet(base, local, remote);
  assert.deepEqual(result, ['a', 'z']);
});

test('mergeSet: ordinea rezultatului urmează remote, apoi adăugările locale la coadă', () => {
  const base = [];
  const local = ['local1', 'local2'];
  const remote = ['r2', 'r1']; // ordine specifică în remote, ca să nu se confunde cu ordine alfabetică întâmplătoare
  const result = mergeSet(base, local, remote);
  assert.deepEqual(result, ['r2', 'r1', 'local1', 'local2']);
});

test('mergeSet: base/local/remote lipsă (undefined) nu aruncă și dă array gol', () => {
  assert.deepEqual(mergeSet(undefined, undefined, undefined), []);
});

// --- mergeMap ------------------------------------------------------------------

test('mergeMap: o cheie schimbată local (diferă de base) câștigă peste remote', () => {
  const base = { s1: 100 };
  const local = { s1: 200 }; // schimbată local
  const remote = { s1: 999 }; // altcineva a scris altceva
  const result = mergeMap(base, local, remote);
  assert.deepEqual(result, { s1: 200 });
});

test('mergeMap: o cheie neschimbată local (egală cu base) rămâne cea din remote, nu din local', () => {
  const base = { s1: 100 };
  const local = { s1: 100 }; // identic cu base -> "neatins" local
  const remote = { s1: 555 }; // remote a avansat între timp
  const result = mergeMap(base, local, remote);
  assert.deepEqual(result, { s1: 555 });
});

test('mergeMap: o cheie ștearsă local (era în base, nu mai e în local) dispare din rezultat, chiar dacă remote o are', () => {
  const base = { s1: 100, s2: 200 };
  const local = { s1: 100 }; // s2 a fost ștearsă local
  const remote = { s1: 100, s2: 200, s3: 300 };
  const result = mergeMap(base, local, remote);
  assert.deepEqual(result, { s1: 100, s3: 300 });
  assert.ok(!('s2' in result), 's2 a fost ștearsă local și nu trebuie să reapară din remote');
});

test('mergeMap: cheie nouă adăugată local (nu era în base) se păstrează peste remote', () => {
  const base = {};
  const local = { s4: 400 };
  const remote = {};
  const result = mergeMap(base, local, remote);
  assert.deepEqual(result, { s4: 400 });
});

// --- mergeState ------------------------------------------------------------------

test('mergeState: compune mergeSet pe archived + mergeMap pe archivedAt, version rămâne 1', () => {
  const base = { archived: ['a', 'b'], archivedAt: { a: 1, b: 2 } };
  const local = { archived: ['a'], archivedAt: { a: 1 } }; // b dezarhivat local
  const remote = { archived: ['a', 'b', 'c'], archivedAt: { a: 1, b: 2, c: 3 } };
  const result = mergeState(base, local, remote);
  assert.equal(result.version, 1);
  assert.deepEqual(result.archived, ['a', 'c']);
  assert.deepEqual(result.archivedAt, { a: 1, c: 3 });
});

test('mergeState: cu argumente parțial lipsă (fără base/local/remote) nu aruncă și întoarce stare goală coerentă', () => {
  const result = mergeState(undefined, undefined, undefined);
  assert.deepEqual(result, { version: 1, archived: [], archivedAt: {}, plots: {} });
});

// --- sameValue -----------------------------------------------------------------
// Adăugat la T-09 pentru `plots` (valori = array-uri de obiecte {x,y}), unde
// `===` ar considera mereu "diferit" chiar la conținut identic dacă referința
// s-a schimbat (recalcularea layout-ului de zone creează obiecte noi).

test('sameValue: două numere egale -> true', () => {
  assert.equal(sameValue(100, 100), true);
});

test('sameValue: două numere diferite -> false', () => {
  assert.equal(sameValue(100, 200), false);
});

test('sameValue: două array-uri de {x,y} identice ca valori, referințe diferite -> true', () => {
  const a = [{ x: 0, y: 0 }, { x: 1, y: 2 }];
  const b = [{ x: 0, y: 0 }, { x: 1, y: 2 }]; // recreat separat, altă referință
  assert.notEqual(a, b, 'precondiție: trebuie să fie referințe diferite, altfel testul nu verifică nimic');
  assert.equal(sameValue(a, b), true);
});

test('sameValue: array-uri cu conținut diferit -> false', () => {
  const a = [{ x: 0, y: 0 }];
  const b = [{ x: 9, y: 9 }];
  assert.equal(sameValue(a, b), false);
});

test('sameValue: array-uri de lungimi diferite -> false', () => {
  const a = [{ x: 0, y: 0 }];
  const b = [{ x: 0, y: 0 }, { x: 1, y: 1 }];
  assert.equal(sameValue(a, b), false);
});

test('sameValue: un obiect vs undefined -> false', () => {
  assert.equal(sameValue({ x: 0, y: 0 }, undefined), false);
  assert.equal(sameValue(undefined, { x: 0, y: 0 }), false);
});

// --- mergeMap pe `plots` ---------------------------------------------------------

test('mergeMap pe plots: aceeași zonă recalculată local (referință nouă, conținut identic) NU e tratată ca schimbare -> câștigă remote', () => {
  // Cazul critic al T-09: fără `sameValue` (adică folosind `===`), acest test
  // ar eșua — orice recalculare locală de layout ar fi considerată mereu
  // "schimbare locală" din cauza referinței noi, chiar dacă zona e identică.
  const base = { 'proiect-a': [{ x: 0, y: 0 }] };
  const localMap = { 'proiect-a': [{ x: 0, y: 0 }] }; // recalculat, altă referință, conținut identic cu base
  const remote = { 'proiect-a': [{ x: 5, y: 5 }] }; // altcineva a mutat zona între timp
  assert.notEqual(base['proiect-a'], localMap['proiect-a'], 'precondiție: referințe diferite');
  const result = mergeMap(base, localMap, remote);
  assert.deepEqual(
    result,
    { 'proiect-a': [{ x: 5, y: 5 }] },
    'trebuie păstrată varianta remote, nu cea locală recalculată identic cu base'
  );
});

test('mergeMap pe plots: zonă chiar schimbată local (conținut diferit) câștigă varianta locală', () => {
  const base = { 'proiect-a': [{ x: 0, y: 0 }] };
  const local = { 'proiect-a': [{ x: 9, y: 9 }] }; // mutată efectiv local
  const remote = { 'proiect-a': [{ x: 5, y: 5 }] }; // altcineva a scris altceva între timp
  const result = mergeMap(base, local, remote);
  assert.deepEqual(result, { 'proiect-a': [{ x: 9, y: 9 }] });
});

// --- mergeState pe plots -----------------------------------------------------------

test('mergeState compune plots corect: proiect adăugat local, proiect șters local, proiect neschimbat (referință nouă) câștigă remote', () => {
  const base = {
    archived: [],
    archivedAt: {},
    plots: {
      'proiect-neschimbat': [{ x: 0, y: 0 }],
      'proiect-sters-local': [{ x: 1, y: 1 }],
    },
  };
  const local = {
    archived: [],
    archivedAt: {},
    plots: {
      'proiect-neschimbat': [{ x: 0, y: 0 }], // recalculat, altă referință, conținut identic
      'proiect-adaugat-local': [{ x: 2, y: 2 }], // nou, nu era în base
      // 'proiect-sters-local' lipsește din local -> a fost șters local
    },
  };
  const remote = {
    archived: [],
    archivedAt: {},
    plots: {
      'proiect-neschimbat': [{ x: 9, y: 9 }], // altcineva l-a mutat între timp
      'proiect-sters-local': [{ x: 1, y: 1 }],
    },
  };
  const result = mergeState(base, local, remote);
  assert.deepEqual(result.plots, {
    'proiect-neschimbat': [{ x: 9, y: 9 }], // neschimbat local (sameValue) -> câștigă remote
    'proiect-adaugat-local': [{ x: 2, y: 2 }], // adăugat local -> se păstrează
    // 'proiect-sters-local' e absent -> a rămas șters, chiar dacă remote îl mai are
  });
  assert.ok(!('proiect-sters-local' in result.plots), 'proiectul șters local nu trebuie să reînvie din remote');
});

// --- regresie: sameValue vs === pentru archivedAt (valori numerice) ----------------

test('mergeMap pe archivedAt: sameValue se comportă identic cu === pentru numere (fără regresie)', () => {
  const base = { s1: 100, s2: 200 };
  const local = { s1: 100, s2: 300 }; // s1 neschimbat, s2 schimbat efectiv
  const remote = { s1: 999, s2: 999 }; // altcineva a scris altceva între timp
  const result = mergeMap(base, local, remote);
  assert.deepEqual(result, { s1: 999, s2: 300 });
});
