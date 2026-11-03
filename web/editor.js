// Structured edits always commit a validated bundle, never a second copy of its progress.
const bookForm = document.querySelector('#book-form');
const bookFormat = document.querySelector('#book-format');
const bookTitle = document.querySelector('#book-title');
const bookFrom = document.querySelector('#book-from');
const bookTo = document.querySelector('#book-to');
const bookPosition = document.querySelector('#book-position');
const editorStatus = document.querySelector('#editor-status');
let editingBook = null;

const resetBook = () => {
  editingBook = null;
  bookForm.reset();
  bookFormat.disabled = false;
};
document.querySelector('#cancel-book').addEventListener('click', resetBook);

const editorAction = async (change) => {
  editorStatus.textContent = '';
  try {
    // Migrate a schedule saved by an earlier web version before editing the bundle.
    if (localStorage.getItem(scheduleKey)) await saveSchedule();
    const current = readBundleFiles();
    if (!current) throw new Error('Import a bundle first.');
    const message = change(current);
    await writeBundleFiles({ 'books.json': current.books, 'sessions.json': current.sessions });
    scheduleState = null;
    renderSchedule();
    renderQuarter();
    editorStatus.textContent = message;
  } catch (error) {
    editorStatus.textContent = error.message;
  }
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

bookForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await editorAction((current) => {
    const section = current.books.sections.find((item) => item.label.trim() === bookFormat.value);
    const audio = bookFormat.value === 'Audiobooks';
    const from = window.parseReadingUnits(bookFrom.value, audio), to = window.parseReadingUnits(bookTo.value, audio);
    if (!bookTitle.value.trim() || !Number.isSafeInteger(from) || !Number.isSafeInteger(to) || from < (audio ? 0 : 1) || to < from) throw new Error('Set a title and a valid whole-number range.');
    groupIds(section);
    const existing = section.books.find((book) => book.id === editingBook);
    if (editingBook && !existing) throw new Error('This book changed. Cancel and choose it again.');
    const book = existing || window.ReadingQuarter.newBook(section.label, bookTitle.value.trim(), from, to);
    const position = bookPosition.value ? Number(bookPosition.value) : existing ? section.books.indexOf(existing) + 1 : section.books.length + 1;
    if (!Number.isSafeInteger(position) || position < 1 || position > section.books.length + (existing ? 0 : 1)) throw new Error('Choose a position within this format.');
    Object.assign(book, { title: bookTitle.value.trim() }, audio
      ? { start_time_seconds: from, end_time_seconds: to, duration_seconds: to - from }
      : { start_page: from, end_page: to, pages: to - from + 1 });
    const currentPosition = audio ? book.current_time_seconds : book.current_page;
    if (currentPosition != null && (currentPosition < from || currentPosition > to)) throw new Error('The range must include recorded progress.');
    if (audio) {
      book.time_listened_seconds = currentPosition == null ? 0 : currentPosition - from;
      book.remaining_time_seconds = currentPosition == null ? null : to - currentPosition;
    } else book.pages_read = currentPosition == null ? 0 : currentPosition - from + 1;
    section.books = section.books.filter((item) => item.id !== book.id);
    section.books.splice(position - 1, 0, book);
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
  if (editorStatus.textContent === 'Book saved.') resetBook();
});

const editorButton = (text, label, action) => {
  const button = document.createElement('button');
  button.type = 'button';
  button.textContent = text;
  button.setAttribute('aria-label', label);
  button.addEventListener('click', action);
  return button;
};

window.renderEditor = () => {
  const current = readBundleFiles();
  bookForm.hidden = !current;
  const items = [];
  for (const section of current?.books.sections || []) {
    for (const [index, book] of section.books.entries()) {
      const item = document.createElement('li');
      item.append(`${section.label}: ${book.title} `);
      item.append(editorButton('Edit', `Edit book ${book.title}`, () => {
        editingBook = book.id;
        bookFormat.value = section.label.trim();
        bookFormat.disabled = true;
        bookTitle.value = book.title;
        const audio = section.label.trim() === 'Audiobooks';
        bookFrom.value = audio ? book.start_time_seconds : book.start_page;
        bookTo.value = audio ? book.end_time_seconds : book.end_page;
        bookPosition.value = index + 1;
        bookTitle.focus();
      }));
      item.append(editorButton('Delete', `Delete book ${book.title}`, async () => {
        if (!window.confirm(`Delete ${book.title} and its reading history? Keep an exported backup first.`)) return;
        await editorAction((data) => {
          const target = data.books.sections.find((entry) => entry.label === section.label);
          groupIds(target);
          target.books = target.books.filter((entry) => entry.id !== book.id);
          target.simultaneous_groups = target.simultaneous_groups.map((group) => group.filter((id) => id !== book.id));
          delete data.sessions.sessions[book.id];
          normalizeBookOrder(target);
          return 'Book deleted.';
        });
      }));
      items.push(item);
    }
  }
  document.querySelector('#book-list').replaceChildren(...items);
  renderHistory(current);
  const settings = document.querySelector('#settings-form');
  settings.hidden = !current;
  for (const input of settings.querySelectorAll('input')) input.checked = current?.plan.stats_options?.[input.name] ?? true;
};

const sessionForm = document.querySelector('#session-form');
const sessionBook = document.querySelector('#session-book');
const sessionDate = document.querySelector('#session-date');
const sessionPosition = document.querySelector('#session-position');
let editingSession = null;
const resetSession = () => {
  editingSession = null;
  sessionBook.disabled = false;
  sessionDate.value = window.ReadingSchedule.today();
  sessionPosition.value = '';
};
document.querySelector('#cancel-session').addEventListener('click', resetSession);

sessionForm.addEventListener('submit', async (event) => {
  event.preventDefault();
  await editorAction((current) => {
    const section = current.books.sections.find((item) => item.books.some((book) => book.id === sessionBook.value));
    if (!section) throw new Error('Choose a book.');
    const book = section.books.find((item) => item.id === sessionBook.value);
    const audio = section.label.trim() === 'Audiobooks';
    const date = window.ReadingSchedule.iso(window.ReadingSchedule.parseDate(sessionDate.value));
    const position = window.parseReadingUnits(sessionPosition.value, audio);
    if (!sessionPosition.value || !Number.isSafeInteger(position) || position < 0) throw new Error('Enter a whole page number or seconds left.');
    const sessions = current.sessions.sessions[book.id];
    const existing = editingSession && sessions.find((session) => session.id === editingSession && !session.deleted);
    if (editingSession && !existing) throw new Error('This session changed. Cancel and choose it again.');
    const session = existing || { id: crypto.randomUUID() };
    Object.assign(session, { date }, audio
      ? { current_time_seconds: book.end_time_seconds - position, remaining_time_seconds: position }
      : { current_page: position });
    if (!existing) sessions.push(session);
    window.recalculateReadingHistory(book, sessions, section.label);
    return 'Reading session saved.';
  });
  if (editorStatus.textContent === 'Reading session saved.') resetSession();
});

const renderHistory = (current) => {
  const chosen = sessionBook.value;
  const books = (current?.books.sections || []).flatMap((section) => section.books.map((book) => ({ section, book })));
  sessionForm.hidden = !books.length;
  sessionBook.replaceChildren(...books.map(({ section, book }) => {
    const option = document.createElement('option');
    option.value = book.id;
    option.textContent = `${section.label}: ${book.title}`;
    return option;
  }));
  if (books.some(({ book }) => book.id === chosen)) sessionBook.value = chosen;
  if (!sessionDate.value) sessionDate.value = window.ReadingSchedule.today();
  const events = books.flatMap(({ section, book }) => (current.sessions.sessions[book.id] || [])
    .filter((session) => !session.deleted).map((session) => ({ section, book, session })));
  events.sort((a, b) => window.ReadingSchedule.parseDate(a.session.date) - window.ReadingSchedule.parseDate(b.session.date)
    || (a.session.current_page ?? a.session.current_time_seconds) - (b.session.current_page ?? b.session.current_time_seconds)
    || a.session.id.localeCompare(b.session.id));
  const items = events.map(({ section, book, session }) => {
    const item = document.createElement('li');
    const audio = section.label.trim() === 'Audiobooks';
    item.append(`${session.date}: ${book.title} — ${audio ? `${session.time_listened_seconds} seconds, ${session.remaining_time_seconds} seconds left` : `${session.pages_read} pages, page ${session.current_page}`} `);
    item.append(editorButton('Edit', `Edit session ${book.title} ${session.date}`, () => {
      editingSession = session.id;
      sessionBook.value = book.id;
      sessionBook.disabled = true;
      sessionDate.value = window.ReadingSchedule.iso(window.ReadingSchedule.parseDate(session.date));
      sessionPosition.value = audio ? session.remaining_time_seconds ?? book.end_time_seconds - session.current_time_seconds : session.current_page;
      sessionDate.focus();
    }));
    item.append(editorButton('Delete', `Delete session ${book.title} ${session.date}`, async () => {
      await editorAction((data) => {
        const target = data.books.sections.find((entry) => entry.label === section.label).books.find((entry) => entry.id === book.id);
        const sessions = data.sessions.sessions[book.id];
        sessions.find((entry) => entry.id === session.id).deleted = true;
        window.recalculateReadingHistory(target, sessions, section.label);
        return 'Reading session deleted.';
      });
      resetSession();
    }));
    return item;
  });
  document.querySelector('#history-list').replaceChildren(...items);
};
window.renderEditor();

document.querySelector('#settings-form').addEventListener('submit', async (event) => {
  event.preventDefault();
  const message = document.querySelector('#settings-status');
  message.textContent = '';
  try {
    const current = readBundleFiles();
    await writeBundleFiles({ 'plan.json': { ...current.plan, stats_options: Object.fromEntries(
      [...event.currentTarget.querySelectorAll('input')].map((input) => [input.name, input.checked])) } });
    message.textContent = 'Summary settings saved.';
    if (window.renderCharts) window.renderCharts();
  } catch (error) { message.textContent = error.message; }
});
