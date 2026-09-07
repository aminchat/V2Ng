import { KnowledgeBase } from './kb.js?v=11';
import { countryName, formatDateTime, formatNumber, localeCode, localizeField, setLocale, t } from './i18n.js?v=11';
import { emergencyContact, loadCountryData, readPreferences, savePreferences, telephoneHref } from './preferences.js?v=11';
import {
  setEngineLocale,
  hasCriticalSymptoms,
  isCurrentSymptomVisible,
  nextTriageQuestion,
  normalizePersianSearch,
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
} from './engine.js?v=11';

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

const EVIDENCE_LIMITS = {
  observed: 14,
  reported: 10,
  scene: 14,
  background: 9,
  historical: 10,
};

const state = {
  ready: false,
  fatalError: null,
  triageAnswers: {},
  triageContext: null,
  assessmentStep: 'scene',
  assessmentPreserve: false,
  triagePreserveFinder: false,
  responseMode: null,
  caseId: null,
  caseAnswers: [],
  caseStage: 'questions',
  diffSelected: [],
  diffSources: {},
  diffHistorical: [],
  diffCompatibilityMessage: '',
  diffQuery: '',
  diffExpanded: [],
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
  if (hash === '#/assessment') return { name: 'assessment' };
  if (hash === '#/symptoms') return { name: 'symptoms' };
  if (hash === '#/more') return { name: 'more' };
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
  else if (route.name === 'assessment') heading = renderAssessment();
  else if (route.name === 'symptoms') heading = renderSymptoms();
  else if (route.name === 'case') heading = renderCase(route.id);
  else if (route.name === 'more') heading = renderMore();
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

function resetFinder() {
  state.diffStage = 'questions';
  state.diffSelected = [];
  state.diffSources = {};
  state.diffHistorical = [];
  state.diffCompatibilityMessage = '';
  state.diffQuery = '';
  state.diffExpanded = [];
}

function applyResponseMode(mode, { preserve = false } = {}) {
  if (!preserve) resetFinder();
  if (mode === 'limited') {
    const keepCurrent = [];
    for (const id of state.diffSelected) {
      const symptom = kb.symptoms[id];
      const wasReportedByPerson = state.diffSources[id] === 'reported';
      if (!wasReportedByPerson) keepCurrent.push(id);
      else {
        if (canBeHistoricalReport(id) && !state.diffHistorical.includes(id)) state.diffHistorical.push(id);
        delete state.diffSources[id];
      }
    }
    state.diffSelected = keepCurrent;
  }
  state.responseMode = mode;
}

function renderHome() {
  app.innerHTML = `
    <header class="topbar home-topbar">
      <div><div class="eyebrow">${e(t('firstAidGuide'))}</div><h1 id="view-heading" tabindex="-1">${e(t('appName'))}</h1></div>
    </header>
    <main class="body home-body focused-home">
      <button class="home-urgent-action" id="start-triage" type="button">
        <span class="home-action-icon" aria-hidden="true">!</span>
        <span class="home-action-copy"><strong>${e(t('homeThreatTitle'))}</strong><small>${e(t('homeThreatText'))}</small><b>${e(t('homeTriage'))}</b></span>
      </button>
      <button class="primary-action home-assessment-action" id="start-assessment" type="button">
        <span class="primary-icon" aria-hidden="true">✓</span>
        <span><strong>${e(t('homeSymptoms'))}</strong><small>${e(t('homeSymptomsSub'))}</small></span>
      </button>
      <div class="home-call-action">${emergencyButton('btn emergency full home-emergency-call')}</div>
      <a class="home-more-link" href="#/more">${e(t('homeMore'))} <span aria-hidden="true">›</span></a>
    </main>`;

  document.getElementById('start-triage').addEventListener('click', () => {
    state.triageAnswers = {};
    state.triageContext = null;
    state.triagePreserveFinder = false;
    state.responseMode = null;
    navigate('#/triage');
  });
  document.getElementById('start-assessment').addEventListener('click', () => {
    state.assessmentStep = 'scene';
    state.assessmentPreserve = false;
    state.triageAnswers = {};
    resetFinder();
    state.responseMode = null;
    navigate('#/assessment');
  });
  return t('home');
}

function renderMore() {
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
      <div><div class="eyebrow">${e(t('moreEyebrow'))}</div><h1 id="view-heading" tabindex="-1">${e(t('moreTitle'))}</h1></div>
      ${miniEmergencyButton()}
    </header>
    <main class="body more-body">
      ${compatibilityNotice()}
      <p class="more-help">${e(t('moreHelp'))}</p>
      <button class="secondary-action" id="open-kb" type="button">
        <span aria-hidden="true">📚</span>
        <span><strong>${e(t('homeLibrary'))}</strong><small>${e(t('homeLibrarySub', { count: formatNumber(kb.listCases().length) }))}</small></span>
      </button>
      <button class="secondary-action" id="open-settings" type="button">
        <span aria-hidden="true">⚙</span>
        <span><strong>${e(t('moreSettings'))}</strong><small>${e(t('moreSettingsSub'))}</small></span>
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
      <aside class="disclaimer"><strong>${e(t('importantLimitation'))}</strong> ${e(t('limitationText', { emergency: emergencyName() }))}</aside>
      <div class="more-status">${statusPill()}<span>${e(t('kbFooter', { version: kb.metadata?.kbVersion ?? '—', date: kb.metadata?.updatedAt ?? '—' }))}</span></div>
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => navigate('#/'));
  document.getElementById('open-kb').addEventListener('click', () => navigate('#/kb'));
  document.getElementById('open-settings').addEventListener('click', () => navigate('#/settings'));
  setupInstallCard();
  return t('moreTitle');
}

