/* Emdadgar knowledge-base, triage, clinical-regression and PWA tests.
 * Run: node test/run-tests.mjs
 */
import { createHash } from 'node:crypto';
import { mkdtempSync, readFileSync, rmSync, writeFileSync, mkdirSync } from 'node:fs';
import { tmpdir } from 'node:os';
import { dirname, join } from 'node:path';
import { spawnSync } from 'node:child_process';
import { fileURLToPath } from 'node:url';
import {
  hasCriticalSymptoms,
  historicalSymptomIds,
  isCurrentSymptomVisible,
  nextTriageQuestion,
  normalizePersianSearch,
  quickSymptomIds,
  rankCases,
  searchSymptoms,
  sortSymptomIds,
  suggestSymptoms,
  symptomModels,
  toggleCurrentSymptom,
  toggleHistoricalSymptom,
  triggeredFlags,
  triageRoute,
  triageSymptoms,
} from '../js/engine.js';
import { validateCountryData, validateKnowledgeBase, validateLocaleDictionary, validateManifest } from '../js/schema.js';
import faLocale from '../locales/fa.js';
import enLocale from '../locales/en.js';
import { sha256, validateAll } from '../tools/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kbDir = join(root, 'kb');
const enKbDir = join(root, 'kb-en');
let passed = 0;
const failures = [];

function test(name, condition, detail = '') {
  if (condition) passed += 1;
  else failures.push(detail ? `${name}: ${detail}` : name);
}

function clone(value) {
  return JSON.parse(JSON.stringify(value));
}

/* ---------- Complete schema ---------- */
const kb = validateAll(kbDir);
if (kb.errors.length) console.error(`KB validation errors:\n- ${kb.errors.join('\n- ')}`);
test('KB passes the browser-shared schema', kb.errors.length === 0);
test('Persian KB contains exactly 35 cases', Object.keys(kb.cases).length === 35);
test('all 8 categories are present', Object.keys(kb.categories).length === 8);
test('each category exposes selectable symptoms', Object.values(kb.categories).every((category) => category.diffSymptoms.length > 0));
test('every case cites a source', Object.values(kb.cases).every((item) => item.sources.length > 0));
test('every case has explicit emergency-contact guidance', Object.values(kb.cases).every((item) => typeof item.emergencyCall?.always === 'boolean' && item.emergencyCall.text));
test('all case files use a positive content version', Object.values(kb.cases).every((item) => item.version >= 1));
test('all risk questions render a known symptom label', Object.values(kb.cases).every((item) => item.riskQuestions.every((id) => kb.symptoms[id]?.label)));

const enKb = validateAll(enKbDir);
if (enKb.errors.length) console.error(`English KB validation errors:\n- ${enKb.errors.join('\n- ')}`);
test('English KB passes the browser-shared schema', enKb.errors.length === 0);
test('English KB contains exactly 35 independently written cases', Object.keys(enKb.cases).length === 35);
test('Persian and English KBs have identical case IDs', JSON.stringify(Object.keys(kb.cases).sort()) === JSON.stringify(Object.keys(enKb.cases).sort()));
test('Persian and English KBs have identical symptom IDs', JSON.stringify(Object.keys(kb.symptoms).sort()) === JSON.stringify(Object.keys(enKb.symptoms).sort()));
test('Persian and English KBs have identical category IDs', JSON.stringify(Object.keys(kb.categories).sort()) === JSON.stringify(Object.keys(enKb.categories).sort()));
const clinicalShape = (item) => ({
  id: item.id,
  category: item.category,
  match: item.match,
  riskQuestions: item.riskQuestions,
  callAlways: item.emergencyCall.always,
  callWhen: item.emergencyCall.when || [],
  redFlagTriggers: (item.redFlags || []).map((flag) => flag.when),
});
test('both languages share the same clinical matching and urgency structure', Object.keys(kb.cases).every((id) => JSON.stringify(clinicalShape(kb.cases[id])) === JSON.stringify(clinicalShape(enKb.cases[id]))));
test('English prose is not copied from Persian prose', Object.keys(kb.cases).every((id) => enKb.cases[id].title !== kb.cases[id].title && enKb.cases[id].summary !== kb.cases[id].summary && enKb.cases[id].actions.join(' ') !== kb.cases[id].actions.join(' ')));
test('English KB contains no Persian-script UI or medical prose', !/[\u0600-\u06ff]/u.test(JSON.stringify({ symptoms: enKb.symptoms, categories: enKb.categories, cases: enKb.cases })));
test('all six gap topics exist independently in both languages', ['shock', 'frostbite', 'dental-avulsion', 'open-chest-wound', 'jellyfish-sting', 'traumatic-amputation'].every((id) => kb.cases[id] && enKb.cases[id]));
test('English sources cite primary international guidance throughout', Object.values(enKb.cases).every((item) => item.sources.some((source) => /American Heart Association|World Health Organization|ILCOR|European Resuscitation Council|World Allergy Organization|CDC|American Diabetes Association/.test(source))));
test('regional venom notes are keyed separately by country', ['snake-bite', 'scorpion-sting'].every((id) => kb.cases[id].regionalNotes?.IR && enKb.cases[id].regionalNotes?.IR));
test('medical case prose contains no country-specific emergency or poison number', !/۱۱۵|۱۹۰|\b115\b|\b190\b/u.test(JSON.stringify(kb.cases)) && !/\b911\b|\b112\b/u.test(JSON.stringify(enKb.cases)));
test('English symptom search works with plain common terms', searchSymptoms('shortness of breath', enKb.symptoms).includes('difficulty_breathing') && searchSymptoms('knocked out tooth', enKb.symptoms).includes('tooth_knocked_out'));
const englishText = (id) => `${enKb.cases[id].summary} ${enKb.cases[id].actions.join(' ')}`;
test('action measurements place metric before a practical secondary equivalent', englishText('cardiac-arrest').indexOf('5 cm') < englishText('cardiac-arrest').indexOf('2 in') && englishText('frostbite').indexOf('37 to 40°C') < englishText('frostbite').indexOf('99 to 104°F') && englishText('severe-bleeding').indexOf('5 to 7 cm') < englishText('severe-bleeding').indexOf('2 to 3 in'));

