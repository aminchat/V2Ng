import { KnowledgeBase } from './kb.js';
import {
  TRIAGE_QUESTIONS,
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
} from './engine.js';

const kb = new KnowledgeBase();
const app = document.getElementById('app');
const routeAnnouncer = document.getElementById('route-announcer');
const syncAnnouncer = document.getElementById('sync-announcer');
const appUpdateBanner = document.getElementById('app-update');
const appUpdateNow = document.getElementById('app-update-now');
const appUpdateLater = document.getElementById('app-update-later');

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
};

const e = (value = '') => String(value).replace(/[&<>'"]/g, (character) => ({
  '&': '&amp;', '<': '&lt;', '>': '&gt;', "'": '&#39;', '"': '&quot;',
}[character]));

const caseHref = (id) => `#/case/${encodeURIComponent(id)}`;

function currentRoute() {
  const hash = location.hash || '#/';
  if (hash === '#/' || hash === '#') return { name: 'home' };
  if (hash === '#/triage') return { name: 'triage' };
  if (hash === '#/symptoms') return { name: 'symptoms' };
  if (hash === '#/kb') return { name: 'kb' };
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
  document.title = title ? `${title} | امدادگر` : 'امدادگر — راهنمای آفلاین کمک‌های اولیه';
}

function render({ focus = true } = {}) {
  if (!state.ready) return;
  const route = currentRoute();
  if (route.name === 'case' && state.lastRouteName !== 'case') {
    if (state.preparedCaseId !== route.id) state.caseId = null;
    state.preparedCaseId = null;
  }
  state.lastRouteName = route.name;
  let heading = 'امدادگر';

  if (route.name === 'triage') heading = renderTriage();
  else if (route.name === 'symptoms') heading = renderSymptoms();
  else if (route.name === 'case') heading = renderCase(route.id);
  else if (route.name === 'kb') heading = renderKb();
  else if (route.name === 'not-found') heading = renderNotFound();
  else heading = renderHome();

  refreshAppUpdateBanner();
  setDocumentTitle(route.name === 'home' ? '' : heading);
  if (focus) {
    requestAnimationFrame(() => {
      const target = document.getElementById('view-heading');
      target?.focus({ preventScroll: true });
      if (routeAnnouncer) routeAnnouncer.textContent = `صفحهٔ ${heading}`;
    });
  }
}

function statusPill() {
  return navigator.onLine
    ? '<span class="pill online">● برخط</span>'
    : '<span class="pill offline">● آفلاین؛ راهنمای ذخیره‌شده در دسترس است</span>';
}

function compatibilityNotice() {
  if (!window.indexedDB) {
    return '<div class="compatibility-notice" role="alert">مرورگر شما از فضای ذخیره‌سازی آفلاین پشتیبانی نمی‌کند. راهنما فقط در حین اتصال اینترنت قابل استفاده هستند.</div>';
  }
  return '';
}

