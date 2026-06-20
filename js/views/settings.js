/* Azani — Settings view */

Views.renderers.settings = function renderSettings() {
  document.getElementById('setSuspendAfter').value = DB.settings.suspendAfterDays;
  document.getElementById('setDisconnectAfter').value = DB.settings.disconnectAfterDays;
  document.getElementById('setLateFine').value = DB.settings.lateFineAmount;
  document.getElementById('setReconnectionFee').value = DB.settings.reconnectionFee;
  document.getElementById('setRegistrationFee').value = DB.settings.registrationFee;
};

function setupSettingsView() {
  document.getElementById('saveSettingsBtn').addEventListener('click', () => {
    const suspendAfter = Number(document.getElementById('setSuspendAfter').value);
    const disconnectAfter = Number(document.getElementById('setDisconnectAfter').value);
    if (disconnectAfter <= suspendAfter) {
      showSnackbar('Disconnect threshold must be greater than the suspend threshold.', 'warning');
      return;
    }
    DB.settings.suspendAfterDays = suspendAfter;
    DB.settings.disconnectAfterDays = disconnectAfter;
    DB.settings.lateFineAmount = Number(document.getElementById('setLateFine').value);
    DB.settings.reconnectionFee = Number(document.getElementById('setReconnectionFee').value);
    DB.settings.registrationFee = Number(document.getElementById('setRegistrationFee').value);
    saveStore();
    showSnackbar('Billing policy saved.');
    runBillingCycle();
    Views.renderAll();
  });

  document.getElementById('exportDataBtn').addEventListener('click', () => {
    downloadFile(`azani-backup-${todayStr()}.json`, JSON.stringify(DB, null, 2), 'application/json');
    showSnackbar('Backup exported.');
  });

  document.getElementById('importDataInput').addEventListener('change', (e) => {
    const file = e.target.files[0];
    if (!file) return;
    const reader = new FileReader();
    reader.onload = () => {
      try {
        const parsed = JSON.parse(reader.result);
        DB = parsed;
        DB.settings = { ...DEFAULT_SETTINGS, ...(DB.settings || {}) };
        saveStore();
        showSnackbar('Backup imported successfully.');
        Views.renderAll();
      } catch (err) {
        showSnackbar('Could not read that file — is it a valid Azani backup?', 'warning');
      }
    };
    reader.readAsText(file);
    e.target.value = '';
  });

  document.getElementById('resetDataBtn').addEventListener('click', () => {
    openConfirmModal({
      title: 'Reset all data',
      message: 'This permanently deletes every institution, payment, survey and subscription stored in this browser. This cannot be undone.',
      confirmLabel: 'Reset everything',
      danger: true,
      onConfirm: () => {
        DB = emptyStore();
        saveStore();
        showSnackbar('All data has been reset.');
        Views.renderAll();
      }
    });
  });

  document.getElementById('seedDataBtn').addEventListener('click', () => {
    openConfirmModal({
      title: 'Load demo dataset',
      message: 'This adds a realistic set of sample institutions, surveys, payments and subscriptions on top of any existing data, so you can explore every feature.',
      confirmLabel: 'Load demo data',
      onConfirm: () => {
        seedDemoData();
        showSnackbar('Demo dataset loaded.');
        Views.renderAll();
      }
    });
  });
}

function openConfirmModal({ title, message, confirmLabel, danger = false, onConfirm }) {
  Modal.open(`
    <div class="modal__head">
      <h2>${escapeHtml(title)}</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <div class="modal__body">
      <p>${escapeHtml(message)}</p>
    </div>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn ${danger ? 'btn--danger-filled' : 'btn--filled'}" id="confirmActionBtn">${escapeHtml(confirmLabel)}</button>
    </div>
  `, {
    onMount: (root) => {
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));
      root.querySelector('#confirmActionBtn').addEventListener('click', () => {
        onConfirm();
        Modal.close();
      });
    }
  });
}

