/* Azani — Institutions view */

let institutionFilter = 'all';
let institutionSearchTerm = '';

Views.renderers.institutions = function renderInstitutions() {
  const grid = document.getElementById('institutionGrid');
  let list = DB.institutions.slice().sort((a, b) => new Date(b.createdAt) - new Date(a.createdAt));

  if (institutionFilter !== 'all') list = list.filter(i => i.status === institutionFilter);
  if (institutionSearchTerm) {
    const q = institutionSearchTerm.toLowerCase();
    list = list.filter(i => i.name.toLowerCase().includes(q) || i.location.toLowerCase().includes(q));
  }

  if (!list.length) {
    grid.innerHTML = `<p class="empty-state empty-state--grid">No institutions match this view. Try a different filter or register a new institution.</p>`;
    return;
  }

  grid.innerHTML = list.map(institutionCardHTML).join('');
  renderIcons(grid);
  grid.querySelectorAll('[data-open-institution]').forEach(card => {
    card.addEventListener('click', () => openInstitutionDetail(card.dataset.openInstitution));
  });
};

function institutionCardHTML(inst) {
  const sub = subscriptionFor(inst.id);
  const owed = sub ? totalOwed(inst.id) : 0;
  return `
    <article class="inst-card" data-open-institution="${inst.id}">
      <div class="inst-card__top">
        <div class="inst-card__icon" data-icon="building"></div>
        ${signalBars(inst.status)}
      </div>
      <h4 class="inst-card__name">${escapeHtml(inst.name)}</h4>
      <p class="inst-card__meta">${TYPE_LABELS[inst.type]} · ${escapeHtml(inst.location)}</p>
      <div class="inst-card__bottom">
        ${statusChip(inst.status)}
        ${owed > 0 ? `<span class="chip chip--danger-soft">${fmtMoney(owed)} owed</span>` : ''}
      </div>
    </article>`;
}

function setupInstitutionFilters() {
  document.getElementById('institutionFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip--filter');
    if (!btn) return;
    document.querySelectorAll('#institutionFilters .chip--filter').forEach(c => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    institutionFilter = btn.dataset.status;
    Views.render('institutions');
  });

  document.getElementById('institutionSearch').addEventListener('input', debounce((e) => {
    institutionSearchTerm = e.target.value.trim();
    Views.render('institutions');
  }, 150));

  document.getElementById('newInstitutionBtn').addEventListener('click', openNewInstitutionModal);
}

function openNewInstitutionModal() {
  Modal.open(`
    <div class="modal__head">
      <h2>Register institution</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <form class="modal__body form-grid" id="institutionForm">
      <label class="field field--full">Institution name
        <input type="text" name="name" required placeholder="e.g. Kibera Junior Secondary School">
      </label>
      <label class="field">Type
        <select name="type" required>
          <option value="primary">Primary School</option>
          <option value="junior">Junior Secondary</option>
          <option value="senior">Senior Secondary</option>
          <option value="college">College / University</option>
        </select>
      </label>
      <label class="field">Location
        <input type="text" name="location" required placeholder="e.g. Kibera, Nairobi">
      </label>
      <label class="field">Contact person
        <input type="text" name="contactName" placeholder="e.g. Mary Wanjiru">
      </label>
      <label class="field">Contact phone
        <input type="tel" name="contactPhone" placeholder="07XX XXX XXX">
      </label>
      <label class="field field--full">Contact email
        <input type="email" name="contactEmail" placeholder="admin@school.ac.ke">
      </label>
      <label class="field">Registration fee (KSh)
        <input type="number" name="registrationFee" value="${DB.settings.registrationFee}" min="0" required>
      </label>
      <label class="field field--full">Notes
        <textarea name="notes" rows="2" placeholder="Optional context about this lead"></textarea>
      </label>
    </form>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn btn--filled" id="submitInstitutionBtn">Register institution</button>
    </div>
  `, {
    onMount: (root) => {
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));
      root.querySelector('#submitInstitutionBtn').addEventListener('click', () => {
        const form = root.querySelector('#institutionForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        const inst = createInstitution({
          name: fd.get('name').trim(),
          type: fd.get('type'),
          location: fd.get('location').trim(),
          contactName: fd.get('contactName').trim(),
          contactPhone: fd.get('contactPhone').trim(),
          contactEmail: fd.get('contactEmail').trim(),
          registrationFee: Number(fd.get('registrationFee')),
          notes: fd.get('notes').trim()
        });
        Modal.close();
        showSnackbar(`${inst.name} registered. Collect the registration fee to proceed.`);
        Views.render('institutions');
        Views.render('dashboard');
        openInstitutionDetail(inst.id);
      });
    }
  });
}