function unsafeSceneMarkup() {
  return `<section class="unsafe-scene" role="alert" aria-labelledby="unsafe-heading">
    <div class="big-icon" aria-hidden="true">!</div>
    <div class="eyebrow">${e(t('assessmentSafetyFirst'))}</div>
    <h2 id="unsafe-heading">${e(t('assessmentUnsafeTitle'))}</h2>
    <p>${e(t('assessmentUnsafeText', { emergency: emergencyName() }))}</p>
    ${emergencyButton()}
    <button class="btn outline full card-spaced" id="recheck-scene" type="button">${e(t('assessmentRecheckScene'))}</button>
  </section>`;
}

function renderAssessment() {
  const step = state.assessmentStep === 'scene' ? 1 : 2;
  const unsafe = state.assessmentStep === 'unsafe';
  const responseStep = state.assessmentStep === 'response';
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
      <div><div class="eyebrow">${e(t('assessmentEyebrow', { step: formatNumber(step) }))}</div><h1 id="view-heading" tabindex="-1">${e(t('assessmentTitle'))}</h1></div>
      ${miniEmergencyButton()}
    </header>
    <main class="body assessment-body">
      ${unsafe ? unsafeSceneMarkup() : `
        <section class="question-card" aria-labelledby="assessment-question">
          <div class="big-icon" aria-hidden="true">${responseStep ? '?' : '⌂'}</div>
          <h2 id="assessment-question">${e(t(responseStep ? 'assessmentResponseTitle' : 'assessmentSceneTitle'))}</h2>
          <p>${e(t(responseStep ? 'assessmentResponseHelp' : 'assessmentSceneHelp'))}</p>
        </section>
        <div class="assessment-choices">
          ${responseStep ? `
            <button class="btn yes" data-response="clear" type="button">${e(t('assessmentResponseClear'))}</button>
            <button class="btn secondary" data-response="limited" type="button">${e(t('assessmentResponseLimited'))}</button>
            <button class="btn emergency" data-response="none" type="button">${e(t('assessmentResponseNone'))}</button>
            <button class="btn text" data-response="unknown" type="button">${e(t('assessmentResponseUnknown'))}</button>
          ` : `
            <button class="btn yes" data-scene="y" type="button">${e(t('assessmentSceneSafe'))}</button>
            <button class="btn emergency" data-scene="n" type="button">${e(t('assessmentSceneUnsafe'))}</button>
            <button class="btn secondary" data-scene="u" type="button">${e(t('assessmentSceneUnknown'))}</button>
          `}
        </div>
      `}
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => navigate('#/'));
  document.getElementById('recheck-scene')?.addEventListener('click', () => {
    state.assessmentStep = 'scene';
    render({ focus: true });
  });
  document.querySelectorAll('[data-scene]').forEach((button) => button.addEventListener('click', () => {
    state.assessmentStep = button.dataset.scene === 'y' ? 'response' : 'unsafe';
    render({ focus: true });
  }));
  document.querySelectorAll('[data-response]').forEach((button) => button.addEventListener('click', () => {
    const response = button.dataset.response;
    const preserve = state.assessmentPreserve === true;
    state.assessmentPreserve = false;
    state.triagePreserveFinder = preserve;
    if (response === 'clear' || response === 'limited') {
      applyResponseMode(response, { preserve });
      state.triageAnswers = {
        sceneSafe: 'y',
        conscious: 'y',
        communication: response === 'clear' ? 'y' : 'n',
      };
    } else {
      state.responseMode = 'limited';
      state.triageAnswers = { sceneSafe: 'y', conscious: 'n' };
    }
    navigate('#/triage');
  }));
  return t('assessmentTitle');
}

