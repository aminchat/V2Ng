import { KnowledgeBase } from './kb.js?v=10';
import { countryName, formatDateTime, formatNumber, localeCode, localizeField, setLocale, t } from './i18n.js?v=10';
import { emergencyContact, loadCountryData, readPreferences, savePreferences, telephoneHref } from './preferences.js?v=10';
import {
  setEngineLocale,
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
} from './engine.js?v=10';

let kb = null;
let countryData = null;
let preferences = { locale: 'fa', country: '' };
let onboardingChoice = { locale: 'fa', country: '' };
const app = document.getElementById('app');
const routeAnnouncer = document.getElementById('route-announcer');
const syncAnnouncer = document.getElementById('sync-announcer');
const appUpdateBanner = document.getElementById('app-update');
const appUpdateNow = document.getElementById('app-update-now');
const appUpdateLater = document.getElementById('app-update-later');
const standaloneDisplay = window.matchMedia('(display-mode: standalone)');

let deferredInstallPrompt = null;
let installInstructionsExpanded = false;
let installCompleted = standaloneDisplay.matches || navigator.standalone === true;

const isIosDevice = () => /iPad|iPhone|iPod/i.test(navigator.userAgent)
  || (navigator.platform === 'MacIntel' && navigator.maxTouchPoints > 1);
const isLikelyMobile = () => navigator.userAgentData?.mobile === true
  || /Android|Mobile|iPad|iPhone|iPod/i.test(navigator.userAgent);

window.addEventListener('beforeinstallprompt', (event) => {
  event.preventDefault();
  deferredInstallPrompt = event;
  installInstructionsExpanded = false;
  refreshInstallCard();
});

window.addEventListener('appinstalled', () => {
  deferredInstallPrompt = null;
  installCompleted = true;
  refreshInstallCard();
  showSyncAnnouncement(t('installSuccess'));
});

standaloneDisplay.addEventListener?.('change', (event) => {
  installCompleted = event.matches;
  refreshInstallCard();
});

const QUICK_CATEGORY = '__quick';
const SELECTED_CATEGORY = '__selected';
const INITIAL_SYMPTOM_LIMIT = 12;

const state = {
  ready: false,
  fatalError: null,
  triageAnswers: {},
  triageContext: null,
  caseId: null,
  caseAnswers: [],
  caseStage: 'questions',
  diffCategory: QUICK_CATEGORY,
  diffSelected: [],
  diffHistorical: [],
  diffCompatibilityMessage: '',
  diffQuery: '',
  diffShowAll: false,
  diffStage: 'questions',
  lastRouteName: null,
  preparedCaseId: null,
  settingsMessage: '',
};

const e = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

const caseHref = (id) => `#/case/${encodeURIComponent(id)}`;

function activeProfile(country = preferences.country) {
  return countryData?.profiles?.[country] || null;
}

function localizedPhone(number) {
  return String(number || '').replace(/\d/g, (digit) => formatNumber(Number(digit)));
}

function emergencyDetails(country = preferences.country) {
  const contact = emergencyContact(activeProfile(country));
  return contact ? { ...contact, display: localizedPhone(contact.number), href: telephoneHref(contact.number) } : null;
}

function emergencyName(country = preferences.country) {
  return emergencyDetails(country)?.display || t('emergencyGeneric');
}

function emergencyButton(className = 'btn emergency full', country = preferences.country) {
  const contact = emergencyDetails(country);
  if (!contact) return `<span class="${className} emergency-unavailable" role="note">${e(t('emergencyGenericCall'))}</span>`;
  return `<a class="${className}" href="${e(contact.href)}" aria-label="${e(t('emergencyCallAria', { number: contact.display }))}">${e(t('emergencyCall', { number: contact.display }))}</a>`;
}

function miniEmergencyButton() {
  const contact = emergencyDetails();
  if (!contact) return `<a class="mini-call" href="#/settings" aria-label="${e(t('settingsAria'))}">SOS</a>`;
  return `<a class="mini-call" href="${e(contact.href)}" aria-label="${e(t('emergencyCallAria', { number: contact.display }))}">${e(contact.display)}</a>`;
}

const em = (value = '') => e(value);

function localizedCountryName(code) {
  const fallback = countryData?.countries?.find((item) => item.code === code)?.name || code;
  return countryName(code, fallback);
}

function countryOptions(selected = preferences.country) {
  const collator = new Intl.Collator(localeCode() === 'fa' ? 'fa' : 'en');
  const rows = (countryData?.countries || []).map(({ code, name }) => ({
    code,
    label: countryName(code, name),
  })).sort((a, b) => collator.compare(a.label, b.label));
  return `<option value="">${e(t('countryPlaceholder'))}</option>${rows.map(({ code, label }) => (
    `<option value="${e(code)}"${code === selected ? ' selected' : ''}>${e(label)}</option>`
  )).join('')}`;
}

function contactsMarkup(country = preferences.country, { showSources = false } = {}) {
  const profile = activeProfile(country);
  if (!profile) return `<section class="contact-card"><h2>${e(t('contactsTitle'))}</h2><p>${e(t('contactsNoProfile'))}</p></section>`;
  const rows = [];
  if (profile.ems) rows.push([t('contactsEms'), profile.ems]);
  if (profile.general) rows.push([t('contactsGeneral'), profile.general]);
  if (profile.poison) rows.push([t('contactsPoison'), profile.poison]);
  return `<section class="contact-card">
    <h2>${e(t('contactsTitle'))}</h2>
    <dl>${rows.map(([label, contact]) => `<div><dt>${e(label)}</dt><dd><a href="${e(telephoneHref(contact.number))}" dir="ltr">${e(localizedPhone(contact.number))}</a>${contact.note ? `<small>${e(localizeField(contact.note))}</small>` : ''}</dd></div>`).join('')}</dl>
    <p>${e(localizeField(profile.dialingNote))}</p>
    <small>${e(t('contactsReviewed', { date: profile.reviewedAt }))}</small>
    ${showSources ? `<details><summary>${e(t('contactsSources'))}</summary><ul>${profile.sources.map((source) => `<li><a href="${e(source.url)}" target="_blank" rel="noopener noreferrer">${e(source.title)}</a></li>`).join('')}</ul></details>` : ''}
  </section>`;
}

