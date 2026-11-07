const form = document.querySelector('#plan-form');
const plan = document.querySelector('#plan');
const status = document.querySelector('#status');
const storageKey = 'reading-plan-draft-v1';
const bundleKey = 'reading-plan-bundle-v1';
const bundleNames = ['plan.json', 'books.json', 'sessions.json', 'manifest.json'];
const bundleMessage = document.querySelector('#bundle-status');
const exports = document.querySelector('#bundle-exports');
const backupReminder = document.querySelector('#backup-reminder');
const lastBackupKey = 'reading-plan-last-backup-v1';
const backupReminderDays = 7;

// Screen height is display-relative; cap it in CSS when browser chrome or a
// keyboard leaves less room than the native sheet would need.
function sizeNativeSheets() {
  if (screen.height > 0) document.documentElement.style.setProperty('--native-sheet-height', `${screen.height * 0.86}px`);
}
sizeNativeSheets();
window.addEventListener('resize', sizeNativeSheets);

const screens = [...document.querySelectorAll('main > .screen')];
const tabs = [...document.querySelectorAll('.tab-bar button')];
let previousScreen = 'session';
function showScreen(name) {
  if (name !== 'settings') previousScreen = name;
  for (const screen of screens) screen.hidden = screen.id !== `screen-${name}`;
  for (const tab of tabs) {
    if (tab.dataset.screen === name) tab.setAttribute('aria-current', 'page');
    else tab.removeAttribute('aria-current');
  }
  for (const button of document.querySelectorAll('.header-actions button')) button.setAttribute('aria-expanded', String(name === 'settings'));
}
tabs.forEach((tab) => tab.addEventListener('click', () => showScreen(tab.dataset.screen)));
for (const button of document.querySelectorAll('.header-actions button')) button.addEventListener('click', () => showScreen('settings'));
document.querySelector('#settings-done').addEventListener('click', () => showScreen(previousScreen));

async function showSourceStatus() {
  let loaded = false, stored;
  try {
    stored = localStorage.getItem(bundleKey);
    const encoded = JSON.parse(stored);
    const values = {};
    const bytes = {};
    for (const name of bundleNames) {
      bytes[name] = Uint8Array.from(atob(encoded[name]), (character) => character.charCodeAt(0));
      values[name] = JSON.parse(new TextDecoder('utf-8', { fatal: true }).decode(bytes[name]));
      if (values[name]?.schema_version !== 2) throw new Error('Invalid schema.');
    }
    window.validateBundleContents(values, new WeakMap());
    const manifest = values['manifest.json'];
    if (!Number.isSafeInteger(manifest.revision) || manifest.revision < 0 || !manifest.last_modified || !manifest.modified_by || Object.keys(manifest.files).length !== 3) throw new Error('Invalid manifest.');
    for (const name of bundleNames.slice(0, 3)) {
      const hash = await crypto.subtle.digest('SHA-256', bytes[name]);
      const actual = Array.from(new Uint8Array(hash), (byte) => byte.toString(16).padStart(2, '0')).join('');
      if (actual !== manifest.files[name]?.toLowerCase()) throw new Error('Invalid checksum.');
    }
    loaded = true;
  } catch {
    // Missing, unreadable or invalid local data is not a loaded JSON source.
  }
  try { if (localStorage.getItem(bundleKey) !== stored) return; } catch { /* Storage may be unavailable. */ }
  const button = document.querySelector('#json-status');
  const label = loaded ? 'JSON loaded' : 'JSON not loaded';
  button.textContent = 'JSON';
  button.dataset.loaded = String(loaded);
  button.setAttribute('aria-label', `${label}. Open Settings`);
  document.querySelector('#source-status').textContent = `${label} in this browser. Transfers are manual.`;
}

