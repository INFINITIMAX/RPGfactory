// Teste pentru profiles.js (RF-02b): createProfilesStore, direct, fără HTTP.
//
// Tipar ca test/db.test.mjs — fiecare test își face propriul director/fișier
// temporar sau ':memory:' cu migrationsDir implicit (schema reală din
// migrations/001-profiluri.sql, doar citită, niciodată modificată), `now`
// injectat pentru determinism. Zero stare împărtășită între teste.

import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import os from 'node:os';
import path from 'node:path';
import { createRequire } from 'node:module';

const require = createRequire(import.meta.url);
const { createProfilesStore } = require('../profiles.js');

const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function tmpDir(prefix) {
  return fs.mkdtempSync(path.join(os.tmpdir(), prefix + '-'));
}

function rmrf(p) {
  fs.rmSync(p, { recursive: true, force: true });
}

// Store pe :memory:, schema reală (migrationsDir implicit al db.js), ceas
// injectat. `close()` întors alături de store pentru curățare simetrică cu
// test/db.test.mjs.
function makeStore(now) {
  const store = createProfilesStore({ dbPath: ':memory:', now: now || (() => 1000) });
  return store;
}

// =========================================================================
// 2.1 — createProfile
// =========================================================================

test('createProfile: nume valid -> profil complet cu id UUID plauzibil, approval_state proposed, assignable 0, revision 1', () => {
  const store = makeStore(() => 5000);
  try {
    const profile = store.createProfile({ name: 'Profil test' });
    assert.match(profile.id, UUID_RE, 'id trebuie să fie un UUID plauzibil');
    assert.equal(profile.name, 'Profil test');
    assert.equal(profile.approval_state, 'proposed');
    assert.equal(profile.assignable, 0);
    assert.equal(profile.revision, 1);
    assert.equal(profile.created_at, 5000);
    assert.equal(profile.updated_at, 5000);
  } finally {
    store.close();
  }
});

for (const [label, name] of [
  ['lipsă', undefined],
  ['gol', ''],
  ['doar spații', '   '],
]) {
  test(`createProfile: name ${label} -> code VALIDATION`, () => {
    const store = makeStore();
    try {
      assert.throws(
        () => store.createProfile({ name }),
        (e) => e.code === 'VALIDATION',
        `name ${label} trebuia respins cu code VALIDATION`
      );
    } finally {
      store.close();
    }
  });
}

test('createProfile: scrie un rând profile_history la creație (field=created, old_value=null, new_value=nume), verificat direct din bază', () => {
  const store = makeStore(() => 7000);
  try {
    const profile = store.createProfile({ name: 'Cine sunt eu' });
    const history = store.getProfileHistory(profile.id);
    assert.equal(history.length, 1, 'trebuie exact un rând de istoric la creație');
    assert.equal(history[0].field, 'created');
    assert.equal(history[0].old_value, null);
    assert.equal(history[0].new_value, 'Cine sunt eu');
    assert.equal(history[0].changed_at, 7000);
  } finally {
    store.close();
  }
});

test('createProfile: două profiluri create succesiv au id diferite (UUID generat, nu un contor)', () => {
  const store = makeStore();
  try {
    const p1 = store.createProfile({ name: 'unu' });
    const p2 = store.createProfile({ name: 'doi' });
    assert.notEqual(p1.id, p2.id);
    assert.match(p1.id, UUID_RE);
    assert.match(p2.id, UUID_RE);
  } finally {
    store.close();
  }
});

// =========================================================================
// 2.2 — updateProfile
// =========================================================================

