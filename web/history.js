// Canonical session-chain math shared by imports and offline history edits.
window.parseReadingUnits = (text, audio) => {
  const value = String(text).trim();
  let number;
  if (/^\d+$/.test(value)) number = Number(value);
  else if (audio && /^\d+:\d{2}(?::\d{2})?$/.test(value)) {
    const [hours, minutes, seconds = 0] = value.split(':').map(Number);
    if (minutes >= 60 || seconds >= 60) throw new Error('Use HH:MM or HH:MM:SS with minutes and seconds below 60.');
    number = hours * 3600 + minutes * 60 + seconds;
  }
  if (!Number.isSafeInteger(number) || number < 0) throw new Error(audio ? 'Use whole seconds, HH:MM or HH:MM:SS.' : 'Use whole page numbers.');
  return number;
};
window.formatReadingTime = (value) => {
  const seconds = Math.max(0, Math.round(value));
  return `${Math.floor(seconds / 3600)}:${String(Math.floor(seconds / 60) % 60).padStart(2, '0')}:${String(seconds % 60).padStart(2, '0')}`;
};
window.recalculateReadingHistory = (book, sessions, label, sort = true) => {
  const audio = label.trim() === 'Audiobooks';
  const start = Number(audio ? book.start_time_seconds ?? 0 : book.start_page ?? 1);
  const end = Number(audio ? book.end_time_seconds ?? book.duration_seconds : book.end_page ?? book.pages);
  const currentKey = audio ? 'current_time_seconds' : 'current_page';
  const amountKey = audio ? 'time_listened_seconds' : 'pages_read';
  let previousPosition = start - (audio ? 0 : 1);
  const positions = new Map();
  for (const session of sessions) {
    let current = audio && session.remaining_time_seconds != null ? end - session.remaining_time_seconds : session[currentKey];
    if (current == null) current = previousPosition + Number(session[amountKey] ?? session.pages ?? session.pages_read);
    positions.set(session, Number(current));
    if (!session.deleted) previousPosition = Math.max(previousPosition, Number(current));
  }
  const ordered = [...sessions].sort((a, b) => window.ReadingSchedule.parseDate(a.date) - window.ReadingSchedule.parseDate(b.date)
    || positions.get(a) - positions.get(b) || String(a.id).localeCompare(String(b.id)));
  let previous = start - (audio ? 0 : 1), changed = false;
  const seen = new Map();
  const deleted = new Set(sessions.filter((session) => session.deleted === true).map((session) => session.id.trim()));
  for (const session of ordered) {
    if (deleted.has(session.id.trim())) continue;
    const current = positions.get(session);
    const amount = seen.get(session.id.trim()) ?? current - previous;
    if (!Number.isSafeInteger(current) || current < start || current > end || amount <= 0) throw new Error('Reading sessions must advance in date order within the book range.');
    if (session[amountKey] !== amount) { session[amountKey] = amount; changed = true; }
    if (sort) {
      session[currentKey] = current;
      if (audio) session.remaining_time_seconds = end - current;
    }
    seen.set(session.id.trim(), amount);
    previous = current;
  }
  if (sort || changed) sessions.splice(0, sessions.length, ...ordered);
  // An imported book may have progress without any recorded history.
  if (sort && sessions.length) {
    const current = seen.size ? previous : null;
    book[currentKey] = current;
    book[amountKey] = current == null ? 0 : current - start + (audio ? 0 : 1);
    if (audio) book.remaining_time_seconds = current == null ? null : end - current;
  }
  return changed;
};
