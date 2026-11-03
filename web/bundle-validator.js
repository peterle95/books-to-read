// Validate the parsed data files after their manifest and checksums have been checked.
window.validateBundleContents = (values, nonIntegers) => {
  const fail = (path, message) => { throw new Error(`${path}: ${message}`); };
  const object = (value) => value !== null && typeof value === 'object' && !Array.isArray(value);
  const date = (value, path) => {
    const match = typeof value === 'string' && /^(\d{4})-(\d{1,2})-(\d{1,2})(?![\s\S])/.exec(value);
    if (!match) fail(path, 'invalid date');
    const [, y, m, d] = match.map(Number);
    const days = [31, y % 4 === 0 && (y % 100 !== 0 || y % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31];
    if (!y || m < 1 || m > 12 || d < 1 || d > days[m - 1]) fail(path, 'invalid date');
    return y * 10000 + m * 100 + d;
  };
  const integer = (value, path) => {
    if (typeof value === 'boolean') return Number(value);
    if (typeof value === 'number' && Number.isFinite(value)) return Math.trunc(value);
    if (typeof value === 'string' && /^[+-]?\d+$/.test(value.trim())) return Number(value);
    fail(path, 'must be a whole number');
  };
  const progress = (parent, key, low, high, path) => {
    const value = parent[key];
    if (value == null) return;
    if (!Number.isInteger(value) || nonIntegers.get(parent)?.has(key) || value < low || value > high) fail(path, `must be an integer between ${low} and ${high}`);
  };
  const plan = values && values['plan.json'];
  const booksFile = values && values['books.json'];
  const sessionsFile = values && values['sessions.json'];
  if (!object(plan) || !object(booksFile) || !object(sessionsFile)) fail('bundle', 'data files must be objects');
  if (date(plan.end_date, 'plan.json end_date') < date(plan.start_date, 'plan.json start_date')) fail('plan.json', 'finish date precedes start date');
  if (typeof plan.end_label !== 'string' || !['Quarter end', 'Target finish date'].includes(plan.end_label.trim())) fail('plan.json end_label', 'unknown finish label');
  if (plan.stats_options != null) {
    if (!object(plan.stats_options)) fail('plan.json stats_options', 'must be an object');
    for (const key of ['book_counts', 'page_share', 'average_pages', 'reading_period', 'pace_driver']) {
      if (key in plan.stats_options && typeof plan.stats_options[key] !== 'boolean') fail(`plan.json stats_options.${key}`, 'must be a boolean');
    }
  }
  if (plan.rest_days != null) {
    if (!Array.isArray(plan.rest_days)) fail('plan.json rest_days', 'must be a list');
    for (const range of plan.rest_days) {
      if (!object(range) || date(range.end_date, 'rest_days end_date') < date(range.start_date, 'rest_days start_date')) fail('plan.json rest_days', 'invalid range');
    }
  }
  const labels = ['Physical books', 'Digital books', 'Audiobooks'];
  const parseSections = (payload, prefix) => {
    if (!Array.isArray(payload.sections)) fail(prefix, 'sections must be a list');
    const seenLabels = new Set(), rawIds = new Set(), books = new Map();
    for (const section of payload.sections) {
      if (!object(section) || typeof section.label !== 'string' || !labels.includes(section.label.trim())) fail(prefix, 'unknown section');
      const label = section.label.trim(), audio = label === 'Audiobooks';
      if (seenLabels.has(label)) fail(prefix, 'duplicate section');
      seenLabels.add(label);
      const list = section.books === undefined ? [] : section.books;
      if (!Array.isArray(list)) fail(prefix, 'books must be a list');
      const sectionIds = new Map();
      for (const [index, raw] of list.entries()) {
        const path = `${prefix} ${label} book ${index + 1}`;
        if (!object(raw) || typeof raw.id !== 'string' || !raw.id.trim()) fail(path, 'stable book ID is required');
        if (rawIds.has(raw.id)) fail(path, 'duplicate book ID');
        rawIds.add(raw.id);
        if ('reading_sessions' in raw) fail(path, 'reading history belongs in sessions.json');
        const id = raw.id.trim();
        if (raw.title === undefined || (typeof raw.title === 'string' && !raw.title.trim())) fail(path, 'title is required');
        let start, end;
        if (audio) {
          if ('start_time_seconds' in raw && 'end_time_seconds' in raw) {
            start = integer(raw.start_time_seconds, path); end = integer(raw.end_time_seconds, path);
          } else { start = 0; end = integer(raw.duration_seconds !== undefined ? raw.duration_seconds : raw.pages !== undefined ? raw.pages : 0, path); }
        } else if ('start_page' in raw && 'end_page' in raw) {
          start = integer(raw.start_page, path); end = integer(raw.end_page, path);
        } else { start = 1; end = integer(raw.pages === undefined ? 0 : raw.pages, path); }
        if (start < 0 || end < start) fail(path, 'invalid book range');
        const total = end - start + (audio ? 0 : 1);
        const currentKey = audio ? 'current_time_seconds' : 'current_page';
        const amountKey = audio ? 'time_listened_seconds' : 'pages_read';
        // The parser converts the amount before the stricter bundle progress checks.
        const amount = integer(raw[amountKey] === undefined ? 0 : raw[amountKey], path);
        if (amount < 0) fail(path, 'negative progress');
        progress(raw, currentKey, start, end, `${path}.${currentKey}`);
        progress(raw, amountKey, 0, total, `${path}.${amountKey}`);
        if (audio) progress(raw, 'remaining_time_seconds', 0, total, `${path}.remaining_time_seconds`);
        if (raw[currentKey] != null && raw[amountKey] != null && raw[amountKey] !== raw[currentKey] - start + (audio ? 0 : 1)) fail(path, 'progress conflicts with current position');
        if (audio && raw[currentKey] != null && raw.remaining_time_seconds != null && raw.remaining_time_seconds !== end - raw[currentKey]) fail(path, 'remaining time conflicts with current position');
        let current = audio && raw.remaining_time_seconds != null ? end - raw.remaining_time_seconds : raw[currentKey];
        if (current == null && amount > 0) current = Math.min(end, start + amount - (audio ? 0 : 1));
        if (raw.baseline_schedule != null) {
          const baseline = raw.baseline_schedule;
          if (!object(baseline)) fail(path, 'baseline_schedule must be an object');
          date(baseline.start_date, `${path}.baseline_schedule.start_date`);
          date(baseline.deadline, `${path}.baseline_schedule.deadline`);
          if (typeof baseline.daily_target !== 'number' || !Number.isFinite(baseline.daily_target) || baseline.daily_target < 0) fail(path, 'invalid baseline daily target');
        }
        for (const key of ['deadline_override', 'start_date_override', 'target_completed_date']) {
          if (raw[key] != null && raw[key] !== '') date(raw[key], `${path}.${key}`);
        }
        sectionIds.set(id, index + 1);
        books.set(id, { start, end, total, audio, current: current ?? null });
      }
      const groups = section.simultaneous_groups === undefined ? [] : section.simultaneous_groups;
      if (!Array.isArray(groups)) fail(prefix, 'simultaneous groups must be a list');
      const used = new Set();
      for (const group of groups) {
        if (!Array.isArray(group)) fail(prefix, 'simultaneous group must be a list');
        const numbers = group.map((item) => sectionIds.has(item) ? sectionIds.get(item) : integer(item, prefix)).sort((a, b) => a - b);
        if (numbers.length < 2 || numbers.some((n, i) => n < 1 || n > list.length || used.has(n) || (i && n !== numbers[i - 1] + 1))) fail(prefix, 'invalid simultaneous group');
        numbers.forEach((n) => used.add(n));
      }
    }
    if (seenLabels.size !== labels.length) fail(prefix, 'all three book sections are required');
    return books;
  };
  const books = parseSections(booksFile, 'books.json');
  if (!object(sessionsFile.sessions)) fail('sessions.json', 'sessions must be an object');
  if (Object.keys(sessionsFile.sessions).length !== books.size || Object.keys(sessionsFile.sessions).some((id) => !books.has(id))) fail('sessions.json', 'session lists must match book IDs');
  const sessionIds = new Set();
  for (const [id, book] of books) {
    const sessions = sessionsFile.sessions[id], path = `sessions.json ${id}`;
    if (!Array.isArray(sessions)) fail(path, 'session list must be an array');
    let previous = null;
    const events = new Map();
    for (const session of sessions) {
      if (!object(session) || typeof session.id !== 'string' || !session.id.trim()) fail(path, 'stable session ID is required');
      if (sessionIds.has(session.id)) fail(path, 'duplicate session ID');
      sessionIds.add(session.id);
      const sessionDate = date(session.date, `${path} date`);
      const currentKey = book.audio ? 'current_time_seconds' : 'current_page';
      const amountKey = book.audio ? 'time_listened_seconds' : 'pages_read';
      progress(session, currentKey, book.start, book.end, `${path}.${currentKey}`);
      progress(session, amountKey, 0, book.total, `${path}.${amountKey}`);
      if (book.audio) progress(session, 'remaining_time_seconds', 0, book.total, `${path}.remaining_time_seconds`);
      if (session[amountKey] != null && session[amountKey] <= 0 && session.deleted !== true) fail(path, 'session progress must be positive');
      let current, amount;
      if (book.audio && session.remaining_time_seconds != null) current = book.end - session.remaining_time_seconds;
      else if (currentKey in session) current = integer(session[currentKey], path);
      if (current !== undefined) {
        amount = amountKey in session ? integer(session[amountKey], path) : current - (previous ?? (book.start - (book.audio ? 0 : 1)));
      } else {
        amount = integer(book.audio ? (session.pages ?? session.pages_read) : session.pages, path);
        current = (previous ?? (book.start - (book.audio ? 0 : 1))) + amount;
      }
      if (amount <= 0 && session.deleted !== true) fail(path, 'session progress must be positive');
      current = Math.min(book.end, Math.max(book.start, current));
      const normalizedId = session.id.trim(), existing = events.get(normalizedId);
      if (existing && (existing.date !== sessionDate || existing.current !== current || existing.amount !== amount)) fail(path, 'conflicting reading session UUID');
      if (existing) existing.deleted ||= session.deleted === true;
      else events.set(normalizedId, { date: sessionDate, current, amount, deleted: session.deleted === true });
      if (session.deleted !== true) previous = Math.max(previous ?? current, current);
    }
    const active = [...events.values()].filter((event) => !event.deleted);
    let completed = book.start - (book.audio ? 0 : 1);
    for (const event of active.sort((a, b) => a.date - b.date || a.current - b.current)) {
      if (event.current <= completed) fail(path, 'reading session progress must advance in date order');
      completed = event.current;
    }
    const derived = active.length ? active.reduce((maximum, event) => Math.max(maximum, event.current), -Infinity) : sessions.length ? null : book.current;
    if (derived !== book.current) fail(path, 'book progress conflicts with reading sessions');
  }
  if (booksFile.planned_quarter != null) {
    const planned = booksFile.planned_quarter;
    if (!object(planned)) fail('books.json planned_quarter', 'must be an object');
    const start = date(planned.start_date, 'planned_quarter start_date');
    if (start % 100 !== 1 || ![1, 4, 7, 10].includes(Math.floor(start / 100) % 100)) fail('books.json planned_quarter', 'must start at a quarter boundary');
    for (const [id, book] of parseSections(planned, 'books.json planned_quarter')) {
      if (books.has(id) || (book.current != null && (!book.audio || book.current > book.start))) fail('books.json planned_quarter', 'planned books must have unique IDs and no progress');
    }
  }
};