const invalidCaseKb = clone(kb.cases);
invalidCaseKb['cardiac-arrest'].actions = [];
test('schema rejects an empty action list', validateKnowledgeBase(kb.symptoms, kb.categories, invalidCaseKb).some((error) => error.includes('actions')));
const invalidReferenceKb = clone(kb.cases);
invalidReferenceKb.fainting.emergencyCall.when.push('not_selectable_here');
test('schema rejects an unknown trigger', validateKnowledgeBase(kb.symptoms, kb.categories, invalidReferenceKb).some((error) => error.includes('unknown symptom')));
const hiddenTriggerKb = clone(kb.cases);
hiddenTriggerKb.fainting.emergencyCall.when.push('cyanosis');
test('schema rejects a trigger absent from risk questions', validateKnowledgeBase(kb.symptoms, kb.categories, hiddenTriggerKb).some((error) => error.includes('not selectable')));
const invalidDateKb = clone(kb.cases);
invalidDateKb.fainting.updatedAt = '2026-02-31';
test('schema rejects an impossible calendar date', validateKnowledgeBase(kb.symptoms, kb.categories, invalidDateKb).some((error) => error.includes('updatedAt')));
const unknownCompatibilitySymptoms = clone(kb.symptoms);
unknownCompatibilitySymptoms.unresponsive.exclusiveWith = ['not_a_symptom'];
test('schema rejects an unknown compatibility reference', validateKnowledgeBase(unknownCompatibilitySymptoms, kb.categories, kb.cases).some((error) => error.includes('exclusiveWith references unknown')));
const invalidHistorySymptoms = clone(kb.symptoms);
invalidHistorySymptoms.cyanosis.canBeHistorical = true;
test('schema requires historical symptoms to have an assessability constraint', validateKnowledgeBase(invalidHistorySymptoms, kb.categories, kb.cases).some((error) => error.includes('canBeHistorical requires')));
const invalidAliasSymptoms = clone(kb.symptoms);
invalidAliasSymptoms.dizziness.aliases = [''];
test('schema rejects empty search aliases', validateKnowledgeBase(invalidAliasSymptoms, kb.categories, kb.cases).some((error) => error.includes('aliases must contain')));
const invalidEvidenceSymptoms = clone(kb.symptoms);
invalidEvidenceSymptoms.dizziness.evidenceTypes = ['diagnosis'];
test('schema rejects unknown or missing evidence-source types', validateKnowledgeBase(invalidEvidenceSymptoms, kb.categories, kb.cases).some((error) => error.includes('evidenceTypes')));
const invalidReportedHistory = clone(kb.symptoms);
invalidReportedHistory.cyanosis.reportedCanBeHistorical = true;
test('schema restricts source-specific history to person-reported evidence', validateKnowledgeBase(invalidReportedHistory, kb.categories, kb.cases).some((error) => error.includes('reportedCanBeHistorical requires reported evidence')));
const invalidDisplayPrioritySymptoms = clone(kb.symptoms);
invalidDisplayPrioritySymptoms.dizziness.displayPriority = 101;
test('schema bounds symptom display priority', validateKnowledgeBase(invalidDisplayPrioritySymptoms, kb.categories, kb.cases).some((error) => error.includes('displayPriority')));
const excessiveQuickSymptoms = clone(kb.symptoms);
Object.values(excessiveQuickSymptoms).slice(0, 11).forEach((symptom) => { symptom.quickAccess = true; });
test('schema limits the quick-access list', validateKnowledgeBase(excessiveQuickSymptoms, kb.categories, kb.cases).some((error) => error.includes('quickAccess must be limited')));

/* ---------- Triage integration ---------- */
test('urgent triage starts with explicit scene safety', nextTriageQuestion({}) === 'sceneSafe');
test('unsafe or uncertain scene routes to stand-back guidance', triageRoute({ sceneSafe: 'n' }) === 'scene-unsafe' && triageRoute({ sceneSafe: 'u' }) === 'scene-unsafe');
test('safe scene proceeds to responsiveness', nextTriageQuestion({ sceneSafe: 'y' }) === 'conscious');
test('a responsive person is still checked for severe choking', nextTriageQuestion({ sceneSafe: 'y', conscious: 'y' }) === 'choking');
test('after no choking, severe breathing difficulty is checked', nextTriageQuestion({ sceneSafe: 'y', conscious: 'y', choking: 'n' }) === 'breathingDifficulty');
test('after normal airway and breathing, severe bleeding is checked', nextTriageQuestion({ sceneSafe: 'y', conscious: 'y', choking: 'n', breathingDifficulty: 'n' }) === 'bleeding');
test('after immediate dangers are negative, answer reliability is checked', nextTriageQuestion({ sceneSafe: 'y', conscious: 'y', choking: 'n', breathingDifficulty: 'n', bleeding: 'n' }) === 'communication');
test('an unresponsive breathing person is still checked for bleeding', nextTriageQuestion({ sceneSafe: 'y', conscious: 'n', breathing: 'y' }) === 'bleeding');
test('unresponsive plus no normal breathing routes to cardiac arrest', triageRoute({ sceneSafe: 'y', conscious: 'n', breathing: 'n' }) === 'cardiac-arrest');
test('unresponsive plus breathing and severe bleeding routes to bleeding control', triageRoute({ sceneSafe: 'y', conscious: 'n', breathing: 'y', bleeding: 'y' }) === 'severe-bleeding');
test('unresponsive plus breathing and no severe bleeding routes to recovery-position guidance', triageRoute({ sceneSafe: 'y', conscious: 'n', breathing: 'y', bleeding: 'n' }) === 'unresponsive-breathing');
test('severe choking routes immediately', triageRoute({ sceneSafe: 'y', conscious: 'y', choking: 'y' }) === 'choking');
test('severe breathing difficulty routes immediately', triageRoute({ sceneSafe: 'y', conscious: 'y', choking: 'n', breathingDifficulty: 'y' }) === 'breathing-difficulty');
test('all immediate checks negative route to observation flow only after communication is recorded', triageRoute({ sceneSafe: 'y', conscious: 'y', choking: 'n', breathingDifficulty: 'n', bleeding: 'n', communication: 'n' }) === 'symptoms');
test('triage answers map to real KB symptom IDs', triageSymptoms({ sceneSafe: 'y', conscious: 'y', choking: 'y' }).every((id) => kb.symptoms[id]));

