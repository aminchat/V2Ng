let collationLocale = 'fa';

export function setEngineLocale(locale) {
  collationLocale = locale === 'en' ? 'en' : 'fa';
}

export const CRITICAL_SYMPTOMS = new Set([
  'unresponsive', 'not_breathing', 'gasping', 'choking_signs', 'cyanosis',
  'difficulty_breathing', 'bleeding_heavy', 'confusion', 'seizure_activity',
]);

export function nextTriageQuestion(answers = {}) {
  if (!('sceneSafe' in answers)) return 'sceneSafe';
  if (answers.sceneSafe !== 'y') return null;
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
  if (answers.bleeding === 'n' && !('communication' in answers)) return 'communication';
  return null;
}

export function triageRoute(answers = {}) {
  if (answers.sceneSafe === 'n' || answers.sceneSafe === 'u') return 'scene-unsafe';
  if (answers.sceneSafe !== 'y') return null;
  if (answers.conscious === 'n' && answers.breathing === 'n') return 'cardiac-arrest';
  if (answers.conscious === 'n' && answers.breathing === 'y' && answers.bleeding === 'y') return 'severe-bleeding';
  if (answers.conscious === 'n' && answers.breathing === 'y' && answers.bleeding === 'n') return 'unresponsive-breathing';
  if (answers.conscious === 'y' && answers.choking === 'y') return 'choking';
  if (answers.conscious === 'y' && answers.choking === 'n' && answers.breathingDifficulty === 'y') return 'breathing-difficulty';
  if (answers.conscious === 'y' && answers.choking === 'n' && answers.breathingDifficulty === 'n' && answers.bleeding === 'y') return 'severe-bleeding';
  if (answers.conscious === 'y' && answers.choking === 'n' && answers.breathingDifficulty === 'n' && answers.bleeding === 'n' && ['y', 'n', 'u'].includes(answers.communication)) return 'symptoms';
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

const NO_EFFECTIVE_BREATHING = new Set(['not_breathing', 'gasping']);

export function symptomIncompatibility(firstId, secondId, symptoms) {
  if (firstId === secondId || !symptoms[firstId] || !symptoms[secondId]) return null;
  const first = symptoms[firstId];
  const second = symptoms[secondId];
  if ((first.exclusiveWith || []).includes(secondId) || (second.exclusiveWith || []).includes(firstId)) {
    return 'exclusive';
  }
  if ((first.requiresResponsive && secondId === 'unresponsive') || (second.requiresResponsive && firstId === 'unresponsive')) {
    return 'unassessable';
  }
  if ((first.requiresBreathing && NO_EFFECTIVE_BREATHING.has(secondId)) || (second.requiresBreathing && NO_EFFECTIVE_BREATHING.has(firstId))) {
    return 'unassessable';
  }
  return null;
}

function symptomPriority(id, symptoms) {
  return Number.isInteger(symptoms[id]?.selectionPriority) ? symptoms[id].selectionPriority : 10;
}

export function isCurrentSymptomVisible(candidateId, selected, symptoms) {
  if (selected.includes(candidateId)) return true;
  const candidatePriority = symptomPriority(candidateId, symptoms);
  return !selected.some((selectedId) => (
    symptomIncompatibility(candidateId, selectedId, symptoms)
    && symptomPriority(selectedId, symptoms) >= candidatePriority
  ));
}

export function historicalSymptomIds(ids, selected, symptoms) {
  return ids.filter((id) => (
    symptoms[id]?.canBeHistorical
    && !selected.includes(id)
    && selected.some((selectedId) => symptomIncompatibility(id, selectedId, symptoms) === 'unassessable')
  ));
}

function restoreAssessableHistory(selected, historical, symptoms) {
  const current = [...selected];
  const remainingHistory = [];
  const restored = [];
  for (const id of historical) {
    const stillUnassessable = current.some((selectedId) => symptomIncompatibility(id, selectedId, symptoms) === 'unassessable');
    const conflicts = current.some((selectedId) => symptomIncompatibility(id, selectedId, symptoms));
    if (!stillUnassessable && !conflicts) {
      current.push(id);
      restored.push(id);
    } else {
      remainingHistory.push(id);
    }
  }
  return { selected: current, historical: remainingHistory, restored };
}

export function toggleCurrentSymptom(selected, historical, symptomId, symptoms) {
  if (!symptoms[symptomId]) return { selected, historical, removed: [], movedToHistorical: [], restored: [], accepted: false };
  if (selected.includes(symptomId)) {
    const reconciled = restoreAssessableHistory(selected.filter((id) => id !== symptomId), historical, symptoms);
    return { ...reconciled, removed: [], movedToHistorical: [], accepted: true };
  }

  const priority = symptomPriority(symptomId, symptoms);
  const conflicts = selected.filter((id) => symptomIncompatibility(symptomId, id, symptoms));
  if (conflicts.some((id) => symptomPriority(id, symptoms) >= priority)) {
    return { selected, historical, removed: [], movedToHistorical: [], restored: [], accepted: false };
  }

  const removed = [];
  const movedToHistorical = [];
  const nextHistorical = [...historical];
  const nextSelected = selected.filter((id) => {
    const type = symptomIncompatibility(symptomId, id, symptoms);
    if (!type) return true;
    if (type === 'unassessable' && symptoms[id]?.canBeHistorical) {
      if (!nextHistorical.includes(id)) nextHistorical.push(id);
      movedToHistorical.push(id);
    } else {
      removed.push(id);
    }
    return false;
  });
  nextSelected.push(symptomId);
  return {
    selected: nextSelected,
    historical: nextHistorical,
    removed,
    movedToHistorical,
    restored: [],
    accepted: true,
  };
}

export function toggleHistoricalSymptom(historical, symptomId, symptoms) {
  if (!symptoms[symptomId]?.canBeHistorical && !symptoms[symptomId]?.reportedCanBeHistorical) return historical;
  return historical.includes(symptomId)
    ? historical.filter((id) => id !== symptomId)
    : [...historical, symptomId];
}

export function normalizePersianSearch(value = '') {
  return String(value)
    .normalize('NFKC')
    .toLocaleLowerCase()
    .replace(/[\u064B-\u065F\u0670\u06D6-\u06ED]/g, '')
    .replace(/[يى]/g, 'ی')
    .replace(/ك/g, 'ک')
    .replace(/[ةۀ]/g, 'ه')
    .replace(/[أإٱ]/g, 'ا')
    .replace(/ؤ/g, 'و')
    .replace(/[‌‍]/g, ' ')
    .replace(/[^\p{L}\p{N}]+/gu, ' ')
    .trim()
    .replace(/\s+/g, ' ');
}

function displayPriority(id, symptoms) {
  return Number.isInteger(symptoms[id]?.displayPriority) ? symptoms[id].displayPriority : 0;
}

export function sortSymptomIds(ids, symptoms) {
  return [...new Set(ids)].filter((id) => symptoms[id]).sort((firstId, secondId) => (
    displayPriority(secondId, symptoms) - displayPriority(firstId, symptoms)
    || symptoms[firstId].label.localeCompare(symptoms[secondId].label, collationLocale)
  ));
}

export function quickSymptomIds(symptoms) {
  return sortSymptomIds(
    Object.keys(symptoms).filter((id) => symptoms[id]?.quickAccess),
    symptoms,
  );
}

function searchFieldScore(query, field, isLabel) {
  if (!field) return 0;
  const queryTokens = query.split(' ');
  const fieldTokens = field.split(' ');
  const compactQuery = queryTokens.join('');
  const compactField = fieldTokens.join('');
  const base = isLabel ? 20 : 0;

  if (field === query) return 500 + base;
  // This supports joined/half-spaced spelling only when the complete field matches.
  // It must never turn a substring such as «دما» inside «دماغ» into a result.
  if (compactField === compactQuery) return 480 + base;
  if (field.startsWith(`${query} `)) return 430 + base;

  let usedPrefix = false;
  const allTermsMatch = queryTokens.every((queryToken) => fieldTokens.some((fieldToken) => {
    if (fieldToken === queryToken) return true;
    // Prefix matching keeps type-ahead useful while short words remain boundary-safe.
    if (queryToken.length >= 4 && fieldToken.startsWith(queryToken)) {
      usedPrefix = true;
      return true;
    }
    return false;
  }));
  if (!allTermsMatch) return 0;
  return (usedPrefix ? 300 : 360) + base;
}

export function searchSymptoms(query, symptoms, limit = 24) {
  const normalizedQuery = normalizePersianSearch(query);
  if (normalizedQuery.length < 2) return [];

  return Object.entries(symptoms)
    .map(([id, symptom]) => {
      const fields = [
        symptom.label,
        symptom.observedLabel,
        symptom.reportedLabel,
        symptom.sceneLabel,
        symptom.backgroundLabel,
        ...(symptom.aliases || []),
      ]
        .filter(Boolean)
        .map(normalizePersianSearch)
        .filter(Boolean);
      const score = fields.reduce((best, field, index) => (
        Math.max(best, searchFieldScore(normalizedQuery, field, index === 0))
      ), 0);
      if (!score) return null;
      return { id, score: score + displayPriority(id, symptoms) / 100 };
    })
    .filter(Boolean)
    .sort((first, second) => (
      second.score - first.score
      || symptoms[first.id].label.localeCompare(symptoms[second.id].label, collationLocale)
    ))
    .slice(0, limit)
    .map((entry) => entry.id);
}

export function suggestSymptoms(selected, cases, symptoms, limit = 6) {
  const selectedSet = new Set(selected);
  if (!selectedSet.size) return [];
  const scores = new Map();

  for (const item of Object.values(cases)) {
    const matches = Object.entries(item.match || {}).filter(([id]) => selectedSet.has(id));
    if (!matches.length) continue;
    const affinity = matches.reduce((sum, [, weight]) => sum + weight, 0);
    for (const [candidateId, weight] of Object.entries(item.match || {})) {
      if (selectedSet.has(candidateId) || !symptoms[candidateId]) continue;
      scores.set(candidateId, (scores.get(candidateId) || 0) + affinity * weight);
    }
  }

  return [...scores]
    .sort(([firstId, firstScore], [secondId, secondScore]) => (
      secondScore - firstScore
      || displayPriority(secondId, symptoms) - displayPriority(firstId, symptoms)
      || symptoms[firstId].label.localeCompare(symptoms[secondId].label, collationLocale)
    ))
    .slice(0, limit)
    .map(([id]) => id);
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
    .sort((a, b) => b.score - a.score || b.matched.length - a.matched.length || a.case.title.localeCompare(b.case.title, collationLocale))
    .slice(0, limit);
}

export function hasCriticalSymptoms(selected) {
  return selected.some((id) => CRITICAL_SYMPTOMS.has(id));
}

export function triggeredFlags(item, selected) {
  const selectedSet = new Set(selected);
  const triggered = (items) => (items || []).filter((entry) => (entry.when || []).some((symptomId) => selectedSet.has(symptomId)));
  return {
    emergencyCall: Boolean(item.emergencyCall?.always || (item.emergencyCall?.when || []).some((symptomId) => selectedSet.has(symptomId))),
    reasons: triggered(item.redFlags),
  };
}
