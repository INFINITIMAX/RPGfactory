// world.js — funcții PURE pentru RF-05b: gruparea profilurilor pe proiect și
// alegerea culorii de accent per proiect. Fără bază de date, fără HTTP, fără
// efecte secundare la require — la fel ca `hex-layout.js`.
//
// Sursă de referință: bot-crossing (src/world/plots.js) — `PLOT_PALETTE` și
// `hashString` portate ca listă de culori CSS și, respectiv, FNV-1a simplu
// pentru alegere deterministă. NU s-a importat nimic din geometrie/randare
// 3D (deja portat separat în hex-layout.js/public/world.js).

/**
 * Grupează profilurile pe `last_project`, ordonate descrescător după
 * mărime (cel mai mare primul — ordinea decide cui i se dă cea mai apropiată
 * celulă de centru DINTRE proiectele noi, fără istoric — vezi hex-layout.js),
 * la egalitate de mărime ordonate alfabetic după `project` (determinist, nu
 * ordinea de întoarcere din SQLite).
 *
 * Profilurile cu `last_project` null/gol sunt EXCLUSE (nu au unde sta pe
 * hartă în acest lot) — limitare acceptată, nu reparată aici.
 *
 * @param profiles  rândurile întoarse de `profilesStore.listProfiles()`.
 * @returns [{ id: string, size: number }]
 */
function groupProjects(profiles) {
  const counts = new Map();
  for (const profile of profiles) {
    const project = profile.last_project;
    if (!project) continue; // null/gol — exclus, fără loc pe hartă în acest lot
    counts.set(project, (counts.get(project) || 0) + 1);
  }

  const projects = Array.from(counts, ([id, size]) => ({ id, size }));
  projects.sort((a, b) => {
    if (b.size !== a.size) return b.size - a.size;
    return a.id < b.id ? -1 : a.id > b.id ? 1 : 0;
  });
  return projects;
}

// Paletă de 12 culori CSS distincte, portate din `PLOT_PALETTE` (valorile
// hex numerice din sursa Three.js devin șiruri CSS). Alese să rămână
// lizibile atât pe fond întunecat (tema curentă din hud.css, #111) cât și
// pe un eventual fond deschis — nicio culoare prea apropiată de alb sau de
// negru pur.
const PALETTE = [
  '#c96442',
  '#4f9a63',
  '#4f7ec9',
  '#b8942a',
  '#8b5cc9',
  '#c94f8b',
  '#3fa8a0',
  '#c97f4f',
  '#6f8f4f',
  '#5c7fc9',
  '#c95c5c',
  '#7f6fc9',
];

// FNV-1a simplu, portat din `hashString` (bot-crossing) — determinist,
// independent de ordinea sau numărul de apeluri.
function hashString(str) {
  let h = 2166136261;
  for (let i = 0; i < str.length; i++) {
    h ^= str.charCodeAt(i);
    h = Math.imul(h, 16777619);
  }
  return h >>> 0;
}

/**
 * Culoare stabilă per proiect — același `project` -> aceeași culoare,
 * indiferent de ordine sau de câte ori se cheamă.
 * @param project string
 * @returns string  culoare CSS din PALETTE
 */
function pickAccent(project) {
  return PALETTE[hashString(project) % PALETTE.length];
}

module.exports = { groupProjects, pickAccent };
