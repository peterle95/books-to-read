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
      deadlineOverride: book.deadline_override == null ? null : String(book.deadline_override),
      startDateOverride: book.start_date_override == null ? null : String(book.start_date_override),
      ...units(book, audio),
    }));
    const numbers = new Map(books.map((book) => [book.id, book.number]));
    const groups = (section.simultaneous_groups || []).map((group) => group
      .map((item) => (typeof item === 'string' && numbers.has(item.trim()) ? numbers.get(item.trim()) : Number(item)))
      .sort((a, b) => a - b));
    return { label, audio, books, groups };
  });

  // A book with its own override leaves its simultaneous group for scheduling purposes.
  const activeGroups = (section) => section.groups
    .map((group) => group.filter((number) => {
      const book = section.books.find((item) => item.number === number);
      return book && !book.deadlineOverride && !book.startDateOverride;
    }))
    .filter((group) => group.length >= 2);

  const effectiveRemainingStart = (start, end, today, restDays) => {
    const candidate = Math.min(Math.max(start, today), end);
    const days = availableDays(candidate, end, restDays);
    return days.length ? days[0] : end;
  };

  // Books are scheduled in order at the section's pace; groups share a start and deadline.
  // A rollover schedules unfinished work instead of whole books and skips rest days.
  const calculateDeadlines = (section, start, end, dailyPace, groups, workOf, restDays = []) => {
    const groupByFirst = new Map(groups.map((group) => [group[0], group]));
    const grouped = new Set(groups.flat());
    const byNumber = new Map(section.books.map((book) => [book.number, book]));
    const readingDays = availableDays(start, end, restDays);
    const deadlines = [];
    let cumulativeWork = 0, previousDays = 0;
    for (const book of section.books) {
      if (grouped.has(book.number) && !groupByFirst.has(book.number)) continue;
      const group = groupByFirst.get(book.number) || [book.number];
      const groupBooks = group.map((number) => byNumber.get(number));
      const groupWork = total(groupBooks.map(workOf));
      cumulativeWork += groupWork;
      const cumulativeDays = dailyPace <= 0 || cumulativeWork === 0 ? previousDays : Math.max(1, Math.ceil(cumulativeWork / dailyPace - 1e-9));
      const allocated = cumulativeDays - previousDays;
      const deadline = readingDays.length ? readingDays[Math.min(cumulativeDays, readingDays.length) - 1] : end;
      const groupStart = readingDays.length ? (allocated === 0 ? deadline : readingDays[previousDays]) : end;
      for (const member of groupBooks) {
        const work = workOf(member);
        let dailyPages = 0;
        if (work > 0 && groupWork > 0) dailyPages = groupBooks.length === 1 ? dailyPace : dailyPace * work / groupWork;
        deadlines.push({ book: member, start: groupStart, deadline, dailyPages, status: deadline < end ? 'before end' : deadline === end ? 'on end date' : 'after end' });
      }
      previousDays = cumulativeDays;
    }
    return deadlines;
  };

  // Baseline dates ignore rest days; rest days only reduce the days available for each target.
  const restAdjustedTargets = (section, deadlines, restDays, workOf) => {
    const groupOf = new Map();
    for (const group of activeGroups(section)) for (const number of group) groupOf.set(number, group);
    const byNumber = new Map(section.books.map((book) => [book.number, book]));
    const targets = new Map();
    for (const deadline of deadlines) {
      const group = groupOf.get(deadline.book.number) || [deadline.book.number];
      const groupBooks = group.map((number) => byNumber.get(number));
      const groupWork = total(groupBooks.map(workOf));
      const groupDays = availableDays(deadline.start, deadline.deadline, restDays).length;
      const groupPace = groupWork && groupDays ? groupWork / groupDays : 0;
      const work = workOf(deadline.book);
      targets.set(deadline.book.number, groupWork && work ? groupPace * work / groupWork : 0);
    }
    return targets;
  };

  const calculateBaselines = (sections, startIso, endIso, restDays, remaining = false) => {
    const start = parse(startIso), end = parse(endIso);
    if (end < start) throw new Error('The plan finish date is before its start date.');
    const rest = normalizeRestDays(restDays);
    const baselines = {};
    for (const section of sections) {
      if (!section.books.length) continue;
      const workOf = remaining ? (book) => book.remaining : (book) => book.total;
      const periodDays = availableDays(start, end, remaining ? rest : []).length;
      const work = total(section.books.map(workOf));
      const dailyPace = periodDays ? work / periodDays : 0;
      const deadlines = calculateDeadlines(section, start, end, dailyPace, activeGroups(section), workOf, remaining ? rest : []);
      const targets = restAdjustedTargets(section, deadlines, rest, workOf);
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

  // A deadline override replaces one book's baseline without recalculating unrelated books.
  const applyDeadlineOverride = (section, baselines, book, override, planEndIso, todayIso, restDays) => {
    const baseline = baselines[book.id];
    if (!baseline) throw new Error('Calculate the schedule before setting a deadline override.');
    const today = parse(todayIso), planEnd = parse(planEndIso);
    const overrideDay = override ? parse(override) : null;
    if (overrideDay != null) {
      if (overrideDay < today) throw new Error('A deadline override cannot be before today.');
      if (overrideDay > planEnd) throw new Error('A deadline override cannot be after the plan finish date.');
    }
    const rest = normalizeRestDays(restDays);
    const containingGroup = section.groups.find((group) => group.includes(book.number)) || null;
    book.deadlineOverride = override || null;
    let deadline = planEnd;
    if (overrideDay != null) {
      deadline = overrideDay;
    } else if (containingGroup) {
      const other = containingGroup
        .map((number) => section.books.find((item) => item.number === number))
        .find((item) => item && item.id !== book.id && baselines[item.id]);
      if (other) deadline = parse(baselines[other.id].deadline);
    }
    const remaining = book.remaining;
    const paceStart = effectiveRemainingStart(parse(baseline.startDate), deadline, today, rest);
    const days = availableDays(paceStart, deadline, rest).length;
    baselines[book.id] = { startDate: iso(paceStart), deadline: iso(deadline), dailyTarget: remaining && days ? remaining / days : 0 };
    if (containingGroup) {
      const active = containingGroup.filter((number) => {
        const member = section.books.find((item) => item.number === number);
        return member && !member.deadlineOverride && !member.startDateOverride;
      });
      if (active.length >= 2) {
        const reference = baselines[section.books.find((item) => item.number === active[0]).id];
        const sharedStart = parse(reference.startDate), sharedDeadline = parse(reference.deadline);
        const groupBooks = active.map((number) => section.books.find((item) => item.number === number));
        const groupRemaining = total(groupBooks.map((item) => item.remaining));
        const groupStart = effectiveRemainingStart(sharedStart, sharedDeadline, today, rest);
        const groupDays = availableDays(groupStart, sharedDeadline, rest).length;
        const groupPace = groupRemaining && groupDays ? groupRemaining / groupDays : 0;
        for (const member of groupBooks) {
          baselines[member.id] = {
            startDate: iso(groupStart),
            deadline: iso(sharedDeadline),
            dailyTarget: groupRemaining && member.remaining ? groupPace * member.remaining / groupRemaining : 0,
          };
        }
      }
    }
    return baselines;
  };

  // Persisted overrides are reapplied after a calculation, in book order.
  const applyPersistedOverrides = (sections, baselines, planEndIso, todayIso, restDays) => {
    for (const section of sections) {
      for (const book of section.books) {
        if (book.deadlineOverride) applyDeadlineOverride(section, baselines, book, book.deadlineOverride, planEndIso, todayIso, restDays);
      }
    }
    return baselines;
  };

  const validateGroups = (books, groups) => {
    const used = new Set();
    return groups.map((group) => {
      const ids = group.map(Number).sort((a, b) => a - b);
      if (ids.length < 2) throw new Error('Choose at least two books to read together.');
      if (new Set(ids).size !== ids.length) throw new Error('Each book can appear only once in a simultaneous group.');
      if (ids[0] < 1 || ids[ids.length - 1] > books.length) throw new Error(`Book numbers must be from 1 to ${books.length}.`);
      if (ids.some((number, index) => number !== ids[0] + index)) throw new Error('Books read together must be consecutive in the section.');
      if (ids.some((number) => used.has(number))) throw new Error('A book can belong to only one simultaneous group.');
      for (const number of ids) used.add(number);
      return ids;
    });
  };

  // Local group and override edits are layered over what the imported bundle stores.
  const withLocalSettings = (sections, groups, overrides) => sections.map((section) => ({
    ...section,
    groups: groups && groups[section.label] ? groups[section.label].map((group) => group.map(Number).sort((a, b) => a - b)) : section.groups,
    books: section.books.map((book) => ({
      ...book,
      deadlineOverride: overrides && overrides[book.id] !== undefined ? overrides[book.id] : book.deadlineOverride,
    })),
  }));

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
      groups: Object.fromEntries(sections.map((section) => [section.label, section.groups.map((group) => [...group])])),
      overrides: Object.fromEntries(sections.flatMap((section) => section.books.map((book) => [book.id, book.deadlineOverride || null]))),
      baselines,
      needsRecalculation: !complete,
    };
  };

  window.ReadingSchedule = {
    sectionsFromBooksFile,
    units,
    normalizeRestDays,
    availableReadingDays,
    activeGroups,
    calculateBaselines,
    applyDeadlineOverride,
    applyPersistedOverrides,
    validateGroups,
    withLocalSettings,
    requiredPace,
    stateFromBundle,
    iso,
    parseDate: parse,
    today: () => {
      const now = new Date();
      return `${now.getFullYear()}-${String(now.getMonth() + 1).padStart(2, '0')}-${String(now.getDate()).padStart(2, '0')}`;
    },
  };
})();
