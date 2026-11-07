// Structured edits always commit a validated bundle, never a second copy of its progress.
const bookForm = document.querySelector('#book-form');
const bookFormat = document.querySelector('#book-format');
window.AndroidControls.select(bookFormat);
const bookTitle = document.querySelector('#book-title');
const bookFrom = document.querySelector('#book-from');
const bookTo = document.querySelector('#book-to');
window.ReadingCalendar.attach(document.querySelector('#book-start-override'));
window.ReadingCalendar.attach(document.querySelector('#book-deadline-override'));
const editorStatus = document.querySelector('#editor-status');
let editingBook = null;

const updateBookOverrideActions = () => {
  const book = readBundleFiles()?.books.sections.flatMap((section) => section.books).find((book) => book.id === editingBook);
  for (const kind of ['start', 'deadline']) {
    const saved = book?.[kind === 'start' ? 'start_date_override' : 'deadline_override'];
    document.querySelector(`#clear-book-${kind}`).hidden = !book || !(saved || document.querySelector(`#book-${kind}-override`).value);
  }
};
const updateBookLabels = () => {
  const audio = bookFormat.value === 'Audiobooks';
  document.querySelector('#book-from-label').textContent = audio ? 'Start time' : 'Start page';
  document.querySelector('#book-to-label').textContent = audio ? 'End time' : 'End page';
  bookFrom.inputMode = bookTo.inputMode = audio ? 'text' : 'numeric';
};
const resetBook = () => {
  const format = bookFormat.value;
  editingBook = null;
  bookForm.reset();
  bookFormat.value = format;
  bookFormat.disabled = false;
  window.AndroidControls.syncSelect(bookFormat);
  bookFrom.value = format === 'Audiobooks' ? '0:00' : '1';
  updateBookLabels();
  updateBookOverrideActions();
};
document.querySelector('#cancel-book').addEventListener('click', resetBook);

const editorAction = async (change, status = editorStatus) => {
  status.textContent = '';
  editorStatus.textContent = '';
  let message;
  try {
    const current = readBundleFiles();
    if (!current) throw new Error('Import a bundle first.');
    const originalSessions = JSON.stringify(current.sessions);
    const legacy = localStorage.getItem(scheduleKey);
    // Merge legacy settings in memory; rejected edits must not migrate storage.
    if (legacy) {
      const state = scheduleState || loadSchedule(readBundleData());
      const sections = sectionsForState(readBundleData(), state);
      current.plan = { ...current.plan, start_date: state.startDate, end_date: state.endDate,
        rest_days: state.restDays.map((range) => ({ start_date: range.start, end_date: range.end })) };
      current.books.sections = current.books.sections.map((section, index) => ({
        ...section,
        baseline_needs_recalculation: state.needsRecalculation,
        simultaneous_groups: sections[index].groups.map((group) => group.map((number) => section.books[number - 1].id)),
        books: section.books.map((book) => {
          const id = String(book.id).trim(), baseline = state.baselines[id];
          return { ...book, deadline_override: state.overrides[id] || null,
            start_date_override: state.startOverrides?.[id] || null,
            baseline_schedule: baseline ? { start_date: baseline.startDate, deadline: baseline.deadline, daily_target: baseline.dailyTarget } : null };
        }),
      }));
    }
    message = change(current);
    await writeBundleFiles({ ...(legacy ? { 'plan.json': current.plan } : {}), 'books.json': current.books,
      ...(JSON.stringify(current.sessions) !== originalSessions ? { 'sessions.json': current.sessions } : {}) });
    if (legacy) localStorage.removeItem(scheduleKey);
    scheduleState = null;
  } catch (error) {
    editorStatus.textContent = error.message;
    status.textContent = error.message;
    return false;
  }
  try {
    renderSchedule();
    renderQuarter();
    editorStatus.textContent = message;
  } catch (error) {
    editorStatus.textContent = `${message} Unable to refresh the display: ${error.message}. Reload to view the saved change.`;
  }
  return true;
};

const normalizeBookOrder = (section) => {
  // Convert legacy numeric groups before any insertion/removal changes their meaning.
  const ids = new Set(section.books.map((book) => book.id));
  const positions = new Map(section.books.map((book, index) => [book.id, index]));
  section.simultaneous_groups = (section.simultaneous_groups || []).filter((group) =>
    group.length > 1 && group.every((id, index) => ids.has(id) && (!index || positions.get(id) === positions.get(group[index - 1]) + 1)));
  section.books.forEach((book, index) => { book.number = index + 1; });
  section.baseline_needs_recalculation = true;
};
const groupIds = (section) => {
  section.simultaneous_groups = (section.simultaneous_groups || []).map((group) => group.map((item) =>
    section.books.some((book) => book.id === item) ? item : section.books[Number(item) - 1]?.id));
};

