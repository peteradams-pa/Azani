/* Azani — App bootstrap */

document.addEventListener('DOMContentLoaded', () => {
  renderIcons();

  // Navigation rail
  document.querySelectorAll('.rail__item[data-view]').forEach(btn => {
    btn.addEventListener('click', () => Views.goto(btn.dataset.view));
  });

  // Mobile menu toggle
  const menuToggle = document.getElementById('menuToggle');
  menuToggle.addEventListener('click', () => {
    document.getElementById('rail').classList.toggle('is-open');
    menuToggle.classList.toggle('is-active');
  });

  // Mobile FAB + topbar quick-add both jump to institutions and open the register modal
  document.getElementById('mobileFab').addEventListener('click', () => {
    Views.goto('institutions');
    setTimeout(() => document.getElementById('newInstitutionBtn')?.click(), 80);
  });
  document.getElementById('topbarAddBtn').addEventListener('click', () => {
    Views.goto('institutions');
    setTimeout(() => document.getElementById('newInstitutionBtn')?.click(), 80);
  });

  // Run billing cycle button
  document.getElementById('runBillingBtn').addEventListener('click', () => {
    const { suspendedCount, disconnectedCount } = runBillingCycle();
    if (suspendedCount === 0 && disconnectedCount === 0) {
      showSnackbar('Billing cycle run — no status changes needed.');
    } else {
      showSnackbar(`Billing cycle complete: ${suspendedCount} suspended, ${disconnectedCount} disconnected.`, 'warning');
    }
    Views.renderAll();
  });

  // Wire up per-view setup (event listeners that only need to attach once)
  setupInstitutionFilters();
  setupSurveyView();
  setupInfrastructureView();
  setupInstallationView();
  setupSubscriptionView();
  setupPaymentView();
  setupReportsView();
  setupSettingsView();

  // Run billing evaluation once on load so overdue states are always current
  runBillingCycle();

  // Initial render
  Views.goto('dashboard');
  tickClock();
  setInterval(tickClock, 30000);
});
