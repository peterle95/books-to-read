// Android-style ISO text dates and spinners. Calendar-only controls are a separate phase.
(() => {
  const DAY_MS = 86400000;
  const controls = new WeakSet();
  const forms = new WeakSet();
  const parseDate = (value) => {
    const match = /^(\d{4})-(\d{2})-(\d{2})$/.exec(value);
    if (!match) throw new Error('Enter a real date as YYYY-MM-DD.');
    const [, year, month, day] = match.map(Number);
    const date = new Date(0);
    // Date.UTC treats years 0–99 as 1900–1999; setUTCFullYear does not.
    date.setUTCFullYear(year, month - 1, day);
    if (year < 1 || date.getUTCFullYear() !== year || date.getUTCMonth() !== month - 1 || date.getUTCDate() !== day) {
      throw new Error('Enter a real date as YYYY-MM-DD.');
    }
    return date.getTime() / DAY_MS;
  };
  const sync = (input, value) => {
    if (value !== undefined) input.value = value;
    input.setCustomValidity('');
    if (!input.disabled && input.value) {
      try { parseDate(input.value); } catch (error) { input.setCustomValidity(error.message); }
    }
    return input.checkValidity();
  };
  const date = (input, { mode = 'text' } = {}) => {
    if (mode !== 'text') throw new Error(`Date control mode is not implemented: ${mode}`);
    if (controls.has(input)) return input;
    controls.add(input);
    input.type = 'text';
    input.dataset.dateMode = mode;
    input.placeholder = 'YYYY-MM-DD';
    input.addEventListener('input', () => sync(input));
    input.addEventListener('change', () => sync(input));
    const form = input.form;
    if (form && !forms.has(form)) {
      forms.add(form);
      const syncForm = () => [...form.elements].filter((field) => controls.has(field)).forEach((field) => sync(field));
      // Refresh programmatically loaded values before native constraint validation.
      form.addEventListener('click', syncForm, true);
      form.addEventListener('submit', (event) => {
        syncForm();
        if (!form.reportValidity()) {
          event.preventDefault();
          event.stopImmediatePropagation();
        }
      }, true);
    }
    sync(input);
    return input;
  };
  const selects = new WeakMap();
  const popup = document.createElement('div');
  popup.id = 'android-select-options';
  popup.className = 'android-select-popup';
  popup.setAttribute('role', 'listbox');
  popup.setAttribute('popover', 'manual');
  popup.hidden = true;
  document.body.append(popup);
  popup.addEventListener('pointerdown', (event) => event.preventDefault());
  let owner = null, active = -1, sequence = 0, typed = '', typedAt = 0;
  const closeSelect = () => {
    if (!owner) return;
    owner.trigger.setAttribute('aria-expanded', 'false');
    owner.trigger.removeAttribute('aria-activedescendant');
    if (popup.hidePopover && popup.matches(':popover-open')) popup.hidePopover();
    popup.hidden = true;
    owner = null;
  };
  const enabled = (option) => !!option && !option.disabled && !option.parentElement.disabled;
  const activate = (index, highlight = true) => {
    active = index;
    [...popup.children].forEach((row, at) => row.classList.toggle('active', highlight && at === active));
    const row = popup.children[active];
    if (row) {
      owner.trigger.setAttribute('aria-activedescendant', row.id);
      row.scrollIntoView({ block: 'nearest' });
    }
  };
  const syncSelect = (input) => {
    const state = selects.get(input);
    if (!state) return;
    if (owner === state) closeSelect();
    state.trigger.textContent = input.selectedOptions[0]?.textContent || '';
    state.trigger.disabled = input.disabled || ![...input.options].some(enabled);
    return state.trigger;
  };
  const commit = () => {
    const state = owner, index = active;
    closeSelect();
    if (!state || !enabled(state.input.options[index])) return;
    const changed = state.input.selectedIndex !== index;
    state.input.selectedIndex = index;
    syncSelect(state.input);
    state.trigger.focus({ preventScroll: true });
    if (changed) {
      state.input.dispatchEvent(new Event('input', { bubbles: true }));
      state.input.dispatchEvent(new Event('change', { bubbles: true }));
    }
  };
  const openSelect = (state) => {
    closeSelect();
    if (state.trigger.disabled) return;
    owner = state;
    typed = '';
    if (!popup.showPopover) popup.removeAttribute('popover');
    (state.trigger.closest('dialog') || document.body).append(popup);
    popup.setAttribute('aria-label', state.label);
    popup.replaceChildren(...[...state.input.options].map((option, index) => {
      const row = document.createElement('div');
      row.id = `${popup.id}-${index}`;
      row.setAttribute('role', 'option');
      row.setAttribute('aria-selected', String(index === state.input.selectedIndex));
      row.setAttribute('aria-disabled', String(!enabled(option)));
      row.textContent = option.textContent;
      row.addEventListener('click', () => { if (enabled(option)) { activate(index); commit(); } });
      return row;
    }));
    popup.hidden = false;
    const rect = state.trigger.getBoundingClientRect();
    // Native dropdown content may outgrow the anchor, up to the viewport width.
    Object.assign(popup.style, { visibility: 'hidden', width: 'max-content', maxWidth: `${innerWidth}px`, maxHeight: '288px' });
    // Closed popovers have no layout. Open invisibly to measure natural option
    // content (including row padding), then position before the same frame paints.
    if (popup.showPopover) popup.showPopover();
    const width = Math.min(Math.max(rect.width - 16, popup.getBoundingClientRect().width), innerWidth);
    const height = Math.min(288, innerHeight - 16);
    const contentHeight = Math.min(height, state.input.options.length * 48);
    Object.assign(popup.style, { width: `${width}px`, maxHeight: `${height}px`,
      left: `${Math.max(0, Math.min(rect.left + 8, innerWidth - width))}px`,
      top: `${Math.max(8, Math.min(rect.top, innerHeight - contentHeight - 8))}px` });
    popup.style.visibility = '';
    state.trigger.setAttribute('aria-expanded', 'true');
    activate(enabled(state.input.options[state.input.selectedIndex]) ? state.input.selectedIndex : [...state.input.options].findIndex(enabled), false);
  };
  const select = (input) => {
    if (selects.has(input)) return syncSelect(input);
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.id = `${input.id || `android-select-${++sequence}`}-trigger`;
    trigger.className = 'android-select-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-controls', popup.id);
    trigger.setAttribute('aria-expanded', 'false');
    if (input.hasAttribute('aria-label')) trigger.setAttribute('aria-label', input.getAttribute('aria-label'));
    const labelText = input.getAttribute('aria-label') || [...input.labels].map((label) => label.textContent).join(' ') || 'Options';
    for (const label of [...input.labels]) label.htmlFor = trigger.id;
    input.hidden = true;
    input.setAttribute('aria-hidden', 'true');
    input.tabIndex = -1;
    input.after(trigger);
    const state = { input, trigger, label: labelText };
    selects.set(input, state);
    trigger.addEventListener('click', () => owner === state ? closeSelect() : openSelect(state));
    trigger.addEventListener('keydown', (event) => {
      const key = event.key;
      if (key === 'Tab') { closeSelect(); return; }
      if (key === 'Escape') {
        if (owner === state) { event.preventDefault(); event.stopPropagation(); closeSelect(); }
        return;
      }
      if (key === 'Enter' || key === ' ') {
        event.preventDefault();
        if (owner === state) commit(); else openSelect(state);
        return;
      }
      if (!['ArrowDown', 'ArrowUp', 'Home', 'End'].includes(key) && !(key.length === 1 && !event.ctrlKey && !event.metaKey && !event.altKey)) return;
      event.preventDefault();
      if (owner !== state) openSelect(state);
      const indices = [...input.options].flatMap((option, index) => enabled(option) ? [index] : []);
      let next = active;
      if (key === 'Home') next = indices[0];
      else if (key === 'End') next = indices.at(-1);
      else if (key === 'ArrowDown') next = indices[Math.min(indices.length - 1, indices.indexOf(active) + 1)];
      else if (key === 'ArrowUp') next = indices[Math.max(0, indices.indexOf(active) - 1)];
      else {
        typed = Date.now() - typedAt > 700 ? key : typed + key;
        typedAt = Date.now();
        next = indices.find((index) => input.options[index].textContent.trim().toLowerCase().startsWith(typed.toLowerCase())) ?? active;
      }
      activate(next);
    });
    input.addEventListener('change', () => syncSelect(input));
    return syncSelect(input);
  };
  document.addEventListener('pointerdown', (event) => {
    if (owner && !popup.contains(event.target) && !owner.trigger.contains(event.target)) closeSelect();
  }, true);
  document.addEventListener('focusin', (event) => { if (owner && event.target !== owner.trigger) closeSelect(); });
  document.addEventListener('close', closeSelect, true);
  window.addEventListener('resize', closeSelect);
  window.AndroidControls = { date, sync, parseDate, select, syncSelect };
})();