test('every symptom has at least one reviewed evidence source', Object.values(kb.symptoms).every((symptom) => symptom.evidenceTypes?.length));
test('both languages use the same evidence-source model', Object.keys(kb.symptoms).every((id) => JSON.stringify(kb.symptoms[id].evidenceTypes) === JSON.stringify(enKb.symptoms[id].evidenceTypes)));
test('subjective chest pain is reported evidence while cyanosis is observed evidence', kb.symptoms.chest_pain.evidenceTypes.includes('reported') && !kb.symptoms.chest_pain.evidenceTypes.includes('observed') && kb.symptoms.cyanosis.evidenceTypes.includes('observed'));
test('known events and patient background are separated from observations', kb.symptoms.electrical_contact.evidenceTypes.includes('scene') && kb.symptoms.known_diabetic.evidenceTypes.includes('background'));
const models = symptomModels(Object.keys(kb.symptoms).filter((id) => kb.symptoms[id].evidenceTypes.includes('observed')), kb.symptoms);
test('UI symptom models preserve each symptom ID', models.length > 0 && models.every((model) => model.id && model.label));
test('UI symptom models never produce undefined IDs', models.every((model) => model.id !== 'undefined'));

/* ---------- Symptom compatibility ---------- */
test('unresponsiveness hides effective cough', !isCurrentSymptomVisible('coughing_effort', ['unresponsive'], kb.symptoms));
test('high-priority unresponsiveness remains selectable after effective cough', isCurrentSymptomVisible('unresponsive', ['coughing_effort'], kb.symptoms));
test('no breathing hides normal breathing', !isCurrentSymptomVisible('breathing_normal', ['not_breathing'], kb.symptoms));
test('normal breathing and breathing difficulty are mutually exclusive', !isCurrentSymptomVisible('difficulty_breathing', ['breathing_normal'], kb.symptoms));
test('agonal gasps hide effective cough', !isCurrentSymptomVisible('coughing_effort', ['gasping'], kb.symptoms));
test('severe choking hides effective cough', !isCurrentSymptomVisible('coughing_effort', ['choking_signs'], kb.symptoms));
test('child and elderly selections are mutually exclusive', !isCurrentSymptomVisible('elderly_victim', ['child_victim'], kb.symptoms));
test('dry-hot and sweaty-hot skin descriptions are mutually exclusive', !isCurrentSymptomVisible('hot_flushed', ['hot_dry_skin'], kb.symptoms));

let compatibility = toggleCurrentSymptom(
  ['coughing_effort', 'throat_tightness'],
  [],
  'unresponsive',
  kb.symptoms,
);
test('selecting unresponsive removes a current effective cough', compatibility.selected.includes('unresponsive') && compatibility.removed.includes('coughing_effort') && !compatibility.selected.includes('coughing_effort'));
test('selecting unresponsive preserves prior throat tightness as history', compatibility.movedToHistorical.includes('throat_tightness') && compatibility.historical.includes('throat_tightness'));
test('subjective history becomes available when the person is unresponsive', historicalSymptomIds(['chest_pain', 'cyanosis'], ['unresponsive'], kb.symptoms).includes('chest_pain'));
test('observable cyanosis is not moved into subjective history', !historicalSymptomIds(['chest_pain', 'cyanosis'], ['unresponsive'], kb.symptoms).includes('cyanosis'));
compatibility = toggleCurrentSymptom(['unresponsive'], ['throat_tightness'], 'unresponsive', kb.symptoms);
test('removing unresponsive restores an assessable historical selection', compatibility.selected.includes('throat_tightness') && compatibility.restored.includes('throat_tightness') && compatibility.historical.length === 0);
compatibility = toggleCurrentSymptom(['breathing_normal', 'wheezing'], [], 'not_breathing', kb.symptoms);
test('selecting no breathing removes normal breathing', compatibility.removed.includes('breathing_normal') && !compatibility.selected.includes('breathing_normal'));
test('selecting no breathing preserves witnessed wheezing as history', compatibility.movedToHistorical.includes('wheezing') && compatibility.historical.includes('wheezing'));
compatibility = toggleCurrentSymptom(['coughing_effort'], [], 'choking_signs', kb.symptoms);
test('selecting severe choking replaces effective cough', compatibility.removed.includes('coughing_effort') && compatibility.selected.includes('choking_signs'));
let historical = toggleHistoricalSymptom([], 'chest_pain', kb.symptoms);
historical = toggleHistoricalSymptom(historical, 'chest_pain', kb.symptoms);
test('historical symptom chips toggle deterministically', historical.length === 0);
test('source-specific earlier nausea can be recorded as history', toggleHistoricalSymptom([], 'nausea_vomiting', kb.symptoms).includes('nausea_vomiting'));

/* ---------- Fast symptom discovery ---------- */
test('every symptom provides reviewed Persian search aliases', Object.values(kb.symptoms).every((symptom) => symptom.aliases?.length));
test('Persian search normalizes Arabic letters and zero-width separators', normalizePersianSearch('  نفس‌تنگي و كاهش  ') === 'نفس تنگی و کاهش');
test('search finds nosebleed by its common Persian alias', searchSymptoms('خون دماغ', kb.symptoms)[0] === 'nosebleed');
test('short temperature query returns hot and cold observations but never nosebleed', ['hot_dry_skin', 'hot_flushed', 'cold_skin'].every((id) => searchSymptoms('دما', kb.symptoms).includes(id)) && !searchSymptoms('دما', kb.symptoms).includes('nosebleed'));
test('Persian high and low temperature phrases route separately', searchSymptoms('افزایش دما', kb.symptoms).includes('hot_dry_skin') && !searchSymptoms('افزایش دما', kb.symptoms).includes('cold_skin') && searchSymptoms('کاهش دما', kb.symptoms).includes('cold_skin'));
test('fever search returns only reviewed hot-body choices and no cross-word false match', ['hot_dry_skin', 'hot_flushed'].every((id) => searchSymptoms('تب', kb.symptoms).includes(id)) && !searchSymptoms('تب', kb.symptoms).includes('drowsiness'));
test('English temperature vocabulary finds both directions and clinical aliases', ['hot_dry_skin', 'hot_flushed', 'cold_skin'].every((id) => searchSymptoms('temperature', enKb.symptoms).includes(id)) && searchSymptoms('high temperature', enKb.symptoms).includes('hot_dry_skin') && searchSymptoms('low temperature', enKb.symptoms).includes('cold_skin') && searchSymptoms('hypothermia', enKb.symptoms).includes('cold_skin') && searchSymptoms('fever', enKb.symptoms).includes('hot_flushed'));
test('source-specific observation and report wording is searchable', searchSymptoms('همراه تقلا', kb.symptoms).includes('difficulty_breathing') && searchSymptoms('feel nauseated', enKb.symptoms).includes('nausea_vomiting'));
test('search finds electrical contact despite half-space differences', searchSymptoms('برق گرفتگی', kb.symptoms).includes('electrical_contact'));
test('search tolerates omitted Persian half-spaces', searchSymptoms('جواب نمیدهد', kb.symptoms).includes('unresponsive'));
test('one-letter queries deliberately return no noisy results', searchSymptoms('د', kb.symptoms).length === 0);
const quickIds = quickSymptomIds(kb.symptoms);
test('quick access contains exactly eight reviewed symptoms', quickIds.length === 8 && quickIds.every((id) => kb.symptoms[id].quickAccess));
test('display priority puts immediate danger signs before ordinary symptoms', sortSymptomIds(['dizziness', 'unresponsive'], kb.symptoms)[0] === 'unresponsive');
const scorpionSuggestions = suggestSymptoms(['scorpion_seen'], kb.cases, kb.symptoms, 8);
test('scorpion selection suggests related observable findings', scorpionSuggestions.includes('local_pain') && scorpionSuggestions.includes('local_swelling'));
test('suggestions never repeat an already selected symptom', !scorpionSuggestions.includes('scorpion_seen'));

