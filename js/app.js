import { KnowledgeBase } from './kb.js';
import {
  TRIAGE_QUESTIONS,
  hasCriticalSymptoms,
  historicalSymptomIds,
  isCurrentSymptomVisible,
  nextTriageQuestion,
  rankCases,
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

const state = {
  ready: false,
  fatalError: null,
  triageAnswers: {},
  triageContext: null,
  caseId: null,
  caseAnswers: [],
  caseStage: 'questions',
  diffCategory: null,
  diffSelected: [],
  diffHistorical: [],
  diffCompatibilityMessage: '',
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
    state.diffCategory = null;
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
      state.diffCategory = null;
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

function renderSymptoms() {
  const categoryIds = Object.keys(kb.categories);
  if (state.diffStage === 'result') return renderDifferentialResults();

  const categorySymptoms = state.diffCategory
    ? kb.categories[state.diffCategory]?.diffSymptoms || []
    : [...new Set(categoryIds.flatMap((id) => kb.categories[id].diffSymptoms || []))];
  const currentSymptoms = categorySymptoms.filter((id) => isCurrentSymptomVisible(id, state.diffSelected, kb.symptoms));
  const historicalSymptoms = historicalSymptomIds(categorySymptoms, state.diffSelected, kb.symptoms);
  const selectionCount = new Set([...state.diffSelected, ...state.diffHistorical]).size;

  const otherCategorySelected = state.diffCategory
    ? state.diffSelected.filter((id) => !categorySymptoms.includes(id))
    : [];

  app.innerHTML = `
    <header class="topbar">
      <button class="icon-btn" id="back-home" type="button" aria-label="بازگشت به خانه">‹</button>
      <div><div class="eyebrow">راهنمای نشانه‌محور</div><h1 id="view-heading" tabindex="-1">چه نشانه‌ای می‌بینید؟</h1></div>
      <a class="mini-call" href="tel:115" aria-label="تماس با اورژانس ۱۱۵">۱۱۵</a>
    </header>
    <main class="body">
      ${compatibilityNotice()}
      <aside class="disclaimer compact"><strong>تشخیص نیست:</strong> اگر بیهوشی، تنفس غیرطبیعی، انسداد شدید راه هوایی یا خونریزی شدید وجود دارد، به «بررسی فوری» برگردید و با ۱۱۵ تماس بگیرید.</aside>
      ${state.diffCompatibilityMessage ? `<p class="compatibility-notice" role="status">${e(state.diffCompatibilityMessage)}</p>` : ''}
      <fieldset class="category-fieldset">
        <legend>دستهٔ نشانه‌ها</legend>
        <div class="category-scroll">
          <button class="cat-btn${state.diffCategory === null ? ' active' : ''}" data-cat="" type="button" aria-pressed="${state.diffCategory === null}">همه</button>
          ${categoryIds.map((id) => `<button class="cat-btn${state.diffCategory === id ? ' active' : ''}" data-cat="${e(id)}" type="button" aria-pressed="${state.diffCategory === id}">${e(kb.categories[id].icon)} ${e(kb.categories[id].title)}</button>`).join('')}
        </div>
      </fieldset>
      <section aria-labelledby="symptom-heading">
        <h2 id="symptom-heading">نشانه‌های فعلی را انتخاب کنید</h2>
        <p class="section-help">گزینه‌هایی که با وضعیت‌های انتخاب‌شده سازگار نیستند، خودکار مخفی می‌شوند.</p>
        <div class="chips" id="current-symptoms">${symptomChips(currentSymptoms, state.diffSelected)}</div>
        ${currentSymptoms.length ? '' : '<p class="empty-inline">در این دسته گزینهٔ سازگار دیگری باقی نمانده است.</p>'}
      </section>
      ${otherCategorySelected.length ? `<section class="historical-symptoms" aria-labelledby="other-selected-heading">
        <h2 id="other-selected-heading">از دسته‌های دیگر انتخاب شده</h2>
        <p>این نشانه‌ها در دسته‌های دیگر انتخاب شدن و در نتایج لحاظ می‌شن</p>
        <div class="chips" id="other-selected-symptoms">${symptomChips(otherCategorySelected, state.diffSelected)}</div>
      </section>` : ''}
      ${historicalSymptoms.length ? `<section class="historical-symptoms" aria-labelledby="historical-heading">
        <h2 id="historical-heading">پیش از بیهوشی یا توقف تنفس</h2>
        <p>فقط نشانه‌ای را انتخاب کنید که فرد پیش‌تر گفته یا شاهد آن را دیده است؛ این موارد نشانهٔ فعلی محسوب نمی‌شوند.</p>
        <div class="chips">${symptomChips(historicalSymptoms, state.diffHistorical, 'data-history-sym')}</div>
      </section>` : ''}
      <button class="btn primary full card-spaced" id="show-results" type="button" ${selectionCount ? '' : 'disabled'}>بررسی مسیرهای مرتبط (${selectionCount})</button>
    </main>`;

  document.getElementById('back-home').addEventListener('click', () => navigate('#/'));
  document.querySelectorAll('[data-cat]').forEach((button) => button.addEventListener('click', () => {
    state.diffCategory = button.dataset.cat || null;
    state.diffCompatibilityMessage = '';
    render({ focus: false });
  }));
  document.querySelectorAll('#current-symptoms [data-sym], #other-selected-symptoms [data-sym]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.sym;
    const result = toggleCurrentSymptom(state.diffSelected, state.diffHistorical, id, kb.symptoms);
    state.diffSelected = result.selected;
    state.diffHistorical = result.historical;
    state.diffCompatibilityMessage = compatibilityMessage(id, result);
    render({ focus: false });
  }));
  document.querySelectorAll('[data-history-sym]').forEach((button) => button.addEventListener('click', () => {
    const id = button.dataset.historySym;
    state.diffHistorical = toggleHistoricalSymptom(state.diffHistorical, id, kb.symptoms);
    state.diffCompatibilityMessage = '';
    render({ focus: false });
  }));
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

async function registerServiceWorker() {
  if (!('serviceWorker' in navigator)) return;
  try {
    const registration = await navigator.serviceWorker.register('./sw.js', { scope: './' });
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      worker?.addEventListener('statechange', () => {
        if (worker.state === 'installed' && navigator.serviceWorker.controller) {
          showSyncAnnouncement('نسخهٔ تازهٔ برنامه آماده است و با بازکردن دوبارهٔ برنامه فعال می‌شود.');
        }
      });
    });
  } catch (error) {
    console.warn('Service worker registration failed', error);
  }
}

async function backgroundSync() {
  if (!navigator.onLine) return;
  try {
    const result = await kb.sync();
    if (result.changed.length) {
      showSyncAnnouncement('پایگاه دانش معتبر با موفقیت به‌روزرسانی شد.');
      const route = currentRoute();
      if (route.name === 'home' || route.name === 'kb') render({ focus: false });
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