test('updateProfile: update valid (expectedRevision corect, un câmp) -> revision +1 exact, câmpul se schimbă, updated_at = now() injectat', () => {
  let clock = 1000;
  const store = makeStore(() => clock);
  try {
    const created = store.createProfile({ name: 'inițial' });
    clock = 2000;
    const updated = store.updateProfile(created.id, {
      expectedRevision: 1,
      changes: { name: 'schimbat' },
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.name, 'schimbat');
    assert.equal(updated.updated_at, 2000);
  } finally {
    store.close();
  }
});

for (const [label, expectedRevision] of [
  ['lipsă', undefined],
  ['non-număr', 'unu'],
  ['non-întreg', 1.5],
  ['zero', 0],
  ['negativ', -1],
]) {
  test(`updateProfile: expectedRevision ${label} -> code VALIDATION, nimic nu se schimbă în bază`, () => {
    const store = makeStore();
    try {
      const created = store.createProfile({ name: 'neatins' });
      assert.throws(
        () => store.updateProfile(created.id, { expectedRevision, changes: { name: 'nu ar trebui' } }),
        (e) => e.code === 'VALIDATION'
      );
      const after = store.getProfile(created.id);
      assert.equal(after.revision, 1, 'revision nu trebuie să se schimbe');
      assert.equal(after.name, 'neatins', 'name nu trebuie să se schimbe');
      const history = store.getProfileHistory(created.id);
      assert.equal(history.length, 1, 'niciun rând nou de istoric (doar cel de la creație)');
    } finally {
      store.close();
    }
  });
}

test('updateProfile: expectedRevision nepotrivit -> code CONFLICT cu e.current = profilul real, nimic nu se schimbă', () => {
  const store = makeStore(() => 3000);
  try {
    const created = store.createProfile({ name: 'v1' });
    store.updateProfile(created.id, { expectedRevision: 1, changes: { name: 'v2' } }); // acum revision=2

    let caught = null;
    try {
      store.updateProfile(created.id, { expectedRevision: 1, changes: { name: 'v3-nu-ar-trebui' } });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'trebuia să arunce');
    assert.equal(caught.code, 'CONFLICT');
    assert.ok(caught.current, 'e.current trebuie să fie prezent');
    assert.equal(caught.current.revision, 2);
    assert.equal(caught.current.name, 'v2');

    const after = store.getProfile(created.id);
    assert.equal(after.revision, 2, 'revision nu trebuie să avanseze din cauza conflictului');
    assert.equal(after.name, 'v2', 'name nu trebuie să se schimbe din cauza conflictului');
  } finally {
    store.close();
  }
});

test('updateProfile: id inexistent -> code NOT_FOUND, NU CONFLICT', () => {
  const store = makeStore();
  try {
    assert.throws(
      () => store.updateProfile('nu-exista-deloc', { expectedRevision: 1, changes: { name: 'x' } }),
      (e) => e.code === 'NOT_FOUND',
      'id inexistent trebuie să dea NOT_FOUND, nu CONFLICT'
    );
  } finally {
    store.close();
  }
});

test('updateProfile: changes gol ({}) -> code VALIDATION', () => {
  const store = makeStore();
  try {
    const created = store.createProfile({ name: 'x' });
    assert.throws(
      () => store.updateProfile(created.id, { expectedRevision: 1, changes: {} }),
      (e) => e.code === 'VALIDATION'
    );
  } finally {
    store.close();
  }
});

for (const badChanges of [{ id: 'altceva' }, { revision: 99 }, { created_at: 0 }]) {
  test(`updateProfile: changes cu cheie necunoscută (${Object.keys(badChanges)[0]}) -> code VALIDATION, respinsă înainte de bază`, () => {
    const store = makeStore();
    try {
      const created = store.createProfile({ name: 'x' });
      assert.throws(
        () => store.updateProfile(created.id, { expectedRevision: 1, changes: badChanges }),
        (e) => e.code === 'VALIDATION'
      );
      const after = store.getProfile(created.id);
      assert.equal(after.revision, 1, 'nimic nu trebuie să fi atins baza');
    } finally {
      store.close();
    }
  });
}

test('updateProfile: approval_state altceva decât proposed/approved -> code VALIDATION', () => {
  const store = makeStore();
  try {
    const created = store.createProfile({ name: 'x' });
    assert.throws(
      () => store.updateProfile(created.id, { expectedRevision: 1, changes: { approval_state: 'rejected' } }),
      (e) => e.code === 'VALIDATION'
    );
  } finally {
    store.close();
  }
});

test('updateProfile: assignable true/false normalizat corect la 1/0 în bază (tip SQLite, nu doar valoare)', () => {
  const store = makeStore();
  try {
    const created = store.createProfile({ name: 'x' });
    const afterTrue = store.updateProfile(created.id, { expectedRevision: 1, changes: { assignable: true } });
    assert.equal(afterTrue.assignable, 1);
    assert.equal(typeof afterTrue.assignable, 'number', 'assignable trebuie stocat ca număr SQLite, nu boolean/text');

    const afterFalse = store.updateProfile(created.id, { expectedRevision: 2, changes: { assignable: false } });
    assert.equal(afterFalse.assignable, 0);
    assert.equal(typeof afterFalse.assignable, 'number');
  } finally {
    store.close();
  }
});

for (const bad of [2, 'da']) {
  test(`updateProfile: assignable = ${JSON.stringify(bad)} -> code VALIDATION`, () => {
    const store = makeStore();
    try {
      const created = store.createProfile({ name: 'x' });
      assert.throws(
        () => store.updateProfile(created.id, { expectedRevision: 1, changes: { assignable: bad } }),
        (e) => e.code === 'VALIDATION'
      );
    } finally {
      store.close();
    }
  });
}

test('updateProfile: mai multe câmpuri deodată -> revision +1 exact (nu 2), exact 2 rânduri noi în profile_history', () => {
  const store = makeStore(() => 9000);
  try {
    const created = store.createProfile({ name: 'x' });
    const updated = store.updateProfile(created.id, {
      expectedRevision: 1,
      changes: { approval_state: 'approved', assignable: 1 },
    });
    assert.equal(updated.revision, 2, 'revision trebuie să crească cu exact 1, indiferent de câte câmpuri s-au schimbat');
    assert.equal(updated.approval_state, 'approved');
    assert.equal(updated.assignable, 1);

    const history = store.getProfileHistory(created.id);
    // 1 rând de la creație + 2 rânduri noi (approval_state, assignable)
    assert.equal(history.length, 3);
    const newRows = history.filter((h) => h.field !== 'created');
    assert.equal(newRows.length, 2);
    const byField = Object.fromEntries(newRows.map((h) => [h.field, h]));
    assert.equal(byField.approval_state.old_value, 'proposed');
    assert.equal(byField.approval_state.new_value, 'approved');
    assert.equal(byField.assignable.old_value, '0');
    assert.equal(byField.assignable.new_value, '1');
  } finally {
    store.close();
  }
});

test('updateProfile: câmp trimis cu aceeași valoare ca cea curentă -> revision tot crește, dar NU se scrie rând de istoric pentru el (comportament documentat de coder)', () => {
  const store = makeStore();
  try {
    const created = store.createProfile({ name: 'neschimbat' });
    const updated = store.updateProfile(created.id, {
      expectedRevision: 1,
      changes: { name: 'neschimbat' }, // exact aceeași valoare
    });
    assert.equal(updated.revision, 2, 'revizia crește oricum — apelul a fost onorat ca atare');
    const history = store.getProfileHistory(created.id);
    assert.equal(history.length, 1, 'nu trebuie să apară un rând nou de istoric pentru o valoare identică');
  } finally {
    store.close();
  }
});

test('updateProfile: last_project/last_post cu null explicit -> acceptat', () => {
  const store = makeStore();
  try {
    const created = store.createProfile({ name: 'x' });
    const updated = store.updateProfile(created.id, {
      expectedRevision: 1,
      changes: { last_project: null, last_post: null },
    });
    assert.equal(updated.revision, 2);
    assert.equal(updated.last_project, null);
    assert.equal(updated.last_post, null);
  } finally {
    store.close();
  }
});

// =========================================================================
// 2.3 — createConfigurationVersion
// =========================================================================

test('createConfigurationVersion: date valide -> configurație completă cu id generat, created_at = now()', () => {
  const store = makeStore(() => 42000);
  try {
    const profile = store.createProfile({ name: 'gazdă' });
    const config = store.createConfigurationVersion(profile.id, {
      harness: 'claude-code',
      provider: 'anthropic',
      model: 'sonnet',
    });
    assert.match(config.id, UUID_RE);
    assert.equal(config.profile_id, profile.id);
    assert.equal(config.created_at, 42000);
    assert.equal(config.harness, 'claude-code');
  } finally {
    store.close();
  }
});

test('createConfigurationVersion: profileId inexistent -> code NOT_FOUND, NU eroare SQLite brută scăpată neprinsă', () => {
  const store = makeStore();
  try {
    let caught = null;
    try {
      store.createConfigurationVersion('nu-exista-profil', {
        harness: 'claude-code',
        provider: 'anthropic',
        model: 'sonnet',
      });
    } catch (e) {
      caught = e;
    }
    assert.ok(caught, 'trebuia să arunce ceva');
    assert.equal(caught.code, 'NOT_FOUND', 'FOREIGN KEY constraint failed (node:sqlite, Node 24.19.0) trebuie tradusă în NOT_FOUND, nu lăsată brută');
  } finally {
    store.close();
  }
});

for (const [label, patch] of [
  ['harness lipsă', { harness: undefined }],
  ['harness gol', { harness: '' }],
  ['provider lipsă', { provider: undefined }],
  ['provider gol', { provider: '' }],
  ['model lipsă', { model: undefined }],
  ['model gol', { model: '' }],
]) {
  test(`createConfigurationVersion: ${label} -> code VALIDATION`, () => {
    const store = makeStore();
    try {
      const profile = store.createProfile({ name: 'gazdă' });
      const base = { harness: 'claude-code', provider: 'anthropic', model: 'sonnet', ...patch };
      assert.throws(
        () => store.createConfigurationVersion(profile.id, base),
        (e) => e.code === 'VALIDATION'
      );
    } finally {
      store.close();
    }
  });
}

test('createConfigurationVersion: instructionsRef/skillsRef/memoryRef lipsă -> acceptate, stocate null', () => {
  const store = makeStore();
  try {
    const profile = store.createProfile({ name: 'gazdă' });
    const config = store.createConfigurationVersion(profile.id, {
      harness: 'claude-code',
      provider: 'anthropic',
      model: 'sonnet',
    });
    assert.equal(config.instructions_ref, null);
    assert.equal(config.skills_ref, null);
    assert.equal(config.memory_ref, null);
  } finally {
    store.close();
  }
});

test('createConfigurationVersion: NU scrie nimic în profile_history', () => {
  const store = makeStore();
  try {
    const profile = store.createProfile({ name: 'gazdă' });
    const historyBefore = store.getProfileHistory(profile.id).length;
    store.createConfigurationVersion(profile.id, { harness: 'claude-code', provider: 'anthropic', model: 'sonnet' });
    const historyAfter = store.getProfileHistory(profile.id).length;
    assert.equal(historyAfter, historyBefore, 'crearea unei configurații nu trebuie să adauge rânduri în profile_history');
  } finally {
    store.close();
  }
});

test('modulul nu expune updateConfigurationVersion', () => {
  const store = makeStore();
  try {
    assert.equal(store.updateConfigurationVersion, undefined);
  } finally {
    store.close();
  }
});

// =========================================================================
// 2.4 — Citirile
// =========================================================================

test('getProfile: id inexistent -> null, nu aruncă', () => {
  const store = makeStore();
  try {
    assert.equal(store.getProfile('nu-exista'), null);
  } finally {
    store.close();
  }
});

test('listProfiles: ordine stabilă (created_at ASC, id ASC), include orice approval_state/assignable', () => {
  let clock = 1000;
  const store = makeStore(() => clock);
  try {
    clock = 1000;
    const p1 = store.createProfile({ name: 'primul' });
    clock = 2000;
    const p2 = store.createProfile({ name: 'al doilea' });
    clock = 3000;
    const p3 = store.createProfile({ name: 'al treilea' });

    store.updateProfile(p2.id, { expectedRevision: 1, changes: { approval_state: 'approved', assignable: 1 } });

    const list = store.listProfiles();
    assert.equal(list.length, 3);
    assert.deepEqual(list.map((p) => p.id), [p1.id, p2.id, p3.id], 'ordinea trebuie să fie după created_at, apoi id');
    const p2InList = list.find((p) => p.id === p2.id);
    assert.equal(p2InList.approval_state, 'approved');
    assert.equal(p2InList.assignable, 1);
  } finally {
    store.close();
  }
});

test('getProfileHistory pe profil fără istoric suplimentar -> conține doar rândul de creație, niciodată nu aruncă', () => {
  const store = makeStore();
  try {
    const profile = store.createProfile({ name: 'x' });
    assert.doesNotThrow(() => store.getProfileHistory(profile.id));
    assert.equal(store.getProfileHistory(profile.id).length, 1);
  } finally {
    store.close();
  }
});

test('getProfileHistory pe id complet inexistent -> array gol, nu aruncă', () => {
  const store = makeStore();
  try {
    assert.deepEqual(store.getProfileHistory('nu-exista-deloc'), []);
  } finally {
    store.close();
  }
});

test('listConfigurationVersions pe profil fără configurații -> array gol, nu aruncă', () => {
  const store = makeStore();
  try {
    const profile = store.createProfile({ name: 'x' });
    assert.deepEqual(store.listConfigurationVersions(profile.id), []);
  } finally {
    store.close();
  }
});

// =========================================================================
// Deschiderea lazy — dedicat, pe disc real (nu :memory:, ca să fie
// observabilă prezența fișierului)
// =========================================================================

test('createProfilesStore(...) singur, fără niciun apel, NU creează fișierul bazei pe disc', () => {
  const dir = tmpDir('rf02b-profiles-lazy');
  const dbPath = path.join(dir, 'nu-exista-inca', 'rpgfactory.db');
  const store = createProfilesStore({ dbPath, migrationsDir: undefined });
  try {
    assert.ok(!fs.existsSync(dbPath), 'construcția store-ului nu trebuie să atingă discul');
    assert.ok(!fs.existsSync(path.dirname(dbPath)), 'nici directorul părinte nu trebuie creat înainte de prima cerere reală');

    // prima cerere reală chiar deschide baza (dovadă că lipsa fișierului de
    // mai sus nu era un accident, ci o consecință a lazy-ului real).
    store.createProfile({ name: 'prima atingere' });
    assert.ok(fs.existsSync(dbPath), 'după prima operație reală, fișierul bazei trebuie să existe');
  } finally {
    store.close();
    rmrf(dir);
  }
});