function openInstitutionDetail(id) {
  const inst = getInstitution(id);
  if (!inst) return;
  const sub = subscriptionFor(id);
  const surveys = surveysFor(id);
  const purchases = purchasesFor(id);
  const installs = installationsFor(id);
  const payments = paymentsFor(id).slice().sort((a, b) => new Date(b.date) - new Date(a.date));
  const owed = sub ? totalOwed(id) : 0;

  Modal.open(`
    <div class="modal__head">
      <div>
        <p class="eyebrow">${TYPE_LABELS[inst.type]} · ${escapeHtml(inst.location)}</p>
        <h2>${escapeHtml(inst.name)}</h2>
      </div>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>

    <div class="modal__body">
      <div class="detail-top">
        ${signalBars(inst.status)}
        ${statusChip(inst.status)}
        ${owed > 0 ? `<span class="chip chip--danger-soft">${fmtMoney(owed)} owed</span>` : `<span class="chip chip--success-soft">No balance due</span>`}
      </div>

      <div class="detail-cols">
        <div class="detail-col">
          <h4>Contact</h4>
          <p class="detail-line"><span data-icon="user"></span> ${escapeHtml(inst.contactName) || '—'}</p>
          <p class="detail-line"><span data-icon="phone"></span> ${escapeHtml(inst.contactPhone) || '—'}</p>
          <p class="detail-line"><span data-icon="location"></span> ${escapeHtml(inst.location)}</p>
          ${inst.notes ? `<p class="detail-note">${escapeHtml(inst.notes)}</p>` : ''}
        </div>

        <div class="detail-col">
          <h4>Registration</h4>
          <p class="detail-line">${fmtMoney(inst.registrationFee)} fee
            ${inst.registrationPaid ? `<span class="chip chip--success-soft">Paid</span>` : `<span class="chip chip--warning-soft">Unpaid</span>`}
          </p>
          ${!inst.registrationPaid ? `<button class="btn btn--tonal btn--sm" id="payRegBtn">Record registration payment</button>` : ''}
        </div>
      </div>

      <div class="detail-actions">
        ${detailActionButtons(inst, sub)}
      </div>

      ${sub ? `
        <div class="detail-section">
          <h4>Subscription</h4>
          <p class="detail-line">${DB.plans.find(p => p.id === sub.planId)?.name || 'Unknown plan'} ·
            Next due ${fmtDate(sub.nextDueDate)} · ${statusChip(sub.status)}</p>
          ${sub.lateFinesOwed > 0 ? `<p class="detail-line detail-line--warning">Late fine outstanding: ${fmtMoney(sub.lateFinesOwed)}</p>` : ''}
        </div>` : ''}

      ${surveys.length ? `
        <div class="detail-section">
          <h4>Surveys (${surveys.length})</h4>
          ${surveys.map(s => `<p class="detail-line">${fmtDate(s.date)} — ${s.readiness === 'ready' ? 'Ready' : 'Not ready'} (${escapeHtml(s.distanceFromPop)} from POP)</p>`).join('')}
        </div>` : ''}

      ${purchases.length ? `
        <div class="detail-section">
          <h4>Infrastructure purchases (${purchases.length})</h4>
          ${purchases.map(p => `<p class="detail-line">${fmtDate(p.date)} — ${fmtMoney(p.totalCost)} ${p.paid ? `<span class="chip chip--success-soft">Paid</span>` : `<span class="chip chip--warning-soft">Unpaid</span>`}</p>`).join('')}
        </div>` : ''}

      ${installs.length ? `
        <div class="detail-section">
          <h4>Installations (${installs.length})</h4>
          ${installs.map(i => `<p class="detail-line">${fmtDate(i.date)} — ${fmtMoney(i.fee)} ${i.paid ? `<span class="chip chip--success-soft">Paid</span>` : `<span class="chip chip--warning-soft">Unpaid</span>`}</p>`).join('')}
        </div>` : ''}

      <div class="detail-section">
        <h4>Payment history (${payments.length})</h4>
        ${payments.length ? `
          <div class="mini-table">
            ${payments.slice(0, 8).map(p => `
              <div class="mini-table__row">
                <span>${fmtDate(p.date)}</span>
                <span>${PAYMENT_TYPE_LABELS[p.type]}</span>
                <span class="mini-table__amount">${fmtMoney(p.amount)}</span>
              </div>`).join('')}
          </div>
        ` : `<p class="empty-state">No payments recorded yet.</p>`}
      </div>
    </div>
  `, { size: 'large', onMount: (root) => mountInstitutionDetailActions(root, inst, sub) });
}