// Books uses Android's field syntax, not the session editor's seconds shorthand.
const parseBookField = (raw, audio) => {
  const parts = raw.trim().split(':');
  if (audio && parts.length !== 2 && parts.length !== 3) throw new Error('Time must be HH:MM or HH:MM:SS.');
  if ((!audio && parts.length !== 1) || parts.some((part) => !/^[+-]?\d+$/.test(part) || Number(part) < -2147483648 || Number(part) > 2147483647)) throw new Error(audio ? 'Start time and end time must be HH:MM or HH:MM:SS.' : 'Start page and end page must be whole numbers.');
  const [first, minutes, seconds = 0] = parts.map(Number);
  if (audio && parts.some((part) => Number(part) < 0)) throw new Error('Time cannot be negative.');
  if (audio && (minutes >= 60 || seconds >= 60)) throw new Error('Minutes and seconds must be below 60.');
  return audio ? first * 3600 + minutes * 60 + seconds : first;
};
const saveBook = async (mode) => {
  const saved = await editorAction((current) => {
    const section = current.books.sections.find((item) => item.label.trim() === bookFormat.value);
    const selection = mode === 'add' ? null : selectedBook(current);
    if (mode === 'insert' && section.simultaneous_groups.some((group) => group.includes(selection.book.id) && group[0] !== selection.book.id)) throw new Error('Insert before or after the simultaneous group instead.');
    const audio = bookFormat.value === 'Audiobooks';
    const existing = mode === 'replace' ? selection.book : null;
    const title = bookTitle.value.trim() || (existing ? existing.title : `Book ${mode === 'insert' ? selection.index + 1 : section.books.length + 1}`);
    const from = bookFrom.value.trim() ? parseBookField(bookFrom.value, audio) : existing ? Number(audio ? existing.start_time_seconds : existing.start_page) : audio ? 0 : 1;
    const to = !bookTo.value.trim() && existing ? Number(audio ? existing.end_time_seconds : existing.end_page) : parseBookField(bookTo.value, audio);
    if (!Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < 0 || to < from) throw new Error('Set a valid whole-number range.');
    groupIds(section);
    const book = existing || window.ReadingQuarter.newBook(section.label, title, from, to);
    const originalFrom = Number(audio ? book.start_time_seconds ?? 0 : book.start_page ?? 1);
    const originalTo = Number(audio ? book.end_time_seconds : book.end_page);
    const rangeChanged = existing && (from !== originalFrom || to !== originalTo);
    const completed = window.ReadingSchedule.units(book, audio).completed;
    let currentPosition = completed > 0 ? originalFrom + completed - (audio ? 0 : 1)
      : (audio ? book.current_time_seconds : book.current_page) ?? null;
    const position = mode === 'insert' ? selection.index + 1 : mode === 'add' ? section.books.length + 1 : selection.index + 1;
    if (!Number.isSafeInteger(position) || position < 1 || position > section.books.length + (existing ? 0 : 1)) throw new Error('Choose a position within this format.');
    if (existing && position !== section.books.indexOf(existing) + 1 && section.simultaneous_groups.some((group) => group.includes(existing.id))) throw new Error('Move simultaneous books together with Move Up or Move Down.');
    if ((!existing || position !== section.books.indexOf(existing) + 1) && section.simultaneous_groups.some((group) => {
      const positions = group.map((id) => section.books.findIndex((item) => item.id === id) + 1);
      return position > Math.min(...positions) && position <= Math.max(...positions);
    })) throw new Error('Insert before or after the simultaneous group instead.');
    Object.assign(book, { title }, audio
      ? { start_time_seconds: from, end_time_seconds: to, duration_seconds: to - from }
      : { start_page: from, end_page: to, pages: to - from + 1 });
    if (currentPosition != null && (currentPosition < from || currentPosition > to)) currentPosition = null;
    if (audio) {
      book.current_time_seconds = currentPosition;
      book.time_listened_seconds = currentPosition == null ? 0 : currentPosition - from;
      book.remaining_time_seconds = currentPosition == null ? null : to - currentPosition;
    } else {
      book.current_page = currentPosition;
      book.pages_read = currentPosition == null ? 0 : currentPosition - from + 1;
    }
    section.books = section.books.filter((item) => item.id !== book.id);
    section.books.splice(position - 1, 0, book);
    // Android replacement drops history on either endpoint change, but keeps
    // an in-range position and target_completed_date independently of history.
    if (rangeChanged) current.sessions.sessions[book.id] = [];
    current.sessions.sessions[book.id] ||= [];
    if (audio) {
      for (const session of current.sessions.sessions[book.id]) {
        if (session.current_time_seconds != null) session.remaining_time_seconds = to - session.current_time_seconds;
      }
    }
    window.recalculateReadingHistory(book, current.sessions.sessions[book.id], section.label);
    normalizeBookOrder(section);
    return 'Book saved.';
  });
  if (saved) resetBook();
};
bookForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await saveBook('replace');
});
document.querySelector('#add-book').addEventListener('click', () => saveBook('add'));

