import { test } from 'node:test';
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const publicRoot = path.join(root, 'public');

const htmlDocuments = ['index.html', 'game.html'];
const shippingUiFiles = [
  'index.html',
  'hud.js',
  'world.js',
  'hud.css',
  'game.html',
  'game.js',
  'game.css',
];

// This allowlisted source scan covers application-authored shipping UI only.
// It deliberately does not claim to validate external/stored values or historical files.
const knownRomanianUserFacingPhrases = [
  'Cetatea vie',
  'Regatul Pi',
  'Registru operațional',
  'Jurnalul misiunii',
  'Predări confirmate',
  'Seiful dovezilor',
  'Ierarhie și stare',
  'Sesiune observată',
  'Dovadă selectată',
  'Proiect local',
  'Se așteaptă observația Pi',
  'Nicio observație Pi disponibilă',
  'Nicio dovadă',
  'Ținta privată nu este expusă',
  'cererea a eșuat',
  'Acțiunea nu a fost acceptată',
  'Actualizarea nu a fost acceptată',
  'Asocierea nu a fost acceptată',
  'Dezasocierea nu a fost acceptată',
  'Profilul nu a putut fi creat',
  'deconectat · reîncercăm',
  'Arată ascunși',
  'Ascunde lista',
];

function readPublic(file) {
  return fs.readFileSync(path.join(publicRoot, file), 'utf8');
}

function escapeRegExp(value) {
  return value.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

test('both shipped HTML documents declare English', () => {
  for (const file of htmlDocuments) {
    assert.match(readPublic(file), /<html\s+[^>]*lang=["']en["'][^>]*>/i, `${file} must declare lang="en"`);
  }
});

test('current and legacy shipping UI sources contain none of the known Romanian user-facing phrases', () => {
  for (const file of shippingUiFiles) {
    const source = readPublic(file);
    for (const phrase of knownRomanianUserFacingPhrases) {
      assert.doesNotMatch(source, new RegExp(escapeRegExp(phrase), 'iu'), `${file} still contains the Romanian phrase ${JSON.stringify(phrase)}`);
    }
  }
});
