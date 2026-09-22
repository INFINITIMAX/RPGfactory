import { test } from 'node:test';
import assert from 'node:assert/strict';
import crypto from 'node:crypto';
import fs from 'node:fs';
import fsp from 'node:fs/promises';
import os from 'node:os';
import path from 'node:path';
import { execFile } from 'node:child_process';
import { promisify } from 'node:util';
import { createRequire } from 'node:module';
import { fileURLToPath } from 'node:url';

const require = createRequire(import.meta.url);
const verifier = require('../scripts/verify-assets.js');
const root = path.join(path.dirname(fileURLToPath(import.meta.url)), '..');
const manifest = JSON.parse(fs.readFileSync(path.join(root, 'config', 'assets.manifest.json'), 'utf8'));
const execFileAsync = promisify(execFile);
const publicSources = ['world.js', 'game.js', 'game.css', 'hud.css'];

function cloneManifest() {
  return structuredClone(manifest);
}

function referencedAssetPaths() {
  const paths = new Set();
  for (const source of publicSources) {
    const content = fs.readFileSync(path.join(root, 'public', source), 'utf8');
    for (const match of content.matchAll(/["'`](\/(?:sprites|ui|fonts)\/[^"'`\s)]+)/g)) paths.add(match[1]);
  }
  return [...paths].sort();
}

async function temporaryDirectory(t) {
  const directory = await fsp.mkdtemp(path.join(os.tmpdir(), 'rpg-assets-'));
  t.after(async () => fsp.rm(directory, { recursive: true, force: true }));
  return directory;
}

async function writeAsset(rootDirectory, asset, contents) {
  const filePath = path.join(rootDirectory, ...asset.localPath.split('/'));
  await fsp.mkdir(path.dirname(filePath), { recursive: true });
  await fsp.writeFile(filePath, contents);
  return filePath;
}

function syntheticPng(width, height) {
  const png = Buffer.alloc(24);
  Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]).copy(png, 0);
  png.writeUInt32BE(13, 8);
  png.write('IHDR', 12, 'ascii');
  png.writeUInt32BE(width, 16);
  png.writeUInt32BE(height, 20);
  return png;
}

function syntheticPngAsset(contents, width = 3, height = 5) {
  return {
    publicPath: '/sprites/synthetic.png',
    localPath: 'public/sprites/synthetic.png',
    licenseId: 'Tiny-Swords-Custom',
    redistributable: false,
    requiredInCleanClone: false,
    bytes: contents.length,
    sha256: crypto.createHash('sha256').update(contents).digest('hex'),
    width,
    height
  };
}

test('manifest is schema 1, has 28 ordered unique entries, and exactly covers shipped asset URLs', () => {
  assert.deepEqual(verifier.validateManifest(manifest), { valid: true });
  assert.equal(manifest.schemaVersion, 1);
  assert.equal(manifest.assets.length, 28);

  const publicPaths = manifest.assets.map((asset) => asset.publicPath);
  assert.equal(new Set(publicPaths).size, 28);
  assert.deepEqual(publicPaths, [...publicPaths].sort());
  assert.deepEqual(publicPaths, referencedAssetPaths());
});

test('manifest records the clean-clone license contract and only safe relative paths', () => {
  for (const asset of manifest.assets) {
    assert.equal(verifier.isSafeLocalPath(asset.localPath), true, asset.publicPath);
    assert.equal(verifier.isSafePublicPath(asset.publicPath), true, asset.publicPath);
    assert.equal(path.isAbsolute(asset.localPath), false, asset.publicPath);
    assert.equal(asset.localPath.includes('..'), false, asset.publicPath);
    if (asset.publicPath === '/fonts/grenze-variable.ttf') {
      assert.equal(asset.licenseId, 'OFL-1.1');
      assert.equal(asset.redistributable, true);
      assert.equal(asset.requiredInCleanClone, true);
    } else {
      assert.match(asset.publicPath, /^\/(sprites|ui)\//);
      assert.equal(asset.licenseId, 'Tiny-Swords-Custom');
      assert.equal(asset.redistributable, false);
      assert.equal(asset.requiredInCleanClone, false);
    }
  }
});

test('validateManifest rejects independent schema, ordering, path, measurement, and license mutations', () => {
  const mutations = [
    ['unknown key', (value) => { value.unexpected = true; }],
    ['duplicate public path', (value) => { value.assets[1].publicPath = value.assets[2].publicPath; }],
    ['unstable order', (value) => { [value.assets[1], value.assets[2]] = [value.assets[2], value.assets[1]]; }],
    ['unsafe local path', (value) => { value.assets[1].localPath = '../outside.png'; }],
    ['unsafe public path', (value) => { value.assets[1].publicPath = '/sprites/../outside.png'; }],
    ['invalid bytes', (value) => { value.assets[1].bytes = 0; }],
    ['invalid hash', (value) => { value.assets[1].sha256 = '0'.repeat(63); }],
    ['invalid PNG dimensions', (value) => { value.assets[1].width = null; }],
    ['changed license URL', (value) => { value.licenses['OFL-1.1'].sourceUrl = 'https://invalid.example/'; }],
    ['changed license boolean', (value) => { value.licenses['Tiny-Swords-Custom'].redistributable = true; }],
    ['font mapped to Tiny', (value) => { value.assets[0].licenseId = 'Tiny-Swords-Custom'; value.assets[0].redistributable = false; value.assets[0].requiredInCleanClone = false; }],
    ['sprite mapped to OFL', (value) => { value.assets[1].licenseId = 'OFL-1.1'; value.assets[1].redistributable = true; value.assets[1].requiredInCleanClone = true; }]
  ];

  for (const [name, mutate] of mutations) {
    const candidate = cloneManifest();
    mutate(candidate);
    assert.equal(verifier.validateManifest(candidate).valid, false, name);
  }
});

test('resolveContainedPath accepts a safe relative path and rejects escapes and absolute inputs', async (t) => {
  const directory = await temporaryDirectory(t);
  assert.equal(verifier.resolveContainedPath(directory, 'public/fonts/font.ttf'), path.join(directory, 'public', 'fonts', 'font.ttf'));
  assert.equal(verifier.resolveContainedPath(directory, '../outside.ttf'), null);
  assert.equal(verifier.resolveContainedPath(directory, path.join(directory, 'public', 'fonts', 'font.ttf')), null);
});

test('clean clone permits only missing optional Tiny Swords assets by default', async (t) => {
  const directory = await temporaryDirectory(t);
  const font = manifest.assets.find((asset) => asset.requiredInCleanClone);
  await writeAsset(directory, font, await fsp.readFile(path.join(root, ...font.localPath.split('/'))));

  const defaultReport = await verifier.verifyAssets(manifest, { root: directory });
  assert.equal(defaultReport.exitCode, 0);
  assert.equal(defaultReport.results.filter((result) => result.status === 'verified').length, 1);
  assert.equal(defaultReport.results.filter((result) => result.status === 'optional-missing').length, 27);
  assert.equal(verifier.formatReport(defaultReport).includes(directory), false);

  const strictReport = await verifier.verifyAssets(manifest, { root: directory, strict: true });
  assert.equal(strictReport.exitCode, 1);
  assert.equal(strictReport.results.filter((result) => result.status === 'missing').length, 27);
});

test('missing or same-size altered required font fails verification', async (t) => {
  const directory = await temporaryDirectory(t);
  const font = manifest.assets.find((asset) => asset.requiredInCleanClone);
  assert.equal((await verifier.verifyAssets(manifest, { root: directory })).exitCode, 1);

  const altered = Buffer.from(await fsp.readFile(path.join(root, ...font.localPath.split('/'))));
  altered[0] ^= 1;
  await writeAsset(directory, font, altered);
  const report = await verifier.verifyAssets(manifest, { root: directory });
  assert.equal(report.exitCode, 1);
  assert.equal(report.results.find((result) => result.publicPath === font.publicPath).status, 'sha256-mismatch');
});

test('verifyAsset rejects non-regular files and symlinks without treating them as valid assets', async (t) => {
  const directory = await temporaryDirectory(t);
  const asset = manifest.assets[1];
  const target = path.join(directory, ...asset.localPath.split('/'));
  await fsp.mkdir(target, { recursive: true });
  assert.equal((await verifier.verifyAsset(asset, directory)).status, 'not-regular-file');

  await fsp.rm(target, { recursive: true });
  await fsp.mkdir(path.dirname(target), { recursive: true });
  try {
    await fsp.symlink(path.join(root, ...asset.localPath.split('/')), target, 'file');
  } catch (error) {
    if (error && ['EPERM', 'EACCES', 'UNKNOWN'].includes(error.code)) {
      t.skip(`symlink creation is unavailable on this host (${error.code})`);
      return;
    }
    throw error;
  }
  assert.equal((await verifier.verifyAsset(asset, directory)).status, 'unsafe-path');
});

test('verifyAsset checks a bounded PNG header, dimensions, and hash', async (t) => {
  const directory = await temporaryDirectory(t);
  const contents = syntheticPng(3, 5);
  const asset = syntheticPngAsset(contents);
  await writeAsset(directory, asset, contents);
  assert.equal((await verifier.verifyAsset(asset, directory)).status, 'verified');

  const wrongDimensions = { ...asset, width: 4 };
  assert.equal((await verifier.verifyAsset(wrongDimensions, directory)).status, 'png-dimensions-mismatch');
});

test('CLI rejects unknown flags with sanitized usage and formatReport is deterministic', async () => {
  let result;
  try {
    await execFileAsync(process.execPath, ['scripts/verify-assets.js', '--unknown'], { cwd: root });
    assert.fail('unknown CLI flags must not exit successfully');
  } catch (error) {
    result = error;
  }
  assert.equal(result.code, 2);
  assert.equal(result.stdout, 'usage: node scripts/verify-assets.js [--strict]\n');
  assert.equal(result.stdout.includes(root), false);

  const report = { results: [{ publicPath: '/ui/z.png', status: 'verified' }, { publicPath: '/ui/a.png', status: 'missing' }, { status: 'manifest-schema-invalid' }], exitCode: 1 };
  assert.equal(verifier.formatReport(report), 'verified /ui/z.png\nmissing /ui/a.png\nmanifest-schema-invalid\nsummary manifest-schema-invalid=1 missing=1 verified=1');
});