// The export is a complete backup; remind only when it is missing or a week old.
function showExports() {
  showSourceStatus();
  exports.hidden = !localStorage.getItem(bundleKey);
  const last = Date.parse(localStorage.getItem(lastBackupKey) || '');
  const due = !Number.isFinite(last) || Date.now() - last >= backupReminderDays * 24 * 60 * 60 * 1000;
  backupReminder.hidden = exports.hidden || !due;
  if (!backupReminder.hidden) {
    backupReminder.textContent = Number.isFinite(last)
      ? `Your last backup was on ${new Date(last).toLocaleDateString()}. Export a bundle ZIP to keep your own copy.`
      : 'No backup has been made on this device yet. Export a bundle ZIP to keep your own copy.';
  }
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

// The browser reads a selected file from disk when the import asks for bytes,
// not when the input changes. Antivirus, indexing or sync software can hold a
// transient lock on that file and turn the read into a NotReadableError even
// though the file is intact, so retry briefly before reporting the failure.
const readSelectedFile = async (file) => {
  for (let attempt = 0; ; attempt += 1) {
    try {
      return await file.arrayBuffer();
    } catch (error) {
      if (error?.name !== 'NotReadableError' || attempt === 2) throw error;
      await new Promise((resolve) => setTimeout(resolve, 100 * (attempt + 1)));
    }
  }
};

document.querySelector('#bundle-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  bundleMessage.textContent = '';
  let imported = false;
  try {
    const files = Array.from(document.querySelector('#bundle-files').files);
    const names = bundleNames;
    if (files.length !== names.length || names.some((name) => files.filter((file) => file.name === name).length !== 1)) throw new Error('Select exactly the four required files.');
    const decoder = new TextDecoder('utf-8', { fatal: true });
    const buffers = Object.fromEntries(await Promise.all(files.map(async (file) => [file.name, await readSelectedFile(file)])));
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
    let repaired = false;
    for (const section of parsed['books.json'].sections) {
      for (const book of section.books) {
        repaired = window.recalculateReadingHistory(book, parsed['sessions.json'].sessions[book.id.trim()], section.label, false) || repaired;
      }
    }
    if (repaired) {
      const encoder = new TextEncoder();
      buffers['sessions.json'] = encoder.encode(JSON.stringify(parsed['sessions.json']));
      manifest.revision += 1;
      manifest.last_modified = new Date().toISOString();
      manifest.modified_by = 'web app';
      manifest.files['sessions.json'] = await digest(buffers['sessions.json']);
      buffers['manifest.json'] = encoder.encode(JSON.stringify(manifest));
    }
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
    bundleMessage.textContent = repaired ? 'Bundle imported on this device; reading session chain repaired.' : 'Bundle imported on this device.';
    imported = true;
  } catch (error) {
    bundleMessage.textContent = `Bundle could not be imported: ${error.message}`;
  }
  if (imported) {
    renderSchedule();
    if (!(await checkRollover())) renderQuarter();
  }
});

exports.addEventListener('click', async () => {
  try {
    // Include legacy locally saved schedules in the transferable backup too.
    if (localStorage.getItem(scheduleKey)) await saveSchedule();
    const encoded = JSON.parse(localStorage.getItem(bundleKey));
    const url = URL.createObjectURL(window.createBundleZip(encoded));
    const link = document.createElement('a');
    link.href = url;
    link.download = 'reading-plan-bundle.zip';
    link.click();
    localStorage.setItem(lastBackupKey, new Date().toISOString());
    showExports();
    setTimeout(() => URL.revokeObjectURL(url), 1000);
  } catch (error) {
    bundleMessage.textContent = `Bundle could not be exported: ${error.message}`;
  }
});

const scheduleKey = 'reading-plan-schedule-v1';
const scheduleForm = document.querySelector('#schedule-form');
const startInput = document.querySelector('#plan-start');
const finishInput = document.querySelector('#plan-finish');
window.AndroidControls.date(startInput, { mode: 'text' });
window.AndroidControls.date(finishInput, { mode: 'text' });
const restForm = document.querySelector('#rest-form');
const restStart = document.querySelector('#rest-start');
const restEnd = document.querySelector('#rest-end');
window.ReadingCalendar.attach(restStart);
window.ReadingCalendar.attach(restEnd);
const restList = document.querySelector('#rest-list');
const calculateButton = document.querySelector('#calculate-schedule');
const scheduleStatus = document.querySelector('#schedule-status');
const scheduleTable = document.querySelector('#schedule-table');
const scheduleRows = document.querySelector('#schedule-rows');
const scheduleEmpty = document.querySelector('#schedule-empty');
const projectionEmpty = document.querySelector('#projection-empty');
const projectionTable = document.querySelector('#projection-table');
const projectionRows = document.querySelector('#projection-rows');
const groupList = document.querySelector('#group-list');
let scheduleState = null;

const readBundleData = () => {
  try {
    const encoded = JSON.parse(localStorage.getItem(bundleKey));
    if (!encoded) return null;
    const file = (name) => JSON.parse(new TextDecoder().decode(Uint8Array.from(atob(encoded[name]), (character) => character.charCodeAt(0))));
    const planData = file('plan.json'), booksFile = file('books.json'), sessionFile = file('sessions.json');
    return {
      plan: planData,
      books: booksFile,
      sessions: sessionFile.sessions || {},
      sections: window.ReadingSchedule.sectionsFromBooksFile(booksFile),
    };
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
      return { ...saved, groups: saved.groups ?? defaults.groups, overrides: saved.overrides ?? defaults.overrides, startOverrides: saved.startOverrides ?? defaults.startOverrides };
    }
  } catch {
    // Fall back to the imported bundle's own dates and baselines.
  }
  return defaults;
};

