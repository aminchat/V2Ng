/* Build kb/manifest.json from validated source files.
 * Usage: node tools/build-manifest.mjs [kbDir] [--version N] [--date YYYY-MM-DD]
 */
import { existsSync, readFileSync, writeFileSync } from 'node:fs';
import { basename, join, resolve } from 'node:path';
import { validateManifest } from '../js/schema.js';
import { sha256, validateAll } from './validate.mjs';

function usage(message) {
  if (message) console.error(message);
  console.error('Usage: node tools/build-manifest.mjs [kbDir] [--version N] [--date YYYY-MM-DD]');
  process.exit(2);
}

function parseArgs(args) {
  let kbDir = 'kb';
  let kbDirSet = false;
  let version = null;
  let date = new Date().toISOString().slice(0, 10);

  for (let index = 0; index < args.length; index += 1) {
    const arg = args[index];
    if (arg === '--version') {
      const value = args[++index];
      if (!value || !/^\d+$/.test(value) || Number(value) < 1) usage('--version requires an integer >= 1.');
      version = Number(value);
    } else if (arg === '--date') {
      const value = args[++index];
      if (!value || !/^\d{4}-\d{2}-\d{2}$/.test(value)) usage('--date requires YYYY-MM-DD.');
      const parsed = new Date(`${value}T00:00:00Z`);
      if (Number.isNaN(parsed.getTime()) || parsed.toISOString().slice(0, 10) !== value) usage('--date is not a real date.');
      date = value;
    } else if (arg.startsWith('--')) {
      usage(`Unknown option: ${arg}`);
    } else if (!kbDirSet) {
      kbDir = arg;
      kbDirSet = true;
    } else {
      usage(`Unexpected positional argument: ${arg}`);
    }
  }
  return { kbDir, version, date };
}

const { kbDir, version, date } = parseArgs(process.argv.slice(2));
const kbRoot = basename(resolve(kbDir));
if (!/^[a-z0-9-]+$/.test(kbRoot)) usage('kbDir must have a URL-safe directory name.');
const { errors, cases, files } = validateAll(kbDir);
if (errors.length) {
  console.error(`KB validation FAILED — manifest not written:\n- ${errors.join('\n- ')}`);
  process.exit(1);
}

const manifestPath = join(kbDir, 'manifest.json');
let previous = null;
if (existsSync(manifestPath)) {
  try {
    previous = JSON.parse(readFileSync(manifestPath, 'utf8'));
  } catch (error) {
    console.error(`Existing manifest is invalid JSON: ${error.message}`);
    process.exit(1);
  }
}
const previousVersion = Number.isInteger(previous?.kbVersion) ? previous.kbVersion : 0;
const kbVersion = version === null ? Math.max(1, previousVersion + 1) : Math.max(version, previousVersion + 1);

function entry(id, relativeFile, contentVersion = null) {
  const hash = sha256(readFileSync(join(kbDir, relativeFile)));
  const old = id.startsWith('__') ? previous?.entries?.[id] : previous?.cases?.[id];
  if (contentVersion !== null && old?.hash && old.hash !== hash && contentVersion <= old.version) {
    console.error(`${id}: content changed but version was not increased above ${old.version}.`);
    process.exit(1);
  }
  const derivedVersion = old?.hash === hash && Number.isInteger(old.version) ? old.version : Math.max(1, (old?.version || 0) + 1);
  return {
    version: contentVersion ?? derivedVersion,
    hash,
    url: `${kbRoot}/${relativeFile}`,
  };
}

const manifest = {
  kbVersion,
  updatedAt: date,
  generator: 'tools/build-manifest.mjs',
  entries: {
    __symptoms: entry('__symptoms', 'symptoms.json'),
    __categories: entry('__categories', 'categories.json'),
  },
  cases: {},
};

for (const file of files) {
  const id = file.replace(/\.json$/, '');
  manifest.cases[id] = entry(id, `cases/${file}`, cases[id].version);
}

const manifestErrors = validateManifest(manifest, kbRoot);
if (manifestErrors.length) {
  console.error(`Generated manifest is invalid — file not written:\n- ${manifestErrors.join('\n- ')}`);
  process.exit(1);
}

writeFileSync(manifestPath, `${JSON.stringify(manifest, null, 2)}\n`);
console.log(`manifest written: kbVersion=${kbVersion}, updatedAt=${date}, ${files.length} cases`);
