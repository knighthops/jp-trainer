// Progress in localStorage. Falls back to memory if storage is unavailable.
const KEY = 'jp-trainer.v1';

const defaults = () => ({
  v: 1,
  items: {},
  days: {},
  shadow: {},
  lastBackup: null,
  // best: top unit-test share per unit. current: the lesson left part-way, to resume.
  // stories: when each unit's story chapter was first read.
  course: { done: {}, passed: {}, missed: {}, best: {}, current: null, stories: {} },
  practice: { sent: {}, part: {}, rushBest: 0 },
  exams: { current: null, history: [] },
  talk: { saved: {} },
  // Your own notes on kanji, by kanji: { "休": "Leaning on the oak after mowing" }.
  notes: {},
  // date: the day you fly, "YYYY-MM-DD", for the countdown.
  trip: { date: null },
  settings: { newPerDay: 4, hints: true, theme: 'system', radioEnglish: true, radioSlow: false, radioText: true },
});

const isObject = (x) => x !== null && typeof x === 'object' && !Array.isArray(x);
const RECORD_FIELDS = ['ease', 'interval', 'reps', 'lapses', 'due'];
// Notes from a backup: only text, by kanji.
const cleanNotes = (n) => (isObject(n) ? Object.fromEntries(Object.entries(n).filter(([, v]) => typeof v === 'string' && v.trim())) : {});

export function backupJson(state, now = Date.now()) {
  return JSON.stringify({ app: 'jp-trainer', exportedAt: now, ...state });
}

// Returns clean state from a backup file, or throws with a readable message.
export function parseBackup(text) {
  let raw;
  try {
    raw = JSON.parse(text);
  } catch {
    throw new Error('That file isn\'t a JP Trainer backup.');
  }
  if (!isObject(raw) || raw.app !== 'jp-trainer') throw new Error('That file isn\'t a JP Trainer backup.');
  if (raw.v !== 1) throw new Error('That backup comes from a different version of the app.');
  const valid = isObject(raw.items) && isObject(raw.days)
    && Object.values(raw.items).every((r) => isObject(r) && RECORD_FIELDS.every((f) => Number.isFinite(r[f])));
  if (!valid) throw new Error('That backup is damaged, so nothing was changed.');
  const base = defaults();
  return {
    exportedAt: raw.exportedAt,
    state: {
      v: 1,
      items: raw.items,
      days: raw.days,
      shadow: isObject(raw.shadow) ? raw.shadow : {},
      lastBackup: raw.lastBackup ?? null,
      course: { ...base.course, ...(isObject(raw.course) ? raw.course : {}) },
      practice: { ...base.practice, ...(isObject(raw.practice) ? raw.practice : {}) },
      exams: { ...base.exams, ...(isObject(raw.exams) ? raw.exams : {}) },
      talk: { ...base.talk, ...(isObject(raw.talk) ? raw.talk : {}) },
      notes: cleanNotes(raw.notes),
      trip: { ...base.trip, ...(isObject(raw.trip) ? raw.trip : {}) },
      settings: { ...base.settings, ...(isObject(raw.settings) ? raw.settings : {}) },
    },
  };
}

export function load() {
  const base = defaults();
  try {
    const saved = JSON.parse(localStorage.getItem(KEY));
    if (saved) return { ...base, ...saved, settings: { ...base.settings, ...saved.settings } };
  } catch { /* private mode or corrupt data: start fresh */ }
  return base;
}

export function save(state) {
  try { localStorage.setItem(KEY, JSON.stringify(state)); } catch { /* keep running in memory */ }
}

export function dayKey(now = Date.now()) {
  const d = new Date(now);
  const pad = (n) => String(n).padStart(2, '0');
  return `${d.getFullYear()}-${pad(d.getMonth() + 1)}-${pad(d.getDate())}`;
}

export function dayStats(state, now = Date.now()) {
  const key = dayKey(now);
  return (state.days[key] ||= { newK: 0, newW: 0, reviews: 0, sentences: 0, particles: 0, shadow: 0, lessons: 0 });
}

// XP is a plain sum of work already logged for a day. It is never spent and never lost.
export const XP = { newK: 5, newW: 3, reviews: 1, sentences: 2, particles: 1, shadow: 1, lessons: 10, tests: 30 };
export const DAILY_GOAL = 50;
export const xpOf = (d) => (d ? Object.entries(XP).reduce((n, [k, w]) => n + (Number.isFinite(d[k]) ? d[k] * w : 0), 0) : 0);
export const xpToday = (state, now = Date.now()) => xpOf(state.days[dayKey(now)]);

// Days studied in a row, where up to 2 days off in any 7 count as rest and keep the run going.
// A longer gap simply starts a new run from the next day studied: nothing is lost.
export function streakWithRest(state, now = Date.now(), restPerWeek = 2) {
  const on = (i) => active(state.days[dayKey(now - i * 864e5)]);
  let start = on(0) ? 0 : 1;
  let n = 0;
  const offs = [];
  for (let i = start; i < 3650; i++) {
    if (on(i)) { n++; continue; }
    offs.push(i);
    if (offs.filter((o) => o > i - 7).length > restPerWeek) break;
  }
  return n;
}

const active = (d) => Boolean(d) && d.newK + d.newW + d.reviews + d.sentences + d.particles + (d.shadow || 0) + (d.lessons || 0) + (d.tests || 0) > 0;

export const daysStudied = (state) => Object.values(state.days).filter(active).length;

// Last 7 days, oldest first. Gentle by design: a gap never resets anything.
export function lastWeek(state, now = Date.now()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return { on: active(state.days[dayKey(d.getTime())]), weekday: d.getDay() };
  });
}