const saveSchedule = async () => {
  try {
    const current = readBundleFiles();
    const sections = sectionsForState(readBundleData(), scheduleState);
    await writeBundleFiles({
      'plan.json': {
        ...current.plan,
        start_date: scheduleState.startDate,
        end_date: scheduleState.endDate,
        rest_days: scheduleState.restDays.map((range) => ({ start_date: range.start, end_date: range.end })),
      },
      'books.json': {
        ...current.books,
        sections: current.books.sections.map((section, index) => ({
          ...section,
          baseline_needs_recalculation: scheduleState.needsRecalculation,
          simultaneous_groups: sections[index].groups.map((group) => group.map((number) => section.books[number - 1].id)),
          books: section.books.map((book) => {
            const baseline = scheduleState.baselines[String(book.id).trim()];
            return { ...book, deadline_override: scheduleState.overrides[String(book.id).trim()] || null,
              start_date_override: scheduleState.startOverrides?.[String(book.id).trim()] || null,
              baseline_schedule: baseline ? { start_date: baseline.startDate, deadline: baseline.deadline, daily_target: baseline.dailyTarget } : null };
          }),
        })),
      },
    });
    localStorage.removeItem(scheduleKey);
  } catch (error) {
    scheduleState = loadSchedule(readBundleData());
    throw new Error(`Unable to save the schedule on this device: ${error.message}`);
  }
};

const sectionsForState = (bundle, state) => window.ReadingSchedule.withLocalSettings(bundle.sections, state.groups, state.overrides, state.startOverrides);

const setOverride = async (bookId, value, status = scheduleStatus) => {
  try {
    const bundle = readBundleData();
    if (!bundle) throw new Error('Import a bundle before scheduling its books.');
    scheduleState = loadSchedule(bundle);
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
    await saveSchedule();
    const message = value ? `Deadline override saved for ${book.title}.` : `Deadline override cleared for ${book.title}.`;
    renderSchedule(message);
    status.textContent = message;
    return true;
  } catch (error) {
    status.textContent = error.message;
    return false;
  }
};

const setStartOverride = async (bookId, value, status = scheduleStatus) => {
  try {
    const bundle = readBundleData();
    if (!bundle) throw new Error('Import a bundle before scheduling its books.');
    scheduleState = loadSchedule(bundle);
    const book = sectionsForState(bundle, scheduleState).flatMap((section) => section.books).find((item) => item.id === bookId);
    if (!book) throw new Error('That book is not part of the imported bundle.');
    window.ReadingSchedule.applyStartOverride(book, scheduleState.baselines, value, scheduleState.startDate, window.ReadingSchedule.today(), scheduleState.restDays);
    scheduleState.startOverrides = { ...scheduleState.startOverrides, [book.id]: value || null };
    await saveSchedule();
    const message = value ? `Start date override saved for ${book.title}.` : `Start date override cleared for ${book.title}.`;
    renderSchedule(message);
    status.textContent = message;
    return true;
  } catch (error) {
    status.textContent = error.message;
    return false;
  }
};

const renderGroups = (sections) => {
  const items = [];
  for (const item of sections) {
    item.groups.forEach((group) => {
      const listItem = document.createElement('li');
      const titles = group.map((number) => item.books.find((book) => book.number === number)?.title ?? `Book ${number}`);
      listItem.textContent = `${item.label}: ${titles.join(', ')}`;
      items.push(listItem);
    });
  }
  groupList.replaceChildren(...items);
};

