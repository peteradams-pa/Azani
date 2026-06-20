/* Azani — Payments ledger view */

let paymentFilterType = 'all';
let paymentSearchTerm = '';

Views.renderers.payments = function renderPayments() {
  const tbody = document.getElementById('paymentTableBody');
  const empty = document.getElementById('paymentEmpty');
  let list = DB.payments.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  if (paymentFilterType !== 'all') list = list.filter(p => p.type === paymentFilterType);
  if (paymentSearchTerm) {
    const q = paymentSearchTerm.toLowerCase();
    list = list.filter(p => {
      const inst = getInstitution(p.institutionId);
      return (inst && inst.name.toLowerCase().includes(q)) || (p.reference || '').toLowerCase().includes(q);
    });
  }

  if (!list.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = list.map(p => {
    const inst = getInstitution(p.institutionId);
    return `
      <tr>
        <td>${fmtDate(p.date)}</td>
        <td>${escapeHtml(inst ? inst.name : 'Unknown')}</td>
        <td><span class="chip chip--muted">${PAYMENT_TYPE_LABELS[p.type] || p.type}</span></td>
        <td class="mono">${escapeHtml(p.reference) || '—'}</td>
        <td>${escapeHtml(methodLabel(p.method))}</td>
        <td class="mono amount-cell">${fmtMoney(p.amount)}</td>
      </tr>`;
  }).join('');
};

function methodLabel(m) {
  return { mpesa: 'M-Pesa', bank: 'Bank transfer', cash: 'Cash', cheque: 'Cheque' }[m] || m;
}

function setupPaymentView() {
  document.getElementById('paymentFilters').addEventListener('click', (e) => {
    const btn = e.target.closest('.chip--filter');
    if (!btn) return;
    document.querySelectorAll('#paymentFilters .chip--filter').forEach(c => c.classList.remove('is-active'));
    btn.classList.add('is-active');
    paymentFilterType = btn.dataset.type;
    Views.render('payments');
  });

  document.getElementById('paymentSearch').addEventListener('input', debounce((e) => {
    paymentSearchTerm = e.target.value.trim();
    Views.render('payments');
  }, 150));

  document.getElementById('newPaymentBtn').addEventListener('click', openManualPaymentModal);
}

function openManualPaymentModal() {
  Modal.open(`
    <div class="modal__head">
      <h2>Record payment</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <form class="modal__body form-grid" id="manualPaymentForm">
      <label class="field field--full">Institution
        <select name="institutionId" required>
          ${institutionOptions()}
        </select>
      </label>
      <label class="field field--full">Payment type
        <select name="type" required>
          ${Object.entries(PAYMENT_TYPE_LABELS).map(([k, v]) => `<option value="${k}">${v}</option>`).join('')}
        </select>
      </label>
      <label class="field">Amount (KSh)
        <input type="number" name="amount" required min="0">
      </label>
      <label class="field">Method
        <select name="method" required>
          <option value="mpesa">M-Pesa</option>
          <option value="bank">Bank transfer</option>
          <option value="cash">Cash</option>
          <option value="cheque">Cheque</option>
        </select>
      </label>
      <label class="field field--full">Reference / transaction code
        <input type="text" name="reference" placeholder="e.g. QFT7X2K9LP">
      </label>
      <label class="field field--full">Date
        <input type="date" name="date" value="${todayStr()}" required>
      </label>
      <p class="field--full field-helper">Use this for one-off or manual entries. Subscription, fine and reconnection payments made from an institution's record will also update its connection status automatically — this manual entry only adds a ledger row.</p>
    </form>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn btn--filled" id="submitManualPaymentBtn">Record payment</button>
    </div>
  `, {
    onMount: (root) => {
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));
      root.querySelector('#submitManualPaymentBtn').addEventListener('click', () => {
        const form = root.querySelector('#manualPaymentForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        recordPayment({
          institutionId: fd.get('institutionId'),
          type: fd.get('type'),
          amount: Number(fd.get('amount')),
          method: fd.get('method'),
          reference: fd.get('reference').trim(),
          date: fd.get('date')
        });
        showSnackbar('Payment recorded.');
        Modal.close();
        Views.renderAll();
      });
    }
  });
}
