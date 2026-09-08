const ID_RE = /^[a-z0-9]+(?:-[a-z0-9]+)*$/;
const SYMPTOM_RE = /^[a-z][a-z0-9_]*$/;
const HASH_RE = /^[a-f0-9]{64}$/;
const COUNTRY_RE = /^[A-Z]{2}$/;
const LOCALE_RE = /^[a-z]{2}(?:-[A-Z]{2})?$/;
const EVIDENCE_TYPES = new Set(['observed', 'reported', 'scene', 'background']);

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

function localizedText(value) {
  return (typeof value === 'string' && value.trim())
    || (plainObject(value) && typeof value.fa === 'string' && value.fa.trim() && typeof value.en === 'string' && value.en.trim());
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
      continue;
    }
    if (symptom.exclusiveWith !== undefined) {
      if (!Array.isArray(symptom.exclusiveWith)) {
        errors.push(`symptom "${id}": exclusiveWith must be an array`);
      } else {
        const seen = new Set();
        for (const excludedId of symptom.exclusiveWith) {
          if (typeof excludedId !== 'string' || !symptoms[excludedId]) errors.push(`symptom "${id}": exclusiveWith references unknown symptom "${excludedId}"`);
          if (excludedId === id) errors.push(`symptom "${id}" cannot exclude itself`);
          if (seen.has(excludedId)) errors.push(`symptom "${id}": duplicate exclusiveWith entry "${excludedId}"`);
          seen.add(excludedId);
        }
      }
    }
    if (symptom.aliases !== undefined) {
      if (!nonEmptyStrings(symptom.aliases) || symptom.aliases.length > 16 || symptom.aliases.some((alias) => alias.length > 80)) {
        errors.push(`symptom "${id}": aliases must contain 1 to 16 non-empty strings of at most 80 characters`);
      } else if (new Set(symptom.aliases.map((alias) => alias.trim())).size !== symptom.aliases.length) {
        errors.push(`symptom "${id}": aliases must not contain duplicates`);
      }
    }
    if (!nonEmptyStrings(symptom.evidenceTypes)
      || symptom.evidenceTypes.some((type) => !EVIDENCE_TYPES.has(type))
      || new Set(symptom.evidenceTypes).size !== symptom.evidenceTypes.length) {
      errors.push(`symptom "${id}": evidenceTypes must contain unique observed, reported, scene, or background values`);
    }
    for (const field of ['observedLabel', 'reportedLabel', 'sceneLabel', 'backgroundLabel']) {
      if (symptom[field] !== undefined && (typeof symptom[field] !== 'string' || !symptom[field].trim())) {
        errors.push(`symptom "${id}": ${field} must be a non-empty string`);
      }
    }
    for (const type of EVIDENCE_TYPES) {
      const field = `${type}Label`;
      if (symptom[field] && !symptom.evidenceTypes?.includes(type)) {
        errors.push(`symptom "${id}": ${field} requires ${type} evidence`);
      }
    }
    for (const field of ['requiresResponsive', 'requiresBreathing', 'canBeHistorical', 'reportedCanBeHistorical', 'quickAccess']) {
      if (symptom[field] !== undefined && typeof symptom[field] !== 'boolean') {
        errors.push(`symptom "${id}": ${field} must be boolean`);
      }
    }
    if (symptom.canBeHistorical && !symptom.requiresResponsive && !symptom.requiresBreathing) {
      errors.push(`symptom "${id}": canBeHistorical requires an assessability constraint`);
    }
    if (symptom.reportedCanBeHistorical && !symptom.evidenceTypes?.includes('reported')) {
      errors.push(`symptom "${id}": reportedCanBeHistorical requires reported evidence`);
    }
    for (const field of ['selectionPriority', 'displayPriority']) {
      if (symptom[field] !== undefined && (!Number.isInteger(symptom[field]) || symptom[field] < 0 || symptom[field] > 100)) {
        errors.push(`symptom "${id}": ${field} must be an integer from 0 to 100`);
      }
    }
  }
  if (Object.values(symptoms).filter((symptom) => symptom.quickAccess).length > 10) {
    errors.push('symptoms: quickAccess must be limited to at most 10 items');
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

    if (!plainObject(item.emergencyCall) || typeof item.emergencyCall.always !== 'boolean' || typeof item.emergencyCall.text !== 'string' || !item.emergencyCall.text.trim()) {
      errors.push(`${id}: emergencyCall must contain boolean always and non-empty text`);
    } else {
      checkSymptomList(id, 'emergencyCall.when', item.emergencyCall.when ?? [], symptoms, errors);
      for (const symptomId of item.emergencyCall.when || []) {
        if (!riskSet.has(symptomId)) errors.push(`${id}: emergencyCall symptom "${symptomId}" is not selectable in riskQuestions`);
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
    if (item.regionalNotes !== undefined) {
      if (!plainObject(item.regionalNotes) || Object.keys(item.regionalNotes).length === 0) {
        errors.push(`${id}: regionalNotes must be a non-empty country-code object when present`);
      } else {
        for (const [countryCode, note] of Object.entries(item.regionalNotes)) {
          if (!COUNTRY_RE.test(countryCode) || typeof note !== 'string' || !note.trim()) {
            errors.push(`${id}: regionalNotes entry "${countryCode}" is invalid`);
          }
        }
      }
    }
  }

  for (const id of ['cardiac-arrest', 'unresponsive-breathing', 'severe-bleeding', 'choking', 'breathing-difficulty']) {
    if (!cases[id]) errors.push(`triage target case missing: ${id}`);
  }

  return errors;
}

export function validateManifest(manifest, root = 'kb') {
  const errors = [];
  if (!/^[a-z0-9-]+$/.test(root)) return ['manifest: invalid knowledge-base root'];
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
  checkEntry('__symptoms', manifest.entries?.__symptoms, `${root}/symptoms.json`);
  checkEntry('__categories', manifest.entries?.__categories, `${root}/categories.json`);

  if (!plainObject(manifest.cases) || Object.keys(manifest.cases).length === 0) {
    errors.push('manifest: cases must be a non-empty object');
  } else {
    for (const [id, entry] of Object.entries(manifest.cases)) {
      if (!ID_RE.test(id)) errors.push(`manifest: invalid case id "${id}"`);
      checkEntry(id, entry, `${root}/cases/${id}.json`);
    }
  }
  return errors;
}

export function validateCountryData(data) {
  const errors = [];
  if (!plainObject(data)) return ['countries: root must be an object'];
  if (!Number.isInteger(data.version) || data.version < 1) errors.push('countries: version must be an integer >= 1');
  if (!validDate(data.updatedAt)) errors.push('countries: updatedAt must be a real YYYY-MM-DD date');
  if (!Array.isArray(data.countries) || data.countries.length < 200) {
    errors.push('countries: countries must include the complete ISO selector list');
  } else {
    const seen = new Set();
    for (const [index, country] of data.countries.entries()) {
      if (!plainObject(country) || !COUNTRY_RE.test(country.code) || typeof country.name !== 'string' || !country.name.trim()) {
        errors.push(`countries: countries[${index}] is invalid`);
        continue;
      }
      if (seen.has(country.code)) errors.push(`countries: duplicate country "${country.code}"`);
      seen.add(country.code);
    }
  }
  if (!plainObject(data.profiles)) {
    errors.push('countries: profiles must be an object');
    return errors;
  }
  for (const [code, profile] of Object.entries(data.profiles)) {
    if (!COUNTRY_RE.test(code) || !plainObject(profile)) {
      errors.push(`countries: invalid profile "${code}"`);
      continue;
    }
    if (!profile.ems && !profile.general) errors.push(`countries: ${code} requires ems or general contact`);
    for (const field of ['ems', 'general', 'poison']) {
      const contact = profile[field];
      if (contact === undefined) continue;
      if (!plainObject(contact) || typeof contact.number !== 'string' || !/^[+0-9][0-9 +()-]*$/.test(contact.number)) {
        errors.push(`countries: ${code}.${field} has an invalid number`);
      }
      if (contact?.note !== undefined && !localizedText(contact.note)) {
        errors.push(`countries: ${code}.${field}.note must be localized text`);
      }
    }
    if (profile.general && profile.general.usableForAmbulance !== true) {
      errors.push(`countries: ${code}.general must explicitly be usable for ambulance dispatch`);
    }
    if (!localizedText(profile.dialingNote)) errors.push(`countries: ${code} requires localized dialingNote`);
    if (!validDate(profile.reviewedAt)) errors.push(`countries: ${code} requires a valid reviewedAt date`);
    if (!Array.isArray(profile.sources) || profile.sources.length === 0) {
      errors.push(`countries: ${code} requires at least one source`);
    } else {
      for (const source of profile.sources) {
        if (!plainObject(source) || typeof source.title !== 'string' || !source.title.trim() || typeof source.url !== 'string') {
          errors.push(`countries: ${code} contains an invalid source`);
          continue;
        }
        try {
          const url = new URL(source.url);
          if (url.protocol !== 'https:') errors.push(`countries: ${code} source URLs must use HTTPS`);
        } catch {
          errors.push(`countries: ${code} contains an invalid source URL`);
        }
      }
    }
  }
  return errors;
}

export function validateLocaleDictionary(locale) {
  const errors = [];
  if (!plainObject(locale)) return ['locale: root must be an object'];
  if (!LOCALE_RE.test(locale.code || '')) errors.push('locale: invalid code');
  if (!['ltr', 'rtl'].includes(locale.dir)) errors.push('locale: dir must be ltr or rtl');
  if (!Number.isInteger(locale.version) || locale.version < 1) errors.push('locale: version must be an integer >= 1');
  if (!plainObject(locale.messages) || Object.keys(locale.messages).length === 0) {
    errors.push('locale: messages must be a non-empty object');
  } else {
    for (const [key, value] of Object.entries(locale.messages)) {
      if (!/^[a-z][a-zA-Z0-9.]*$/.test(key) || typeof value !== 'string' || !value.trim()) {
        errors.push(`locale: invalid message "${key}"`);
      }
    }
  }
  return errors;
}
