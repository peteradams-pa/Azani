/* Azani — UI shell helpers: navigation, modal, snackbar */

const Views = {
  current: 'dashboard',
  renderers: {}, // populated by view modules: { dashboard: fn, institutions: fn, ... }

  goto(name) {
    if (!document.getElementById(`view-${name}`)) return;
    document.querySelectorAll('.view').forEach(v => v.classList.remove('is-active'));
    document.getElementById(`view-${name}`).classList.add('is-active');
    document.querySelectorAll('.rail__item[data-view]').forEach(b => b.classList.toggle('is-active', b.dataset.view === name));
    this.current = name;
    closeRail();
    this.render(name);
    document.getElementById('main').scrollTo({ top: 0, behavior: 'instant' in window ? 'instant' : 'auto' });
  },

  render(name) {
    const fn = this.renderers[name];
    if (fn) fn();
  },

  renderAll() {
    Object.values(this.renderers).forEach(fn => fn());
  }
};

function closeRail() {
  document.getElementById('rail').classList.remove('is-open');
  document.getElementById('menuToggle')?.classList.remove('is-active');
}

/* ---------- Snackbar ---------- */
let snackTimer = null;
function showSnackbar(message, tone = 'default') {
  const el = document.getElementById('snackbar');
  el.textContent = message;
  el.className = `snackbar is-visible snackbar--${tone}`;
  clearTimeout(snackTimer);
  snackTimer = setTimeout(() => el.classList.remove('is-visible'), 3200);
}

/* ---------- Modal ---------- */
const Modal = {
  open(html, { onMount, size = 'default' } = {}) {
    const overlay = document.getElementById('modalOverlay');
    const root = document.getElementById('modalRoot');
    root.className = `modal modal--${size}`;
    root.innerHTML = html;
    overlay.classList.add('is-visible');
    renderIcons(root);
    if (onMount) onMount(root);
    document.body.style.overflow = 'hidden';
    const firstInput = root.querySelector('input, select, textarea, button');
    setTimeout(() => firstInput?.focus(), 60);
  },
  close() {
    const overlay = document.getElementById('modalOverlay');
    overlay.classList.remove('is-visible');
    document.getElementById('modalRoot').innerHTML = '';
    document.body.style.overflow = '';
  }
};

document.getElementById('modalOverlay').addEventListener('click', (e) => {
  if (e.target.id === 'modalOverlay') Modal.close();
});
document.addEventListener('keydown', (e) => {
  if (e.key === 'Escape') Modal.close();
});

/* ---------- Status chip / signal-bars renderer (shared signature component) ---------- */
function statusChip(status) {
  const meta = STATUS_META[status] || STATUS_META.lead;
  return `<span class="chip chip--${meta.tone}">${meta.label}</span>`;
}

function signalBars(status) {
  const meta = STATUS_META[status] || STATUS_META.lead;
  const tone = meta.tone;
  let bars = '';
  for (let i = 1; i <= 4; i++) {
    const active = i <= meta.bars;
    bars += `<span class="signal-bar signal-bar--${i} ${active ? `is-active is-active--${tone}` : ''}"></span>`;
  }
  return `<span class="signal" role="img" aria-label="${meta.label}">${bars}</span>`;
}

/* ---------- Generic select-institution helper for forms ---------- */
function institutionOptions(filterFn) {
  const list = filterFn ? DB.institutions.filter(filterFn) : DB.institutions;
  if (!list.length) return `<option value="">No eligible institutions</option>`;
  return `<option value="">Select institution…</option>` + list
    .map(i => `<option value="${i.id}">${escapeHtml(i.name)} — ${TYPE_LABELS[i.type]}</option>`)
    .join('');
}
