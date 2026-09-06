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
import { validateKnowledgeBase, validateManifest } from '../js/schema.js';
import { sha256, validateAll } from '../tools/validate.mjs';

const root = join(dirname(fileURLToPath(import.meta.url)), '..');
const kbDir = join(root, 'kb');
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
test('KB contains exactly 29 cases', Object.keys(kb.cases).length === 29);
test('all 8 categories are present', Object.keys(kb.categories).length === 8);
test('each category exposes selectable symptoms', Object.values(kb.categories).every((category) => category.diffSymptoms.length > 0));
test('every case cites a source', Object.values(kb.cases).every((item) => item.sources.length > 0));
test('every case has explicit 115 guidance', Object.values(kb.cases).every((item) => typeof item.call115?.always === 'boolean' && item.call115.text));
test('all case files use the reviewed content version', Object.values(kb.cases).every((item) => item.version >= 2));
test('all risk questions render a known symptom label', Object.values(kb.cases).every((item) => item.riskQuestions.every((id) => kb.symptoms[id]?.label)));

const invalidCaseKb = clone(kb.cases);
invalidCaseKb['cardiac-arrest'].actions = [];
test('schema rejects an empty action list', validateKnowledgeBase(kb.symptoms, kb.categories, invalidCaseKb).some((error) => error.includes('actions')));
const invalidReferenceKb = clone(kb.cases);
invalidReferenceKb.fainting.call115.when.push('not_selectable_here');
test('schema rejects an unknown trigger', validateKnowledgeBase(kb.symptoms, kb.categories, invalidReferenceKb).some((error) => error.includes('unknown symptom')));
const hiddenTriggerKb = clone(kb.cases);
hiddenTriggerKb.fainting.call115.when.push('cyanosis');
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
const invalidDisplayPrioritySymptoms = clone(kb.symptoms);
invalidDisplayPrioritySymptoms.dizziness.displayPriority = 101;
test('schema bounds symptom display priority', validateKnowledgeBase(invalidDisplayPrioritySymptoms, kb.categories, kb.cases).some((error) => error.includes('displayPriority')));
const excessiveQuickSymptoms = clone(kb.symptoms);
Object.values(excessiveQuickSymptoms).slice(0, 11).forEach((symptom) => { symptom.quickAccess = true; });
test('schema limits the quick-access list', validateKnowledgeBase(excessiveQuickSymptoms, kb.categories, kb.cases).some((error) => error.includes('quickAccess must be limited')));

/* ---------- Triage integration ---------- */
test('triage starts with consciousness', nextTriageQuestion({}) === 'conscious');
test('a conscious person is still checked for severe choking', nextTriageQuestion({ conscious: 'y' }) === 'choking');
test('after no choking, severe breathing difficulty is checked', nextTriageQuestion({ conscious: 'y', choking: 'n' }) === 'breathingDifficulty');
test('after normal airway/breathing, severe bleeding is checked', nextTriageQuestion({ conscious: 'y', choking: 'n', breathingDifficulty: 'n' }) === 'bleeding');
test('an unresponsive breathing person is still checked for bleeding', nextTriageQuestion({ conscious: 'n', breathing: 'y' }) === 'bleeding');
test('unresponsive + no normal breathing routes to cardiac arrest', triageRoute({ conscious: 'n', breathing: 'n' }) === 'cardiac-arrest');
test('unresponsive + breathing + severe bleeding routes to bleeding control', triageRoute({ conscious: 'n', breathing: 'y', bleeding: 'y' }) === 'severe-bleeding');
test('unresponsive + breathing + no severe bleeding routes to recovery-position guidance', triageRoute({ conscious: 'n', breathing: 'y', bleeding: 'n' }) === 'unresponsive-breathing');
test('severe choking routes immediately', triageRoute({ conscious: 'y', choking: 'y' }) === 'choking');
test('severe breathing difficulty routes immediately', triageRoute({ conscious: 'y', choking: 'n', breathingDifficulty: 'y' }) === 'breathing-difficulty');
test('all immediate checks negative routes to symptom browser', triageRoute({ conscious: 'y', choking: 'n', breathingDifficulty: 'n', bleeding: 'n' }) === 'symptoms');
test('triage answers map to real KB symptom IDs', triageSymptoms({ conscious: 'y', choking: 'y' }).every((id) => kb.symptoms[id]));