const editorButton = (text, label, action) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', action);
  return button;
};

const selectBookForEdit = (id) => {
  const current = readBundleFiles();
  const section = current?.books.sections.find((item) => item.label.trim() === bookFormat.value);
  const index = section?.books.findIndex((book) => book.id === id) ?? -1;
  if (index < 0) { editorStatus.textContent = 'This book changed. Choose it again.'; return false; }
  const book = section.books[index], audio = section.label.trim() === 'Audiobooks';
  editingBook = book.id;
  bookTitle.value = book.title;
  const from = Number(audio ? book.start_time_seconds ?? 0 : book.start_page ?? 1);
  const to = from + window.ReadingSchedule.units(book, audio).total - (audio ? 0 : 1);
  bookFrom.value = audio ? window.formatReadingTime(from) : from;
  bookTo.value = audio ? window.formatReadingTime(to) : to;
  window.AndroidControls.sync(document.querySelector('#book-start-override'), book.start_date_override || '');
  window.AndroidControls.sync(document.querySelector('#book-deadline-override'), book.deadline_override || '');
  updateBookLabels();
  updateBookOverrideActions();
  return true;
};
const bookPicker = document.querySelector('#book-picker-dialog');
const bookPickerTrigger = document.querySelector('#open-book-picker');
bookPickerTrigger.addEventListener('click', () => {
  const section = readBundleFiles()?.books.sections.find((item) => item.label.trim() === bookFormat.value);
  document.querySelector('#book-picker-format').textContent = bookFormat.value;
  const choices = document.querySelector('#book-picker-choices');
  choices.replaceChildren(...(section?.books || []).map((book, index) => {
    const label = document.createElement('label');
    const input = document.createElement('input');
    input.type = 'radio';
    input.name = 'book-picker-choice';
    input.checked = editingBook === book.id;
    input.dataset.bookId = book.id;
    input.addEventListener('click', () => {
       if (selectBookForEdit(book.id)) {
         bookPicker.close('selected');
         bookTitle.focus();
       }
    });
    label.append(input, `${index + 1}. ${book.title}`);
    return label;
  }));
  if (!section?.books.length) choices.textContent = 'Add a book first.';
  bookPicker.returnValue = '';
  bookPicker.showModal();
});
document.querySelector('#cancel-book-picker').addEventListener('click', () => bookPicker.close());

window.renderEditor = () => {
  const current = readBundleFiles();
  bookForm.hidden = !current;
  updateBookLabels();
  updateBookOverrideActions();
  const today = document.querySelector('#today-reading');
  window.AndroidControls.syncSelect(bookFormat);
  today.replaceChildren(...(current?.books.sections || []).map((section) => {
    const container = document.createElement('section');
    const heading = document.createElement('h4');
    heading.textContent = section.label;
    container.append(heading);
    if (!section.books.length) container.append('No books in this format.');
    else {
      const table = document.createElement('table');
      const header = document.createElement('tr');
      for (const name of ['Name', 'Pages/time today', 'Start', 'Deadline']) {
        const cell = document.createElement('th'); cell.textContent = name; header.append(cell);
      }
      table.append(header);
      try {
        const targets = window.ReadingSchedule.todayReading(current.plan, current.books, section.label);
        for (const book of section.books) {
          const row = document.createElement('tr');
          for (const value of [book.title, targets[book.id].value, targets[book.id].startDate, targets[book.id].deadline]) {
            const cell = document.createElement('td'); cell.textContent = value; row.append(cell);
          }
          table.append(row);
        }
      } catch (error) { container.append(error.message); }
      container.append(table);
    }
    return container;
  }));
  renderHistory(current);
};

