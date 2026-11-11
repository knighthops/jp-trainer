// Flashcards: decks of words and sentences from the course. Pure functions.
// Flipping cards is practice only: it never changes the review schedule.

const PUNCT = /^[。、！？…「」]+$/;
const tokens = (t) => t.split(' ').filter((w) => w && !PUNCT.test(w));

// Every word a set of units teaches, once each, in teaching order.
export function wordDeck(units) {
  const seen = new Set();
  const out = [];
  for (const unit of units) {
    for (const l of unit.lessons) {
      for (const w of l.words || []) {
        if (seen.has(w)) continue;
        seen.add(w);
        out.push({ kind: 'word', w, unit, lesson: l.id });
      }
    }
  }
  return out;
}

// Each lesson's example sentences, then the unit's dialogue and reading.
function unitSentences(unit, lessonDone = () => true) {
  const out = [];
  for (const l of unit.lessons) if (lessonDone(l)) for (const e of l.examples || []) out.push({ t: e.t, en: e.en, lesson: l.id });
  const last = unit.lessons.at(-1);
  if (lessonDone(last)) {
    for (const line of unit.dialogue?.lines || []) out.push({ t: line.t, en: line.en, lesson: last.id });
    for (const line of unit.reading?.lines || []) out.push({ t: line.t, en: line.en, lesson: last.id });
  }
  return out;
}

export function sentenceDeck(units, lessonDone) {
  const seen = new Set();
  const out = [];
  for (const unit of units) {
    for (const s of unitSentences(unit, lessonDone)) {
      // Very short lines ("Yes.") make poor cards.
      if (seen.has(s.t) || tokens(s.t).length < 2) continue;
      seen.add(s.t);
      out.push({ kind: 'sentence', ...s, unit });
    }
  }
  return out;
}

// Decks by id: "all-w" (every word), "done-s" (sentences from finished lessons), "u05-w" (one unit).
export function deckOf(id, units, done = {}) {
  const [scope, kind] = id.split('-');
  const finished = (l) => !!done[l.id];
  const list = scope === 'all' ? units : scope === 'done' ? units : units.filter((u) => u.id === scope);
  if (!list.length || !['w', 's'].includes(kind)) return [];
  if (kind === 's') return sentenceDeck(list, scope === 'done' ? finished : undefined);
  const words = wordDeck(list);
  return scope === 'done' ? words.filter((c) => done[c.lesson]) : words;
}

// The picture for a card: the word's own, or the last word in the sentence that has one
// (the thing it's about tends to come late: 毎日 コーヒー を 飲みます shows the coffee).
export function emojiOf(card, map) {
  if (card.kind === 'word') return map[card.w] || '';
  for (const w of tokens(card.t).reverse()) if (map[w]) return map[w];
  return '';
}

// Something to read on Home: a sentence from a finished lesson, else a word, else the
// first unit's words. `rng` picks; `skip` is the card shown last, so it doesn't repeat.
export function homeCard(units, done, rng = Math.random, skip = null) {
  for (const pool of [
    sentenceDeck(units, (l) => !!done[l.id]),
    wordDeck(units).filter((c) => done[c.lesson]),
    units.length ? wordDeck(units.slice(0, 1)) : [],
  ]) {
    const list = pool.filter((c) => (c.t || c.w) !== skip);
    if (list.length) return list[Math.floor(rng() * list.length)];
  }
  return null;
}
