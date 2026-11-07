// Builds the ordered steps of a daily session. No DOM, so it can be unit tested.
// Reviews come first, then the next course lesson, then one listening clip.
import { isDue } from './srs.js';
import { dayStats } from './store.js';
import { nextUp, lessonSteps } from './course.js';

const MAX_REVIEWS = 40;
const MAX_SENTENCES = 5;
const MAX_CHOICES = 5;

export const kanjiId = (k) => `k:${k.k}`;
export const wordId = (w) => `w:${w.w}`;
export const sentenceId = (s) => `s:${s.id}`;
export const particleId = (item) => `p:${item.id}`;

export function buildSession(state, data, now = Date.now()) {
  const { items } = state;
  const stats = dayStats(state, now);
  const oldestFirst = (a, b) => items[a.id].due - items[b.id].due;

  const reviews = [
    ...data.kanji.map((x) => ({ type: 'card', kind: 'kanji', id: kanjiId(x), ref: x })),
    ...data.vocab.map((x) => ({ type: 'card', kind: 'word', id: wordId(x), ref: x })),
  ].filter((s) => isDue(items[s.id], now)).sort(oldestFirst).slice(0, MAX_REVIEWS);

  const sentences = data.sentences.map((x) => ({ type: 'sentence', id: sentenceId(x), ref: x }))
    .filter((s) => isDue(items[s.id], now)).sort(oldestFirst).slice(0, MAX_SENTENCES);

  const choices = [
    ...data.particles.sets.flatMap((set) => set.items.map((x) => ({ type: 'particle', id: particleId(x), ref: x, set }))),
    ...(data.courseChoices || []).map((x) => ({ type: 'particle', id: particleId(x), ref: x, set: {} })),
  ].filter((s) => isDue(items[s.id], now)).sort(oldestFirst).slice(0, MAX_CHOICES);

  // Questions missed on a unit test come back until they are answered.
  const missed = Object.values(state.course?.missed || {}).map((q) => ({ type: 'check', id: q.id, ref: q, missed: true }));

  const next = nextUp(state, data.units);
  const lesson = next?.type === 'lesson' && !(stats.lessons > 0) ? lessonSteps(next.unit, next.lesson, state, data) : [];

  // One clip per day: the least recently heard, favouring sentences already met.
  const heard = state.shadow || {};
  const met = data.sentences.filter((x) => items[sentenceId(x)]);
  const clip = stats.shadow > 0 ? null : [...(met.length ? met : data.sentences)]
    .sort((a, b) => (heard[a.id] || 0) - (heard[b.id] || 0))[0];
  const listen = clip ? [{ type: 'listen', id: clip.id, ref: clip }] : [];

  return {
    steps: [...reviews, ...sentences, ...choices, ...missed, ...lesson, ...listen],
    next,
    counts: {
      reviews: reviews.length + sentences.length + choices.length + missed.length,
      lesson: lesson.length ? 1 : 0,
      listen: listen.length,
    },
  };
}