function currentRoute() {
  const hash = location.hash || '#/';
  if (hash === '#/' || hash === '#') return { name: 'home' };
  if (hash === '#/triage') return { name: 'triage' };
  if (hash === '#/symptoms') return { name: 'symptoms' };
  if (hash === '#/kb') return { name: 'kb' };
  if (hash === '#/settings') return { name: 'settings' };
  const match = hash.match(/^#\/case\/([^/?#]+)$/);
  if (match) {
    try {
      const id = decodeURIComponent(match[1]);
      if (/^[a-z0-9]+(?:-[a-z0-9]+)*$/.test(id)) return { name: 'case', id };
    } catch {
      return { name: 'not-found' };
    }
  }
  return { name: 'not-found' };
}

function navigate(hash) {
  if (location.hash === hash) render({ focus: true });
  else location.hash = hash;
}

function setDocumentTitle(title) {
  document.title = title ? `${title} | ${t('appName')}` : `${t('appName')} — ${t('appDescription')}`;
}

function render({ focus = true } = {}) {
  if (!state.ready) return;
  const route = currentRoute();
  if (route.name === 'case' && state.lastRouteName !== 'case') {
    if (state.preparedCaseId !== route.id) state.caseId = null;
    state.preparedCaseId = null;
  }
  state.lastRouteName = route.name;
  let heading = t('appName');

  if (route.name === 'triage') heading = renderTriage();
  else if (route.name === 'symptoms') heading = renderSymptoms();
  else if (route.name === 'case') heading = renderCase(route.id);
  else if (route.name === 'kb') heading = renderKb();
  else if (route.name === 'settings') heading = renderSettings();
  else if (route.name === 'not-found') heading = renderNotFound();
  else heading = renderHome();

  refreshAppUpdateBanner();
  setDocumentTitle(route.name === 'home' ? '' : heading);
  if (focus) {
    requestAnimationFrame(() => {
      const target = document.getElementById('view-heading');
      target?.focus({ preventScroll: true });
      if (routeAnnouncer) routeAnnouncer.textContent = t('pageAnnouncement', { title: heading });
    });
  }
}

function statusPill() {
  return navigator.onLine
    ? `<span class="pill online">${e(t('online'))}</span>`
    : `<span class="pill offline">${e(t('offline'))}</span>`;
}

function compatibilityNotice() {
  if (!window.indexedDB) {
    return `<div class="compatibility-notice" role="alert">${e(t('offlineUnsupported'))}</div>`;
  }
  return '';
}

function currentInstallMode() {
  if (installCompleted || standaloneDisplay.matches || navigator.standalone === true) return 'installed';
  if (deferredInstallPrompt) return 'prompt';
  if (isIosDevice()) return 'ios';
  if (isLikelyMobile()) return 'manual';
  return 'hidden';
}

function manualInstallInstructions(mode) {
  const keys = mode === 'ios'
    ? ['installIos1', 'installIos2', 'installIos3', 'installIos4']
    : ['installManual1', 'installManual2', 'installManual3'];
  return `<ol>${keys.map((key) => `<li>${e(t(key))}</li>`).join('')}</ol>`;
}

function refreshInstallCard() {
  const card = document.getElementById('install-card');
  if (!card) return;
  const mode = currentInstallMode();
  card.hidden = mode === 'installed' || mode === 'hidden';
  if (card.hidden) return;

  const description = document.getElementById('install-description');
  const button = document.getElementById('install-app');
  const instructions = document.getElementById('install-instructions');
  if (!description || !button || !instructions) return;

  const promptAvailable = mode === 'prompt';
  description.textContent = promptAvailable
    ? t('installPromptDescription')
    : mode === 'ios'
      ? t('installIosDescription')
      : t('installManualDescription');
  button.textContent = promptAvailable ? t('installButton') : t('installShowHelp');
  button.disabled = false;
  button.setAttribute('aria-expanded', String(!promptAvailable && installInstructionsExpanded));
  instructions.innerHTML = promptAvailable ? '' : manualInstallInstructions(mode);
  instructions.hidden = promptAvailable || !installInstructionsExpanded;
}

function setupInstallCard() {
  const button = document.getElementById('install-app');
  if (!button) return;
  refreshInstallCard();
  button.addEventListener('click', async () => {
    const status = document.getElementById('install-status');
    if (deferredInstallPrompt) {
      const prompt = deferredInstallPrompt;
      deferredInstallPrompt = null;
      button.disabled = true;
      try {
        await prompt.prompt();
        const choice = await prompt.userChoice;
        if (choice.outcome === 'accepted') {
          installCompleted = true;
          showSyncAnnouncement(t('installConfirmed'));
        } else {
          installInstructionsExpanded = true;
          if (status) status.textContent = t('installDeclined');
        }
      } catch (error) {
        console.warn('Install prompt failed', error);
        installInstructionsExpanded = true;
        if (status) status.textContent = t('installFailed');
      }
      refreshInstallCard();
      return;
    }

    installInstructionsExpanded = !installInstructionsExpanded;
    refreshInstallCard();
  });
}

function renderHome() {
  const emergency = emergencyName();
  app.innerHTML = `
    <header class="topbar">
      <div><div class="eyebrow">${e(t('firstAidGuide'))}</div><h1 id="view-heading" tabindex="-1">${e(t('appName'))}</h1></div>
      <div class="topbar-actions">${statusPill()}<a class="settings-link" href="#/settings" aria-label="${e(t('settingsAria'))}">⚙</a></div>
    </header>
    <main class="body home-body">
      ${compatibilityNotice()}
      <section class="safety-notice" aria-labelledby="safety-heading">
        <h2 id="safety-heading">${e(t('homeThreatTitle'))}</h2>
        <p>${e(t('homeThreatText', { emergency }))}</p>
        ${emergencyButton()}
      </section>
      <button class="primary-action" id="start-triage" type="button">
        <span class="primary-icon" aria-hidden="true">⏱</span>
        <span><strong>${e(t('homeTriage'))}</strong><small>${e(t('homeTriageSub'))}</small></span>
      </button>
      <button class="secondary-action" id="start-symptoms" type="button">
        <span aria-hidden="true">🔎</span>
        <span><strong>${e(t('homeSymptoms'))}</strong><small>${e(t('homeSymptomsSub'))}</small></span>
      </button>
      <button class="secondary-action" id="open-kb" type="button">
        <span aria-hidden="true">📚</span>
        <span><strong>${e(t('homeLibrary'))}</strong><small>${e(t('homeLibrarySub', { count: formatNumber(kb.listCases().length) }))}</small></span>
      </button>
      ${contactsMarkup()}
      <section class="install-card" id="install-card" aria-labelledby="install-heading" hidden>
        <div class="install-card-heading">
          <span class="install-icon" aria-hidden="true">⇩</span>
          <div><h2 id="install-heading">${e(t('installTitle'))}</h2><p id="install-description"></p></div>
        </div>
        <button class="btn outline full" id="install-app" type="button" aria-controls="install-instructions" aria-expanded="false">${e(t('installButton'))}</button>
        <div class="install-instructions" id="install-instructions" hidden></div>
        <p class="install-status" id="install-status" role="status" aria-live="polite"></p>
      </section>
      <aside class="disclaimer"><strong>${e(t('importantLimitation'))}</strong> ${e(t('limitationText', { emergency }))}</aside>
    </main>
    <footer class="footer">${e(t('kbFooter', { version: kb.metadata?.kbVersion ?? '—', date: kb.metadata?.updatedAt ?? '—' }))}</footer>`;

  document.getElementById('start-triage').addEventListener('click', () => {
    state.triageAnswers = {};
    state.triageContext = null;
    navigate('#/triage');
  });
  document.getElementById('start-symptoms').addEventListener('click', () => {
    state.diffStage = 'questions';
    state.diffSelected = [];
    state.diffHistorical = [];
    state.diffCompatibilityMessage = '';
    state.diffQuery = '';
    state.diffShowAll = false;
    state.diffCategory = QUICK_CATEGORY;
    navigate('#/symptoms');
  });
  document.getElementById('open-kb').addEventListener('click', () => navigate('#/kb'));
  setupInstallCard();
  return t('home');
}

function renderTriage() {
  const questionId = nextTriageQuestion(state.triageAnswers);
  const route = triageRoute(state.triageAnswers);
  if (!questionId && route) {
    if (route === 'symptoms') {
      state.triageAnswers = {};
      state.diffStage = 'questions';
      state.diffSelected = [];
      state.diffHistorical = [];
      state.diffCompatibilityMessage = '';
      state.diffQuery = '';
      state.diffShowAll = false;
      state.diffCategory = QUICK_CATEGORY;
      navigate('#/symptoms');
      return t('triageRoute');
    }
    state.triageContext = { ...state.triageAnswers };
    state.caseId = route;
    state.preparedCaseId = route;
    state.caseAnswers = triageSymptoms(state.triageAnswers);
    state.caseStage = 'result';
    state.triageAnswers = {};
    navigate(caseHref(route));
    return t('triageRoute');
  }

  const step = formatNumber(Object.keys(state.triageAnswers).length + 1);
  const questionKeys = {
    conscious: 'triageConscious', breathing: 'triageBreathing', choking: 'triageChoking',
    breathingDifficulty: 'triageBreathingDifficulty', bleeding: 'triageBleeding',
  };
  const breathingHint = questionId === 'breathing'
    ? `<p class="question-hint">${e(t('triageBreathingHint'))}</p>`
    : '';
  const emergency = emergencyName();
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
      <div><div class="eyebrow">${e(t('triageEyebrow', { step }))}</div><h1 id="view-heading" tabindex="-1">${e(t('triageTitle'))}</h1></div>
      ${miniEmergencyButton()}
    </header>
    <main class="body">
      <aside class="triage-note"><strong>${e(t('triageBefore'))}</strong> ${e(t('triageBeforeText', { emergency }))}</aside>
      <section class="question-card" aria-labelledby="question-heading">
        <div class="big-icon" aria-hidden="true">?</div>
        <h2 id="question-heading">${e(t(questionKeys[questionId]))}</h2>
        ${breathingHint}
        <p>${e(t('triageRecheck'))}</p>
      </section>
      <div class="yesno" aria-label="${e(t('triageAnswer'))}">
        <button class="btn yes" data-answer="y" type="button">${e(t('yes'))}</button>
        <button class="btn no" data-answer="n" type="button">${e(t('no'))}</button>
      </div>
      ${emergencyButton('btn emergency full card-spaced')}
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => {
    state.triageAnswers = {};
    navigate('#/');
  });
  document.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => {
    state.triageAnswers[questionId] = button.dataset.answer;
    render({ focus: true });
  }));
  return t('triageTitle');
}

