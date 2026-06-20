/* Azani — Infrastructure purchases view */

Views.renderers.infrastructure = function renderInfrastructure() {
  renderCatalogStrip();
  renderPurchaseTable();
};

function renderCatalogStrip() {
  document.getElementById('catalogStrip').innerHTML = INFRA_CATALOG.map(item => `
    <article class="catalog-card">
      <span class="catalog-card__icon" data-icon="box"></span>
      <p class="catalog-card__name">${item.name}</p>
      <p class="catalog-card__price">${fmtMoney(item.price)}</p>
    </article>
  `).join('');
  renderIcons(document.getElementById('catalogStrip'));
}

function renderPurchaseTable() {
  const tbody = document.getElementById('purchaseTableBody');
  const empty = document.getElementById('purchaseEmpty');
  const list = DB.purchases.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = list.map(p => {
    const inst = getInstitution(p.institutionId);
    const itemSummary = p.items.map(it => `${it.name} ×${it.qty}`).join(', ');
    return `
      <tr>
        <td><strong>${escapeHtml(inst ? inst.name : 'Unknown')}</strong></td>
        <td>${escapeHtml(itemSummary)}</td>
        <td>${fmtMoney(p.totalCost)}</td>
        <td>${p.paid ? `<span class="chip chip--success-soft">Paid</span>` : `<span class="chip chip--warning-soft">Unpaid</span>`}</td>
        <td>${fmtDate(p.date)}</td>
        <td>${p.paid ? '' : `<button class="btn btn--tonal btn--sm" data-pay-purchase="${p.id}">Record payment</button>`}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-pay-purchase]').forEach(btn => {
    btn.addEventListener('click', () => {
      const purchase = DB.purchases.find(p => p.id === btn.dataset.payPurchase);
      const inst = getInstitution(purchase.institutionId);
      openPaymentCaptureModal({
        title: `Infrastructure payment — ${inst.name}`,
        amount: purchase.totalCost,
        onConfirm: (meta) => {
          markPurchasePaid(purchase.id, meta);
          showSnackbar('Infrastructure payment recorded. Institution marked ready for install.');
          Modal.close();
          Views.renderAll();
        }
      });
    });
  });
}

function setupInfrastructureView() {
  document.getElementById('newPurchaseBtn').addEventListener('click', () => openNewPurchaseModal());
}

function openNewPurchaseModal(presetInstitutionId) {
  const eligible = i => i.status === 'awaiting_infra' || presetInstitutionId === i.id;
  Modal.open(`
    <div class="modal__head">
      <h2>Record infrastructure purchase</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <form class="modal__body form-grid" id="purchaseForm">
      <label class="field field--full">Institution
        <select name="institutionId" required>
          ${institutionOptions(eligible)}
        </select>
      </label>
      <div class="field field--full">
        <span class="field__label">Items</span>
        <div class="item-picker" id="itemPicker">
          ${INFRA_CATALOG.map(item => `
            <label class="item-row">
              <input type="checkbox" data-item-id="${item.id}" class="item-check">
              <span class="item-row__name">${item.name}</span>
              <span class="item-row__price">${fmtMoney(item.price)}</span>
              <input type="number" min="1" value="1" class="item-row__qty" data-qty-id="${item.id}" disabled>
            </label>
          `).join('')}
        </div>
      </div>
      <p class="field--full total-line">Total: <strong id="purchaseTotal">${fmtMoney(0)}</strong></p>
    </form>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn btn--filled" id="submitPurchaseBtn">Record purchase</button>
    </div>
  `, {
    onMount: (root) => {
      if (presetInstitutionId) root.querySelector('[name="institutionId"]').value = presetInstitutionId;
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));

      const recalc = () => {
        let total = 0;
        root.querySelectorAll('.item-check').forEach(chk => {
          const id = chk.dataset.itemId;
          const qtyInput = root.querySelector(`[data-qty-id="${id}"]`);
          qtyInput.disabled = !chk.checked;
          if (chk.checked) {
            const item = INFRA_CATALOG.find(i => i.id === id);
            total += item.price * Number(qtyInput.value || 1);
          }
        });
        root.querySelector('#purchaseTotal').textContent = fmtMoney(total);
      };
      root.querySelectorAll('.item-check, .item-row__qty').forEach(el => el.addEventListener('input', recalc));

      root.querySelector('#submitPurchaseBtn').addEventListener('click', () => {
        const form = root.querySelector('#purchaseForm');
        const institutionId = form.institutionId.value;
        if (!institutionId) { showSnackbar('Select an institution first.', 'warning'); return; }
        const items = [];
        root.querySelectorAll('.item-check:checked').forEach(chk => {
          const id = chk.dataset.itemId;
          const item = INFRA_CATALOG.find(i => i.id === id);
          const qty = Number(root.querySelector(`[data-qty-id="${id}"]`).value || 1);
          items.push({ itemId: id, name: item.name, price: item.price, qty });
        });
        if (!items.length) { showSnackbar('Select at least one item.', 'warning'); return; }
        createPurchase({ institutionId, items });
        showSnackbar('Infrastructure purchase recorded.');
        Modal.close();
        Views.renderAll();
      });
    }
  });
}
