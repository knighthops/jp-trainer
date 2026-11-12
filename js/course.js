// The N5 course: units, lessons, unlocking, and the free-practice sentence levels.
// No DOM, so it can be unit tested. Text in data/course is written as space-separated
// words, so each word can be tapped and romaji can be built reliably.
import { romaji } from './romaji.js';
import { shuffled } from './drills.js';
import { stageOf, STRONG, MASTERED } from './srs.js';

// The extra files add lessons, words and readings to units already defined above them.
export const UNIT_FILES = ['units-01-04', 'units-05-08', 'units-09-12', 'units-13-16', 'units-17-20', 'units-21-24', 'extra-01-08', 'extra-09-16', 'extra-17-24'];

// A Words lesson teaches a unit's themed vocabulary and ends on the unit's reading.
export const isWords = (lesson) => lesson.kind === 'words';

// Files can add to a unit defined earlier: lessons go before the one named in `before`
// (or at the end), lex entries fill gaps, and other fields such as `reading` are added.
export function joinUnits(files) {
  const byId = new Map();
  for (const u of files.flat()) {
    const base = byId.get(u.id);
    if (!base) {
      byId.set(u.id, { ...u, lex: { ...u.lex }, lessons: [...(u.lessons || [])] });
      continue;
    }
    base.lex = { ...u.lex, ...base.lex };
    for (const l of u.lessons || []) {
      const at = l.before ? base.lessons.findIndex((x) => x.id === l.before) : -1;
      if (at >= 0) base.lessons.splice(at, 0, l);
      else base.lessons.push(l);
    }
    for (const [k, v] of Object.entries(u)) if (!['id', 'lex', 'lessons'].includes(k)) base[k] = v;
  }
  return [...byId.values()];
}
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
  const units = joinUnits(files).sort((a, b) => a.n - b.n);
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

// Passing a unit's test passes it, and testing out of a later unit passes every unit
// before it too: the course never leaves a gap behind you. Returns the units newly passed.
export function passUnit(state, units, unit, now = Date.now()) {
  const fresh = units.filter((u) => u.n <= unit.n && !state.course.passed[u.id]);
  for (const u of fresh) state.course.passed[u.id] = now;
  return fresh;
}

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

// Every lesson and every unit test is one step along the course.
export function courseSteps(state, units = []) {
  const lessons = units.flatMap((u) => u.lessons);
  const done = lessons.filter((l) => state.course.done[l.id]).length + units.filter((u) => state.course.passed[u.id]).length;
  return { done, total: lessons.length + units.length };
}

// Titles earned by passing units. Only ever goes up.
export const RANKS = [
  { at: 0, jp: '入門', en: 'Beginner' },
  { at: 4, jp: '初級', en: 'Starter' },
  { at: 8, jp: '旅人', en: 'Traveller' },
  { at: 12, jp: '会話', en: 'Conversant' },
  { at: 16, jp: '読者', en: 'Reader' },
  { at: 24, jp: '合格', en: 'N5 ready' },
];

export function rankOf(passed) {
  const i = RANKS.findLastIndex((r) => passed >= r.at);
  return { ...RANKS[i], next: RANKS[i + 1] || null };
}

/* ---------- Lesson steps ---------- */

// New items per sitting, so one lesson fits a short trip. Bigger lessons come in parts.
export const LESSON_NEW = 8;
// New items are taught and then recalled in small groups, so recall comes soon after learning.
const GROUP = 4;

