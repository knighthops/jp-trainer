// The N5 course: units, lessons, unlocking, and the free-practice sentence levels.
// No DOM, so it can be unit tested. Text in data/course is written as space-separated
// words, so each word can be tapped and romaji can be built reliably.
import { romaji } from './romaji.js';
import { shuffled } from './drills.js';

export const UNIT_FILES = ['units-01-04', 'units-05-08', 'units-09-12', 'units-13-16', 'units-17-20', 'units-21-24'];
export const PASS_SHARE = 0.8;

const PARTICLES = new Set(['は', 'が', 'を', 'に', 'で', 'へ', 'の', 'も', 'と', 'か', 'から', 'まで', 'や', 'ね', 'よ']);

export const words = (text) => text.replace(/([。、？！])/g, ' $1 ').trim().split(/\s+/);

// Turns "私 は 学生 です" into the blocks the sentence drill uses.
export function toBlocks(text, glossary) {
  const list = words(text).filter((w) => !/^[。、？！]$/.test(w));
  let verb = list.length - 1;
  while (verb > 0 && PARTICLES.has(list[verb])) verb--;
  const after = { は: 'topic', が: 'subject', を: 'object' };
  return list.map((t, i) => {
    const y = glossary[t]?.y;
    const r = PARTICLES.has(t) ? 'particle' : i === verb ? 'verb' : after[list[i + 1]] || 'other';
    return { t, r, ...(y && y !== t ? { y } : {}) };
  });
}

export function drillsOf(unit) {
  return unit.lessons.flatMap((lesson) => lesson.drills.map((d, n) => ({ ...d, id: `${lesson.id}-${n}`, lesson: lesson.id })));
}

// Phrases before the verb can swap places in Japanese, as long as the topic stays
// first, so every such order is accepted without listing them by hand.
export function autoAlts(blocks) {
  const verb = blocks.findIndex((b) => b.r === 'verb');
  const phrases = [];
  let current = [];
  for (let i = 0; i < verb; i++) {
    current.push(i);
    if (['は', 'に', 'で', 'を', 'へ', 'と', 'が'].includes(blocks[i].t)) {
      phrases.push(current);
      current = [];
    }
  }
  if (blocks.some((b) => ['から', 'まで', 'や', 'か'].includes(b.t) && blocks.indexOf(b) < verb)) return [];
  const topic = phrases[0] && blocks[phrases[0].at(-1)].t === 'は' ? [phrases.shift()] : [];
  if (phrases.length < 2 || phrases.length > 3) return [];
  const orders = [];
  const permute = (left, done) => {
    if (!left.length) orders.push(done);
    left.forEach((p, i) => permute(left.filter((_, n) => n !== i), [...done, p]));
  };
  permute(phrases, []);
  const tail = blocks.map((_, i) => i).slice(verb - current.length);
  return orders.slice(1).map((o) => [...topic.flat(), ...o.flat(), ...tail]);
}

export function toSentence(d, glossary) {
  const blocks = toBlocks(d.b, glossary);
  return { id: d.id, en: d.en, note: d.note, lesson: d.lesson, alts: d.alts || autoAlts(blocks), blocks };
}

export function toChoice(d) {
  const [before, after] = d.c.split('___').map((s) => s.trim());
  return {
    id: d.id, lesson: d.lesson, en: d.en, before: before.replace(/\s+/g, ''), after: after.replace(/\s+/g, ''), label: d.label || 'Fill the blank',
    answer: d.a, options: shuffled([d.a, ...Object.keys(d.w)]), why: d.w, note: d.note,
  };
}

// Adds the course's words to the glossary and vocabulary, and its drills to the review pool.
export function mergeCourse(data, files) {
  const units = files.flat().sort((a, b) => a.n - b.n);
  const add = (lex) => {
    for (const [w, [y, m, ro]] of Object.entries(lex || {})) {
      if (!data.glossary[w]) data.glossary[w] = { y, m, ro: ro ?? romaji(y) };
    }
  };
  units.forEach((u) => add(u.lex));
  const known = new Set(data.vocab.map((v) => v.w));
  for (const u of units) {
    for (const l of u.lessons) {
      for (const w of l.words || []) {
        if (!known.has(w)) {
          known.add(w);
          const g = data.glossary[w];
          data.vocab.push({ w, y: g?.y ?? w, m: g?.m ?? '' });
        }
      }
    }
  }
  data.units = units;
  data.courseChoices = [];
  for (const d of units.flatMap(drillsOf)) {
    if (d.b) data.sentences.push(toSentence(d, data.glossary));
    else data.courseChoices.push(toChoice(d));
  }
  return data;
}

/* ---------- Progress ---------- */

const lastPassed = (state, units) => units.reduce((best, u) => (state.course.passed[u.id] ? Math.max(best, u.n) : best), 0);

export const isUnlocked = (state, units, unit) => unit.n <= lastPassed(state, units) + 1;

export function unitProgress(state, unit) {
  const done = unit.lessons.filter((l) => state.course.done[l.id]).length;
  return { done, total: unit.lessons.length, passed: Boolean(state.course.passed[unit.id]) };
}

// What the course wants next: a lesson, a unit test, the mock exam, or null with no units.
export function nextUp(state, units = []) {
  if (!units.length) return null;
  // Testing out can skip units, so continue after the furthest unit passed.
  const unit = units.find((u) => u.n > lastPassed(state, units));
  if (!unit) return { type: 'exam' };
  const lesson = unit.lessons.find((l) => !state.course.done[l.id]);
  return lesson ? { type: 'lesson', unit, lesson } : { type: 'test', unit };
}

