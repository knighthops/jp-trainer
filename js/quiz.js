// Multiple-choice kanji questions for the 2-minute weak-kanji drill. No DOM, so it can be unit tested.
// Three kinds, rotated so each kanji is tested from more than one side:
//   pick: meaning → choose the kanji (recognition)
//   read: a word using the kanji → choose how the word is read (one exact reading, in context)
//   mean: kanji → choose its meaning
import { matchReading } from './readings.js';
import { toHiragana } from './romaji.js';

export const KINDS = ['pick', 'read', 'mean'];
export const DRILL_SIZE = 10;
export const DRILL_SECONDS = 120;

const shuffle = (list, rng) => {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};

// Look-alikes first: kanji sharing a part with this one (休 and 体 share 亻), then any others.
export function similarKanji(k, all, rng = Math.random) {
  const parts = new Set(k.parts.map((p) => p.c).filter((c) => c !== k.k));
  const others = all.filter((x) => x.k !== k.k);
  const near = others.filter((x) => x.parts.some((p) => parts.has(p.c)));
  return [...shuffle(near, rng), ...shuffle(others.filter((x) => !near.includes(x)), rng)];
}

// Words that pin down one reading of the kanji.
export function readWords(k, wordOf) {
  return k.words.map(wordOf).filter((w) => w && w.w !== k.k && matchReading(k, w, w.y));
}

// The same word read with the kanji's other readings: plausible, and only right one way.
function misreadings(k, word) {
  const y = toHiragana(word.y);
  const hit = matchReading(k, word, y);
  if (!hit) return [];
  const before = y.slice(0, hit.start);
  const after = y.slice(hit.start + hit.length);
  const stems = [...k.on, ...k.kun].map((r) => toHiragana(r.split(/[-.]/)[0])).filter(Boolean);
  return [...new Set(stems.map((s) => before + s + after))].filter((r) => r !== y);
}

// One question. `pool` is every kanji that can serve as a distractor; `wordOf` looks up a word.
// `n` picks which of the kanji's words to ask, so repeat reviews rotate through its readings.
export function quizQuestion(k, kind, { pool, wordOf, rng = Math.random, n = 0 }) {
  const words = readWords(k, wordOf);
  if (kind === 'read' && !words.length) kind = 'mean';
  const near = similarKanji(k, pool, rng);
  if (kind === 'read') {
    const word = words[n % words.length];
    const right = toHiragana(word.y);
    const wrong = misreadings(k, word);
    // Not enough misreadings: other words' readings of a similar length.
    const fill = shuffle(pool.flatMap((x) => readWords(x, wordOf)).map((w) => toHiragana(w.y))
      .filter((r) => r !== right && Math.abs(r.length - right.length) <= 1), rng);
    const options = [...new Set([...shuffle(wrong, rng), ...fill])].filter((r) => r !== right).slice(0, 3);
    return finish({ kind, k, word, options: [right, ...options] }, rng);
  }
  if (kind === 'pick') {
    const options = [k.k, ...near.filter((x) => x.mean[0] !== k.mean[0]).slice(0, 3).map((x) => x.k)];
    return finish({ kind, k, options }, rng);
  }
  const seen = new Set([k.mean[0]]);
  const options = [k.mean[0]];
  for (const x of near) {
    if (options.length === 4) break;
    if (!seen.has(x.mean[0])) { seen.add(x.mean[0]); options.push(x.mean[0]); }
  }
  return finish({ kind: 'mean', k, options }, rng);
}

// Shuffle the options and remember where the right one went (it starts first).
function finish(q, rng) {
  const order = shuffle(q.options.map((_, i) => i), rng);
  return { ...q, options: order.map((i) => q.options[i]), answer: order.indexOf(0) };
}

// The drill's kanji: struggling ones first (hardest first), then those due, up to `size`.
export function drillKanji(struggling, due, size = DRILL_SIZE) {
  return [...new Set([...struggling, ...due])].slice(0, size);
}

// A kind for each kanji in turn, rotating through the three so one run tests from every side.
export const kindFor = (i, offset = 0) => KINDS[(i + offset) % KINDS.length];