const models = symptomModels(kb.categories.bite.diffSymptoms, kb.symptoms);
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

/* ---------- Fast symptom discovery ---------- */
test('every symptom provides reviewed Persian search aliases', Object.values(kb.symptoms).every((symptom) => symptom.aliases?.length));
test('Persian search normalizes Arabic letters and zero-width separators', normalizePersianSearch('  نفس‌تنگي و كاهش  ') === 'نفس تنگی و کاهش');
test('search finds nosebleed by its common Persian alias', searchSymptoms('خون دماغ', kb.symptoms)[0] === 'nosebleed');
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
test('critical symptom detection includes gasping', hasCriticalSymptoms(['gasping']));
test('a local-pain-only selection is not labelled critical', !hasCriticalSymptoms(['local_pain']));

/* ---------- 115 and red flags ---------- */
test('all suspected snake bites trigger 115', triggeredFlags(kb.cases['snake-bite'], ['local_pain']).call115 === true);
test('all scorpion-sting case results trigger urgent contact', triggeredFlags(kb.cases['scorpion-sting'], []).call115 === true);
test('heat confusion triggers 115', triggeredFlags(kb.cases['heat-illness'], ['confusion']).call115 === true);
test('hot dry skin alone does not satisfy the heatstroke trigger', triggeredFlags(kb.cases['heat-illness'], ['hot_dry_skin']).call115 === false);
test('ordinary shivering alone does not trigger severe hypothermia', triggeredFlags(kb.cases.hypothermia, ['shivering']).call115 === false);
test('stopped shivering triggers severe hypothermia', triggeredFlags(kb.cases.hypothermia, ['shivering_stopped']).call115 === true);
test('seizure over five minutes triggers 115', triggeredFlags(kb.cases.seizure, ['seizure_long']).call115 === true);
test('a nosebleed after head impact triggers 115', triggeredFlags(kb.cases.nosebleed, ['head_impact']).call115 === true);

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
test('Iran snake note names important local species and Razi antivenom', ['Echis carinatus', 'Macrovipera lebetina', 'رازی'].every((term) => kb.cases['snake-bite'].nationalNote.includes(term)));
test('Iran scorpion note warns that low pain can precede delayed harm', kb.cases['scorpion-sting'].nationalNote.includes('درد کمی') && kb.cases['scorpion-sting'].nationalNote.includes('تأخیر'));
test('Iran poison-center instructions include the full 190 route', kb.cases.poisoning.nationalNote.includes('۱۹۰') && kb.cases.poisoning.nationalNote.includes('داخلی ۳') && kb.cases.poisoning.nationalNote.includes('کد ۲'));