function renderTriage() {
  const questionId = nextTriageQuestion(state.triageAnswers);
  const route = triageRoute(state.triageAnswers);
  if (!questionId && route) {
    if (route === 'scene-unsafe') {
      app.innerHTML = `
        <header class="topbar">
          <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
          <div><div class="eyebrow">${e(t('assessmentSafetyFirst'))}</div><h1 id="view-heading" tabindex="-1">${e(t('triageTitle'))}</h1></div>
          ${miniEmergencyButton()}
        </header>
        <main class="body assessment-body">${unsafeSceneMarkup()}</main>`;
      document.getElementById('back-home').addEventListener('click', () => {
        state.triageAnswers = {};
        navigate('#/');
      });
      document.getElementById('recheck-scene').addEventListener('click', () => {
        state.triageAnswers = {};
        render({ focus: true });
      });
      return t('triageTitle');
    }
    if (route === 'symptoms') {
      const mode = state.triageAnswers.communication === 'y' ? 'clear' : 'limited';
      applyResponseMode(mode, { preserve: state.triagePreserveFinder });
      state.triagePreserveFinder = false;
      state.triageAnswers = {};
      navigate('#/symptoms');
      return t('triageRoute');
    }
    state.triageContext = { ...state.triageAnswers };
    state.caseId = route;
    state.preparedCaseId = route;
    state.caseAnswers = triageSymptoms(state.triageAnswers);
    state.caseStage = 'result';
    state.triageAnswers = {};
    state.triagePreserveFinder = false;
    navigate(caseHref(route));
    return t('triageRoute');
  }

  const step = formatNumber(Object.keys(state.triageAnswers).length + 1);
  const questionKeys = {
    sceneSafe: 'triageSceneSafe', conscious: 'triageConscious', breathing: 'triageBreathing',
    choking: 'triageChoking', breathingDifficulty: 'triageBreathingDifficulty',
    bleeding: 'triageBleeding', communication: 'triageCommunication',
  };
  const questionHint = questionId === 'breathing'
    ? `<p class="question-hint">${e(t('triageBreathingHint'))}</p>`
    : questionId === 'sceneSafe'
      ? `<p class="question-hint">${e(t('triageSceneHint'))}</p>`
      : questionId === 'communication'
        ? `<p class="question-hint">${e(t('triageCommunicationHint'))}</p>`
        : '';
  const sceneAnswers = questionId === 'sceneSafe';
  const communicationAnswers = questionId === 'communication';
  const emergency = emergencyName();
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
      <div><div class="eyebrow">${e(t('triageEyebrow', { step }))}</div><h1 id="view-heading" tabindex="-1">${e(t('triageTitle'))}</h1></div>
      ${miniEmergencyButton()}
    </header>
    <main class="body">
      ${sceneAnswers ? '' : `<aside class="triage-note"><strong>${e(t('triageBefore'))}</strong> ${e(t('triageBeforeText', { emergency }))}</aside>`}
      <section class="question-card" aria-labelledby="question-heading">
        <div class="big-icon" aria-hidden="true">?</div>
        <h2 id="question-heading">${e(t(questionKeys[questionId]))}</h2>
        ${questionHint}
        ${sceneAnswers ? '' : `<p>${e(t('triageRecheck'))}</p>`}
      </section>
      <div class="${sceneAnswers || communicationAnswers ? 'assessment-choices' : 'yesno'}" aria-label="${e(t('triageAnswer'))}">
        ${sceneAnswers ? `
          <button class="btn yes" data-answer="y" type="button">${e(t('triageSafeAnswer'))}</button>
          <button class="btn emergency" data-answer="n" type="button">${e(t('triageUnsafeAnswer'))}</button>
          <button class="btn secondary" data-answer="u" type="button">${e(t('triageUnknownAnswer'))}</button>
        ` : `
          <button class="btn yes" data-answer="y" type="button">${e(t('yes'))}</button>
          <button class="btn no" data-answer="n" type="button">${e(t('no'))}</button>
          ${communicationAnswers ? `<button class="btn text" data-answer="u" type="button">${e(t('unknown'))}</button>` : ''}
        `}
      </div>
      ${emergencyButton('btn emergency full card-spaced')}
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => {
    state.triageAnswers = {};
    state.triagePreserveFinder = false;
    navigate('#/');
  });
  document.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => {
    state.triageAnswers[questionId] = button.dataset.answer;
    render({ focus: true });
  }));
  return t('triageTitle');
}