function symptomChips(symptomIds, selected, dataAttribute = 'data-sym') {
  return symptomModels(symptomIds, kb.symptoms).map((symptom) => {
    const active = selected.includes(symptom.id);
    return `<button class="chip${active ? ' active' : ''}" type="button" ${dataAttribute}="${e(symptom.id)}" aria-pressed="${active}">${e(symptom.label)}</button>`;
  }).join('');
}

function symptomLabels(ids) {
  return ids.map((id) => kb.symptoms[id]?.label).filter(Boolean);
}

function compatibilityMessage(symptomId, result) {
  const label = kb.symptoms[symptomId]?.label || t('compatibilityThis');
  const parts = [];
  if (result.removed.length) parts.push(t('compatibilityRemoved', { count: formatNumber(result.removed.length) }));
  if (result.movedToHistorical.length) parts.push(t('compatibilityMoved', { count: formatNumber(result.movedToHistorical.length) }));
  if (result.restored.length) parts.push(t('compatibilityRestored', { count: formatNumber(result.restored.length) }));
  if (!result.accepted) return t('compatibilityRejected', { label });
  return parts.length ? t('compatibilityChanged', { label, changes: parts.join(t('conjunction')) }) : '';
}

let restoreCategoryControlFocus = false;

function selectSymptomCategory(categoryId) {
  const normalized = categoryId || null;
  if (normalized === state.diffCategory) return;
  state.diffCategory = normalized;
  state.diffCompatibilityMessage = '';
  state.diffShowAll = false;
  restoreCategoryControlFocus = true;
  render({ focus: false });
}

function setupCategoryControls() {
  const tabs = document.getElementById('category-tabs');
  const select = document.getElementById('category-select');
  if (!tabs || !select) return;

  tabs.addEventListener('click', (event) => {
    const button = event.target?.closest?.('[data-cat]');
    if (button) selectSymptomCategory(button.dataset.cat);
  });
  select.addEventListener('change', () => selectSymptomCategory(select.value));

  if (!restoreCategoryControlFocus) return;
  restoreCategoryControlFocus = false;
  requestAnimationFrame(() => {
    const mobileControl = window.matchMedia('(max-width: 600px)').matches;
    const target = mobileControl
      ? document.getElementById('category-select')
      : Array.from(document.querySelectorAll('#category-tabs [data-cat]'))
        .find((button) => (button.dataset.cat || null) === state.diffCategory);
    target?.focus({ preventScroll: true });
  });
}

let restoreSearchFocus = false;

function selectedSymptomsMarkup() {
  const current = sortSymptomIds(state.diffSelected, kb.symptoms);
  const historical = sortSymptomIds(state.diffHistorical, kb.symptoms);
  if (!current.length && !historical.length) return '';
  const count = formatNumber(new Set([...current, ...historical]).size);
  return `<section class="selected-tray" aria-labelledby="selected-tray-heading">
    <div class="section-heading-row">
      <h2 id="selected-tray-heading">${e(t('selected', { count }))}</h2>
      <button class="small-text-btn" id="clear-symptoms" type="button">${e(t('clearAll'))}</button>
    </div>
    ${current.length ? `<div class="chips selected-chips">${symptomChips(current, state.diffSelected)}</div>` : ''}
    ${historical.length ? `<h3>${e(t('historicalTitle'))}</h3><div class="chips selected-chips historical-inline">${symptomChips(historical, state.diffHistorical, 'data-history-sym')}</div>` : ''}
  </section>`;
}

function searchResultsMarkup(query) {
  const normalized = normalizePersianSearch(query);
  if (normalized.length < 2) return `<p class="empty-inline">${e(t('symptomsSearchMin'))}</p>`;
  const ids = searchSymptoms(query, kb.symptoms)
    .filter((id) => isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms));
  if (!ids.length) {
    return `<div class="empty compact-empty"><h2>${e(t('symptomsSearchNone'))}</h2><p>${e(t('symptomsSearchNoneHelp'))}</p></div>`;
  }
  return `<div class="section-heading-row"><h2>${e(t('symptomsSearchResults'))}</h2><span class="result-count">${e(t('itemCount', { count: formatNumber(ids.length) }))}</span></div>
    <div class="chips" id="search-symptoms">${symptomChips(ids, state.diffSelected)}</div>`;
}