function renderHome() {
  app.innerHTML = `
    <header class="topbar">
      <div><div class="eyebrow">راهنمای کمک‌های اولیه</div><h1 id="view-heading" tabindex="-1">امدادگر</h1></div>
      ${statusPill()}
    </header>
    <main class="body home-body">
      ${compatibilityNotice()}
      <section class="safety-notice" aria-labelledby="safety-heading">
        <h2 id="safety-heading">اگر وضعیت تهدیدکنندهٔ حیات است</h2>
        <p>ابتدا ایمنی صحنه را بسنجید. با <strong>۱۱۵</strong> تماس بگیرید، تلفن را روی بلندگو بگذارید و راهنمای اپراتور را دنبال کنید.</p>
        <a class="btn emergency full" href="tel:115" aria-label="تماس با اورژانس ۱۱۵">☎ تماس با ۱۱۵</a>
      </section>
      <button class="primary-action" id="start-triage" type="button">
        <span class="primary-icon" aria-hidden="true">⏱</span>
        <span><strong>شروع بررسی فوری</strong><small>هوشیاری، تنفس، راه هوایی و خونریزی شدید</small></span>
      </button>
      <button class="secondary-action" id="start-symptoms" type="button">
        <span aria-hidden="true">🔎</span>
        <span><strong>یافتن راهنما از روی نشانه‌ها</strong><small>برای وضعیت‌های بدون خطر فوری آشکار؛ جایگزین تشخیص نیست</small></span>
      </button>
      <button class="secondary-action" id="open-kb" type="button">
        <span aria-hidden="true">📚</span>
        <span><strong>مرور همهٔ راهنماها</strong><small>${kb.listCases().length} موضوع کمک‌های اولیه</small></span>
      </button>
      <aside class="disclaimer">
        <strong>محدودیت مهم:</strong> این نرم‌افزار ابزار آموزشی و پشتیبان تصمیم است، نه تشخیص پزشکی یا جایگزین آموزش عملی، پزشک یا اپراتور اورژانس. در تردید یا بدترشدن حال فرد با ۱۱۵ تماس بگیرید.
      </aside>
    </main>
    <footer class="footer">پایگاه دانش ${e(kb.metadata?.kbVersion ?? '—')} · به‌روزرسانی ${e(kb.metadata?.updatedAt ?? '—')}</footer>`;

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
  return 'خانه';
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
      return 'بررسی فوری';
    }
    state.triageContext = { ...state.triageAnswers };
    state.caseId = route;
    state.preparedCaseId = route;
    state.caseAnswers = triageSymptoms(state.triageAnswers);
    state.caseStage = 'result';
    state.triageAnswers = {};
    navigate(caseHref(route));
    return 'بررسی فوری';
  }

  const step = Object.keys(state.triageAnswers).length + 1;
  const breathingHint = questionId === 'breathing'
    ? '<p class="question-hint">حداکثر ۱۰ ثانیه حرکت قفسهٔ سینه و تنفس طبیعی را بررسی کنید. نفس‌های گاه‌به‌گاه و غیرطبیعی را «خیر» حساب کنید.</p>'
    : '';
  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="بازگشت به خانه">‹</button>
      <div><div class="eyebrow">بررسی فوری · مرحله ${step}</div><h1 id="view-heading" tabindex="-1">خطرهای فوری</h1></div>
      <a class="mini-call" href="tel:115" aria-label="تماس با اورژانس ۱۱۵">۱۱۵</a>
    </header>
    <main class="body">
      <aside class="triage-note"><strong>پیش از نزدیک‌شدن:</strong> از ایمنی خود، فرد و اطرافیان مطمئن شوید. اگر خطر وجود دارد نزدیک نشوید و با ۱۱۵ تماس بگیرید.</aside>
      <section class="question-card" aria-labelledby="question-heading">
        <div class="big-icon" aria-hidden="true">?</div>
        <h2 id="question-heading">${e(TRIAGE_QUESTIONS[questionId] || '')}</h2>
        ${breathingHint}
        <p>وضعیت را دوباره بررسی کنید؛ اگر حال فرد تغییر کرد، ارزیابی را از ابتدا انجام دهید.</p>
      </section>
      <div class="yesno" aria-label="پاسخ">
        <button class="btn yes" data-answer="y" type="button">بله</button>
        <button class="btn no" data-answer="n" type="button">خیر</button>
      </div>
      <a class="btn emergency full card-spaced" href="tel:115">☎ تماس با ۱۱۵</a>
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => {
    state.triageAnswers = {};
    navigate('#/');
  });
  document.querySelectorAll('[data-answer]').forEach((button) => button.addEventListener('click', () => {
    state.triageAnswers[questionId] = button.dataset.answer;
    render({ focus: true });
  }));
  return 'خطرهای فوری';
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
  const label = kb.symptoms[symptomId]?.label || 'این نشانه';
  const parts = [];
  if (result.removed.length) parts.push(`${result.removed.length} نشانهٔ ناسازگار حذف شد`);
  if (result.movedToHistorical.length) parts.push(`${result.movedToHistorical.length} نشانه به بخش «پیش از بیهوشی یا توقف تنفس» منتقل شد`);
  if (result.restored.length) parts.push(`${result.restored.length} نشانهٔ پیشین دوباره به فهرست فعلی بازگشت`);
  if (!result.accepted) return `«${label}» با یک وضعیت پرخطر انتخاب‌شده سازگار نیست.`;
  return parts.length ? `با تغییر «${label}»، ${parts.join(' و ')}.` : '';
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
  return `<section class="selected-tray" aria-labelledby="selected-tray-heading">
    <div class="section-heading-row">
      <h2 id="selected-tray-heading">انتخاب‌شده‌ها (${new Set([...current, ...historical]).size})</h2>
      <button class="small-text-btn" id="clear-symptoms" type="button">پاک‌کردن همه</button>
    </div>
    ${current.length ? `<div class="chips selected-chips">${symptomChips(current, state.diffSelected)}</div>` : ''}
    ${historical.length ? `<h3>گزارش‌شده پیش از بیهوشی یا توقف تنفس</h3><div class="chips selected-chips historical-inline">${symptomChips(historical, state.diffHistorical, 'data-history-sym')}</div>` : ''}
  </section>`;
}

