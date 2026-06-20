/* Azani — Site surveys view */

Views.renderers.surveys = function renderSurveys() {
  const tbody = document.getElementById('surveyTableBody');
  const empty = document.getElementById('surveyEmpty');
  const list = DB.surveys.slice().sort((a, b) => new Date(b.date) - new Date(a.date));

  if (!list.length) {
    tbody.innerHTML = '';
    empty.hidden = false;
    return;
  }
  empty.hidden = true;

  tbody.innerHTML = list.map(s => {
    const inst = getInstitution(s.institutionId);
    return `
      <tr>
        <td><strong>${escapeHtml(inst ? inst.name : 'Unknown')}</strong></td>
        <td>${fmtDate(s.date)}</td>
        <td>${escapeHtml(s.distanceFromPop || '—')}</td>
        <td>${escapeHtml(s.terrain || '—')}</td>
        <td>${s.readiness === 'ready' ? `<span class="chip chip--success-soft">Ready</span>` : `<span class="chip chip--warning-soft">Not ready</span>`}</td>
        <td>${s.equipmentNeeded.length ? escapeHtml(s.equipmentNeeded.join(', ')) : '—'}</td>
        <td>${escapeHtml(s.surveyedBy || '—')}</td>
        <td><button class="btn btn--text btn--sm" data-open-inst="${s.institutionId}">View institution</button></td>
      </tr>`;
  }).join('');

  tbody.querySelectorAll('[data-open-inst]').forEach(btn => {
    btn.addEventListener('click', () => openInstitutionDetail(btn.dataset.openInst));
  });
};

function setupSurveyView() {
  document.getElementById('newSurveyBtn').addEventListener('click', () => openNewSurveyModal());
}

function openNewSurveyModal(presetInstitutionId) {
  const eligible = i => ['lead', 'awaiting_infra'].includes(i.status) || presetInstitutionId === i.id;
  Modal.open(`
    <div class="modal__head">
      <h2>Log site survey</h2>
      <button class="icon-btn" data-close-modal data-icon="close"></button>
    </div>
    <form class="modal__body form-grid" id="surveyForm">
      <label class="field field--full">Institution
        <select name="institutionId" required>
          ${institutionOptions(eligible)}
        </select>
      </label>
      <label class="field">Survey date
        <input type="date" name="date" value="${todayStr()}" required>
      </label>
      <label class="field">Distance from nearest POP
        <input type="text" name="distanceFromPop" placeholder="e.g. 1.2 km" required>
      </label>
      <label class="field field--full">Terrain / site notes
        <input type="text" name="terrain" placeholder="e.g. Flat compound, line of sight clear">
      </label>
      <label class="field field--full">Readiness
        <select name="readiness" required>
          <option value="ready">Ready — infrastructure already sufficient</option>
          <option value="not_ready">Not ready — needs infrastructure purchase</option>
        </select>
      </label>
      <label class="field field--full">Equipment needed (comma-separated, if not ready)
        <input type="text" name="equipmentNeeded" placeholder="e.g. Outdoor Wireless Antenna, Mounting Pole">
      </label>
      <label class="field">Surveyed by
        <input type="text" name="surveyedBy" placeholder="Field engineer name">
      </label>
      <label class="field field--full">Notes
        <textarea name="notes" rows="2"></textarea>
      </label>
    </form>
    <div class="modal__actions">
      <button class="btn btn--text" data-close-modal>Cancel</button>
      <button class="btn btn--filled" id="submitSurveyBtn">Log survey</button>
    </div>
  `, {
    onMount: (root) => {
      if (presetInstitutionId) root.querySelector('[name="institutionId"]').value = presetInstitutionId;
      root.querySelectorAll('[data-close-modal]').forEach(b => b.addEventListener('click', () => Modal.close()));
      root.querySelector('#submitSurveyBtn').addEventListener('click', () => {
        const form = root.querySelector('#surveyForm');
        if (!form.checkValidity()) { form.reportValidity(); return; }
        const fd = new FormData(form);
        const equipmentNeeded = fd.get('equipmentNeeded').trim()
          ? fd.get('equipmentNeeded').split(',').map(s => s.trim()).filter(Boolean)
          : [];
        createSurvey({
          institutionId: fd.get('institutionId'),
          date: fd.get('date'),
          distanceFromPop: fd.get('distanceFromPop').trim(),
          terrain: fd.get('terrain').trim(),
          readiness: fd.get('readiness'),
          equipmentNeeded,
          surveyedBy: fd.get('surveyedBy').trim(),
          notes: fd.get('notes').trim()
        });
        showSnackbar('Survey logged.');
        Modal.close();
        Views.renderAll();
      });
    }
  });
}
