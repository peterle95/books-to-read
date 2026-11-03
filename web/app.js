const form = document.querySelector('#plan-form');
const plan = document.querySelector('#plan');
const status = document.querySelector('#status');
const storageKey = 'reading-plan-draft-v1';
const bundleKey = 'reading-plan-bundle-v1';
const bundleNames = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
const bundleMessage = document.querySelector('#bundle-status');
const exports = document.querySelector('#bundle-exports');

function showExports() {
  exports.hidden = !localStorage.getItem(bundleKey);
}

try {
  plan.value = localStorage.getItem(storageKey) || '';
  showExports();
} catch {
  status.textContent = 'Unable to read storage on this device.';
}

form.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    localStorage.setItem(storageKey, plan.value);
    status.textContent = 'Plan saved on this device.';
  } catch {
    status.textContent = 'Unable to save. Your plan has not been stored.';
  }
});

plan.addEventListener('input', () => {
  status.textContent = '';
});

document.querySelector('#bundle-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  bundleMessage.textContent = '';
  let imported = false;
  try {
    const files = Array.from(document.querySelector('#bundle-files').files);
    const names = bundleNames;
    if (files.length !== names.length || names.some((name) => files.filter((file) => file.name === name).length !== 1)) throw new Error('Select exactly the four required files.');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const buffers = Object.fromEntries(await Promise.all(files.map(async (file) => [file.name, await file.arrayBuffer()])));
    const nonIntegers = new WeakMap();
    const parsed = {};
    const parse = (name) => {
      if (parsed[name]) return parsed[name];
      const text = decoder.decode(buffers[name]);
      let hasSource = false;
      JSON.parse('1', (key, value, context) => { hasSource = !!context?.source; return value; });
      let input = text, marker;
      if (!hasSource) {
        // Validate first and choose a key absent from the entire decoded document.
        const keys = new Set();
        JSON.parse(text, (key, value) => { keys.add(key); return value; });
        marker = '__decimal_token__';
        while (keys.has(marker)) marker += '_';
        input = text.replace(/"(?:\\.|[^"\\])*"|-?(?:0|[1-9]\d*)(?:\.\d+)?(?:[eE][+-]?\d+)?/g, (token) =>
          token[0] !== '"' && /[.eE]/.test(token) ? `{${JSON.stringify(marker)}:${JSON.stringify(token)}}` : token);
      }
      const value = JSON.parse(input, function (key, item, context) {
        const wrapped = marker && item && typeof item === 'object' && Object.prototype.hasOwnProperty.call(item, marker);
        if (wrapped || (typeof item === 'number' && context?.source && /[.eE]/.test(context.source))) {
          if (!nonIntegers.has(this)) nonIntegers.set(this, new Set());
          nonIntegers.get(this).add(key);
        }
        return wrapped ? Number(item[marker]) : item;
      });
      if (!value || Array.isArray(value) || typeof value !== 'object' || value.schema_version !== 2 || nonIntegers.get(value)?.has('schema_version')) throw new Error(`${name} must use schema 2.`);
      parsed[name] = value;
      return value;
    };
    const manifest = parse('manifest.json');
    const dataNames = names.slice(0, 3);
    if (!Number.isSafeInteger(manifest.revision) || nonIntegers.get(manifest)?.has('revision') || manifest.revision < 0 || typeof manifest.last_modified !== 'string' || !manifest.last_modified || typeof manifest.modified_by !== 'string' || !manifest.modified_by || !manifest.files || typeof manifest.files !== 'object' || Array.isArray(manifest.files) || Object.keys(manifest.files).length !== 3) throw new Error('Invalid manifest.');
    for (const name of dataNames) {
      parse(name);
      const expected = manifest.files[name];
      if (typeof expected !== 'string' || !/^[a-f\d]{64}$/i.test(expected)) throw new Error(`Invalid checksum for ${name}.`);
      const hash = await crypto.subtle.digest('SHA-256', buffers[name]);
      const actual = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== expected.toLowerCase()) throw new Error(`Checksum mismatch for ${name}.`);
    }
    window.validateBundleContents(Object.fromEntries(names.map((name) => [name, parse(name)])), nonIntegers);
    if (!window.confirm('Replace the stored reading-plan bundle with these files? The text draft will not change.')) {
      bundleMessage.textContent = 'Import cancelled. Stored bundle unchanged.';
      return;
    }
    const encoded = Object.fromEntries(names.map((name) => {
      const bytes = new Uint8Array(buffers[name]);
      let binary = '';
      for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
      return [name, btoa(binary)];
    }));
    localStorage.setItem(bundleKey, JSON.stringify(encoded));
    localStorage.removeItem(scheduleKey);
    scheduleState = null;
    showExports();
    bundleMessage.textContent = 'Bundle imported on this device.';
    imported = true;
  } catch (error) {
    bundleMessage.textContent = `Bundle could not be imported: ${error.message}`;
  }
  if (imported) {
    renderSchedule();
    if (!(await checkRollover())) renderQuarter();
  }
});