function searchResultsMarkup(query) {
  const normalized = normalizePersianSearch(query);
  if (normalized.length < 2) {
    return '<p class="empty-inline">برای جست‌وجو حداقل دو حرف وارد کنید.</p>';
  }
  const ids = searchSymptoms(query, kb.symptoms)
    .filter((id) => isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms));
  if (!ids.length) {
    return '<div class="empty compact-empty"><h2>نشانه‌ای پیدا نشد</h2><p>نام دیگری امتحان کنید یا از دسته‌بندی‌ها استفاده کنید.</p></div>';
  }
  return `<div class="section-heading-row"><h2>نتیجهٔ جست‌وجو</h2><span class="result-count">${ids.length} مورد</span></div>
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
    { id: QUICK_CATEGORY, label: '★ پرکاربرد' },
    { id: SELECTED_CATEGORY, label: `✓ انتخاب‌شده‌ها (${selectionCount})` },
    { id: '', label: 'همه' },
    ...categoryIds.map((id) => ({ id, label: `${kb.categories[id].icon} ${kb.categories[id].title}` })),
  ].map((item) => ({ ...item, active: (item.id || null) === (state.diffCategory || null) }));
  const categoryTabs = categoryItems.map(({ id, label, active }) => (
    `<button type="button" class="cat-btn${active ? ' active' : ''}" data-cat="${e(id)}" aria-pressed="${active}">${e(label)}</button>`
  )).join('');
  const categoryOptions = categoryItems.map(({ id, label, active }) => (
    `<option value="${e(id)}"${active ? ' selected' : ''}>${e(label)}</option>`
  )).join('');
  const activeCategoryLabel = categoryItems.find((item) => item.active)?.label.replace(/^[★✓]\s*/, '') || 'همهٔ نشانه‌ها';
  const hasSearch = Boolean(state.diffQuery.trim());

  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="بازگشت به خانه">‹</button>
      <div><div class="eyebrow">راهنمای نشانه‌محور</div><h1 id="view-heading" tabindex="-1">چه نشانه‌ای می‌بینید؟</h1></div>
      <a class="mini-call" href="tel:115" aria-label="تماس با اورژانس ۱۱۵">۱۱۵</a>
    </header>
    <main class="body symptoms-body">
      ${compatibilityNotice()}
      <aside class="disclaimer compact"><strong>خطر فوری؟</strong> اگر فرد بیهوش است، تنفس طبیعی ندارد، دچار انسداد شدید راه هوایی یا خونریزی شدید است، به «بررسی فوری» برگردید و با ۱۱۵ تماس بگیرید.</aside>
      ${state.diffCompatibilityMessage ? `<p class="compatibility-notice" role="status">${e(state.diffCompatibilityMessage)}</p>` : ''}

      <section class="symptom-search-card" aria-labelledby="search-heading">
        <h2 id="search-heading">جست‌وجوی سریع نشانه</h2>
        <div class="search-field">
          <input id="symptom-search" type="search" value="${e(state.diffQuery)}" placeholder="مثلاً تنگی نفس، سرگیجه یا خونریزی" autocomplete="off" enterkeyhint="search" aria-describedby="search-help">
          <button id="clear-search" type="button" aria-label="پاک‌کردن جست‌وجو" ${hasSearch ? '' : 'hidden'}>×</button>
        </div>
        <p id="search-help">نام رایج نشانه را بنویسید؛ جست‌وجو در همهٔ دسته‌ها و به‌صورت آفلاین انجام می‌شود.</p>
      </section>

      ${selectedSymptomsMarkup()}

      <section id="search-results" class="search-results" aria-live="polite" ${hasSearch ? '' : 'hidden'}>${hasSearch ? searchResultsMarkup(state.diffQuery) : ''}</section>

      <div id="symptom-browser" ${hasSearch ? 'hidden' : ''}>
        <fieldset class="category-fieldset">
          <legend>دستهٔ نشانه‌ها</legend>
          <div class="category-tabs" id="category-tabs" role="group" aria-label="دسته‌های نشانه‌ها">${categoryTabs}</div>
          <label class="category-select-label" for="category-select">انتخاب دستهٔ نشانه‌ها</label>
          <select class="category-select" id="category-select">${categoryOptions}</select>
        </fieldset>

        ${suggestions.length ? `<section class="suggested-symptoms" aria-labelledby="suggested-heading">
          <h2 id="suggested-heading">نشانه‌های مرتبط برای بررسی</h2>
          <p class="section-help">این‌ها فقط گزینه‌های مرتبط با انتخاب‌های شما هستند و تشخیص یا انتخاب خودکار نیستند.</p>
          <div class="chips">${symptomChips(suggestions, state.diffSelected)}</div>
        </section>` : ''}

        <section aria-labelledby="symptom-heading">
          <h2 id="symptom-heading">${e(activeCategoryLabel)}</h2>
          <p class="section-help">گزینه‌های ناسازگار خودکار مخفی می‌شوند. فقط مواردی را انتخاب کنید که وجودشان را می‌بینید یا می‌دانید.</p>
          <div class="chips" id="current-symptoms">${symptomChips(currentSymptoms, state.diffSelected)}</div>
          ${currentSymptoms.length ? '' : `<p class="empty-inline">${state.diffCategory === SELECTED_CATEGORY ? 'هنوز نشانه‌ای انتخاب نشده است.' : 'در این دسته گزینهٔ سازگار دیگری باقی نمانده است.'}</p>`}
          ${hiddenSymptomCount > 0 ? `<button class="show-more-symptoms" id="show-more-symptoms" type="button">نمایش ${hiddenSymptomCount} نشانهٔ دیگر</button>` : ''}
          ${state.diffShowAll && !isCompactCategory && compatibleSymptoms.length > INITIAL_SYMPTOM_LIMIT ? '<button class="show-more-symptoms" id="show-less-symptoms" type="button">نمایش کمتر</button>' : ''}
        </section>

        ${historicalSymptoms.length ? `<section class="historical-symptoms" aria-labelledby="historical-heading">
          <h2 id="historical-heading">پیش از بیهوشی یا توقف تنفس</h2>
          <p>فقط نشانه‌ای را انتخاب کنید که فرد پیش‌تر گفته یا شاهد آن را دیده است؛ این موارد نشانهٔ فعلی محسوب نمی‌شوند.</p>
          <div class="chips">${symptomChips(historicalSymptoms, state.diffHistorical, 'data-history-sym')}</div>
        </section>` : ''}
      </div>

      <div class="symptom-result-bar">
        <button class="btn primary full" id="show-results" type="button" ${selectionCount ? '' : 'disabled'}>بررسی مسیرهای مرتبط (${selectionCount})</button>
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
    state.diffCompatibilityMessage = 'همهٔ نشانه‌های انتخاب‌شده پاک شدند.';
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
  return 'انتخاب نشانه‌ها';
}
function renderDifferentialResults() {
  const allSelected = [...new Set([...state.diffSelected, ...state.diffHistorical])];
  const ranked = rankCases(allSelected, kb.cases);
  const critical = hasCriticalSymptoms(state.diffSelected);
  const selectedLabels = symptomLabels(state.diffSelected);
  const historicalLabels = symptomLabels(state.diffHistorical);

  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="edit-symptoms" type="button" aria-label="ویرایش نشانه‌ها">‹</button>
      <div><div class="eyebrow">نتیجهٔ راهنمای نشانه‌محور</div><h1 id="view-heading" tabindex="-1">مسیرهای مرتبط برای بررسی</h1></div>
      <a class="mini-call" href="tel:115" aria-label="تماس با اورژانس ۱۱۵">۱۱۵</a>
    </header>
    <main class="body">
      ${critical ? `<section class="emergency-banner"><h2>نشانهٔ خطر انتخاب شده است</h2><p>بررسی نرم‌افزار را متوقف کنید و اکنون با ۱۱۵ تماس بگیرید. اگر فرد تنفس طبیعی ندارد، CPR را آغاز کنید.</p><a class="btn emergency full" href="tel:115">☎ تماس با ۱۱۵</a></section>` : ''}
      <section class="selected-summary"><h2>نشانه‌های فعلی</h2><p>${selectedLabels.length ? selectedLabels.map(e).join('، ') : 'موردی ثبت نشده است.'}</p>${historicalLabels.length ? `<h3>گزارش‌شده پیش از بیهوشی یا توقف تنفس</h3><p>${historicalLabels.map(e).join('، ')}</p>` : ''}</section>
      <p class="result-explainer">این فهرست فقط موضوعات آموزشی مرتبط را بر پایهٔ هم‌پوشانی نشانه‌های فعلی و سابقهٔ گزارش‌شده مرتب می‌کند و احتمال بیماری یا تشخیص پزشکی نیست. پیش از اقدام، پرسش‌های هشدار هر راهنما را مرور کنید.</p>
      <div class="result-list">
        ${ranked.length ? ranked.map(({ case: item, matched }) => `
          <article class="result-card">
            <div class="case-icon" aria-hidden="true">${e(item.icon)}</div>
            <div><h2>${e(item.title)}</h2><p>${e(item.summary)}</p><small>${matched.length} نشانهٔ مرتبط</small></div>
            <a class="btn outline" href="${e(caseHref(item.id))}">بازکردن راهنما</a>
          </article>`).join('') : '<div class="empty"><h2>مسیر مشخصی پیدا نشد</h2><p class="empty-inline">هیچ راهنمایی با نشانه‌های انتخاب‌شده هم‌پوشانی ندارد.</p><p>نشانه‌ها را ویرایش کنید. اگر نگران هستید یا حال فرد بدتر می‌شود با ۱۱۵ تماس بگیرید.</p></div>'}
      </div>
      <button class="btn secondary full card-spaced" id="edit-bottom" type="button">ویرایش نشانه‌ها</button>
    </main>`;

  const edit = () => {
    state.diffStage = 'questions';
    render({ focus: true });
  };
  document.getElementById('edit-symptoms').addEventListener('click', edit);
  document.getElementById('edit-bottom').addEventListener('click', edit);
  return 'مسیرهای مرتبط برای بررسی';
}

