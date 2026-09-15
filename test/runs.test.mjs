// Teste pentru runs.js (RF-02c): createRunsStore, direct, fără HTTP.
//
// Tipar ca test/profiles.test.mjs — fiecare test cu propriul store pe
// ':memory:' (schema reală din migrations/002-sesiuni.sql + 001-profiluri.sql,
// doar citite, niciodată modificate), `now` injectat pentru determinism.
// Zero stare împărtășită între teste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createRunsStore } = require('../runs.js');
const { createProfilesStore } = require('../profiles.js');
const { DatabaseSync } = require('node:sqlite');

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

function makeStore(now) {
  return createRunsStore({ dbPath: ':memory:', now: now || (() => 1000) });
}

// Pentru testele care au nevoie de un `agent_profiles` real (FK din `runs`),
// runsStore și profilesStore trebuie să partajeze ACELAȘI fișier pe disc —
// pe ':memory:' fiecare handle SQLite e o bază separată, izolată, iar FK-ul
// nu ar găsi profilul creat de celălalt store.
function makeSharedStores(dir, now) {
  const dbPath = path.join(dir, 'shared.db');
  const profiles = createProfilesStore({ dbPath, now: now || (() => 1000) });
  const runs = createRunsStore({ dbPath, now: now || (() => 1000) });
  return { profiles, runs };
}

// =========================================================================
// 2.1 — observeRun: upsert idempotent
// =========================================================================

test('observeRun: sesiune nouă -> INSERT, id = harness:nativeId, profile_id null, lifecycle unknown implicit, first=last observed', () => {
  const store = makeStore(() => 5000);
  try {
    const run = store.observeRun({ sourceHarness: 'claude-code', nativeId: 'abc-123' });
    assert.equal(run.id, 'claude-code:abc-123');
    assert.equal(run.profile_id, null);
    assert.equal(run.lifecycle, 'unknown');
    assert.equal(run.first_observed_at, 5000);
    assert.equal(run.last_observed_at, 5000);
    assert.equal(run.revision, 1);
  } finally {
    store.close();
  }
});

test('observeRun: lifecycle trimis la prima observare -> stocat ca atare, nu suprascris cu unknown', () => {
  const store = makeStore();
  try {
    const run = store.observeRun({ sourceHarness: 'pi', nativeId: 'r1', lifecycle: 'running' });
    assert.equal(run.lifecycle, 'running');
  } finally {
    store.close();
  }
});

test('observeRun: a doua observare a aceleiași sesiuni -> UPDATE, nu INSERT nou (un singur rând, id neschimbat), revision +1', () => {
  const store = makeStore(() => 1000);
  try {
    const first = store.observeRun({ sourceHarness: 'pi', nativeId: 'r2' });
    const second = store.observeRun({ sourceHarness: 'pi', nativeId: 'r2' });
    assert.equal(second.id, first.id);
    assert.equal(second.revision, 2);
    assert.equal(store.listRuns().length, 1, 'trebuie exact un rând pentru aceeași sesiune nativă');
  } finally {
    store.close();
  }
});

test('observeRun: a doua observare -> first_observed_at neschimbat, last_observed_at actualizat', () => {
  let clock = 1000;
  const store = makeStore(() => clock);
  try {
    const first = store.observeRun({ sourceHarness: 'pi', nativeId: 'r3' });
    clock = 9000;
    const second = store.observeRun({ sourceHarness: 'pi', nativeId: 'r3' });
    assert.equal(second.first_observed_at, first.first_observed_at);
    assert.equal(second.last_observed_at, 9000);
  } finally {
    store.close();
  }
});

test('observeRun: a doua observare FĂRĂ lifecycle -> păstrează lifecycle-ul existent, nu-l resetează la unknown', () => {
  const store = makeStore();
  try {
    store.observeRun({ sourceHarness: 'pi', nativeId: 'r4', lifecycle: 'running' });
    const second = store.observeRun({ sourceHarness: 'pi', nativeId: 'r4' });
    assert.equal(second.lifecycle, 'running');
  } finally {
    store.close();
  }
});

test('observeRun: a doua observare FĂRĂ project -> păstrează project-ul existent', () => {
  const store = makeStore();
  try {
    store.observeRun({ sourceHarness: 'pi', nativeId: 'r5', project: '/home/x' });
    const second = store.observeRun({ sourceHarness: 'pi', nativeId: 'r5' });
    assert.equal(second.project, '/home/x');
  } finally {
    store.close();
  }
});

