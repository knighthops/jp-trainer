// Builds the short review block that runs before each course lesson, or on its own.
// No DOM, so it can be unit tested.
import { isDue } from './srs.js';
import { grammarId, grammarDrills } from './course.js';
import { tripReviewSteps } from './trip.js';

// Recalled fewer times than this, an item is reviewed by a checked question, not a self-rating.
export const YOUNG = 3;

export const kanjiId = (k) => `k:${k.k}`;
export const wordId = (w) => `w:${w.w}`;
export const sentenceId = (s) => `s:${s.id}`;
export const particleId = (item) => `p:${item.id}`;
export const talkId = (phrase) => `t:${phrase.id}`;

// A short block of what's due, sized for a pocket of time: cards first, then grammar,
// a few drills, starred phrases and missed test questions. Run it again for more.
export function reviewSteps(state, data, now = Date.now(), { cards = 15, grammar = 5, drills = 3, trip = 5, rng = Math.random } = {}) {
  const { items } = state;
  const due = (s) => isDue(items[s.id], now);
  const oldestFirst = (a, b) => items[a.id].due - items[b.id].due;
  const pick = (list, n) => list.filter(due).sort(oldestFirst).slice(0, n);
  const saved = state.talk?.saved || {};
  // A grammar point is practised through one of its lesson's drills, a different one each time.
  const lessons = (data.units || []).flatMap((unit) => unit.lessons.map((lesson) => ({ unit, lesson })));
  const grammarSteps = pick(lessons.map(({ unit, lesson }) => ({ id: grammarId(lesson), unit, lesson })), grammar)
    .map(({ id, unit, lesson }) => {
      const options = grammarDrills(lesson, data);
      const drill = options[Math.floor(rng() * options.length)];
      return drill && { ...drill, id, grammar: { unit, lesson } };
    }).filter(Boolean);
  // Young items are checked with a question, alternating which way round; once an item has
  // been recalled a few times it's a card again, with a typed reading when it's Strong.
  const asked = (s) => {
    const reps = items[s.id]?.reps || 0;
    if (reps >= YOUNG) return s;
    if (s.kind === 'kanji') return { ...s, type: 'quiz', kind: reps % 2 ? 'read' : 'mean' };
    return { ...s, type: 'wordq', dir: reps % 2 ? 'jp' : 'en' };
  };
  return [
    ...pick([
      ...data.kanji.map((x) => ({ type: 'card', kind: 'kanji', id: kanjiId(x), ref: x })),
      ...data.vocab.map((x) => ({ type: 'card', kind: 'word', id: wordId(x), ref: x })),
    ], cards).map(asked),
    ...grammarSteps,
    // Trip signs, lines and announcements that are due.
    ...tripReviewSteps(data.trip || [], items, now, trip),
    // Course drills are reviewed through their grammar point, so only the older practice sets come here.
    ...pick(data.sentences.filter((x) => !x.lesson).map((x) => ({ type: 'sentence', id: sentenceId(x), ref: x })), drills),
    ...pick(data.particles.sets.flatMap((set) => set.items.map((x) => ({ type: 'particle', id: particleId(x), ref: x, set }))), drills),
    // A newly starred phrase is due at once.
    ...(data.talkPhrases || []).filter((x) => saved[x.id]).map((x) => ({ type: 'talk', id: talkId(x), ref: x }))
      .filter((s) => !items[s.id] || due(s)).sort((a, b) => (items[a.id]?.due ?? 0) - (items[b.id]?.due ?? 0)).slice(0, drills),
    // Questions missed on a unit test come back until they are answered.
    ...Object.values(state.course?.missed || {}).slice(0, drills).map((q) => ({ type: 'check', id: q.id, ref: q, missed: true })),
  ];
}