const sessionForm = document.querySelector('#session-form');
const sessionBook = document.querySelector('#session-book');
const sessionDate = document.querySelector('#session-date');
window.AndroidControls.date(sessionDate, { mode: 'text' });
window.AndroidControls.sync(sessionDate, window.ReadingSchedule.today());
const sessionPosition = document.querySelector('#session-position');
const sessionMetrics = document.createElement('div');
sessionMetrics.className = 'session-metrics';
const targetLabel = document.createElement('span');
const paceLabel = document.createElement('span');
const targetCaption = document.createElement('small'), targetValue = document.createElement('strong');
const paceCaption = document.createElement('small'), paceValue = document.createElement('strong');
targetLabel.append(targetCaption, targetValue);
paceLabel.append(paceCaption, paceValue);
sessionMetrics.append(targetLabel, paceLabel);
sessionPosition.after(sessionMetrics);
const updateSessionTarget = () => {
  const current = readBundleFiles();
  const section = current?.books.sections.find((item) => item.books.some((book) => book.id === sessionBook.value));
  const book = section?.books.find((item) => item.id === sessionBook.value);
  const audio = section?.label.trim() === 'Audiobooks';
  // Android's metricColumn captions carry no punctuation.
  targetCaption.textContent = audio ? 'Target time left' : 'Target page';
  paceCaption.textContent = audio ? 'Time per day' : 'Pages per day';
  targetValue.textContent = paceValue.textContent = '-';
  sessionMetrics.dataset.completed = String(!!book && sessionDate.value === window.ReadingSchedule.today() && book.target_completed_date === sessionDate.value);
  if (!book || !window.AndroidControls.sync(sessionDate) || !sessionDate.value) return;
  try {
    const target = window.ReadingSchedule.sessionTarget(current.plan, current.books, section.label, book.id, sessionDate.value);
    targetValue.textContent = target.value;
    paceValue.textContent = target.dailyPace;
  } catch { /* An invalid or unavailable date has no target. */ }
};
sessionBook.addEventListener('change', updateSessionTarget);
sessionDate.addEventListener('input', updateSessionTarget);
sessionDate.addEventListener('change', updateSessionTarget);
let sessionFormat = 'Physical books';
const entriesDialog = document.querySelector('#entries-dialog');
const entriesBook = document.querySelector('#entries-book');
window.AndroidControls.select(entriesBook);
const sessionFormats = document.querySelector('#session-formats');
const sessionBooks = document.querySelector('#session-books');
const positionLabel = document.querySelector('#session-position-label');
const saveSession = document.querySelector('#save-session');
const selectSessionBook = (id) => {
  sessionBook.value = id;
  entriesBook.value = id;
  sessionFormat = readBundleFiles()?.books.sections.find((section) => section.books.some((book) => book.id === id))?.label.trim() || sessionFormat;
  renderHistory(readBundleFiles());
};
const resetSession = () => {
  window.AndroidControls.sync(sessionDate, window.ReadingSchedule.today());
  sessionPosition.value = '';
  updateSessionTarget();
};
document.querySelector('#open-entries').addEventListener('click', () => {
  entriesBook.value = sessionBook.value;
  renderHistory(readBundleFiles());
  entriesDialog.showModal();
});
document.querySelector('#close-entries').addEventListener('click', () => entriesDialog.close());
entriesBook.addEventListener('change', () => renderHistory(readBundleFiles()));
const entriesHandle = document.querySelector('.entries-handle');
let dragStart = null;
entriesHandle.addEventListener('pointerdown', (event) => { dragStart = event.clientY; entriesHandle.setPointerCapture(event.pointerId); });
entriesHandle.addEventListener('pointermove', (event) => {
  if (dragStart !== null) entriesDialog.style.transform = `translateY(${Math.max(0, event.clientY - dragStart)}px)`;
});
const endEntriesDrag = (event) => {
  if (dragStart === null) return;
  const distance = event.clientY - dragStart;
  dragStart = null;
  entriesDialog.style.transform = '';
  if (event.type === 'pointerup' && distance > 120) entriesDialog.close();
};
entriesHandle.addEventListener('pointerup', endEntriesDrag);
entriesHandle.addEventListener('pointercancel', endEntriesDrag);

