/* Azani — Billing engine
   Encapsulates the recurring billing cycle and the late-payment policy:
   - Subscription due date passes with no payment received against that period.
   - 1..suspendAfterDays-1 overdue patterns are tracked but status only flips at threshold.
   - Overdue >= suspendAfterDays and <= disconnectAfterDays  => SUSPENDED + late fine charged once per period.
   - Overdue >  disconnectAfterDays                           => DISCONNECTED.
   - Reconnecting a disconnected (or suspended) institution requires settling arrears
     (subscription balance + late fines) AND paying the reconnection fee, which restores 'active'.

   This module never auto-charges anything that isn't representable as a `payments` row,
   so the ledger stays the single source of truth for money. "Owed" amounts live on the
   subscription record (lateFinesOwed, reconnectionFeesOwed) until paid. */

function subscriptionBalance(sub) {
  const plan = DB.plans.find(p => p.id === sub.planId);
  const monthlyFee = plan ? plan.monthlyFee : 0;
  // Sum subscription-type payments made against this institution since lastBilledPeriod start
  // Simplified model: balance = (periods billed - periods paid) * monthlyFee, tracked via nextDueDate.
  const today = todayStr();
  const overdueDays = sub.status === 'disconnected' || sub.status === 'suspended' || today >= sub.nextDueDate
    ? Math.max(0, daysBetween(sub.nextDueDate, today))
    : 0;
  return { monthlyFee, overdueDays };
}

function evaluateSubscription(sub) {
  const inst = getInstitution(sub.institutionId);
  if (!inst) return;
  const today = todayStr();
  const overdueDays = daysBetween(sub.nextDueDate, today);

  if (overdueDays <= 0) {
    // Not overdue. If it had been suspended due to a now-resolved cycle, leave as-is;
    // reactivation only happens through explicit payment + reconnection flow.
    return;
  }

  if (overdueDays > DB.settings.disconnectAfterDays) {
    if (sub.status !== 'disconnected') {
      sub.status = 'disconnected';
      sub.disconnectedAt = sub.disconnectedAt || new Date().toISOString();
      inst.status = 'disconnected';
      logActivity(`${inst.name} disconnected — ${overdueDays} days overdue`, 'danger');
    }
  } else if (overdueDays >= DB.settings.suspendAfterDays) {
    if (sub.status === 'active') {
      sub.status = 'suspended';
      sub.suspendedAt = new Date().toISOString();
      sub.lateFinesOwed = (sub.lateFinesOwed || 0) + DB.settings.lateFineAmount;
      inst.status = 'suspended';
      logActivity(`${inst.name} suspended — payment ${overdueDays} day(s) overdue. Late fine of ${fmtMoney(DB.settings.lateFineAmount)} applied.`, 'warning');
    }
  }
}

/** Runs the billing cycle across all subscriptions: re-evaluates overdue status. */
function runBillingCycle() {
  let suspendedCount = 0, disconnectedCount = 0;
  DB.subscriptions.forEach(sub => {
    const before = sub.status;
    evaluateSubscription(sub);
    if (sub.status === 'suspended' && before !== 'suspended') suspendedCount++;
    if (sub.status === 'disconnected' && before !== 'disconnected') disconnectedCount++;
  });
  saveStore();
  return { suspendedCount, disconnectedCount };
}

/** Records a subscription payment for the current due period and rolls the due date forward. */
function paySubscriptionPeriod(institutionId, meta) {
  const sub = subscriptionFor(institutionId);
  if (!sub) return null;
  const plan = DB.plans.find(p => p.id === sub.planId);
  const monthlyFee = plan ? plan.monthlyFee : 0;

  recordPayment({
    institutionId,
    type: 'subscription',
    amount: monthlyFee,
    method: meta.method,
    reference: meta.reference,
    period: sub.nextDueDate.slice(0, 7)
  });

  sub.nextDueDate = addMonths(sub.nextDueDate, 1);
  sub.lastBilledPeriod = sub.nextDueDate.slice(0, 7);

  // Paying the current period clears suspension if there are no remaining fines/fees outstanding.
  if (sub.status === 'suspended' && sub.lateFinesOwed === 0) {
    sub.status = 'active';
    sub.suspendedAt = null;
    const inst = getInstitution(institutionId);
    if (inst) inst.status = 'active';
    logActivity(`${inst ? inst.name : 'Institution'} reactivated after subscription payment`, 'success');
  }
  saveStore();
  return sub;
}

/** Pays an outstanding late fine. */
function payLateFine(institutionId, meta) {
  const sub = subscriptionFor(institutionId);
  if (!sub || sub.lateFinesOwed <= 0) return null;
  const amount = sub.lateFinesOwed;
  recordPayment({ institutionId, type: 'late_fine', amount, method: meta.method, reference: meta.reference });
  sub.lateFinesOwed = 0;

  if (sub.status === 'suspended') {
    const overdueDays = daysBetween(sub.nextDueDate, todayStr());
    if (overdueDays <= 0) {
      sub.status = 'active';
      const inst = getInstitution(institutionId);
      if (inst) inst.status = 'active';
      logActivity(`${inst ? inst.name : 'Institution'} reactivated after late fine settled`, 'success');
    }
  }
  saveStore();
  return sub;
}

/** Reconnects a disconnected institution: requires reconnection fee + clears it to active.
    Caller is responsible for ensuring arrears (subscription + fines) are settled first;
    the UI enforces this by showing the full amount due. */
function reconnectInstitution(institutionId, meta) {
  const sub = subscriptionFor(institutionId);
  const inst = getInstitution(institutionId);
  if (!sub || !inst) return null;

  recordPayment({
    institutionId,
    type: 'reconnection',
    amount: DB.settings.reconnectionFee,
    method: meta.method,
    reference: meta.reference
  });

  sub.status = 'active';
  sub.disconnectedAt = null;
  sub.suspendedAt = null;
  sub.nextDueDate = addMonths(todayStr(), 1);
  inst.status = 'active';
  logActivity(`${inst.name} reconnected after reconnection fee paid`, 'success');
  saveStore();
  return sub;
}

/** Total amount currently owed by an institution across subscription, fines & reconnection. */
function totalOwed(institutionId) {
  const sub = subscriptionFor(institutionId);
  if (!sub) return 0;
  const { monthlyFee, overdueDays } = subscriptionBalance(sub);
  let owed = overdueDays > 0 ? monthlyFee : 0;
  owed += sub.lateFinesOwed || 0;
  if (sub.status === 'disconnected') owed += DB.settings.reconnectionFee;
  return owed;
}