exports.addEventListener('click', () => {
  try {
    const encoded = JSON.parse(localStorage.getItem(bundleKey));
    const url = URL.createObjectURL(window.createBundleZip(encoded));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reading-plan-bundle.zip';
    link.click();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    bundleMessage.textContent = `Bundle could not be exported: ${error.message}`;
  }
});

const scheduleKey = 'reading-plan-schedule-v1';
const scheduleForm = document.querySelector('#schedule-form');
const startInput = document.querySelector('#plan-start');
const finishInput = document.querySelector('#plan-finish');
const restForm = document.querySelector('#rest-form');
const restStart = document.querySelector('#rest-start');
const restEnd = document.querySelector('#rest-end');
const restList = document.querySelector('#rest-list');
const calculateButton = document.querySelector('#calculate-schedule');
const scheduleStatus = document.querySelector('#schedule-status');
const scheduleTable = document.querySelector('#schedule-table');
const scheduleRows = document.querySelector('#schedule-rows');
const scheduleEmpty = document.querySelector('#schedule-empty');
const groupForm = document.querySelector('#group-form');
const groupSection = document.querySelector('#group-section');
const groupBooks = document.querySelector('#group-books');
const groupList = document.querySelector('#group-list');
let scheduleState = null;

const readBundleData = () => {
  try {
    const encoded = JSON.parse(localStorage.getItem(bundleKey));
    if (!encoded) return null;
    const file = (name) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded[name]), (character) => character.charCodeAt(0))));
    const planData = file('plan.json'), booksFile = file('books.json');
    return { plan: planData, books: booksFile, sections: window.ReadingSchedule.sectionsFromBooksFile(booksFile) };
  } catch {
    return null;
  }
};

const formatUnits = (value) => String(Math.round(value * 100) / 100);

const loadSchedule = (bundle) => {
  const defaults = window.ReadingSchedule.stateFromBundle(bundle.plan, bundle.books);
  try {
    const saved = JSON.parse(localStorage.getItem(scheduleKey) || 'null');
    if (saved && saved.version === 1 && saved.startDate && saved.endDate) {
      return { ...saved, groups: saved.groups ?? defaults.groups, overrides: saved.overrides ?? defaults.overrides };
    }
  } catch {
    // Fall back to the imported bundle's own dates and baselines.
  }
  return defaults;
};

const saveSchedule = () => {
  try {
    localStorage.setItem(scheduleKey, JSON.stringify(scheduleState));
  } catch {
    scheduleStatus.textContent = 'Unable to save the schedule on this device.';
  }
};

const sectionsForState = (bundle, state) => window.ReadingSchedule.withLocalSettings(bundle.sections, state.groups, state.overrides);

const setOverride = (bookId, value) => {
  try {
    const bundle = readBundleData();
    if (!bundle) throw new Error('Import a bundle before scheduling its books.');
    const sections = sectionsForState(bundle, scheduleState);
    let section = null, book = null;
    for (const candidate of sections) {
      const found = candidate.books.find((item) => item.id === bookId);
      if (found) {
        section = candidate;
        book = found;
        break;
      }
    }
    if (!book) throw new Error('That book is not part of the imported bundle.');
    const baselines = { ...scheduleState.baselines };
    window.ReadingSchedule.applyDeadlineOverride(section, baselines, book, value || null, scheduleState.endDate, window.ReadingSchedule.today(), scheduleState.restDays);
    scheduleState.baselines = baselines;
    scheduleState.overrides = { ...scheduleState.overrides, [bookId]: value || null };
    saveSchedule();
    renderSchedule(value ? `Deadline override saved for ${book.title}.` : `Deadline override cleared for ${book.title}.`);
  } catch (error) {
    scheduleStatus.textContent = error.message;
  }
};

