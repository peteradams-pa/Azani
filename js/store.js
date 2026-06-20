/* Azani — Data store
   Single source of truth for the app, persisted to localStorage.
   Schema is intentionally flat & relational (foreign keys by id) so reports
   can join across collections easily. */

const STORAGE_KEY = 'azani_store_v1';

const DEFAULT_SETTINGS = {
  registrationFee: 5000,
  suspendAfterDays: 1,      // overdue >= this many days => suspended
  disconnectAfterDays: 10,  // overdue > this many days => disconnected
  lateFineAmount: 500,
  reconnectionFee: 1500,
  currency: 'KSh'
};

const DEFAULT_PLANS = [
  { id: 'plan-basic',   name: 'Shule Lite',     speedMbps: 10,  monthlyFee: 3500,  tier: 'Primary & Junior Secondary' },
  { id: 'plan-standard',name: 'Shule Standard', speedMbps: 25,  monthlyFee: 6500,  tier: 'Senior Secondary' },
  { id: 'plan-campus',  name: 'Campus Pro',     speedMbps: 100, monthlyFee: 18000, tier: 'College & University' },
  { id: 'plan-campusx', name: 'Campus Pro Max', speedMbps: 250, monthlyFee: 32000, tier: 'Large College Campus' }
];

const INFRA_CATALOG = [
  { id: 'item-router',    name: 'Wireless Router (Dual-band)', price: 4500 },
  { id: 'item-switch',    name: '24-Port Network Switch',      price: 12000 },
  { id: 'item-ont',       name: 'Fiber ONT Terminal',           price: 6500 },
  { id: 'item-ups',       name: 'UPS Backup Unit',              price: 9000 },
  { id: 'item-cable',     name: 'Structured Cabling (per 100m)',price: 7000 },
  { id: 'item-antenna',   name: 'Outdoor Wireless Antenna',     price: 15000 },
  { id: 'item-ap',        name: 'Indoor Access Point',          price: 5500 },
  { id: 'item-pole',      name: 'Mounting Pole & Bracket Kit',  price: 3200 }
];

function emptyStore() {
  return {
    settings: { ...DEFAULT_SETTINGS },
    plans: JSON.parse(JSON.stringify(DEFAULT_PLANS)),
    institutions: [],
    surveys: [],
    purchases: [],
    installations: [],
    subscriptions: [],
    payments: [],
    activity: [],
    seq: 1
  };
}

let DB = loadStore();

function loadStore() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return emptyStore();
    const parsed = JSON.parse(raw);
    // merge in any new default settings keys added in later versions
    parsed.settings = { ...DEFAULT_SETTINGS, ...(parsed.settings || {}) };
    if (!parsed.plans || !parsed.plans.length) parsed.plans = JSON.parse(JSON.stringify(DEFAULT_PLANS));
    parsed.activity = parsed.activity || [];
    return parsed;
  } catch (e) {
    console.error('Azani store failed to load, starting fresh', e);
    return emptyStore();
  }
}

function saveStore() {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(DB));
}

function nextId(prefix) {
  const id = `${prefix}-${DB.seq.toString(36)}${Date.now().toString(36).slice(-4)}`;
  DB.seq += 1;
  return id;
}

function logActivity(message, kind = 'info') {
  DB.activity.unshift({ id: nextId('act'), message, kind, at: new Date().toISOString() });
  DB.activity = DB.activity.slice(0, 60);
}

/* ---------- Institutions ---------- */
function createInstitution(data) {
  const inst = {
    id: nextId('inst'),
    name: data.name,
    type: data.type,            // primary | junior | senior | college
    location: data.location,
    contactName: data.contactName || '',
    contactPhone: data.contactPhone || '',
    contactEmail: data.contactEmail || '',
    registrationFee: data.registrationFee ?? DB.settings.registrationFee,
    registrationPaid: false,
    status: 'lead',             // lead -> surveyed -> awaiting_infra -> ready_for_install -> installed -> active -> suspended -> disconnected
    createdAt: new Date().toISOString(),
    notes: data.notes || ''
  };
  DB.institutions.push(inst);
  logActivity(`Registered new institution: ${inst.name}`, 'create');
  saveStore();
  return inst;
}

function updateInstitution(id, patch) {
  const inst = DB.institutions.find(i => i.id === id);
  if (!inst) return null;
  Object.assign(inst, patch);
  saveStore();
  return inst;
}

function getInstitution(id) {
  return DB.institutions.find(i => i.id === id);
}

/* ---------- Surveys ---------- */
function createSurvey(data) {
  const survey = {
    id: nextId('srv'),
    institutionId: data.institutionId,
    date: data.date || new Date().toISOString().slice(0, 10),
    distanceFromPop: data.distanceFromPop,
    terrain: data.terrain,
    readiness: data.readiness, // 'ready' | 'not_ready'
    equipmentNeeded: data.equipmentNeeded || [],
    surveyedBy: data.surveyedBy || '',
    notes: data.notes || ''
  };
  DB.surveys.push(survey);

  const inst = getInstitution(data.institutionId);
  if (inst) {
    inst.status = survey.readiness === 'ready' ? 'ready_for_install' : 'awaiting_infra';
    logActivity(`Survey logged for ${inst.name} — ${survey.readiness === 'ready' ? 'ready for install' : 'needs infrastructure'}`, 'survey');
  }
  saveStore();
  return survey;
}

