// Baseline scheduling for the web app, mirroring the desktop calculation model.
(() => {
  const DAY_MS = 86400000;
  const AUDIOBOOKS = 'Audiobooks';

  const monthDays = (year, month) => [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];

  const parse = (value) => {
    // The desktop bundle accepts non-padded month and day numbers.
    const match = typeof value === 'string' && /^(\d{4})-(\d{1,2})-(\d{1,2})$/.exec(value);
    if (!match) throw new Error(`Invalid date: ${value}`);
    const year = Number(match[1]), month = Number(match[2]), day = Number(match[3]);
    if (month < 1 || month > 12 || day < 1 || day > monthDays(year, month)) throw new Error(`Invalid date: ${value}`);
    return Math.round(Date.UTC(year, month - 1, day) / DAY_MS);
  };
  const iso = (day) => new Date(day * DAY_MS).toISOString().slice(0, 10);
  const total = (items) => items.reduce((sum, item) => sum + item, 0);

  // Rest-day ranges are validated, sorted and merged exactly like the desktop app.
  const normalizeRestDays = (ranges) => {
    const parsed = (ranges || []).map((range) => {
      const start = parse(range.start ?? range.start_date);
      const end = parse(range.end ?? range.end_date);
      if (end < start) throw new Error('A rest-day end date must be on or after its start date.');
      return { start, end };
    }).sort((a, b) => a.start - b.start);
    const merged = [];
    for (const range of parsed) {
      const last = merged[merged.length - 1];
      if (!last || range.start > last.end + 1) merged.push({ ...range });
      else last.end = Math.max(last.end, range.end);
    }
    return merged;
  };

  const availableDays = (start, end, restDays = []) => {
    const days = [];
    for (let day = start; day <= end; day += 1) {
      if (!restDays.some((range) => range.start <= day && day <= range.end)) days.push(day);
    }
    return days;
  };

  const availableReadingDays = (startIso, endIso, restDays) => {
    const start = parse(startIso), end = parse(endIso);
    if (end < start) return [];
    return availableDays(start, end, normalizeRestDays(restDays)).map(iso);
  };

  const count = (book, key, fallback) => (book[key] == null ? fallback : Number(book[key]));

  // Physical and digital books use pages; audiobooks use seconds.
  const units = (book, audio) => {
    const start = audio ? count(book, 'start_time_seconds', 0) : count(book, 'start_page', 1);
    const end = audio
      ? count(book, 'end_time_seconds', count(book, 'duration_seconds', count(book, 'pages', 0)))
      : count(book, 'end_page', count(book, 'pages', 0));
    const work = Math.max(0, end - start + (audio ? 0 : 1));
    let current = audio ? (book.remaining_time_seconds != null ? end - Number(book.remaining_time_seconds) : book.current_time_seconds) : book.current_page;
    if (current == null) {
      const read = count(book, audio ? 'time_listened_seconds' : 'pages_read', 0);
      current = read > 0 ? start + read - (audio ? 0 : 1) : null;
    }
    const completed = current == null ? 0 : Math.min(Math.max(Number(current) - start + (audio ? 0 : 1), 0), work);
    return { total: work, completed, remaining: work - completed };
  };

  const sectionsFromBooksFile = (booksFile) => (booksFile.sections || []).map((section) => {
    const label = String(section.label).trim();
    const audio = label === AUDIOBOOKS;
    const books = (section.books || []).map((book, index) => ({
      number: index + 1,
      id: String(book.id).trim(),
      title: typeof book.title === 'string' ? book.title : String(book.title ?? ''),
      audio,
      baseline: book.baseline_schedule,
      ...units(book, audio),
    }));
    const numbers = new Map(books.map((book) => [book.id, book.number]));
    const groups = (section.simultaneous_groups || []).map((group) => group
      .map((item) => (typeof item === 'string' && numbers.has(item.trim()) ? numbers.get(item.trim()) : Number(item)))
      .sort((a, b) => a - b));
    return { label, audio, books, groups };
  });

  // Books are scheduled in order at the section's pace; groups share a start and deadline.
  const calculateDeadlines = (section, start, end, dailyPace, restDays) => {
    const groupByFirst = new Map(section.groups.map((group) => [group[0], group]));
    const grouped = new Set(section.groups.flat());
    const byNumber = new Map(section.books.map((book) => [book.number, book]));
    const readingDays = availableDays(start, end, restDays);
    const deadlines = [];
    let cumulativeWork = 0, previousDays = 0;
    for (const book of section.books) {
      if (grouped.has(book.number) && !groupByFirst.has(book.number)) continue;
      const group = groupByFirst.get(book.number) || [book.number];
      const groupBooks = group.map((number) => byNumber.get(number));
      const groupWork = total(groupBooks.map((item) => item.total));
      cumulativeWork += groupWork;
      const cumulativeDays = dailyPace <= 0 || cumulativeWork === 0 ? previousDays : Math.max(1, Math.ceil(cumulativeWork / dailyPace - 1e-9));
      const allocated = cumulativeDays - previousDays;
      const deadline = readingDays.length ? readingDays[Math.min(cumulativeDays, readingDays.length) - 1] : end;
      const groupStart = readingDays.length ? (allocated === 0 ? deadline : readingDays[previousDays]) : end;
      for (const member of groupBooks) {
        const work = member.total;
        let dailyPages = 0;
        if (work > 0 && groupWork > 0) dailyPages = groupBooks.length === 1 ? dailyPace : dailyPace * work / groupWork;
        deadlines.push({ book: member, start: groupStart, deadline, dailyPages, status: deadline < end ? 'before end' : deadline === end ? 'on end date' : 'after end' });
      }
      previousDays = cumulativeDays;
    }
    return deadlines;
  };

  // Baseline dates ignore rest days; rest days only reduce the days available for each target.
  const restAdjustedTargets = (section, deadlines, restDays) => {
    const groupOf = new Map();
    for (const group of section.groups) for (const number of group) groupOf.set(number, group);
    const byNumber = new Map(section.books.map((book) => [book.number, book]));
    const targets = new Map();
    for (const deadline of deadlines) {
      const group = groupOf.get(deadline.book.number) || [deadline.book.number];
      const groupBooks = group.map((number) => byNumber.get(number));
      const groupWork = total(groupBooks.map((book) => book.total));
      const groupDays = availableDays(deadline.start, deadline.deadline, restDays).length;
      const groupPace = groupWork && groupDays ? groupWork / groupDays : 0;
      const work = deadline.book.total;
      targets.set(deadline.book.number, groupWork && work ? groupPace * work / groupWork : 0);
    }
    return targets;
  };

  const calculateBaselines = (sections, startIso, endIso, restDays) => {
    const start = parse(startIso), end = parse(endIso);
    if (end < start) throw new Error('The plan finish date is before its start date.');
    const rest = normalizeRestDays(restDays);
    const baselines = {};
    for (const section of sections) {
      if (!section.books.length) continue;
      const periodDays = availableDays(start, end).length;
      const work = total(section.books.map((book) => book.total));
      const dailyPace = periodDays ? work / periodDays : 0;
      const deadlines = calculateDeadlines(section, start, end, dailyPace, []);
      const targets = restAdjustedTargets(section, deadlines, rest);
      for (const deadline of deadlines) {
        baselines[deadline.book.id] = {
          startDate: iso(deadline.start),
          deadline: iso(deadline.deadline),
          dailyTarget: targets.get(deadline.book.number),
        };
      }
    }
    return baselines;
  };

  // Current required pace only reads the saved baseline; it never changes it.
  const requiredPace = (sections, baselines, todayIso, restDays) => {
    const today = parse(todayIso);
    const rest = normalizeRestDays(restDays);
    const pace = {};
    for (const section of sections) {
      for (const book of section.books) {
        const baseline = baselines[book.id];
        if (!baseline) continue;
        const start = parse(baseline.startDate), deadline = parse(baseline.deadline);
        const candidate = Math.min(Math.max(start, today), deadline);
        const readingDays = availableDays(candidate, deadline, rest);
        const days = readingDays.length ? availableDays(readingDays[0], deadline, rest).length : 0;
        pace[book.id] = book.remaining && days ? book.remaining / days : 0;
      }
    }
    return pace;
  };

  const stateFromBundle = (planFile, booksFile) => {
    const sections = sectionsFromBooksFile(booksFile);
    const baselines = {};
    let complete = true;
    for (const section of sections) {
      for (const book of section.books) {
        const saved = book.baseline;
        if (saved && saved.start_date && saved.deadline && Number.isFinite(Number(saved.daily_target))) {
          baselines[book.id] = { startDate: saved.start_date, deadline: saved.deadline, dailyTarget: Number(saved.daily_target) };
        } else {
          complete = false;
        }
      }
    }
    let restDays;
    try {
      restDays = normalizeRestDays(planFile.rest_days).map((range) => ({ start: iso(range.start), end: iso(range.end) }));
    } catch {
      restDays = [];
    }
    return {
      version: 1,
      startDate: planFile.start_date,
      endDate: planFile.end_date,
      restDays,
      baselines,
      needsRecalculation: !complete,
    };
  };

  window.ReadingSchedule = {
    sectionsFromBooksFile,
    normalizeRestDays,
    availableReadingDays,
    calculateBaselines,
    requiredPace,
    stateFromBundle,
    iso,
    today: () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },
  };
})();