const overrideCell = (book) => {
  const cell = document.createElement('td');
  const input = document.createElement('input');
  input.type = 'text';
  input.value = scheduleState.overrides[book.id] || '';
  input.setAttribute('aria-label', `Deadline override for ${book.title}`);
  window.ReadingCalendar.attach(input);
  const set = document.createElement('button');
  set.type = 'button';
  set.textContent = 'Set deadline';
  set.setAttribute('aria-label', `Save the deadline for ${book.title}`);
  set.addEventListener('click', () => {
    try {
      window.AndroidControls.parseDate(input.value);
      setOverride(book.id, input.value);
    } catch (error) { scheduleStatus.textContent = error.message; }
  });
  const clear = document.createElement('button');
  clear.type = 'button';
  clear.textContent = 'Clear';
  clear.setAttribute('aria-label', `Clear the deadline for ${book.title}`);
  clear.addEventListener('click', () => setOverride(book.id, ''));
  cell.append(input, set, clear);
  const start = document.createElement('input');
  start.type = 'text';
  start.value = scheduleState.startOverrides?.[book.id] || '';
  start.setAttribute('aria-label', `Start date override for ${book.title}`);
  window.ReadingCalendar.attach(start);
  const saveStart = document.createElement('button');
  saveStart.type = 'button';
  saveStart.textContent = 'Set start date';
  saveStart.setAttribute('aria-label', `Save the start date for ${book.title}`);
  saveStart.addEventListener('click', () => {
    try {
      window.AndroidControls.parseDate(start.value);
      setStartOverride(book.id, start.value);
    } catch (error) { scheduleStatus.textContent = error.message; }
  });
  const clearStart = document.createElement('button');
  clearStart.type = 'button';
  clearStart.textContent = 'Clear start date';
  clearStart.setAttribute('aria-label', `Clear the start date for ${book.title}`);
  clearStart.addEventListener('click', () => setStartOverride(book.id, ''));
  cell.append(start, saveStart, clearStart);
  return cell;
};

// Projections read recorded history only; they never change the baseline schedule or required pace.
const renderProjections = (bundle) => {
  const today = window.ReadingSchedule.today();
  const rows = [];
  for (const section of bundle.books.sections || []) {
    const label = String(section.label).trim();
    const books = section.books || [];
    if (!books.length) continue;
    const header = document.createElement('tr'), headerCell = document.createElement('th');
    headerCell.scope = 'rowgroup';
    headerCell.colSpan = 3;
    headerCell.textContent = `${label} · ${label === 'Audiobooks' ? 'seconds' : 'pages'}`;
    header.append(headerCell);
    rows.push(header);
    for (const book of books) {
      const forecast = window.ReadingProjection.forecast({
        book,
        sectionLabel: label,
        sessions: bundle.sessions[String(book.id).trim()] || [],
        restDays: scheduleState.restDays,
        today,
      });
      const row = document.createElement('tr');
      for (const value of [String(book.title ?? ''), forecast.projectionLabel, forecast.rangeLabel]) {
        const cell = document.createElement('td');
        cell.textContent = value;
        row.append(cell);
      }
      rows.push(row);
    }
  }
  projectionRows.replaceChildren(...rows);
  projectionTable.hidden = !rows.length;
};

const renderSchedule = (message = '') => {
  if (window.renderEditor) window.renderEditor();
  if (window.renderCharts) window.renderCharts();
  document.querySelector('#csv-export').hidden = !localStorage.getItem(bundleKey);
  const bundle = readBundleData();
  scheduleEmpty.hidden = !!bundle;
  projectionEmpty.hidden = !!bundle;
  scheduleForm.hidden = !bundle;
  restForm.hidden = !bundle;
  calculateButton.hidden = !bundle;
  if (!bundle) {
    showPlanActions();
    scheduleTable.hidden = true;
    projectionTable.hidden = true;
    projectionRows.replaceChildren();
    restList.replaceChildren();
    groupList.replaceChildren();
    return;
  }
  if (!scheduleState) scheduleState = loadSchedule(bundle);
  window.AndroidControls.sync(startInput, scheduleState.startDate);
  window.AndroidControls.sync(finishInput, scheduleState.endDate);
  restList.replaceChildren(...scheduleState.restDays.map((range, index) => {
    const item = document.createElement('li');
    // ReadingPlanPlanView renders every range as "start ? end", including single days.
    const label = `${range.start} ? ${range.end}`;
    const remove = document.createElement('button');
    item.append(`${label} `);
    remove.type = 'button';
    remove.textContent = 'Remove';
    remove.setAttribute('aria-label', `Remove rest days ${label}`);
      remove.addEventListener('click', async () => {
        scheduleState.restDays = scheduleState.restDays.filter((_, position) => position !== index);
        try { await scheduleChanged(); } catch (error) { scheduleStatus.textContent = error.message; }
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
  renderProjections(bundle);
  showPlanActions();
  if (!Object.keys(scheduleState.baselines).length) {
    scheduleStatus.textContent = 'No baseline schedule is saved yet. Calculate the schedule.';
  } else if (scheduleState.needsRecalculation) {
    scheduleStatus.textContent = 'Plan changes are saved. The saved baseline stays unchanged until you calculate the schedule again.';
  } else {
    scheduleStatus.textContent = message || 'Baseline schedule saved. Required pace reflects today.';
  }
};

const scheduleChanged = async () => {
  if (Object.keys(scheduleState.baselines).length) scheduleState.needsRecalculation = true;
  await saveSchedule();
  renderSchedule();
};

scheduleForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    if (!startInput.value || !finishInput.value) throw new Error('Set both plan dates.');
    window.AndroidControls.parseDate(startInput.value);
    window.AndroidControls.parseDate(finishInput.value);
    if (!window.ReadingSchedule.availableDayCount(startInput.value, finishInput.value)) throw new Error('The plan finish date is before its start date.');
    scheduleState.startDate = startInput.value;
    scheduleState.endDate = finishInput.value;
    await scheduleChanged();
  } catch (error) {
    scheduleStatus.textContent = error.message;
  }
});

restForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    if (!restStart.value || !restEnd.value) throw new Error('Set both rest-day dates.');
    window.AndroidControls.parseDate(restStart.value);
    window.AndroidControls.parseDate(restEnd.value);
    const ranges = window.ReadingSchedule.normalizeRestDays([...scheduleState.restDays, { start: restStart.value, end: restEnd.value }]);
    scheduleState.restDays = ranges.map((range) => ({ start: window.ReadingSchedule.iso(range.start), end: window.ReadingSchedule.iso(range.end) }));
    await scheduleChanged();
  } catch (error) {
    scheduleStatus.textContent = error.message;
  }
});