function defaultEvidenceType(symptom) {
  const types = symptom?.evidenceTypes || ['observed'];
  if (state.responseMode === 'limited') return types.find((type) => type !== 'reported') || types[0];
  return types[0];
}

function symptomChips(symptomIds, selected, dataAttribute = 'data-sym', evidenceType = '') {
  return symptomModels(symptomIds, kb.symptoms).map((symptom) => {
    const active = selected.includes(symptom.id);
    const source = evidenceType || state.diffSources[symptom.id] || defaultEvidenceType(symptom);
    const evidenceLabel = source ? symptom[`${source}Label`] : '';
    const sourceAttribute = dataAttribute === 'data-sym' ? ` data-evidence="${e(source)}"` : '';
    return `<button class="chip${active ? ' active' : ''}" type="button" ${dataAttribute}="${e(symptom.id)}"${sourceAttribute} aria-pressed="${active}">${e(evidenceLabel || symptom.label)}</button>`;
  }).join('');
}

function symptomLabels(ids) {
  return ids.map((id) => kb.symptoms[id]?.label).filter(Boolean);
}

function symptomHasEvidence(id, type) {
  return kb.symptoms[id]?.evidenceTypes?.includes(type) === true;
}

function canBeHistoricalReport(id) {
  const symptom = kb.symptoms[id];
  return Boolean(symptom?.canBeHistorical || symptom?.reportedCanBeHistorical);
}

