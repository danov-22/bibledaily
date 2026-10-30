import { mountReviews } from './reviews.js';
import { createReadingPdf } from './pdf-export.js';
import { bibleData } from './data.js';
import { renderLandingPage } from './landing.js';


const LEGACY_STORAGE_KEY = 'quiet-word-reading-companion-v1';
const DEMO_STORAGE_KEY = 'bibledaily-demo-data-v2';
const ACCOUNT_STORAGE_PREFIX = 'bibledaily-account-cache-v1:';
const PENDING_SYNC_PREFIX = 'bibledaily-pending-sync-v1:';
const THEME_STORAGE_KEY = 'bibledaily-theme-v1';
const PREFERRED_TRANSLATION_KEY = 'bibledaily-preferred-translation-v1';
const app = document.querySelector('#app');
const planList = bibleData.plans || [];
const planById = new Map(planList.map((plan) => [plan.id, plan]));
const DEFAULT_SELECTIONS = { ot: 'ot-1-year', nt: 'nt-1-year' };
const demoMode = new URLSearchParams(location.search).get('demo') === '1';
let combinedPlanCache = null;
let authUser = null;
let loginAvailable = false;
let loginMessage = '';
let model = demoMode
  ? readSavedModel(DEMO_STORAGE_KEY)
  : { activePlans: { ...DEFAULT_SELECTIONS }, plans: {} };
let scheduleQuery = '';
let progressQuery = '';
let syncTimers = new Map();

function readSavedModel(storageKey = LEGACY_STORAGE_KEY) {
  try {
    const saved = JSON.parse(localStorage.getItem(storageKey) || '{}');
    const plans = saved.plans && typeof saved.plans === 'object' ? saved.plans : {};
    const activePlans = normalizeSelections(saved.activePlans, saved.activePlanId);
    migrateLegacyPlans(plans);
    return { activePlans, plans };
  } catch {
    return { activePlans: { ...DEFAULT_SELECTIONS }, plans: {} };
  }
}

function normalizeSelections(selections, legacyPlanId) {
  if (
    planById.get(selections?.ot)?.category === 'Old Testament'
    && planById.get(selections?.nt)?.category === 'New Testament'
  ) {
    return { ot: selections.ot, nt: selections.nt };
  }
  const legacyPlan = planById.get(legacyPlanId);
  if (legacyPlan?.category === 'Old Testament') {
    return { ot: legacyPlan.id, nt: DEFAULT_SELECTIONS.nt };
  }
  if (legacyPlan?.category === 'New Testament') {
    return { ot: DEFAULT_SELECTIONS.ot, nt: legacyPlan.id };
  }
  return { ...DEFAULT_SELECTIONS };
}

function combinationId(selections) {
  return `combo:${selections.ot}::${selections.nt}`;
}

function migrateLegacyPlans(plans) {
  for (const [legacyId, legacy] of Object.entries(plans)) {
    const legacyPlan = planById.get(legacyId);
    if (!legacyPlan || legacyId.startsWith('combo:')) continue;

    const side = legacyPlan.category === 'Old Testament' ? 'ot' : 'nt';
    const selections = side === 'ot'
      ? { ot: legacyId, nt: DEFAULT_SELECTIONS.nt }
      : { ot: DEFAULT_SELECTIONS.ot, nt: legacyId };
    const id = combinationId(selections);
    let state = plans[id];
    if (!state) {
      state = {
        ...emptyPlanState(legacy.startDate),
        notes: legacy.notes && typeof legacy.notes === 'object' ? { ...legacy.notes } : {},
        weekNotes: legacy.weekNotes && typeof legacy.weekNotes === 'object' ? { ...legacy.weekNotes } : {}
      };
      plans[id] = state;
    } else {
      state.notes = { ...legacy.notes, ...state.notes };
      state.weekNotes = { ...legacy.weekNotes, ...state.weekNotes };
    }

    state.partialCompleted = state.partialCompleted && typeof state.partialCompleted === 'object'
      ? state.partialCompleted
      : {};
    const completionTimes = new Map(
      (Array.isArray(legacy.completionOrder) ? legacy.completionOrder : [])
        .map((entry) => [Number(entry.day), entry.at])
    );
    for (const day of Array.isArray(legacy.completed) ? legacy.completed : []) {
      const numericDay = Number(day);
      if (state.completed?.includes(numericDay)) continue;
      const partial = new Set(state.partialCompleted[numericDay] || []);
      partial.add(side);
      if (partial.has('ot') && partial.has('nt')) {
        state.completed = Array.isArray(state.completed) ? state.completed : [];
        state.completionOrder = Array.isArray(state.completionOrder) ? state.completionOrder : [];
        state.completed.push(numericDay);
        state.completionOrder.push({ day: numericDay, at: completionTimes.get(numericDay) || new Date().toISOString() });
        delete state.partialCompleted[numericDay];
      } else {
        state.partialCompleted[numericDay] = [...partial];
      }
    }
  }
}

function emptyPlanState(startDate = localDateInput(new Date())) {
  return { startDate, completed: [], completionOrder: [], partialCompleted: {}, notes: {}, noteSubmittedAt: {}, weekNotes: {} };
}

function planState(planId = combinationId(model.activePlans)) {
  if (!model.plans[planId]) model.plans[planId] = emptyPlanState();
  const state = model.plans[planId];
  state.completed = Array.isArray(state.completed) ? state.completed : [];
  state.completionOrder = Array.isArray(state.completionOrder) ? state.completionOrder : [];
  state.partialCompleted = state.partialCompleted && typeof state.partialCompleted === 'object' ? state.partialCompleted : {};
  state.notes = state.notes && typeof state.notes === 'object' ? state.notes : {};
  state.weekNotes = state.weekNotes && typeof state.weekNotes === 'object' ? state.weekNotes : {};
  state.noteSubmittedAt = state.noteSubmittedAt && typeof state.noteSubmittedAt === 'object' ? state.noteSubmittedAt : {};
  state.startDate = state.startDate || localDateInput(new Date());
  return state;
}

function persist() {
  const storageKey = demoMode
    ? DEMO_STORAGE_KEY
    : authUser
      ? `${ACCOUNT_STORAGE_PREFIX}${encodeURIComponent(authUser.id)}`
      : '';
  if (!storageKey) return;
  try {
    localStorage.setItem(storageKey, JSON.stringify(model));
  } catch {
    announce('This browser could not save your local copy. Check available device storage.');
  }
}

function normalizeRemoteModel(value) {
  const source = value && typeof value === 'object' ? value : {};
  const plans = source.plans && typeof source.plans === 'object' ? source.plans : {};
  for (const [id, state] of Object.entries(plans)) {
    if (!state || typeof state !== 'object') {
      plans[id] = emptyPlanState();
      continue;
    }
    plans[id] = {
      ...emptyPlanState(state.startDate),
      ...state,
      completed: Array.isArray(state.completed) ? state.completed.map(Number).filter(Number.isFinite) : [],
      completionOrder: Array.isArray(state.completionOrder) ? state.completionOrder : [],
      noteSubmittedAt: state.noteSubmittedAt && typeof state.noteSubmittedAt === 'object' ? state.noteSubmittedAt : {},
      partialCompleted: state.partialCompleted && typeof state.partialCompleted === 'object' ? state.partialCompleted : {},
      notes: state.notes && typeof state.notes === 'object' ? state.notes : {},
      weekNotes: state.weekNotes && typeof state.weekNotes === 'object' ? state.weekNotes : {}
    };
  }
  return {
    activePlans: normalizeSelections(source.activePlans),
    plans
  };
}

function readTheme() {
  try {
    const stored = localStorage.getItem(THEME_STORAGE_KEY);
    if (stored === 'dark') return 'warm';
    if (stored === 'light' || stored === 'warm') return stored;
  } catch {
    // Use the light theme when storage is unavailable.
  }
  return 'light';
}

function applyTheme(theme) {
  const next = theme === 'warm' ? 'warm' : 'light';
  document.documentElement.dataset.theme = next;
  document.documentElement.style.colorScheme = 'light';
  const metaTheme = document.querySelector('meta[name="theme-color"]');
  if (metaTheme) metaTheme.content = next === 'warm' ? '#f7f0e5' : '#ffffff';
  syncThemeButtons(next);
  try {
    localStorage.setItem(THEME_STORAGE_KEY, next);
  } catch {
    // The current page still changes theme when storage is unavailable.
  }
}

function syncThemeButtons(theme = document.documentElement.dataset.theme || 'light') {
  document.querySelectorAll('[data-action="toggle-theme"]').forEach((button) => {
    button.textContent = theme === 'warm' ? 'Light mode' : 'Warm mode';
    button.setAttribute('aria-label', `Switch to ${theme === 'warm' ? 'light' : 'warm'} mode`);
    button.setAttribute('aria-pressed', String(theme === 'warm'));
  });
}