calculateButton.addEventListener('click', async () => {
  try {
    const bundle = readBundleData();
    if (!bundle) throw new Error('Import a bundle before calculating the schedule.');
    const sections = sectionsForState(bundle, scheduleState);
    scheduleState.baselines = window.ReadingSchedule.calculateBaselines(sections, scheduleState.startDate, scheduleState.endDate, scheduleState.restDays);
    window.ReadingSchedule.applyPersistedOverrides(sections, scheduleState.baselines, scheduleState.endDate, window.ReadingSchedule.today(), scheduleState.restDays);
    scheduleState.needsRecalculation = false;
    await saveSchedule();
    renderSchedule('Baseline schedule calculated on this device.');
  } catch (error) {
    scheduleStatus.textContent = error.message;
  }
});

const quarterEmpty = document.querySelector('#quarter-empty');
const quarterDialog = document.querySelector('#quarter-dialog');
const quarterOpen = document.querySelector('#open-quarter');
const quarterDraftStatus = document.querySelector('#quarter-draft-status');
const quarterBookForm = document.querySelector('#quarter-book-form');
const quarterSection = document.querySelector('#quarter-section');
window.AndroidControls.select(quarterSection);
const quarterTitle = document.querySelector('#quarter-title');
const quarterFrom = document.querySelector('#quarter-from');
const quarterTo = document.querySelector('#quarter-to');
const quarterList = document.querySelector('#quarter-list');
const quarterStatus = document.querySelector('#quarter-status');
let editingPlannedBook = null;
let quarterDraft = null;
let quarterOpeningToken = null;
const cancelPlannedEdit = () => {
  editingPlannedBook = null;
  quarterBookForm.reset();
};
quarterDialog.addEventListener('close', () => {
  quarterDraft = null;
  quarterOpeningToken = null;
  cancelPlannedEdit();
});
document.querySelector('#cancel-quarter').addEventListener('click', () => quarterDialog.close());

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
let bundleWritePending = false;
const writeBundleFiles = async (updates) => {
  if (bundleWritePending) throw new Error('A save is already in progress. Wait for its saved message.');
  bundleWritePending = true;
  const controls = [...document.querySelectorAll('button, input, select')].filter((control) => !control.disabled);
  controls.forEach((control) => { control.disabled = true; });
  try {
    const original = localStorage.getItem(bundleKey);
    const current = readBundleFiles() || (bundleNames.slice(0, 3).every((name) => updates[name])
      ? { manifest: { schema_version: 2, revision: 0 }, encoded: {} } : null);
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
    window.validateBundleContents({ 'plan.json': updates['plan.json'] || current.plan,
      'books.json': updates['books.json'] || current.books,
      'sessions.json': updates['sessions.json'] || current.sessions }, new WeakMap());
    if (localStorage.getItem(bundleKey) !== original) throw new Error('The plan changed during this save. Try again.');
    localStorage.setItem(bundleKey, JSON.stringify(Object.fromEntries(bundleNames.map((name) => [name, encodeFile(data[name])]))));
    showExports();
  } finally {
    bundleWritePending = false;
    controls.forEach((control) => { control.disabled = false; });
  }
};

