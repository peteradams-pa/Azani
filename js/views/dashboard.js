/* Azani — Dashboard view */

Views.renderers.dashboard = function renderDashboard() {
  renderPulseStrip();
  renderFunnel();
  renderRevenueBars();
  renderAlerts();
  renderActivity();
};

function renderPulseStrip() {
  const counts = { active: 0, suspended: 0, disconnected: 0, pipeline: 0 };
  DB.institutions.forEach(i => {
    if (i.status === 'active') counts.active++;
    else if (i.status === 'suspended') counts.suspended++;
    else if (i.status === 'disconnected') counts.disconnected++;
    else counts.pipeline++;
  });

  const totalCollected = DB.payments.reduce((s, p) => s + p.amount, 0);
  const owedTotal = DB.subscriptions.reduce((s, sub) => s + totalOwed(sub.institutionId), 0);

  const cards = [
    { label: 'Active connections', value: counts.active, tone: 'success', icon: 'wifi' },
    { label: 'Suspended', value: counts.suspended, tone: 'warning', icon: 'alert' },
    { label: 'Disconnected', value: counts.disconnected, tone: 'danger', icon: 'ban' },
    { label: 'In pipeline', value: counts.pipeline, tone: 'info', icon: 'map' },
    { label: 'Total collected', value: fmtMoney(totalCollected), tone: 'neutral', icon: 'cash', isMoney: true },
    { label: 'Outstanding balance', value: fmtMoney(owedTotal), tone: owedTotal > 0 ? 'warning' : 'neutral', icon: 'receipt', isMoney: true }
  ];

  document.getElementById('pulseStrip').innerHTML = cards.map(c => `
    <article class="pulse-card pulse-card--${c.tone}">
      <span class="pulse-card__icon" data-icon="${c.icon}"></span>
      <div>
        <p class="pulse-card__value">${c.value}</p>
        <p class="pulse-card__label">${c.label}</p>
      </div>
    </article>
  `).join('');
  renderIcons(document.getElementById('pulseStrip'));
}

function renderFunnel() {
  const stages = ['lead', 'surveyed', 'awaiting_infra', 'ready_for_install', 'installed', 'active'];
  const max = Math.max(1, ...stages.map(s => DB.institutions.filter(i => i.status === s || (s === 'active' && ['active','suspended','disconnected'].includes(i.status))).length));

  const rows = stages.map(s => {
    let count;
    if (s === 'active') {
      count = DB.institutions.filter(i => ['active', 'suspended', 'disconnected'].includes(i.status)).length;
    } else {
      count = DB.institutions.filter(i => i.status === s).length;
    }
    const pct = Math.round((count / max) * 100);
    return `
      <div class="funnel__row">
        <span class="funnel__label">${STATUS_META[s].label}</span>
        <div class="funnel__track"><div class="funnel__fill funnel__fill--${STATUS_META[s].tone}" style="width:${Math.max(pct, count ? 6 : 0)}%"></div></div>
        <span class="funnel__count">${count}</span>
      </div>`;
  }).join('');

  document.getElementById('funnelChart').innerHTML = rows || `<p class="empty-state">No institutions registered yet.</p>`;
}

function renderRevenueBars() {
  const months = [];
  const now = new Date();
  for (let i = 5; i >= 0; i--) {
    const d = new Date(now.getFullYear(), now.getMonth() - i, 1);
    months.push({ key: d.toISOString().slice(0, 7), label: d.toLocaleDateString('en-KE', { month: 'short' }) });
  }
  const sums = months.map(m => DB.payments.filter(p => p.date.slice(0, 7) === m.key).reduce((s, p) => s + p.amount, 0));
  const max = Math.max(1, ...sums);

  document.getElementById('revenueBars').innerHTML = months.map((m, idx) => `
    <div class="bar-col">
      <div class="bar-col__track">
        <div class="bar-col__fill" style="height:${Math.max((sums[idx] / max) * 100, sums[idx] > 0 ? 4 : 0)}%"></div>
      </div>
      <span class="bar-col__value">${sums[idx] ? (sums[idx] / 1000).toFixed(0) + 'k' : '0'}</span>
      <span class="bar-col__label">${m.label}</span>
    </div>
  `).join('');
}

function renderAlerts() {
  const alerts = [];

  DB.subscriptions.forEach(sub => {
    const inst = getInstitution(sub.institutionId);
    if (!inst) return;
    const overdueDays = daysBetween(sub.nextDueDate, todayStr());
    if (sub.status === 'disconnected') {
      alerts.push({ tone: 'danger', icon: 'ban', text: `${inst.name} is disconnected — ${overdueDays}d overdue. Owes ${fmtMoney(totalOwed(inst.id))}.`, view: 'subscriptions' });
    } else if (sub.status === 'suspended') {
      alerts.push({ tone: 'warning', icon: 'alert', text: `${inst.name} suspended — ${overdueDays}d overdue. Late fine owed: ${fmtMoney(sub.lateFinesOwed)}.`, view: 'subscriptions' });
    } else if (overdueDays > 0) {
      alerts.push({ tone: 'info', icon: 'clock', text: `${inst.name} is ${overdueDays}d into grace period before suspension.`, view: 'subscriptions' });
    }
  });

  DB.institutions.filter(i => i.status === 'awaiting_infra').forEach(inst => {
    alerts.push({ tone: 'info', icon: 'box', text: `${inst.name} needs infrastructure purchased before install.`, view: 'infrastructure' });
  });
  DB.institutions.filter(i => i.status === 'ready_for_install').forEach(inst => {
    alerts.push({ tone: 'info', icon: 'tool', text: `${inst.name} is ready — schedule installation.`, view: 'installations' });
  });
  DB.institutions.filter(i => i.status === 'lead' && !i.registrationPaid).forEach(inst => {
    alerts.push({ tone: 'neutral', icon: 'receipt', text: `${inst.name} has an unpaid registration fee.`, view: 'institutions' });
  });

  document.getElementById('alertCount').textContent = alerts.length;
  const listEl = document.getElementById('alertList');
  if (!alerts.length) {
    listEl.innerHTML = `<li class="alert-item alert-item--empty">Nothing needs attention right now.</li>`;
    return;
  }
  listEl.innerHTML = alerts.slice(0, 8).map(a => `
    <li class="alert-item alert-item--${a.tone}" data-goto="${a.view}">
      <span class="alert-item__icon" data-icon="${a.icon}"></span>
      <span>${a.text}</span>
      <span class="alert-item__arrow" data-icon="arrowRight"></span>
    </li>
  `).join('');
  renderIcons(listEl);
  listEl.querySelectorAll('[data-goto]').forEach(li => {
    li.addEventListener('click', () => Views.goto(li.dataset.goto));
  });
}

function renderActivity() {
  const listEl = document.getElementById('activityList');
  if (!DB.activity.length) {
    listEl.innerHTML = `<li class="activity-item activity-item--empty">No activity yet. Register your first institution to get started.</li>`;
    return;
  }
  listEl.innerHTML = DB.activity.slice(0, 10).map(a => `
    <li class="activity-item">
      <span class="activity-item__dot activity-item__dot--${a.kind}"></span>
      <span class="activity-item__text">${escapeHtml(a.message)}</span>
      <span class="activity-item__time">${timeAgo(a.at)}</span>
    </li>
  `).join('');
}

function tickClock() {
  const el = document.getElementById('liveClock');
  if (!el) return;
  el.textContent = new Date().toLocaleString('en-KE', { weekday: 'short', day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' });
}