/* ---------- Related-topic ranking ---------- */
let ranked = rankCases(['saw_snake', 'local_swelling', 'swelling_spreading'], kb.cases);
test('snake signs rank snake-bite first', ranked[0]?.case.id === 'snake-bite');
ranked = rankCases(['scorpion_seen', 'local_pain', 'child_victim'], kb.cases);
test('scorpion signs rank scorpion-sting first', ranked[0]?.case.id === 'scorpion-sting');
ranked = rankCases(['throat_tightness', 'wheezing', 'hives_widespread'], kb.cases);
test('systemic allergic signs rank anaphylaxis first', ranked[0]?.case.id === 'anaphylaxis');
ranked = rankCases(['drowning_recent', 'not_breathing'], kb.cases);
test('water rescue signs rank drowning first', ranked[0]?.case.id === 'drowning');
ranked = rankCases(['facial_droop', 'speech_difficulty'], kb.cases);
test('FAST signs rank stroke first', ranked[0]?.case.id === 'stroke');
ranked = rankCases(['nosebleed'], kb.cases);
test('nosebleed participates in related-topic ranking', ranked[0]?.case.id === 'nosebleed');
ranked = rankCases(['ptosis'], kb.cases);
test('drooping eyelids rank snake-bite as a related topic', ranked[0]?.case.id === 'snake-bite');
const unlinkedSymptoms = Object.keys(kb.symptoms).filter((id) => rankCases([id], kb.cases).length === 0);
test('every selectable symptom surfaces at least one related topic (except the pure assessment marker)', JSON.stringify(unlinkedSymptoms) === JSON.stringify(['conscious']));
test('critical symptom detection includes gasping', hasCriticalSymptoms(['gasping']));
test('a local-pain-only selection is not labelled critical', !hasCriticalSymptoms(['local_pain']));

/* ---------- 115 and red flags ---------- */
test('all suspected snake bites trigger 115', triggeredFlags(kb.cases['snake-bite'], ['local_pain']).emergencyCall === true);
test('all scorpion-sting case results trigger urgent contact', triggeredFlags(kb.cases['scorpion-sting'], []).emergencyCall === true);
test('heat confusion triggers 115', triggeredFlags(kb.cases['heat-illness'], ['confusion']).emergencyCall === true);
test('hot dry skin alone does not satisfy the heatstroke trigger', triggeredFlags(kb.cases['heat-illness'], ['hot_dry_skin']).emergencyCall === false);
test('ordinary shivering alone does not trigger severe hypothermia', triggeredFlags(kb.cases.hypothermia, ['shivering']).emergencyCall === false);
test('stopped shivering triggers severe hypothermia', triggeredFlags(kb.cases.hypothermia, ['shivering_stopped']).emergencyCall === true);
test('seizure over five minutes triggers 115', triggeredFlags(kb.cases.seizure, ['seizure_long']).emergencyCall === true);
test('a nosebleed after head impact triggers 115', triggeredFlags(kb.cases.nosebleed, ['head_impact']).emergencyCall === true);

/* ---------- Clinical safety regressions ---------- */
const text = (id) => `${kb.cases[id].summary} ${kb.cases[id].actions.join(' ')} ${(kb.cases[id].prohibitions || []).join(' ')}`;
test('drowning uses two initial breaths rather than five', text('drowning').includes('۲ تنفس') && !text('drowning').includes('۵ تنفس نجات'));
test('hypothermia explicitly keeps standard CPR depth and rate', text('hypothermia').includes('CPR استاندارد') && !kb.cases.hypothermia.actions.join(' ').includes('فشار کمتر'));
test('choking distinguishes effective from weak cough', text('choking').includes('سرفهٔ ضعیف') && text('choking').includes('سرفهٔ قوی'));
test('choking includes the late-pregnancy chest-thrust path', text('choking').includes('بارداری پیشرفته') && text('choking').includes('فشار قفسهٔ سینه'));
test('anaphylaxis names the mid anterolateral thigh site', text('anaphylaxis').includes('میانهٔ سطح قدامی‌ـ‌بیرونی ران'));
test('head injury says routine waking is unnecessary', text('head-injury').includes('لازم نیست او را مرتب از خواب بیدار کنید'));
test('heatstroke guidance says sweating does not rule it out', text('heat-illness').includes('تعریق زیاد گرمازدگی را رد نمی‌کند'));
test('burn cooling is capped at twenty minutes', text('thermal-burn').includes('تا ۲۰ دقیقه'));
test('bleeding guidance does not describe a tourniquet as a last resort', !text('severe-bleeding').includes('آخرین گزینه'));
test('opioid guidance says naloxone must not delay CPR', text('opioid-overdose').includes('نباید') && text('opioid-overdose').includes('CPR'));
test('Iran snake note names important local species and Razi antivenom', ['Echis carinatus', 'Macrovipera lebetina', 'رازی'].every((term) => kb.cases['snake-bite'].regionalNotes.IR.includes(term)));
test('Iran scorpion note warns that low pain can precede delayed harm', kb.cases['scorpion-sting'].regionalNotes.IR.includes('درد کمی') && kb.cases['scorpion-sting'].regionalNotes.IR.includes('تأخیر'));
const countriesData = JSON.parse(readFileSync(join(root, 'data/countries.json'), 'utf8'));
test('country data passes the shared schema', validateCountryData(countriesData).length === 0);
test('country selector contains all 249 ISO 3166-1 entries', countriesData.countries.length === 249 && new Set(countriesData.countries.map((country) => country.code)).size === 249);
test('56 countries have dated verified contact profiles', Object.keys(countriesData.profiles).length === 56 && Object.values(countriesData.profiles).every((profile) => profile.reviewedAt === '2026-09-07'));
test('every contact profile cites at least one HTTPS official source', Object.values(countriesData.profiles).every((profile) => profile.sources.length && profile.sources.every((source) => source.url.startsWith('https://'))));
test('profiles store only permitted contact, dialing, source, and review fields', Object.values(countriesData.profiles).every((profile) => Object.keys(profile).every((key) => ['ems', 'general', 'poison', 'dialingNote', 'sources', 'reviewedAt'].includes(key))));
test('general emergency contacts explicitly support ambulance dispatch', Object.values(countriesData.profiles).every((profile) => !profile.general || profile.general.usableForAmbulance === true));
test('Iran poison-center profile includes the full 190 route', countriesData.profiles.IR.poison.number === '190' && countriesData.profiles.IR.poison.note.fa.includes('داخلی ۳') && countriesData.profiles.IR.poison.note.fa.includes('کد ۲'));
test('reviewed poison contacts are not invented for countries without one', countriesData.profiles.GB.poison === undefined && countriesData.profiles.DE.poison === undefined);