function resetCaseState(item) {
  state.caseId = item.id;
  state.caseAnswers = [];
  state.caseStage = item.call115.always || !item.riskQuestions?.length ? 'result' : 'questions';
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

function caseHeader(item, eyebrow = 'راهنمای کمک‌های اولیه') {
  return `<header class="topbar">
    <button class="icon-btn" id="case-back" type="button" aria-label="بازگشت">‹</button>
    <div><div class="eyebrow">${e(eyebrow)}</div><h1 id="view-heading" tabindex="-1">${e(item.title)}</h1></div>
    <a class="mini-call" href="tel:115" aria-label="تماس با اورژانس ۱۱۵">۱۱۵</a>
  </header>`;
}

function renderCaseQuestions(item) {
  app.innerHTML = `${caseHeader(item, 'بازبینی نشانه‌های هشدار')}
    <main class="body">
      ${item.call115.always ? `<section class="emergency-banner"><h2>تماس با اورژانس را به تأخیر نیندازید</h2><p>${e(item.call115.text)}</p><a class="btn emergency full" href="tel:115">☎ تماس با ۱۱۵</a></section>` : ''}
      <section class="question-card left">
        <div class="case-icon large" aria-hidden="true">${e(item.icon)}</div>
        <h2>کدام نشانه‌ها وجود دارد؟</h2>
        <p>موارد موجود را انتخاب کنید. این پرسش‌ها فقط فوریت را بررسی می‌کنند و تشخیص نیستند.</p>
      </section>
      <div class="chips risk-chips">${symptomChips(item.riskQuestions, state.caseAnswers)}</div>
      <button class="btn primary full card-spaced" id="case-continue" type="button">نمایش اقدامات</button>
      <button class="btn text full" id="case-none" type="button">هیچ‌کدام از این نشانه‌ها وجود ندارد</button>
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
  const mustCall = flags.call115;
  const wasUnresponsiveWithBleeding = item.id === 'severe-bleeding' && state.triageContext?.conscious === 'n';

  app.innerHTML = `${caseHeader(item, mustCall ? 'اقدام فوری' : 'راهنمای اقدام')}
    <main class="body">
      ${mustCall ? `<section class="emergency-banner"><h2>همین حالا با ۱۱۵ تماس بگیرید</h2><p>${e(item.call115.text)}</p><a class="btn emergency full" href="tel:115">☎ تماس با ۱۱۵</a></section>` : `<section class="safe-banner"><h2>نشانهٔ اورژانسی انتخاب نشده است</h2><p>${e(item.call115.text)} اگر حال فرد بدتر شد، نشانهٔ تازه‌ای ایجاد شد یا تردید دارید با ۱۱۵ تماس بگیرید.</p></section>`}
      ${flags.reasons.length ? `<section class="red-flags"><h2>نشانه‌های هشدار انتخاب‌شده</h2><ul>${flags.reasons.map((flag) => `<li>${e(flag.text)}</li>`).join('')}</ul></section>` : ''}
      ${wasUnresponsiveWithBleeding ? '<aside class="triage-note"><strong>بیهوشی همراه خونریزی:</strong> هم‌زمان با کنترل خونریزی، تنفس را پیوسته بررسی کنید. اگر تنفس طبیعی متوقف شد، CPR را آغاز کنید و راهنمای ۱۱۵ را دنبال کنید.</aside>' : ''}
      <section class="case-summary"><div class="case-icon large" aria-hidden="true">${e(item.icon)}</div><div><h2>${e(item.title)}</h2><p>${e(item.summary)}</p></div></section>
      <section class="steps" aria-labelledby="steps-heading"><h2 id="steps-heading">اقدامات گام‌به‌گام</h2><ol>${item.actions.map((action) => `<li>${e(action)}</li>`).join('')}</ol></section>
      ${item.prohibitions?.length ? `<section class="prohibitions"><h2>این کارها را انجام ندهید</h2><ul>${item.prohibitions.map((prohibition) => `<li>${e(prohibition)}</li>`).join('')}</ul></section>` : ''}
      ${item.tip ? `<aside class="tip"><strong>نکته:</strong> ${e(item.tip)}</aside>` : ''}
      ${item.nationalNote ? `<aside class="national-note"><strong>اطلاعات ایران:</strong> ${e(item.nationalNote)}</aside>` : ''}
      <aside class="monitor-note"><strong>بازبینی پیوسته:</strong> فرد را تنها نگذارید. هوشیاری و تنفس طبیعی را مرتب بررسی کنید. اگر تنفس طبیعی متوقف شد، CPR را آغاز کنید و از AED در صورت دسترسی استفاده کنید.</aside>
      ${item.riskQuestions?.length ? '<button class="btn secondary full card-spaced" id="review-risks" type="button">بازبینی دوبارهٔ نشانه‌های هشدار</button>' : ''}
      ${item.related?.length ? `<section class="related"><h2>راهنماهای مرتبط</h2>${item.related.map((related) => `<a href="${e(caseHref(related.case))}">${e(related.text)} ←</a>`).join('')}</section>` : ''}
      <details class="sources"><summary>منابع و تاریخ بازبینی</summary><p>بازبینی محتوا: ${e(item.updatedAt)}</p><ul>${item.sources.map((source) => `<li>${e(source)}</li>`).join('')}</ul></details>
      <a class="btn emergency full card-spaced" href="tel:115">☎ تماس با ۱۱۵</a>
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
  const lastSync = kb.metadata?.lastSync ? new Date(kb.metadata.lastSync).toLocaleString('fa-IR') : 'نامشخص';

  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="بازگشت به خانه">‹</button>
      <div><div class="eyebrow">کتابخانهٔ آفلاین</div><h1 id="view-heading" tabindex="-1">راهنماها</h1></div>
      ${statusPill()}
    </header>
    <main class="body">
      ${compatibilityNotice()}
      <section class="sync-card" aria-labelledby="sync-heading">
        <h2 id="sync-heading">پایگاه دانش نسخهٔ ${e(kb.metadata?.kbVersion ?? '—')}</h2>
        <p>آخرین همگام‌سازی: ${e(lastSync)}</p>
        <button class="btn secondary" id="sync-now" type="button" ${navigator.onLine ? '' : 'disabled'}>بررسی به‌روزرسانی</button>
        <p class="sync-status" id="sync-status" role="status"></p>
      </section>
      ${casesByCategory.map(({ category, cases }) => `<section class="kb-category"><h2>${e(category.icon)} ${e(category.title)}</h2><div class="kb-grid">${cases.map((item) => `<a class="kb-card" href="${e(caseHref(item.id))}"><span aria-hidden="true">${e(item.icon)}</span><div><strong>${e(item.title)}</strong><small>${e(item.summary)}</small></div></a>`).join('')}</div></section>`).join('')}
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => navigate('#/'));
  document.getElementById('sync-now').addEventListener('click', async (event) => {
    const button = event.currentTarget;
    const status = document.getElementById('sync-status');
    button.disabled = true;
    status.textContent = 'در حال دریافت و اعتبارسنجی کامل پایگاه دانش…';
    try {
      const result = await kb.sync();
      status.textContent = result.changed.length ? `${result.changed.length} بخش با موفقیت به‌روزرسانی شد.` : 'پایگاه دانش به‌روز است.';
    } catch (error) {
      console.error(error);
      status.textContent = syncErrorMessage(error);
    } finally {
      button.disabled = !navigator.onLine;
    }
  });
  return 'راهنماها';
}

