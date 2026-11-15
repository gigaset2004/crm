/* Procurement searchable select UI. Leaves the original <select> as the source
   of truth so existing filtering, save handlers, and programmatic values work. */
'use strict';
(function () {
  let active = null;
  const instances = new WeakMap();

  function close(focusTrigger) {
    if (!active) return;
    const open = active;
    active = null;
    open.trigger.setAttribute('aria-expanded', 'false');
    open.trigger.classList.remove('is-open');
    if (open.panel.isConnected) open.panel.remove();
    if (focusTrigger && open.trigger.isConnected) open.trigger.focus();
  }

  function sync(select) {
    const inst = instances.get(select);
    if (!inst) return;
    const option = select.selectedOptions[0];
    inst.label.textContent = option ? option.textContent : 'Choose…';
    inst.trigger.disabled = select.disabled;
    inst.trigger.title = select.title || (option ? option.textContent : 'Choose…');
    if (active && active.select === select && select.disabled) close(false);
  }

  function place(inst) {
    if (!active || active.select !== inst.select) return;
    const bounds = inst.trigger.getBoundingClientRect();
    const margin = 8;
    const viewportWidth = document.documentElement.clientWidth;
    const viewportHeight = window.innerHeight;
    const width = Math.min(Math.max(bounds.width, inst.variant === 'supplier' ? 240 : 245), viewportWidth - margin * 2);
    const left = Math.max(margin, Math.min(bounds.left, viewportWidth - width - margin));
    const freeBelow = viewportHeight - bounds.bottom - margin * 2;
    const freeAbove = bounds.top - margin * 2;
    const above = freeBelow < 205 && freeAbove > freeBelow;
    const available = Math.max(125, Math.min(355, above ? freeAbove : freeBelow));
    inst.panel.style.left = left + 'px';
    inst.panel.style.width = width + 'px';
    inst.panel.style.maxHeight = available + 'px';
    inst.panel.style.top = above ? Math.max(margin, bounds.top - Math.min(inst.panel.scrollHeight, available) - 5) + 'px' : Math.min(viewportHeight - available - margin, bounds.bottom + 5) + 'px';
  }

  function open(inst) {
    if (inst.select.disabled) return;
    if (active) close(false);
    const panel = document.createElement('div');
    panel.className = 'search-combo-panel';
    panel.setAttribute('role', 'presentation');
    const input = document.createElement('input');
    input.type = 'search';
    input.className = 'search-combo-search';
    input.placeholder = 'Search…';
    input.autocomplete = 'off';
    input.setAttribute('aria-label', 'Search ' + inst.name);
    const list = document.createElement('div');
    list.className = 'search-combo-list';
    list.setAttribute('role', 'listbox');
    list.setAttribute('aria-label', inst.name);
    panel.append(input, list);
    document.body.append(panel);
    inst.panel = panel;
    active = inst;
    inst.trigger.setAttribute('aria-expanded', 'true');
    inst.trigger.classList.add('is-open');
    let current = -1;
    let found = [];

    function setCurrent(index) {
      if (!found.length) return;
      current = (index + found.length) % found.length;
      found.forEach((node, i) => node.classList.toggle('active', i === current));
      found[current].scrollIntoView({ block: 'nearest' });
    }

    function choose(value) {
      if (!active || active !== inst) return;
      const changed = inst.select.value !== value;
      inst.select.value = value;
      sync(inst.select);
      close(true);
      if (changed) inst.select.dispatchEvent(new Event('change', { bubbles: true }));
    }

    function populate() {
      const query = input.value.trim().toLocaleLowerCase();
      list.replaceChildren();
      found = [];
      current = -1;
      const candidates = Array.from(inst.select.options).filter(option => !option.disabled && (!query || option.textContent.toLocaleLowerCase().includes(query)));
      if (!candidates.length) {
        const empty = document.createElement('div');
        empty.className = 'search-combo-empty';
        empty.textContent = 'No matches';
        list.append(empty);
      }
      for (const option of candidates) {
        const row = document.createElement('button');
        row.type = 'button';
        row.className = 'search-combo-option';
        row.textContent = option.textContent;
        row.setAttribute('role', 'option');
        row.setAttribute('aria-selected', String(option.value === inst.select.value));
        if (option.value === inst.select.value) row.classList.add('selected');
        row.addEventListener('click', () => choose(option.value));
        row.addEventListener('mouseenter', () => { current = found.indexOf(row); found.forEach((node, i) => node.classList.toggle('active', i === current)); });
        list.append(row);
        found.push(row);
      }
      place(inst);
    }

    input.addEventListener('input', populate);
    input.addEventListener('keydown', (event) => {
      if (event.key === 'ArrowDown') { event.preventDefault(); setCurrent(current + 1); }
      else if (event.key === 'ArrowUp') { event.preventDefault(); setCurrent(current === -1 ? found.length - 1 : current - 1); }
      else if (event.key === 'Enter') {
        event.preventDefault();
        if (found.length) found[current >= 0 ? current : 0].click();
      } else if (event.key === 'Escape') { event.preventDefault(); event.stopPropagation(); close(true); }
    });
    populate();
    input.focus();
  }

  function enhance(select, options = {}) {
    if (!select || instances.has(select)) return;
    const wrapper = document.createElement('div');
    wrapper.className = 'search-combo' + (options.variant === 'supplier' ? ' search-combo--supplier' : '');
    select.parentNode.insertBefore(wrapper, select);
    wrapper.append(select);
    select.classList.add('search-combo-native');
    const trigger = document.createElement('button');
    trigger.type = 'button';
    trigger.className = 'search-combo-trigger';
    trigger.setAttribute('role', 'combobox');
    trigger.setAttribute('aria-expanded', 'false');
    trigger.setAttribute('aria-haspopup', 'listbox');
    trigger.setAttribute('aria-label', options.label || select.getAttribute('aria-label') || 'Choose option');
    const label = document.createElement('span');
    label.className = 'search-combo-value';
    const chevron = document.createElement('span');
    chevron.className = 'search-combo-chevron';
    chevron.setAttribute('aria-hidden', 'true');
    chevron.textContent = '▾';
    trigger.append(label, chevron);
    wrapper.append(trigger);
    const inst = { select, trigger, label, name: options.label || 'options', variant: options.variant || '' };
    instances.set(select, inst);
    trigger.addEventListener('click', () => {
      if (active === inst) close(false); else open(inst);
    });
    trigger.addEventListener('keydown', (event) => {
      if (['ArrowDown', 'Enter', ' '].includes(event.key)) { event.preventDefault(); open(inst); }
    });
    select.addEventListener('change', () => sync(select));
    sync(select);
  }

  document.addEventListener('pointerdown', (event) => {
    if (!active) return;
    if (active.panel.contains(event.target) || active.trigger.contains(event.target)) return;
    close(false);
  });
  document.addEventListener('keydown', (event) => {
    if (event.key === 'Escape' && active) { event.stopPropagation(); close(true); }
  }, true);
  window.addEventListener('resize', () => { if (active) place(active); });
  window.addEventListener('scroll', () => {
    if (active) place(active);
  }, true);

  window.ProcurementSearchSelect = { enhance, sync, close };
})();