function applyCurrentSymptom(symptomId) {
  const result = toggleCurrentSymptom(state.diffSelected, state.diffHistorical, symptomId, kb.symptoms);
  state.diffSelected = result.selected;
  state.diffHistorical = result.historical;
  state.diffCompatibilityMessage = compatibilityMessage(symptomId, result);
  restoreSearchFocus = Boolean(state.diffQuery);
  render({ focus: false });
}

function wireCurrentSymptomButtons(root = document) {
  root.querySelectorAll('[data-sym]').forEach((button) => button.addEventListener('click', () => {
    applyCurrentSymptom(button.dataset.sym);
  }));
}

function wireHistoricalSymptomButtons(root = document) {
  root.querySelectorAll('[data-history-sym]').forEach((button) => button.addEventListener('click', () => {
    state.diffHistorical = toggleHistoricalSymptom(state.diffHistorical, button.dataset.historySym, kb.symptoms);
    state.diffCompatibilityMessage = '';
    render({ focus: false });
  }));
}

function setupSymptomSearch() {
  const input = document.getElementById('symptom-search');
  const clear = document.getElementById('clear-search');
  const searchPanel = document.getElementById('search-results');
  const browserPanel = document.getElementById('symptom-browser');
  if (!input || !clear || !searchPanel || !browserPanel) return;

  const update = () => {
    state.diffQuery = input.value;
    const hasQuery = Boolean(input.value.trim());
    clear.hidden = !hasQuery;
    searchPanel.hidden = !hasQuery;
    browserPanel.hidden = hasQuery;
    if (hasQuery) {
      searchPanel.innerHTML = searchResultsMarkup(input.value);
      wireCurrentSymptomButtons(searchPanel);
    } else {
      searchPanel.innerHTML = '';
    }
  };

  input.addEventListener('input', update);
  clear.addEventListener('click', () => {
    input.value = '';
    update();
    input.focus({ preventScroll: true });
  });

  if (restoreSearchFocus) {
    restoreSearchFocus = false;
    requestAnimationFrame(() => {
      const refreshed = document.getElementById('symptom-search');
      refreshed?.focus({ preventScroll: true });
      const end = refreshed?.value.length || 0;
      refreshed?.setSelectionRange(end, end);
    });
  }
}

