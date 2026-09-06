const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SYMPTOM_RE = /^[a-z][a-z0-9_]*$/;
const HASH_RE = /^[a-f0-9]{64}$/;

function plainObject(value) {
  return value !== null && typeof value === 'object' && !Array.isArray(value);
}

function validDate(value) {
  if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return false;
  const d = new Date(`${value}T00:00:00Z`);
  return !Number.isNaN(d.getTime()) && d.toISOString().slice(0, 10) === value;
}

function nonEmptyStrings(value) {
  return Array.isArray(value) && value.length > 0 && value.every((item) => typeof item === 'string' && item.trim());
}

function checkSymptomList(caseId, field, value, symptoms, errors, { required = false } = {}) {
  if (!Array.isArray(value) || (required && value.length === 0)) {
    errors.push(`${caseId}: ${field} must be ${required ? 'a non-empty' : 'an'} array`);
    return;
  }
  const seen = new Set();
  for (const symptomId of value) {
    if (typeof symptomId !== 'string' || !SYMPTOM_RE.test(symptomId)) {
      errors.push(`${caseId}: ${field} contains an invalid symptom id`);
    } else if (!symptoms[symptomId]) {
      errors.push(`${caseId}: ${field} references unknown symptom "${symptomId}"`);
    }
    if (seen.has(symptomId)) errors.push(`${caseId}: ${field} contains duplicate "${symptomId}"`);
    seen.add(symptomId);
  }
}

export function validateKnowledgeBase(symptoms, categories, cases) {
  const errors = [];

  if (!plainObject(symptoms) || Object.keys(symptoms).length === 0) {
    return ['symptoms must be a non-empty object'];
  }
  for (const [id, symptom] of Object.entries(symptoms)) {
    if (!SYMPTOM_RE.test(id)) errors.push(`symptom "${id}" has an invalid id`);
    if (!plainObject(symptom) || typeof symptom.label !== 'string' || !symptom.label.trim()) {
      errors.push(`symptom "${id}" must contain a non-empty label`);
    }
  }

  if (!plainObject(categories) || Object.keys(categories).length === 0) {
    errors.push('categories must be a non-empty object');
  } else {
    for (const [id, category] of Object.entries(categories)) {
      if (!ID_RE.test(id)) errors.push(`category "${id}" has an invalid id`);
      if (!plainObject(category)) {
        errors.push(`category "${id}" must be an object`);
        continue;
      }
      if (typeof category.title !== 'string' || !category.title.trim()) errors.push(`category "${id}" is missing title`);
      if (typeof category.icon !== 'string' || !category.icon.trim()) errors.push(`category "${id}" is missing icon`);
      checkSymptomList(`category ${id}`, 'diffSymptoms', category.diffSymptoms, symptoms, errors, { required: true });
    }
  }

  if (!plainObject(cases) || Object.keys(cases).length === 0) {
    errors.push('cases must be a non-empty object');
    return errors;
  }

  const caseIds = new Set(Object.keys(cases));
  for (const [id, item] of Object.entries(cases)) {
    if (!ID_RE.test(id)) errors.push(`case "${id}" has an invalid id`);
    if (!plainObject(item)) {
      errors.push(`${id}: case must be an object`);
      continue;
    }
    if (item.id !== id) errors.push(`${id}: embedded id does not match its key`);
    for (const field of ['title', 'icon', 'category', 'summary']) {
      if (typeof item[field] !== 'string' || !item[field].trim()) errors.push(`${id}: missing or invalid "${field}"`);
    }
    if (!Number.isInteger(item.version) || item.version < 1) errors.push(`${id}: version must be an integer >= 1`);
    if (!validDate(item.updatedAt)) errors.push(`${id}: updatedAt must be a real YYYY-MM-DD date`);
    if (!categories[item.category]) errors.push(`${id}: unknown category "${item.category}"`);
    if (!nonEmptyStrings(item.sources)) errors.push(`${id}: sources must be a non-empty array of strings`);
    if (!nonEmptyStrings(item.actions)) errors.push(`${id}: actions must be a non-empty array of strings`);
    if (item.prohibitions !== undefined && (!Array.isArray(item.prohibitions) || item.prohibitions.some((p) => typeof p !== 'string' || !p.trim()))) {
      errors.push(`${id}: prohibitions must be an array of non-empty strings`);
    }

    if (!plainObject(item.match)) {
      errors.push(`${id}: match must be an object`);
    } else {
      for (const [symptomId, weight] of Object.entries(item.match)) {
        if (!symptoms[symptomId]) errors.push(`${id}: match references unknown symptom "${symptomId}"`);
        if (typeof weight !== 'number' || !Number.isFinite(weight) || weight <= 0) {
          errors.push(`${id}: match weight for "${symptomId}" must be a positive number`);
        }
      }
    }

    checkSymptomList(id, 'riskQuestions', item.riskQuestions ?? [], symptoms, errors);
    const riskSet = new Set(item.riskQuestions || []);

    if (!plainObject(item.call115) || typeof item.call115.always !== 'boolean' || typeof item.call115.text !== 'string' || !item.call115.text.trim()) {
      errors.push(`${id}: call115 must contain boolean always and non-empty text`);
    } else {
      checkSymptomList(id, 'call115.when', item.call115.when ?? [], symptoms, errors);
      for (const symptomId of item.call115.when || []) {
        if (!riskSet.has(symptomId)) errors.push(`${id}: call115 symptom "${symptomId}" is not selectable in riskQuestions`);
      }
    }

    if (item.redFlags !== undefined && !Array.isArray(item.redFlags)) {
      errors.push(`${id}: redFlags must be an array`);
    }
    for (const [index, flag] of (item.redFlags || []).entries()) {
      if (!plainObject(flag) || typeof flag.text !== 'string' || !flag.text.trim()) {
        errors.push(`${id}: redFlags[${index}] must contain text`);
        continue;
      }
      checkSymptomList(id, `redFlags[${index}].when`, flag.when ?? [], symptoms, errors, { required: true });
      for (const symptomId of flag.when || []) {
        if (!riskSet.has(symptomId)) errors.push(`${id}: red flag symptom "${symptomId}" is not selectable in riskQuestions`);
      }
    }

    if (item.related !== undefined && !Array.isArray(item.related)) errors.push(`${id}: related must be an array`);
    for (const [index, related] of (item.related || []).entries()) {
      if (!plainObject(related) || !caseIds.has(related.case) || typeof related.text !== 'string' || !related.text.trim()) {
        errors.push(`${id}: related[${index}] is invalid`);
      }
    }
    for (const field of ['tip', 'nationalNote']) {
      if (item[field] !== undefined && (typeof item[field] !== 'string' || !item[field].trim())) {
        errors.push(`${id}: ${field} must be a non-empty string when present`);
      }
    }
  }

  for (const id of ['cardiac-arrest', 'unresponsive-breathing', 'severe-bleeding', 'choking', 'breathing-difficulty']) {
    if (!cases[id]) errors.push(`triage target case missing: ${id}`);
  }

  return errors;
}