function currentEvidenceAvailable(id) {
  const types = kb.symptoms[id]?.evidenceTypes || [];
  return state.responseMode === 'clear' || types.some((type) => type !== 'reported');
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

let restoreSearchFocus = false;

function selectedSymptomsMarkup() {
  const current = sortSymptomIds(state.diffSelected, kb.symptoms);
  const historical = sortSymptomIds(state.diffHistorical, kb.symptoms);
  if (!current.length && !historical.length) return '';
  const count = formatNumber(new Set([...current, ...historical]).size);
  const sourceKeys = {
    observed: 'sourceObserved', reported: 'sourceReported',
    scene: 'sourceScene', background: 'sourceBackground',
  };
  const currentGroups = Object.entries(sourceKeys).map(([source, key]) => {
    const ids = current.filter((id) => state.diffSources[id] === source);
    return ids.length ? `<h3 class="selected-source-title">${e(t(key))}</h3><div class="chips selected-chips">${symptomChips(ids, state.diffSelected, 'data-sym', source)}</div>` : '';
  }).join('');
  return `<section class="selected-tray" aria-labelledby="selected-tray-heading">
    <div class="section-heading-row">
      <h2 id="selected-tray-heading">${e(t('selected', { count }))}</h2>
      <button class="small-text-btn" id="clear-symptoms" type="button">${e(t('clearAll'))}</button>
    </div>
    ${currentGroups}
    ${historical.length ? `<h3>${e(t('historicalTitle'))}</h3><div class="chips selected-chips historical-inline">${symptomChips(historical, state.diffHistorical, 'data-history-sym')}</div>` : ''}
  </section>`;
}

function searchResultsMarkup(query) {
  const normalized = normalizePersianSearch(query);
  if (normalized.length < 2) return `<p class="empty-inline">${e(t('symptomsSearchMin'))}</p>`;
  const matched = searchSymptoms(query, kb.symptoms);
  const current = matched.filter((id) => (
    currentEvidenceAvailable(id)
    && isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms)
  ));
  const historical = state.responseMode === 'limited'
    ? matched.filter((id) => (
      !current.includes(id)
      && symptomHasEvidence(id, 'reported')
      && canBeHistoricalReport(id)
    ))
    : [];
  if (!current.length && !historical.length) {
    return `<div class="empty compact-empty"><h2>${e(t('symptomsSearchNone'))}</h2><p>${e(t('symptomsSearchNoneHelp'))}</p></div>`;
  }
  const count = formatNumber(new Set([...current, ...historical]).size);
  const sourceGroups = [
    ['scene', 'sourceScene'],
    ['observed', 'sourceObserved'],
    ['reported', 'sourceReported'],
    ['background', 'sourceBackground'],
  ].map(([source, labelKey]) => {
    if (source === 'reported' && state.responseMode !== 'clear') return '';
    const ids = current.filter((id) => symptomHasEvidence(id, source));
    return ids.length ? `<section class="search-result-group"><h3>${e(t(labelKey))}</h3><div class="chips">${symptomChips(ids, state.diffSelected, 'data-sym', source)}</div></section>` : '';
  }).join('');
  return `<div class="section-heading-row"><h2>${e(t('symptomsSearchResults'))}</h2><span class="result-count">${e(t('itemCount', { count }))}</span></div>
    ${sourceGroups}
    ${historical.length ? `<section class="search-result-group historical-search"><h3>${e(t('searchHistoricalResults'))}</h3><div class="chips">${symptomChips(historical, state.diffHistorical, 'data-history-sym', 'reported')}</div></section>` : ''}`;
}

function applyCurrentSymptom(symptomId, evidenceType = '') {
  const wasSelected = state.diffSelected.includes(symptomId);
  const result = toggleCurrentSymptom(state.diffSelected, state.diffHistorical, symptomId, kb.symptoms);
  state.diffSelected = result.selected;
  state.diffHistorical = result.historical;
  if (wasSelected || !result.accepted) delete state.diffSources[symptomId];
  else state.diffSources[symptomId] = evidenceType || defaultEvidenceType(kb.symptoms[symptomId]);
  for (const id of [...result.removed, ...result.movedToHistorical]) delete state.diffSources[id];
  if (result.accepted && !wasSelected && symptomId === 'unresponsive') {
    applyResponseMode('limited', { preserve: true });
  }
  state.diffCompatibilityMessage = compatibilityMessage(symptomId, result);
  restoreSearchFocus = Boolean(state.diffQuery);
  render({ focus: false });
}

