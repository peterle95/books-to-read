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
  if (imported) renderSchedule();
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

renderSchedule();

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.register('./sw.js').catch(() => {
    status.textContent = 'Offline access is unavailable. Please reconnect and reload.';
  });
}
