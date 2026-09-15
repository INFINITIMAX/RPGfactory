-- 003-layout.sql — RF-05b: entitatea Layout din spec.md §3, persistată
-- separat de lista momentan activă de profiluri. Memoria lui
-- `allocateCells` (parametrul `previous` din hex-layout.js) trebuie să
-- supraviețuiască unui restart al serverului, nu doar să existe în RAM cât
-- timp serverul rulează — altfel fiecare pornire ar reașeza harta de la
-- zero, exact saltul vizual pe care memoria există ca să-l prevină.

-- hex_layout — un singur rând per proiect, cu blob-ul complet de celule pe
-- care le ocupă în hartă. `cells` e JSON serializat, nu o tabelă normalizată
-- per celulă (`hex_layout_cells`): aici nu există nicio celulă cu identitate
-- proprie sau interogată izolat — se citește/scrie mereu tot blob-ul unui
-- proiect deodată, niciodată o singură celulă. Excepție acceptată la stilul
-- relațional din restul schemei (001/002), motivată de cum se folosește
-- efectiv acest lot.
CREATE TABLE hex_layout (
  -- NOT NULL explicit: `TEXT PRIMARY KEY` acceptă NULL în SQLite, iar cheia
  -- primară nu impune unicitatea între valorile NULL (aceeași lecție ca la
  -- `agent_profiles`/`runs`) — fără identitate, un rând nu poate fi
  -- distins de altul.
  project    TEXT PRIMARY KEY NOT NULL,
  cells      TEXT NOT NULL,   -- JSON: [{"q":0,"r":0}, ...], index 0 = rădăcina
  updated_at INTEGER NOT NULL,
  -- Contor monoton, aceeași regulă ca la `agent_profiles`/`runs` — niciodată
  -- `Date.now()`. Nu există citire cu `expectedRevision` în acest lot (vezi
  -- layout.js), dar revizia tot crește la fiecare scriere, utilă pentru
  -- diagnosticare/audit ulterior.
  revision   INTEGER NOT NULL DEFAULT 1
);