// `resume` ({ fresh, part }) rebuilds a lesson that was left part-way with the same items.
export function lessonSteps(unit, lesson, state, data, resume = null) {
  const kanji = (lesson.kanji || []).map((c) => data.kanji.find((k) => k.k === c)).filter(Boolean)
    .map((ref) => ({ kind: 'kanji', id: `k:${ref.k}`, ref }));
  // A word that is just one of this lesson's kanji is taught by the kanji card.
  const glyphs = new Set(kanji.map((k) => k.ref.k));
  const vocab = (lesson.words || []).filter((w) => !glyphs.has(w)).map((w) => data.vocab.find((v) => v.w === w)).filter(Boolean)
    .map((ref) => ({ kind: 'word', id: `w:${ref.w}`, ref }));
  const all = [...kanji, ...vocab];
  const waiting = resume ? all.filter((s) => resume.fresh.includes(s.id)) : all.filter((s) => !state.items[s.id]);
  const learn = resume ? waiting : waiting.slice(0, LESSON_NEW);
  const more = resume ? Boolean(resume.part) : waiting.length > LESSON_NEW;
  // Parts come before the kanji built from them. Met already: every part of a kanji you've
  // started, and those kanji themselves. The ones being taught now don't count, so a resumed
  // lesson rebuilds the same steps.
  const now = new Set(learn.map((s) => s.id));
  const met = new Set();
  for (const k of data.kanji) {
    if (!state.items[`k:${k.k}`] || now.has(`k:${k.k}`)) continue;
    met.add(k.k);
    for (const p of k.parts) met.add(p.c);
  }
  const partsFor = (g) => {
    const list = [];
    const users = [];
    for (const s of g) {
      if (s.kind !== 'kanji') continue;
      for (const p of s.ref.parts) {
        if (p.c === s.ref.k || met.has(p.c)) continue;
        met.add(p.c);
        list.push(p);
        if (!users.includes(s.ref.k)) users.push(s.ref.k);
      }
      met.add(s.ref.k);
    }
    return list.length
      ? [{ type: 'parts', id: `parts:${g.map((s) => s.id).join(',')}`, ref: list, kanji: users }]
      : [];
  };
  const groups = [];
  for (let i = 0; i < learn.length; i += GROUP) {
    const g = learn.slice(i, i + GROUP);
    // Recall runs in reverse order, so it tests memory rather than an echo of the order just seen.
    groups.push(...partsFor(g), ...g.map((s) => ({ ...s, type: 'learn' })), ...[...g].reverse().map((s) => ({ ...s, type: 'card', isNew: true })));
  }
  const intro = { type: 'lesson', ref: lesson, unit };
  if (more) return [intro, ...groups, { type: 'lessonPart', id: lesson.id }];
  const drills = lesson.drills.map((_, n) => `${lesson.id}-${n}`).map((id) => {
    const s = data.sentences.find((x) => x.id === id);
    if (s) return { type: 'sentence', id: `s:${id}`, ref: s };
    return { type: 'particle', id: `p:${id}`, ref: data.courseChoices.find((c) => c.id === id), set: {} };
  });
  // The dialogue (listening) closes the last grammar lesson; the reading closes the Words lesson.
  const isLast = unit.lessons.filter((l) => !isWords(l)).at(-1) === lesson;
  const dialogue = isLast && unit.dialogue
    ? [{ type: 'dialogue', ref: unit.dialogue, unit }, ...unit.dialogue.check.map((q, n) => ({ type: 'check', id: `${unit.id}-dlg-${n}`, ref: q }))]
    : [];
  const reading = isWords(lesson) && unit.reading
    ? [{ type: 'reading', ref: unit.reading, unit }, ...unit.reading.check.map((q, n) => ({ type: 'check', id: `${unit.id}-rd-${n}`, ref: q }))]
    : [];
  return [
    intro,
    ...groups,
    ...drills,
    ...dialogue,
    ...reading,
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
// `recent` holds the last frame ids shown: they sit out, so nothing repeats back to back.
export function particleItem(bank, { focus = null, pair = null, stats = {}, recent = [], rng = Math.random } = {}) {
  const all = bank.frames.filter((f) => {
    if (pair) return pair.includes(f.a) && f.w[pair.find((p) => p !== f.a)];
    return !focus || f.a === focus;
  });
  // Keep at least two frames in play, so a small set still varies.
  const skip = new Set(recent.slice(-Math.max(0, all.length - 2)));
  const pool = all.filter((f) => !skip.has(f.id));
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
    // frame.use names the answer's job ("where an action happens"), so it stays out of the question.
    label: 'Pick the particle',
    before,
    after,
    en: fill(frame.en, picks, 'en'),
    answer: frame.a,
    options: shuffled([frame.a, ...wrong], rng),
    why: frame.w,
    note: frame.n,
  };
}

/* ---------- Memory: grammar items, unit strength and stars ---------- */

// Each lesson's pattern is one review item, practised through a different drill each time.
export const grammarId = (lesson) => `g:${lesson.id}`;

// The drills a grammar item can be reviewed with, in the shape the step runner uses.
export function grammarDrills(lesson, data) {
  return lesson.drills.map((_, n) => `${lesson.id}-${n}`).map((id) => {
    const s = data.sentences.find((x) => x.id === id);
    if (s) return { type: 'sentence', ref: s };
    const c = (data.courseChoices || []).find((x) => x.id === id);
    return c ? { type: 'particle', ref: c, set: {} } : null;
  }).filter(Boolean);
}

// Everything a unit teaches: its kanji, its words (minus ones a kanji card covers) and its grammar.
export function unitItems(unit) {
  const ids = [];
  for (const l of unit.lessons) {
    const glyphs = new Set(l.kanji || []);
    ids.push(...(l.kanji || []).map((c) => `k:${c}`));
    ids.push(...(l.words || []).filter((w) => !glyphs.has(w)).map((w) => `w:${w}`));
    if (l.drills?.length) ids.push(grammarId(l));
  }
  return [...new Set(ids)];
}

export function unitStrength(state, unit) {
  const stages = unitItems(unit).map((id) => stageOf(state.items[id]));
  return {
    total: stages.length,
    strong: stages.filter((s) => s >= STRONG).length,
    mastered: stages.filter((s) => s >= MASTERED).length,
  };
}

// ★ passed the test, ★★ 80% of its items strong, ★★★ 80% mastered.
export function unitStars(state, unit) {
  if (!state.course.passed[unit.id]) return 0;
  const s = unitStrength(state, unit);
  if (!s.total) return 1;
  if (s.mastered / s.total >= PASS_SHARE) return 3;
  if (s.strong / s.total >= PASS_SHARE) return 2;
  return 1;
}
