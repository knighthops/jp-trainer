// Builds the ordered steps of a daily session. No DOM, so it can be unit tested.
import { isDue } from './srs.js';
import { dayStats } from './store.js';

export const WORDS_PER_DAY = 2;
export const SENTENCES_PER_DAY = 3;
const MAX_REVIEWS = 40;

export const kanjiId = (k) => `k:${k.k}`;
export const wordId = (w) => `w:${w.w}`;
export const sentenceId = (s) => `s:${s.id}`;
export const particleId = (item) => `p:${item.id}`;

// Due items first (oldest due first), then items never seen.
function dueThenUnseen(list, idOf, items, now) {
  const due = list.filter((x) => isDue(items[idOf(x)], now))
    .sort((a, b) => items[idOf(a)].due - items[idOf(b)].due);
  return [...due, ...list.filter((x) => !items[idOf(x)])];
}

export function buildSession(state, data, now = Date.now()) {
  const { items, settings } = state;
  const stats = dayStats(state, now);

  const reviews = [
    ...data.kanji.map((x) => ({ type: 'card', kind: 'kanji', id: kanjiId(x), ref: x })),
    ...data.vocab.map((x) => ({ type: 'card', kind: 'word', id: wordId(x), ref: x })),
  ].filter((s) => isDue(items[s.id], now))
    .sort((a, b) => items[a.id].due - items[b.id].due)
    .slice(0, MAX_REVIEWS);

  const unseen = (list, idOf, n) => list.filter((x) => !items[idOf(x)]).slice(0, Math.max(0, n));
  const newKanji = unseen(data.kanji, kanjiId, settings.newPerDay - stats.newK);
  const newWords = unseen(data.vocab, wordId, WORDS_PER_DAY - stats.newW);
  const learn = [
    ...newKanji.map((x) => ({ kind: 'kanji', id: kanjiId(x), ref: x })),
    ...newWords.map((x) => ({ kind: 'word', id: wordId(x), ref: x })),
  ];

  const sentences = dueThenUnseen(data.sentences, sentenceId, items, now)
    .slice(0, Math.max(0, SENTENCES_PER_DAY - stats.sentences))
    .map((x) => ({ type: 'sentence', id: sentenceId(x), ref: x }));

  // One noun set per day: the same noun across several sentences.
  const pending = stats.particles > 0 ? undefined : data.particles.sets.find((set) => set.items.some(
    (it) => !items[particleId(it)] || isDue(items[particleId(it)], now),
  ));
  const particles = pending
    ? pending.items.map((x) => ({ type: 'particle', id: particleId(x), ref: x, set: pending }))
    : [];

  // One clip per day: the least recently shadowed, favouring sentences already met.
  const heard = state.shadow || {};
  const met = data.sentences.filter((x) => items[sentenceId(x)]);
  const clip = stats.shadow > 0 ? null : [...(met.length ? met : data.sentences)]
    .sort((a, b) => (heard[a.id] || 0) - (heard[b.id] || 0))[0];
  const shadow = clip ? [{ type: 'shadow', id: clip.id, ref: clip }] : [];

  const steps = [
    ...reviews,
    ...learn.map((s) => ({ ...s, type: 'learn' })),
    ...learn.map((s) => ({ ...s, type: 'card', isNew: true })),
    ...sentences,
    ...particles,
    ...shadow,
  ];
  return {
    steps,
    counts: {
      reviews: reviews.length,
      learn: learn.length,
      sentences: sentences.length,
      particles: particles.length,
      shadow: shadow.length,
    },
  };
}
