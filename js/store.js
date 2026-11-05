// Progress in localStorage. Falls back to memory if storage is unavailable.
const KEY = 'jp-trainer.v1';

const defaults = () => ({
  v: 1,
  items: {},
  days: {},
  settings: { newPerDay: 4, hints: true, theme: 'system' },
});

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
  return (state.days[key] ||= { newK: 0, newW: 0, reviews: 0, sentences: 0, particles: 0 });
}

const active = (d) => d && d.newK + d.newW + d.reviews + d.sentences + d.particles > 0;

export const daysStudied = (state) => Object.values(state.days).filter(active).length;

// Last 7 days, oldest first. Gentle by design: a gap never resets anything.
export function lastWeek(state, now = Date.now()) {
  return Array.from({ length: 7 }, (_, i) => {
    const d = new Date(now);
    d.setDate(d.getDate() - (6 - i));
    return { on: active(state.days[dayKey(d.getTime())]), weekday: d.getDay() };
  });
}