function detailActionButtons(inst, sub) {
  const btns = [];
  if (inst.status === 'lead') {
    btns.push(`<button class="btn btn--filled btn--sm" data-action="survey">Log site survey</button>`);
  }
  if (inst.status === 'awaiting_infra') {
    btns.push(`<button class="btn btn--filled btn--sm" data-action="purchase">Purchase infrastructure</button>`);
  }
  if (inst.status === 'ready_for_install') {
    btns.push(`<button class="btn btn--filled btn--sm" data-action="install">Log installation</button>`);
  }
  if (inst.status === 'installed' && !sub) {
    btns.push(`<button class="btn btn--filled btn--sm" data-action="subscribe">Activate subscription</button>`);
  }
  if (sub && sub.status === 'suspended') {
    btns.push(`<button class="btn btn--tonal btn--sm" data-action="pay-subscription">Pay subscription</button>`);
    if (sub.lateFinesOwed > 0) btns.push(`<button class="btn btn--tonal btn--sm" data-action="pay-fine">Pay late fine</button>`);
  }
  if (sub && sub.status === 'disconnected') {
    btns.push(`<button class="btn btn--filled btn--sm" data-action="reconnect">Reconnect (settle arrears)</button>`);
  }
  if (sub && sub.status === 'active') {
    btns.push(`<button class="btn btn--tonal btn--sm" data-action="pay-subscription">Record subscription payment</button>`);
  }
  btns.push(`<button class="btn btn--text btn--sm" data-action="edit">Edit details</button>`);
  return btns.join('');
}

function mountInstitutionDetailActions(root, inst, sub) {
  root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));

  root.querySelector('#payRegBtn')?.addEventListener('click', () => {
    openPaymentCaptureModal({
      title: `Registration payment — ${inst.name}`,
      amount: inst.registrationFee,
      onConfirm: (meta) => {
        payRegistration(inst.id, meta);
        showSnackbar('Registration payment recorded.');
        Modal.close();
        Views.renderAll();
      }
    });
  });

  root.querySelectorAll('[data-action]').forEach(btn => {
    btn.addEventListener('click', () => handleDetailAction(btn.dataset.action, inst, sub));
  });
}

function handleDetailAction(action, inst, sub) {
  switch (action) {
    case 'survey':
      Modal.close();
      openNewSurveyModal(inst.id);
      break;
    case 'purchase':
      Modal.close();
      openNewPurchaseModal(inst.id);
      break;
    case 'install':
      Modal.close();
      openNewInstallModal(inst.id);
      break;
    case 'subscribe':
      Modal.close();
      openNewSubscriptionModal(inst.id);
      break;
    case 'pay-subscription': {
      const plan = DB.plans.find(p => p.id === sub.planId);
      openPaymentCaptureModal({
        title: `Subscription payment — ${inst.name}`,
        amount: plan ? plan.monthlyFee : 0,
        onConfirm: (meta) => {
          paySubscriptionPeriod(inst.id, meta);
          showSnackbar('Subscription payment recorded.');
          Modal.close();
          Views.renderAll();
        }
      });
      break;
    }
    case 'pay-fine':
      openPaymentCaptureModal({
        title: `Late fine — ${inst.name}`,
        amount: sub.lateFinesOwed,
        onConfirm: (meta) => {
          payLateFine(inst.id, meta);
          showSnackbar('Late fine payment recorded.');
          Modal.close();
          Views.renderAll();
        }
      });
      break;
    case 'reconnect': {
      const arrears = totalOwed(inst.id) - DB.settings.reconnectionFee;
      openPaymentCaptureModal({
        title: `Reconnect ${inst.name}`,
        amount: DB.settings.reconnectionFee,
        helper: arrears > 0 ? `Note: ${fmtMoney(arrears)} in subscription/fines is still owed separately and should be settled too.` : 'No other arrears outstanding.',
        onConfirm: (meta) => {
          reconnectInstitution(inst.id, meta);
          showSnackbar(`${inst.name} reconnected.`);
          Modal.close();
          Views.renderAll();
        }
      });
      break;
    }
    case 'edit':
      Modal.close();
      openEditInstitutionModal(inst.id);
      break;
  }
}