const newPlanForm = document.querySelector('#create-plan-form');
const newPlanStart = document.querySelector('#create-plan-start');
const newPlanFinish = document.querySelector('#create-plan-finish');
window.AndroidControls.date(newPlanStart, { mode: 'text' });
window.AndroidControls.date(newPlanFinish, { mode: 'text' });
const newPlanCustom = document.querySelector('#create-plan-custom');
const newPlanStatus = document.querySelector('#new-plan-status');
const newPlanSection = document.querySelector('#new-plan').closest('section');
const quarterShortcut = document.createElement('button');
quarterShortcut.type = 'button';
quarterShortcut.textContent = 'Plan next quarter';
quarterShortcut.addEventListener('click', () => quarterOpen.click());
const activePlanHint = document.createElement('p');
activePlanHint.textContent = 'Your current plan is active. Press New plan to choose start and finish dates.';
const recalculatePlan = document.createElement('button');
recalculatePlan.type = 'button';
recalculatePlan.id = 'recalculate-plan';
recalculatePlan.textContent = 'Recalculate current plan';
recalculatePlan.addEventListener('click', () => calculateButton.click());
newPlanSection.insertBefore(quarterShortcut, newPlanForm);
newPlanSection.insertBefore(activePlanHint, newPlanForm);
newPlanSection.insertBefore(recalculatePlan, newPlanForm);
const showPlanActions = () => {
  const current = readBundleFiles();
  const active = !!current;
  const planned = current && window.ReadingQuarter.plannedFromBundle(current.books);
  quarterShortcut.textContent = planned ? `Edit next quarter — ${planned.startDate}` : 'Plan next quarter';
  quarterShortcut.hidden = !active;
  activePlanHint.hidden = !active || !newPlanForm.hidden;
  recalculatePlan.hidden = activePlanHint.hidden;
};
const showPlanDates = () => {
  const current = readBundleFiles();
  const start = current?.plan.start_date || window.ReadingQuarter.nextQuarterStart(window.ReadingSchedule.today());
  window.AndroidControls.sync(newPlanStart, start);
  window.AndroidControls.sync(newPlanFinish, current?.plan.end_date || window.ReadingQuarter.periodEnd(start));
  newPlanCustom.checked = current?.plan.end_label === 'Target finish date';
  newPlanForm.hidden = false;
  showPlanActions();
};

document.querySelector('#new-plan').addEventListener('click', async () => {
  showPlanDates();
  newPlanStatus.textContent = '';
  if (!window.confirm('Replace the current plan?')) return;
  try {
    const current = readBundleFiles();
    const start = window.ReadingQuarter.nextQuarterStart(window.ReadingSchedule.today());
    await writeBundleFiles({
      'plan.json': {
        ...(current?.plan || {}), schema_version: 2, start_date: start,
        end_date: window.ReadingQuarter.periodEnd(start), end_label: 'Quarter end', rest_days: [],
        stats_options: { book_counts: true, page_share: true, average_pages: true, reading_period: true, pace_driver: true },
      },
      'books.json': { ...(current?.books || {}), schema_version: 2, sections: window.ReadingQuarter.blankSections() },
      'sessions.json': { schema_version: 2, sessions: {} },
    });
    localStorage.removeItem(scheduleKey);
    scheduleState = null;
    if (typeof resetBook === 'function') resetBook();
    if (typeof resetSession === 'function') resetSession();
    renderSchedule();
    renderQuarter();
    showPlanDates();
    newPlanStatus.textContent = 'New plan saved.';
  } catch (error) {
    newPlanStatus.textContent = `Unable to replace the plan: ${error.message}`;
  }
});

newPlanForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const current = readBundleFiles();
    if (!current) throw new Error('Replace the plan first.');
    const start = newPlanStart.value, finish = newPlanFinish.value;
    if (!start || !finish || finish < start) throw new Error('Finish date must be on or after the start date.');
    window.AndroidControls.parseDate(start);
    window.AndroidControls.parseDate(finish);
    const end = newPlanCustom.checked ? finish : window.ReadingQuarter.periodEnd(start);
    const bundle = readBundleData();
    const state = scheduleState || loadSchedule(bundle);
    const sections = sectionsForState(bundle, state);
    const baselines = window.ReadingSchedule.calculateBaselines(sections, start, end, state.restDays);
    window.ReadingSchedule.applyPersistedOverrides(sections, baselines, end, window.ReadingSchedule.today(), state.restDays);
    const books = { ...current.books, sections: current.books.sections.map((section) => ({
      ...section, baseline_needs_recalculation: false,
      books: section.books.map((book) => ({ ...book, baseline_schedule: baselines[book.id]
        ? { start_date: baselines[book.id].startDate, deadline: baselines[book.id].deadline, daily_target: baselines[book.id].dailyTarget }
        : null })),
    })) };
    await writeBundleFiles({ 'plan.json': { ...current.plan, start_date: start, end_date: end,
      end_label: newPlanCustom.checked ? 'Target finish date' : 'Quarter end' }, 'books.json': books });
    localStorage.removeItem(scheduleKey);
    scheduleState = null;
    renderSchedule();
    renderQuarter();
    showPlanDates();
    newPlanStatus.textContent = 'Plan recalculated.';
  } catch (error) {
    newPlanStatus.textContent = error.message;
  }
});

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
  localStorage.removeItem(scheduleKey);
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

