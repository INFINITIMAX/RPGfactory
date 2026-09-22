'use strict';

const crypto = require('node:crypto');
const fs = require('node:fs');
const fsp = require('node:fs/promises');
const path = require('node:path');

const PROJECT_ROOT = path.resolve(__dirname, '..');
const MANIFEST_PATH = path.join(PROJECT_ROOT, 'config', 'assets.manifest.json');
const MANIFEST_KEYS = ['schemaVersion', 'licenses', 'assets'];
const APPROVED_LICENSES = {
  'OFL-1.1': {
    sourceUrl: 'https://github.com/google/fonts/tree/main/ofl/grenze',
    redistributable: true,
    requiredInCleanClone: true
  },
  'Tiny-Swords-Custom': {
    sourceUrl: 'https://pixelfrog-assets.itch.io/tiny-swords',
    redistributable: false,
    requiredInCleanClone: false
  }
};
const LICENSE_IDS = Object.keys(APPROVED_LICENSES);
const LICENSE_KEYS = ['sourceUrl', 'redistributable', 'requiredInCleanClone'];
const ASSET_KEYS = ['publicPath', 'localPath', 'licenseId', 'redistributable', 'requiredInCleanClone', 'bytes', 'sha256', 'width', 'height'];
const PNG_SIGNATURE = Buffer.from([137, 80, 78, 71, 13, 10, 26, 10]);

function hasExactKeys(value, keys) {
  return value && typeof value === 'object' && !Array.isArray(value)
    && Object.keys(value).length === keys.length && keys.every((key) => Object.hasOwn(value, key));
}

function isSafeLocalPath(localPath) {
  if (typeof localPath !== 'string' || localPath.length === 0 || localPath.includes('\\')) return false;
  if (path.posix.isAbsolute(localPath)) return false;
  return localPath.split('/').every((part) => part.length > 0 && part !== '.' && part !== '..');
}

function isSafePublicPath(publicPath) {
  return typeof publicPath === 'string' && /^\/[A-Za-z0-9._/-]+$/.test(publicPath)
    && !publicPath.includes('//') && !publicPath.split('/').includes('..');
}

function validateManifest(manifest) {
  if (!hasExactKeys(manifest, MANIFEST_KEYS) || manifest.schemaVersion !== 1) {
    return { valid: false, code: 'manifest-schema-invalid' };
  }
  if (!hasExactKeys(manifest.licenses, LICENSE_IDS) || !Array.isArray(manifest.assets) || manifest.assets.length !== 28) {
    return { valid: false, code: 'manifest-schema-invalid' };
  }

  for (const licenseId of LICENSE_IDS) {
    const license = manifest.licenses[licenseId];
    const approved = APPROVED_LICENSES[licenseId];
    if (!hasExactKeys(license, LICENSE_KEYS) || license.sourceUrl !== approved.sourceUrl
      || license.redistributable !== approved.redistributable
      || license.requiredInCleanClone !== approved.requiredInCleanClone) {
      return { valid: false, code: 'manifest-license-invalid' };
    }
  }

  let previousPath = '';
  const publicPaths = new Set();
  const localPaths = new Set();
  for (const asset of manifest.assets) {
    if (!hasExactKeys(asset, ASSET_KEYS) || !isSafePublicPath(asset.publicPath) || !isSafeLocalPath(asset.localPath)
      || asset.localPath !== `public${asset.publicPath}` || !LICENSE_IDS.includes(asset.licenseId)
      || typeof asset.redistributable !== 'boolean' || typeof asset.requiredInCleanClone !== 'boolean'
      || !Number.isSafeInteger(asset.bytes) || asset.bytes < 1 || !/^[a-f0-9]{64}$/.test(asset.sha256)) {
      return { valid: false, code: 'manifest-asset-invalid' };
    }
    const isPng = asset.publicPath.endsWith('.png');
    const isFont = asset.publicPath.endsWith('.ttf');
    if ((!isPng && !isFont) || (isPng && (!Number.isSafeInteger(asset.width) || asset.width < 1 || !Number.isSafeInteger(asset.height) || asset.height < 1))
      || (isFont && (asset.width !== null || asset.height !== null))) {
      return { valid: false, code: 'manifest-dimensions-invalid' };
    }
    const license = manifest.licenses[asset.licenseId];
    if (asset.redistributable !== license.redistributable || asset.requiredInCleanClone !== license.requiredInCleanClone) {
      return { valid: false, code: 'manifest-license-mismatch' };
    }
    const isGrenzeFont = asset.publicPath === '/fonts/grenze-variable.ttf';
    const isTinySwordsAsset = asset.publicPath.startsWith('/sprites/') || asset.publicPath.startsWith('/ui/');
    if ((isGrenzeFont && (asset.licenseId !== 'OFL-1.1' || !asset.redistributable || !asset.requiredInCleanClone))
      || (isTinySwordsAsset && (asset.licenseId !== 'Tiny-Swords-Custom' || asset.redistributable || asset.requiredInCleanClone))
      || (!isGrenzeFont && !isTinySwordsAsset)) {
      return { valid: false, code: 'manifest-asset-license-invalid' };
    }
    if (publicPaths.has(asset.publicPath) || localPaths.has(asset.localPath)) return { valid: false, code: 'manifest-duplicate-path' };
    if (previousPath && asset.publicPath <= previousPath) return { valid: false, code: 'manifest-order-invalid' };
    publicPaths.add(asset.publicPath);
    localPaths.add(asset.localPath);
    previousPath = asset.publicPath;
  }
  if (!publicPaths.has('/fonts/grenze-variable.ttf')) return { valid: false, code: 'manifest-grenze-font-missing' };
  return { valid: true };
}

