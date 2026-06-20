/* Azani — Reports view */

let activeReport = 'revenue';

Views.renderers.reports = function renderReports() {
  const body = document.getElementById('reportBody');
  const renderers = {
    revenue: reportRevenue,
    arrears: reportArrears,
    status: reportStatus,
    plans: reportPlans,
    institutions: reportInstitutions
  };
  body.innerHTML = renderers[activeReport]();
  renderIcons(body);
};

function setupReportsView() {
  document.getElementById('reportTabs').addEventListener('click', (e) => {
    const btn = e.target.closest('.report-tab');
    if (!btn) return;
    document.querySelectorAll('.report-tab').forEach(t => t.classList.remove('is-active'));
    btn.classList.add('is-active');
    activeReport = btn.dataset.report;
    Views.render('reports');
  });

  document.getElementById('exportReportBtn').addEventListener('click', exportCurrentReportCSV);
}

function reportRevenue() {
  const byType = {};
  Object.keys(PAYMENT_TYPE_LABELS).forEach(t => byType[t] = 0);
  DB.payments.forEach(p => { byType[p.type] = (byType[p.type] || 0) + p.amount; });
  const total = Object.values(byType).reduce((a, b) => a + b, 0);

  const rows = Object.entries(byType).map(([type, amount]) => `
    <tr><td>${PAYMENT_TYPE_LABELS[type]}</td><td class="mono amount-cell">${fmtMoney(amount)}</td><td>${total ? Math.round((amount/total)*100) : 0}%</td></tr>
  `).join('');

  return `
    <div class="report-summary-row">
      <div class="report-stat"><span>${fmtMoney(total)}</span><label>Total collected all-time</label></div>
      <div class="report-stat"><span>${DB.payments.length}</span><label>Total transactions</label></div>
      <div class="report-stat"><span>${fmtMoney(total / Math.max(1, DB.institutions.filter(i=>['active','suspended'].includes(i.status)).length))}</span><label>Avg. revenue per active institution</label></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Revenue stream</th><th>Amount</th><th>Share</th></tr></thead>
      <tbody>${rows}</tbody>
    </table>`;
}

function reportArrears() {
  const rows = DB.subscriptions.map(sub => {
    const inst = getInstitution(sub.institutionId);
    const overdueDays = Math.max(0, daysBetween(sub.nextDueDate, todayStr()));
    const owed = totalOwed(sub.institutionId);
    return { inst, sub, overdueDays, owed };
  }).filter(r => r.owed > 0).sort((a, b) => b.overdueDays - a.overdueDays);

  if (!rows.length) {
    return `<p class="empty-state">No institutions currently have an outstanding balance. Collections are fully up to date.</p>`;
  }

  const totalArrears = rows.reduce((s, r) => s + r.owed, 0);

  return `
    <div class="report-summary-row">
      <div class="report-stat report-stat--warning"><span>${fmtMoney(totalArrears)}</span><label>Total arrears outstanding</label></div>
      <div class="report-stat report-stat--warning"><span>${rows.length}</span><label>Institutions with a balance</label></div>
      <div class="report-stat report-stat--danger"><span>${rows.filter(r => r.sub.status === 'disconnected').length}</span><label>Currently disconnected</label></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Institution</th><th>Status</th><th>Days overdue</th><th>Balance owed</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr class="${r.sub.status === 'disconnected' ? 'row--danger' : r.sub.status === 'suspended' ? 'row--warning' : ''}">
            <td><strong>${escapeHtml(r.inst.name)}</strong></td>
            <td>${statusChip(r.sub.status)}</td>
            <td>${r.overdueDays}d</td>
            <td class="mono amount-cell">${fmtMoney(r.owed)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function reportStatus() {
  const counts = {};
  Object.keys(STATUS_META).forEach(s => counts[s] = 0);
  DB.institutions.forEach(i => counts[i.status] = (counts[i.status] || 0) + 1);
  const total = DB.institutions.length || 1;

  return `
    <div class="report-summary-row">
      <div class="report-stat"><span>${DB.institutions.length}</span><label>Total institutions registered</label></div>
      <div class="report-stat report-stat--success"><span>${counts.active}</span><label>Currently active</label></div>
      <div class="report-stat"><span>${Object.entries(TYPE_LABELS).map(([k]) => DB.institutions.filter(i=>i.type===k).length).reduce((a,b)=>a+(b>0?1:0),0)}</span><label>Institution types represented</label></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Status</th><th>Count</th><th>Share</th></tr></thead>
      <tbody>
        ${Object.entries(counts).map(([status, count]) => `
          <tr><td>${statusChip(status)}</td><td>${count}</td><td>${Math.round((count/total)*100)}%</td></tr>
        `).join('')}
      </tbody>
    </table>
    <h4 class="modal__subheading">By institution type</h4>
    <table class="data-table">
      <thead><tr><th>Type</th><th>Count</th></tr></thead>
      <tbody>
        ${Object.entries(TYPE_LABELS).map(([k, label]) => `
          <tr><td>${label}</td><td>${DB.institutions.filter(i => i.type === k).length}</td></tr>
        `).join('')}
      </tbody>
    </table>`;
}

function reportPlans() {
  const rows = DB.plans.map(plan => {
    const subs = DB.subscriptions.filter(s => s.planId === plan.id);
    const activeSubs = subs.filter(s => s.status === 'active');
    const mrr = activeSubs.length * plan.monthlyFee;
    return { plan, count: subs.length, activeCount: activeSubs.length, mrr };
  });
  const totalMrr = rows.reduce((s, r) => s + r.mrr, 0);

  return `
    <div class="report-summary-row">
      <div class="report-stat report-stat--success"><span>${fmtMoney(totalMrr)}</span><label>Active monthly recurring revenue</label></div>
      <div class="report-stat"><span>${DB.subscriptions.length}</span><label>Total subscriptions ever activated</label></div>
    </div>
    <table class="data-table">
      <thead><tr><th>Plan</th><th>Speed</th><th>Monthly fee</th><th>Subscribers</th><th>Active</th><th>MRR contribution</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td><strong>${escapeHtml(r.plan.name)}</strong></td>
            <td>${r.plan.speedMbps} Mbps</td>
            <td class="mono">${fmtMoney(r.plan.monthlyFee)}</td>
            <td>${r.count}</td>
            <td>${r.activeCount}</td>
            <td class="mono amount-cell">${fmtMoney(r.mrr)}</td>
          </tr>`).join('')}
      </tbody>
    </table>`;
}