// Both add and history edit resolve stable IDs against the current bundle.
const resolveSession = (current, bookId, sessionId = null) => {
  const section = current?.books.sections.find((item) => item.books.some((book) => book.id === bookId));
  if (!section) throw new Error(sessionId ? 'This book changed. Cancel and choose it again.' : 'Choose a book.');
  const book = section.books.find((item) => item.id === bookId);
  const sessions = current.sessions.sessions[book.id] ||= [];
  const existing = sessionId && sessions.find((session) => session.id === sessionId && !session.deleted);
  if (sessionId && (!existing || sessions.some((session) => session.id === sessionId && session.deleted))) throw new Error('This session changed. Cancel and choose it again.');
  return { section, book, sessions, existing };
};
const saveReadingSession = (current, bookId, dateValue, positionValue, sessionId = null) => {
  const { section, book, sessions, existing } = resolveSession(current, bookId, sessionId);
  const audio = section.label.trim() === 'Audiobooks';
  const end = audio ? Number(book.end_time_seconds ?? book.duration_seconds ?? book.pages) : Number(book.end_page ?? book.pages);
  window.AndroidControls.parseDate(dateValue);
  const date = dateValue;
  const position = window.parseReadingUnits(positionValue, audio);
  const today = window.ReadingSchedule.today();
  const before = !existing && date === today
    ? window.ReadingSchedule.sessionTarget(current.plan, current.books, section.label, book.id, date, today) : null;
  const completedBefore = before && before.units > before.completed &&
    (audio ? end - position - Number(book.start_time_seconds ?? 0) : position - Number(book.start_page ?? 1) + 1) >= before.units;
  const session = existing || { id: crypto.randomUUID() };
  Object.assign(session, { date }, audio
    ? { current_time_seconds: end - position, remaining_time_seconds: position }
    : { current_page: position });
  if (!existing) sessions.push(session);
  window.recalculateReadingHistory(book, sessions, section.label);
  if (completedBefore) book.target_completed_date = today;
  if (existing) window.clearReadingTargetCompletion(current.plan, current.books, section.label, book, today);
  return 'Reading session saved.';
};
sessionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  if (await editorAction((current) => saveReadingSession(current, sessionBook.value, sessionDate.value, sessionPosition.value))) resetSession();
});

const entryDialog = document.querySelector('#session-entry-dialog');
const entryDate = document.querySelector('#session-entry-date');
window.AndroidControls.date(entryDate, { mode: 'text' });
const entryPosition = document.querySelector('#session-entry-position');
let entryTarget = null;
const openSessionEntry = (bookId, sessionId, remove, trigger) => {
  try {
    const { section, book, existing } = resolveSession(readBundleFiles(), bookId, sessionId);
    const audio = section.label.trim() === 'Audiobooks';
    entryTarget = { bookId, sessionId, remove, trigger };
    document.querySelector('#session-entry-heading').textContent = remove ? 'Delete entry?' : 'Edit session';
    document.querySelector('#session-entry-fields').hidden = remove;
    document.querySelector('#session-entry-delete').hidden = !remove;
    document.querySelector('#session-entry-save').textContent = remove ? 'Delete' : 'Save';
    entryDate.disabled = entryPosition.disabled = remove;
    window.AndroidControls.sync(entryDate, existing.date);
    entryPosition.value = audio ? window.formatReadingTime(existing.remaining_time_seconds ?? book.end_time_seconds - existing.current_time_seconds) : existing.current_page;
    entryPosition.inputMode = audio ? 'text' : 'numeric';
    document.querySelector('#session-entry-position-label').textContent = audio ? 'Session time left' : 'Session current page';
    document.querySelector('#session-entry-status').textContent = '';
    entryDialog.showModal();
  } catch (error) { editorStatus.textContent = error.message; }
};
document.querySelector('#session-entry-cancel').addEventListener('click', () => entryDialog.close());
entryDialog.addEventListener('close', () => {
  const { trigger, sessionId, remove } = entryTarget || {};
  const replacement = [...document.querySelectorAll('#history-list button')].find((button) => button.dataset.sessionId === sessionId && button.dataset.action === (remove ? 'delete' : 'edit'));
  (trigger?.isConnected ? trigger : replacement || window.AndroidControls.syncSelect(entriesBook)).focus();
  entryTarget = null;
});
document.querySelector('#session-entry-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const { bookId, sessionId, remove } = entryTarget;
  const saved = await editorAction((current) => {
    if (!remove) return saveReadingSession(current, bookId, entryDate.value, entryPosition.value, sessionId);
    const { section, book, sessions, existing } = resolveSession(current, bookId, sessionId);
    existing.deleted = true;
    window.recalculateReadingHistory(book, sessions, section.label);
    window.clearReadingTargetCompletion(current.plan, current.books, section.label, book);
    return 'Reading session deleted.';
  }, document.querySelector('#session-entry-status'));
  if (saved) entryDialog.close();
});