function renderSymptoms() {
  const categoryIds = Object.keys(kb.categories);
  if (state.diffStage === 'result') return renderDifferentialResults();

  const configuredQuickIds = quickSymptomIds(kb.symptoms);
  const allCategorySymptoms = [...new Set(categoryIds.flatMap((id) => kb.categories[id].diffSymptoms || []))];
  const quickIds = configuredQuickIds.length
    ? configuredQuickIds
    : sortSymptomIds(allCategorySymptoms, kb.symptoms).slice(0, 8);
  let categorySymptoms;
  if (state.diffCategory === QUICK_CATEGORY) categorySymptoms = quickIds;
  else if (state.diffCategory === SELECTED_CATEGORY) categorySymptoms = [...state.diffSelected];
  else if (state.diffCategory) categorySymptoms = kb.categories[state.diffCategory]?.diffSymptoms || [];
  else categorySymptoms = allCategorySymptoms;

  const compatibleSymptoms = sortSymptomIds(
    categorySymptoms.filter((id) => isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms)),
    kb.symptoms,
  );
  const isCompactCategory = [QUICK_CATEGORY, SELECTED_CATEGORY].includes(state.diffCategory);
  const initiallyVisible = new Set(compatibleSymptoms.slice(0, INITIAL_SYMPTOM_LIMIT));
  for (const id of state.diffSelected) {
    if (compatibleSymptoms.includes(id)) initiallyVisible.add(id);
  }
  const currentSymptoms = state.diffShowAll || isCompactCategory
    ? compatibleSymptoms
    : compatibleSymptoms.filter((id) => initiallyVisible.has(id));
  const hiddenSymptomCount = compatibleSymptoms.length - currentSymptoms.length;
  const historicalSymptoms = state.diffCategory === SELECTED_CATEGORY
    ? []
    : sortSymptomIds(historicalSymptomIds(categorySymptoms, state.diffSelected, kb.symptoms), kb.symptoms);
  const allEvidence = [...new Set([...state.diffSelected, ...state.diffHistorical])];
  const suggestions = suggestSymptoms(allEvidence, kb.cases, kb.symptoms, 12)
    .filter((id) => isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms))
    .slice(0, 6);
  const selectionCount = allEvidence.length;

  const categoryItems = [
    { id: QUICK_CATEGORY, label: t('categoryQuick') },
    { id: SELECTED_CATEGORY, label: t('categorySelected', { count: formatNumber(selectionCount) }) },
    { id: '', label: t('categoryAll') },
    ...categoryIds.map((id) => ({ id, label: `${kb.categories[id].icon} ${kb.categories[id].title}` })),
  ].map((item) => ({ ...item, active: (item.id || null) === (state.diffCategory || null) }));
  const categoryTabs = categoryItems.map(({ id, label, active }) => (
    `<button type="button" class="cat-btn${active ? ' active' : ''}" data-cat="${e(id)}" aria-pressed="${active}">${e(label)}</button>`
  )).join('');
  const categoryOptions = categoryItems.map(({ id, label, active }) => (
    `<option value="${e(id)}"${active ? ' selected' : ''}>${e(label)}</option>`
  )).join('');
  const activeCategoryLabel = categoryItems.find((item) => item.active)?.label.replace(/^[★✓]\s*/, '') || t('categoryAllSymptoms');
  const hasSearch = Boolean(state.diffQuery.trim());

  const emergency = emergencyName();
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
      <div><div class="eyebrow">${e(t('symptomsEyebrow'))}</div><h1 id="view-heading" tabindex="-1">${e(t('symptomsTitle'))}</h1></div>
      ${miniEmergencyButton()}
    </header>
    <main class="body symptoms-body">
      ${compatibilityNotice()}
      <aside class="disclaimer compact"><strong>${e(t('symptomsUrgent'))}</strong> ${e(t('symptomsUrgentText', { emergency }))}</aside>
      ${state.diffCompatibilityMessage ? `<p class="compatibility-notice" role="status">${e(state.diffCompatibilityMessage)}</p>` : ''}

      <section class="symptom-search-card" aria-labelledby="search-heading">
        <h2 id="search-heading">${e(t('symptomsSearchTitle'))}</h2>
        <div class="search-field">
          <input id="symptom-search" type="search" value="${e(state.diffQuery)}" placeholder="${e(t('symptomsSearchPlaceholder'))}" autocomplete="off" enterkeyhint="search" aria-describedby="search-help">
          <button id="clear-search" type="button" aria-label="${e(t('symptomsSearchClear'))}" ${hasSearch ? '' : 'hidden'}>×</button>
        </div>
        <p id="search-help">${e(t('symptomsSearchHelp'))}</p>
      </section>

      ${selectedSymptomsMarkup()}
      <section id="search-results" class="search-results" aria-live="polite" ${hasSearch ? '' : 'hidden'}>${hasSearch ? searchResultsMarkup(state.diffQuery) : ''}</section>

      <div id="symptom-browser" ${hasSearch ? 'hidden' : ''}>
        <fieldset class="category-fieldset">
          <legend>${e(t('categoryLegend'))}</legend>
          <div class="category-tabs" id="category-tabs" role="group" aria-label="${e(t('categoryAria'))}">${categoryTabs}</div>
          <label class="category-select-label" for="category-select">${e(t('categorySelect'))}</label>
          <select class="category-select" id="category-select">${categoryOptions}</select>
        </fieldset>

        ${suggestions.length ? `<section class="suggested-symptoms" aria-labelledby="suggested-heading">
          <h2 id="suggested-heading">${e(t('suggestedTitle'))}</h2>
          <p class="section-help">${e(t('suggestedHelp'))}</p>
          <div class="chips">${symptomChips(suggestions, state.diffSelected)}</div>
        </section>` : ''}

        <section aria-labelledby="symptom-heading">
          <h2 id="symptom-heading">${e(activeCategoryLabel)}</h2>
          <p class="section-help">${e(t('compatibleHelp'))}</p>
          <div class="chips" id="current-symptoms">${symptomChips(currentSymptoms, state.diffSelected)}</div>
          ${currentSymptoms.length ? '' : `<p class="empty-inline">${e(state.diffCategory === SELECTED_CATEGORY ? t('noSelected') : t('noCompatible'))}</p>`}
          ${hiddenSymptomCount > 0 ? `<button class="show-more-symptoms" id="show-more-symptoms" type="button">${e(t('showMore', { count: formatNumber(hiddenSymptomCount) }))}</button>` : ''}
          ${state.diffShowAll && !isCompactCategory && compatibleSymptoms.length > INITIAL_SYMPTOM_LIMIT ? `<button class="show-more-symptoms" id="show-less-symptoms" type="button">${e(t('showLess'))}</button>` : ''}
        </section>

        ${historicalSymptoms.length ? `<section class="historical-symptoms" aria-labelledby="historical-heading">
          <h2 id="historical-heading">${e(t('historicalHeading'))}</h2>
          <p>${e(t('historicalHelp'))}</p>
          <div class="chips">${symptomChips(historicalSymptoms, state.diffHistorical, 'data-history-sym')}</div>
        </section>` : ''}
      </div>

      <div class="symptom-result-bar">
        <button class="btn primary full" id="show-results" type="button" ${selectionCount ? '' : 'disabled'}>${e(t('showRelated', { count: formatNumber(selectionCount) }))}</button>
      </div>
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => navigate('#/'));
  setupCategoryControls();
  setupSymptomSearch();
  wireCurrentSymptomButtons();
  wireHistoricalSymptomButtons();
  document.getElementById('clear-symptoms')?.addEventListener('click', () => {
    state.diffSelected = [];
    state.diffHistorical = [];
    state.diffCompatibilityMessage = t('clearedAll');
    state.diffShowAll = false;
    render({ focus: false });
  });
  document.getElementById('show-more-symptoms')?.addEventListener('click', () => {
    state.diffShowAll = true;
    render({ focus: false });
  });
  document.getElementById('show-less-symptoms')?.addEventListener('click', () => {
    state.diffShowAll = false;
    render({ focus: false });
  });
  document.getElementById('show-results').addEventListener('click', () => {
    state.diffStage = 'result';
    state.diffCompatibilityMessage = '';
    render({ focus: true });
  });
  return t('symptomsRoute');
}
function renderDifferentialResults() {
  const allSelected = [...new Set([...state.diffSelected, ...state.diffHistorical])];
  const ranked = rankCases(allSelected, kb.cases);
  const critical = hasCriticalSymptoms(state.diffSelected);
  const selectedLabels = symptomLabels(state.diffSelected);
  const historicalLabels = symptomLabels(state.diffHistorical);
  const separator = t('listSeparator');
  const emergency = emergencyName();

  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="edit-symptoms" type="button" aria-label="${e(t('editSymptoms'))}">‹</button>
      <div><div class="eyebrow">${e(t('resultsEyebrow'))}</div><h1 id="view-heading" tabindex="-1">${e(t('resultsRoute'))}</h1></div>
      ${miniEmergencyButton()}
    </header>
    <main class="body">
      ${critical ? `<section class="emergency-banner"><h2>${e(t('resultsDangerTitle'))}</h2><p>${e(t('resultsDangerText', { emergency }))}</p>${emergencyButton()}</section>` : ''}
      <section class="selected-summary"><h2>${e(t('resultsCurrent'))}</h2><p>${selectedLabels.length ? selectedLabels.map(e).join(separator) : e(t('resultsNoneRecorded'))}</p>${historicalLabels.length ? `<h3>${e(t('historicalTitle'))}</h3><p>${historicalLabels.map(e).join(separator)}</p>` : ''}</section>
      <p class="result-explainer">${e(t('resultsExplainer'))}</p>
      <div class="result-list">
        ${ranked.length ? ranked.map(({ case: item, matched }) => `
          <article class="result-card">
            <div class="case-icon" aria-hidden="true">${e(item.icon)}</div>
            <div><h2>${e(item.title)}</h2><p>${em(item.summary)}</p><small>${e(t('resultsMatched', { count: formatNumber(matched.length) }))}</small></div>
            <a class="btn outline" href="${e(caseHref(item.id))}">${e(t('resultsOpen'))}</a>
          </article>`).join('') : `<div class="empty"><h2>${e(t('resultsNoneTitle'))}</h2><p class="empty-inline">${e(t('resultsNoneOverlap'))}</p><p>${e(t('resultsNoneHelp', { emergency }))}</p></div>`}
      </div>
      <button class="btn secondary full card-spaced" id="edit-bottom" type="button">${e(t('editSymptoms'))}</button>
    </main>`;

  const edit = () => {
    state.diffStage = 'questions';
    render({ focus: true });
  };
  document.getElementById('edit-symptoms').addEventListener('click', edit);
  document.getElementById('edit-bottom').addEventListener('click', edit);
  return t('resultsRoute');
}
function resetCaseState(item) {
  state.caseId = item.id;
  state.caseAnswers = [];
  state.caseStage = item.emergencyCall.always || !item.riskQuestions?.length ? 'result' : 'questions';
  state.triageContext = null;
}

function renderCase(id) {
  const item = kb.cases[id];
  if (!item) return renderNotFound();
  if (state.caseId !== id) resetCaseState(item);
  if (!item.riskQuestions?.length) state.caseStage = 'result';
  if (state.caseStage === 'result') return renderCaseResult(item);
  return renderCaseQuestions(item);
}

function caseHeader(item, eyebrow = t('caseDefaultEyebrow')) {
  return `<header class="topbar">
    <button class="icon-btn" id="case-back" type="button" aria-label="${e(t('back'))}">‹</button>
    <div><div class="eyebrow">${e(eyebrow)}</div><h1 id="view-heading" tabindex="-1">${e(item.title)}</h1></div>
    ${miniEmergencyButton()}
  </header>`;
}

function renderCaseQuestions(item) {
  app.innerHTML = `${caseHeader(item, t('caseWarningReview'))}
    <main class="body">
      ${item.emergencyCall.always ? `<section class="emergency-banner"><h2>${e(t('caseDoNotDelay'))}</h2><p>${em(item.emergencyCall.text)}</p>${emergencyButton()}</section>` : ''}
      <section class="question-card left">
        <div class="case-icon large" aria-hidden="true">${e(item.icon)}</div>
        <h2>${e(t('caseWhichSigns'))}</h2>
        <p>${e(t('caseWhichSignsHelp'))}</p>
      </section>
      <div class="chips risk-chips">${symptomChips(item.riskQuestions, state.caseAnswers)}</div>
      <button class="btn primary full card-spaced" id="case-continue" type="button">${e(t('caseShowActions'))}</button>
      <button class="btn text full" id="case-none" type="button">${e(t('caseNone'))}</button>
    </main>`;

  document.getElementById('case-back').addEventListener('click', () => history.length > 1 ? history.back() : navigate('#/'));
  document.querySelectorAll('[data-sym]').forEach((button) => button.addEventListener('click', () => {
    const symptomId = button.dataset.sym;
    state.caseAnswers = state.caseAnswers.includes(symptomId)
      ? state.caseAnswers.filter((id) => id !== symptomId)
      : [...state.caseAnswers, symptomId];
    render({ focus: false });
  }));
  document.getElementById('case-continue').addEventListener('click', () => {
    state.caseStage = 'result';
    render({ focus: true });
  });
  document.getElementById('case-none').addEventListener('click', () => {
    state.caseAnswers = [];
    state.caseStage = 'result';
    render({ focus: true });
  });
  return item.title;
}

function renderCaseResult(item) {
  const flags = triggeredFlags(item, state.caseAnswers);
  const mustCall = flags.emergencyCall;
  const wasUnresponsiveWithBleeding = item.id === 'severe-bleeding' && state.triageContext?.conscious === 'n';
  const emergency = emergencyName();
  const regionalNote = item.regionalNotes?.[preferences.country];
  const relatedArrow = localeCode() === 'fa' ? '←' : '→';

  app.innerHTML = `${caseHeader(item, mustCall ? t('caseUrgent') : t('caseActionGuide'))}
    <main class="body">
      ${mustCall ? `<section class="emergency-banner"><h2>${e(t('caseCallNow', { emergency }))}</h2><p>${em(item.emergencyCall.text)}</p>${emergencyButton()}</section>` : `<section class="safe-banner"><h2>${e(t('caseNoEmergencyTitle'))}</h2><p>${em(item.emergencyCall.text)} ${e(t('caseNoEmergencyTail', { emergency }))}</p></section>`}
      ${flags.reasons.length ? `<section class="red-flags"><h2>${e(t('caseSelectedWarnings'))}</h2><ul>${flags.reasons.map((flag) => `<li>${em(flag.text)}</li>`).join('')}</ul></section>` : ''}
      ${wasUnresponsiveWithBleeding ? `<aside class="triage-note"><strong>${e(t('caseUnresponsiveBleeding'))}</strong> ${e(t('caseUnresponsiveBleedingText'))}</aside>` : ''}
      <section class="case-summary"><div class="case-icon large" aria-hidden="true">${e(item.icon)}</div><div><h2>${e(item.title)}</h2><p>${em(item.summary)}</p></div></section>
      <section class="steps" aria-labelledby="steps-heading"><h2 id="steps-heading">${e(t('caseSteps'))}</h2><ol>${item.actions.map((action) => `<li>${em(action)}</li>`).join('')}</ol></section>
      ${item.prohibitions?.length ? `<section class="prohibitions"><h2>${e(t('caseDoNot'))}</h2><ul>${item.prohibitions.map((prohibition) => `<li>${em(prohibition)}</li>`).join('')}</ul></section>` : ''}
      ${item.tip ? `<aside class="tip"><strong>${e(t('caseTip'))}</strong> ${em(item.tip)}</aside>` : ''}
      ${regionalNote ? `<aside class="national-note"><strong>${e(t('caseRegional', { country: localizedCountryName(preferences.country) }))}</strong> ${em(regionalNote)}</aside>` : ''}
      <aside class="monitor-note"><strong>${e(t('caseMonitor'))}</strong> ${e(t('caseMonitorText'))}</aside>
      ${item.riskQuestions?.length ? `<button class="btn secondary full card-spaced" id="review-risks" type="button">${e(t('caseReviewWarnings'))}</button>` : ''}
      ${item.related?.length ? `<section class="related"><h2>${e(t('caseRelated'))}</h2>${item.related.map((related) => `<a href="${e(caseHref(related.case))}">${e(related.text)} ${relatedArrow}</a>`).join('')}</section>` : ''}
      <details class="sources"><summary>${e(t('caseSources'))}</summary><p>${e(t('caseReviewed', { date: item.updatedAt }))}</p><ul>${item.sources.map((source) => `<li>${e(source)}</li>`).join('')}</ul></details>
      <aside class="review-status"><strong>${e(t('humanReviewStatus'))}:</strong> ${e(t('humanReviewPending'))}</aside>
      ${emergencyButton('btn emergency full card-spaced')}
    </main>`;

  document.getElementById('case-back').addEventListener('click', () => history.length > 1 ? history.back() : navigate('#/'));
  document.getElementById('review-risks')?.addEventListener('click', () => {
    state.caseStage = 'questions';
    render({ focus: true });
  });
  return item.title;
}
function renderKb() {
  const casesByCategory = Object.entries(kb.categories).map(([categoryId, category]) => ({
    category,
    cases: kb.listCases().filter((item) => item.category === categoryId),
  })).filter((group) => group.cases.length);
  const lastSync = kb.metadata?.lastSync ? formatDateTime(kb.metadata.lastSync) : t('unknown');

  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
      <div><div class="eyebrow">${e(t('libraryEyebrow'))}</div><h1 id="view-heading" tabindex="-1">${e(t('libraryTitle'))}</h1></div>
      ${statusPill()}
    </header>
    <main class="body">
      ${compatibilityNotice()}
      <section class="sync-card" aria-labelledby="sync-heading">
        <h2 id="sync-heading">${e(t('libraryVersion', { version: kb.metadata?.kbVersion ?? '—' }))}</h2>
        <p>${e(t('libraryLastSync', { date: lastSync }))}</p>
        <button class="btn secondary" id="sync-now" type="button" ${navigator.onLine ? '' : 'disabled'}>${e(t('librarySync'))}</button>
        <p class="sync-status" id="sync-status" role="status"></p>
      </section>
      ${casesByCategory.map(({ category, cases }) => `<section class="kb-category"><h2>${e(category.icon)} ${e(category.title)}</h2><div class="kb-grid">${cases.map((item) => `<a class="kb-card" href="${e(caseHref(item.id))}"><span aria-hidden="true">${e(item.icon)}</span><div><strong>${e(item.title)}</strong><small>${em(item.summary)}</small></div></a>`).join('')}</div></section>`).join('')}
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => navigate('#/'));
  document.getElementById('sync-now').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const status = document.getElementById('sync-status');
    button.disabled = true;
    status.textContent = t('librarySyncing');
    try {
      const result = await kb.sync();
      status.textContent = result.changed.length
        ? t('libraryUpdated', { count: formatNumber(result.changed.length) })
        : t('libraryCurrent');
    } catch (error) {
      console.error(error);
      status.textContent = syncErrorMessage(error);
    } finally {
      button.disabled = !navigator.onLine;
    }
  });
  return t('libraryTitle');
}

function renderSettings() {
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
      <div><div class="eyebrow">${e(t('settingsEyebrow'))}</div><h1 id="view-heading" tabindex="-1">${e(t('settingsTitle'))}</h1></div>
      ${miniEmergencyButton()}
    </header>
    <main class="body">
      <p class="settings-help">${e(t('settingsHelp'))}</p>
      <form class="settings-form" id="settings-form">
        <label for="settings-language">${e(t('language'))}</label>
        <select id="settings-language">
          <option value="fa"${preferences.locale === 'fa' ? ' selected' : ''}>${e(t('languageFa'))}</option>
          <option value="en"${preferences.locale === 'en' ? ' selected' : ''}>${e(t('languageEn'))}</option>
        </select>
        <small>${e(t('settingsDownloadEnglish'))}</small>
        <label for="settings-country">${e(t('country'))}</label>
        <select id="settings-country">${countryOptions()}</select>
        <small>${e(t('countrySearchHelp'))}</small>
        <button class="btn primary full" type="submit">${e(t('settingsSave'))}</button>
        <p class="sync-status" id="settings-status" role="status">${e(state.settingsMessage || '')}</p>
      </form>
      <div id="settings-contacts">${contactsMarkup(preferences.country, { showSources: true })}</div>
    </main>`;
  state.settingsMessage = '';
  document.getElementById('back-home').addEventListener('click', () => navigate('#/'));
  const countrySelect = document.getElementById('settings-country');
  countrySelect.addEventListener('change', () => {
    document.getElementById('settings-contacts').innerHTML = contactsMarkup(countrySelect.value, { showSources: true });
  });
  document.getElementById('settings-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('settings-status');
    const next = {
      locale: document.getElementById('settings-language').value,
      country: countrySelect.value,
    };
    if (!next.country) {
      status.textContent = t('onboardingRequired');
      countrySelect.focus();
      return;
    }
    status.textContent = t('loading');
    event.submitter.disabled = true;
    try {
      await activatePreferences(next, { persist: true });
      state.settingsMessage = t('settingsSaved');
      render({ focus: false });
    } catch (error) {
      console.error(error);
      status.textContent = next.locale === 'en' ? t('englishDownloadRequired') : syncErrorMessage(error);
      event.submitter.disabled = false;
    }
  });
  return t('settingsTitle');
}
function renderNotFound() {
  app.innerHTML = `<main class="body centered"><div class="big-icon" aria-hidden="true">?</div><h1 id="view-heading" tabindex="-1">${e(t('notFoundTitle'))}</h1><p>${e(t('notFoundText'))}</p><button class="btn primary" id="go-home" type="button">${e(t('backHome'))}</button></main>`;
  document.getElementById('go-home').addEventListener('click', () => navigate('#/'));
  return t('notFoundTitle');
}