function renderNotFound() {
  app.innerHTML = `<main class="body centered"><div class="big-icon" aria-hidden="true">؟</div><h1 id="view-heading" tabindex="-1">صفحه پیدا نشد</h1><p>نشانی واردشده معتبر نیست.</p><button class="btn primary" id="go-home" type="button">بازگشت به خانه</button></main>`;
  document.getElementById('go-home').addEventListener('click', () => navigate('#/'));
  return 'صفحه پیدا نشد';
}

function syncErrorMessage(error) {
  if (['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR'].includes(error?.code)) {
    return 'به‌روزرسانی دریافت نشد. اتصال را بررسی کنید؛ نسخهٔ معتبر قبلی بدون تغییر باقی مانده است.';
  }
  return 'به‌روزرسانی به‌دلیل نامعتبر بودن یا خطای ذخیره‌سازی اعمال نشد؛ نسخهٔ معتبر قبلی بدون تغییر باقی مانده است.';
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
  const safeRoute = state.ready && ['home', 'kb'].includes(currentRoute().name);
  appUpdateBanner.hidden = !(waitingServiceWorker && !updateDismissed && safeRoute);
}

function offerAppUpdate(worker) {
  if (!worker || !navigator.serviceWorker.controller) return;
  const isNewWorker = waitingServiceWorker !== worker;
  waitingServiceWorker = worker;
  if (isNewWorker) updateDismissed = false;
  refreshAppUpdateBanner();
  showSyncAnnouncement('نسخهٔ جدید امدادگر آماده است. برای فعال‌سازی، دکمهٔ اکنون به‌روزرسانی را بزنید.');
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
    const registration = await navigator.serviceWorker.register('./sw.js?v=7', {
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
  showSyncAnnouncement('نسخهٔ جدید در حال فعال‌شدن است…');
  worker.postMessage({ type: 'SKIP_WAITING' });
});

appUpdateLater?.addEventListener('click', () => {
  updateDismissed = true;
  refreshAppUpdateBanner();
  showSyncAnnouncement('به‌روزرسانی به بعد موکول شد.');
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (!updateActivationRequested || reloadingForUpdate) return;
    reloadingForUpdate = true;
    location.reload();
  });
}