function wireCurrentSymptomButtons(root = document) {
  root.querySelectorAll('[data-sym]').forEach((button) => button.addEventListener('click', () => {
    applyCurrentSymptom(button.dataset.sym, button.dataset.evidence);
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
      wireHistoricalSymptomButtons(searchPanel);
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

function evidenceSection(type, headingKey, helpKey) {
  const compatible = sortSymptomIds(
    Object.keys(kb.symptoms).filter((id) => (
      symptomHasEvidence(id, type)
      && !state.diffSelected.includes(id)
      && isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms)
    )),
    kb.symptoms,
  );
  if (!compatible.length) return '';
  const expanded = state.diffExpanded.includes(type);
  const limit = EVIDENCE_LIMITS[type] || 10;
  const visible = expanded ? compatible : compatible.slice(0, limit);
  const hiddenCount = compatible.length - visible.length;
  return `<section class="evidence-section evidence-${e(type)}" aria-labelledby="${e(type)}-heading">
    <div class="evidence-heading"><span class="evidence-source" aria-hidden="true">${type === 'observed' ? '◉' : type === 'reported' ? '“”' : type === 'scene' ? '⌖' : 'i'}</span><div><h2 id="${e(type)}-heading">${e(t(headingKey))}</h2><p>${e(t(helpKey))}</p></div></div>
    <div class="chips">${symptomChips(visible, state.diffSelected, 'data-sym', type)}</div>
    ${hiddenCount > 0 ? `<button class="show-more-symptoms" data-expand="${e(type)}" type="button">${e(t('showMore', { count: formatNumber(hiddenCount) }))}</button>` : ''}
    ${expanded && compatible.length > limit ? `<button class="show-more-symptoms" data-collapse="${e(type)}" type="button">${e(t('showLess'))}</button>` : ''}
  </section>`;
}

function historicalEvidenceSection() {
  if (state.responseMode !== 'limited') return '';
  const type = 'historical';
  const compatible = sortSymptomIds(
    Object.keys(kb.symptoms).filter((id) => (
      symptomHasEvidence(id, 'reported')
      && canBeHistoricalReport(id)
      && !state.diffHistorical.includes(id)
    )),
    kb.symptoms,
  );
  if (!compatible.length) return '';
  const expanded = state.diffExpanded.includes(type);
  const limit = EVIDENCE_LIMITS[type];
  const visible = expanded ? compatible : compatible.slice(0, limit);
  const hiddenCount = compatible.length - visible.length;
  return `<section class="historical-symptoms evidence-section" aria-labelledby="historical-heading">
    <h2 id="historical-heading">${e(t('historicalHeading'))}</h2>
    <p>${e(t('historicalHelp'))}</p>
    <div class="chips">${symptomChips(visible, state.diffHistorical, 'data-history-sym', 'reported')}</div>
    ${hiddenCount > 0 ? `<button class="show-more-symptoms" data-expand="${type}" type="button">${e(t('showMore', { count: formatNumber(hiddenCount) }))}</button>` : ''}
    ${expanded && compatible.length > limit ? `<button class="show-more-symptoms" data-collapse="${type}" type="button">${e(t('showLess'))}</button>` : ''}
  </section>`;
}

function renderSymptoms() {
  if (!state.responseMode) {
    state.assessmentStep = 'scene';
    state.assessmentPreserve = false;
    navigate('#/assessment');
    return t('assessmentTitle');
  }
  if (state.diffStage === 'result') return renderDifferentialResults();

  const allEvidence = [...new Set([...state.diffSelected, ...state.diffHistorical])];
  const suggestions = suggestSymptoms(allEvidence, kb.cases, kb.symptoms, 12)
    .filter((id) => (
      currentEvidenceAvailable(id)
      && !state.diffSelected.includes(id)
      && isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms)
    ))
    .slice(0, 6);
  const selectionCount = allEvidence.length;
  const hasSearch = Boolean(state.diffQuery.trim());
  const emergency = emergencyName();
  const responseClear = state.responseMode === 'clear';

  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="${e(t('backHome'))}">‹</button>
      <div><div class="eyebrow">${e(t('symptomsEyebrow'))}</div><h1 id="view-heading" tabindex="-1">${e(t('symptomsTitle'))}</h1></div>
      ${miniEmergencyButton()}
    </header>
    <main class="body symptoms-body">
      ${compatibilityNotice()}
      <aside class="triage-note symptom-urgent-note"><strong>${e(t('symptomsUrgent'))}</strong> ${e(t('symptomsUrgentText', { emergency }))}<button class="small-text-btn" id="restart-urgent" type="button">${e(t('symptomsUrgentAction'))}</button></aside>
      <section class="response-mode-card ${responseClear ? 'response-clear' : 'response-limited'}">
        <div><strong>${e(t(responseClear ? 'responseClearTitle' : 'responseLimitedTitle'))}</strong><p>${e(t(responseClear ? 'responseClearText' : 'responseLimitedText'))}</p></div>
        <button class="small-text-btn" id="change-response" type="button">${e(t('responseChange'))}</button>
      </section>
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
        ${suggestions.length ? `<section class="suggested-symptoms" aria-labelledby="suggested-heading">
          <h2 id="suggested-heading">${e(t('suggestedTitle'))}</h2>
          <p class="section-help">${e(t('suggestedHelp'))}</p>
          <div class="chips">${symptomChips(suggestions, state.diffSelected)}</div>
        </section>` : ''}
        ${evidenceSection('scene', 'sceneHeading', 'sceneHelp')}
        ${evidenceSection('observed', 'observedHeading', 'observedHelp')}
        ${responseClear ? evidenceSection('reported', 'reportedHeading', 'reportedHelp') : ''}
        ${evidenceSection('background', 'backgroundHeading', 'backgroundHelp')}
        ${historicalEvidenceSection()}
      </div>

      <div class="symptom-result-bar">
        <button class="btn primary full" id="show-results" type="button" ${selectionCount ? '' : 'disabled'}>${e(t('showRelated', { count: formatNumber(selectionCount) }))}</button>
      </div>
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => navigate('#/'));
  document.getElementById('restart-urgent').addEventListener('click', () => {
    state.triageAnswers = {};
    state.triagePreserveFinder = false;
    state.responseMode = null;
    navigate('#/triage');
  });
  document.getElementById('change-response').addEventListener('click', () => {
    state.assessmentStep = 'response';
    state.assessmentPreserve = true;
    navigate('#/assessment');
  });
  setupSymptomSearch();
  wireCurrentSymptomButtons();
  wireHistoricalSymptomButtons();
  document.getElementById('clear-symptoms')?.addEventListener('click', () => {
    state.diffSelected = [];
    state.diffSources = {};
    state.diffHistorical = [];
    state.diffCompatibilityMessage = t('clearedAll');
    state.diffExpanded = [];
    render({ focus: false });
  });
  document.querySelectorAll('[data-expand]').forEach((button) => button.addEventListener('click', () => {
    state.diffExpanded = [...new Set([...state.diffExpanded, button.dataset.expand])];
    render({ focus: false });
  }));
  document.querySelectorAll('[data-collapse]').forEach((button) => button.addEventListener('click', () => {
    state.diffExpanded = state.diffExpanded.filter((type) => type !== button.dataset.collapse);
    render({ focus: false });
  }));
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
  const safeRoute = state.ready && ['home', 'more', 'kb', 'settings'].includes(currentRoute().name);
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
    const registration = await navigator.serviceWorker.register('./sw.js?v=11', {
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
      if (['home', 'more', 'kb', 'symptoms'].includes(route.name)) render({ focus: false });
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
  if (['home', 'more', 'kb'].includes(route.name)) render({ focus: false });
  backgroundSync();
  checkForAppUpdate({ force: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForAppUpdate();
});
window.addEventListener('offline', () => {
  showSyncAnnouncement(t('offlineNow'));
  const route = currentRoute();
  if (['home', 'more', 'kb'].includes(route.name)) render({ focus: false });
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