function syncErrorMessage(error) {
  if (['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR'].includes(error?.code)) return t('syncNetworkError');
  return t('syncValidationError');
}

function showSyncAnnouncement(message) {
  if (syncAnnouncer) syncAnnouncer.textContent = message;
}

let serviceWorkerRegistration = null;
let waitingServiceWorker = null;
let updateDismissed = false;
let updateActivationRequested = false;
let reloadingForUpdate = false;
let lastServiceWorkerUpdateCheck = 0;
const UPDATE_CHECK_INTERVAL = 5 * 60 * 1000;

function refreshAppUpdateBanner() {
  if (!appUpdateBanner) return;
  const safeRoute = state.ready && ['home', 'kb', 'settings'].includes(currentRoute().name);
  appUpdateBanner.hidden = !(waitingServiceWorker && !updateDismissed && safeRoute);
}

function offerAppUpdate(worker) {
  if (!worker || !navigator.serviceWorker.controller) return;
  const isNewWorker = waitingServiceWorker !== worker;
  waitingServiceWorker = worker;
  if (isNewWorker) updateDismissed = false;
  refreshAppUpdateBanner();
  showSyncAnnouncement(t('updateReady'));
}

function watchInstallingWorker(worker) {
  if (!worker) return;
  worker.addEventListener('statechange', () => {
    if (worker.state === 'installed') offerAppUpdate(worker);
  });
}