function toggleTheme() {
  applyTheme(document.documentElement.dataset.theme === 'warm' ? 'light' : 'warm');
}

applyTheme(readTheme());

function announce(message) {
  const status = app.querySelector('[data-status]');
  if (status) status.textContent = message;
}

function apiUrl(path) {
  return new URL(`api/${path}`, document.baseURI).href;
}

function setChrome() {
  const signedIn = Boolean(authUser) && !demoMode;
  document.body.classList.toggle('logged-out', !signedIn && !demoMode);
  document.body.classList.toggle('has-account', signedIn);
  document.body.classList.toggle('demo-mode', demoMode);

  const email = document.querySelector('[data-account-email]');
  const sheetLink = document.querySelector('[data-sheet-link]');
  const signOut = document.querySelector('[data-action="sign-out"]');
  if (email) {
    email.hidden = !signedIn && !demoMode;
    email.textContent = demoMode ? 'Demo preview' : (authUser?.email || '');
  }
  if (sheetLink) {
    sheetLink.hidden = !signedIn;
    if (signedIn) {
      sheetLink.href = authUser.spreadsheetUrl;
      sheetLink.title = 'Open your private BibleDaily Google Sheet';
    }
  }
  if (signOut) signOut.hidden = !signedIn;
}

function updateSyncStatus(message) {
  const indicator = document.querySelector('[data-sync-status]');
  if (indicator) indicator.textContent = message;
}

function pendingStorageKey(userId) {
  return `${PENDING_SYNC_PREFIX}${encodeURIComponent(userId)}`;
}

function pendingChangeKey(payload) {
  if (payload.kind === 'settings') return `settings:${payload.otPlan}:${payload.ntPlan}`;
  if (payload.kind === 'entry') return `entry:${payload.comboId}:${payload.day}`;
  if (payload.kind === 'week') return `week:${payload.comboId}:${payload.week}`;
  return `${payload.kind}:${Date.now()}`;
}

function readPendingChanges(userId) {
  try {
    const records = JSON.parse(localStorage.getItem(pendingStorageKey(userId)) || '[]');
    return Array.isArray(records)
      ? records.filter((item) => item && typeof item === 'object' && ['settings', 'entry', 'week'].includes(item.kind))
      : [];
  } catch {
    return [];
  }
}

function rememberPendingChange(userId, payload) {
  try {
    const records = readPendingChanges(userId);
    const key = pendingChangeKey(payload);
    const next = records.filter((item) => pendingChangeKey(item) !== key);
    next.push(payload);
    localStorage.setItem(pendingStorageKey(userId), JSON.stringify(next));
  } catch {
    // The account's live sheet remains the source of truth if local storage is full.
  }
}

function forgetPendingChange(userId, payload) {
  try {
    const key = pendingChangeKey(payload);
    const next = readPendingChanges(userId).filter((item) => pendingChangeKey(item) !== key);
    if (next.length) localStorage.setItem(pendingStorageKey(userId), JSON.stringify(next));
    else localStorage.removeItem(pendingStorageKey(userId));
  } catch {
    // A stale pending record is harmless; it will be retried at the next sign-in.
  }
}

function applyPendingChange(payload) {
  if (payload.kind === 'settings') {
    if (
      planById.get(payload.otPlan)?.category !== 'Old Testament'
      || planById.get(payload.ntPlan)?.category !== 'New Testament'
    ) return;
    model.activePlans = { ot: payload.otPlan, nt: payload.ntPlan };
    combinedPlanCache = null;
    planState().startDate = payload.startDate;
    return;
  }
  if (payload.kind === 'entry') {
    const state = planState(payload.comboId);
    const day = Number(payload.day);
    if (payload.completed) {
      if (!state.completed.includes(day)) state.completed.push(day);
      state.completionOrder = state.completionOrder.filter((item) => Number(item.day) !== day);
      state.completionOrder.push({ day, at: payload.completedAt || new Date().toISOString(), date: payload.completedDate || undefined });
    } else {
      state.completed = state.completed.filter((item) => Number(item) !== day);
      state.completionOrder = state.completionOrder.filter((item) => Number(item.day) !== day);
    }
    const sides = Array.isArray(payload.partialSides)
      ? payload.partialSides.filter((side) => side === 'ot' || side === 'nt')
      : [];
    if (sides.length) state.partialCompleted[day] = [...new Set(sides)];
    else delete state.partialCompleted[day];
    if (payload.notesSubmittedAt) state.noteSubmittedAt[day] = payload.notesSubmittedAt;
    if (Object.values(payload.notes || {}).some(Boolean)) state.notes[day] = payload.notes;
    else delete state.notes[day];
    return;
  }
  if (payload.kind === 'week') {
    const state = planState(payload.comboId);
    if (payload.reflection) state.weekNotes[payload.week] = payload.reflection;
    else delete state.weekNotes[payload.week];
  }
}

async function restorePendingChanges(userId) {
  const pending = readPendingChanges(userId);
  if (!pending.length) return false;
  pending.sort((a, b) => Number(a.kind !== 'settings') - Number(b.kind !== 'settings'));
  pending.forEach(applyPendingChange);
  persist();
  for (const payload of pending) await saveCloudChange(payload);
  return pending.some((payload) => payload.kind === 'settings');
}

async function saveCloudChange(payload) {
  if (!authUser || demoMode) return;
  const userId = authUser.id;
  rememberPendingChange(userId, payload);
  updateSyncStatus('Saving to Google Sheets…');
  try {
    const response = await fetch(apiUrl('data'), {
      method: 'PUT',
      credentials: 'same-origin',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify(payload)
    });
    const result = await response.json();
    if (!response.ok) {
      if (response.status === 401) updateSyncStatus('Google sign-in needs renewal');
      throw new Error(result.error || 'Could not sync this change.');
    }
    if (authUser?.id === userId) {
      forgetPendingChange(userId, payload);
      updateSyncStatus('Saved to your Google Sheet');
    }
  } catch (error) {
    if (authUser?.id === userId) {
      updateSyncStatus(error.message || 'Not synced yet — retry after reconnecting');
    }
  }
}

function queueCloudChange(key, makePayload, immediate = false) {
  if (!authUser || demoMode) return;
  const queuedPayload = makePayload();
  if (queuedPayload) rememberPendingChange(authUser.id, queuedPayload);
  clearTimeout(syncTimers.get(key));
  const wait = immediate ? 0 : 1000;
  updateSyncStatus('Changes waiting to sync…');
  const timer = window.setTimeout(() => {
    syncTimers.delete(key);
    if (!authUser || demoMode) return;
    saveCloudChange(makePayload());
  }, wait);
  syncTimers.set(key, timer);
}

function entryPayload(day) {
  const entry = dayReading(day);
  if (!entry) return null;
  const state = planState();
  const completion = state.completionOrder.find((item) => Number(item.day) === Number(day));
  const date = dateForDay(day);
  return {
    kind: 'entry',
    comboId: activePlan().id,
    day: Number(day),
    date: localDateInput(date),
    otPlan: model.activePlans.ot,
    ntPlan: model.activePlans.nt,
    otReading: entry.otReading,
    ntReading: entry.ntReading,
    completed: isComplete(day),
    completedAt: completion?.at || '',
    completedDate: completion?.date || (completionDate(day) ? localDateInput(completionDate(day)) : ''),
    notesSubmittedAt: state.noteSubmittedAt[day] || '',
    originalDate: localDateInput(originalDateForDay(day)),
    partialSides: [...partialSides(day)],
    notes: { ...(state.notes[day] || {}) }
  };
}

function queueEntrySync(day) {
  const payload = entryPayload(day);
  if (!payload) return;
  queueCloudChange(`entry:${payload.comboId}:${day}`, () => entryPayload(day));
}

function settingsPayload() {
  const plan = activePlan();
  return {
    kind: 'settings',
    otPlan: model.activePlans.ot,
    ntPlan: model.activePlans.nt,
    startDate: planState().startDate,
    schedule: plan.days.map((entry) => ({
      day: entry.day,
      date: localDateInput(dateForDay(entry.day)),
      otReading: entry.otReading,
      ntReading: entry.ntReading
    }))
  };
}

function queueSettingsSync(immediate = false) {
  queueCloudChange('settings', settingsPayload, immediate);
}

function queueWeeklySync(week) {
  const comboId = activePlan().id;
  const reflection = planState().weekNotes[week] || '';
  queueCloudChange(`week:${comboId}:${week}`, () => ({
    kind: 'week',
    comboId,
    week: Number(week),
    reflection: planState(comboId).weekNotes[week] || ''
  }));
  return reflection;
}