function openEditInstitutionModal(id) {
  const inst = getInstitution(id);
  Modal.open(`
    <div class="modal__head">
      <h2>Edit institution</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <form class="modal__body form-grid" id="editInstitutionForm">
      <label class="field field--full">Institution name
        <input type="text" name="name" required value="${escapeHtml(inst.name)}">
      </label>
      <label class="field">Type
        <select name="type" required>
          ${Object.entries(TYPE_LABELS).map(([k, v]) => `<option value="${k}" ${inst.type === k ? 'selected' : ''}>${v}</option>`).join('')}
        </select>
      </label>
      <label class="field">Location
        <input type="text" name="location" required value="${escapeHtml(inst.location)}">
      </label>
      <label class="field">Contact person
        <input type="text" name="contactName" value="${escapeHtml(inst.contactName)}">
      </label>
      <label class="field">Contact phone
        <input type="tel" name="contactPhone" value="${escapeHtml(inst.contactPhone)}">
      </label>
      <label class="field field--full">Contact email
        <input type="email" name="contactEmail" value="${escapeHtml(inst.contactEmail)}">
      </label>
      <label class="field field--full">Notes
        <textarea name="notes" rows="2">${escapeHtml(inst.notes)}</textarea>
      </label>
    </form>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn btn--filled" id="saveInstitutionBtn">Save changes</button>
    </div>
  `, {
    onMount: (root) => {
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));
      root.querySelector('#saveInstitutionBtn').addEventListener('click', () => {
        const form = root.querySelector('#editInstitutionForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        updateInstitution(id, {
          name: fd.get('name').trim(),
          type: fd.get('type'),
          location: fd.get('location').trim(),
          contactName: fd.get('contactName').trim(),
          contactPhone: fd.get('contactPhone').trim(),
          contactEmail: fd.get('contactEmail').trim(),
          notes: fd.get('notes').trim()
        });
        showSnackbar('Institution updated.');
        Modal.close();
        Views.renderAll();
      });
    }
  });
}

/* ---------- Shared payment capture modal (used across views) ---------- */
function openPaymentCaptureModal({ title, amount, helper = '', onConfirm }) {
  Modal.open(`
    <div class="modal__head">
      <h2>${escapeHtml(title)}</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <form class="modal__body form-grid" id="paymentCaptureForm">
      <label class="field field--full">Amount (KSh)
        <input type="number" name="amount" required min="0" value="${amount}">
      </label>
      <label class="field">Payment method
        <select name="method" required>
          <option value="mpesa">M-Pesa</option>
          <option value="bank">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
        </select>
      </label>
      <label class="field">Reference / transaction code
        <input type="text" name="reference" placeholder="e.g. QFT7X2K9LP">
      </label>
      ${helper ? `<p class="field--full field-helper">${helper}</p>` : ''}
    </form>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn btn--filled" id="confirmPaymentBtn">Confirm payment</button>
    </div>
  `, {
    onMount: (root) => {
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));
      root.querySelector('#confirmPaymentBtn').addEventListener('click', () => {
        const form = root.querySelector('#paymentCaptureForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        onConfirm({ method: fd.get('method'), reference: fd.get('reference').trim(), amount: Number(fd.get('amount')) });
      });
    }
  });
}