const removeGroup = (label, index) => {
  const bundle = readBundleData();
  if (!bundle) return;
  const section = sectionsForState(bundle, scheduleState).find((item) => item.label === label);
  if (!section) return;
  scheduleState.groups = { ...scheduleState.groups, [label]: section.groups.filter((_, position) => position !== index) };
  scheduleChanged();
};

const renderGroups = (sections) => {
  const previous = groupSection.value;
  const options = sections.filter((section) => section.books.length);
  groupSection.replaceChildren(...options.map((section) => {
    const option = document.createElement('option');
    option.value = section.label;
    option.textContent = section.label;
    return option;
  }));
  const section = options.find((item) => item.label === previous) || options[0];
  groupSection.value = section ? section.label : '';
  groupBooks.replaceChildren(...(section ? section.books.map((book) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'checkbox';
    input.value = String(book.number);
    input.checked = section.groups.some((group) => group.includes(book.number));
    label.append(input, ` ${book.title}`);
    return label;
  }) : []));
  const items = [];
  for (const item of sections) {
    item.groups.forEach((group, index) => {
      const listItem = document.createElement('li');
      const titles = group.map((number) => item.books.find((book) => book.number === number)?.title ?? `Book ${number}`);
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove simultaneous group ${item.label} ${titles.join(', ')}`);
      remove.addEventListener('click', () => removeGroup(item.label, index));
      listItem.append(`${item.label}: ${titles.join(', ')} `, remove);
      items.push(listItem);
    });
  }
  groupList.replaceChildren(...items);
};

const overrideCell = (book) => {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'date';
  input.value = scheduleState.overrides[book.id] || '';
  input.setAttribute('aria-label', `Deadline override for ${book.title}`);
  const set = document.createElement('button');
  set.type = 'button';
  set.textContent = 'Set deadline';
  set.setAttribute('aria-label', `Save the deadline for ${book.title}`);
  set.addEventListener('click', () => setOverride(book.id, input.value));
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  clear.setAttribute('aria-label', `Clear the deadline for ${book.title}`);
  clear.addEventListener('click', () => setOverride(book.id, ''));
  cell.append(input, set, clear);
  return cell;
};

const renderSchedule = (message = '') => {
  const bundle = readBundleData();
  scheduleEmpty.hidden = !!bundle;
  scheduleForm.hidden = !bundle;
  restForm.hidden = !bundle;
  groupForm.hidden = !bundle;
  calculateButton.hidden = !bundle;
  if (!bundle) {
    scheduleTable.hidden = true;
    restList.replaceChildren();
    groupList.replaceChildren();
    return;
  }
  if (!scheduleState) scheduleState = loadSchedule(bundle);
  startInput.value = scheduleState.startDate;
  finishInput.value = scheduleState.endDate;
  restList.replaceChildren(...scheduleState.restDays.map((range, index) => {
    const item = document.createElement('li');
    const label = range.start === range.end ? range.start : `${range.start} to ${range.end}`;
    const remove = document.createElement('button');
    item.append(`${label} `);
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove rest days ${label}`);
    remove.addEventListener('click', () => {
      scheduleState.restDays = scheduleState.restDays.filter((_, position) => position !== index);
      scheduleChanged();
    });
    item.append(remove);
    return item;
  }));
  const sections = sectionsForState(bundle, scheduleState);
  const pace = window.ReadingSchedule.requiredPace(sections, scheduleState.baselines, window.ReadingSchedule.today(), scheduleState.restDays);
  const rows = [];
  for (const section of sections) {
    if (!section.books.length) continue;
    const header = document.createElement('tr'), headerCell = document.createElement('th');
    headerCell.scope = 'rowgroup';
    headerCell.colSpan = 7;
    headerCell.textContent = `${section.label} · ${section.audio ? 'seconds' : 'pages'}`;
    header.append(headerCell);
    rows.push(header);
    for (const book of section.books) {
      const baseline = scheduleState.baselines[book.id];
      const values = baseline
        ? [book.title, book.remaining, baseline.startDate, baseline.deadline, formatUnits(baseline.dailyTarget), formatUnits(pace[book.id] ?? 0)]
        : [book.title, book.remaining, 'Not scheduled', 'Not scheduled', 'Not scheduled', 'Not scheduled'];
      const row = document.createElement('tr');
      for (const value of values) {
        const cell = document.createElement('td');
        cell.textContent = String(value);
        row.append(cell);
      }
      row.append(overrideCell(book));
      rows.push(row);
    }
  }
  scheduleRows.replaceChildren(...rows);
  scheduleTable.hidden = !rows.length;
  renderGroups(sections);
  if (!Object.keys(scheduleState.baselines).length) {
    scheduleStatus.textContent = 'No baseline schedule is saved yet. Calculate the schedule.';
  } else if (scheduleState.needsRecalculation) {
    scheduleStatus.textContent = 'Plan changes are saved. The saved baseline stays unchanged until you calculate the schedule again.';
  } else {
    scheduleStatus.textContent = message || 'Baseline schedule saved. Required pace reflects today.';
  }
};