const renderQuarter = (message = '') => {
  showPlanActions();
  const current = readBundleFiles();
  quarterEmpty.hidden = !!current;
  quarterOpen.hidden = !current;
  if (!current) {
    quarterStatus.textContent = message;
    return;
  }
  let planned;
  try {
    planned = plannedDraft();
    quarterOpen.disabled = false;
    quarterShortcut.disabled = false;
  } catch (error) {
    if (!(error instanceof RangeError)) throw error;
    quarterOpen.disabled = true;
    quarterShortcut.disabled = true;
    quarterStatus.textContent = error.message;
    return;
  }
  const count = planned.sections.reduce((total, section) => total + section.books.length, 0);
  quarterStatus.textContent = message || (count
    ? `Next-quarter plan saved: ${count} ${count === 1 ? 'book' : 'books'}. Unfinished current books carry forward first, and the plan activates on ${planned.startDate}.`
    : 'No books are planned for the next quarter yet.');
};

quarterOpen.addEventListener('click', async () => {
  try {
    await rollover();
    const openingToken = localStorage.getItem(bundleKey);
    const draft = plannedDraft();
    if (!draft) throw new Error('Import a bundle to plan the next quarter.');
    quarterOpeningToken = openingToken;
    quarterDraft = draft;
    cancelPlannedEdit();
    quarterDraftStatus.textContent = '';
    document.querySelector('#quarter-dialog-heading').textContent = `Next quarter — ${draft.startDate}`;
    renderQuarterDraft();
    quarterDialog.showModal();
  } catch (error) {
    quarterStatus.textContent = error.message;
  }
});

const renderQuarterDraft = () => {
  const chosen = quarterSection.value;
  quarterSection.replaceChildren(...window.ReadingQuarter.blankSections().map((section) => {
    const option = document.createElement('option');
    option.value = section.label;
    option.textContent = section.label;
    return option;
  }));
  if (chosen) quarterSection.value = chosen;
  window.AndroidControls.syncSelect(quarterSection);
  const items = [];
  for (const section of quarterDraft.sections) {
    const audio = section.label === 'Audiobooks';
    for (const book of section.books) {
      const from = audio ? book.start_time_seconds : book.start_page;
      const to = audio ? book.end_time_seconds : book.end_page;
      const item = document.createElement('li');
      const edit = document.createElement('button');
      edit.type = 'button';
      edit.textContent = `${section.label} — ${book.title}`;
      edit.setAttribute('aria-pressed', String(editingPlannedBook === book.id));
      edit.addEventListener('click', () => {
        editingPlannedBook = book.id;
        quarterSection.value = section.label;
        quarterTitle.value = book.title;
        quarterFrom.value = audio ? window.formatReadingTime(from) : from;
        quarterTo.value = audio ? window.formatReadingTime(to) : to;
        renderQuarterDraft();
        quarterTitle.focus();
      });
      // Native clipToPadding leaves only the corner slivers of these full-width shadows.
      const cast = document.createElement('span');
      cast.className = 'quarter-shadow-cast';
      cast.setAttribute('aria-hidden', 'true');
      item.append(cast, edit);
      items.push(item);
    }
  }
  quarterList.replaceChildren(...items);
};

// Resolve legacy numeric groups before mutation, then retain only consecutive live IDs.
const normalizePlannedSections = () => {
  for (const section of quarterDraft.sections) {
    const positions = new Map(section.books.map((book, index) => [book.id, index]));
    section.simultaneous_groups = (section.simultaneous_groups || []).map((group) => group.filter((id) => positions.has(id))
      .sort((left, right) => positions.get(left) - positions.get(right)))
      .filter((group) => group.length > 1 && group.every((id, index) => !index || positions.get(id) === positions.get(group[index - 1]) + 1));
    section.books.forEach((book, index) => { book.number = index + 1; });
  }
};
const resolvePlannedGroups = () => {
  for (const section of quarterDraft.sections) {
    section.simultaneous_groups = (section.simultaneous_groups || []).map((group) => group.map((entry) =>
      section.books.some((book) => book.id === entry) ? entry : section.books[Number(entry) - 1]?.id));
  }
};