function activePlan() {
  const id = combinationId(model.activePlans);
  if (combinedPlanCache?.id === id) return combinedPlanCache;
  const otPlan = planById.get(model.activePlans.ot) || planById.get(DEFAULT_SELECTIONS.ot);
  const ntPlan = planById.get(model.activePlans.nt) || planById.get(DEFAULT_SELECTIONS.nt);
  const otDays = new Map((otPlan?.days || []).map((entry) => [Number(entry.day), entry.reading]));
  const ntDays = new Map((ntPlan?.days || []).map((entry) => [Number(entry.day), entry.reading]));
  const totalDays = Math.max(otDays.size, ntDays.size);
  const days = Array.from({ length: totalDays }, (_, index) => {
    const day = index + 1;
    const otReading = otDays.get(day) || '';
    const ntReading = ntDays.get(day) || '';
    return {
      day,
      otReading,
      ntReading,
      reading: [otReading, ntReading].filter(Boolean).join(' · ')
    };
  });
  combinedPlanCache = {
    id,
    title: `${otPlan?.duration || '1 year'} OT + ${ntPlan?.duration || '1 year'} NT`,
    category: 'Old Testament + New Testament',
    duration: `${totalDays} days`,
    otPlan,
    ntPlan,
    days
  };
  return combinedPlanCache;
}

const TRANSLATION_URLS = {
  ESV: 'https://www.esv.org/',
  'NASB 2020': 'https://nasb.literalword.com/',
  RCV: 'https://bibleread.online/bible/',
  'NET Bible': 'https://netbible.org/',
  LSB: 'https://read.lsbible.org/',
  NKJV: 'https://www.biblegateway.com/versions/New-King-James-Version-NKJV-Bible/',
  CSB: 'https://read.csbible.com/',
  'TB2 / LAI Bible': 'https://tb2.alkitab.or.id/'
};

const STUDY_REFERENCE_URLS = {
  'Interlinear Scripture4all': 'https://www.scripture4all.org/',
  BibleHub: 'https://biblehub.com/'
};

const NEW_TESTAMENT_GROUPS = new Set([
  'The Gospels',
  'History',
  'Paul Epistles (Letters from Paul)',
  'General Epistles',
  'Prophecy'
]);

function planOptions(side) {
  const category = side === 'ot' ? 'Old Testament' : 'New Testament';
  return planList.filter((plan) => plan.category === category);
}

function sideLabel(side) {
  return side === 'ot' ? 'Old Testament' : 'New Testament';
}

function portionMarkup(label, reading) {
  return `<div class="portion-block"><span>${label}</span><strong>${reading ? esc(reading) : 'Plan complete'}</strong></div>`;
}

function partialSides(day) {
  return planState().partialCompleted[Number(day)] || [];
}

function dayStatus(day) {
  if (isComplete(day)) return 'Completed';
  const partial = partialSides(day);
  if (partial.length) return `Partially read · ${partial.map(sideLabel).join(' + ')}`;
  const note = planState().notes[day] || {};
  return Object.values(note).some(Boolean) ? 'Notes saved' : 'Not complete';
}

const BOOK_ALIASES = {
  Genesis: ['Gen'],
  Exodus: ['Ex', 'Exo'],
  Leviticus: ['Lev'],
  Numbers: ['Num'],
  Deuteronomy: ['Deu', 'Deut'],
  Joshua: ['Jos', 'Josh'],
  Judges: ['Jdg', 'Judg'],
  Ruth: ['Rut'],
  '1 Samuel': ['1 Sa', '1 Sam'],
  '2 Samuel': ['2 Sa', '2 Sam'],
  '1 Kings': ['1 Kgs', '1 Kings'],
  '2 Kings': ['2 Kgs', '2 Kings'],
  '1 Chronicles': ['1 Chr'],
  '2 Chronicles': ['2 Chr'],
  Ezra: ['Ezr'],
  Nehemiah: ['Neh'],
  Esther: ['Est'],
  Psalms: ['Ps', 'Psa', 'Psalm'],
  Proverbs: ['Pro', 'Prov'],
  Ecclesiastes: ['Ecc', 'Eccl'],
  'Song of Solomon (Song of Songs)': ['S S', 'Sos', 'Song of Solomon', 'Song of Songs'],
  Ezekiel: ['Eze', 'Ezek'],
  Obadiah: ['Ob', 'Oba'],
  Jonah: ['Jon'],
  Amos: ['Am'],
  Zephaniah: ['Zep', 'Zeph'],
  Zechariah: ['Zec', 'Zech'],
  Matthew: ['Mat', 'Matt'],
  Mark: ['Mk'],
  Luke: ['Luk'],
  Romans: ['Rom'],
  '1 Corinthians': ['1 Co', '1 Cor'],
  '2 Corinthians': ['2 Co', '2 Cor'],
  Philippians: ['Php', 'Phil'],
  '1 Thessalonians': ['1 Th', '1 Thes'],
  '2 Thessalonians': ['2 Th', '2 Thes'],
  '1 Timothy': ['1 Ti', '1 Tim'],
  '2 Timothy': ['2 Ti', '2 Tim'],
  Titus: ['Tit', 'Ti'],
  Philemon: ['Phlm'],
  James: ['Jam'],
  '1 Peter': ['1 Pe', '1 Ptr', '1 Pet'],
  '2 Peter': ['2 Pe', '2 Ptr', '2 Pet'],
  '1 John': ['1 Jn'],
  '2 John': ['2 Jn'],
  '3 John': ['3 Jn'],
  Revelation: ['Rev'],
};

function hasBookReference(reading, book) {
  const readingWords = String(reading).toLowerCase().match(/[a-z0-9]+/g) || [];
  const aliases = [
    book.name,
    book.abbreviation,
    ...(BOOK_ALIASES[book.name] || []),
  ];

  return aliases.some((alias) => {
    const words = String(alias).toLowerCase().match(/[a-z0-9]+/g) || [];
    if (!words.length) return false;
    for (let start = 0; start <= readingWords.length - words.length; start += 1) {
      if (!words.every((word, index) => readingWords[start + index] === word)) continue;
      const previousWord = readingWords[start - 1];
      if (book.name === 'John' && words.join(' ') === 'john' && ['1', '2', '3'].includes(previousWord)) continue;
      if (book.name === 'Titus' && words.join(' ') === 'ti' && ['1', '2'].includes(previousWord)) continue;
      return true;
    }
    return false;
  });
}

function localDateInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function dateFromInput(value) {
  const [year, month, day] = String(value || '').split('-').map(Number);
  return new Date(year, month - 1, day);
}

function originalDateForDay(dayNumber) {
  const start = dateFromInput(planState().startDate);
  start.setDate(start.getDate() + Number(dayNumber) - 1);
  return start;
}

function completionDate(day) {
  const entry = planState().completionOrder.find(item => Number(item.day) === Number(day));
  if (!entry?.at) return null;
  const date = entry.date ? dateFromInput(entry.date) : new Date(entry.at);
  if (Number.isNaN(date.getTime())) return null;
  return dateFromInput(localDateInput(date));
}

let readingScheduleCache = null;
function dateForDay(dayNumber) {
  const state = planState();
  const todayKey = localDateInput(new Date());
  const key = JSON.stringify([activePlan().id, state.startDate, todayKey, state.completionOrder]);
  if (readingScheduleCache?.key !== key) {
    const dates = new Map();
    const actualDates = new Map(state.completionOrder.map(item => [Number(item.day), item]));
    let next = originalDateForDay(1);
    const today = dateFromInput(todayKey);
    for (const entry of activePlan().days) {
      const completion = actualDates.get(entry.day);
      let actual = completion?.date ? dateFromInput(completion.date) : completion?.at ? new Date(completion.at) : null;
      if (actual && Number.isNaN(actual.getTime())) actual = null;
      if (actual) actual = dateFromInput(localDateInput(actual));
      const date = actual || new Date(Math.max(next.getTime(), today.getTime()));
      dates.set(entry.day, date);
      next = new Date(Math.max(next.getTime(), date.getTime()));
      next.setDate(next.getDate() + 1);
    }
    readingScheduleCache = {key, dates};
  }
  return new Date(readingScheduleCache.dates.get(Number(dayNumber)) || originalDateForDay(dayNumber));
}

function dateLabel(date, options = { weekday: 'long', month: 'long', day: 'numeric', year: 'numeric' }) {
  return new Intl.DateTimeFormat(undefined, options).format(date);
}

function currentDayNumber() {
  const days = activePlan()?.days || [];
  return days.find(entry => !isComplete(entry.day))?.day || days.at(-1)?.day || 1;
}

function dayReading(dayNumber) {
  return activePlan()?.days?.find((entry) => Number(entry.day) === Number(dayNumber)) || null;
}

function isComplete(dayNumber) {
  return planState().completed.includes(Number(dayNumber));
}

function isSideComplete(dayNumber, side) {
  return isComplete(dayNumber) || partialSides(dayNumber).includes(side);
}

function completionCount() {
  return planState().completed.length;
}

function percentage() {
  const total = activePlan()?.days?.length || 0;
  return total ? Math.min(100, Math.round(completionCount() / total * 100)) : 0;
}

