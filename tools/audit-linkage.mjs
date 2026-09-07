/* Deep audit: symptom↔case linkage consistency across both KB languages. */
import { readFileSync, readdirSync } from 'node:fs';
import { join } from 'node:path';

const root = process.argv[2] || '.';

function load(dir, file) {
  return JSON.parse(readFileSync(join(root, dir, file), 'utf8'));
}

const report = { errors: [], warnings: [] };

function auditKb(kbDir) {
  const symptoms = load(kbDir, 'symptoms.json');
  const symptomIds = new Set(Object.keys(symptoms));
  const casesDir = join(root, kbDir, 'cases');
  const caseFiles = readdirSync(casesDir).filter((f) => f.endsWith('.json'));
  const cases = caseFiles.map((f) => load(kbDir, join('cases', f)));
  const caseIds = new Set(cases.map((c) => c.id));

  const matchedBy = new Map();   // symptomId -> Set(caseId)
  const flaggedBy = new Map();   // symptomId -> Set(caseId)  (redFlags.when)
  const askedBy = new Map();     // symptomId -> Set(caseId)  (riskQuestions)
  const relatedTargets = new Set();

  for (const c of cases) {
    if (!c.id) { report.errors.push(`[${kbDir}] case without id in cases/`); continue; }
    for (const [sid] of Object.entries(c.match || {})) {
      if (!symptomIds.has(sid)) report.errors.push(`[${kbDir}] ${c.id}.match references unknown symptom "${sid}"`);
      if (!matchedBy.has(sid)) matchedBy.set(sid, new Set());
      matchedBy.get(sid).add(c.id);
    }
    for (const sid of c.riskQuestions || []) {
      if (!symptomIds.has(sid)) report.errors.push(`[${kbDir}] ${c.id}.riskQuestions references unknown symptom "${sid}"`);
      if (!askedBy.has(sid)) askedBy.set(sid, new Set());
      askedBy.get(sid).add(c.id);
    }
    for (const flag of c.redFlags || []) {
      for (const sid of flag.when || []) {
        if (!symptomIds.has(sid)) report.errors.push(`[${kbDir}] ${c.id}.redFlags references unknown symptom "${sid}"`);
        if (!flaggedBy.has(sid)) flaggedBy.set(sid, new Set());
        flaggedBy.get(sid).add(c.id);
      }
    }
    for (const rel of c.related || []) relatedTargets.add(rel.case);
  }

  for (const target of relatedTargets) {
    if (!caseIds.has(target)) report.errors.push(`[${kbDir}] related[].case points to missing case "${target}"`);
  }

  // The core bug class: symptoms that can be selected but match NO case (empty results page).
  const zeroMatch = [];
  for (const sid of symptomIds) {
    const matched = matchedBy.get(sid) || new Set();
    if (matched.size === 0) zeroMatch.push(sid);
  }
  return { symptoms, symptomIds, zeroMatch, matchedBy, flaggedBy, askedBy, cases, caseIds };
}

for (const kbDir of ['kb', 'kb-en']) {
  const a = auditKb(kbDir);
  const { zeroMatch, matchedBy, flaggedBy, askedBy } = a;
  console.log(`\n===== ${kbDir} =====`);
  console.log(`cases: ${a.cases.length}, symptoms: ${a.symptomIds.size}`);
  console.log(`\n-- Symptoms with ZERO case match (selecting them shows an empty results page): ${zeroMatch.length}`);
  for (const sid of zeroMatch.sort()) {
    const flags = [...(flaggedBy.get(sid) || [])];
    const asks = [...(askedBy.get(sid) || [])];
    const tag = flags.length ? `  ← redFlag of: ${flags.join(', ')}` : '';
    const tag2 = asks.length ? `  ← riskQuestion of: ${asks.join(', ')}` : '';
    console.log(`  ${sid}${tag}${tag2}`);
  }
  // Symptoms that are red flags somewhere but missing from match
  const flaggedNotMatched = [...new Set([...zeroMatch.filter((s) => (flaggedBy.get(s) || []).length)])];
  console.log(`\n-- Red-flag symptoms missing from match: ${flaggedNotMatched.length}`);
  console.log('  ' + flaggedNotMatched.sort().join(', '));
  // Red-flag membership inside matched symptoms (informational)
  const both = [];
  for (const sid of a.symptomIds) {
    const m = matchedBy.get(sid) || new Set();
    const f = flaggedBy.get(sid) || new Set();
    for (const cid of f) if (!m.has(cid)) both.push(`${sid}→${cid}`);
  }
  console.log(`\n-- Symptom is a redFlag of a case but NOT in that case's match (per-pair): ${both.length}`);
  console.log('  ' + both.sort().join(', '));
  console.log('\n-- Errors:', report.errors.filter((e) => e.includes(`[${kbDir}]`)).join('\n  ') || 'none');
}