function reportInstitutions() {
  const rows = DB.institutions.map(inst => {
    const paid = paymentsFor(inst.id).reduce((s, p) => s + p.amount, 0);
    const sub = subscriptionFor(inst.id);
    const owed = sub ? totalOwed(inst.id) : 0;
    return { inst, paid, owed, sub };
  }).sort((a, b) => b.paid - a.paid);

  return `
    <table class="data-table">
      <thead><tr><th>Institution</th><th>Type</th><th>Status</th><th>Total paid</th><th>Balance owed</th></tr></thead>
      <tbody>
        ${rows.map(r => `
          <tr>
            <td><strong>${escapeHtml(r.inst.name)}</strong></td>
            <td>${TYPE_LABELS[r.inst.type]}</td>
            <td>${statusChip(r.inst.status)}</td>
            <td class="mono amount-cell">${fmtMoney(r.paid)}</td>
            <td class="mono ${r.owed > 0 ? 'amount-cell--warning' : ''}">${r.owed > 0 ? fmtMoney(r.owed) : '—'}</td>
          </tr>`).join('')}
      </tbody>
    </table>
    ${!rows.length ? `<p class="empty-state">No institutions registered yet.</p>` : ''}`;
}

function exportCurrentReportCSV() {
  let rows = [], headers = [], filename = 'azani-report.csv';

  if (activeReport === 'revenue') {
    headers = ['type', 'amount'];
    rows = Object.keys(PAYMENT_TYPE_LABELS).map(t => ({
      type: PAYMENT_TYPE_LABELS[t],
      amount: DB.payments.filter(p => p.type === t).reduce((s, p) => s + p.amount, 0)
    }));
    filename = 'azani-revenue-summary.csv';
  } else if (activeReport === 'arrears') {
    headers = ['institution', 'status', 'daysOverdue', 'balanceOwed'];
    rows = DB.subscriptions.map(sub => {
      const inst = getInstitution(sub.institutionId);
      return {
        institution: inst ? inst.name : 'Unknown',
        status: sub.status,
        daysOverdue: Math.max(0, daysBetween(sub.nextDueDate, todayStr())),
        balanceOwed: totalOwed(sub.institutionId)
      };
    }).filter(r => r.balanceOwed > 0);
    filename = 'azani-arrears.csv';
  } else if (activeReport === 'status') {
    headers = ['status', 'count'];
    rows = Object.keys(STATUS_META).map(s => ({ status: STATUS_META[s].label, count: DB.institutions.filter(i => i.status === s).length }));
    filename = 'azani-status-breakdown.csv';
  } else if (activeReport === 'plans') {
    headers = ['plan', 'speedMbps', 'monthlyFee', 'subscribers', 'active', 'mrr'];
    rows = DB.plans.map(plan => {
      const subs = DB.subscriptions.filter(s => s.planId === plan.id);
      const activeSubs = subs.filter(s => s.status === 'active');
      return { plan: plan.name, speedMbps: plan.speedMbps, monthlyFee: plan.monthlyFee, subscribers: subs.length, active: activeSubs.length, mrr: activeSubs.length * plan.monthlyFee };
    });
    filename = 'azani-plan-performance.csv';
  } else if (activeReport === 'institutions') {
    headers = ['institution', 'type', 'status', 'totalPaid', 'balanceOwed'];
    rows = DB.institutions.map(inst => ({
      institution: inst.name,
      type: TYPE_LABELS[inst.type],
      status: STATUS_META[inst.status].label,
      totalPaid: paymentsFor(inst.id).reduce((s, p) => s + p.amount, 0),
      balanceOwed: subscriptionFor(inst.id) ? totalOwed(inst.id) : 0
    }));
    filename = 'azani-institutions.csv';
  }

  downloadFile(filename, toCSV(rows, headers), 'text/csv');
  showSnackbar('Report exported.');
}
