// Next-quarter planning and rollover for the web app, mirroring the desktop app.
(() => {
  const LABELS = ['Physical books', 'Digital books', 'Audiobooks'];
  const AUDIOBOOKS = LABELS[2];
  const { parseDate, iso } = window.ReadingSchedule;

  const utcDay = (year, month, day) => {
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    return date.getTime() / 86400000;
  };
  const quarterIso = (day) => {
    const year = new Date(day * 86400000).getUTCFullYear();
    if (year < 1 || year > 9999) throw new RangeError('Quarter date must be within years 0001–9999.');
    return iso(day);
  };

  const nextQuarterStart = (afterIso) => {
    const after = parseDate(afterIso);
    const date = new Date(after * 86400000);
    const year = date.getUTCFullYear();
    for (const month of [1, 4, 7, 10]) {
      const candidate = utcDay(year, month - 1, 1);
      if (candidate > after) return quarterIso(candidate);
    }
    return quarterIso(utcDay(year + 1, 0, 1));
  };

  const quarterStart = (dayIso) => {
    const date = new Date(parseDate(dayIso) * 86400000);
    return quarterIso(utcDay(date.getUTCFullYear(), Math.floor(date.getUTCMonth() / 3) * 3, 1));
  };

  const periodEnd = (startIso) => {
    const date = new Date(parseDate(startIso) * 86400000);
    return quarterIso(utcDay(date.getUTCFullYear(), date.getUTCMonth() + 3, 1) - 1);
  };

  const isQuarterStart = (value) => {
    try {
      const date = new Date(parseDate(value) * 86400000);
      return date.getUTCDate() === 1 && [0, 3, 6, 9].includes(date.getUTCMonth());
    } catch {
      return false;
    }
  };

  const blankSections = () => LABELS.map((label) => ({
    label,
    baseline_needs_recalculation: false,
    books: [],
    simultaneous_groups: [],
  }));

  // New planned books carry no progress, so their history stays empty until the quarter starts.
  const newBook = (label, title, start, end) => {
    const audio = label === AUDIOBOOKS;
    return {
      id: crypto.randomUUID(),
      number: 1,
      title,
      baseline_schedule: null,
      deadline_override: null,
      start_date_override: null,
      target_completed_date: null,
      ...(audio ? {
        start_time_seconds: start,
        end_time_seconds: end,
        current_time_seconds: null,
        duration_seconds: end - start,
        time_listened_seconds: 0,
        remaining_time_seconds: null,
      } : {
        start_page: start,
        end_page: end,
        current_page: null,
        pages: end - start + 1,
        pages_read: 0,
      }),
    };
  };

  const plannedFromBundle = (booksFile) => {
    const planned = booksFile && booksFile.planned_quarter;
    if (!planned || typeof planned !== 'object') return null;
    return {
      startDate: String(planned.start_date),
      sections: blankSections().map((section) => {
        const saved = (planned.sections || []).find((item) => String(item.label).trim() === section.label);
        return {
          label: section.label,
          books: (saved?.books || []).map((book) => ({ ...book })),
          simultaneous_groups: (saved?.simultaneous_groups || []).map((group) => [...group]),
        };
      }),
    };
  };

  // Planned books are numbered in order and never carry reading history.
  const plannedToJson = (planned) => ({
    start_date: planned.startDate,
    sections: planned.sections.map((section) => ({
      label: section.label,
      baseline_needs_recalculation: false,
      books: section.books.map((book, index) => {
        const value = { ...book, number: index + 1 };
        delete value.reading_sessions;
        return value;
      }),
      simultaneous_groups: (section.simultaneous_groups || []).map((group) => [...group]),
    })),
  });

  const remainingByBook = (section, label) => {
    const [normalized] = window.ReadingSchedule.sectionsFromBooksFile({ sections: [{ ...section, label }] });
    return new Map(normalized.books.map((book) => [book.id, book.remaining]));
  };

  // Unfinished books carry forward in order; finished books and their history leave the plan.
  const activate = (booksFile, todayIso) => {
    const planned = plannedFromBundle(booksFile);
    if (!planned) return null;
    if (parseDate(todayIso) < parseDate(planned.startDate)) return null;
    const start = quarterStart(todayIso);
    const sections = blankSections().map((target) => {
      const merged = { label: target.label, baseline_needs_recalculation: false, books: [], simultaneous_groups: [] };
      for (const source of [booksFile.sections || [], planned.sections]) {
        const section = source.find((item) => String(item.label).trim() === target.label) || { books: [], simultaneous_groups: [] };
        const remaining = remainingByBook(section, target.label);
        const numbers = new Map();
        for (const [index, book] of (section.books || []).entries()) {
          const id = String(book.id).trim();
          if ((remaining.get(id) ?? 0) <= 0) continue;
          const copied = { ...book, number: merged.books.length + 1 };
          numbers.set(index + 1, copied.number);
          numbers.set(id, copied.number);
          merged.books.push(copied);
        }
        for (const group of section.simultaneous_groups || []) {
          const kept = [];
          for (const entry of group) {
            const number = numbers.get(entry) ?? numbers.get(Number(entry));
            if (number != null && !kept.includes(number)) kept.push(number);
          }
          if (kept.length > 1) merged.simultaneous_groups.push(kept.map((number) => merged.books[number - 1].id));
        }
      }
      return merged;
    });
    return { sections, start, end: periodEnd(start) };
  };

  window.ReadingQuarter = {
    nextQuarterStart,
    quarterStart,
    periodEnd,
    isQuarterStart,
    blankSections,
    newBook,
    plannedFromBundle,
    plannedToJson,
    activate,
  };
})();