/* ---------- Manifest integrity ---------- */
const manifest = JSON.parse(readFileSync(join(kbDir, 'manifest.json'), 'utf8'));
test('manifest passes the browser-shared schema', validateManifest(manifest).length === 0);
test('search metadata publishes as KB v5 with symptoms entry v4', manifest.kbVersion === 5 && manifest.entries.__symptoms.version === 4);
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
const badManifest = clone(manifest);
badManifest.cases.fainting.hash = 'not-a-hash';
test('manifest schema rejects malformed SHA-256', validateManifest(badManifest).some((error) => error.includes('SHA-256')));

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
test('service worker precaches the versioned install manifest and every app icon', serviceWorker.includes('./manifest.webmanifest?v=9') && webManifest.icons.every((icon) => serviceWorker.includes(`./${icon.src}`)) && serviceWorker.includes('./icons/apple-touch-icon.png'));
test('service worker derives subpath boundaries from registration scope', serviceWorker.includes('self.registration.scope'));
test('service worker deliberately bypasses HTTP caching for KB', serviceWorker.includes('if (url.pathname.startsWith(`${scopePath}kb/`)) return'));
test('service worker only deletes its own cache namespace', serviceWorker.includes('key.startsWith(CACHE_PREFIX)'));
const installSection = serviceWorker.slice(serviceWorker.indexOf("self.addEventListener('install'"), serviceWorker.indexOf("self.addEventListener('message'"));
test('v9 only bypasses waiting to recover incompatible older workers and v5-v8 shell caches', installSection.includes('RECOVERY_WORKER_VERSIONS.has(activeVersion)') && installSection.includes('RECOVERY_SHELL_CACHES.has(key)') && installSection.includes('if (needsRecovery) await self.skipWaiting()') && serviceWorker.includes("new Set([null, '5', '6', '7', '8'])") && ['shell-v5', 'shell-v6', 'shell-v7', 'shell-v8'].every((name) => serviceWorker.includes(name)));
test('normal future updates still accept explicit SKIP_WAITING activation messages', serviceWorker.includes("event.data?.type === 'SKIP_WAITING'") && serviceWorker.includes('self.skipWaiting()'));
test('service worker shell cache is v9', serviceWorker.includes("const SHELL_CACHE = `${CACHE_PREFIX}shell-v9`"));
test('service worker uses network-first shell delivery with an offline cache fallback', serviceWorker.includes('async function networkFirst') && serviceWorker.includes("cache: 'no-cache'") && serviceWorker.includes('cache.match(fallbackKey)'));

const html = readFileSync(join(root, 'index.html'), 'utf8');
const appSource = readFileSync(join(root, 'js/app.js'), 'utf8');
const bootstrapSource = html.match(/<script>([\s\S]*?)<\/script>/)?.[1] || '';
const bootstrapHash = createHash('sha256').update(bootstrapSource).digest('base64');
test('app shell has CSP and polite live regions', html.includes('Content-Security-Policy') && html.includes('route-announcer') && html.includes('sync-announcer'));
test('CSP authorizes exactly the inline recovery bootstrap by hash', bootstrapSource.length > 0 && html.includes(`script-src 'self' 'sha256-${bootstrapHash}'`));
test('HTML links the versioned manifest and explicit Apple touch icon', html.includes('rel="manifest" href="manifest.webmanifest?v=9"') && html.includes('rel="apple-touch-icon"') && html.includes('sizes="180x180"'));
test('HTML enables standalone-capable iOS presentation', html.includes('name="apple-mobile-web-app-capable" content="yes"') && html.includes('name="apple-mobile-web-app-title" content="امدادگر"'));
const homeSource = appSource.slice(appSource.indexOf('function renderHome()'), appSource.indexOf('function renderTriage()'));
const installSetupSource = appSource.slice(appSource.indexOf('function setupInstallCard()'), appSource.indexOf('function renderHome()'));
test('install UI appears only on the non-emergency home screen', homeSource.includes('id="install-card"') && homeSource.includes('setupInstallCard()') && appSource.match(/id="install-card"/g)?.length === 1);
test('Chromium install prompt is deferred until the install button is clicked', appSource.includes("window.addEventListener('beforeinstallprompt'") && appSource.includes('event.preventDefault()') && appSource.includes('deferredInstallPrompt = event') && installSetupSource.includes('await prompt.prompt()') && installSetupSource.includes('await prompt.userChoice'));
test('successful installation and standalone mode hide the install card', appSource.includes("window.addEventListener('appinstalled'") && appSource.includes("standaloneDisplay.matches || navigator.standalone === true") && appSource.includes("return 'installed'"));
test('iPhone fallback gives Safari Add to Home Screen instructions', appSource.includes('isIosDevice') && appSource.includes('Add to Home Screen') && appSource.includes('Open as Web App'));
test('symptom chips expose aria-pressed', appSource.includes('aria-pressed="${active}"'));
test('symptom UI filters incompatible current options', appSource.includes('isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms)'));
test('symptom UI separates historical observations', appSource.includes('پیش از بیهوشی یا توقف تنفس') && appSource.includes('data-history-sym'));
test('related-topic ranking includes current and historical selections', appSource.includes('[...state.diffSelected, ...state.diffHistorical]'));
test('router guards malformed URI decoding', appSource.includes('decodeURIComponent') && appSource.includes('} catch {'));
test('background KB synchronization is started after cached load', appSource.includes('if (result.fromCache) backgroundSync()'));
test('a newly synced symptom index refreshes the open symptom finder', appSource.includes("['home', 'kb', 'symptoms'].includes(route.name)"));
test('rendered KB values pass through HTML escaping', appSource.includes('${e(item.title)}') && appSource.includes('${e(action)}'));