test('observeRun: a doua observare CU lifecycle nou -> se schimbă', () => {
  const store = makeStore();
  try {
    store.observeRun({ sourceHarness: 'pi', nativeId: 'r6', lifecycle: 'running' });
    const second = store.observeRun({ sourceHarness: 'pi', nativeId: 'r6', lifecycle: 'completed' });
    assert.equal(second.lifecycle, 'completed');
  } finally {
    store.close();
  }
});

test('observeRun: după asociere cu un profil, o nouă observare NU desface asocierea (profile_id neschimbat)', () => {
  const dir = tmpDir('rf02c-runs-assoc-observe');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      const observed = runs.observeRun({ sourceHarness: 'pi', nativeId: 'r7' });
      const associated = runs.associateProfile(observed.id, { profileId: profile.id, expectedRevision: observed.revision });
      assert.equal(associated.profile_id, profile.id);

      const reObserved = runs.observeRun({ sourceHarness: 'pi', nativeId: 'r7', lifecycle: 'running' });
      assert.equal(reObserved.profile_id, profile.id, 'o observare nu poate desface o asociere existentă');
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

for (const [label, patch] of [
  ['sourceHarness lipsă', { sourceHarness: undefined, nativeId: 'x' }],
  ['sourceHarness gol', { sourceHarness: '', nativeId: 'x' }],
  ['nativeId lipsă', { sourceHarness: 'pi', nativeId: undefined }],
  ['nativeId gol', { sourceHarness: 'pi', nativeId: '' }],
]) {
  test(`observeRun: ${label} -> code VALIDATION`, () => {
    const store = makeStore();
    try {
      assert.throws(() => store.observeRun(patch), (e) => e.code === 'VALIDATION');
    } finally {
      store.close();
    }
  });
}

test('observeRun: lifecycle invalid ("bla") -> code VALIDATION', () => {
  const store = makeStore();
  try {
    assert.throws(
      () => store.observeRun({ sourceHarness: 'pi', nativeId: 'x', lifecycle: 'bla' }),
      (e) => e.code === 'VALIDATION'
    );
  } finally {
    store.close();
  }
});

test('observeRun: toate cele 7 valori de lifecycle sunt acceptate', () => {
  const store = makeStore();
  try {
    const values = ['queued', 'running', 'completed', 'failed', 'stopped', 'paused', 'unknown'];
    for (const lifecycle of values) {
      const run = store.observeRun({ sourceHarness: 'harness', nativeId: 'n-' + lifecycle, lifecycle });
      assert.equal(run.lifecycle, lifecycle);
    }
  } finally {
    store.close();
  }
});

test('observeRun: NU aruncă dacă nu primește expectedRevision (spre deosebire de associateProfile)', () => {
  const store = makeStore();
  try {
    assert.doesNotThrow(() => store.observeRun({ sourceHarness: 'pi', nativeId: 'no-cas' }));
  } finally {
    store.close();
  }
});

// =========================================================================
// 2.2 — associateProfile (I24)
// =========================================================================

test('associateProfile: asociere validă -> profile_id setat, revision +1', () => {
  const dir = tmpDir('rf02c-runs-assoc-ok');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'a1' });
      const updated = runs.associateProfile(run.id, { profileId: profile.id, expectedRevision: run.revision });
      assert.equal(updated.profile_id, profile.id);
      assert.equal(updated.revision, run.revision + 1);
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: runId inexistent -> code NOT_FOUND', () => {
  const dir = tmpDir('rf02c-runs-assoc-nf-run');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      assert.throws(
        () => runs.associateProfile('nu-exista:deloc', { profileId: profile.id, expectedRevision: 1 }),
        (e) => e.code === 'NOT_FOUND'
      );
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: profileId inexistent -> code NOT_FOUND', () => {
  const dir = tmpDir('rf02c-runs-assoc-nf-profile');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'a2' });
      assert.throws(
        () => runs.associateProfile(run.id, { profileId: 'nu-exista-profil', expectedRevision: run.revision }),
        (e) => e.code === 'NOT_FOUND'
      );
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

for (const [label, expectedRevision] of [
  ['lipsă', undefined],
  ['non-număr', 'unu'],
  ['non-întreg', 1.5],
  ['zero', 0],
]) {
  test(`associateProfile: expectedRevision ${label} -> code VALIDATION, nimic schimbat`, () => {
    const dir = tmpDir('rf02c-runs-assoc-val');
    try {
      const { profiles, runs } = makeSharedStores(dir);
      try {
        const profile = profiles.createProfile({ name: 'p' });
        const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'a3' });
        assert.throws(
          () => runs.associateProfile(run.id, { profileId: profile.id, expectedRevision }),
          (e) => e.code === 'VALIDATION'
        );
        const after = runs.getRun(run.id);
        assert.equal(after.profile_id, null);
        assert.equal(after.revision, run.revision);
      } finally {
        profiles.close();
        runs.close();
      }
    } finally {
      rmrf(dir);
    }
  });
}