function surveysFor(institutionId) {
  return DB.surveys.filter(s => s.institutionId === institutionId);
}

/* ---------- Infrastructure purchases ---------- */
function createPurchase(data) {
  const purchase = {
    id: nextId('pur'),
    institutionId: data.institutionId,
    items: data.items, // [{itemId, name, price, qty}]
    totalCost: data.items.reduce((sum, it) => sum + it.price * it.qty, 0),
    paid: false,
    date: new Date().toISOString().slice(0, 10)
  };
  DB.purchases.push(purchase);

  const inst = getInstitution(data.institutionId);
  if (inst && inst.status === 'awaiting_infra') {
    // Stays awaiting_infra until paid; once paid, moves to ready_for_install (handled in markPurchasePaid)
  }
  logActivity(`Infrastructure purchase recorded for ${inst ? inst.name : 'institution'} — KSh ${purchase.totalCost.toLocaleString()}`, 'purchase');
  saveStore();
  return purchase;
}

function markPurchasePaid(purchaseId, paymentMeta) {
  const purchase = DB.purchases.find(p => p.id === purchaseId);
  if (!purchase) return null;
  purchase.paid = true;
  recordPayment({
    institutionId: purchase.institutionId,
    type: 'infrastructure',
    amount: purchase.totalCost,
    method: paymentMeta.method,
    reference: paymentMeta.reference,
    relatedId: purchase.id
  });
  const inst = getInstitution(purchase.institutionId);
  if (inst) {
    inst.status = 'ready_for_install';
    logActivity(`${inst.name} is now ready for installation (infrastructure paid)`, 'status');
  }
  saveStore();
  return purchase;
}

function purchasesFor(institutionId) {
  return DB.purchases.filter(p => p.institutionId === institutionId);
}

/* ---------- Installations ---------- */
function createInstallation(data) {
  const installation = {
    id: nextId('ins'),
    institutionId: data.institutionId,
    date: data.date || new Date().toISOString().slice(0, 10),
    technician: data.technician || '',
    equipmentInstalled: data.equipmentInstalled || '',
    fee: data.fee,
    paid: false
  };
  DB.installations.push(installation);

  const inst = getInstitution(data.institutionId);
  if (inst) {
    inst.status = 'installed';
    logActivity(`Installation completed at ${inst.name}`, 'install');
  }
  saveStore();
  return installation;
}

function markInstallationPaid(installationId, paymentMeta) {
  const installation = DB.installations.find(i => i.id === installationId);
  if (!installation) return null;
  installation.paid = true;
  recordPayment({
    institutionId: installation.institutionId,
    type: 'installation',
    amount: installation.fee,
    method: paymentMeta.method,
    reference: paymentMeta.reference,
    relatedId: installation.id
  });
  saveStore();
  return installation;
}

function installationsFor(institutionId) {
  return DB.installations.filter(i => i.institutionId === institutionId);
}

/* ---------- Subscriptions ---------- */
function activateSubscription(data) {
  const plan = DB.plans.find(p => p.id === data.planId);
  const startDate = data.startDate || new Date().toISOString().slice(0, 10);
  const sub = {
    id: nextId('sub'),
    institutionId: data.institutionId,
    planId: data.planId,
    startDate,
    status: 'active',          // active | suspended | disconnected
    nextDueDate: addMonths(startDate, 1),
    lateFinesOwed: 0,
    reconnectionFeesOwed: 0,
    lastBilledPeriod: startDate.slice(0, 7),
    suspendedAt: null,
    disconnectedAt: null
  };
  DB.subscriptions.push(sub);

  const inst = getInstitution(data.institutionId);
  if (inst) {
    inst.status = 'active';
    logActivity(`Subscription activated for ${inst.name} on ${plan ? plan.name : 'plan'}`, 'subscribe');
  }
  saveStore();
  return sub;
}

function subscriptionFor(institutionId) {
  return DB.subscriptions.find(s => s.institutionId === institutionId);
}

/* ---------- Payments ---------- */
function recordPayment(data) {
  const payment = {
    id: nextId('pay'),
    institutionId: data.institutionId,
    type: data.type, // registration | infrastructure | installation | subscription | late_fine | reconnection
    amount: data.amount,
    method: data.method || 'mpesa',
    reference: data.reference || '',
    date: data.date || new Date().toISOString().slice(0, 10),
    relatedId: data.relatedId || null,
    period: data.period || null
  };
  DB.payments.push(payment);
  saveStore();
  return payment;
}

function paymentsFor(institutionId) {
  return DB.payments.filter(p => p.institutionId === institutionId);
}

function payRegistration(institutionId, meta) {
  const inst = getInstitution(institutionId);
  if (!inst) return null;
  inst.registrationPaid = true;
  recordPayment({
    institutionId,
    type: 'registration',
    amount: inst.registrationFee,
    method: meta.method,
    reference: meta.reference
  });
  logActivity(`Registration fee paid by ${inst.name}`, 'payment');
  saveStore();
  return inst;
}

/* ---------- Date helpers (kept here to avoid load-order issues with utils.js) ---------- */
function addMonths(dateStr, months) {
  const d = new Date(dateStr + 'T00:00:00');
  d.setMonth(d.getMonth() + months);
  return d.toISOString().slice(0, 10);
}

function daysBetween(fromStr, toStr) {
  const a = new Date(fromStr + 'T00:00:00');
  const b = new Date(toStr + 'T00:00:00');
  return Math.round((b - a) / 86400000);
}