const scheduleChanged = () => {
  if (Object.keys(scheduleState.baselines).length) scheduleState.needsRecalculation = true;
  saveSchedule();
  renderSchedule();
};

scheduleForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    if (!startInput.value || !finishInput.value) throw new Error('Set both plan dates.');
    if (!window.ReadingSchedule.availableReadingDays(startInput.value, finishInput.value, []).length) throw new Error('The plan finish date is before its start date.');
    scheduleState.startDate = startInput.value;
    scheduleState.endDate = finishInput.value;
    scheduleChanged();
  } catch (error) {
    scheduleStatus.textContent = error.message;
  }
});

restForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    if (!restStart.value || !restEnd.value) throw new Error('Set both rest-day dates.');
    const ranges = window.ReadingSchedule.normalizeRestDays([...scheduleState.restDays, { start: restStart.value, end: restEnd.value }]);
    scheduleState.restDays = ranges.map((range) => ({ start: window.ReadingSchedule.iso(range.start), end: window.ReadingSchedule.iso(range.end) }));
    scheduleChanged();
  } catch (error) {
    scheduleStatus.textContent = error.message;
  }
});

groupSection.addEventListener('change', () => {
  const bundle = readBundleData();
  if (bundle) renderGroups(sectionsForState(bundle, scheduleState));
});

groupForm.addEventListener('submit', (event) => {
  event.preventDefault();
  try {
    const bundle = readBundleData();
    if (!bundle) throw new Error('Import a bundle before grouping its books.');
    const sections = sectionsForState(bundle, scheduleState);
    const section = sections.find((item) => item.label === groupSection.value);
    if (!section) throw new Error('Choose a book section.');
    const chosen = Array.from(groupBooks.querySelectorAll('input:checked')).map((input) => Number(input.value));
    scheduleState.groups = { ...scheduleState.groups, [section.label]: window.ReadingSchedule.validateGroups(section.books, [...section.groups, chosen]) };
    scheduleChanged();
  } catch (error) {
    scheduleStatus.textContent = error.message;
  }
});

calculateButton.addEventListener('click', () => {
  try {
    const bundle = readBundleData();
    if (!bundle) throw new Error('Import a bundle before calculating the schedule.');
    const sections = sectionsForState(bundle, scheduleState);
    scheduleState.baselines = window.ReadingSchedule.calculateBaselines(sections, scheduleState.startDate, scheduleState.endDate, scheduleState.restDays);
    window.ReadingSchedule.applyPersistedOverrides(sections, scheduleState.baselines, scheduleState.endDate, window.ReadingSchedule.today(), scheduleState.restDays);
    scheduleState.needsRecalculation = false;
    saveSchedule();
    renderSchedule('Baseline schedule calculated on this device.');
  } catch (error) {
    scheduleStatus.textContent = error.message;
  }
});

const quarterEmpty = document.querySelector('#quarter-empty');
const quarterForm = document.querySelector('#quarter-form');
const quarterStartInput = document.querySelector('#quarter-start');
const quarterBookForm = document.querySelector('#quarter-book-form');
const quarterSection = document.querySelector('#quarter-section');
const quarterTitle = document.querySelector('#quarter-title');
const quarterFrom = document.querySelector('#quarter-from');
const quarterTo = document.querySelector('#quarter-to');
const quarterList = document.querySelector('#quarter-list');
const quarterStatus = document.querySelector('#quarter-status');

const decodeFile = (encoded, name) => new TextDecoder().decode(Uint8Array.from(atob(encoded[name]), (character) => character.charCodeAt(0)));
const encodeFile = (bytes) => {
  let binary = '';
  for (let i = 0; i < bytes.length; i += 8192) binary += String.fromCharCode(...bytes.subarray(i, i + 8192));
  return btoa(binary);
};

