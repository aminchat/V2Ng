export const TRIAGE_QUESTIONS = {
  conscious: 'آیا فرد هوشیار است و به صدا یا لمس پاسخ می‌دهد؟',
  breathing: 'آیا تنفس طبیعی دارد؟ نفس‌های بریده و گاه‌به‌گاه، تنفس طبیعی نیست.',
  choking: 'آیا نشانه‌های انسداد شدید راه هوایی دارد؛ مثل ناتوانی در حرف‌زدن، سرفهٔ مؤثر یا نفس‌کشیدن؟',
  breathingDifficulty: 'آیا تنگی نفس شدید، کبودی لب یا ناتوانی در گفتن یک جملهٔ کامل دارد؟',
  bleeding: 'آیا خونریزی شدید یا جهنده دارد، یا لباس/پانسمان به‌سرعت از خون خیس می‌شود؟',
};

export const CRITICAL_SYMPTOMS = new Set([
  'unresponsive', 'not_breathing', 'gasping', 'choking_signs', 'cyanosis',
  'difficulty_breathing', 'bleeding_heavy', 'confusion', 'seizure_activity',
]);

export function nextTriageQuestion(answers = {}) {
  if (!('conscious' in answers)) return 'conscious';
  if (answers.conscious === 'n') {
    if (!('breathing' in answers)) return 'breathing';
    if (answers.breathing === 'y' && !('bleeding' in answers)) return 'bleeding';
    return null;
  }
  if (!('choking' in answers)) return 'choking';
  if (answers.choking === 'y') return null;
  if (!('breathingDifficulty' in answers)) return 'breathingDifficulty';
  if (answers.breathingDifficulty === 'y') return null;
  if (!('bleeding' in answers)) return 'bleeding';
  return null;
}

export function triageRoute(answers = {}) {
  if (answers.conscious === 'n' && answers.breathing === 'n') return 'cardiac-arrest';
  if (answers.conscious === 'n' && answers.breathing === 'y' && answers.bleeding === 'y') return 'severe-bleeding';
  if (answers.conscious === 'n' && answers.breathing === 'y' && answers.bleeding === 'n') return 'unresponsive-breathing';
  if (answers.conscious === 'y' && answers.choking === 'y') return 'choking';
  if (answers.conscious === 'y' && answers.choking === 'n' && answers.breathingDifficulty === 'y') return 'breathing-difficulty';
  if (answers.conscious === 'y' && answers.choking === 'n' && answers.breathingDifficulty === 'n' && answers.bleeding === 'y') return 'severe-bleeding';
  if (answers.conscious === 'y' && answers.choking === 'n' && answers.breathingDifficulty === 'n' && answers.bleeding === 'n') return 'symptoms';
  return null;
}

export function triageSymptoms(answers = {}) {
  const selected = [];
  if (answers.conscious === 'n') selected.push('unresponsive');
  if (answers.breathing === 'n') selected.push('not_breathing');
  if (answers.choking === 'y') selected.push('choking_signs');
  if (answers.breathingDifficulty === 'y') selected.push('difficulty_breathing');
  if (answers.bleeding === 'y') selected.push('bleeding_heavy');
  return selected;
}

export function symptomModels(ids, symptoms) {
  return ids.filter((id) => symptoms[id]).map((id) => ({ id, ...symptoms[id] }));
}

export function rankCases(selected, cases, limit = 5) {
  const selectedSet = new Set(selected);
  return Object.values(cases)
    .map((item) => {
      const matches = Object.entries(item.match || {}).filter(([symptomId]) => selectedSet.has(symptomId));
      const score = matches.reduce((sum, [, weight]) => sum + weight, 0);
      const maxScore = Object.values(item.match || {}).reduce((sum, weight) => sum + weight, 0);
      return {
        case: item,
        score,
        matched: matches.map(([symptomId]) => symptomId),
        confidence: maxScore ? score / maxScore : 0,
      };
    })
    .filter((entry) => entry.score > 0)
    .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length || a.case.title.localeCompare(b.case.title, 'fa'))
    .slice(0, limit);
}

export function hasCriticalSymptoms(selected) {
  return selected.some((id) => CRITICAL_SYMPTOMS.has(id));
}

export function triggeredFlags(item, selected) {
  const selectedSet = new Set(selected);
  const triggered = (items) => (items || []).filter((entry) => (entry.when || []).some((symptomId) => selectedSet.has(symptomId)));
  return {
    call115: Boolean(item.call115?.always || (item.call115?.when || []).some((symptomId) => selectedSet.has(symptomId))),
    reasons: triggered(item.redFlags),
  };
}