/* ---------- Manifest integrity ---------- */
const manifest = JSON.parse(readFileSync(join(kbDir, 'manifest.json'), 'utf8'));
test('Persian manifest passes the browser-shared schema', validateManifest(manifest, 'kb').length === 0);
test('updated Persian knowledge base publishes as KB v19', manifest.kbVersion === 19);
test('manifest covers every case exactly once', Object.keys(manifest.cases).length === Object.keys(kb.cases).length);
let hashesMatch = true;
for (const [id, entry] of Object.entries(manifest.cases)) {
  if (sha256(readFileSync(join(kbDir, 'cases', `${id}.json`))) !== entry.hash) hashesMatch = false;
}
for (const [id, filename] of [['__symptoms', 'symptoms.json'], ['__categories', 'categories.json']]) {
  if (sha256(readFileSync(join(kbDir, filename))) !== manifest.entries[id].hash) hashesMatch = false;
}
test('all manifest hashes match source bytes', hashesMatch);
test('manifest URLs are relative and constrained to kb/', [...Object.values(manifest.entries), ...Object.values(manifest.cases)].every((entry) => entry.url.startsWith('kb/') && !entry.url.startsWith('/')));
const enManifest = JSON.parse(readFileSync(join(enKbDir, 'manifest.json'), 'utf8'));
test('English manifest passes schema under its independent root', validateManifest(enManifest, 'kb-en').length === 0);
test('updated English knowledge base publishes as KB v7', enManifest.kbVersion === 7);
test('English manifest covers all 35 shared case IDs', Object.keys(enManifest.cases).length === 35 && Object.keys(enManifest.cases).every((id) => kb.cases[id]));
test('English manifest URLs stay inside the on-demand kb-en root', [...Object.values(enManifest.entries), ...Object.values(enManifest.cases)].every((entry) => entry.url.startsWith('kb-en/') && !entry.url.startsWith('/')));
const badManifest = clone(manifest);
badManifest.cases.fainting.hash = 'not-a-hash';
test('manifest schema rejects malformed SHA-256', validateManifest(badManifest, 'kb').some((error) => error.includes('SHA-256')));

/* ---------- Atomic update and PWA policy ---------- */
const kbSource = readFileSync(join(root, 'js/kb.js'), 'utf8');
const validationIndex = kbSource.indexOf('const validationErrors = validateKnowledgeBase');
const commitIndex = kbSource.indexOf('await replaceLocalSnapshot(this.db, stagedRows, metadata)');
test('full staged KB validation occurs before snapshot commit', validationIndex >= 0 && commitIndex > validationIndex);
test('snapshot replacement uses one readwrite transaction for cases and metadata', kbSource.includes("db.transaction(['cases', 'meta'], 'readwrite')"));
test('stored snapshot requires an exact expected-ID set', kbSource.includes('rowIds.length !== expectedIds.length') && kbSource.includes('metadata.expectedIds'));
test('remote bytes are hashed before JSON is staged', kbSource.indexOf('const actualHash = await sha256(text)') < kbSource.indexOf('const data = parseJson(text, definition.id)'));

const webManifest = JSON.parse(readFileSync(join(root, 'manifest.webmanifest'), 'utf8'));
test('PWA start URL and scope are relative', webManifest.start_url.startsWith('./') && webManifest.scope === './');
const manifestBase = new URL('https://example.test/V2Ng/manifest.webmanifest');
const resolvedStartUrl = new URL(webManifest.start_url, manifestBase);
const resolvedScope = new URL(webManifest.scope, manifestBase);
test('PWA identity is stable and its launch URL remains inside scope', webManifest.id === './' && resolvedStartUrl.href.startsWith(resolvedScope.href) && resolvedStartUrl.searchParams.get('source') === 'pwa' && resolvedStartUrl.hash === '#/');
test('PWA manifest has installable names and standalone display', Boolean(webManifest.name && webManifest.short_name) && webManifest.display === 'standalone' && webManifest.prefer_related_applications === false);
const regularIconSizes = new Set(webManifest.icons.filter((icon) => icon.purpose === 'any').map((icon) => icon.sizes));
const maskableIconSizes = new Set(webManifest.icons.filter((icon) => icon.purpose === 'maskable').map((icon) => icon.sizes));
test('PWA manifest supplies 192 and 512 PNG icons', ['192x192', '512x512'].every((size) => regularIconSizes.has(size)) && webManifest.icons.every((icon) => icon.type === 'image/png'));
test('PWA manifest supplies maskable 192 and 512 icons', ['192x192', '512x512'].every((size) => maskableIconSizes.has(size)));
const serviceWorker = readFileSync(join(root, 'sw.js'), 'utf8');
test('service worker precaches the schema module and shell', serviceWorker.includes('./js/schema.js') && serviceWorker.includes('./index.html'));
test('service worker precaches the versioned install manifest and every app icon', serviceWorker.includes('./manifest.webmanifest?v=14') && webManifest.icons.every((icon) => serviceWorker.includes(`./${icon.src}`)) && serviceWorker.includes('./icons/apple-touch-icon.png'));
test('service worker derives subpath boundaries from registration scope', serviceWorker.includes('self.registration.scope'));
test('service worker deliberately bypasses HTTP caching for both KB languages', serviceWorker.includes('`${scopePath}kb/`') && serviceWorker.includes('`${scopePath}kb-en/`'));
test('service worker only deletes its own cache namespace', serviceWorker.includes('key.startsWith(CACHE_PREFIX)'));
const installSection = serviceWorker.slice(serviceWorker.indexOf("self.addEventListener('install'"), serviceWorker.indexOf("self.addEventListener('message'"));
test('v11 only bypasses waiting to recover incompatible older workers and v5-v9 shell caches', installSection.includes('RECOVERY_WORKER_VERSIONS.has(activeVersion)') && installSection.includes('RECOVERY_SHELL_CACHES.has(key)') && installSection.includes('if (needsRecovery) await self.skipWaiting()') && serviceWorker.includes("new Set([null, '5', '6', '7', '8', '9'])") && ['shell-v5', 'shell-v6', 'shell-v7', 'shell-v8', 'shell-v9'].every((name) => serviceWorker.includes(name)));
test('normal future updates still accept explicit SKIP_WAITING activation messages', serviceWorker.includes("event.data?.type === 'SKIP_WAITING'") && serviceWorker.includes('self.skipWaiting()'));
test('service worker shell cache is v12', serviceWorker.includes("const SHELL_CACHE = `${CACHE_PREFIX}shell-v14`"));
test('service worker uses network-first shell delivery with an offline cache fallback', serviceWorker.includes('async function networkFirst') && serviceWorker.includes("cache: 'no-cache'") && serviceWorker.includes('cache.match(fallbackKey)'));

