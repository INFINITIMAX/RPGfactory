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

/**
 * Profilurile fiecărui proiect, ca listă de ID-uri (NU doar numărul, ca la
 * `groupProjects`) — RF-05c are nevoie să știe CUI anume îi dă un slot, nu
 * doar câți sunt. Aceeași excludere ca `groupProjects`: `last_project`
 * null/gol -> exclus (fără loc pe hartă în acest lot).
 *
 * Ordinea din fiecare listă contează pentru `assignSlots` (mai jos) — se
 * păstrează ordinea din `profiles` (deja `ORDER BY created_at ASC, id ASC`
 * din `profilesStore.listProfiles()`), nu se resortează aici.
 *
 * @param profiles  rândurile întoarse de `profilesStore.listProfiles()`.
 * @returns Map<project, [profileId, ...]>
 */
function profilesByProject(profiles) {
  const byProject = new Map();
  for (const profile of profiles) {
    const project = profile.last_project;
    if (!project) continue; // null/gol — exclus, ca la groupProjects
    if (!byProject.has(project)) byProject.set(project, []);
    byProject.get(project).push(profile.id);
  }
  return byProject;
}

/**
 * Alocă un post (slot_index) fiecărui profil dintr-un SINGUR proiect, cu
 * memorie — determinist, NU hash+jitter (spec.md §7 interzice explicit:
 * hash+jitter ar suprapune vizual doi specialiști diferiți, la momente
 * diferite, peste același slot, pentru că poziția s-ar recalcula din hash-ul
 * id-ului în loc să rămână un întreg mic alocat explicit).
 *
 * Regulile de memorie:
 * - un profil care avea deja un post (`previous`) îl PĂSTREAZĂ, cât timp
 *   `slotIndex < capacity` ȘI el mai apare în `profileIds` — un specialist
 *   nu sare din slot doar pentru că a apărut/plecat un coleg;
 * - un profil care nu mai apare în `profileIds` (a plecat din proiect) își
 *   eliberează postul — nu apare în rezultat, iar slotul devine liber pentru
 *   alocările noi de mai jos;
 * - un profil FĂRĂ post anterior (sau al cărui post vechi nu mai încape sub
 *   `capacity`) primește cel mai mic `slotIndex` liber; ordinea din
 *   `profileIds` decide cine ia sloturile noi disponibile primul (primul din
 *   listă ia primul slot liber);
 * - dacă `profileIds.length > capacity`, cei care nu mai încap NU primesc
 *   slot (nu apar în rezultat) — limitare acceptată în acest lot, nu se
 *   inventează niciun „overflow" vizual.
 *
 * @param profileIds  [profileId, ...] — id-urile curente din acest proiect.
 * @param previous    Map<profileId, slotIndex> — posturile anterioare ale
 *                     ACESTUI proiect (nu ale altor proiecte).
 * @param capacity    număr total de sloturi ale zonei = cells.length * 7.
 * @returns Map<profileId, slotIndex>
 */
function assignSlots(profileIds, previous, capacity) {
  const currentIds = new Set(profileIds);
  const result = new Map();
  const takenSlots = new Set();

  // Pasul 1: păstrează posturile anterioare valide — profilul mai e în
  // proiect ȘI slotul mai încape sub capacitatea curentă.
  const needsSlot = [];
  for (const profileId of profileIds) {
    const prevSlot = previous.get(profileId);
    if (prevSlot !== undefined && prevSlot < capacity && !takenSlots.has(prevSlot)) {
      result.set(profileId, prevSlot);
      takenSlots.add(prevSlot);
    } else {
      needsSlot.push(profileId);
    }
  }

  // Pasul 2: cei fără post valid primesc cel mai mic slot liber, în ordinea
  // din `profileIds` (determinist, nu hash/random).
  let nextFree = 0;
  for (const profileId of needsSlot) {
    while (nextFree < capacity && takenSlots.has(nextFree)) nextFree++;
    if (nextFree >= capacity) continue; // nu mai încape — overflow acceptat, fără slot
    result.set(profileId, nextFree);
    takenSlots.add(nextFree);
  }

  return result;
}

module.exports = { groupProjects, pickAccent, profilesByProject, assignSlots };