test('associateProfile: expectedRevision nepotrivit -> code CONFLICT cu e.current = run-ul real, nimic schimbat', () => {
  const dir = tmpDir('rf02c-runs-assoc-cas');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'a4' });
      let caught = null;
      try {
        runs.associateProfile(run.id, { profileId: profile.id, expectedRevision: run.revision + 5 });
      } catch (e) {
        caught = e;
      }
      assert.ok(caught);
      assert.equal(caught.code, 'CONFLICT');
      assert.ok(caught.current);
      assert.equal(caught.current.id, run.id);
      assert.equal(caught.current.profile_id, null, 'nimic nu trebuie schimbat din cauza conflictului de revizie');
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: I24 — profilul are deja alt run activ (running) -> CONFLICT, activeRuns conține run-ul care blochează', () => {
  const dir = tmpDir('rf02c-runs-i24-single');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      const runA = runs.observeRun({ sourceHarness: 'pi', nativeId: 'busy', lifecycle: 'running' });
      runs.associateProfile(runA.id, { profileId: profile.id, expectedRevision: runA.revision });

      const runB = runs.observeRun({ sourceHarness: 'pi', nativeId: 'newcomer' });
      let caught = null;
      try {
        runs.associateProfile(runB.id, { profileId: profile.id, expectedRevision: runB.revision });
      } catch (e) {
        caught = e;
      }
      assert.ok(caught);
      assert.equal(caught.code, 'CONFLICT');
      assert.ok(Array.isArray(caught.activeRuns));
      assert.equal(caught.activeRuns.length, 1);
      assert.equal(caught.activeRuns[0].id, runs.getRun(runA.id).id);

      const after = runs.getRun(runB.id);
      assert.equal(after.profile_id, null, 'asocierea trebuia refuzată, nu forțată');
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: I24 — profilul are 2+ run-uri active preexistente (date inconsistente) -> activeRuns le conține pe TOATE, nu doar primul', () => {
  const dir = tmpDir('rf02c-runs-i24-multi');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      // Pe calea normală, a doua asociere activă ar fi blocată de I24 —
      // starea "2+ run-uri active pe același profil" e prin definiție
      // inconsistentă și posibilă doar dacă cineva a scris direct în bază
      // (brief-ul o numește explicit: "posibilă dacă cineva a manipulat
      // direct baza"). O simulăm: asociem două run-uri cât timp sunt
      // NON-active ('completed', deci I24 nu se declanșează), apoi le
      // promovăm direct prin SQL la 'running', ocolind associateProfile.
      const runA = runs.observeRun({ sourceHarness: 'pi', nativeId: 'multiA', lifecycle: 'completed' });
      runs.associateProfile(runA.id, { profileId: profile.id, expectedRevision: runA.revision });
      const runB = runs.observeRun({ sourceHarness: 'pi', nativeId: 'multiB', lifecycle: 'completed' });
      runs.associateProfile(runB.id, { profileId: profile.id, expectedRevision: runB.revision });

      const raw = new DatabaseSync(path.join(dir, 'shared.db'));
      try {
        raw.prepare("UPDATE runs SET lifecycle = 'running' WHERE id IN (?, ?)").run(runA.id, runB.id);
      } finally {
        raw.close();
      }

      const runC = runs.observeRun({ sourceHarness: 'pi', nativeId: 'multiC' });
      let caught = null;
      try {
        runs.associateProfile(runC.id, { profileId: profile.id, expectedRevision: runC.revision });
      } catch (e) {
        caught = e;
      }
      assert.ok(caught, 'a treia asociere trebuia refuzată — profilul are deja 2 run-uri active');
      assert.equal(caught.code, 'CONFLICT');
      assert.ok(Array.isArray(caught.activeRuns));
      assert.equal(caught.activeRuns.length, 2, 'trebuie să le raporteze pe AMÂNDOUĂ, nu doar prima găsită');
      const ids = caught.activeRuns.map((r) => r.id).sort();
      assert.deepEqual(ids, [runA.id, runB.id].sort());
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: profilul are un run cu lifecycle "completed" -> NU blochează, asocierea reușește', () => {
  const dir = tmpDir('rf02c-runs-nonactive');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      const runA = runs.observeRun({ sourceHarness: 'pi', nativeId: 'done', lifecycle: 'queued' });
      runs.associateProfile(runA.id, { profileId: profile.id, expectedRevision: runA.revision });
      // trecem runA la completed prin observeRun (nu verifică I24)
      runs.observeRun({ sourceHarness: 'pi', nativeId: 'done', lifecycle: 'completed' });

      const runB = runs.observeRun({ sourceHarness: 'pi', nativeId: 'newone' });
      const updated = runs.associateProfile(runB.id, { profileId: profile.id, expectedRevision: runB.revision });
      assert.equal(updated.profile_id, profile.id, 'un run completed nu trebuie să blocheze o asociere nouă');
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: re-asociere de la profilul A la profilul B liber -> reușește', () => {
  const dir = tmpDir('rf02c-runs-reassoc');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profileA = profiles.createProfile({ name: 'A' });
      const profileB = profiles.createProfile({ name: 'B' });
      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'movable' });
      const withA = runs.associateProfile(run.id, { profileId: profileA.id, expectedRevision: run.revision });
      assert.equal(withA.profile_id, profileA.id);

      const withB = runs.associateProfile(run.id, { profileId: profileB.id, expectedRevision: withA.revision });
      assert.equal(withB.profile_id, profileB.id, 're-asocierea la un profil liber trebuie să reușească');
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: re-asociere la profilul B blocat de alt run activ -> CONFLICT, run-ul rămâne pe profilul A', () => {
  const dir = tmpDir('rf02c-runs-reassoc-blocked');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profileA = profiles.createProfile({ name: 'A' });
      const profileB = profiles.createProfile({ name: 'B' });
      const runOnB = runs.observeRun({ sourceHarness: 'pi', nativeId: 'occupant', lifecycle: 'running' });
      runs.associateProfile(runOnB.id, { profileId: profileB.id, expectedRevision: runOnB.revision });

      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'mover' });
      const withA = runs.associateProfile(run.id, { profileId: profileA.id, expectedRevision: run.revision });

      let caught = null;
      try {
        runs.associateProfile(run.id, { profileId: profileB.id, expectedRevision: withA.revision });
      } catch (e) {
        caught = e;
      }
      assert.ok(caught);
      assert.equal(caught.code, 'CONFLICT');
      const after = runs.getRun(run.id);
      assert.equal(after.profile_id, profileA.id, 'run-ul trebuie să rămână pe profilul A, refuzul nu forțează nimic');
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: asociere la ACELAȘI profil pe care-l are deja, cu expectedRevision corect -> reușește, revizia crește', () => {
  const dir = tmpDir('rf02c-runs-same-profile');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'same' });
      const first = runs.associateProfile(run.id, { profileId: profile.id, expectedRevision: run.revision });
      const second = runs.associateProfile(run.id, { profileId: profile.id, expectedRevision: first.revision });
      assert.equal(second.profile_id, profile.id);
      assert.equal(second.revision, first.revision + 1);
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('associateProfile: cazul de graniță I24 — runId e deja activ pe profilul X, re-asociat tot la X -> filtrul "id != runId" îl exclude, NU se blochează singur', () => {
  const dir = tmpDir('rf02c-runs-self-exclude');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'selfy', lifecycle: 'running' });
      const first = runs.associateProfile(run.id, { profileId: profile.id, expectedRevision: run.revision });
      assert.equal(first.profile_id, profile.id);

      // re-asociere la ACELAȘI profil, fără schimbare reală de stare —
      // run-ul e el însuși activ pe X; dacă filtrul "id != runId" ar lipsi,
      // s-ar bloca singur cu CONFLICT.
      const second = runs.associateProfile(run.id, { profileId: profile.id, expectedRevision: first.revision });
      assert.equal(second.profile_id, profile.id, 'un run activ nu trebuie să se blocheze pe sine însuși la re-asociere');
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