/* ---------- Demo data seeding ---------- */
function seedDemoData() {
  const samples = [
    { name: 'Westlands Primary School', type: 'primary', location: 'Westlands, Nairobi', contactName: 'Grace Achieng', contactPhone: '0712 345 678', stage: 'active', plan: 'plan-basic' },
    { name: 'Nyeri Junior Secondary', type: 'junior', location: 'Nyeri Town, Nyeri', contactName: 'Samuel Kariuki', contactPhone: '0723 456 789', stage: 'active_overdue_suspended', plan: 'plan-standard' },
    { name: 'Mombasa Coast College', type: 'college', location: 'Nyali, Mombasa', contactName: 'Fatuma Hassan', contactPhone: '0734 567 890', stage: 'active_overdue_disconnected', plan: 'plan-campus' },
    { name: 'Kisumu Senior Secondary', type: 'senior', location: 'Milimani, Kisumu', contactName: 'David Otieno', contactPhone: '0745 678 901', stage: 'active', plan: 'plan-standard' },
    { name: 'Eldoret Polytechnic', type: 'college', location: 'Eldoret, Uasin Gishu', contactName: 'Janet Chebet', contactPhone: '0756 789 012', stage: 'installed_no_sub', plan: null },
    { name: 'Machakos Primary School', type: 'primary', location: 'Machakos Town', contactName: 'Peter Mwangi', contactPhone: '0767 890 123', stage: 'ready', plan: null },
    { name: 'Nakuru Junior Secondary', type: 'junior', location: 'Nakuru Town East', contactName: 'Lucy Wambui', contactPhone: '0778 901 234', stage: 'awaiting_infra', plan: null },
    { name: 'Thika Girls High School', type: 'senior', location: 'Thika, Kiambu', contactName: 'Esther Njoki', contactPhone: '0789 012 345', stage: 'lead', plan: null }
  ];

  samples.forEach(s => {
    const inst = createInstitution({ name: s.name, type: s.type, location: s.location, contactName: s.contactName, contactPhone: s.contactPhone });

    if (s.stage === 'lead') return; // unpaid registration, nothing else

    payRegistration(inst.id, { method: 'mpesa', reference: 'REG' + Math.random().toString(36).slice(2, 8).toUpperCase() });

    if (s.stage === 'awaiting_infra') {
      createSurvey({ institutionId: inst.id, distanceFromPop: '2.4 km', terrain: 'Hilly, partial line of sight', readiness: 'not_ready', equipmentNeeded: ['Outdoor Wireless Antenna', 'Mounting Pole & Bracket Kit'], surveyedBy: 'James Mutua' });
      return;
    }

    createSurvey({ institutionId: inst.id, distanceFromPop: '0.8 km', terrain: 'Flat, clear line of sight', readiness: 'ready', surveyedBy: 'James Mutua' });

    if (s.stage === 'ready') return;

    const installation = createInstallation({ institutionId: inst.id, technician: 'Brian Kamau', equipmentInstalled: 'ONT, Indoor AP, UPS', fee: 3500 });
    markInstallationPaid(installation.id, { method: 'mpesa', reference: 'INS' + Math.random().toString(36).slice(2, 8).toUpperCase() });

    if (s.stage === 'installed_no_sub') return;

    const sub = activateSubscription({ institutionId: inst.id, planId: s.plan, startDate: addMonths(todayStr(), -3) });

    // backfill a couple of normal monthly payments
    paySubscriptionPeriod(inst.id, { method: 'mpesa', reference: 'SUB' + Math.random().toString(36).slice(2, 8).toUpperCase() });

    if (s.stage === 'active_overdue_suspended') {
      sub.nextDueDate = addMonths(todayStr(), 0);
      sub.nextDueDate = new Date(Date.now() - 4 * 86400000).toISOString().slice(0, 10);
      saveStore();
    } else if (s.stage === 'active_overdue_disconnected') {
      sub.nextDueDate = new Date(Date.now() - 18 * 86400000).toISOString().slice(0, 10);
      saveStore();
    } else {
      paySubscriptionPeriod(inst.id, { method: 'mpesa', reference: 'SUB' + Math.random().toString(36).slice(2, 8).toUpperCase() });
    }
  });

  runBillingCycle();
}
