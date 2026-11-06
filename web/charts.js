// Native-style reading charts and focused metrics; calculations never write plan state.
(() => {
  const { parseDate, iso, availableReadingDays, units } = window.ReadingSchedule;
  const all = document.querySelector('#charts-all');
  const chartContainer = document.querySelector('#charts');
  const dialog = document.querySelector('#metrics-dialog');
  const content = document.querySelector('#metrics-content');
  let nextMetrics = false;
  let metricDetail = '';
  const handle = document.createElement('div');
  handle.className = 'metrics-handle';
  handle.setAttribute('aria-hidden', 'true');
  dialog.prepend(handle);
  const close = document.querySelector('#metrics-close');
  let dragStart = null;
  handle.addEventListener('pointerdown', (event) => { dragStart = event.clientY; handle.setPointerCapture(event.pointerId); });
  handle.addEventListener('pointermove', (event) => {
    if (dragStart !== null) dialog.style.transform = `translateY(${Math.max(0, event.clientY - dragStart)}px)`;
  });
  const endDrag = (event) => {
    if (dragStart === null) return;
    const distance = event.clientY - dragStart;
    dragStart = null;
    dialog.style.transform = '';
    if (event.type === 'pointerup' && distance > 120) dialog.close();
  };
  handle.addEventListener('pointerup', endDrag);
  handle.addEventListener('pointercancel', endDrag);
  let selectedBook = null;
  let showProjection = true;
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
        actual, required,
        projection: date >= day ? forecast.centralAt(forecastDays) : -1,
        lower: date >= day ? forecast.lowerAt(forecastDays) : -1, upper: date >= day ? forecast.upperAt(forecastDays) : -1 });
      if (date >= scheduledStart && date <= deadline && isReading) daysRemaining -= 1;
    }
    const figure = document.createElement('figure');
    figure.className = 'reading-chart';
    const width = Math.max(280, chartContainer.clientWidth), left = 54, right = width - 48;
    let top = 42;
    const bottom = 448;
    const svg = svgElement('svg', { class: 'reading-chart-plot', viewBox: `0 0 ${width} 500`, role: 'img', 'aria-label': `Reading chart for ${book.title}` });
    svg.style.cssText = 'display:block;width:100%;min-width:0;height:500px;';
    figure.append(svg);
    chartContainer.append(figure);
    svg.append(svgElement('desc', {}, `${audio ? 'Time (left); time/day (right)' : 'Pages (left); pages/day (right)'}. Right axis: actual daily reading before today; required pace from today through the deadline.${showProjection ? ` ${forecast.projectionLabel}. ${forecast.rangeLabel}.` : ''}`));
    if (showProjection) {
      const legend = svgElement('foreignObject', { x: left, y: 24, width: width - left - 8, height: 500 });
      const forecastLabels = document.createElementNS('http://www.w3.org/1999/xhtml', 'p');
      forecastLabels.style.cssText = 'margin:0;color:#7c3aed;font-size:11px;font-weight:400;line-height:1.18;';
      forecastLabels.append(forecast.projectionLabel, document.createElement('br'), forecast.rangeLabel);
      legend.append(forecastLabels);
      svg.append(legend);
      const legendHeight = Math.ceil(forecastLabels.getBoundingClientRect().height);
      legend.setAttribute('height', legendHeight);
      top = 50 + legendHeight;
    }
    const x = (date) => left + (date - start) / (end - start) * (right - left);
    const maxDaily = Math.max(1, ...data.map((item) => item.required));
    const y = (value, maximum = Math.max(1, progress.total)) => bottom - value / maximum * (bottom - top);
    for (let step = 0; step <= 4; step += 1) {
      const value = progress.total * step / 4;
      svg.append(svgElement('line', { x1: left, x2: right, y1: y(value), y2: y(value), stroke: '#d6baa1' }),
        svgElement('text', { x: 8, y: y(value) + 4, fill: '#6f4e37', 'font-size': 11, class: 'chart-left-tick' }, audio ? window.formatReadingTime(Math.ceil(value - 1e-9)) : String(Math.ceil(value - 1e-9))),
        svgElement('text', { x: right + 5, y: y(value) + 4, fill: '#b56b3c', 'font-size': 11, class: 'chart-right-tick' }, audio ? window.formatReadingTime(Math.ceil(maxDaily * step / 4 - 1e-9)) : String(Math.ceil(maxDaily * step / 4 - 1e-9))));
    }
    const points = (key, values = data, maximum) => values.filter((item) => item[key] >= 0).map((item) => `${x(item.date)},${y(item[key], maximum)}`).join(' ');
    const band = data.filter((item) => item.lower >= 0 && item.upper >= 0);
    if (showProjection && band.length) svg.append(svgElement('polygon', { points: `${points('upper', band)} ${points('lower', [...band].reverse())}`, fill: '#7c3aed', opacity: .19 }));
    for (const [key, color, maximum] of [['planned', '#6f4e37'], ['actual', '#3d6b4f'], ['required', '#b56b3c', maxDaily], ...(showProjection ? [['projection', '#7c3aed']] : [])]) {
      svg.append(svgElement('polyline', { points: points(key, data, maximum), fill: 'none', stroke: color, 'stroke-width': key === 'planned' ? 3 : 2, ...(key === 'projection' ? { 'stroke-dasharray': '4 4' } : key === 'required' ? { 'stroke-dasharray': '7 5' } : {}) }));
    }
    svg.append(svgElement('line', { x1: left, x2: left, y1: top, y2: bottom, stroke: '#3a241a', 'stroke-width': 2 }),
      svgElement('line', { x1: left, x2: right, y1: bottom, y2: bottom, stroke: '#3a241a', 'stroke-width': 2 }),
      svgElement('line', { x1: right, x2: right, y1: top, y2: bottom, stroke: '#b56b3c', 'stroke-width': 2 }),
      svgElement('line', { x1: x(day), x2: x(day), y1: top, y2: bottom, stroke: '#9f3a2b', 'stroke-width': 2, 'stroke-dasharray': '6 4' }),
      svgElement('text', { x: Math.max(left, Math.min(right - 35, x(day) - 17)), y: top - 10, fill: '#9f3a2b', 'font-size': 11 }, 'Today'));
    const intervals = Math.min(4, end - start);
    for (let tick = 0; tick <= intervals; tick += 1) {
      const date = start + Math.round((end - start) * tick / intervals);
      svg.append(svgElement('text', { x: Math.min(x(date) - 17, right - 34), y: bottom + 22, fill: '#6f4e37', 'font-size': 11, class: 'chart-date-label' }, iso(date).slice(5)));
    }
    for (const [index, [label, color]] of [['Plan', '#6f4e37'], ['Actual', '#3d6b4f'], ['Read / required', '#b56b3c']].entries()) {
      svg.append(svgElement('text', { x: left + index * 60, y: 18, fill: color, 'font-size': 11 }, label));
    }
    svg.append(svgElement('text', { x: 15, y: (top + bottom) / 2, transform: `rotate(-90 15 ${(top + bottom) / 2})`, fill: '#6f4e37', 'font-size': 11 }, audio ? 'Time' : 'Pages'),
      svgElement('text', { x: right, y: top - 10, 'text-anchor': 'end', fill: '#b56b3c', 'font-size': 11 }, audio ? 'Time/day' : 'Pages/day'));
    figure.append(text('figcaption', `${label}: ${book.title} — ${baseline ? `${baseline.startDate} to ${baseline.deadline}` : 'No baseline calculated'}`));
    if (start > scheduledStart || end < deadline) figure.append(text('p', 'Chart display is limited to ten years around today.'));
    return figure;
  };

  window.renderCharts = () => {
    const focusedControl = chartContainer.contains(document.activeElement)
      ? document.activeElement.getAttribute('role') || document.activeElement.tagName.toLowerCase() : null;
    const bundle = readBundleData();
    const choices = [];
    if (bundle) {
      const state = scheduleState || loadSchedule(bundle);
      for (const section of bundle.books.sections) for (const book of section.books) {
        const progress = units(book, section.label.trim() === 'Audiobooks');
        if (progress.total > 0 && (all.getAttribute('aria-pressed') === 'true' || (progress.completed > 0 && progress.remaining > 0))) {
          choices.push({ book, label: section.label, sessions: bundle.sessions[String(book.id).trim()] || [], state });
        }
      }
    }
    if (!choices.some(({ book }) => book.id === selectedBook)) selectedBook = choices[0]?.book.id ?? null;
    if (choices.length) {
      const selector = document.createElement('select');
      selector.setAttribute('aria-label', 'Book');
      for (const { book, label } of choices) {
        const option = document.createElement('option');
        option.value = book.id;
        option.textContent = `${label} - ${book.number}. ${book.title}`;
        selector.append(option);
      }
      selector.value = selectedBook;
      selector.addEventListener('change', () => { selectedBook = selector.value; window.renderCharts(); });
      const toggle = document.createElement('input');
      toggle.type = 'checkbox';
      toggle.checked = showProjection;
      toggle.addEventListener('change', () => { showProjection = toggle.checked; window.renderCharts(); });
      const projectionLabel = document.createElement('label');
      projectionLabel.className = 'chart-projection-toggle';
      projectionLabel.append(toggle, ' Show projection and estimated finish range');
      const selected = choices.find(({ book }) => book.id === selectedBook);
      chartContainer.replaceChildren(selector, projectionLabel, chart(selected.book, selected.label, selected.sessions, selected.state));
      const trigger = window.AndroidControls.select(selector);
      if (focusedControl === 'combobox') trigger.focus({ preventScroll: true });
      if (focusedControl === 'input') toggle.focus({ preventScroll: true });
    } else chartContainer.replaceChildren(text('p', bundle ? 'No currently reading books. Turn on All to see all books.' : 'Import a bundle to see charts.'));
    if (dialog.open) renderMetrics();
  };
  all.addEventListener('click', () => { all.setAttribute('aria-pressed', String(all.getAttribute('aria-pressed') !== 'true')); window.renderCharts(); });
  let chartWidth = 0;
  new ResizeObserver(() => {
    if (chartContainer.clientWidth > 0 && chartContainer.clientWidth !== chartWidth) {
      chartWidth = chartContainer.clientWidth;
      window.renderCharts();
    }
  }).observe(chartContainer);

  const table = (name, rows, headers = ['Metric', 'Value']) => {
    const result = document.createElement('table'); result.setAttribute('aria-label', name);
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
    const sections = activated ? window.ReadingSchedule.sectionsFromBooksFile({ sections: activated.sections }) : sectionsForState(bundle, state);
    const start = nextMetrics && activated ? state.startDate : iso(Math.min(parseDate(state.endDate), Math.max(parseDate(state.startDate), parseDate(window.ReadingSchedule.today()))));
    const days = availableReadingDays(start, state.endDate, state.restDays).length;
    const totals = sections.map((section) => ({ label: section.label, count: section.books.length, remaining: section.books.reduce((sum, book) => sum + book.remaining, 0) }));
    const baselines = activated ? window.ReadingSchedule.calculateBaselines(sections, state.startDate, state.endDate, state.restDays, true) : state.baselines;
    const pace = activated ? null : window.ReadingSchedule.requiredPace(sections, baselines, window.ReadingSchedule.today(), state.restDays);
    return { bundle, planned, state, sections, totals, days, baselines, pace };
  };
  const renderMetrics = (detail = metricDetail) => {
    metricDetail = detail;
    content.replaceChildren();
    const data = metricData();
    const heading = document.createElement('div');
    heading.className = 'metrics-heading';
    heading.append(text('h2', `${detail || 'Metrics'}${nextMetrics ? ' — Next plan' : ''}`),
      action(detail ? 'Back to metrics' : 'Back to charts', () => { if (detail) renderMetrics(''); else dialog.close(); }));
    content.append(heading);
    if (!data) { content.append(text('p', 'Import a bundle to see metrics.')); return; }
    const { state, totals, days } = data;
    const physical = totals.find((item) => item.label === 'Physical books'), digital = totals.find((item) => item.label === 'Digital books'), audio = totals.find((item) => item.label === 'Audiobooks');
    const remaining = physical.remaining + digital.remaining;
    const highest = days ? Math.max(physical.remaining, digital.remaining) / days : 0;
    content.append(text('p', detail ? 'Choose Back to metrics to return to the schedules.' : nextMetrics ? 'Your next-quarter book schedules.' : 'Your current book schedules.'));
    if (data.planned) content.append(action(nextMetrics ? 'Show current plan' : `Show next plan — ${data.planned.startDate}`, () => { nextMetrics = !nextMetrics; renderMetrics(); }));
    if (!detail) {
      for (const section of data.sections) {
        const card = document.createElement('section');
        card.className = 'metrics-card';
        card.append(text('h3', section.label));
        const scheduled = section.books.filter((book) => data.baselines[book.id]);
        if (!scheduled.length) card.append(text('p', 'No scheduled books.'));
        else card.append(table(`${section.label} schedules`, scheduled.map((book) => {
          const baseline = data.baselines[book.id];
          const audioBook = section.audio;
          const remainingStart = iso(Math.max(parseDate(baseline.startDate), parseDate(window.ReadingSchedule.today())));
          const daily = data.pace ? data.pace[book.id] : baseline.dailyTarget;
          return [`${book.number}. ${book.title}`, audioBook ? window.formatReadingTime(daily).replace(/:00$/, '') : `${data.pace ? daily.toFixed(2) : formatUnits(daily)} pages`,
            audioBook ? window.formatReadingTime(book.remaining) : `${book.remaining} pages`,
            availableReadingDays(remainingStart, baseline.deadline, state.restDays).length, baseline.startDate, baseline.deadline,
            baseline.deadline < state.endDate ? 'before end' : baseline.deadline === state.endDate ? 'on end date' : 'after end'];
        }), ['Book', 'Daily', 'Remaining', 'Remaining days', 'Start date', 'Deadline', 'Status']));
        content.append(card);
      }
      for (const label of ['Summary metrics', 'Schedule information', 'Key metrics']) content.append(action(label, () => renderMetrics(label)));
      return;
    }
    let rows = [];
    if (detail === 'Key metrics') rows = [['Overview', 'Remaining pages', remaining, 'Physical + digital'], ['Overview', 'Audiobook remaining time', window.formatReadingTime(audio.remaining), 'All audiobook titles'], ['Plan', 'Reading days', days, 'Rest days excluded'], ['Plan', 'Highest daily pace', `${formatUnits(highest)} pages/day`, 'Physical and digital'], ['Plan', 'Status', days || !totals.some((item) => item.remaining) ? 'Achievable at required pace' : 'No reading days available', nextMetrics ? 'Next plan' : 'Current plan']];
    if (detail === 'Schedule information') rows = [['Schedule', 'Plan period', `${state.startDate} to ${state.endDate}`, nextMetrics ? 'Quarter end' : data.bundle.plan.end_label || 'Plan end'], ...totals.map((item) => {
      const deadlines = data.sections.find((section) => section.label === item.label).books.map((book) => data.baselines[book.id]?.deadline).filter(Boolean).sort();
      const last = deadlines.at(-1);
      const difference = last ? parseDate(state.endDate) - parseDate(last) : 0;
      const endName = nextMetrics || data.bundle.plan.end_label !== 'Target finish date' ? 'quarter end date' : 'target finish date';
      const result = !last ? 'No books' : difference === 0 ? `You finish exactly on the ${endName}.`
        : `You finish ${Math.abs(difference)} day${Math.abs(difference) === 1 ? '' : 's'} ${difference > 0 ? 'before' : 'after'} the ${endName}.`;
      return [item.label, 'Daily pace', `${item.label === 'Audiobooks' ? window.formatReadingTime(days ? item.remaining / days : 0) : `${formatUnits(days ? item.remaining / days : 0)} pages`}/day`, result];
    })];
    if (detail === 'Summary metrics') {
      rows.push(['Physical book count', physical.count], ['Digital book count', digital.count], ['Audiobook count', audio.count]);
      rows.push(['Physical page share', `${(remaining ? physical.remaining / remaining * 100 : 0).toFixed(1)}%`], ['Digital page share', `${(remaining ? digital.remaining / remaining * 100 : 0).toFixed(1)}%`]);
      rows.push(['Physical average pages/book', (physical.count ? physical.remaining / physical.count : 0).toFixed(1)], ['Digital average pages/book', (digital.count ? digital.remaining / digital.count : 0).toFixed(1)], ['Audiobook average duration', window.formatReadingTime(audio.count ? audio.remaining / audio.count : 0)]);
      rows.push(['Reading period', `${availableReadingDays(state.startDate, state.endDate, state.restDays).length} days`]);
      rows.push(['Pace driver', `${[physical, digital].filter((item) => item.remaining > 0 && days && Math.abs(item.remaining / days - highest) < 1e-9).map((item) => item.label).join(', ') || 'None'} (${highest.toFixed(2)} pages/day)`]);
      rows = rows.map(([metric, value]) => ['Summary', metric, value, 'Optional metric']);
    }
    content.append(table(detail, rows, ['Area', 'Metric', 'Value', 'Details']));
  };
  document.querySelector('#metrics-open').addEventListener('click', () => { nextMetrics = false; renderMetrics(''); dialog.showModal(); });
  close.addEventListener('click', () => dialog.close());
  window.renderCharts();
})();
