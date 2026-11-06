// History-based reading projections for the web app, mirroring the Android forecast.
// See docs/reading-projections.md for assumptions and limits.
(() => {
  const DAY_MS = 86400000;
  const AUDIOBOOKS = 'Audiobooks';
  const MIN_OBSERVATION_DAYS = 7;
  const HORIZON_YEARS = 10;
  const { parseDate, iso, normalizeRestDays, units } = window.ReadingSchedule;

  const monthDays = (year, month) => [31, year % 4 === 0 && (year % 100 !== 0 || year % 400 === 0) ? 29 : 28, 31, 30, 31, 30, 31, 31, 30, 31, 30, 31][month - 1];
  const pad = (value) => String(value).padStart(2, '0');

  // Calendar-year arithmetic without letting 29 February roll into March.
  const addYears = (day, years) => {
    const date = new Date(day * DAY_MS);
    const year = date.getUTCFullYear() + years;
    if (year > 9999) return parseDate('9999-12-31');
    const month = date.getUTCMonth() + 1;
    return parseDate(`${String(year).padStart(4, '0')}-${month}-${Math.min(date.getUTCDate(), monthDays(year, month))}`);
  };

  const dateLabel = (day, todayYear) => {
    const date = new Date(day * DAY_MS);
    const text = `${pad(date.getUTCDate())}/${pad(date.getUTCMonth() + 1)}`;
    return date.getUTCFullYear() === todayYear ? text : `${text}/${date.getUTCFullYear()}`;
  };

  const studentT80 = (degreesOfFreedom) => {
    // Cornish-Fisher approximation to t(0.90), used only with >= 6 degrees of freedom.
    const z = 1.2815515655446004;
    const z2 = z * z;
    const df = degreesOfFreedom;
    return z + z * (z2 + 1) / (4 * df)
      + z * (5 * z2 * z2 + 16 * z2 + 3) / (96 * df * df)
      + z * (3 * z2 * z2 * z2 + 19 * z2 * z2 + 17 * z2 - 15) / (384 * df * df * df);
  };

  const sessionPosition = (session, audio, start, end) => {
    if (audio) {
      if (session.current_time_seconds != null) return Number(session.current_time_seconds);
      if (session.remaining_time_seconds != null) return end - Number(session.remaining_time_seconds);
      return session.current_page == null ? null : Number(session.current_page);
    }
    return session.current_page == null ? null : Number(session.current_page);
  };

  const forecast = ({ book, sectionLabel, sessions = [], restDays = [], today }) => {
    const audio = String(sectionLabel).trim() === AUDIOBOOKS;
    const start = audio ? Number(book.start_time_seconds ?? 0) : Number(book.start_page ?? 1);
    const { total, completed: bookCompleted } = units(book, audio);
    const end = audio ? start + total : start + total - 1;
    const offset = audio ? 0 : 1;
    const todayDay = parseDate(today);
    const rest = normalizeRestDays(restDays);
    const isRest = (day) => rest.some((range) => range.start <= day && day <= range.end);

    // Use the whole recorded history; ignore deleted and future-dated sessions.
    const positions = new Map();
    let futureSessions = false;
    for (const session of sessions || []) {
      if (!session || session.deleted) continue;
      const day = parseDate(session.date);
      if (day > todayDay) {
        futureSessions = true;
        continue;
      }
      const position = sessionPosition(session, audio, start, end);
      if (position == null || Number.isNaN(position)) continue;
      const value = Math.max(0, Math.min(total, position - start + offset));
      positions.set(day, Math.max(positions.get(day) ?? 0, value));
    }
    const days = [...positions.keys()].sort((left, right) => left - right);
    let previous = 0;
    for (const day of days) {
      previous = Math.max(previous, positions.get(day));
      positions.set(day, previous);
    }
    // A future-dated log must not move today's forecast anchor into the future.
    const completed = Math.max(0, Math.min(total, futureSessions ? previous : Math.max(previous, bookCompleted)));

    let count = 0;
    let mean = 0;
    let squaredDifferences = 0;
    if (days.length) {
      let prior = positions.get(days[0]);
      // The first day's position is a baseline, not evidence of one enormous reading day.
      for (let day = days[0] + 1; day < todayDay; day += 1) {
        const position = positions.get(day) ?? prior;
        const amount = position - prior;
        prior = position;
        if (!isRest(day) || amount > 0) {
          count += 1;
          const difference = amount - mean;
          mean += difference / count;
          squaredDifferences += difference * (amount - mean);
        }
      }
    }
    const observationDays = count;
    const pace = mean;
    const variance = count < 2 ? 0 : Math.max(0, squaredDifferences / (count - 1));
    const rangeAvailable = completed < total && pace > 0 && count >= MIN_OBSERVATION_DAYS;
    const criticalValue = rangeAvailable ? studentT80(count - 1) : 0;

    const progressAt = (readingDays, direction) => {
      // Predict future daily variation AND uncertainty about the learned mean, not just a confidence interval for pace.
      const width = criticalValue * Math.sqrt(
        variance * (readingDays + (readingDays * readingDays) / Math.max(1, observationDays)),
      );
      const value = Math.max(completed, Math.min(total, completed + pace * readingDays + direction * width));
      if (value >= total - 1e-9) return total;
      // Integer display rounding must not claim completion before the underlying forecast does.
      return Math.min(total - 1, direction > 0 ? Math.ceil(value - 1e-9) : Math.floor(value + 1e-9));
    };
    const centralAt = (readingDays) => (pace > 0 || completed >= total ? progressAt(readingDays, 0) : -1);
    const lowerAt = (readingDays) => (rangeAvailable ? progressAt(readingDays, -1) : -1);
    const upperAt = (readingDays) => (rangeAvailable ? progressAt(readingDays, 1) : -1);

    // Bound remote forecasts to ten years and the supported calendar range.
    const todayYear = new Date(todayDay * DAY_MS).getUTCFullYear();
    const horizonLimited = todayYear + HORIZON_YEARS > 9999;
    const horizon = addYears(todayDay, HORIZON_YEARS);
    const finiteLatest = rangeAvailable && pace > criticalValue * Math.sqrt(variance / observationDays);
    let central = completed >= total ? todayDay : null;
    let earliest = null;
    let latest = null;
    let readingDays = 0;
    if (pace > 0 && completed < total) {
      for (let day = todayDay + 1; day <= horizon; day += 1) {
        if (isRest(day)) continue;
        readingDays += 1;
        if (central == null && centralAt(readingDays) >= total) central = day;
        if (rangeAvailable) {
          if (earliest == null && upperAt(readingDays) >= total) earliest = day;
          if (finiteLatest && latest == null && lowerAt(readingDays) >= total) latest = day;
        }
        if (central != null && (!rangeAvailable || (earliest != null && (!finiteLatest || latest != null)))) break;
      }
    }

    const label = (day) => dateLabel(day, todayYear);
    const projectionLabel = `Projection · est. end date: ${
      central == null ? (pace > 0 ? (horizonLimited ? 'beyond supported date range' : 'beyond 10 years') : '—') : label(central)}`;
    let rangeLabel;
    if (completed >= total) {
      rangeLabel = 'Book finished — no future uncertainty';
    } else if (count < MIN_OBSERVATION_DAYS) {
      rangeLabel = `Estimated finish range: Not enough history (${count}/${MIN_OBSERVATION_DAYS} reading days)`;
    } else if (pace <= 0) {
      rangeLabel = 'Estimated finish range: Not enough reading progress';
    } else if (earliest == null) {
      rangeLabel = `Estimated finish range: ${horizonLimited ? 'beyond supported date range' : 'beyond 10-year forecast horizon'}`;
    } else if (latest == null) {
      rangeLabel = `Estimated finish range: ${label(earliest)} onward; latest finish uncertain`;
    } else {
      rangeLabel = `Estimated finish range: ${label(earliest)}–${label(latest)}`;
    }

    return {
      completed,
      total,
      observationDays,
      pace,
      variance,
      rangeAvailable,
      horizon: iso(horizon),
      projectedDeadline: central == null ? null : iso(central),
      earliestDeadline: earliest == null ? null : iso(earliest),
      latestDeadline: latest == null ? null : iso(latest),
      projectionLabel,
      rangeLabel,
      centralAt,
      lowerAt,
      upperAt,
    };
  };

  window.ReadingProjection = { forecast, MIN_OBSERVATION_DAYS };
})();
