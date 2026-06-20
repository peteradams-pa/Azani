/* Azani — Installations view */

Views.renderers.installations = function renderInstallations() {
  const tbody = document.getElementById('installTableBody');
  const empty = document.getElementById('installEmpty');
  const list = DB.installations.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = list.map(i => {
    const inst = getInstitution(i.institutionId);
    return `
      <tr>
        <td><strong>${escapeHtml(inst ? inst.name : 'Unknown')}</strong></td>
        <td>${fmtDate(i.date)}</td>
        <td>${escapeHtml(i.technician || '—')}</td>
        <td>${escapeHtml(i.equipmentInstalled || '—')}</td>
        <td>${fmtMoney(i.fee)}</td>
        <td>${i.paid ? `<span class="chip chip--success-soft">Paid</span>` : `<span class="chip chip--warning-soft">Unpaid</span>`}</td>
        <td>${i.paid ? '' : `<button class="btn btn--tonal btn--sm" data-pay-install="${i.id}">Record payment</button>`}</td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-pay-install]').forEach(btn => {
    btn.addEventListener('click', () => {
      const installation = DB.installations.find(i => i.id === btn.dataset.payInstall);
      const inst = getInstitution(installation.institutionId);
      openPaymentCaptureModal({
        title: `Installation payment — ${inst.name}`,
        amount: installation.fee,
        onConfirm: (meta) => {
          markInstallationPaid(installation.id, meta);
          showSnackbar('Installation payment recorded.');
          Modal.close();
          Views.renderAll();
        }
      });
    });
  });
};

function setupInstallationView() {
  document.getElementById('newInstallBtn').addEventListener('click', () => openNewInstallModal());
}

function openNewInstallModal(presetInstitutionId) {
  const eligible = i => i.status === 'ready_for_install' || presetInstitutionId === i.id;
  Modal.open(`
    <div class="modal__head">
      <h2>Log installation</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <form class="modal__body form-grid" id="installForm">
      <label class="field field--full">Institution
        <select name="institutionId" required>
          ${institutionOptions(eligible)}
        </select>
      </label>
      <label class="field">Installation date
        <input type="date" name="date" value="${todayStr()}" required>
      </label>
      <label class="field">Technician
        <input type="text" name="technician" placeholder="Lead installer name">
      </label>
      <label class="field field--full">Equipment installed
        <input type="text" name="equipmentInstalled" placeholder="e.g. Outdoor antenna, ONT, 1x AP">
      </label>
      <label class="field">Installation fee (KSh)
        <input type="number" name="fee" min="0" value="3500" required>
      </label>
    </form>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn btn--filled" id="submitInstallBtn">Log installation</button>
    </div>
  `, {
    onMount: (root) => {
      if (presetInstitutionId) root.querySelector('[name="institutionId"]').value = presetInstitutionId;
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));
      root.querySelector('#submitInstallBtn').addEventListener('click', () => {
        const form = root.querySelector('#installForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        const installation = createInstallation({
          institutionId: fd.get('institutionId'),
          date: fd.get('date'),
          technician: fd.get('technician').trim(),
          equipmentInstalled: fd.get('equipmentInstalled').trim(),
          fee: Number(fd.get('fee'))
        });
        showSnackbar('Installation logged. Collect installation fee, then activate a subscription plan.');
        Modal.close();
        Views.renderAll();
      });
    }
  });
}