async function backgroundSync() {
  if (!navigator.onLine) return;
  try {
    const result = await kb.sync();
    if (result.changed.length) {
      showSyncAnnouncement('پایگاه دانش معتبر با موفقیت به‌روزرسانی شد.');
      const route = currentRoute();
      if (['home', 'kb', 'symptoms'].includes(route.name)) render({ focus: false });
    }
  } catch (error) {
    console.warn('Background KB sync failed', error);
  }
}

function renderFatal(error) {
  const networkFailure = ['NETWORK_ERROR', 'TIMEOUT', 'HTTP_ERROR'].includes(error?.code);
  app.innerHTML = `<main class="body centered" role="alert"><div class="big-icon" aria-hidden="true">!</div><h1 id="view-heading" tabindex="-1">راهنما آماده نشد</h1><p>${networkFailure ? 'هیچ نسخهٔ معتبر آفلاینی موجود نیست و دریافت پایگاه دانش انجام نشد. اتصال اینترنت را بررسی کنید.' : 'پایگاه دانش یا فضای ذخیره‌سازی مرورگر معتبر نیست و برنامه برای جلوگیری از نمایش راهنمای ناقص متوقف شد.'}</p><button class="btn primary" id="retry" type="button">تلاش دوباره</button><a class="btn emergency full card-spaced" href="tel:115">☎ تماس با ۱۱۵</a></main>`;
  document.getElementById('retry').addEventListener('click', () => location.reload());
  document.getElementById('view-heading')?.focus();
}

window.addEventListener('hashchange', () => render({ focus: true }));
window.addEventListener('online', () => {
  showSyncAnnouncement('اتصال اینترنت برقرار شد.');
  const route = currentRoute();
  if (route.name === 'home' || route.name === 'kb') render({ focus: false });
  backgroundSync();
  checkForAppUpdate({ force: true });
});
document.addEventListener('visibilitychange', () => {
  if (document.visibilityState === 'visible') checkForAppUpdate();
});
window.addEventListener('offline', () => {
  showSyncAnnouncement('اتصال اینترنت قطع شد؛ راهنمای ذخیره‌شده در دسترس است.');
  const route = currentRoute();
  if (route.name === 'home' || route.name === 'kb') render({ focus: false });
});

registerServiceWorker();
kb.load()
  .then((result) => {
    state.ready = true;
    render({ focus: true });
    if (result.fromCache) backgroundSync();
  })
  .catch((error) => {
    console.error(error);
    state.fatalError = error;
    renderFatal(error);
  });
