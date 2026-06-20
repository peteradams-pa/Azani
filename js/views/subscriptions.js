/* Azani — Subscriptions view */

Views.renderers.subscriptions = function renderSubscriptions() {
  renderPlanStrip();
  renderSubscriptionTable();
};

function renderPlanStrip() {
  document.getElementById('planStrip').innerHTML = DB.plans.map(plan => {
    const activeCount = DB.subscriptions.filter(s => s.planId === plan.id).length;
    return `
      <article class="plan-card">
        <span class="plan-card__icon" data-icon="wifi"></span>
        <p class="plan-card__name">${escapeHtml(plan.name)}</p>
        <p class="plan-card__speed">${plan.speedMbps} Mbps · ${escapeHtml(plan.tier)}</p>
        <p class="plan-card__price">${fmtMoney(plan.monthlyFee)}<span>/mo</span></p>
        <p class="plan-card__count">${activeCount} subscriber${activeCount === 1 ? '' : 's'}</p>
      </article>`;
  }).join('');
  renderIcons(document.getElementById('planStrip'));
}

function renderSubscriptionTable() {
  const tbody = document.getElementById('subscriptionTableBody');
  const empty = document.getElementById('subscriptionEmpty');
  const list = DB.subscriptions.slice().sort((a, b) => {
    // surface problems first: disconnected > suspended > active, then by due date
    const order = { disconnected: 0, suspended: 1, active: 2 };
    return (order[a.status] - order[b.status]) || (new Date(a.nextDueDate) - new Date(b.nextDueDate));
  });

  if (!list.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = list.map(sub => {
    const inst = getInstitution(sub.institutionId);
    const plan = DB.plans.find(p => p.id === sub.planId);
    const overdueDays = Math.max(0, daysBetween(sub.nextDueDate, todayStr()));
    const owed = totalOwed(sub.institutionId);
    return `
      <tr class="${sub.status === 'disconnected' ? 'row--danger' : sub.status === 'suspended' ? 'row--warning' : ''}">
        <td><strong>${escapeHtml(inst ? inst.name : 'Unknown')}</strong></td>
        <td>${plan ? escapeHtml(plan.name) : '—'}</td>
        <td>${statusChip(sub.status)}</td>
        <td>${fmtDate(sub.nextDueDate)}</td>
        <td>${overdueDays > 0 ? `<span class="overdue-pill">${overdueDays}d</span>` : '—'}</td>
        <td>${owed > 0 ? fmtMoney(owed) : '—'}</td>
        <td>
          <button class="btn btn--text btn--sm" data-open-inst="${sub.institutionId}">Manage</button>
        </td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-open-inst]').forEach(btn => {
    btn.addEventListener('click', () => openInstitutionDetail(btn.dataset.openInst));
  });
}

function setupSubscriptionView() {
  document.getElementById('newSubscriptionBtn').addEventListener('click', () => openNewSubscriptionModal());
  document.getElementById('managePlansBtn').addEventListener('click', openManagePlansModal);
}

function openNewSubscriptionModal(presetInstitutionId) {
  const eligible = i => (i.status === 'installed' && !subscriptionFor(i.id)) || presetInstitutionId === i.id;
  Modal.open(`
    <div class="modal__head">
      <h2>Activate subscription</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <form class="modal__body form-grid" id="subscriptionForm">
      <label class="field field--full">Institution
        <select name="institutionId" required>
          ${institutionOptions(eligible)}
        </select>
      </label>
      <label class="field field--full">Plan
        <select name="planId" required>
          ${DB.plans.map(p => `<option value="${p.id}">${p.name} — ${p.speedMbps}Mbps — ${fmtMoney(p.monthlyFee)}/mo</option>`).join('')}
        </select>
      </label>
      <label class="field">Start date
        <input type="date" name="startDate" value="${todayStr()}" required>
      </label>
    </form>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn btn--filled" id="submitSubscriptionBtn">Activate subscription</button>
    </div>
  `, {
    onMount: (root) => {
      if (presetInstitutionId) root.querySelector('[name="institutionId"]').value = presetInstitutionId;
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));
      root.querySelector('#submitSubscriptionBtn').addEventListener('click', () => {
        const form = root.querySelector('#subscriptionForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        activateSubscription({
          institutionId: fd.get('institutionId'),
          planId: fd.get('planId'),
          startDate: fd.get('startDate')
        });
        showSnackbar('Subscription activated.');
        Modal.close();
        Views.renderAll();
      });
    }
  });
}

function openManagePlansModal() {
  Modal.open(`
    <div class="modal__head">
      <h2>Manage subscription plans</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <div class="modal__body">
      <div class="plan-manage-list" id="planManageList"></div>
      <h4 class="modal__subheading">Add new plan</h4>
      <form class="form-grid" id="newPlanForm">
        <label class="field">Plan name
          <input type="text" name="name" required placeholder="e.g. Shule Plus">
        </label>
        <label class="field">Speed (Mbps)
          <input type="number" name="speedMbps" required min="1">
        </label>
        <label class="field">Monthly fee (KSh)
          <input type="number" name="monthlyFee" required min="0">
        </label>
        <label class="field">Target tier
          <input type="text" name="tier" placeholder="e.g. Senior Secondary">
        </label>
      </form>
      <button class="btn btn--tonal" id="addPlanBtn">Add plan</button>
    </div>
    <div class="modal__actions">
      <button class="btn btn--filled" data-close-modal>Done</button>
    </div>
  `, {
    onMount: (root) => {
      const renderList = () => {
        root.querySelector('#planManageList').innerHTML = DB.plans.map(p => {
          const count = DB.subscriptions.filter(s => s.planId === p.id).length;
          return `
            <div class="plan-manage-row">
              <div>
                <strong>${escapeHtml(p.name)}</strong>
                <span class="plan-manage-row__meta">${p.speedMbps}Mbps · ${fmtMoney(p.monthlyFee)}/mo · ${escapeHtml(p.tier)}</span>
              </div>
              <span class="chip chip--muted">${count} subscriber${count === 1 ? '' : 's'}</span>
              ${count === 0 ? `<button class="icon-btn icon-btn--danger" data-remove-plan="${p.id}" data-icon="trash"></button>` : ''}
            </div>`;
        }).join('');
        renderIcons(root);
        root.querySelectorAll('[data-remove-plan]').forEach(btn => {
          btn.addEventListener('click', () => {
            DB.plans = DB.plans.filter(p => p.id !== btn.dataset.removePlan);
            saveStore();
            renderList();
            showSnackbar('Plan removed.');
          });
        });
      };
      renderList();

      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => { Modal.close(); Views.renderAll(); }));
      root.querySelector('#addPlanBtn').addEventListener('click', () => {
        const form = root.querySelector('#newPlanForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        DB.plans.push({
          id: nextId('plan'),
          name: fd.get('name').trim(),
          speedMbps: Number(fd.get('speedMbps')),
          monthlyFee: Number(fd.get('monthlyFee')),
          tier: fd.get('tier').trim() || 'General'
        });
        saveStore();
        form.reset();
        renderList();
        showSnackbar('Plan added.');
      });
    }
  });
}