const cssSource = readFileSync(join(root, 'css/app.css'), 'utf8');
test('install card has bounded responsive styling and touch-sized action', cssSource.includes('.install-card {') && cssSource.includes('.install-card-heading > div { flex: 1; min-width: 0; }') && homeSource.includes('class="btn outline full"'));

/* ---------- Responsive symptom categories ---------- */
test('desktop category buttons are an accessible labelled group', appSource.includes('id="category-tabs"') && appSource.includes('role="group"') && appSource.includes('aria-label="دسته‌های نشانه‌ها"'));
test('desktop category buttons expose their pressed state', appSource.includes('data-cat="${e(id)}"') && appSource.includes('aria-pressed="${active}"'));
test('mobile category select has a visible associated label', appSource.includes('for="category-select"') && appSource.includes('id="category-select"') && appSource.includes('انتخاب دستهٔ نشانه‌ها'));
test('category options are generated from the same data as desktop controls', appSource.includes('const categoryItems = [') && appSource.includes('...categoryIds.map') && appSource.includes('const categoryOptions = categoryItems.map'));
test('quick and selected virtual categories are available in both responsive controls', appSource.includes("{ id: QUICK_CATEGORY, label: '★ پرکاربرد' }") && appSource.includes('{ id: SELECTED_CATEGORY, label: `✓ انتخاب‌شده‌ها (${selectionCount})` }'));
test('both category controls update the shared category state', appSource.includes('selectSymptomCategory(button.dataset.cat)') && appSource.includes("select.addEventListener('change', () => selectSymptomCategory(select.value))"));
test('category selection preserves symptom selections', !appSource.slice(appSource.indexOf('function selectSymptomCategory'), appSource.indexOf('function setupCategoryControls')).includes('diffSelected'));
test('desktop categories wrap instead of scrolling horizontally', cssSource.includes('.category-tabs') && cssSource.includes('flex-wrap: wrap'));
test('mobile switches from wrapped buttons to a full-width select', cssSource.includes('@media (max-width: 600px)') && cssSource.includes('.category-tabs { display: none; }') && cssSource.includes('.category-select-label, .category-select { display: block; }'));
test('category fieldset cannot widen the page', cssSource.includes('min-inline-size: 0') && cssSource.includes('.category-fieldset'));
test('obsolete RTL category scroll code is gone', !appSource.includes('scrollLeft') && !appSource.includes('scrollIntoView') && !appSource.includes("addEventListener('wheel'") && !appSource.includes('category-prev'));

