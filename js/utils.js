/* Azani — shared utility helpers */

function fmtMoney(n) {
  const v = Math.round(n || 0);
  return `${DB.settings.currency} ${v.toLocaleString('en-KE')}`;
}

function fmtDate(dateStr) {
  if (!dateStr) return '—';
  const d = new Date(dateStr + (dateStr.length <= 10 ? 'T00:00:00' : ''));
  return d.toLocaleDateString('en-KE', { day: 'numeric', month: 'short', year: 'numeric' });
}

function fmtDateTime(iso) {
  const d = new Date(iso);
  return d.toLocaleString('en-KE', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}

function todayStr() {
  return new Date().toISOString().slice(0, 10);
}

function timeAgo(iso) {
  const diff = Math.round((Date.now() - new Date(iso)) / 1000);
  if (diff < 60) return 'just now';
  if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
  if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
  return `${Math.floor(diff / 86400)}d ago`;
}

const STATUS_META = {
  lead:              { label: 'New lead',        tone: 'neutral',  bars: 0 },
  surveyed:          { label: 'Surveyed',        tone: 'info',     bars: 1 },
  awaiting_infra:    { label: 'Awaiting infra',  tone: 'warning',  bars: 1 },
  ready_for_install: { label: 'Ready to install',tone: 'info',     bars: 2 },
  installed:         { label: 'Installed',       tone: 'info',     bars: 3 },
  active:            { label: 'Active',          tone: 'success',  bars: 4 },
  suspended:         { label: 'Suspended',       tone: 'warning',  bars: 2 },
  disconnected:      { label: 'Disconnected',    tone: 'danger',   bars: 0 }
};

const TYPE_LABELS = {
  primary: 'Primary School',
  junior: 'Junior Secondary',
  senior: 'Senior Secondary',
  college: 'College / University'
};

const PAYMENT_TYPE_LABELS = {
  registration: 'Registration',
  infrastructure: 'Infrastructure',
  installation: 'Installation',
  subscription: 'Subscription',
  late_fine: 'Late fine',
  reconnection: 'Reconnection fee'
};

function escapeHtml(str) {
  return String(str ?? '').replace(/[&<>"']/g, c => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  }[c]));
}

function debounce(fn, wait = 200) {
  let t;
  return (...args) => {
    clearTimeout(t);
    t = setTimeout(() => fn(...args), wait);
  };
}

function downloadFile(filename, content, mime = 'text/plain') {
  const blob = new Blob([content], { type: mime });
  const url = URL.createObjectURL(blob);
  const a = document.createElement('a');
  a.href = url;
  a.download = filename;
  document.body.appendChild(a);
  a.click();
  a.remove();
  URL.revokeObjectURL(url);
}

function toCSV(rows, headers) {
  const esc = (v) => {
    const s = String(v ?? '');
    return /[",\n]/.test(s) ? `"${s.replace(/"/g, '""')}"` : s;
  };
  const lines = [headers.map(esc).join(',')];
  rows.forEach(r => lines.push(headers.map(h => esc(r[h])).join(',')));
  return lines.join('\n');
}
