// Native-style reading charts and focused metrics; calculations never write plan state.
(() => {
  const { parseDate, iso, availableReadingDays, units } = window.ReadingSchedule;
  const all = document.querySelector('#charts-all');
  const chartContainer = document.querySelector('#charts');
  const dialog = document.querySelector('#metrics-dialog');
  const content = document.querySelector('#metrics-content');
  let nextMetrics = false;
  const text = (tag, value) => { const element = document.createElement(tag); element.textContent = value; return element; };
  const svgElement = (tag, attributes = {}, value = '') => {
    const element = document.createElementNS('http://www.w3.org/2000/svg', tag);
    for (const [key, item] of Object.entries(attributes)) element.setAttribute(key, item);
    element.textContent = value;
    return element;
  };
  const chart = (book, label, sessions, state) => {
    const today = window.ReadingSchedule.today(), day = parseDate(today);
    const audio = label.trim() === 'Audiobooks';
    const progress = units(book, audio);
    const forecast = window.ReadingProjection.forecast({ book, sectionLabel: label, sessions, restDays: state.restDays, today });
    const baseline = state.baselines[String(book.id).trim()];
    const scheduledStart = parseDate(baseline?.startDate || state.startDate);
    const deadline = parseDate(baseline?.deadline || state.endDate);
    const start = Math.max(day - 3660, Math.min(scheduledStart, day));
    const horizon = parseDate(forecast.horizon);
    const end = Math.max(start + 1, Math.min(horizon, Math.max(deadline, day,
      forecast.projectedDeadline ? parseDate(forecast.projectedDeadline) : forecast.pace > 0 ? horizon : day,
      forecast.latestDeadline ? parseDate(forecast.latestDeadline) : day)));
    const reading = new Set(availableReadingDays(iso(start), iso(end), state.restDays));
    const ordered = sessions.filter((session) => !session.deleted && parseDate(session.date) <= day)
      .sort((a, b) => parseDate(a.date) - parseDate(b.date));
    const from = Number(audio ? book.start_time_seconds || 0 : book.start_page ?? 1);
    const endPosition = Number(audio ? book.end_time_seconds ?? book.duration_seconds : book.end_page ?? book.pages);
    const actualOn = (date) => Math.max(0, ...ordered.filter((session) => parseDate(session.date) <= date).map((session) =>
      (audio ? session.current_time_seconds ?? endPosition - session.remaining_time_seconds : session.current_page) - from + (audio ? 0 : 1)));
    const dailyRead = new Map();
    for (const session of ordered) dailyRead.set(parseDate(session.date), (dailyRead.get(parseDate(session.date)) || 0) + Number(audio ? session.time_listened_seconds : session.pages_read));
    const initialDays = scheduledStart < start ? availableReadingDays(iso(scheduledStart), iso(start - 1), state.restDays).length : 0;
    let plannedDays = initialDays, forecastDays = 0;
    const data = [];
    let daysRemaining = availableReadingDays(iso(Math.max(start, scheduledStart)), iso(Math.max(start, deadline)), state.restDays).length;
    for (let date = start; date <= end; date += 1) {
      const isReading = reading.has(iso(date));
      if (date >= scheduledStart && isReading) plannedDays += 1;
      if (date > day && isReading) forecastDays += 1;
      const actual = date < day ? actualOn(date) : forecast.completed;
      const required = date > deadline ? -1 : date < day ? dailyRead.get(date) || 0
        : date >= scheduledStart && isReading && daysRemaining ? Math.ceil((progress.total - actual) / daysRemaining - 1e-9) : 0;
      data.push({ date, planned: date > deadline ? progress.total : Math.min(progress.total, Math.ceil((baseline?.dailyTarget || 0) * plannedDays - 1e-9)),
        actual: date <= day ? actual : -1, required,
        projection: date >= day ? forecast.centralAt(forecastDays) : -1,
        lower: date >= day ? forecast.lowerAt(forecastDays) : -1, upper: date >= day ? forecast.upperAt(forecastDays) : -1 });
      if (date >= scheduledStart && date <= deadline && isReading) daysRemaining -= 1;
    }
    const figure = document.createElement('figure');
    figure.append(text('figcaption', `${label}: ${book.title} — ${baseline ? `${baseline.startDate} to ${baseline.deadline}` : 'No baseline calculated'}`));
    const svg = svgElement('svg', { viewBox: '0 0 640 310', role: 'img', 'aria-label': `Reading chart for ${book.title}` });
    svg.append(svgElement('desc', {}, `Plan, actual progress, read/required per day, central projection and approximate 80% range. ${forecast.projectionLabel}. ${forecast.rangeLabel}.`));
    const x = (date) => 65 + (date - start) / (end - start) * 500;
    const maxDaily = Math.max(1, ...data.map((item) => item.required));
    const y = (value, maximum = Math.max(1, progress.total)) => 245 - value / maximum * 190;
    for (let step = 0; step <= 4; step += 1) {
      const value = progress.total * step / 4;
      svg.append(svgElement('line', { x1: 65, x2: 565, y1: y(value), y2: y(value), stroke: '#c8d2ce' }),
        svgElement('text', { x: 60, y: y(value) + 4, 'text-anchor': 'end', 'font-size': 11 }, audio ? window.formatReadingTime(value) : formatUnits(value)),
        svgElement('text', { x: 570, y: y(value) + 4, 'font-size': 11 }, audio ? window.formatReadingTime(maxDaily * step / 4) : formatUnits(maxDaily * step / 4)));
    }
    const points = (key, values = data, maximum) => values.filter((item) => item[key] >= 0).map((item) => `${x(item.date)},${y(item[key], maximum)}`).join(' ');
    const band = data.filter((item) => item.lower >= 0 && item.upper >= 0);
    if (band.length) svg.append(svgElement('polygon', { points: `${points('upper', band)} ${points('lower', [...band].reverse())}`, fill: '#7c3aed', opacity: .15 }));
    for (const [key, color, maximum] of [['planned', '#8c6b50'], ['actual', '#15803d'], ['required', '#2563eb', maxDaily], ['projection', '#7c3aed']]) {
      svg.append(svgElement('polyline', { points: points(key, data, maximum), fill: 'none', stroke: color, 'stroke-width': 2, ...(key === 'projection' ? { 'stroke-dasharray': '5 4' } : {}) }));
    }
    svg.append(svgElement('line', { x1: x(day), x2: x(day), y1: 50, y2: 245, stroke: '#475569', 'stroke-dasharray': '3 3' }),
      svgElement('text', { x: Math.min(530, x(day)), y: 45, 'font-size': 12 }, 'Today'),
      svgElement('text', { x: 65, y: 270, 'font-size': 12 }, iso(start)),
      svgElement('text', { x: 565, y: 270, 'text-anchor': 'end', 'font-size': 12 }, iso(end)));
    for (const [index, [label, color]] of [['Plan', '#8c6b50'], ['Actual', '#15803d'], ['Read / required', '#2563eb'], ['Projection / 80% range', '#7c3aed']].entries()) {
      svg.append(svgElement('text', { x: 20 + index * 150, y: 20, fill: color, 'font-size': 12 }, label));
    }
    svg.append(svgElement('text', { x: 65, y: 295, 'font-size': 12 }, `${audio ? 'Time' : 'Pages'} (left); ${audio ? 'time' : 'pages'}/day (right)`));
    figure.append(svg, text('p', `${forecast.projectionLabel}. ${forecast.rangeLabel}.`));
    if (start > scheduledStart || end < deadline) figure.append(text('p', 'Chart display is limited to ten years around today.'));
    return figure;
  };

  window.renderCharts = () => {
    const bundle = readBundleData();
    const figures = [];
    if (bundle) {
      const state = scheduleState || loadSchedule(bundle);
      for (const section of bundle.books.sections) for (const book of section.books) {
        const progress = units(book, section.label.trim() === 'Audiobooks');
        if (progress.total > 0 && (all.getAttribute('aria-pressed') === 'true' || (progress.completed > 0 && progress.remaining > 0))) {
          figures.push(chart(book, section.label, bundle.sessions[String(book.id).trim()] || [], state));
        }
      }
    }
    chartContainer.replaceChildren(...(figures.length ? figures : [text('p', bundle ? 'No currently reading books. Turn on All to see all books.' : 'Import a bundle to see charts.')]));
    if (dialog.open) renderMetrics();
  };
  all.addEventListener('click', () => { all.setAttribute('aria-pressed', String(all.getAttribute('aria-pressed') !== 'true')); window.renderCharts(); });

  const table = (name, rows, headers = ['Metric', 'Value']) => {
    const result = document.createElement('table'); result.setAttribute('aria-label', name);
    result.append(text('caption', name));
    const head = document.createElement('tr');
    for (const label of headers) { const cell = text('th', label); cell.scope = 'col'; head.append(cell); }
    const thead = document.createElement('thead'); thead.append(head); result.append(thead);
    const body = document.createElement('tbody');
    for (const row of rows) { const tr = document.createElement('tr'); for (const value of row) tr.append(text('td', String(value))); body.append(tr); }
    result.append(body); return result;
  };
  const action = (label, callback) => { const button = text('button', label); button.type = 'button'; button.addEventListener('click', callback); return button; };
  const metricData = () => {
    const bundle = readBundleData();
    if (!bundle) return null;
    const planned = window.ReadingQuarter.plannedFromBundle(bundle.books);
    const activated = nextMetrics && planned ? window.ReadingQuarter.activate(bundle.books, planned.startDate) : null;
    const state = activated ? { startDate: activated.start, endDate: activated.end, restDays: (scheduleState || loadSchedule(bundle)).restDays.filter((range) => range.end >= activated.start) } : scheduleState || loadSchedule(bundle);
    const sections = window.ReadingSchedule.sectionsFromBooksFile(activated ? { sections: activated.sections } : bundle.books);
    const start = nextMetrics && activated ? state.startDate : iso(Math.min(parseDate(state.endDate), Math.max(parseDate(state.startDate), parseDate(window.ReadingSchedule.today()))));
    const days = availableReadingDays(start, state.endDate, state.restDays).length;
    const totals = sections.map((section) => ({ label: section.label, count: section.books.length, remaining: section.books.reduce((sum, book) => sum + book.remaining, 0) }));
    return { bundle, planned, state, sections, totals, days, baselines: activated ? window.ReadingSchedule.calculateBaselines(sections, state.startDate, state.endDate, state.restDays, true) : state.baselines };
  };
  const renderMetrics = (detail = '') => {
    content.replaceChildren();
    const data = metricData();
    content.append(text('h2', `${detail || 'Metrics'}${nextMetrics ? ' — Next plan' : ''}`));
    if (!data) { content.append(text('p', 'Import a bundle to see metrics.')); return; }
    const { state, totals, days } = data;
    const physical = totals.find((item) => item.label === 'Physical books'), digital = totals.find((item) => item.label === 'Digital books'), audio = totals.find((item) => item.label === 'Audiobooks');
    const remaining = physical.remaining + digital.remaining;
    const highest = days ? Math.max(physical.remaining, digital.remaining) / days : 0;
    if (data.planned) content.append(action(nextMetrics ? 'Show current plan' : 'Show next plan', () => { nextMetrics = !nextMetrics; renderMetrics(); }));
    if (!detail) {
      const rows = data.sections.flatMap((section) => section.books.map((book) => [section.label, book.title, book.remaining, data.baselines[book.id]?.startDate || 'Not scheduled', data.baselines[book.id]?.deadline || 'Not scheduled']));
      content.append(table('Book schedules', rows, ['Format', 'Book', 'Left', 'Start', 'Deadline']));
      for (const label of ['Summary metrics', 'Schedule information', 'Key metrics']) content.append(action(label, () => renderMetrics(label)));
      return;
    }
    content.append(action('Back to metrics', () => renderMetrics()));
    let rows = [];
    if (detail === 'Key metrics') rows = [['Remaining pages', remaining], ['Audiobook remaining time', window.formatReadingTime(audio.remaining)], ['Reading days', days], ['Highest daily pace', `${formatUnits(highest)} pages/day`], ['Status', days || !totals.some((item) => item.remaining) ? 'Achievable at required pace' : 'No reading days available']];
    if (detail === 'Schedule information') rows = [['Plan period', `${state.startDate} to ${state.endDate}`], ...totals.map((item) => [item.label, `${item.label === 'Audiobooks' ? window.formatReadingTime(days ? item.remaining / days : 0) : formatUnits(days ? item.remaining / days : 0)} / day`])];
    if (detail === 'Summary metrics') {
      const options = data.bundle.plan.stats_options || {};
      if (options.book_counts !== false) rows.push(['Physical book count', physical.count], ['Digital book count', digital.count], ['Audiobook count', audio.count]);
      if (options.page_share !== false) rows.push(['Physical page share', `${(remaining ? physical.remaining / remaining * 100 : 0).toFixed(1)}%`], ['Digital page share', `${(remaining ? digital.remaining / remaining * 100 : 0).toFixed(1)}%`]);
      if (options.average_pages !== false) rows.push(['Physical average pages/book', (physical.count ? physical.remaining / physical.count : 0).toFixed(1)], ['Digital average pages/book', (digital.count ? digital.remaining / digital.count : 0).toFixed(1)], ['Audiobook average duration', window.formatReadingTime(audio.count ? audio.remaining / audio.count : 0)]);
      if (options.reading_period !== false) rows.push(['Reading period', `${availableReadingDays(state.startDate, state.endDate, state.restDays).length} days`]);
      if (options.pace_driver !== false) rows.push(['Pace driver', `${[physical, digital].filter((item) => item.remaining > 0 && days && Math.abs(item.remaining / days - highest) < 1e-9).map((item) => item.label).join(', ') || 'None'} (${highest.toFixed(2)} pages/day)`]);
    }
    content.append(table(detail, rows));
  };
  document.querySelector('#metrics-open').addEventListener('click', () => { nextMetrics = false; renderMetrics(); dialog.showModal(); });
  document.querySelector('#metrics-close').addEventListener('click', () => dialog.close());
  window.renderCharts();
})();
