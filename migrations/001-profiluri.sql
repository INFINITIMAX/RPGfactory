-- 001-profiluri.sql — profiluri de agenți, configurații versionate și
-- istoricul lor. RF-02a: doar aceste trei tabele. Restul entităților din
-- spec.md §3 (Run, Task, ObservationEvent, UsageSample/Aggregate, Alert,
-- Layout, competențe/niveluri) vin în migrații ulterioare, prin loturile lor.

-- agent_profiles — identitatea permanentă a unui specialist (I23, I38).
-- `id` e generat de aplicație (ex. UUID), NU derivat din PID/nume/sesiune —
-- un profil supraviețuiește sesiunilor care lucrează sub el. `name` e o
-- etichetă editabilă (I27), nu cheie de identitate: redenumirea nu rupe
-- legătura cu istoricul sau cu configuration_versions/profile_history.
CREATE TABLE agent_profiles (
  -- NOT NULL explicit: `TEXT PRIMARY KEY` (spre deosebire de
  -- `INTEGER PRIMARY KEY`) acceptă NULL în SQLite, iar cheia primară nu
  -- impune unicitatea între valorile NULL — ar putea intra oricâte profiluri
  -- fără identitate. Fără id, un profil nu poate fi referit sau deosebit de
  -- altul.
  id                     TEXT PRIMARY KEY NOT NULL,
  name                   TEXT NOT NULL,
  primary_specialization TEXT NOT NULL DEFAULT '',
  -- I26: planner-ul propune, Lucian aprobă — un profil nou pornește
  -- `proposed` și devine `approved` doar printr-o acțiune explicită.
  approval_state         TEXT NOT NULL DEFAULT 'proposed'
                           CHECK (approval_state IN ('proposed', 'approved')),
  -- I27: retragerea din repartizări viitoare e distinctă de oprirea muncii
  -- curente — acest flag nu oprește nimic în desfășurare, doar filtrează
  -- taskurile noi.
  assignable             INTEGER NOT NULL DEFAULT 0 CHECK (assignable IN (0, 1)),
  last_project           TEXT,
  last_post              TEXT,
  created_at             INTEGER NOT NULL,
  updated_at             INTEGER NOT NULL,
  -- Contor monoton pentru scrieri concurente (aceeași lecție ca D7 din
  -- RF-01) — niciodată `Date.now()`. Scrierile viitoare fac
  -- `UPDATE ... SET revision = revision + 1 WHERE id = ? AND revision = ?`
  -- ca verificare optimistă, în aceeași instrucțiune, sub tranzacție.
  revision               INTEGER NOT NULL DEFAULT 1
);

-- configuration_versions — I39: schimbarea modelului/harness-ului păstrează
-- identitatea profilului, dar versionează configurația; nu se suprascrie o
-- versiune existentă, se creează una nouă și taskurile istorice rămân legate
-- de versiunea sub care au fost executate.
--
-- INTERDICȚIE ABSOLUTĂ: aici NU se stochează secrete, conținut de `.env`,
-- tokenuri de autentificare, configurații globale integrale sau prompturi
-- brute. Numai referințe și digesturi către instrucțiuni/skill-uri/memorie.
CREATE TABLE configuration_versions (
  -- NOT NULL explicit: `TEXT PRIMARY KEY` acceptă NULL în SQLite, iar cheia
  -- primară nu impune unicitatea între valorile NULL — ar putea intra
  -- oricâte configurații fără identitate.
  id                 TEXT PRIMARY KEY NOT NULL,
  profile_id         TEXT NOT NULL REFERENCES agent_profiles(id),
  harness            TEXT NOT NULL,
  provider           TEXT NOT NULL,
  model              TEXT NOT NULL,
  instructions_ref   TEXT,
  skills_ref         TEXT,
  memory_ref         TEXT,
  created_at         INTEGER NOT NULL
);

CREATE INDEX idx_configuration_versions_profile_id
  ON configuration_versions(profile_id);

-- profile_history — I27/I35: evoluția unui profil trebuie să se poată vedea
-- (redenumiri, schimbări de specializare/eligibilitate/aprobare/configurație
-- curentă), iar AGENTS.md cere ca dovezile vechi să nu fie rescrise — de
-- aceea e un jurnal de tip append-only, nu o coloană suprascrisă pe profil.
CREATE TABLE profile_history (
  id         INTEGER PRIMARY KEY AUTOINCREMENT,
  profile_id TEXT NOT NULL REFERENCES agent_profiles(id),
  changed_at INTEGER NOT NULL,
  field      TEXT NOT NULL,
  old_value  TEXT,
  new_value  TEXT
);

CREATE INDEX idx_profile_history_profile_id
  ON profile_history(profile_id);