const html = readFileSync(join(root, 'index.html'), 'utf8');
const appSource = readFileSync(join(root, 'js/app.js'), 'utf8');
const i18nSource = readFileSync(join(root, 'js/i18n.js'), 'utf8');
const preferencesSource = readFileSync(join(root, 'js/preferences.js'), 'utf8');
const bootstrapSource = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
const bootstrapHash = createHash('sha256').update(bootstrapSource).digest('base64');
test('app shell has CSP and polite live regions', html.includes('Content-Security-Policy') && html.includes('route-announcer') && html.includes('sync-announcer'));
test('CSP authorizes exactly the inline recovery bootstrap by hash', bootstrapSource.length > 0 && html.includes(`script-src 'self' 'sha256-${bootstrapHash}'`));
test('HTML links the versioned manifest and explicit Apple touch icon', html.includes('rel="manifest" href="manifest.webmanifest?v=14"') && html.includes('rel="apple-touch-icon"') && html.includes('sizes="180x180"'));
test('HTML enables standalone-capable iOS presentation', html.includes('name="apple-mobile-web-app-capable" content="yes"') && html.includes('name="apple-mobile-web-app-title" content="Emdadgar"'));
test('both locale dictionaries pass the shared locale schema', validateLocaleDictionary(faLocale).length === 0 && validateLocaleDictionary(enLocale).length === 0);
test('Persian and English locale dictionaries have exact key parity', JSON.stringify(Object.keys(faLocale.messages).sort()) === JSON.stringify(Object.keys(enLocale.messages).sort()));
test('application logic contains no embedded Persian UI prose', !/[\u0600-\u06ff]/u.test(appSource));
test('English UI dictionary is loaded dynamically on demand', i18nSource.includes("import('../locales/en.js?v=14')") && !serviceWorker.includes('./locales/en.js?v=14'));
test('Persian UI, country data, and preference modules are available in the offline shell', ['./locales/fa.js?v=14', './data/countries.json?v=14', './js/preferences.js?v=14'].every((asset) => serviceWorker.includes(asset)));
test('first-run settings store independent language and country choices locally', preferencesSource.includes('emdadgar.preferences.v1') && preferencesSource.includes('locale') && preferencesSource.includes('country') && appSource.includes('renderOnboarding'));
test('first-run onboarding exposes a no-save person check path', appSource.includes('id="onboarding-urgent"') && appSource.includes("persist: false, route: '#/assessment'"));
test('settings can change language while retaining shared in-memory symptom IDs', appSource.includes('async function activatePreferences') && appSource.includes("state.diffQuery = ''") && !appSource.includes('state.diffSelected = []', appSource.indexOf('async function activatePreferences')));
test('regional notes render only for the selected country code', appSource.includes('item.regionalNotes?.[preferences.country]'));
test('both interfaces disclose that qualified human review is still pending', faLocale.messages.humanReviewPending.includes('هنوز') && enLocale.messages.humanReviewPending.includes('no review by a medically qualified person'));
test('unverified countries produce generic emergency guidance instead of a guessed phone number', appSource.includes("t('contactsNoProfile')") && appSource.includes("t('emergencyGenericCall')"));
const homeSource = appSource.slice(appSource.indexOf('function renderHome()'), appSource.indexOf('function renderMore()'));
const moreSource = appSource.slice(appSource.indexOf('function renderMore()'), appSource.indexOf('function unsafeSceneMarkup()'));
const assessmentSource = appSource.slice(appSource.indexOf('function renderAssessment()'), appSource.indexOf('function renderTriage()'));
const triageSource = appSource.slice(appSource.indexOf('function renderTriage()'), appSource.indexOf('function defaultEvidenceType('));
const symptomFinderSource = appSource.slice(appSource.indexOf('function symptomChips('), appSource.indexOf('function renderDifferentialResults()'));
const installSetupSource = appSource.slice(appSource.indexOf('function setupInstallCard()'), appSource.indexOf('function resetFinder()'));
test('home offers a single condition assessment entry plus the emergency call, with no duplicate urgent-action flow', homeSource.includes('id="start-assessment"') && homeSource.includes('home-call-action') && homeSource.includes('home-more-link') && !homeSource.includes('id="start-triage"') && !homeSource.includes('id="install-card"') && !homeSource.includes('id="open-kb"') && !homeSource.includes('contactsMarkup'));
test('library, settings, contacts, installation, and limitations moved to the secondary page', moreSource.includes('id="open-kb"') && moreSource.includes('id="open-settings"') && moreSource.includes('contactsMarkup()') && moreSource.includes('id="install-card"') && moreSource.includes("t('limitationText'"));
test('condition assessment requires a safe-scene choice before response capability', assessmentSource.includes("state.assessmentStep === 'scene'") && assessmentSource.includes("state.assessmentStep = button.dataset.scene === 'y' ? 'response' : 'unsafe'"));
test('unsafe or uncertain scene choices never continue to casualty assessment', assessmentSource.includes("data-scene=\"n\"") && assessmentSource.includes("data-scene=\"u\"") && assessmentSource.includes('unsafeSceneMarkup()'));
test('clear, limited, absent, and uncertain response choices are explicit', ['clear', 'limited', 'none', 'unknown'].every((choice) => assessmentSource.includes(`data-response="${choice}"`)));
test('an absent or uncertain response is handed to urgent triage as unresponsive', assessmentSource.includes("state.triageAnswers = { sceneSafe: 'y', conscious: 'n' }"));
test('assessment exposes separate home and previous-step buttons', assessmentSource.includes('id="back-step"') && assessmentSource.includes('id="back-home"') && assessmentSource.includes("state.assessmentStep = 'scene'"));
test('urgent questions continue the assessment with continuous step numbering', triageSource.includes('state.triageSeedCount > 0 ? answered - state.triageSeedCount + 3 : answered + 1') && triageSource.includes("t('assessmentEyebrow'"));
test('Chromium install prompt is deferred until the install button is clicked', appSource.includes("window.addEventListener('beforeinstallprompt'") && appSource.includes('event.preventDefault()') && appSource.includes('deferredInstallPrompt = event') && installSetupSource.includes('await prompt.prompt()') && installSetupSource.includes('await prompt.userChoice'));
test('successful installation and standalone mode hide the install card', appSource.includes("window.addEventListener('appinstalled'") && appSource.includes("standaloneDisplay.matches || navigator.standalone === true") && appSource.includes("return 'installed'"));
test('iPhone fallback gives Safari Add to Home Screen instructions', appSource.includes('isIosDevice') && enLocale.messages.installIos3.includes('Add to Home Screen') && enLocale.messages.installIos4.includes('Open as Web App'));
test('symptom chips expose aria-pressed', appSource.includes('aria-pressed="${active}"'));
test('step-back undoes one triage answer and returns to the response step after the seeded answers', triageSource.includes('id="back-step"') && triageSource.includes('state.triageAsked.pop()') && triageSource.includes("state.assessmentStep = 'response'"));
test('system back at the app entry asks before exiting, but in-app hash navigation never triggers it', appSource.includes('emdExitGuard') && appSource.includes('exitConfirmTitle') && appSource.includes("window.addEventListener('popstate'") && appSource.includes('exitGuardSupported') && appSource.includes('history.state === null'));
test('symptom UI filters incompatible current options', appSource.includes('isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms)'));
test('symptom UI separates earlier reports from current observations', symptomFinderSource.includes("t('historicalHeading')") && symptomFinderSource.includes('data-history-sym'));
test('related-topic ranking includes current and historical selections', appSource.includes('[...state.diffSelected, ...state.diffHistorical]'));
test('router guards malformed URI decoding', appSource.includes('decodeURIComponent') && appSource.includes('} catch {'));
test('background KB synchronization is started after cached load', appSource.includes('if (loadResult?.fromCache) backgroundSync()'));
test('a newly synced symptom index refreshes the open symptom finder', appSource.includes("['home', 'more', 'kb', 'symptoms'].includes(route.name)"));
test('rendered KB values pass through HTML escaping', appSource.includes('${e(item.title)}') && appSource.includes('${em(action)}'));

