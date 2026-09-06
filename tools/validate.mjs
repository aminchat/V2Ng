/* Validate the complete knowledge base with the same schema used in the browser.
 * Usage: node tools/validate.mjs [kbDir]
 */
import { readFileSync, readdirSync } from 'node:fs';
import { createHash } from 'node:crypto';
import { basename, join } from 'node:path';
import { validateKnowledgeBase, validateManifest } from '../js/schema.js';

export function sha256(buffer) {
  return createHash('sha256').update(buffer).digest('hex');
}

export function loadJson(path) {
  return JSON.parse(readFileSync(path, 'utf8'));
}

export function validateAll(kbDir) {
  const errors = [];
  let symptoms = {};
  let categories = {};
  const cases = {};
  let files = [];

  try {
    symptoms = loadJson(join(kbDir, 'symptoms.json'));
  } catch (error) {
    errors.push(`symptoms.json: ${error.message}`);
  }
  try {
    categories = loadJson(join(kbDir, 'categories.json'));
  } catch (error) {
    errors.push(`categories.json: ${error.message}`);
  }
  try {
    files = readdirSync(join(kbDir, 'cases')).filter((file) => file.endsWith('.json')).sort();
  } catch (error) {
    errors.push(`cases directory: ${error.message}`);
  }

  const seenIds = new Set();
  for (const file of files) {
    try {
      const item = loadJson(join(kbDir, 'cases', file));
      const filenameId = basename(file, '.json');
      if (item.id !== filenameId) errors.push(`${file}: embedded id "${item.id}" does not match filename`);
      if (seenIds.has(item.id)) errors.push(`${file}: duplicate case id "${item.id}"`);
      seenIds.add(item.id);
      cases[filenameId] = item;
    } catch (error) {
      errors.push(`${file}: ${error.message}`);
    }
  }

  if (!errors.some((error) => error.startsWith('symptoms.json') || error.startsWith('categories.json'))) {
    errors.push(...validateKnowledgeBase(symptoms, categories, cases));
  }

  return { errors, cases, symptoms, categories, files };
}

export function validateManifestFile(kbDir) {
  const errors = [];
  let manifest;
  try {
    manifest = loadJson(join(kbDir, 'manifest.json'));
    errors.push(...validateManifest(manifest));
  } catch (error) {
    errors.push(`manifest.json: ${error.message}`);
  }
  return { errors, manifest };
}

function runCli() {
  const args = process.argv.slice(2);
  if (args.length > 1 || args.some((arg) => arg.startsWith('--'))) {
    console.error('Usage: node tools/validate.mjs [kbDir]');
    process.exit(2);
  }
  const kbDir = args[0] || 'kb';
  const result = validateAll(kbDir);
  if (result.errors.length) {
    console.error(`KB validation FAILED:\n- ${result.errors.join('\n- ')}`);
    process.exit(1);
  }
  console.log(`KB validation OK (${result.files.length} cases)`);
}

if (process.argv[1] && import.meta.url === new URL(`file://${process.argv[1]}`).href) runCli();