/* ---------- Fast symptom-finder UI ---------- */
test('global offline symptom search is labelled and has a clear action', appSource.includes('id="symptom-search"') && appSource.includes('id="clear-search"') && appSource.includes('جست‌وجو در همهٔ دسته‌ها و به‌صورت آفلاین'));
test('typing updates search results without rerendering the input', appSource.includes("input.addEventListener('input', update)") && appSource.includes('searchPanel.innerHTML = searchResultsMarkup(input.value)'));
test('search results still pass through compatibility visibility rules', appSource.includes("searchSymptoms(query, kb.symptoms)\n    .filter((id) => isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms))"));
test('selected current and historical symptoms stay in a removable tray', appSource.includes('class="selected-tray"') && appSource.includes('id="clear-symptoms"') && appSource.includes("'data-history-sym'"));
test('related suggestions are explicitly not presented as diagnosis', appSource.includes('نشانه‌های مرتبط برای بررسی') && appSource.includes('تشخیص یا انتخاب خودکار نیستند'));
test('long category lists use progressive disclosure', appSource.includes('INITIAL_SYMPTOM_LIMIT = 12') && appSource.includes('id="show-more-symptoms"') && appSource.includes('id="show-less-symptoms"'));
test('mobile result action remains reachable without horizontal movement', cssSource.includes('.symptom-result-bar') && cssSource.includes('position: sticky'));
test('search, selected tray, suggestions and show-more controls have responsive styling', ['.symptom-search-card', '.selected-tray', '.suggested-symptoms', '.show-more-symptoms'].every((selector) => cssSource.includes(selector)));

/* ---------- User-controlled app updates ---------- */
test('versioned v9 shell assets bypass an older cache during this upgrade', html.includes('css/app.css?v=9') && html.includes('js/app.js?v=9') && serviceWorker.includes('./css/app.css?v=9') && serviceWorker.includes('./js/app.js?v=9'));
test('every browser module dependency is versioned together', appSource.includes("'./kb.js?v=9'") && appSource.includes("'./engine.js?v=9'") && kbSource.includes("'./schema.js?v=9'") && serviceWorker.includes('./js/kb.js?v=9') && serviceWorker.includes('./js/engine.js?v=9') && serviceWorker.includes('./js/schema.js?v=9'));
test('independent inline bootstrap replaces an indefinitely stuck loader', bootstrapSource.includes('setTimeout(showLoadFailure, 20000)') && bootstrapSource.includes('boot-retry') && bootstrapSource.includes('location.reload()') && appSource.includes("'emdadgar:boot-complete'"));
test('the update banner is outside the rerendered app shell', html.indexOf('id="app-update"') < html.indexOf('id="app"'));
test('the update banner offers now and later actions', html.includes('id="app-update-now"') && html.includes('id="app-update-later"'));
test('registration bypasses HTTP cache when checking the worker', appSource.includes("updateViaCache: 'none'") && appSource.includes("register('./sw.js?v=9'"));
test('an already waiting worker is offered immediately', appSource.includes('if (registration.waiting) offerAppUpdate(registration.waiting)'));
test('new worker installation is observed', appSource.includes("registration.addEventListener('updatefound'"));
test('updates activate only after the user requests them', appSource.includes("worker.postMessage({ type: 'SKIP_WAITING' })") && appSource.includes("appUpdateNow?.addEventListener('click'"));
test('later dismisses the same waiting worker for the remainder of the session', appSource.includes('const isNewWorker = waitingServiceWorker !== worker') && appSource.includes('if (isNewWorker) updateDismissed = false') && appSource.includes('updateDismissed = true'));
test('controller change reload is guarded against loops and unsolicited activation', appSource.includes('if (!updateActivationRequested || reloadingForUpdate) return') && appSource.includes('reloadingForUpdate = true') && appSource.includes('location.reload()'));
test('update banner is withheld from active emergency and symptom flows', appSource.includes("['home', 'kb'].includes(currentRoute().name)"));
test('returning to the foreground checks for updates with throttling', appSource.includes("document.addEventListener('visibilitychange'") && appSource.includes('UPDATE_CHECK_INTERVAL'));

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