const cssSource = readFileSync(join(root, 'css/app.css'), 'utf8');
test('install card remains bounded and touch-sized on the secondary page', cssSource.includes('.install-card {') && cssSource.includes('.install-card-heading > div { flex: 1; min-width: 0; }') && moreSource.includes('class="btn outline full"'));

/* ---------- Observation-first symptom finder ---------- */
test('medical topic category controls are absent from the scene workflow', !symptomFinderSource.includes('category-tabs') && !symptomFinderSource.includes('category-select') && !symptomFinderSource.includes('kb.categories'));
test('finder renders observation, person-report, scene-clue, and background sections from evidence metadata', ['observed', 'reported', 'scene', 'background'].every((type) => symptomFinderSource.includes(`evidenceSection('${type}'`)) && symptomFinderSource.includes('symptomHasEvidence'));
test('known scene events are offered before the longer observation and interview lists', symptomFinderSource.indexOf("evidenceSection('scene'") < symptomFinderSource.indexOf("evidenceSection('observed'") && symptomFinderSource.indexOf("evidenceSection('observed'") < symptomFinderSource.indexOf("evidenceSection('reported'"));
test('person-reported questions render only when clear answers are possible', symptomFinderSource.includes("responseClear ? evidenceSection('reported'") && symptomFinderSource.includes("state.responseMode === 'limited'"));
test('changing to limited response moves person-reported selections into history when allowed', appSource.includes("if (mode === 'limited')") && appSource.includes("state.diffSources[id] === 'reported'") && appSource.includes('canBeHistoricalReport(id)') && appSource.includes('state.diffHistorical.push(id)'));
test('a dual-source nausea report can be retained as history without treating observed vomiting as subjective', kb.symptoms.nausea_vomiting.reportedCanBeHistorical === true && appSource.includes("state.diffSources[id] === 'reported'"));
test('selecting unresponsiveness immediately switches off current person-report questions', appSource.includes("symptomId === 'unresponsive'") && appSource.includes("applyResponseMode('limited', { preserve: true })"));
test('each evidence section uses progressive disclosure without horizontal category navigation', symptomFinderSource.includes('EVIDENCE_LIMITS') && symptomFinderSource.includes('data-expand') && symptomFinderSource.includes('data-collapse') && !appSource.includes('scrollLeft'));
test('global offline search is labelled and has a clear action', symptomFinderSource.includes('id="symptom-search"') && symptomFinderSource.includes('id="clear-search"') && symptomFinderSource.includes("t('symptomsSearchHelp')"));
test('typing updates search results without rerendering the input', symptomFinderSource.includes("input.addEventListener('input', update)") && symptomFinderSource.includes('searchPanel.innerHTML = searchResultsMarkup(input.value)'));
test('search results pass through response-source and compatibility rules', symptomFinderSource.includes('currentEvidenceAvailable(id)') && symptomFinderSource.includes('isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms)'));
test('search results are grouped by responder observation, person report, scene, and background source', ['sourceScene', 'sourceObserved', 'sourceReported', 'sourceBackground'].every((key) => symptomFinderSource.includes(key)) && symptomFinderSource.includes("symptomChips(ids, state.diffSelected, 'data-sym', source)"));
test('limited-response search offers report-only matches as earlier history', symptomFinderSource.includes("searchHistoricalResults") && symptomFinderSource.includes("symptomHasEvidence(id, 'reported')") && symptomFinderSource.includes('canBeHistorical'));
test('selected current and historical evidence stays in a removable tray', symptomFinderSource.includes('class="selected-tray"') && symptomFinderSource.includes('id="clear-symptoms"') && symptomFinderSource.includes("'data-history-sym'"));
test('related suggestions are explicitly not presented as diagnosis', symptomFinderSource.includes("t('suggestedTitle')") && symptomFinderSource.includes("t('suggestedHelp')"));
test('mobile result action remains reachable without horizontal movement', cssSource.includes('.symptom-result-bar') && cssSource.includes('position: sticky'));
test('source cards, search, selection tray, and suggestions have responsive styling', ['.evidence-section', '.response-mode-card', '.symptom-search-card', '.selected-tray', '.suggested-symptoms'].every((selector) => cssSource.includes(selector)));