export function validateManifest(manifest) {
  const errors = [];
  if (!plainObject(manifest)) return ['manifest must be an object'];
  if (!Number.isInteger(manifest.kbVersion) || manifest.kbVersion < 1) errors.push('manifest: kbVersion must be an integer >= 1');
  if (!validDate(manifest.updatedAt)) errors.push('manifest: updatedAt must be a real YYYY-MM-DD date');

  const checkEntry = (id, entry, expectedUrl) => {
    if (!plainObject(entry)) {
      errors.push(`manifest: missing entry "${id}"`);
      return;
    }
    if (!Number.isInteger(entry.version) || entry.version < 1) errors.push(`manifest: ${id} has invalid version`);
    if (typeof entry.hash !== 'string' || !HASH_RE.test(entry.hash)) errors.push(`manifest: ${id} has invalid SHA-256 hash`);
    if (entry.url !== expectedUrl) errors.push(`manifest: ${id} must use URL "${expectedUrl}"`);
  };

  if (!plainObject(manifest.entries)) errors.push('manifest: entries must be an object');
  checkEntry('__symptoms', manifest.entries?.__symptoms, 'kb/symptoms.json');
  checkEntry('__categories', manifest.entries?.__categories, 'kb/categories.json');

  if (!plainObject(manifest.cases) || Object.keys(manifest.cases).length === 0) {
    errors.push('manifest: cases must be a non-empty object');
  } else {
    for (const [id, entry] of Object.entries(manifest.cases)) {
      if (!ID_RE.test(id)) errors.push(`manifest: invalid case id "${id}"`);
      checkEntry(id, entry, `kb/cases/${id}.json`);
    }
  }
  return errors;
}