function esc(value) {
  return String(value ?? '').replace(/[&<>"']/g, (character) => ({
    '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;'
  })[character]);
}

function activeRoute() {
  const value = location.hash.replace(/^#\/?/, '').split('?')[0];
  if (value === 'guide') return 'translations';
  if (value === 'daily' || value === 'journal') return 'progress';
  return ['today', 'translations', 'progress', 'plan'].includes(value) ? value : 'today';
}

function navState(route) {
  document.querySelectorAll('[data-route]').forEach((link) => {
    if (link.dataset.route === route) link.setAttribute('aria-current', 'page');
    else link.removeAttribute('aria-current');
  });
}

function progressMini() {
  const plan = activePlan();
  const total = plan?.days?.length || 0;
  return `<aside class="panel">
    <div class="eyebrow">A steady rhythm</div>
    <div class="progress-count"><strong>${completionCount()}</strong><span>of ${total} readings</span></div>
    <div class="progress-track" role="progressbar" aria-label="Plan completion" aria-valuenow="${percentage()}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percentage()}%"></div></div>
    <div class="small-note">${percentage()}% of the combined plan completed · ${esc(plan?.title || '')}</div>
    <a class="guide-link" href="#progress">See your progress</a>
  </aside>`;
}

function saveLocationLabel() {
  if (demoMode) return 'Demo only · saved on this device';
  return 'Auto-saved to your Google Sheet';
}

function renderToday() {
  const day = currentDayNumber();
  const entry = dayReading(day);
  const state = planState();
  const notes = state.notes[day] || {};
  const done = entry && isComplete(day);
  return `<section class="page">
    <div class="page-head">
      <div><div class="eyebrow">Your reading for today</div><h1>Today’s reading.</h1><p class="lede">Read the selected portions, save what stood out, and mark today’s reading complete when you are ready.</p></div>
      <div class="head-aside">${esc(activePlan()?.title || 'Choose a reading plan')}<br>${esc(dateLabel(new Date(), { month: 'long', year: 'numeric' }))}</div>
    </div>
    <div class="today-grid">
      <article class="reading-card">
        <div class="date-line">${esc(dateLabel(new Date()))}</div>
        <div class="reading-label">${entry ? `Day ${day} of ${activePlan().days.length}` : day < 1 ? 'Your plan is just ahead' : 'The selected plans are complete'}</div>
        <h2 class="reading-title">${entry ? 'Today’s portions' : day < 1 ? 'Your reading begins soon' : 'You have reached the end of this plan'}</h2>
        <div class="reading-portions">
          ${portionMarkup('Old Testament', entry?.otReading)}
          ${portionMarkup('New Testament', entry?.ntReading)}
        </div>
        <div class="reading-meta"><span>${entry ? esc(dateLabel(dateForDay(day), { month: 'long', day: 'numeric', year: 'numeric' })) : 'Your chosen plan'}</span><span>${esc(activePlan().title)}</span></div>
        <div class="button-row">
          ${entry ? (done ? '<button class="btn" type="button" disabled>Reading completed</button>' : '<button class="btn" type="button" data-action="toggle-today">Complete reading</button>') : `<a class="btn" href="#plan">Choose a reading plan</a>`}
          <button class="btn text" type="button" data-action="undo" ${completionCount() ? '' : 'disabled'}>Undo</button>
          <button class="btn text" type="button" data-action="reload">Reload</button>
        </div>
      </article>
      <div class="progress-side">
        ${progressMini()}
        <aside class="panel quote-panel"><div class="quote-mark" aria-hidden="true">“</div><p class="quote-copy">Come as you are. Leave with what you need.</p><div class="quote-caption">A quiet invitation</div></aside>
      </div>
    </div>
    <p class="small-note">Your schedule follows your pace. Mark a portion complete when you read it; the remaining dates move forward automatically.</p>
    <form class="panel journal" id="today-notes" data-day="${day}">
      <div class="journal-head"><div><div class="eyebrow">Today’s notes</div><h2>Keep what stood out.</h2><p>Your entries appear under their books and chapters in Progress &amp; Journal.</p></div></div>
      <div class="journal-fields">
        <div class="field"><label for="mood">A word for how you feel</label><select id="mood" name="mood"><option value="">Choose if you wish</option>${['Peaceful', 'Hopeful', 'Curious', 'Grateful', 'Searching', 'Tired', 'Other'].map((mood) => `<option ${notes.mood === mood ? 'selected' : ''}>${mood}</option>`).join('')}</select></div>
        <div class="field"><label for="highlight">Highlighted verse</label><input id="highlight" name="highlight" maxlength="400" placeholder="A verse or thought that stood out" value="${esc(notes.highlight)}"></div>
        <div class="field full"><label for="reflection">Reflection</label><textarea id="reflection" name="reflection" maxlength="4000" placeholder="What did you notice? What might you carry into the day?">${esc(notes.reflection)}</textarea></div>
        <div class="field full"><label for="prayer">Prayer</label><textarea id="prayer" name="prayer" maxlength="4000" placeholder="A few words, if you would like to leave them here.">${esc(notes.prayer)}</textarea></div>
      </div>
      <div class="button-row" style="margin-top:14px"><button class="btn secondary" type="submit">Save notes now</button><span class="saved-status" data-status aria-live="polite">${saveLocationLabel()}</span></div>
    </form>
  </section>`;
}

function renderGuide() {
  const translations = bibleData.translations || [];
  const references = bibleData.studyReferences || [];
  const selectedTranslation = preferredTranslation();
  return `<section class="page">
    <div class="page-head"><div><div class="eyebrow">Find the words that help you read</div><h1>Translations.</h1><p class="lede">Compare the references from your guide, then open the translation you want to use.</p></div></div>
    <div class="content-columns">
      <section class="panel">
        <div class="journal-head"><div><div class="eyebrow">Your translation guide</div><h2>Compare and open</h2><p>Estimates and notes are shown as supplied in the spreadsheet; they have not been independently assessed here.</p></div></div>
        <div class="translation-grid">
        ${translations.map((item) => `<article class="translation-card">
          <div class="translation-card-heading"><div><span class="translation-alias">${esc(item.linkText)}</span><h3>${esc(item.translation)}</h3></div><span class="score">${esc(item.literalAccuracy)}</span></div>
          <div class="translation-meta"><span>${esc(item.readability)} readability</span><span>${esc(item.balance)}</span></div>
          <button class="btn secondary translation-use-button" type="button" data-action="select-translation" data-translation="${esc(item.translation)}" aria-pressed="${item.translation === selectedTranslation}">${item.translation === selectedTranslation ? 'Using for chapter links' : 'Use for chapter links'}</button>
          <a class="btn translation-link" href="${esc(TRANSLATION_URLS[item.translation] || '#')}" target="_blank" rel="noopener noreferrer">Open ${esc(item.translation)} <span aria-hidden="true">↗</span></a>
        </article>`).join('')}
        </div>
      </section>
      <aside class="panel">
        <div class="eyebrow">For deeper study</div><h2>Study references</h2>
        <p class="small-note">These resources are listed as study companions, not as a required reading list.</p>
        ${references.length ? `<ul class="reference-list">${references.map((reference) => {
          const title = typeof reference === 'string' ? reference : reference.translation || reference.name || reference.title || '';
          const url = STUDY_REFERENCE_URLS[title];
          return `<li><strong>${esc(title)}</strong>${reference.linkText ? ` <span class="small-note">· ${esc(reference.linkText)}</span>` : ''}<br><span class="small-note">${esc(reference.balance || '')}${reference.readability ? ` · ${esc(reference.readability)} readability` : ''}${reference.literalAccuracy ? ` · ${esc(reference.literalAccuracy)} literal accuracy` : ''}</span>${url ? `<a class="reference-link" href="${esc(url)}" target="_blank" rel="noopener noreferrer">Open reference ↗</a>` : ''}</li>`;
        }).join('')}</ul>` : '<div class="empty-state"><p>No study references are included in this guide yet.</p></div>'}
      </aside>
    </div>
  </section>`;
}

function escapeRegExp(value) {
  return String(value).replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
}

function chapterRangeForBook(reading, book) {
  const aliases = [
    book.name,
    book.abbreviation,
    ...(BOOK_ALIASES[book.name] || [])
  ].filter(Boolean).sort((left, right) => right.length - left.length);
  const text = String(reading || '');

  for (const alias of aliases) {
    const normalized = String(alias).trim().replace(/\.+$/, '');
    if (!normalized) continue;
    const pattern = new RegExp(`(^|[^a-z0-9])${escapeRegExp(normalized).replace(/\s+/g, '\\s+')}\\.?(?=$|[^a-z0-9])`, 'i');
    const match = pattern.exec(text);
    if (!match) continue;

    const before = text.slice(0, match.index);
    if (
      (book.name === 'John' && /(?:^|\s)[123]\s*$/i.test(before))
      || (book.name === 'Titus' && /(?:^|\s)[12]\s*$/i.test(before))
    ) continue;

    const after = text.slice(match.index + match[0].length);
    const reference = after.match(/^\s*(\d{1,3})(?::\d{1,3})?\s*(?:[-–]\s*(?:(\d{1,3}):)?\d{1,3})?/);
    if (!reference) continue;
    const start = Number(reference[1]);
    const end = Number(reference[2] || reference[1]);
    if (!Number.isInteger(start) || !Number.isInteger(end) || end < start || end - start > 100) continue;
    return { start, end };
  }
  return null;
}

function preferredTranslation() {
  const translations = bibleData.translations || [];
  try {
    const saved = localStorage.getItem(PREFERRED_TRANSLATION_KEY);
    if (translations.some((item) => item.translation === saved)) return saved;
  } catch {
    // Use the first guide entry if local storage is unavailable.
  }
  return translations[0]?.translation || 'ESV';
}

function chapterLink(translation, bookName, chapter) {
  const versions = {
    ESV: 'ESV',
    'NASB 2020': 'NASB',
    'NET Bible': 'NET',
    LSB: 'LSB',
    NKJV: 'NKJV',
    CSB: 'CSB'
  };
  if (versions[translation]) {
    const search = encodeURIComponent(`${bookName} ${chapter}`);
    return {
      href: `https://www.biblegateway.com/passage/?search=${search}&version=${encodeURIComponent(versions[translation])}`,
      label: `Open ${bookName} ${chapter} in ${translation}`
    };
  }
  return {
    href: TRANSLATION_URLS[translation] || '#translations',
    label: `Open the ${translation} translation site`
  };
}

function chaptersForBook(book, side, days) {
  const chapters = new Map();
  for (const entry of days) {
    const reading = side === 'ot' ? entry.otReading : entry.ntReading;
    if (!reading || !hasBookReference(reading, book)) continue;
    const chapterRange = chapterRangeForBook(reading, book);
    if (!chapterRange) continue;
    for (let chapter = chapterRange.start; chapter <= chapterRange.end; chapter += 1) {
      const chapterDays = chapters.get(chapter) || [];
      if (!chapterDays.some((item) => Number(item.day) === Number(entry.day))) chapterDays.push(entry);
      chapters.set(chapter, chapterDays);
    }
  }
  return [...chapters.entries()].sort((a, b) => a[0] - b[0]);
}


function exportDate(date) {
  const day = date.getDate();
  const suffix = day % 100 >= 11 && day % 100 <= 13 ? 'th' : ({1: 'st', 2: 'nd', 3: 'rd'}[day % 10] || 'th');
  return day + suffix + ' ' + new Intl.DateTimeFormat('en-GB', {month: 'short'}).format(date) + ' ' + date.getFullYear();
}

function readingExportReport() {
  const plan = activePlan();
  const state = planState();
  return {
    subtitle: demoMode ? 'Demo reading record / sample progress' : 'Personal reading record',
    plan: plan.title, otPlan: plan.otPlan.title, ntPlan: plan.ntPlan.title,
    begin: exportDate(dateFromInput(state.startDate)),
    end: exportDate(originalDateForDay(Math.max(1, plan.days.length))),
    adjustedEnd: exportDate(dateForDay(Math.max(1, plan.days.length))),
    actualRange: (() => {
      const dates = state.completed.map(day => completionDate(day)).filter(Boolean).sort((a, b) => a - b);
      return dates.length ? exportDate(dates[0]) + ' - ' + exportDate(dates.at(-1)) : 'No readings submitted yet';
    })(),
    exported: exportDate(new Date()),
    progress: percentage() + '% / ' + completionCount() + ' of ' + plan.days.length + ' days complete',
    partial: Object.keys(state.partialCompleted).length + ' days (one testament completed)',
    translation: preferredTranslation(),
    days: plan.days.map(entry => {
      const schedule = ['Originally planned: ' + exportDate(originalDateForDay(entry.day))];
      const actualDate = completionDate(entry.day);
      if (!actualDate) schedule.push(isComplete(entry.day) ? 'Submission date not recorded' : 'Next scheduled: ' + exportDate(dateForDay(entry.day)));
      const noteDate = state.noteSubmittedAt[entry.day];
      if (noteDate && !Number.isNaN(new Date(noteDate).getTime())) schedule.push('Notes saved: ' + exportDate(new Date(noteDate)));
      if (entry.otReading) schedule.push('Old Testament: ' + entry.otReading);
      if (entry.ntReading) schedule.push('New Testament: ' + entry.ntReading);
      const completion = state.completionOrder.find(item => Number(item.day) === entry.day);
      if (completion?.at) {
        const date = new Date(completion.at);
        if (!Number.isNaN(date.getTime())) schedule.push('Submitted on: ' + exportDate(actualDate || date));
      }
      const note = state.notes[entry.day] || {};
      return { heading: 'Day ' + entry.day + ' | ' + (actualDate ? exportDate(actualDate) : isComplete(entry.day) ? 'Date not recorded' : 'Not submitted'), status: dayStatus(entry.day), schedule,
        notes: [['mood', 'Mood'], ['highlight', 'Highlighted verse'], ['reflection', 'Reflection'], ['prayer', 'Prayer']]
          .filter(([key]) => note[key]).map(([key, label]) => ({label, value: note[key]})) };
    })
  };
}

async function downloadProgressPdf(button) {
  const status = document.querySelector('#pdf-export-status');
  button.disabled = true;
  if (status) status.textContent = 'Preparing your PDF...';
  try {
    const state = planState();
    const end = localDateInput(dateForDay(Math.max(1, activePlan()?.days.length || 1)));
    const pdf = await createReadingPdf(readingExportReport());
    const url = URL.createObjectURL(pdf);
    const link = document.createElement('a');
    link.href = url;
    link.download = 'BibleDaily-' + state.startDate + '-to-' + end + '.pdf';
    document.body.append(link);
    link.click();
    link.remove();
    setTimeout(() => URL.revokeObjectURL(url), 60000);
    if (status) status.textContent = 'Your PDF is ready. Check your downloads.';
  } catch (error) {
    if (status) status.textContent = 'Could not create your PDF. ' + error.message;
  } finally {
    button.disabled = false;
  }
}

function openProgressNoteEditor(day) {
  if (!dayReading(day)) return;
  const dialog = document.querySelector('#progress-note-dialog');
  const form = dialog.querySelector('form');
  const note = planState().notes[day] || {};
  form.dataset.day = String(day);
  for (const key of ['mood', 'highlight', 'reflection', 'prayer']) form.elements.namedItem(key).value = note[key] || '';
  dialog.querySelector('#progress-note-title').textContent = 'Day ' + day + ' notes';
  dialog.querySelector('#progress-note-date').textContent = exportDate(dateForDay(day));
  dialog.showModal();
}

function renderProgressEditor() {
  return `<dialog class="progress-note-dialog" id="progress-note-dialog" aria-labelledby="progress-note-title">
    <form id="progress-note-editor">
      <div class="journal-head"><div><h2 id="progress-note-title">Daily notes</h2><p id="progress-note-date"></p></div><button class="btn text" type="button" data-action="close-progress-note">Cancel</button></div>
      <div class="field-row"><div class="field"><label for="progress-mood">A word for how you feel</label><input id="progress-mood" name="mood" maxlength="100"></div>
      <div class="field"><label for="progress-highlight">Highlighted verse</label><input id="progress-highlight" name="highlight" maxlength="500"></div></div>
      <div class="field"><label for="progress-reflection">Reflection</label><textarea id="progress-reflection" name="reflection" maxlength="4000"></textarea></div>
      <div class="field"><label for="progress-prayer">Prayer</label><textarea id="progress-prayer" name="prayer" maxlength="4000"></textarea></div>
      <div class="button-row"><button class="btn" type="submit">Save notes</button><span class="small-note">Notes are shared with Today's Reading.</span></div>
    </form>
  </dialog>`;
}

function renderProgress() {
  const groups = bibleData.bookGroups || [];
  const days = activePlan()?.days || [];
  const state = planState();
  const partialCount = Object.keys(state.partialCompleted).length;
  const translation = preferredTranslation();
  const translationOptions = (bibleData.translations || []).map((item) => (
    `<option value="${esc(item.translation)}" ${item.translation === translation ? 'selected' : ''}>${esc(item.translation)}</option>`
  )).join('');

  return `<section class="page">
    <div class="page-head"><div><div class="eyebrow">Your progress and saved notes</div><h1>Your reading notes.</h1><p class="lede">Open a book to browse its chapters, see the days you read them, and return to the notes you saved in Today’s Reading.</p></div><div class="head-aside">${esc(activePlan()?.title || '')}</div></div>
    ${renderProgressEditor()}
    <div class="progress-overview panel">
      <div class="progress-overview-title"><div class="eyebrow">Your combined reading plan</div><h2>${percentage()}% complete</h2><p>${completionCount()} of ${days.length} daily readings complete</p></div>
      <div class="progress-overview-bar">
        <div class="progress-track" role="progressbar" aria-label="Plan completion" aria-valuenow="${percentage()}" aria-valuemin="0" aria-valuemax="100"><div class="progress-fill" style="width:${percentage()}%"></div></div>
        <div class="progress-encouragement">${percentage() === 100 ? 'You completed this reading plan.' : 'Continue at your own pace. Your next portion waits for you.'}</div>
<div class="progress-export"><button class="btn secondary" type="button" data-action="download-progress-pdf">Download reading record (PDF)</button><p class="small-note">Includes progress, saved notes, and your full reading schedule.<br>Begin: ${esc(state.startDate)} &middot; Scheduled end: ${esc(localDateInput(dateForDay(Math.max(1, days.length))))}</p><span class="saved-status" id="pdf-export-status" role="status" aria-live="polite"></span></div>
      </div>
    </div>
    <div class="progress-tools">
      <div><div class="eyebrow">Browse by book</div><h2>Books and chapters</h2><p class="small-note">Green marks a completed book. Yellow marks a book you have begun.</p></div>
      <div class="progress-filters">
        <div class="field"><label for="progress-search">Search books, chapters, and notes</label><input class="input" type="search" id="progress-search" value="${esc(progressQuery)}" placeholder="Try a book, verse, or word from a note"></div>
        <div class="field"><label for="progress-translation">Chapter links open in</label><select class="input" id="progress-translation">${translationOptions}</select></div>
      </div>
    </div>
    <div class="progress-legend" aria-label="Book progress legend"><span><i class="legend-dot complete"></i>Complete</span><span><i class="legend-dot in-progress"></i>In progress</span><span><i class="legend-dot not-started"></i>Not started or not in this plan</span></div>
    <div class="book-groups progress-book-groups">${groups.map((group) => {
          const books = group.books || [];
          const side = NEW_TESTAMENT_GROUPS.has(group.name) ? 'nt' : 'ot';
          const bookMarkup = books.map((book) => {
            const relevant = days.filter((item) => hasBookReference(side === 'ot' ? item.otReading : item.ntReading, book));
            const readCount = relevant.filter((item) => isSideComplete(item.day, side)).length;
            const readWeeks = [...new Set(relevant.filter((item) => isSideComplete(item.day, side)).map((item) => Math.ceil(item.day / 7)))];
            const status = !relevant.length ? 'Not in plan' : readCount === relevant.length ? 'Completed' : readCount ? 'In progress' : 'Not started';
            const chapterEntries = chaptersForBook(book, side, relevant);
            const percent = relevant.length ? Math.round(readCount / relevant.length * 100) : 0;
            const weekText = readWeeks.length ? `Weeks ${readWeeks.join(', ')}` : '';
            const searchContent = [
              book.name,
              ...chapterEntries.flatMap(([chapter, chapterDays]) => [
                `chapter ${chapter}`,
                ...chapterDays.flatMap((entry) => {
                  const note = state.notes[entry.day] || {};
                  return [
                    `day ${entry.day}`,
                    dateLabel(dateForDay(entry.day), { month: 'long', day: 'numeric', year: 'numeric' }),
                    entry.otReading,
                    entry.ntReading,
                    note.mood,
                    note.highlight,
                    note.reflection,
                    note.prayer
                  ];
                })
              ])
            ].join(' ').toLowerCase();
            const statusClass = status === 'Completed' ? 'complete' : status === 'In progress' ? 'in-progress' : 'not-started';
            const chaptersMarkup = chapterEntries.length
              ? chapterEntries.map(([chapter, chapterDays]) => {
                const chapterDone = chapterDays.length > 0 && chapterDays.every((item) => isSideComplete(item.day, side));
                const chapterStarted = chapterDays.some((item) => isSideComplete(item.day, side));
                const chapterStatus = chapterDone ? 'Read' : chapterStarted ? 'In progress' : 'Not marked read';
                const hasNotes = chapterDays.some((item) => Object.values(state.notes[item.day] || {}).some(Boolean));
                const chapterUrl = chapterLink(translation, book.name, chapter);
                const noteBlocks = chapterDays.map((item) => {
                  const note = state.notes[item.day] || {};
                  if (!Object.values(note).some(Boolean)) return '';
                  const lines = [
                    ['Mood', note.mood],
                    ['Highlighted verse', note.highlight],
                    ['Reflection', note.reflection],
                    ['Prayer', note.prayer]
                  ].filter(([, value]) => value);
                  return `<article class="chapter-note"><div class="chapter-note-heading"><strong>Day ${item.day} notes</strong><span>${esc(dateLabel(dateForDay(item.day), { month: 'short', day: 'numeric', year: 'numeric' }))}</span></div><p class="chapter-source-reading">${esc(side === 'ot' ? item.otReading : item.ntReading)}</p>${lines.map(([label, value]) => `<div class="chapter-note-line"><strong>${esc(label)}</strong><p>${esc(value)}</p></div>`).join('')}</article>`;
                }).join('');
                return `<details class="chapter-progress ${hasNotes ? 'has-notes' : ''}" data-chapter-card>
                  <summary><span class="chapter-name">Chapter ${chapter}</span><span class="chapter-status ${chapterDone ? 'complete' : chapterStarted ? 'in-progress' : ''}">${chapterStatus}</span>${hasNotes ? '<span class="chapter-note-flag">Notes saved</span>' : '<span class="chapter-note-flag empty">No notes</span>'}<span class="summary-chevron" aria-hidden="true"></span></summary>
                  <div class="chapter-detail">
                    <div class="chapter-day-list">${chapterDays.map((item) => `<div class="chapter-day-row"><span>Day ${item.day} · ${esc(dateLabel(dateForDay(item.day), { month: 'short', day: 'numeric' }))}</span><span>${esc(side === 'ot' ? item.otReading : item.ntReading)}</span><strong class="${isSideComplete(item.day, side) ? 'complete' : 'pending'}">${isSideComplete(item.day, side) ? 'Completed' : partialSides(item.day).includes(side) ? 'In progress' : 'Not completed'}</strong><button class="btn secondary chapter-edit-notes" type="button" data-action="edit-progress-note" data-day="${item.day}">${Object.values(state.notes[item.day] || {}).some(Boolean) ? 'Edit notes' : 'Add notes'}</button></div>`).join('')}</div>
                    ${noteBlocks || '<p class="chapter-empty-note">No notes were saved for this chapter yet. Notes from Today’s Reading will appear here.</p>'}
                    <a class="chapter-open-link" href="${esc(chapterUrl.href)}" target="_blank" rel="noopener noreferrer">${esc(chapterUrl.label)} <span aria-hidden="true">↗</span></a>
                  </div>
                </details>`;
              }).join('')
              : '<p class="chapter-empty-note">This book has no chapter references in the selected reading plans.</p>';
            return `<details class="book-progress-card ${statusClass}" data-book-card data-search="${esc(searchContent)}">
              <summary class="book-progress-summary">
                <span class="book-progress-title"><strong>${esc(book.name)}</strong><small>${status}${relevant.length ? ` · ${readCount} of ${relevant.length} portions` : ''}${weekText ? ` · ${esc(weekText)}` : ''}</small></span>
                <span class="book-progress-track" role="progressbar" aria-label="${esc(book.name)} progress" aria-valuenow="${percent}" aria-valuemin="0" aria-valuemax="100"><span style="width:${percent}%"></span></span>
                <span class="book-progress-percent">${percent}%</span>
                <span class="summary-chevron" aria-hidden="true"></span>
              </summary>
              <div class="book-progress-detail"><div class="chapter-list-heading">${chapterEntries.length} chapter${chapterEntries.length === 1 ? '' : 's'} in the selected plan · Open a chapter to see its reading days and saved notes.</div>${chaptersMarkup}</div>
            </details>`;
          }).join('');
          const doneCount = books.filter((book) => {
            const relevant = days.filter((item) => hasBookReference(side === 'ot' ? item.otReading : item.ntReading, book));
            return relevant.length && relevant.every((item) => isSideComplete(item.day, side));
          }).length;
          const inPlanCount = books.filter((book) => days.some((item) => hasBookReference(side === 'ot' ? item.otReading : item.ntReading, book))).length;
          return `<section class="book-group progress-book-group" data-book-group><div class="group-heading"><h3>${esc(group.name)}</h3><span>${doneCount} complete · ${inPlanCount} in this plan</span></div><div class="book-progress-list">${bookMarkup}</div></section>`;
        }).join('')}

  </section>`;
}

function renderPlan() {
  const current = activePlan();
  const state = planState();
  const total = current?.days?.length || 0;
  const scheduleRows = (current?.days || []).map((entry) => {
    const searchText = `${entry.day} ${entry.otReading} ${entry.ntReading}`.toLowerCase();
    return `<tr data-schedule-row data-search="${esc(searchText)}">
      <td>Day ${entry.day}<br><span class="small-note">Week ${Math.ceil(entry.day / 7)}</span></td>
      <td>${esc(dateLabel(dateForDay(entry.day), { month: 'short', day: 'numeric', year: 'numeric' }))}</td>
      <td>${esc(entry.otReading || 'Plan complete')}</td>
      <td>${esc(entry.ntReading || 'Plan complete')}</td>
      <td><span class="schedule-status ${isComplete(entry.day) ? 'done' : ''}">${esc(dayStatus(entry.day))}</span></td>
    </tr>`;
  }).join('');
  const bookSchedule = (bibleData.bookGroups || []).map((group) => {
    const bookItems = (group.books || []).map((book) => {
      const portions = (current?.days || []).filter((entry) => hasBookReference(entry.reading, book));
      const searchText = [book.name, ...portions.map((entry) => entry.reading)].join(' ').toLowerCase();
      return `<details class="plan-book" data-book-schedule data-book-search="${esc(searchText)}">
        <summary><span>${esc(book.name)}</span><span>${portions.length} portion${portions.length === 1 ? '' : 's'}</span></summary>
        ${portions.length ? `<ul class="book-portions">${portions.map((entry) => `<li>
          <span>Day ${entry.day}</span>
          <span>${esc(dateLabel(dateForDay(entry.day), { month: 'short', day: 'numeric' }))}</span>
          <span>OT: ${esc(entry.otReading || '—')}</span>
          <span>NT: ${esc(entry.ntReading || '—')}</span>
        </li>`).join('')}</ul>` : '<p class="small-note">No portions in the selected plans.</p>'}
      </details>`;
    }).join('');
    return `<details class="plan-book-group" data-book-group>
      <summary><span>${esc(group.name)}</span><span>${(group.books || []).length} books</span></summary>
      <div class="plan-book-list">${bookItems}</div>
    </details>`;
  }).join('');
  return `<section class="page">
    <div class="page-head"><div><div class="eyebrow">Build your combined schedule</div><h1>Reading plan.</h1><p class="lede">Choose an Old Testament plan and a New Testament plan separately. Their daily portions will appear together below.</p></div></div>
    <div class="plan-layout">
      <form class="panel plan-builder" id="plan-settings" data-pair-id="${esc(current.id)}" data-start-date="${esc(state.startDate)}">
        <div class="plan-select-grid">
          <div class="field"><label for="ot-plan">Old Testament schedule</label><select id="ot-plan" name="otPlan">${planOptions('ot').map((plan) => `<option value="${esc(plan.id)}" ${plan.id === model.activePlans.ot ? 'selected' : ''}>${esc(plan.duration)} · ${plan.days.length} readings</option>`).join('')}</select></div>
          <div class="field"><label for="nt-plan">New Testament schedule</label><select id="nt-plan" name="ntPlan">${planOptions('nt').map((plan) => `<option value="${esc(plan.id)}" ${plan.id === model.activePlans.nt ? 'selected' : ''}>${esc(plan.duration)} · ${plan.days.length} readings</option>`).join('')}</select></div>
        </div>
        <div class="field" style="margin-top:18px"><label for="start-date">Start date</label><input type="date" id="start-date" name="startDate" value="${esc(state.startDate)}" required></div>
        <p class="small-note" style="margin:10px 0 17px">The plan combination has its own progress and notes. Dates are calculated from this start date.</p>
        <button class="btn" type="submit">Save reading plan</button><span class="saved-status" data-status aria-live="polite"></span>
      </form>
      <aside class="panel sticky-panel">
        <div class="eyebrow">Selected combination</div><h2>${esc(current?.title || 'Choose your plans')}</h2>
        <p class="small-note">${esc(current?.otPlan?.days?.length || 0)} OT days · ${esc(current?.ntPlan?.days?.length || 0)} NT days · ${total} combined days</p>
        <div class="progress-count" style="margin:20px 0 10px"><strong>${completionCount()}</strong><span>of ${total} days complete</span></div>
        <div class="progress-track"><div class="progress-fill" style="width:${percentage()}%"></div></div>
        <p class="small-note">A day counts as complete when you finish both portions that are scheduled for it.</p>
      </aside>
    </div>
    <section class="plan-schedule-section">
      <div class="section-heading"><div><div class="eyebrow">Day by day</div><h2>Daily portions</h2><p class="small-note">Every date and reading in the selected schedules.</p></div><div class="schedule-search"><label class="sr-only" for="schedule-search">Search daily portions and books</label><input class="input" type="search" id="schedule-search" placeholder="Search a book or portion"></div></div>
      <div class="schedule-table-wrap"><table class="schedule-table"><thead><tr><th>Plan day</th><th>Date</th><th>Old Testament</th><th>New Testament</th><th>Status</th></tr></thead><tbody>${scheduleRows}</tbody></table></div>
    </section>
    <section class="plan-book-index">
      <div class="section-heading"><div><div class="eyebrow">Browse by book</div><h2>Books and portions</h2><p class="small-note">Open a book to see its assigned days and reading references.</p></div></div>
      <div class="plan-book-groups">${bookSchedule}</div>
    </section>
  </section>`;
}

function render() {
  setChrome();
  if (demoMode) updateSyncStatus('Demo only · nothing is sent to an account');
  if (!demoMode && !authUser) {
    navState('');
    app.innerHTML = renderLandingPage({ loginAvailable, loginMessage });
    mountReviews(app.querySelector('#reader-reviews'));
    syncThemeButtons();
    document.title = 'BibleDaily · A daily reading companion';
    return;
  }

  const route = activeRoute();
  navState(route);
  planState();
  const views = { today: renderToday, translations: renderGuide, progress: renderProgress, plan: renderPlan };
  const page = views[route] || renderToday;
  const demoBanner = demoMode
    ? '<div class="demo-mode-banner"><strong>DEMO MODE</strong><span>Sample data only; changes stay in this browser.</span><a href="./">Return to sign in</a></div>'
    : '';
  app.innerHTML = `${demoBanner}${page()}`;
  syncThemeButtons();
  const pageTitles = { today: "Today's Reading", translations: 'Translations', progress: 'Progress & Journal', plan: 'Reading Plan' };
  document.title = `${pageTitles[route]} · BibleDaily`;
}

function setCompletion(day, completed) {
  const state = planState();
  const numericDay = Number(day);
  if (completed) {
    delete state.partialCompleted[numericDay];
    if (!state.completed.includes(numericDay)) {
      state.completed.push(numericDay);
      state.completionOrder.push({ day: numericDay, at: new Date().toISOString(), date: localDateInput(new Date()) });
    }
  } else {
    state.completed = state.completed.filter((item) => item !== numericDay);
    state.completionOrder = state.completionOrder.filter((item) => Number(item.day) !== numericDay);
    delete state.partialCompleted[numericDay];
  }
  persist();
  queueEntrySync(numericDay);
  queueSettingsSync(true);
}

function toggleCompletion(day) {
  if (!dayReading(day)) return;
  setCompletion(day, !isComplete(day));
  render();
}

function saveNotes(form, day) {
  const data = new FormData(form);
  const note = {
    mood: String(data.get('mood') || ''),
    highlight: String(data.get('highlight') || '').trim(),
    reflection: String(data.get('reflection') || '').trim(),
    prayer: String(data.get('prayer') || '').trim()
  };
  const hasNotes = Object.values(note).some(Boolean);
  if (hasNotes) {
    planState().notes[day] = note;
    planState().noteSubmittedAt[day] = new Date().toISOString();
  }
  else delete planState().notes[day];
  persist();
  queueEntrySync(day);
}

function autoSaveJournal(form) {
  const day = currentDayNumber();
  saveNotes(form, day);
  const status = form.querySelector('[data-status]');
  if (status) status.textContent = demoMode ? 'Demo only · saved on this device' : 'Saved here · syncing to your Google Sheet';
}

function undoLast() {
  const state = planState();
  const last = state.completionOrder.at(-1);
  const day = Number(last?.day || [...state.completed].sort((a, b) => b - a)[0]);
  if (!day) {
    window.alert('There is no completed reading to undo yet.');
    return;
  }
  if (!window.confirm(`Undo the most recently completed reading, Day ${day}? Your notes will stay saved.`)) return;
  setCompletion(day, false);
  persist();
  render();
}

app.addEventListener('click', (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  const { action } = control.dataset;
  if (action === 'toggle-today') {
    const notesForm = document.querySelector('#today-notes');
    if (notesForm) saveNotes(notesForm, currentDayNumber());
    toggleCompletion(currentDayNumber());
  }
  if (action === 'toggle-selected') toggleCompletion(Number(control.dataset.day));
  if (action === 'undo') undoLast();
  if (action === 'reload') window.location.reload();
});

document.addEventListener('click', async (event) => {
  const control = event.target.closest('[data-action]');
  if (!control) return;
  if (control.dataset.action === 'edit-progress-note') {
    openProgressNoteEditor(Number(control.dataset.day));
    return;
  }
  if (control.dataset.action === 'close-progress-note') {
    document.querySelector('#progress-note-dialog').close();
    return;
  }
  if (control.dataset.action === 'download-progress-pdf') {
    await downloadProgressPdf(control);
    return;
  }
  if (control.dataset.action === 'toggle-theme') {
    toggleTheme();
    return;
  }
  if (control.dataset.action === 'select-translation') {
    try {
      localStorage.setItem(PREFERRED_TRANSLATION_KEY, control.dataset.translation);
    } catch {
      // The in-memory selector still updates for this page.
    }
    render();
    return;
  }
  if (control.dataset.action === 'google-sign-in') {
    if (loginAvailable) window.location.assign(apiUrl('auth/google/start'));
    return;
  }
  if (control.dataset.action === 'sign-out') {
    try {
      await fetch(apiUrl('auth/logout'), { method: 'POST', credentials: 'same-origin' });
    } catch {
      // Clear the local account view even when the server cannot be reached.
    }
    authUser = null;
    model = { activePlans: { ...DEFAULT_SELECTIONS }, plans: {} };
    for (const timer of syncTimers.values()) clearTimeout(timer);
    syncTimers = new Map();
    loginMessage = 'You are signed out. Your Google Sheet remains in your Google Drive.';
    location.hash = 'home';
    render();
  }
});

app.addEventListener('input', (event) => {
  const target = event.target;
  if (target.id === 'schedule-search') {
    scheduleQuery = target.value.trim().toLowerCase();
    const rows = [...app.querySelectorAll('[data-schedule-row]')];
    rows.forEach((row) => {
      row.hidden = scheduleQuery !== '' && !row.dataset.search.includes(scheduleQuery);
    });
    const books = [...app.querySelectorAll('[data-book-schedule]')];
    books.forEach((book) => {
      book.hidden = scheduleQuery !== '' && !book.dataset.bookSearch.includes(scheduleQuery);
    });
    app.querySelectorAll('[data-book-group]').forEach((group) => {
      group.hidden = scheduleQuery !== '' && ![...group.querySelectorAll('[data-book-schedule]')].some((book) => !book.hidden);
    });
    return;
  }
  if (target.id === 'progress-search') {
    progressQuery = target.value.trim().toLowerCase();
    app.querySelectorAll('[data-book-card]').forEach((book) => {
      book.hidden = progressQuery !== '' && !book.dataset.search.includes(progressQuery);
    });
    app.querySelectorAll('[data-book-group]').forEach((group) => {
      group.hidden = progressQuery !== '' && ![...group.querySelectorAll('[data-book-card]')].some((book) => !book.hidden);
    });
    return;
  }
  const form = target.closest('form#today-notes');
  if (form) autoSaveJournal(form);
});

app.addEventListener('change', (event) => {
  if (event.target.id === 'progress-translation') {
    try {
      localStorage.setItem(PREFERRED_TRANSLATION_KEY, event.target.value);
    } catch {
      // The current page can still use the selected translation until it is reloaded.
    }
    render();
    return;
  }
  const form = event.target.closest('form#today-notes');
  if (form) autoSaveJournal(form);
});

app.addEventListener('submit', (event) => {
  const form = event.target;
  if (!(form instanceof HTMLFormElement)) return;
  event.preventDefault();
  if (form.id === 'progress-note-editor') {
    const day = Number(form.dataset.day);
    if (!dayReading(day)) return;
    saveNotes(form, day);
    const openDetails = [...app.querySelectorAll('details')].map((item, index) => item.open ? index : -1).filter(index => index >= 0);
    document.querySelector('#progress-note-dialog').close();
    render();
    const details = [...app.querySelectorAll('details')];
    openDetails.forEach(index => { if (details[index]) details[index].open = true; });
    const editButton = app.querySelector('[data-action="edit-progress-note"][data-day="' + day + '"]');
    editButton?.focus();
    announce(demoMode ? 'Notes saved on this device.' : 'Notes saved here and syncing to Google Sheets.');
  } else if (form.id === 'today-notes') {
    saveNotes(form, Number(form.dataset.day) || currentDayNumber());
    announce(demoMode ? 'Your demo notes are saved on this device only.' : 'Your notes are saved here and syncing to Google Sheets.');
  } else if (form.id === 'plan-settings') {
    const data = new FormData(form);
    const date = String(data.get('startDate') || '');
    const otPlan = planById.get(String(data.get('otPlan') || ''));
    const ntPlan = planById.get(String(data.get('ntPlan') || ''));
    if (!date || Number.isNaN(dateFromInput(date).getTime())) {
      announce('Please choose a valid start date.');
      return;
    }
    if (otPlan?.category !== 'Old Testament' || ntPlan?.category !== 'New Testament') {
      announce('Please choose one Old Testament plan and one New Testament plan.');
      return;
    }
    model.activePlans = { ot: otPlan.id, nt: ntPlan.id };
    combinedPlanCache = null;
    planState().startDate = date;
    persist();
    queueSettingsSync(true);
    render();
    announce('Reading plan saved. Daily portions and dates have been updated.');
  } else if (form.matches('[data-week-form]')) {
    const week = form.dataset.weekForm;
    const reflection = String(new FormData(form).get('reflection') || '').trim();
    if (reflection) planState().weekNotes[week] = reflection;
    else delete planState().weekNotes[week];
    persist();
    queueWeeklySync(week);
    const status = form.querySelector('[data-status]');
    if (status) status.textContent = demoMode ? 'Demo only · saved on this device' : 'Saved here · syncing to your Google Sheet';
  }
});

function seedDemoModel() {
  if (Object.keys(model.plans || {}).length) return;
  const total = activePlan().days.length;
  const sampleDays = Math.min(28, total);
  const state = planState();
  const today = new Date();
  today.setDate(today.getDate() - sampleDays + 1);
  state.startDate = localDateInput(today);
  state.completed = Array.from({ length: sampleDays }, (_, index) => index + 1);
  state.completionOrder = state.completed.map((day) => ({
    day,
    at: new Date(Date.now() - (sampleDays - day) * 86400000).toISOString()
  }));
  state.notes[sampleDays] = {
    mood: 'Hopeful',
    highlight: 'Matthew 18:12–14',
    reflection: 'Stillness can be a way of listening, even in the middle of a full day.',
    prayer: 'Help me carry this peace into the conversations ahead.'
  };
  state.weekNotes[1] = 'A steady beginning. I am learning to return without rushing.';
}

async function initializeAccount() {
  if (demoMode) {
    model = readSavedModel(DEMO_STORAGE_KEY);
    seedDemoModel();
    planState();
    persist();
    render();
    return;
  }

  if (import.meta.env?.DEV) {
    loginAvailable = false;
    loginMessage = 'Google sign-in and personal Sheets are enabled after Cloudflare setup. Explore the sample demo here.';
    render();
    return;
  }

  const loginResult = new URLSearchParams(location.search).get('login');
  if (loginResult === 'cancelled') loginMessage = 'Google sign-in was canceled. You can try again whenever you are ready.';
  else if (loginResult === 'failed') loginMessage = 'Google sign-in did not finish. Check the Cloudflare and Google setup, then try again.';
  else loginMessage = 'Checking Google sign-in…';
  render();

  try {
    const response = await fetch(apiUrl('auth/session'), {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const contentType = response.headers.get('Content-Type') || '';
    if (!contentType.includes('application/json')) {
      loginAvailable = false;
      loginMessage = 'Google sign-in becomes available after Cloudflare setup. The demo is ready to explore.';
      render();
      return;
    }
    const session = await response.json();
    loginAvailable = Boolean(session.configured);
    if (!loginAvailable) {
      loginMessage = 'Google sign-in is enabled after the Cloudflare setup in the README. You can explore the demo now.';
      render();
      return;
    }
    if (!session.authenticated || !session.user) {
      if (!loginResult) loginMessage = 'Sign in with Google to open your private reading space.';
      render();
      return;
    }

    authUser = session.user;
    const dataResponse = await fetch(apiUrl('data'), {
      credentials: 'same-origin',
      cache: 'no-store'
    });
    const remote = await dataResponse.json();
    if (!dataResponse.ok) throw new Error(remote.error || 'Could not load your reading data.');
    model = normalizeRemoteModel(remote.model);
    const hadPendingSettings = await restorePendingChanges(authUser.id);
    planState();
    persist();
    render();
    updateSyncStatus(readPendingChanges(authUser.id).length
      ? 'Some changes are waiting to sync'
      : 'Synced with your Google Sheet');
    if (!remote.initialized && !hadPendingSettings) queueSettingsSync(true);
  } catch (error) {
    authUser = null;
    loginAvailable = loginAvailable || false;
    loginMessage = error.message || 'Could not load your Google Sheet. Try signing in again.';
    render();
  }
}

window.addEventListener('hashchange', render);
initializeAccount();
