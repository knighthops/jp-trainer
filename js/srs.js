// SM-2 variant. Intervals are whole days and fall due at local midnight,
// so a card rated at night is still due the next morning.
const MIN_EASE = 1.3;
const RELEARN_MS = 10 * 60 * 1000;

export const GRADES = ['again', 'hard', 'good', 'easy'];

export const newRecord = () => ({ ease: 2.5, interval: 0, reps: 0, lapses: 0, due: 0 });

function dueAfter(days, now) {
  const d = new Date(now);
  d.setHours(0, 0, 0, 0);
  d.setDate(d.getDate() + days);
  return d.getTime();
}

function goodInterval(rec) {
  if (rec.reps === 0) return 1;
  if (rec.reps === 1) return 3;
  return Math.max(rec.interval + 1, Math.round(rec.interval * rec.ease));
}

export function rate(rec, grade, now = Date.now()) {
  if (grade === 'again') {
    return {
      ease: Math.max(MIN_EASE, rec.ease - 0.2),
      interval: 0,
      reps: 0,
      lapses: rec.lapses + (rec.reps > 0 ? 1 : 0),
      due: now + RELEARN_MS,
    };
  }
  const good = goodInterval(rec);
  let interval = good;
  let ease = rec.ease;
  if (grade === 'hard') {
    interval = Math.min(good, Math.max(1, Math.round(rec.interval * 1.2)));
    ease = Math.max(MIN_EASE, ease - 0.15);
  } else if (grade === 'easy') {
    interval = Math.max(good + 1, Math.round(good * 1.3));
    ease += 0.15;
  }
  return { ease, interval, reps: rec.reps + 1, lapses: rec.lapses, due: dueAfter(interval, now) };
}

export const isDue = (rec, now = Date.now()) => Boolean(rec) && rec.due <= now;

export function label(rec, grade) {
  const { interval } = rate(rec, grade, 0);
  if (interval === 0) return '10 min';
  return interval < 30 ? `${interval}d` : `${Math.round(interval / 30)}mo`;
}

// How well an item is known, from its review interval. Forgetting drops it back;
// a missed day never does, since the interval only changes when the item is rated.
export const STAGES = [
  { id: 'new', jp: '新', en: 'New' },
  { id: 'learning', jp: '習', en: 'Learning' },
  { id: 'strong', jp: '強', en: 'Strong' },
  { id: 'mastered', jp: '極', en: 'Mastered' },
];
export const STRONG = 2;
export const MASTERED = 3;

export function stageOf(rec) {
  if (!rec) return 0;
  if (rec.interval >= 21) return MASTERED;
  if (rec.interval >= 3) return STRONG;
  return 1;
}