const readBundleFiles = () => {
  try {
    const encoded = JSON.parse(localStorage.getItem(bundleKey));
    if (!encoded) return null;
    return {
      encoded,
      plan: JSON.parse(decodeFile(encoded, 'plan.json')),
      books: JSON.parse(decodeFile(encoded, 'books.json')),
      sessions: JSON.parse(decodeFile(encoded, 'sessions.json')),
      manifest: JSON.parse(decodeFile(encoded, 'manifest.json')),
    };
  } catch {
    return null;
  }
};

const digest = async (bytes) => Array.from(
  new Uint8Array(await crypto.subtle.digest('SHA-256', bytes)),
  (byte) => byte.toString(16).padStart(2, '0'),
).join('');

// Rewrite the changed files, keep the rest byte for byte, and re-checksum the bundle.
const writeBundleFiles = async (updates) => {
  const current = readBundleFiles();
  if (!current) throw new Error('Import a bundle before changing its plan.');
  const encoder = new TextEncoder();
  const data = {};
  for (const name of bundleNames.slice(0, 3)) {
    data[name] = updates[name]
      ? encoder.encode(JSON.stringify(updates[name]))
      : Uint8Array.from(atob(current.encoded[name]), (character) => character.charCodeAt(0));
  }
  const manifest = {
    ...current.manifest,
    revision: Number(current.manifest.revision) + 1,
    last_modified: new Date().toISOString(),
    modified_by: 'web app',
    files: {},
  };
  for (const name of bundleNames.slice(0, 3)) manifest.files[name] = await digest(data[name]);
  data['manifest.json'] = encoder.encode(JSON.stringify(manifest));
  localStorage.setItem(bundleKey, JSON.stringify(Object.fromEntries(bundleNames.map((name) => [name, encodeFile(data[name])]))));
  showExports();
};

const plannedDraft = () => {
  const current = readBundleFiles();
  if (!current) return null;
  const planned = window.ReadingQuarter.plannedFromBundle(current.books);
  if (planned) return planned;
  let after = window.ReadingSchedule.today();
  try {
    const planStart = window.ReadingSchedule.iso(window.ReadingSchedule.parseDate(current.plan.start_date));
    if (planStart > after) after = planStart;
  } catch {
    // Fall back to the current date when the plan start is unreadable.
  }
  return {
    startDate: window.ReadingQuarter.nextQuarterStart(after),
    sections: window.ReadingQuarter.blankSections(),
  };
};

// Unfinished books carry forward, then the new quarter's schedule replaces the old baseline.
const rollover = async () => {
  const bundle = readBundleFiles();
  if (!bundle) return null;
  const result = window.ReadingQuarter.activate(bundle.books, window.ReadingSchedule.today());
  if (!result) return null;
  const restDays = (scheduleState ? scheduleState.restDays : window.ReadingSchedule.stateFromBundle(bundle.plan, bundle.books).restDays)
    .filter((range) => range.end >= result.start);
  const sections = window.ReadingSchedule.sectionsFromBooksFile({ sections: result.sections });
  const baselines = window.ReadingSchedule.calculateBaselines(sections, result.start, result.end, restDays, true);
  const books = {
    ...bundle.books,
    sections: result.sections.map((section) => ({
      ...section,
      baseline_needs_recalculation: false,
      books: section.books.map((book) => ({
        ...book,
        baseline_schedule: baselines[book.id]
          ? { start_date: baselines[book.id].startDate, deadline: baselines[book.id].deadline, daily_target: baselines[book.id].dailyTarget }
          : null,
      })),
    })),
    planned_quarter: null,
  };
  const ids = books.sections.flatMap((section) => section.books.map((book) => book.id));
  await writeBundleFiles({
    'plan.json': {
      ...bundle.plan,
      start_date: result.start,
      end_date: result.end,
      rest_days: restDays.map((range) => ({ start_date: range.start, end_date: range.end })),
    },
    'books.json': books,
    'sessions.json': {
      ...bundle.sessions,
      sessions: Object.fromEntries(ids.map((id) => [id, (bundle.sessions.sessions || {})[id] || []])),
    },
  });
  scheduleState = {
    version: 1,
    startDate: result.start,
    endDate: result.end,
    restDays,
    groups: Object.fromEntries(sections.map((section) => [section.label, section.groups.map((group) => [...group])])),
    overrides: Object.fromEntries(sections.flatMap((section) => section.books.map((book) => [book.id, null]))),
    baselines,
    needsRecalculation: false,
  };
  saveSchedule();
  renderSchedule(`Next quarter activated: ${result.start} to ${result.end}.`);
  return result;
};

