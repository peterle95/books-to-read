// Shared framework-Material calendar. Only OK updates the original field.
(() => {
  const DAY = 86400000, attached = new WeakSet();
  const utc = (year, month, day) => {
    const date = new Date(0);
    date.setUTCFullYear(year, month, day);
    return date;
  };
  const iso = (date) => `${String(date.getUTCFullYear()).padStart(4, '0')}-${String(date.getUTCMonth() + 1).padStart(2, '0')}-${String(date.getUTCDate()).padStart(2, '0')}`;
  const parse = (value) => {
    if (typeof value !== 'string' || !/^\d{4}-\d{2}-\d{2}$/.test(value)) return null;
    const [year, month, day] = value.split('-').map(Number), date = utc(year, month - 1, day);
    return year >= 1 && date.getUTCFullYear() === year && date.getUTCMonth() === month - 1 && date.getUTCDate() === day ? date : null;
  };
  const format = (date, options) => date.toLocaleDateString('en-US', { ...options, timeZone: 'UTC' });
  const today = () => { const now = new Date(); return utc(now.getFullYear(), now.getMonth(), now.getDate()); };
  let dialog, owner, draft, cursor, month, yearCursor, years = false;
  const button = (text, label, action) => {
    const element = document.createElement('button');
    element.type = 'button'; element.textContent = text;
    if (label) element.setAttribute('aria-label', label);
    element.addEventListener('click', action);
    return element;
  };
  const finish = (commit = false) => {
    const input = owner;
    if (!input) return;
    const value = iso(draft), changed = input.value !== value;
    owner = null;
    input.setAttribute('aria-expanded', 'false');
    dialog.close();
    input.focus({ preventScroll: true });
    if (commit && !input.disabled && changed) {
      const controls = window.ReadingControls || window.AndroidControls;
      if (controls?.sync) controls.sync(input, value); else input.value = value;
      input.dispatchEvent(new Event('input', { bubbles: true }));
      input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  const moveMonth = (date, amount) => {
    const next = utc(date.getUTCFullYear(), date.getUTCMonth() + amount, 1);
    next.setUTCDate(Math.min(date.getUTCDate(), utc(next.getUTCFullYear(), next.getUTCMonth() + 1, 0).getUTCDate()));
    return next;
  };
  const bounded = (date) => date.getUTCFullYear() >= 1 && date.getUTCFullYear() <= 9999;
  const render = (focus = false) => {
    dialog.querySelector('.reading-calendar-announcement').textContent = format(month, { month: 'long', year: 'numeric' });
    const header = dialog.querySelector('.reading-calendar-header');
    header.replaceChildren();
    const year = button(String(draft.getUTCFullYear()), 'Choose year', () => { yearCursor = draft.getUTCFullYear(); years = true; render(true); });
    year.className = 'reading-calendar-year';
    year.setAttribute('aria-pressed', String(years));
    const date = button(format(draft, { weekday: 'short', month: 'short', day: 'numeric' }), 'Choose day', () => { years = false; render(true); });
    date.className = 'reading-calendar-date';
    date.setAttribute('aria-pressed', String(!years));
    header.append(year, date);
    const body = dialog.querySelector('.reading-calendar-body');
    body.onscroll = null;
    body.replaceChildren();
    body.classList.toggle('reading-calendar-years', years);
    if (years) {
      // Bounded DOM window; keyboard and scroll edges can advance through all ISO years.
      const selected = draft.getUTCFullYear(), start = Math.max(1, yearCursor - 100), end = Math.min(9999, yearCursor + 100);
      for (let value = start; value <= end; value++) {
        const row = button(String(value), null, () => {
          const next = utc(value, draft.getUTCMonth(), 1);
          next.setUTCDate(Math.min(draft.getUTCDate(), utc(value, draft.getUTCMonth() + 1, 0).getUTCDate()));
          draft = cursor = next; month = utc(value, next.getUTCMonth(), 1); years = false; render(true);
        });
        row.setAttribute('aria-pressed', String(value === selected));
        row.tabIndex = value === yearCursor ? 0 : -1;
        row.addEventListener('keydown', (event) => {
          let next = value;
          if (event.key === 'ArrowDown') next++;
          else if (event.key === 'ArrowUp') next--;
          else if (event.key === 'PageDown') next += 10;
          else if (event.key === 'PageUp') next -= 10;
          else if (event.key === 'Home') next = 1;
          else if (event.key === 'End') next = 9999;
          else return;
          event.preventDefault();
          next = Math.max(1, Math.min(9999, next));
          const target = [...body.children].find((item) => item.textContent === String(next));
          if (target) { row.tabIndex = -1; target.tabIndex = 0; target.focus(); }
          else { yearCursor = next; render(true); }
        });
        body.append(row);
      }
      const active = body.querySelector('[tabindex="0"]');
      body.scrollTop = active.offsetTop - 81;
      body.onscroll = () => {
        let anchor;
        if (body.scrollTop <= 0 && start > 1) anchor = start;
        else if (body.scrollTop + body.clientHeight >= body.scrollHeight - 1 && end < 9999) anchor = end;
        else return;
        yearCursor = anchor;
        render(false);
      };
      if (focus) active.focus({ preventScroll: true });
      return;
    }
    const navigation = document.createElement('div'); navigation.className = 'reading-calendar-navigation';
    const browse = (amount) => {
      const next = moveMonth(cursor, amount);
      if (!bounded(next)) return;
      cursor = next; month = utc(next.getUTCFullYear(), next.getUTCMonth(), 1); render();
      dialog.querySelector(amount < 0 ? '[aria-label="Previous month"]' : '[aria-label="Next month"]').focus();
    };
    const previous = button('', 'Previous month', () => browse(-1));
    const next = button('', 'Next month', () => browse(1));
    previous.disabled = month.getUTCFullYear() === 1 && month.getUTCMonth() === 0;
    next.disabled = month.getUTCFullYear() === 9999 && month.getUTCMonth() === 11;
    const title = document.createElement('span'); title.id = 'reading-calendar-month'; title.setAttribute('aria-live', 'polite');
    title.textContent = format(month, { month: 'long', year: 'numeric' });
    navigation.append(previous, title, next); body.append(navigation);
    const weekdays = document.createElement('div'); weekdays.className = 'reading-calendar-weekdays'; weekdays.setAttribute('aria-hidden', 'true');
    for (const day of ['S', 'M', 'T', 'W', 'T', 'F', 'S']) { const item = document.createElement('span'); item.textContent = day; weekdays.append(item); }
    body.append(weekdays);
    const grid = document.createElement('div'); grid.className = 'reading-calendar-grid'; grid.setAttribute('role', 'grid'); grid.setAttribute('aria-labelledby', title.id);
    const count = utc(month.getUTCFullYear(), month.getUTCMonth() + 1, 0).getUTCDate(), offset = month.getUTCDay();
    for (let index = 0; index < Math.ceil((offset + count) / 7) * 7; index++) {
      if (index % 7 === 0) { const row = document.createElement('div'); row.setAttribute('role', 'row'); grid.append(row); }
      const day = index - offset + 1;
      if (day < 1 || day > count) { const blank = document.createElement('span'); blank.setAttribute('role', 'gridcell'); grid.lastChild.append(blank); continue; }
      const value = utc(month.getUTCFullYear(), month.getUTCMonth(), day);
      const cell = button(String(day), format(value, { weekday: 'long', year: 'numeric', month: 'long', day: 'numeric' }), () => { draft = cursor = value; render(true); });
      cell.setAttribute('role', 'gridcell'); cell.setAttribute('aria-selected', String(iso(value) === iso(draft)));
      if (iso(value) === iso(today())) cell.setAttribute('aria-current', 'date');
      cell.tabIndex = iso(value) === iso(cursor) ? 0 : -1;
      cell.addEventListener('keydown', (event) => {
        let target;
        const delta = { ArrowLeft: -1, ArrowRight: 1, ArrowUp: -7, ArrowDown: 7, Home: -value.getUTCDay(), End: 6 - value.getUTCDay() };
        if (event.key in delta) target = new Date(value.getTime() + delta[event.key] * DAY);
        else if (event.key === 'PageUp' || event.key === 'PageDown') target = moveMonth(value, (event.key === 'PageUp' ? -1 : 1) * (event.shiftKey ? 12 : 1));
        else return;
        event.preventDefault();
        if (!bounded(target)) return;
        cursor = target; month = utc(target.getUTCFullYear(), target.getUTCMonth(), 1); render(true);
      });
      grid.lastChild.append(cell);
    }
    body.append(grid);
    if (focus) grid.querySelector('[tabindex="0"]').focus({ preventScroll: true });
  };
  const open = (input, options) => {
    if (input.disabled || owner) return;
    if (!dialog) {
      dialog = document.createElement('dialog'); dialog.id = 'reading-calendar'; dialog.className = 'reading-calendar'; dialog.setAttribute('aria-label', 'Choose date');
      dialog.innerHTML = '<span class="reading-calendar-announcement" role="status" aria-live="polite"></span><div class="reading-calendar-header"></div><div class="reading-calendar-body"></div><div class="reading-calendar-actions"></div>';
      dialog.querySelector('.reading-calendar-actions').append(button('CANCEL', null, () => finish()), button('OK', null, () => finish(true)));
      dialog.addEventListener('cancel', (event) => { event.preventDefault(); event.stopPropagation(); finish(); });
      // Stop application-level Escape handlers from also closing an underlying editor.
      dialog.addEventListener('keydown', (event) => {
        if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); finish(); }
        if (event.key === 'Tab') {
          const items = [...dialog.querySelectorAll('button:not(:disabled)')].filter((item) => item.tabIndex >= 0);
          const first = items[0], last = items.at(-1);
          if (event.shiftKey && document.activeElement === first) { event.preventDefault(); last.focus(); }
          else if (!event.shiftKey && document.activeElement === last) { event.preventDefault(); first.focus(); }
        }
      });
      document.body.append(dialog);
    }
    owner = input; draft = parse(input.value) || parse(options.initialDate) || today(); cursor = new Date(draft);
    month = utc(draft.getUTCFullYear(), draft.getUTCMonth(), 1); years = false;
    input.setAttribute('aria-expanded', 'true');
    render(); dialog.showModal(); render(true);
  };
  const attach = (input, options = {}) => {
    if (attached.has(input)) return input;
    attached.add(input);
    const controls = window.ReadingControls || window.AndroidControls;
    if (controls?.date) controls.date(input, { mode: 'text' });
    input.type = 'text'; input.readOnly = true; input.dataset.dateMode = 'calendar';
    input.setAttribute('aria-haspopup', 'dialog'); input.setAttribute('aria-controls', 'reading-calendar'); input.setAttribute('aria-expanded', 'false');
    input.addEventListener('click', () => open(input, options));
    input.addEventListener('keydown', (event) => {
      if (['Enter', ' ', 'ArrowDown'].includes(event.key)) { event.preventDefault(); open(input, options); }
    });
    return input;
  };
  window.ReadingCalendar = { attach };
})();