export const examUnlocked = (state, units) => units.length > 0 && Boolean(state.course.passed[units.at(-1).id]);

/* ---------- Lesson steps ---------- */

export function lessonSteps(unit, lesson, state, data) {
  const kanji = (lesson.kanji || []).map((c) => data.kanji.find((k) => k.k === c)).filter(Boolean)
    .filter((k) => !state.items[`k:${k.k}`]).map((ref) => ({ kind: 'kanji', id: `k:${ref.k}`, ref }));
  const vocab = (lesson.words || []).map((w) => data.vocab.find((v) => v.w === w)).filter(Boolean)
    .filter((v) => !state.items[`w:${v.w}`]).map((ref) => ({ kind: 'word', id: `w:${ref.w}`, ref }));
  const learn = [...kanji, ...vocab];
  const drills = lesson.drills.map((_, n) => `${lesson.id}-${n}`).map((id) => {
    const s = data.sentences.find((x) => x.id === id);
    if (s) return { type: 'sentence', id: `s:${id}`, ref: s };
    return { type: 'particle', id: `p:${id}`, ref: data.courseChoices.find((c) => c.id === id), set: {} };
  });
  const isLast = unit.lessons.at(-1) === lesson;
  const dialogue = isLast && unit.dialogue
    ? [{ type: 'dialogue', ref: unit.dialogue, unit }, ...unit.dialogue.check.map((q, n) => ({ type: 'check', id: `${unit.id}-dlg-${n}`, ref: q }))]
    : [];
  return [
    { type: 'lesson', ref: lesson, unit },
    ...learn.map((s) => ({ ...s, type: 'learn' })),
    ...learn.map((s) => ({ ...s, type: 'card', isNew: true })),
    ...drills,
    ...dialogue,
    { type: 'lessonEnd', id: lesson.id },
  ];
}

/* ---------- Sentence levels in free practice ---------- */

const ids = (list) => list.map((n) => `s${String(n).padStart(2, '0')}`);

export const LEVELS = [
  { n: 1, title: 'Saying what things are', sub: 'は, です, か, の', ids: ids([1, 7, 8, 13, 14, 15, 16, 25, 26, 27, 28, 39, 42, 44, 47]) },
  { n: 2, title: 'Everyday actions', sub: 'を, ます, ません, time', ids: ids([2, 11, 12, 29, 33, 35, 36, 37, 45, 49]) },
  { n: 3, title: 'Places and movement', sub: 'に, へ, で, あります, います', ids: ids([3, 4, 9, 18, 21, 23, 24, 38, 40, 46, 48, 50]) },
  { n: 4, title: 'People, past and likes', sub: 'と, が, ました, 好き', ids: ids([5, 6, 10, 17, 19, 20, 22, 30, 31, 32, 34, 41, 43]) },
  { n: 5, title: 'From your course', sub: 'Sentences from lessons you have finished', course: true },
];

export function levelSentences(level, state, data) {
  if (level.course) return data.sentences.filter((s) => s.lesson && state.course.done[s.lesson]);
  return level.ids.map((id) => data.sentences.find((s) => s.id === id)).filter(Boolean);
}

export function levelProgress(level, state, data) {
  const list = levelSentences(level, state, data);
  const done = list.filter((s) => state.practice.sent[s.id]).length;
  return { done, total: list.length, share: list.length ? done / list.length : 0 };
}

// Finish 80% of a level, right the first time, to open the next one.
export function levelUnlocked(level, state, data) {
  if (level.n === 1) return true;
  return levelProgress(LEVELS[level.n - 2], state, data).share >= PASS_SHARE;
}

/* ---------- Unlimited particle practice ---------- */

const fill = (text, picks, field) => text.replace(/\{(\w+)\}/g, (_, key) => picks[key][field]);

// Frames the learner missed most come up more often. `pair` limits the choice to two particles.
export function particleItem(bank, { focus = null, pair = null, stats = {}, rng = Math.random } = {}) {
  const pool = bank.frames.filter((f) => {
    if (pair) return pair.includes(f.a) && f.w[pair.find((p) => p !== f.a)];
    return !focus || f.a === focus;
  });
  const weight = (f) => {
    const s = stats[f.id];
    return 1 + (s ? s.miss * 3 : 2);
  };
  let roll = rng() * pool.reduce((sum, f) => sum + weight(f), 0);
  const frame = pool.find((f) => (roll -= weight(f)) <= 0) || pool[0];
  const picks = {};
  for (const key of new Set([...frame.t.matchAll(/\{(\w+)\}/g)].map((m) => m[1]))) {
    const [t, en] = bank.slots[key][Math.floor(rng() * bank.slots[key].length)];
    picks[key] = { t, en };
  }
  const [before, after] = fill(frame.t, picks, 't').split('___').map((s) => s.replace(/\s+/g, ''));
  const wrong = pair ? [pair.find((p) => p !== frame.a)] : Object.keys(frame.w);
  return {
    id: frame.id,
    label: frame.use,
    before,
    after,
    en: fill(frame.en, picks, 'en'),
    answer: frame.a,
    options: shuffled([frame.a, ...wrong], rng),
    why: frame.w,
    note: frame.n,
  };
}