const renderHistory = (current) => {
  const chosen = sessionBook.value;
  const historyBook = entriesBook.value;
  const books = (current?.books.sections || []).flatMap((section) => section.books.map((book) => ({ section, book })));
  sessionForm.hidden = false;
  sessionBook.replaceChildren(...books.map(({ section, book }) => {
    const option = document.createElement('option');
    option.value = book.id;
    option.textContent = `${section.label}: ${book.title}`;
    return option;
  }));
  if (books.some(({ book }) => book.id === chosen)) sessionBook.value = chosen;
  else if (chosen === '' && books.length && sessionFormat !== books[0].section.label.trim()) sessionBook.value = '';
  entriesBook.replaceChildren(...books.map(({ section, book }) => new Option(`${section.label} - ${book.number}. ${book.title}`, book.id)));
  entriesBook.value = books.some(({ book }) => book.id === historyBook) ? historyBook : sessionBook.value;
  window.AndroidControls.syncSelect(entriesBook);
  const format = sessionFormat;
  sessionFormats.replaceChildren(...['Physical books', 'Digital books', 'Audiobooks'].map((label, index) => {
    const button = editorButton(['Physical', 'Digital', 'Audiobooks'][index], `Choose ${label}`, () => {
      sessionFormat = label;
      const next = books.find(({ section }) => section.label.trim() === label);
      sessionBook.value = next?.book.id || '';
      renderHistory(current);
    });
    button.setAttribute('aria-pressed', String(format === label));
    return button;
  }));
  const matching = books.filter(({ section }) => section.label.trim() === format);
  sessionBooks.replaceChildren(...matching.map(({ book }) => {
    const button = editorButton(`${book.number}. ${book.title}`, `Choose book ${book.title}`, () => {
      selectSessionBook(book.id);
    });
    button.setAttribute('aria-pressed', String(sessionBook.value === book.id));
    return button;
  }));
  if (!matching.length) sessionBooks.textContent = 'Add a book to record a reading session.';
  saveSession.disabled = !matching.some(({ book }) => book.id === sessionBook.value);
  positionLabel.textContent = format === 'Audiobooks' ? 'Time left' : 'Current page';
  sessionPosition.inputMode = format === 'Audiobooks' ? 'text' : 'numeric';
  updateSessionTarget();
  const history = books.find(({ book }) => book.id === entriesBook.value);
  const content = document.querySelector('#entries-content');
  if (!history) {
    const empty = document.createElement('p'); empty.textContent = 'Add a book to record reading history.';
    const list = document.querySelector('#history-list');
    list.replaceChildren();
    content.replaceChildren(empty, list);
    return;
  }
  const { section, book } = history;
  const audio = section.label.trim() === 'Audiobooks';
  const events = [...(current.sessions.sessions[book.id] || [])].filter((session) => !session.deleted).reverse();
  const summary = document.createElement('p');
  const progress = window.ReadingSchedule.units(book, audio);
  summary.textContent = `${audio ? 'Time left ' + window.formatReadingTime(progress.remaining) : 'Current page ' + (book.current_page ?? book.start_page)} | ${Math.floor(progress.completed * 100 / Math.max(1, progress.total))}% | total recorded ${audio ? window.formatReadingTime(events.reduce((sum, session) => sum + session.time_listened_seconds, 0)) : events.reduce((sum, session) => sum + session.pages_read, 0)} | last read ${events[0]?.date || '-'}`;
  const heading = document.createElement('h3');
  heading.textContent = book.title;
  const groups = new Map();
  for (const session of events) {
    if (!groups.has(session.date)) groups.set(session.date, []);
    groups.get(session.date).push(session);
  }
  const items = [...groups].map(([date, day]) => {
    const item = document.createElement('li');
    const details = document.createElement('details');
    const previous = [...document.querySelectorAll('#history-list details')].find((entry) => entry.dataset.day === date);
    details.open = day.length === 1 || content.dataset.bookId === book.id && !!previous?.open;
    details.dataset.day = date;
    const title = document.createElement('summary');
    const total = day.reduce((sum, session) => sum + (audio ? session.time_listened_seconds : session.pages_read), 0);
    title.textContent = `${date} | pages read: ${audio ? window.formatReadingTime(total) : total}${day.length > 1 ? ` (${day.length} sessions)` : ''}`;
    details.append(title);
    for (const session of day) {
      const row = document.createElement('div');
      const start = audio ? session.current_time_seconds - session.time_listened_seconds : session.current_page - session.pages_read + 1;
      row.append(`${audio ? 'Started at ' + window.formatReadingTime(start) : 'Started at page ' + start} | contribution ${audio ? window.formatReadingTime(session.time_listened_seconds) : session.pages_read} `);
      const actions = document.createElement('div');
      actions.className = 'history-actions';
      for (const remove of [false, true]) {
        const action = remove ? 'Delete' : 'Edit';
        const button = editorButton(action, `${action} session ${book.title} ${session.date}`, () => openSessionEntry(book.id, session.id, remove, button));
        button.dataset.sessionId = session.id;
        button.dataset.action = action.toLowerCase();
        actions.append(button);
      }
      row.append(actions);
      details.append(row);
    }
    item.append(details);
    return item;
  });
  if (!items.length) {
    const empty = document.createElement('p'); empty.textContent = 'No reading entries for this book yet.';
    content.replaceChildren(heading, summary, empty, document.querySelector('#history-list'));
  } else content.replaceChildren(heading, summary, document.querySelector('#history-list'));
  document.querySelector('#history-list').replaceChildren(...items);
  content.dataset.bookId = book.id;
};
bookFormat.addEventListener('change', () => { const format = bookFormat.value; resetBook(); bookFormat.value = format; window.renderEditor(); });