/* ---------- User-controlled app updates ---------- */
test('versioned v11 shell assets bypass an older cache during this upgrade', html.includes('css/app.css?v=14') && html.includes('js/app.js?v=14') && serviceWorker.includes('./css/app.css?v=14') && serviceWorker.includes('./js/app.js?v=14'));
test('every browser module dependency is versioned together', appSource.includes("'./kb.js?v=14'") && appSource.includes("'./engine.js?v=14'") && kbSource.includes("'./schema.js?v=14'") && serviceWorker.includes('./js/kb.js?v=14') && serviceWorker.includes('./js/engine.js?v=14') && serviceWorker.includes('./js/schema.js?v=14'));
test('independent inline bootstrap replaces an indefinitely stuck loader', bootstrapSource.includes('setTimeout(showLoadFailure, 20000)') && bootstrapSource.includes('boot-retry') && bootstrapSource.includes('location.reload()') && appSource.includes("'emdadgar:boot-complete'"));
test('the update banner is outside the rerendered app shell', html.indexOf('id="app-update"') < html.indexOf('id="app"'));
test('the update banner offers now and later actions', html.includes('id="app-update-now"') && html.includes('id="app-update-later"'));
test('registration bypasses HTTP cache when checking the worker', appSource.includes("updateViaCache: 'none'") && appSource.includes("register('./sw.js?v=14'"));
test('an already waiting worker is offered immediately', appSource.includes('if (registration.waiting) offerAppUpdate(registration.waiting)'));
test('new worker installation is observed', appSource.includes("registration.addEventListener('updatefound'"));
test('updates activate only after the user requests them', appSource.includes("worker.postMessage({ type: 'SKIP_WAITING' })") && appSource.includes("appUpdateNow?.addEventListener('click'"));
test('later dismisses the same waiting worker for the remainder of the session', appSource.includes('const isNewWorker = waitingServiceWorker !== worker') && appSource.includes('if (isNewWorker) updateDismissed = false') && appSource.includes('updateDismissed = true'));
test('controller change reload is guarded against loops and unsolicited activation', appSource.includes('if (!updateActivationRequested || reloadingForUpdate) return') && appSource.includes('reloadingForUpdate = true') && appSource.includes('location.reload()'));
test('update banner is withheld from active emergency and symptom flows', appSource.includes("['home', 'more', 'kb', 'settings'].includes(currentRoute().name)"));
test('returning to the foreground checks for updates with throttling', appSource.includes("document.addEventListener('visibilitychange'") && appSource.includes('UPDATE_CHECK_INTERVAL'));

/* ---------- Browser startup smoke tests ---------- */
const onboardingSmoke = spawnSync(process.execPath, [join(root, 'test/app-smoke.mjs'), 'onboarding'], { encoding: 'utf8' });
test('real app module renders first-run language/country onboarding', onboardingSmoke.status === 0, onboardingSmoke.stderr);
const englishSmoke = spawnSync(process.execPath, [join(root, 'test/app-smoke.mjs'), 'english'], { encoding: 'utf8' });
test('real app module starts in English and reopens its KB offline', englishSmoke.status === 0, englishSmoke.stderr);

/* ---------- Tool robustness ---------- */
const badArgs = spawnSync(process.execPath, [join(root, 'tools/build-manifest.mjs'), '--unknown'], { encoding: 'utf8' });
test('manifest builder rejects unknown flags', badArgs.status === 2);
const temp = mkdtempSync(join(tmpdir(), 'emdadgar-invalid-'));
try {
  mkdirSync(join(temp, 'cases'));
  writeFileSync(join(temp, 'symptoms.json'), '{ broken');
  writeFileSync(join(temp, 'categories.json'), '{}');
  const invalidRun = spawnSync(process.execPath, [join(root, 'tools/validate.mjs'), temp], { encoding: 'utf8' });
  test('validator reports malformed JSON without crashing ambiguously', invalidRun.status === 1 && invalidRun.stderr.includes('symptoms.json'));
} finally {
  rmSync(temp, { recursive: true, force: true });
}

/* ---------- Icons ---------- */
function pngSize(path) {
  const data = readFileSync(path);
  if (data.subarray(1, 4).toString() !== 'PNG') return null;
  return [data.readUInt32BE(16), data.readUInt32BE(20)];
}
test('192 app icon has correct PNG dimensions', pngSize(join(root, 'icons/icon-192.png'))?.join('x') === '192x192');
test('512 maskable icon has correct PNG dimensions', pngSize(join(root, 'icons/maskable-512.png'))?.join('x') === '512x512');
const iconHash = createHash('sha256').update(readFileSync(join(root, 'icons/icon-192.png'))).digest('hex');
const maskableHash = createHash('sha256').update(readFileSync(join(root, 'icons/maskable-192.png'))).digest('hex');
test('regular and maskable icon assets are independently generated', iconHash !== maskableHash);

/* ---------- Report ---------- */
const total = passed + failures.length;
if (failures.length) {
  console.error(`\n❌ ${failures.length}/${total} failed:`);
  for (const failure of failures) console.error(`  - ${failure}`);
  process.exit(1);
}
console.log(`✅ ${passed}/${total} tests passed`);