async function checkForAppUpdate({ force = false } = {}) {
  if (!serviceWorkerRegistration || !navigator.onLine) return;
  const now = Date.now();
  if (!force && now - lastServiceWorkerUpdateCheck < UPDATE_CHECK_INTERVAL) return;
  lastServiceWorkerUpdateCheck = now;
  try {
    await serviceWorkerRegistration.update();
    if (serviceWorkerRegistration.waiting) offerAppUpdate(serviceWorkerRegistration.waiting);
  } catch (error) {
    console.warn('Service worker update check failed', error);
  }
}

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js?v=10', {
      scope: './',
      updateViaCache: 'none',
    });
    serviceWorkerRegistration = registration;
    if (registration.waiting) offerAppUpdate(registration.waiting);
    registration.addEventListener('updatefound', () => watchInstallingWorker(registration.installing));
    await checkForAppUpdate({ force: true });
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}

appUpdateNow?.addEventListener('click', () => {
  const worker = serviceWorkerRegistration?.waiting || waitingServiceWorker;
  if (!worker) {
    refreshAppUpdateBanner();
    return;
  }
  updateActivationRequested = true;
  appUpdateNow.disabled = true;
  showSyncAnnouncement(t('updateActivating'));
  worker.postMessage({ type: 'SKIP_WAITING' });
});

appUpdateLater?.addEventListener('click', () => {
  updateDismissed = true;
  refreshAppUpdateBanner();
  showSyncAnnouncement(t('updateLaterDone'));
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateActivationRequested || reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });
}

async function backgroundSync() {
  if (!navigator.onLine || !kb) return;
  try {
    const result = await kb.sync();
    if (result.changed.length) {
      showSyncAnnouncement(t('syncBackgroundDone'));
      const route = currentRoute();
      if (['home', 'kb', 'symptoms'].includes(route.name)) render({ focus: false });
    }
  } catch (error) {
    console.warn('Background KB sync failed', error);
  }
}

function localizeStaticChrome() {
  const updateTitle = document.getElementById('app-update-title');
  const updateText = document.querySelector('#app-update p');
  const updateNow = document.getElementById('app-update-now');
  const updateLater = document.getElementById('app-update-later');
  const skipLink = document.querySelector('.skip-link');
  if (updateTitle) updateTitle.textContent = t('updateTitle');
  if (updateText) updateText.textContent = t('updateBody');
  if (updateNow) updateNow.textContent = t('updateNow');
  if (updateLater) updateLater.textContent = t('updateLater');
  if (skipLink) skipLink.textContent = t('skipLink');
}