// =========================================================================
// 2.3 — dissociateProfile
// =========================================================================

test('dissociateProfile: run asociat -> profile_id null, revision +1', () => {
  const dir = tmpDir('rf02c-runs-dissoc-ok');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'd1' });
      const associated = runs.associateProfile(run.id, { profileId: profile.id, expectedRevision: run.revision });
      const dissociated = runs.dissociateProfile(run.id, { expectedRevision: associated.revision });
      assert.equal(dissociated.profile_id, null);
      assert.equal(dissociated.revision, associated.revision + 1);
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('dissociateProfile: runId inexistent -> code NOT_FOUND', () => {
  const store = makeStore();
  try {
    assert.throws(
      () => store.dissociateProfile('nu-exista:deloc', { expectedRevision: 1 }),
      (e) => e.code === 'NOT_FOUND'
    );
  } finally {
    store.close();
  }
});

test('dissociateProfile: expectedRevision greșit -> code CONFLICT', () => {
  const store = makeStore();
  try {
    const run = store.observeRun({ sourceHarness: 'pi', nativeId: 'd2' });
    assert.throws(
      () => store.dissociateProfile(run.id, { expectedRevision: run.revision + 9 }),
      (e) => e.code === 'CONFLICT'
    );
  } finally {
    store.close();
  }
});