function resolveContainedPath(root, localPath) {
  if (typeof localPath !== 'string' || localPath.length === 0
    || path.isAbsolute(localPath) || path.posix.isAbsolute(localPath) || path.win32.isAbsolute(localPath)
    || localPath.split(/[\\/]+/).includes('..')) return null;
  const resolvedRoot = path.resolve(root);
  const target = path.resolve(resolvedRoot, localPath);
  const relative = path.relative(resolvedRoot, target);
  if (relative === '' || path.isAbsolute(relative) || relative.split(path.sep).includes('..')) return null;
  return target;
}

async function hasSymlinkComponent(root, localPath) {
  let current = path.resolve(root);
  for (const part of localPath.split('/')) {
    current = path.join(current, part);
    try {
      if ((await fsp.lstat(current)).isSymbolicLink()) return true;
    } catch (error) {
      if (error && error.code === 'ENOENT') return false;
      return true;
    }
  }
  return false;
}

async function hashFile(filePath, maxBytes) {
  return new Promise((resolve, reject) => {
    const hash = crypto.createHash('sha256');
    let bytes = 0;
    const stream = fs.createReadStream(filePath);
    stream.on('data', (chunk) => {
      bytes += chunk.length;
      if (bytes > maxBytes) stream.destroy(new Error('size-limit'));
      else hash.update(chunk);
    });
    stream.once('error', () => reject(new Error('hash-failed')));
    stream.once('end', () => resolve(hash.digest('hex')));
  });
}

async function readPngDimensions(filePath) {
  let handle;
  try {
    handle = await fsp.open(filePath, 'r');
    const header = Buffer.alloc(24);
    const { bytesRead } = await handle.read(header, 0, header.length, 0);
    if (bytesRead !== header.length || !header.subarray(0, 8).equals(PNG_SIGNATURE)
      || header.readUInt32BE(8) !== 13 || header.subarray(12, 16).toString('ascii') !== 'IHDR') return null;
    return { width: header.readUInt32BE(16), height: header.readUInt32BE(20) };
  } catch {
    return null;
  } finally {
    if (handle) await handle.close();
  }
}

async function verifyAsset(asset, root) {
  const filePath = resolveContainedPath(root, asset.localPath);
  if (!filePath || await hasSymlinkComponent(root, asset.localPath)) return { publicPath: asset.publicPath, status: 'unsafe-path' };
  let stat;
  try {
    stat = await fsp.lstat(filePath);
  } catch (error) {
    return error && error.code === 'ENOENT'
      ? { publicPath: asset.publicPath, status: 'missing' }
      : { publicPath: asset.publicPath, status: 'unreadable' };
  }
  if (stat.isSymbolicLink() || !stat.isFile()) return { publicPath: asset.publicPath, status: 'not-regular-file' };
  if (stat.size !== asset.bytes) return { publicPath: asset.publicPath, status: 'bytes-mismatch' };
  let actualHash;
  try {
    actualHash = await hashFile(filePath, asset.bytes);
  } catch {
    return { publicPath: asset.publicPath, status: 'hash-unreadable' };
  }
  if (actualHash !== asset.sha256) return { publicPath: asset.publicPath, status: 'sha256-mismatch' };
  if (asset.width !== null) {
    const dimensions = await readPngDimensions(filePath);
    if (!dimensions || dimensions.width !== asset.width || dimensions.height !== asset.height) {
      return { publicPath: asset.publicPath, status: 'png-dimensions-mismatch' };
    }
  }
  return { publicPath: asset.publicPath, status: 'verified' };
}

async function verifyAssets(manifest, options = {}) {
  const validation = validateManifest(manifest);
  if (!validation.valid) return { results: [{ status: validation.code }], exitCode: 1 };
  const root = options.root || PROJECT_ROOT;
  const strict = options.strict === true;
  const results = [];
  for (const asset of manifest.assets) {
    const result = await verifyAsset(asset, root);
    if (result.status === 'missing' && !strict && !asset.requiredInCleanClone) result.status = 'optional-missing';
    results.push(result);
  }
  const failed = results.some((result) => result.status !== 'verified' && result.status !== 'optional-missing');
  return { results, exitCode: failed ? 1 : 0 };
}

async function loadManifest(manifestPath = MANIFEST_PATH) {
  try {
    return JSON.parse(await fsp.readFile(manifestPath, 'utf8'));
  } catch {
    return null;
  }
}

function formatReport(report) {
  const lines = report.results.map((result) => result.publicPath
    ? `${result.status} ${result.publicPath}`
    : result.status);
  const summary = report.results.reduce((counts, result) => {
    counts[result.status] = (counts[result.status] || 0) + 1;
    return counts;
  }, {});
  lines.push(`summary ${Object.keys(summary).sort().map((key) => `${key}=${summary[key]}`).join(' ')}`);
  return lines.join('\n');
}

async function main(argv) {
  const flags = argv.slice(2);
  if (flags.some((flag) => flag !== '--strict') || flags.filter((flag) => flag === '--strict').length > 1) {
    process.stdout.write('usage: node scripts/verify-assets.js [--strict]\n');
    return 2;
  }
  const manifest = await loadManifest();
  if (!manifest) {
    process.stdout.write('manifest-unreadable\n');
    return 1;
  }
  const report = await verifyAssets(manifest, { strict: flags.includes('--strict') });
  process.stdout.write(`${formatReport(report)}\n`);
  return report.exitCode;
}

module.exports = {
  PROJECT_ROOT,
  MANIFEST_PATH,
  formatReport,
  hashFile,
  isSafeLocalPath,
  isSafePublicPath,
  loadManifest,
  readPngDimensions,
  resolveContainedPath,
  validateManifest,
  verifyAsset,
  verifyAssets
};

if (require.main === module) {
  main(process.argv).then((exitCode) => {
    process.exitCode = exitCode;
  });
}