async function activatePreferences(next, { persist = false, route = null } = {}) {
  const previous = { ...preferences };
  const previousLocale = localeCode();
  try {
    await setLocale(next.locale);
    setEngineLocale(next.locale);
    let loadResult = null;
    let nextKb = kb;
    if (!nextKb || nextKb.locale !== next.locale) {
      nextKb = new KnowledgeBase({ locale: next.locale });
      loadResult = await nextKb.load();
    }
    if (persist) savePreferences(next);
    preferences = { locale: next.locale, country: next.country || '', completed: persist || previous.completed === true };
    kb = nextKb;
    state.ready = true;
    state.fatalError = null;
    state.diffQuery = '';
    localizeStaticChrome();
    if (route) history.replaceState(null, '', route);
    render({ focus: true });
    if (loadResult?.fromCache) backgroundSync();
  } catch (error) {
    preferences = previous;
    await setLocale(previousLocale);
    setEngineLocale(previousLocale);
    throw error;
  }
}

function renderOnboarding(message = '') {
  state.ready = false;
  setDocumentTitle(t('onboardingTitle'));
  const emergency = emergencyName(onboardingChoice.country);
  app.innerHTML = `<main class="body onboarding-body">
    <section class="onboarding-card" aria-labelledby="view-heading">
      <div class="eyebrow">${e(t('onboardingEyebrow'))}</div>
      <h1 id="view-heading" tabindex="-1">${e(t('onboardingTitle'))}</h1>
      <p>${e(t('onboardingHelp'))}</p>
      <form id="onboarding-form" class="settings-form">
        <label for="onboarding-language">${e(t('language'))}</label>
        <select id="onboarding-language">
          <option value="fa"${onboardingChoice.locale === 'fa' ? ' selected' : ''}>${e(t('languageFa'))}</option>
          <option value="en"${onboardingChoice.locale === 'en' ? ' selected' : ''}>${e(t('languageEn'))}</option>
        </select>
        <label for="onboarding-country">${e(t('country'))}</label>
        <select id="onboarding-country">${countryOptions(onboardingChoice.country)}</select>
        <small>${e(t('countrySearchHelp'))}</small>
        <button class="btn primary full" type="submit">${e(t('onboardingContinue'))}</button>
        <p class="sync-status" id="onboarding-status" role="status">${e(message)}</p>
      </form>
      <div id="onboarding-contacts">${onboardingChoice.country ? contactsMarkup(onboardingChoice.country) : ''}</div>
      <section class="safety-notice onboarding-emergency">
        <h2>${e(t('homeThreatTitle'))}</h2>
        <p id="onboarding-emergency-text">${e(t('homeThreatText', { emergency }))}</p>
        <div id="onboarding-call">${emergencyButton('btn emergency full', onboardingChoice.country)}</div>
        <button class="btn outline full card-spaced" id="onboarding-urgent" type="button">${e(t('onboardingEmergency'))}</button>
      </section>
    </section>
  </main>`;
  localizeStaticChrome();
  document.getElementById('view-heading')?.focus();
  const languageSelect = document.getElementById('onboarding-language');
  const countrySelect = document.getElementById('onboarding-country');
  languageSelect.addEventListener('change', async () => {
    const previousLocale = localeCode();
    onboardingChoice.locale = languageSelect.value;
    const status = document.getElementById('onboarding-status');
    status.textContent = t('loading');
    try {
      await setLocale(onboardingChoice.locale);
      setEngineLocale(onboardingChoice.locale);
      renderOnboarding();
    } catch (error) {
      console.error(error);
      onboardingChoice.locale = previousLocale;
      await setLocale(previousLocale);
      setEngineLocale(previousLocale);
      renderOnboarding(t('englishDownloadRequired'));
    }
  });
  countrySelect.addEventListener('change', () => {
    onboardingChoice.country = countrySelect.value;
    document.getElementById('onboarding-contacts').innerHTML = onboardingChoice.country ? contactsMarkup(onboardingChoice.country) : '';
    document.getElementById('onboarding-call').innerHTML = emergencyButton('btn emergency full', onboardingChoice.country);
    document.getElementById('onboarding-emergency-text').textContent = t('homeThreatText', { emergency: emergencyName(onboardingChoice.country) });
  });
  document.getElementById('onboarding-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    const status = document.getElementById('onboarding-status');
    if (!onboardingChoice.country) {
      status.textContent = t('onboardingRequired');
      countrySelect.focus();
      return;
    }
    event.submitter.disabled = true;
    status.textContent = t('loading');
    try {
      await activatePreferences(onboardingChoice, { persist: true, route: '#/' });
    } catch (error) {
      console.error(error);
      renderOnboarding(onboardingChoice.locale === 'en' ? t('englishDownloadRequired') : syncErrorMessage(error));
    }
  });
  document.getElementById('onboarding-urgent').addEventListener('click', async (event) => {
    const status = document.getElementById('onboarding-status');
    event.currentTarget.disabled = true;
    status.textContent = t('loading');
    try {
      await activatePreferences(onboardingChoice, { persist: false, route: '#/triage' });
    } catch (error) {
      console.error(error);
      renderOnboarding(onboardingChoice.locale === 'en' ? t('englishDownloadRequired') : syncErrorMessage(error));
    }
  });
}

function renderFatal(error) {
  const networkFailure = ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR'].includes(error?.code);
  app.innerHTML = `<main class="body centered" role="alert"><div class="big-icon" aria-hidden="true">!</div><h1 id="view-heading" tabindex="-1">${e(t('fatalTitle'))}</h1><p>${e(networkFailure ? t('fatalNetwork') : t('fatalValidation'))}</p><button class="btn primary" id="retry" type="button">${e(t('retry'))}</button>${emergencyButton('btn emergency full card-spaced')}</main>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
  document.getElementById('view-heading')?.focus();
}

window.addEventListener('hashchange', () => render({ focus: true }));
window.addEventListener('online', () => {
  showSyncAnnouncement(t('onlineAgain'));
  const route = currentRoute();
  if (route.name === 'home' || route.name === 'kb') render({ focus: false });
  backgroundSync();
  checkForAppUpdate({ force: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForAppUpdate();
});
window.addEventListener('offline', () => {
  showSyncAnnouncement(t('offlineNow'));
  const route = currentRoute();
  if (route.name === 'home' || route.name === 'kb') render({ focus: false });
});

registerServiceWorker();

async function initialize() {
  try {
    await setLocale('fa');
    setEngineLocale('fa');
    countryData = await loadCountryData();
    const stored = readPreferences();
    if (!stored) {
      preferences = { locale: 'fa', country: '' };
      onboardingChoice = { locale: 'fa', country: '' };
      renderOnboarding();
    } else {
      preferences = stored;
      await activatePreferences(stored);
    }
  } catch (error) {
    console.error(error);
    state.fatalError = error;
    renderFatal(error);
  } finally {
    window.dispatchEvent(new Event('emdadgar:boot-complete'));
  }
}

initialize();
