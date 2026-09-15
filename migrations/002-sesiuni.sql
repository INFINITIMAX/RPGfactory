-- 002-sesiuni.sql — RF-02c: entitatea Run (spec.md §3), o sesiune observată
-- dintr-un harness oarecare, cu identitate nativă a ei, opțional legată de
-- un profil (agent_profiles, RF-02a), cu propria stare de lifecycle
-- (spec.md §4, DOAR axa de execuție — activitate/atenție/prospețime sunt
-- alte axe, alte loturi). Relația de delegare dovedită, referința de
-- deschidere și corelarea de proces din spec.md §3 NU sunt aici — vin în
-- RF-03, ca să nu rămână coloane nefolosite.

-- runs — sesiuni observate. Niciun adaptor real nu scrie încă aici (RF-03);
-- acest lot construiește doar mecanismul, alimentat cu date sintetice.
CREATE TABLE runs (
  -- `id` e RunId namespaced (spec.md §3): `${source_harness}:${native_id}`,
  -- NU un UUID separat — identitatea nativă + harness-ul sunt deja unice
  -- împreună, un id generat aparte ar fi doar o indirecție redundantă.
  -- NOT NULL explicit: `TEXT PRIMARY KEY` acceptă NULL în SQLite, iar cheia
  -- primară nu impune unicitatea între valorile NULL (aceeași lecție ca la
  -- `agent_profiles`, RF-02a) — fără id, un run nu poate fi referit sau
  -- deosebit de altul.
  id                 TEXT PRIMARY KEY NOT NULL,
  source_harness     TEXT NOT NULL,
  native_id          TEXT NOT NULL,
  -- I38: fără ID explicit, sesiunea rămâne neasociată — nu se ghicește din
  -- nume/model/cwd. Nullable: o sesiune poate exista fără profil.
  profile_id         TEXT REFERENCES agent_profiles(id),
  -- cwd/worktree, dacă e cunoscut — nu întotdeauna disponibil la observare.
  project            TEXT,
  -- Axa de lifecycle din spec.md §4 — nu amestecăm aici cu activitate,
  -- atenție sau prospețime (alte axe, alte loturi).
  lifecycle          TEXT NOT NULL DEFAULT 'unknown'
                       CHECK (lifecycle IN
                         ('queued', 'running', 'completed', 'failed',
                          'stopped', 'paused', 'unknown')),
  first_observed_at  INTEGER NOT NULL,
  last_observed_at   INTEGER NOT NULL,
  created_at         INTEGER NOT NULL,
  updated_at         INTEGER NOT NULL,
  -- Contor monoton pentru scrieri concurente (CAS), aceeași regulă ca la
  -- `agent_profiles` — niciodată `Date.now()`.
  revision           INTEGER NOT NULL DEFAULT 1,
  -- O sesiune nativă nu poate exista de două ori. Tehnic e deja garantat de
  -- PRIMARY KEY (id-ul e construit din exact aceste două coloane), dar
  -- constrângerea explicită face intenția clară pentru cine citește schema
  -- fără să deducă formula de construcție a id-ului.
  UNIQUE (source_harness, native_id)
);

-- Interogări frecvente filtrate după profil (associateProfile,
-- getActiveRunsForProfile, listRunsForProfile) — ca la
-- configuration_versions/profile_history.
CREATE INDEX idx_runs_profile_id ON runs(profile_id);