// =========================================================================
// 2.4 — Citirile
// =========================================================================

test('getRun: id inexistent -> null, nu aruncă', () => {
  const store = makeStore();
  try {
    assert.equal(store.getRun('nu-exista:nimic'), null);
  } finally {
    store.close();
  }
});

test('listRuns: toate, ordine stabilă (created_at ASC, id ASC)', () => {
  let clock = 1000;
  const store = makeStore(() => clock);
  try {
    clock = 1000;
    const r1 = store.observeRun({ sourceHarness: 'pi', nativeId: 'l1' });
    clock = 2000;
    const r2 = store.observeRun({ sourceHarness: 'pi', nativeId: 'l2' });
    clock = 3000;
    const r3 = store.observeRun({ sourceHarness: 'pi', nativeId: 'l3' });
    const list = store.listRuns();
    assert.deepEqual(list.map((r) => r.id), [r1.id, r2.id, r3.id]);
  } finally {
    store.close();
  }
});

test('listRunsForProfile: doar cele asociate profilului dat, gol dacă niciunul', () => {
  const dir = tmpDir('rf02c-runs-list-profile');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profileA = profiles.createProfile({ name: 'A' });
      const profileB = profiles.createProfile({ name: 'B' });
      const run1 = runs.observeRun({ sourceHarness: 'pi', nativeId: 'lp1' });
      runs.observeRun({ sourceHarness: 'pi', nativeId: 'lp2' }); // rămâne neasociat
      runs.associateProfile(run1.id, { profileId: profileA.id, expectedRevision: run1.revision });

      const listA = runs.listRunsForProfile(profileA.id);
      assert.equal(listA.length, 1);
      assert.equal(listA[0].id, run1.id);

      const listB = runs.listRunsForProfile(profileB.id);
      assert.deepEqual(listB, []);
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

test('getActiveRunsForProfile: doar queued/running/paused, exclude completed/failed/stopped/unknown', () => {
  const dir = tmpDir('rf02c-runs-active');
  try {
    const { profiles, runs } = makeSharedStores(dir);
    try {
      const profile = profiles.createProfile({ name: 'p' });
      // Asociem run-ul cât timp e non-activ ('unknown', implicit), apoi îl
      // mutăm prin observeRun (care NU verifică I24) prin fiecare lifecycle,
      // verificând de fiecare dată dacă getActiveRunsForProfile îl vede.
      const run = runs.observeRun({ sourceHarness: 'pi', nativeId: 'ax' });
      runs.associateProfile(run.id, { profileId: profile.id, expectedRevision: run.revision });

      const expectations = [
        ['queued', true],
        ['running', true],
        ['paused', true],
        ['completed', false],
        ['failed', false],
        ['stopped', false],
        ['unknown', false],
      ];
      for (const [lifecycle, shouldBeActive] of expectations) {
        runs.observeRun({ sourceHarness: 'pi', nativeId: 'ax', lifecycle });
        const active = runs.getActiveRunsForProfile(profile.id);
        if (shouldBeActive) {
          assert.equal(active.length, 1, `lifecycle ${lifecycle} trebuie considerat activ`);
          assert.equal(active[0].id, run.id);
        } else {
          assert.deepEqual(active, [], `lifecycle ${lifecycle} NU trebuie considerat activ`);
        }
      }
    } finally {
      profiles.close();
      runs.close();
    }
  } finally {
    rmrf(dir);
  }
});

// =========================================================================
// Deschiderea lazy
// =========================================================================

test('createRunsStore(...) singur, fără niciun apel, NU creează fișierul bazei pe disc', () => {
  const dir = tmpDir('rf02c-runs-lazy');
  const dbPath = path.join(dir, 'nu-exista-inca', 'rpgfactory.db');
  const store = createRunsStore({ dbPath, migrationsDir: undefined });
  try {
    assert.ok(!fs.existsSync(dbPath), 'construcția store-ului nu trebuie să atingă discul');
    store.observeRun({ sourceHarness: 'pi', nativeId: 'prima-atingere' });
    assert.ok(fs.existsSync(dbPath), 'după prima operație reală, fișierul bazei trebuie să existe');
  } finally {
    store.close();
    rmrf(dir);
  }
});
