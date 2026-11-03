// Desktop-compatible CSV is a lossy interchange format, not a reading-plan backup.
(() => {
  const labels = ['Physical books', 'Digital books', 'Audiobooks'];
  const message = document.querySelector('#csv-status');
  const rowsFromText = (text) => {
    const rows = [], row = [];
    let field = '', quoted = false, closed = false;
    text = text.replace(/^\uFEFF/, '');
    for (let index = 0; index < text.length; index += 1) {
      const character = text[index];
      if (quoted) {
        if (character !== '"') field += character;
        else if (text[index + 1] === '"') { field += '"'; index += 1; }
        else { quoted = false; closed = true; }
      } else if (character === '"' && !field && !closed) quoted = true;
      else if (character === ',' || character === '\r' || character === '\n') {
        row.push(field); field = ''; closed = false;
        if (character !== ',') {
          rows.push(row.splice(0));
          if (character === '\r' && text[index + 1] === '\n') index += 1;
        }
      } else {
        if (closed || character === '"') throw new Error('Invalid CSV quoting.');
        field += character;
      }
    }
    if (quoted) throw new Error('Unclosed CSV field.');
    if (field || row.length || closed) { row.push(field); rows.push(row); }
    return rows;
  };

  const parsePlan = (text) => {
    const rows = rowsFromText(text);
    const firstTable = rows.findIndex((row) => labels.includes(row[0]) || row[0] === 'Book');
    const metadata = Object.fromEntries(rows.slice(0, firstTable < 0 ? rows.length : firstTable).filter((row) => row.length >= 2));
    const endLabel = 'Target finish date' in metadata ? 'Target finish date' : 'Quarter end';
    const { parseDate, iso, normalizeRestDays } = window.ReadingSchedule;
    const start = iso(parseDate(metadata['Start date'])), end = iso(parseDate(metadata[endLabel]));
    if (end < start) throw new Error('Finish date must be on or after the start date.');
    const rest = normalizeRestDays((metadata['Rest days'] || '').split(';').filter((value) => value.trim()).map((value) => {
      const [start, end] = value.split('/'); return { start, end };
    }));
    const sections = window.ReadingQuarter.blankSections();
    let section = sections[0], headers = null, groups = metadata['Simultaneous groups'] || '';
    const rawGroups = new Map();
    for (const row of rows.slice(Math.max(0, firstTable))) {
      if (!row.some((cell) => cell.trim())) { headers = null; continue; }
      if (labels.includes(row[0])) { section = sections[labels.indexOf(row[0])]; headers = null; groups = ''; continue; }
      if (row[0] === 'Daily pace') continue;
      if (row[0] === 'Simultaneous groups') { groups = row[1] || ''; rawGroups.set(section, groups); continue; }
      if (row[0] === 'Book' && row[1] === 'Title') { headers = row; rawGroups.set(section, groups); continue; }
      if (!headers) throw new Error('Missing book table header.');
      const values = Object.fromEntries(headers.map((header, index) => [header, row[index] ?? '']));
      const audio = section.label === 'Audiobooks';
      const units = (value) => window.parseReadingUnits(value, audio);
      const from = units(values[audio ? 'Start time' : 'Start page'] || (audio ? '0' : '1'));
      const to = units(values[audio ? 'End time' : 'End page'] || values[audio ? 'Duration' : 'Pages']);
      const title = values.Title.trim();
      if (!title || to < from || (!audio && from < 1)) throw new Error('Each book needs a title and valid range.');
      const book = window.ReadingQuarter.newBook(section.label, title, from, to);
      let current = null;
      if (audio && values['Remaining time']) current = to - units(values['Remaining time']);
      else if (values[audio ? 'Current time' : 'Current page']) current = units(values[audio ? 'Current time' : 'Current page']);
      else if (values[audio ? 'Time listened' : 'Read pages'] || values['Pages read']) {
        const amount = units(values[audio ? 'Time listened' : 'Read pages'] || values['Pages read']);
        if (amount) current = from + amount - (audio ? 0 : 1);
      }
      if (current != null && (current < from || current > to)) throw new Error('CSV progress is outside the book range.');
      if (audio) Object.assign(book, { current_time_seconds: current, time_listened_seconds: current == null ? 0 : current - from, remaining_time_seconds: current == null ? null : to - current });
      else Object.assign(book, { current_page: current, pages_read: current == null ? 0 : current - from + 1 });
      book.number = section.books.length + 1;
      section.books.push(book);
      section.baseline_needs_recalculation = true;
    }
    if (!sections.some((item) => item.books.length)) throw new Error('No books found.');
    for (const item of sections) item.simultaneous_groups = window.ReadingSchedule.validateGroups(item.books,
      (rawGroups.get(item) || '').split(';').filter(Boolean).map((group) => group.split(',').map(Number)))
      .map((group) => group.map((number) => item.books[number - 1].id));
    return { sections, start, end, endLabel, rest };
  };

  document.querySelector('#csv-form').addEventListener('submit', async (event) => {
    event.preventDefault();
    message.textContent = '';
    try {
      const file = document.querySelector('#csv-file').files[0];
      const result = parsePlan(await file.text());
      if (!window.confirm('Replace current books and reading history with this CSV plan? Export a bundle backup first. The next-quarter plan is retained.')) { message.textContent = 'CSV import cancelled.'; return; }
      const current = readBundleFiles();
      await writeBundleFiles({
        'plan.json': { ...(current?.plan || { schema_version: 2 }), start_date: result.start, end_date: result.end, end_label: result.endLabel,
          rest_days: result.rest.map((range) => ({ start_date: window.ReadingSchedule.iso(range.start), end_date: window.ReadingSchedule.iso(range.end) })) },
        'books.json': { ...(current?.books || { schema_version: 2 }), sections: result.sections },
        'sessions.json': { schema_version: 2, sessions: Object.fromEntries(result.sections.flatMap((section) => section.books.map((book) => [book.id, []]))) },
      });
      localStorage.removeItem(scheduleKey);
      scheduleState = null;
      resetBook(); resetSession(); cancelPlannedEdit();
      renderSchedule(); renderQuarter();
      message.textContent = 'CSV plan imported. Reading history is not included in CSV.';
    } catch (error) { message.textContent = `CSV could not be imported: ${error.message}`; }
  });

  document.querySelector('#csv-export').addEventListener('click', async () => {
    try {
      if (localStorage.getItem(scheduleKey)) await saveSchedule();
      const current = readBundleFiles();
      if (!current) throw new Error('Import a plan first.');
      const rows = [['Reading plan'], ['Start date', current.plan.start_date], [current.plan.end_label, current.plan.end_date],
        ['Rest days', (current.plan.rest_days || []).map((range) => `${range.start_date}/${range.end_date}`).join(';')]];
      for (const section of current.books.sections) {
        const audio = section.label.trim() === 'Audiobooks';
        const display = (value) => audio ? window.formatReadingTime(value) : String(value);
        const number = new Map(section.books.map((book, index) => [book.id, index + 1]));
        rows.push([], [section.label], ['Daily pace', ''], ['Simultaneous groups', (section.simultaneous_groups || [])
          .map((group) => group.map((id) => number.get(id) ?? id).join(',')).join(';')],
        audio ? ['Book', 'Title', 'Start time', 'End time', 'Remaining time', 'Duration']
          : ['Book', 'Title', 'Start page', 'End page', 'Current page', 'Pages', 'Read pages']);
        section.books.forEach((book, index) => {
          rows.push(audio ? [index + 1, book.title, display(book.start_time_seconds || 0), display(book.end_time_seconds ?? book.duration_seconds),
            display(window.ReadingSchedule.units(book, true).remaining), display(window.ReadingSchedule.units(book, true).total)]
            : [index + 1, book.title, book.start_page ?? 1, book.end_page ?? book.pages, book.current_page ?? '', book.pages, book.pages_read ?? 0]);
        });
      }
      const text = rows.map((row) => row.map((value) => `"${String(value).replaceAll('"', '""')}"`).join(',')).join('\r\n');
      const url = URL.createObjectURL(new Blob([text], { type: 'text/csv;charset=utf-8' }));
      const link = document.createElement('a'); link.href = url; link.download = 'reading-plan.csv'; link.click();
      setTimeout(() => URL.revokeObjectURL(url), 1000);
    } catch (error) { message.textContent = error.message; }
  });
})();
