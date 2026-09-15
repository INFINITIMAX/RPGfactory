-- 004-sloturi.sql — RF-05c: posturile persistente (spec.md §3) — care slot
-- dintr-o zonă ține fiecare specialist, ca un specialist să nu sară între
-- sloturi doar pentru că un coleg a apărut sau a plecat din proiect.

-- profile_slots — un singur rând per profil (un profil ține exact un post),
-- cu memoria alocării din `assignSlots` (world.js). `UNIQUE(project, slot_index)`
-- e a doua sursă de adevăr, la nivel de bază de date, că doi specialiști din
-- același proiect nu pot ocupa fizic același post — apărare în profunzime,
-- pe lângă algoritmul determinist din `assignSlots` (ca la CAS-ul din
-- `agent_profiles`).
CREATE TABLE profile_slots (
  -- NOT NULL explicit: `TEXT PRIMARY KEY` acceptă NULL în SQLite, iar cheia
  -- primară nu impune unicitatea între valorile NULL (aceeași lecție ca la
  -- `agent_profiles`/`runs`/`hex_layout`).
  profile_id  TEXT PRIMARY KEY NOT NULL REFERENCES agent_profiles(id),
  project     TEXT NOT NULL,
  slot_index  INTEGER NOT NULL,
  updated_at  INTEGER NOT NULL,
  -- Contor monoton, aceeași regulă ca la `agent_profiles`/`runs`/`hex_layout`
  -- — niciodată `Date.now()`. Fără citire cu `expectedRevision` în acest lot
  -- (vezi slot-store.js, de ce nu are CAS), dar revizia tot crește la fiecare
  -- scriere, utilă pentru diagnosticare/audit ulterior.
  revision    INTEGER NOT NULL DEFAULT 1,
  UNIQUE(project, slot_index)
);