const checkRollover = async () => {
  try {
    const result = await rollover();
    if (result) renderQuarter(`Next quarter activated: ${result.start} to ${result.end}.`);
    return result;
  } catch (error) {
    quarterStatus.textContent = error.message;
    return null;
  }
};

const savePlanned = async (planned, message) => {
  const current = readBundleFiles();
  await writeBundleFiles({
    'books.json': { ...current.books, planned_quarter: window.ReadingQuarter.plannedToJson(planned) },
  });
  if (!(await checkRollover())) renderQuarter(message);
};

const renderQuarter = (message = '') => {
  const current = readBundleFiles();
  quarterEmpty.hidden = !!current;
  quarterForm.hidden = !current;
  quarterBookForm.hidden = !current;
  if (!current) {
    quarterList.replaceChildren();
    quarterStatus.textContent = message;
    return;
  }
  const planned = plannedDraft();
  quarterStartInput.value = planned.startDate;
  const chosen = quarterSection.value;
  quarterSection.replaceChildren(...window.ReadingQuarter.blankSections().map((section) => {
    const option = document.createElement('option');
    option.value = section.label;
    option.textContent = section.label;
    return option;
  }));
  if (chosen) quarterSection.value = chosen;
  const items = [];
  for (const section of planned.sections) {
    const audio = section.label === 'Audiobooks';
    for (const book of section.books) {
      const from = audio ? book.start_time_seconds : book.start_page;
      const to = audio ? book.end_time_seconds : book.end_page;
      const item = document.createElement('li');
      const remove = document.createElement('button');
      remove.type = 'button';
      remove.textContent = 'Remove';
      remove.setAttribute('aria-label', `Remove planned book ${book.title}`);
      remove.addEventListener('click', async () => {
        const draft = plannedDraft();
        for (const candidate of draft.sections) candidate.books = candidate.books.filter((entry) => entry.id !== book.id);
        try {
          await savePlanned(draft, `Planned book ${book.title} removed.`);
        } catch (error) {
          quarterStatus.textContent = error.message;
        }
      });
      item.append(`${section.label}: ${book.title} (${from} to ${to} ${audio ? 'seconds' : 'pages'}) `, remove);
      items.push(item);
    }
  }
  quarterList.replaceChildren(...items);
  const count = items.length;
  quarterStatus.textContent = message || (count
    ? `Next-quarter plan saved: ${count} ${count === 1 ? 'book' : 'books'}. Unfinished current books carry forward first, and the plan activates on ${planned.startDate}.`
    : 'No books are planned for the next quarter yet.');
};

quarterForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    if (!quarterStartInput.value) throw new Error('Set the next-quarter start date.');
    if (!window.ReadingQuarter.isQuarterStart(quarterStartInput.value)) throw new Error('A next-quarter plan must start on 1 January, 1 April, 1 July or 1 October.');
    const planned = plannedDraft();
    planned.startDate = window.ReadingSchedule.iso(window.ReadingSchedule.parseDate(quarterStartInput.value));
    await savePlanned(planned, `Next-quarter start date saved: ${planned.startDate}.`);
  } catch (error) {
    quarterStatus.textContent = error.message;
  }
});

quarterBookForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const planned = plannedDraft();
    if (!planned) throw new Error('Import a bundle to plan the next quarter.');
    const section = planned.sections.find((item) => item.label === quarterSection.value);
    if (!section) throw new Error('Choose a book section.');
    const audio = section.label === 'Audiobooks';
    const title = quarterTitle.value.trim();
    if (!title) throw new Error('A planned book needs a title.');
    if (!quarterFrom.value || !quarterTo.value) throw new Error('Set the start and end pages or times.');
    const from = Number(quarterFrom.value), to = Number(quarterTo.value);
    if (!Number.isInteger(from) || !Number.isInteger(to) || to < from || (!audio && from < 1)) {
      throw new Error(audio ? 'Set whole-second times, with the end time on or after the start.' : 'Set whole page numbers, with the end page on or after the start page.');
    }
    section.books.push(window.ReadingQuarter.newBook(section.label, title, from, to));
    await savePlanned(planned, `Planned ${title} for the next quarter.`);
    quarterBookForm.reset();
  } catch (error) {
    quarterStatus.textContent = error.message;
  }
});

renderSchedule();
renderQuarter();
checkRollover();
setInterval(checkRollover, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) checkRollover();
});

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    status.textContent = 'Offline access is unavailable. Please reconnect and reload.';
  });
}