const selectedBook = (current) => {
  const section = current?.books.sections.find((item) => item.label.trim() === bookFormat.value);
  const index = section?.books.findIndex((book) => book.id === editingBook) ?? -1;
  if (index < 0) throw new Error('Choose a book to edit first.');
  groupIds(section);
  return { section, index, book: section.books[index] };
};
document.querySelector('#insert-book').addEventListener('click', () => saveBook('insert'));
document.querySelector('#delete-book').addEventListener('click', async () => {
  const saved = await editorAction((current) => {
    const { section, book } = selectedBook(current);
    section.books = section.books.filter((entry) => entry.id !== book.id);
    section.simultaneous_groups = section.simultaneous_groups.map((group) => group.filter((id) => id !== book.id));
    delete current.sessions.sessions[book.id];
    normalizeBookOrder(section);
    return 'Book deleted.';
  });
  if (saved) resetBook();
});
for (const [kind, start] of [['start', true], ['deadline', false]]) {
  document.querySelector(`#book-${kind}-override`).addEventListener('input', updateBookOverrideActions);
  for (const clear of [false, true]) {
    document.querySelector(`#${clear ? 'clear' : 'set'}-book-${kind}`).addEventListener('click', async () => {
      try {
        const { book } = selectedBook(readBundleFiles());
        const input = document.querySelector(`#book-${kind}-override`);
        if (!clear) window.AndroidControls.parseDate(input.value);
        const saved = await (start ? setStartOverride : setOverride)(book.id, clear ? '' : input.value, editorStatus);
        if (saved && clear) window.AndroidControls.sync(input, '');
        updateBookOverrideActions();
      } catch (error) { editorStatus.textContent = error.message; }
    });
  }
}
document.querySelector('#complete-book').addEventListener('click', async () => {
  await editorAction((current) => {
    const { section, book } = selectedBook(current);
    const audio = section.label.trim() === 'Audiobooks';
    if (!window.ReadingSchedule.units(book, audio).remaining) throw new Error('Book is already complete.');
    const end = Number(audio ? book.end_time_seconds : book.end_page);
    current.sessions.sessions[book.id] ||= [];
    current.sessions.sessions[book.id].push({ id: crypto.randomUUID(), date: window.ReadingSchedule.today(), ...(audio
      ? { current_time_seconds: end, remaining_time_seconds: 0 } : { current_page: end }) });
    window.recalculateReadingHistory(book, current.sessions.sessions[book.id], section.label);
    return 'Book completed.';
  });
});
for (const [id, offset] of [['#move-book-up', -1], ['#move-book-down', 1]]) {
  document.querySelector(id).addEventListener('click', async () => editorAction((current) => {
    const { section, index } = selectedBook(current);
    const block = (at) => {
      const group = section.simultaneous_groups.find((ids) => ids.includes(section.books[at].id));
      return group ? [section.books.findIndex((book) => book.id === group[0]), section.books.findIndex((book) => book.id === group.at(-1))] : [at, at];
    };
    const [start, end] = block(index);
    if (offset < 0 && start === 0 || offset > 0 && end === section.books.length - 1) return 'Book is already at the edge.';
    const [otherStart, otherEnd] = block(offset < 0 ? start - 1 : end + 1);
    const from = Math.min(start, otherStart), to = Math.max(end, otherEnd);
    const moving = section.books.slice(start, end + 1), adjacent = section.books.slice(otherStart, otherEnd + 1);
    section.books.splice(from, to - from + 1, ...(offset < 0 ? [...moving, ...adjacent] : [...adjacent, ...moving]));
    normalizeBookOrder(section);
    return 'Book moved.';
  }));
}
const bookGroupDialog = document.querySelector('#book-group-dialog');
const bookGroupTrigger = document.querySelector('#select-book-group');
const bookGroupChoices = document.querySelector('#book-group-choices');
const bookGroupStatus = document.querySelector('#book-group-status');
let bookGroupTarget = null;
bookGroupTrigger.addEventListener('click', () => {
  try {
    const current = readBundleFiles();
    const section = current?.books.sections.find((item) => item.label.trim() === bookFormat.value);
    if (!section) throw new Error('Import a bundle first.');
    groupIds(section);
    const legacyToken = localStorage.getItem(scheduleKey);
    if (legacyToken) {
      const bundle = readBundleData();
      const saved = sectionsForState(bundle, loadSchedule(bundle)).find((item) => item.label === section.label);
      section.simultaneous_groups = saved.groups.map((group) => group.map((number) => section.books[number - 1].id));
    }
    const original = section.simultaneous_groups.find((group) => group.includes(editingBook)) || [];
    bookGroupTarget = { format: section.label, bookId: editingBook, original: [...original], token: localStorage.getItem(bundleKey), legacyToken };
    document.querySelector('#book-group-format').textContent = section.label;
    bookGroupChoices.replaceChildren(...section.books.map((book, index) => {
      const label = document.createElement('label');
      const input = document.createElement('input');
      input.type = 'checkbox';
      input.value = book.id;
      input.checked = original.includes(book.id);
      label.append(input, ` ${index + 1}. ${book.title}`);
      return label;
    }));
    bookGroupStatus.textContent = '';
    bookGroupDialog.showModal();
  } catch (error) { editorStatus.textContent = error.message; }
});
document.querySelector('#cancel-book-group').addEventListener('click', () => bookGroupDialog.close());
bookGroupDialog.addEventListener('close', () => {
  bookGroupTarget = null;
  bookGroupTrigger.focus();
});
document.querySelector('#book-group-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  try {
    const { format, bookId, original, token, legacyToken } = bookGroupTarget;
    const saved = await editorAction((current) => {
      if (localStorage.getItem(bundleKey) !== token || localStorage.getItem(scheduleKey) !== legacyToken) throw new Error('The plan changed. Reopen the picker before saving.');
      const section = current?.books.sections.find((item) => item.label === format);
      if (!section || bookId && !section.books.some((book) => book.id === bookId)) throw new Error('This book changed. Reopen the picker before saving.');
      groupIds(section);
      const chosen = [...bookGroupChoices.querySelectorAll('input:checked')].map((input) => input.value);
      if (chosen.some((id) => !section.books.some((book) => book.id === id))) throw new Error('These books changed. Reopen the picker before saving.');
      if (chosen.length === 1) throw new Error('Choose at least two books to read together.');
      const groups = section.simultaneous_groups.filter((group) =>
        !group.some((id) => original.includes(id) || chosen.includes(id)));
      if (chosen.length) groups.push(chosen);
      const validated = window.ReadingSchedule.validateGroups(section.books, groups.map((group) => group.map((id) => section.books.findIndex((book) => book.id === id) + 1)));
      section.simultaneous_groups = validated.map((group) => group.map((number) => section.books[number - 1].id));
      section.baseline_needs_recalculation = true;
      return 'Simultaneous books saved.';
    }, bookGroupStatus);
    if (saved) bookGroupDialog.close();
  } catch (error) { bookGroupStatus.textContent = error.message; }
});
document.querySelector('#clear-book-groups').addEventListener('click', async () => editorAction((current) => {
  const section = current.books.sections.find((item) => item.label.trim() === bookFormat.value);
  section.simultaneous_groups = [];
  section.baseline_needs_recalculation = true;
  return 'Groups cleared.';
}));
window.renderEditor();