const storePlannedBook = (replace) => {
  try {
    if (!quarterDraft) return;
    const section = quarterDraft.sections.find((item) => item.label === quarterSection.value);
    if (!section) throw new Error('Choose a book section.');
    const audio = section.label === 'Audiobooks';
    const title = quarterTitle.value.trim();
    if (!title) throw new Error('A planned book needs a title.');
    // Android's planned dialog defaults a blank start to page 1 or audio second 0 and
    // has no default end, so blank fields are resolved here instead of by the form.
    const from = quarterFrom.value.trim() ? window.parseBookField(quarterFrom.value, audio) : audio ? 0 : 1;
    const to = window.parseBookField(quarterTo.value, audio);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) {
      throw new Error(audio ? 'Set whole-second times, with the end time on or after the start.' : 'Set whole page numbers, with the end page on or after the start page.');
    }
    const source = quarterDraft.sections.find((item) => item.books.some((book) => book.id === editingPlannedBook));
    if (replace && !source) throw new Error('Select a planned book first.');
    resolvePlannedGroups();
    const book = window.ReadingQuarter.newBook(section.label, title, from, to);
    if (replace) {
      book.id = editingPlannedBook;
      const index = source.books.findIndex((item) => item.id === book.id);
      if (source === section) section.books[index] = book;
      else {
        source.books.splice(index, 1);
        section.books.push(book);
      }
    } else section.books.push(book);
    editingPlannedBook = book.id;
    normalizePlannedSections();
    renderQuarterDraft();
    quarterDraftStatus.textContent = 'Draft updated. Save plan to keep these changes.';
  } catch (error) {
    quarterDraftStatus.textContent = error.message;
  }
};
quarterBookForm.addEventListener('submit', (event) => {
  event.preventDefault();
  storePlannedBook(false);
});
document.querySelector('#update-planned-book').addEventListener('click', () => storePlannedBook(true));
document.querySelector('#remove-planned-book').addEventListener('click', () => {
  if (!quarterDraft || !editingPlannedBook) return;
  resolvePlannedGroups();
  for (const section of quarterDraft.sections) section.books = section.books.filter((book) => book.id !== editingPlannedBook);
  normalizePlannedSections();
  cancelPlannedEdit();
  renderQuarterDraft();
  quarterDraftStatus.textContent = 'Draft updated. Save plan to keep these changes.';
});
document.querySelector('#save-quarter').addEventListener('click', async () => {
  try {
    await rollover();
    if (localStorage.getItem(bundleKey) !== quarterOpeningToken) {
      throw new Error('The plan changed while you were editing. Reopen the editor before saving.');
    }
    const current = readBundleFiles();
    resolvePlannedGroups();
    normalizePlannedSections();
    await writeBundleFiles({ 'books.json': { ...current.books, planned_quarter: window.ReadingQuarter.plannedToJson(quarterDraft) } });
    quarterDialog.close();
    renderQuarter('Next-quarter plan saved.');
  } catch (error) {
    quarterDraftStatus.textContent = error.message;
  }
});

renderSchedule();
renderQuarter();
checkRollover();
setInterval(checkRollover, 30000);
document.addEventListener('visibilitychange', () => {
  if (!document.hidden) {
    checkRollover();
    showExports();
  }
});
setInterval(showExports, 60 * 60 * 1000);

const updateNotice = document.querySelector('#update-notice');
const updateReload = document.querySelector('#reload-update');
let waitingWorker = null;
let applyingUpdate = false;

// A worker that installs beside an existing active one is an update, not the first install.
const offerUpdate = (registration, worker) => {
  if (!worker || !registration.active) return;
  waitingWorker = worker;
  updateNotice.hidden = false;
};

if ('serviceWorker' in navigator) {
  navigator.serviceWorker.addEventListener('controllerchange', () => {
    if (applyingUpdate) window.location.reload();
  });
  updateReload.addEventListener('click', () => {
    if (!waitingWorker) return;
    applyingUpdate = true;
    waitingWorker.postMessage({ type: 'SKIP_WAITING' });
  });
  navigator.serviceWorker.register('./sw.js').then((registration) => {
    if (registration.waiting) offerUpdate(registration, registration.waiting);
    registration.addEventListener('updatefound', () => {
      const worker = registration.installing;
      if (!worker) return;
      worker.addEventListener('statechange', () => {
        if (worker.state === 'installed') offerUpdate(registration, worker);
      });
    });
    const checkForUpdate = () => registration.update().catch(() => {});
    setInterval(checkForUpdate, 60 * 60 * 1000);
    document.addEventListener('visibilitychange', () => {
      if (!document.hidden) checkForUpdate();
    });
  }).catch(() => {
    status.textContent = 'Offline access is unavailable. Please reconnect and reload.';
  });
}
