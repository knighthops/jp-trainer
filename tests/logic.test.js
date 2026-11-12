import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newRecord, rate, isDue, stageOf, isStruggling, CLEARS } from '../js/srs.js';
import { validNext, explainWrong, orders, tokenize, romajiLine, spoken, setNotes, noteSlotInner, partsHtml, setKanji, linkKanji, peekHtml, soundLine } from '../js/drills.js';
import { backupJson, parseBackup } from '../js/store.js';
import { romaji, toHiragana, toKana, judgeReading } from '../js/romaji.js';
import { speechText } from '../js/tts.js';
import { matchReading } from '../js/readings.js';
import { reviewSteps, kanjiId, talkId } from '../js/session.js';
import {
  UNIT_FILES, mergeCourse, nextUp, isUnlocked, examUnlocked, lessonSteps, LEVELS, levelUnlocked, toBlocks, autoAlts, words, particleItem,
  courseSteps, rankOf, LESSON_NEW, unitStars, unitItems, grammarId, passUnit,
} from '../js/course.js';
import { unitTest, mockExam, grade } from '../js/exam.js';
import { checkLogin, hashPassword, userId } from '../js/lock.js';
import { radioChannels } from '../js/radio.js';
import { clipId, clipSsml, englishSaid } from '../js/clips.js';
import { rushQuestion } from '../js/rush.js';
import { makeIndex, search, posName } from '../js/dict.js';
import { deckOf, emojiOf, homeCard } from '../js/cards.js';
import {
  PARTS, tripId, partSteps, nextPart, readiness, daysUntil, tripReviewSteps, sceneLines,
} from '../js/trip.js';

const json = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
const data = {
  kanji: json('kanji-n5'), vocab: json('vocab-n5'), sentences: json('sentences'), particles: json('particles'),
};
const NOW = new Date(2026, 10, 5, 22, 0).getTime();
const DAY = 864e5;
const blankOld = () => ({ v: 1, items: {}, days: {}, settings: { newPerDay: 4, hints: true, theme: 'system' } });
const blank = () => ({ ...blankOld(), course: { done: {}, passed: {}, missed: {} }, practice: { sent: {}, part: {} }, exams: { current: null, history: [] } });
const optional = (f) => {
  try { return json(f); } catch { return null; }
};
// A fresh copy of all data with the course merged in, as the app builds it.
function course() {
  const fresh = {
    kanji: json('kanji-n5'), vocab: json('vocab-n5'), sentences: json('sentences'), particles: json('particles'),
    glossary: json('glossary'), bank: json('particle-bank'),
    papers: ['exam-n5-1', 'exam-n5-2'].map((f) => optional(`course/${f}`)).filter(Boolean),
  };
  mergeCourse(fresh, UNIT_FILES.map((f) => optional(`course/${f}`) || []));
  for (const [w, [y, m]] of Object.entries(fresh.bank.lex)) if (!fresh.glossary[w]) fresh.glossary[w] = { y, m, ro: romaji(y) };
  return fresh;
}

test('good grows intervals: 1, 3, then by ease', () => {
  let r = rate(newRecord(), 'good', NOW);
  assert.equal(r.interval, 1);
  r = rate(r, 'good', NOW);
  assert.equal(r.interval, 3);
  r = rate(r, 'good', NOW);
  assert.equal(r.interval, 8);
});

test('intervals are ordered hard <= good < easy at every stage', () => {
  let r = newRecord();
  for (let i = 0; i < 6; i++) {
    const [h, g, e] = ['hard', 'good', 'easy'].map((x) => rate(r, x, NOW).interval);
    assert.ok(h <= g && g < e, `${h} ${g} ${e}`);
    r = rate(r, 'good', NOW);
  }
});

test('a card rated at night is due the next morning', () => {
  const r = rate(newRecord(), 'good', NOW);
  assert.ok(!isDue(r, NOW));
  assert.ok(isDue(r, new Date(2026, 10, 6, 7, 0).getTime()));
});

test('again resets, relearns in 10 minutes, and floors ease', () => {
  let r = rate(rate(newRecord(), 'good', NOW), 'again', NOW);
  assert.equal(r.reps, 0);
  assert.equal(r.lapses, 1);
  assert.equal(r.due, NOW + 600000);
  for (let i = 0; i < 20; i++) r = rate(r, 'again', NOW);
  assert.equal(r.ease, 1.3);
});

test('alternative word orders are accepted', () => {
  const s = data.sentences.find((x) => x.id === 's04');
  assert.deepEqual([...validNext(s, ['私', 'は'])].sort(), ['図書館', '本'].sort());
  assert.deepEqual([...validNext(s, ['私', 'は', '本'])], ['を']);
});

test('wrong tap explains the problem', () => {
  const s = data.sentences.find((x) => x.id === 's02');
  const verb = s.blocks.find((b) => b.r === 'verb');
  assert.match(explainWrong(s, [], verb), /Save 食べます for last/);
  const wo = s.blocks.find((b) => b.t === 'を');
  assert.match(explainWrong(s, ['私', 'は', 'すし'], verb), /particle/);
  assert.match(explainWrong(s, [], wo), /follow the word/);
});

test('sentence data: alts are full permutations; roles are known', () => {
  for (const s of data.sentences) {
    const size = s.blocks.length;
    for (const order of orders(s)) assert.equal(order.length, size, s.id);
    for (const alt of s.alts || []) assert.deepEqual([...alt].sort((a, b) => a - b), [...Array(size).keys()], s.id);
    for (const b of s.blocks) assert.ok(['topic', 'subject', 'object', 'verb', 'particle', 'other'].includes(b.r), s.id);
  }
});

test('particle data: answer offered, every wrong option explained, all 9 covered', () => {
  const { cards, sets } = data.particles;
  assert.equal(cards.length, 13);
  const answers = new Set();
  for (const it of sets.flatMap((s) => s.items)) {
    answers.add(it.answer);
    assert.ok(it.options.includes(it.answer), it.id);
    assert.ok(cards.some((c) => c.p === it.answer), it.id);
    for (const o of it.options) if (o !== it.answer) assert.ok(it.why[o], `${it.id} ${o}`);
  }
  assert.equal(answers.size, 9);
});

test('romaji line reads as a sentence, with a blank before answering', () => {
  const g = json('glossary');
  const card = data.particles.cards.find((c) => c.p === 'は');
  assert.equal(romajiLine(card.ex.map((b) => b.t), g), 'Watashi wa gakusei desu.');
  assert.deepEqual(tokenize('先生です', g), ['先生', 'です']);
  assert.equal(romajiLine(['学校', null, '行きます'], g), 'Gakkō ___ ikimasu.');
});

test('glossary covers every word in the particle guides and drills', () => {
  const g = course().glossary;
  const { cards, sets } = data.particles;
  for (const c of cards) for (const b of c.ex) assert.ok(g[b.t], `${c.p} ${b.t}`);
  for (const c of cards) assert.ok(g[c.p], c.p);
  for (const set of sets) {
    for (const it of set.items) {
      for (const w of [...tokenize(set.noun, g), ...tokenize(it.after, g)]) assert.ok(g[w], `${it.id} ${w}`);
    }
  }
});

test('content meets the MVP targets, with no duplicates', () => {
  assert.equal(data.kanji.length, 100);
  assert.ok(data.vocab.length >= 150, `${data.vocab.length} words`);
  assert.equal(data.sentences.length, 50);
  assert.equal(new Set(data.kanji.map((k) => k.k)).size, data.kanji.length);
  assert.equal(new Set(data.vocab.map((w) => w.w)).size, data.vocab.length);
  assert.equal(new Set(data.sentences.map((s) => s.id)).size, data.sentences.length);
  for (const k of data.kanji) assert.ok(k.parts.length && k.mean.length && k.strokes > 0 && k.on.length + k.kun.length > 0, k.k);
});

test('romaji converts kana, doubled consonants, digraphs and long vowels', () => {
  const cases = {
    イチ: 'ichi', 'ひと-つ': 'hito-tsu', キュウ: 'kyū', ショウ: 'shō', がっこう: 'gakkō', やっつ: 'yattsu',
    じゅっぷん: 'juppun', おおきい: 'ōkii', おかあさん: 'okāsan', きんようび: "kin'yōbi", ひゃく: 'hyaku',
    でんわ: 'denwa', いっち: 'itchi', せんせい: 'sensei', ちいさい: 'chiisai',
  };
  for (const [kana, rom] of Object.entries(cases)) assert.equal(romaji(kana), rom, kana);
});

test('romaji agrees with the hand-written glossary romaji', () => {
  const g = json('glossary');
  const skip = new Set(['は', 'へ', 'を', '何です', 'です', 'ではありません', '勉強します', '行きませんでした']);
  for (const [word, e] of Object.entries(g)) {
    if (!skip.has(word)) assert.equal(romaji(e.y), e.ro.toLowerCase().replace(/ /g, ''), word);
  }
});

test('words are matched to the reading they use', () => {
  const k = (c) => data.kanji.find((x) => x.k === c);
  const v = (w) => data.vocab.find((x) => x.w === w);
  const hit = (c, w) => matchReading(k(c), v(w), v(w).y);
  const seen = (c, w) => {
    const h = hit(c, w);
    return h && `${h.type}:${v(w).y.slice(h.start, h.start + h.length)}`;
  };
  assert.equal(seen('学', '学生'), 'on:がく');
  assert.equal(seen('校', '学校'), 'on:こう');
  assert.equal(seen('一', '一つ'), 'kun:ひと');
  assert.equal(seen('金', 'お金'), 'kun:かね');
  assert.equal(seen('口', '出口'), 'kun:ぐち');
  assert.equal(seen('分', '十分'), 'on:ぷん');
  assert.equal(seen('十', '十分'), 'on:じゅっ');
  assert.equal(seen('国', '中国'), 'on:ごく');
  assert.equal(hit('今', '今日'), null);
  assert.equal(hit('人', '二人'), null);
});

test('kanji data: example words exist in vocab', () => {
  for (const k of data.kanji) {
    for (const w of k.words) assert.ok(data.vocab.some((v) => v.w === w), `${k.k} ${w}`);
  }
});

test('a new learner has nothing to review, and the course starts at the first lesson', () => {
  const merged = course();
  assert.deepEqual(reviewSteps(blank(), merged, NOW), []);
  const steps = lessonSteps(merged.units[0], merged.units[0].lessons[0], blank(), merged);
  assert.equal(nextUp(blank(), merged.units).lesson.id, 'u01a');
  assert.equal(steps[0].type, 'lesson');
  assert.equal(steps.at(-1).type, 'lessonEnd');
  assert.equal(steps.filter((s) => s.type === 'learn').length, steps.filter((s) => s.type === 'card').length);
});

test('reviews take what is due, oldest first, in a short block', () => {
  const merged = course();
  const state = blank();
  merged.kanji.slice(0, 30).forEach((k, i) => {
    state.items[kanjiId(k)] = { ...newRecord(), due: NOW - (i + 1) * DAY, reps: 2, interval: 3 };
  });
  state.items[kanjiId(merged.kanji[40])] = { ...newRecord(), due: NOW + DAY, reps: 2, interval: 3 };
  const steps = reviewSteps(state, merged, NOW);
  assert.equal(steps.length, 15);
  assert.equal(steps[0].id, kanjiId(merged.kanji[29]));
  assert.ok(!steps.some((s) => s.id === kanjiId(merged.kanji[40])));
});

test('missed unit-test questions come back in reviews', () => {
  const merged = course();
  const state = blank();
  state.course.missed = { 'u01-q0': { id: 'u01-q0', q: 'x', o: ['a', 'b'] } };
  assert.equal(reviewSteps(state, merged, NOW).at(-1).type, 'check');
});

test('words already known are not taught again', () => {
  const merged = course();
  const state = blank();
  const [unit] = merged.units;
  const first = lessonSteps(unit, unit.lessons[0], state, merged).filter((s) => s.type === 'learn');
  state.items[first[0].id] = newRecord();
  const after = lessonSteps(unit, unit.lessons[0], state, merged).filter((s) => s.type === 'learn');
  assert.equal(after.length, first.length - 1);
});

test('the course moves lesson, lesson, test, then the next unit', () => {
  const { units } = course();
  const state = blank();
  const [u1, u2] = units;
  assert.equal(nextUp(state, units).lesson.id, u1.lessons[0].id);
  u1.lessons.forEach((l) => { state.course.done[l.id] = 1; });
  assert.equal(nextUp(state, units).type, 'test');
  assert.equal(isUnlocked(state, units, u2), false);
  state.course.passed[u1.id] = 1;
  assert.equal(nextUp(state, units).unit.id, u2.id);
  assert.equal(isUnlocked(state, units, u2), true);
});

test('passing a later test skips ahead and keeps earlier units open', () => {
  const { units } = course();
  const state = blank();
  const late = units[2];
  state.course.passed[late.id] = 1;
  assert.equal(nextUp(state, units).unit.n, late.n + 1);
  assert.equal(isUnlocked(state, units, units[0]), true);
  assert.equal(isUnlocked(state, units, units[late.n]), true);
  assert.equal(examUnlocked(state, units), false);
  state.course.passed[units.at(-1).id] = 1;
  assert.equal(examUnlocked(state, units), true);
  assert.equal(nextUp(state, units).type, 'exam');
});

test('sentence levels open at 80% cleared', () => {
  const merged = course();
  const state = blank();
  const [one, two] = LEVELS;
  assert.equal(levelUnlocked(one, state, merged), true);
  assert.equal(levelUnlocked(two, state, merged), false);
  one.ids.slice(0, Math.ceil(one.ids.length * 0.8)).forEach((id) => { state.practice.sent[id] = 1; });
  assert.equal(levelUnlocked(two, state, merged), true);
  const covered = LEVELS.flatMap((l) => l.ids || []);
  assert.equal(new Set(covered).size, 50);
  for (const id of covered) assert.ok(merged.sentences.find((s) => s.id === id), id);
});

test('course sentences get word roles and accept swapped phrases', () => {
  const g = course().glossary;
  const blocks = toBlocks('私 は 図書館 で 本 を 読みます', g);
  assert.deepEqual(blocks.map((b) => b.r), ['topic', 'particle', 'other', 'particle', 'object', 'particle', 'verb']);
  assert.deepEqual(autoAlts(blocks), [[0, 1, 4, 5, 2, 3, 6]]);
  assert.deepEqual(toBlocks('今 何時 です か', g).map((b) => b.r), ['other', 'other', 'verb', 'particle']);
  assert.deepEqual(autoAlts(toBlocks('私 は 学生 です', g)), []);
  assert.deepEqual(autoAlts(toBlocks('九時 から 五時 まで です', g)), []);
});

test('course content: every word is defined, and answers and orders are valid', () => {
  const merged = course();
  const g = merged.glossary;
  const unknown = new Set();
  const known = (text, where) => {
    for (const w of words(text.replace(/___/g, ' ').replace(/[[\]]/g, ''))) {
      if (!/^[。、？！]$/.test(w) && !g[w]) unknown.add(`${where}:${w}`);
    }
  };
  const ids = new Set();
  for (const u of merged.units) {
    assert.ok(u.title && u.goal && u.dialogue && u.quiz.length >= 3, u.id);
    for (const l of u.lessons) {
      assert.ok(!ids.has(l.id), l.id);
      ids.add(l.id);
      assert.ok(l.note.length && l.examples.length && l.drills.length >= 3, l.id);
      for (const e of l.examples) known(e.t, l.id);
      for (const d of l.drills) {
        if (d.b) known(d.b, l.id);
        else {
          known(d.c, l.id);
          assert.ok(d.c.includes('___'), l.id);
          assert.ok(!d.w[d.a], `${l.id} ${d.a}`);
          assert.ok(Object.keys(d.w).length >= 2, `${l.id} ${d.c}`);
        }
      }
    }
    for (const line of u.dialogue.lines) known(line.t, `${u.id} dialogue`);
    for (const q of [...u.dialogue.check, ...u.quiz]) {
      assert.equal(new Set(q.o).size, q.o.length, `${u.id} ${q.q}`);
      assert.ok(q.o.length >= 3 && q.w, `${u.id} ${q.q}`);
    }
  }
  assert.deepEqual([...unknown], []);
  for (const s of merged.sentences) {
    const size = s.blocks.length;
    for (const alt of s.alts || []) assert.deepEqual([...alt].sort((a, b) => a - b), [...Array(size).keys()], s.id);
  }
});

test('the course covers all 100 kanji once and every vocabulary word', () => {
  const merged = course();
  const taught = merged.units.flatMap((u) => u.lessons.flatMap((l) => l.kanji || []));
  assert.equal(new Set(taught).size, taught.length, 'a kanji is taught twice');
  assert.deepEqual(merged.kanji.map((k) => k.k).filter((k) => !taught.includes(k)), []);
  assert.deepEqual(taught.filter((k) => !merged.kanji.some((x) => x.k === k)), []);
  const words2 = new Set(merged.units.flatMap((u) => u.lessons.flatMap((l) => l.words || [])));
  assert.deepEqual(merged.vocab.map((v) => v.w).filter((w) => !words2.has(w)), []);
  assert.deepEqual(merged.vocab.filter((v) => !v.m).map((v) => v.w), []);
});

test('unlimited particles: frames are valid and every particle is covered', () => {
  const merged = course();
  const { bank, glossary: g } = merged;
  for (const c of merged.particles.cards) assert.ok(bank.frames.some((f) => f.a === c.p), c.p);
  assert.ok(bank.frames.length >= 50);
  for (const f of bank.frames) {
    assert.ok(!f.w[f.a] && Object.keys(f.w).length >= 2 && f.t.includes('___'), f.id);
    for (const key of [...f.t.matchAll(/\{(\w+)\}/g)].map((m) => m[1])) assert.ok(bank.slots[key], `${f.id} ${key}`);
    for (const w of words(f.t.replace(/___/g, ' ').replace(/\{\w+\}/g, ' '))) {
      if (!/^[。、？！]$/.test(w)) assert.ok(g[w], `${f.id} ${w}`);
    }
  }
  for (const list of Object.values(bank.slots)) for (const [t] of list) assert.ok(g[t], t);
  for (let i = 0; i < 300; i++) {
    const it = particleItem(bank, { stats: {} });
    assert.ok(it.options.includes(it.answer) && !/[{}]/.test(it.en + it.before + it.after), it.id);
    for (const o of it.options) if (o !== it.answer) assert.ok(it.why[o], `${it.id} ${o}`);
  }
});

test('particle practice can focus, compare two, and favours what was missed', () => {
  const { bank } = course();
  for (let i = 0; i < 50; i++) assert.equal(particleItem(bank, { focus: 'で' }).answer, 'で');
  for (let i = 0; i < 50; i++) {
    const it = particleItem(bank, { pair: ['は', 'が'] });
    assert.deepEqual([...it.options].sort(), ['が', 'は'].sort());
  }
  const stats = Object.fromEntries(bank.frames.map((f) => [f.id, { seen: 1, miss: f.id === 'o1' ? 50 : 0 }]));
  let hits = 0;
  for (let i = 0; i < 200; i++) if (particleItem(bank, { stats }).id === 'o1') hits++;
  assert.ok(hits > 60, String(hits));
});

test('unit tests mix written and word questions, and options keep their answers', () => {
  const merged = course();
  const exam = unitTest(merged.units[0], merged);
  const list = exam.sections[0].questions;
  assert.ok(list.length >= 7);
  for (const q of list) assert.ok(q.a >= 0 && q.o[q.a] !== undefined, q.id);
  const all = Object.fromEntries(list.map((q) => [q.id, q.a]));
  assert.equal(grade(exam, all).pass, true);
  assert.equal(grade(exam, {}).pass, false);
});

test('mock exam scoring follows the JLPT N5 rules', () => {
  const q = (id) => ({ id, a: 0 });
  const paper = (l, t) => ({ scoring: 'jlpt', sections: [
    { score: 'language', questions: Array.from({ length: t }, (_, i) => q(`a${i}`)) },
    { score: 'listening', questions: Array.from({ length: l }, (_, i) => q(`b${i}`)) },
  ] });
  const answers = (lang, listen) => ({
    ...Object.fromEntries(Array.from({ length: lang }, (_, i) => [`a${i}`, 0])),
    ...Object.fromEntries(Array.from({ length: listen }, (_, i) => [`b${i}`, 0])),
  });
  const exam = paper(10, 10);
  assert.deepEqual((({ language, listening, total, pass }) => ({ language, listening, total, pass }))(grade(exam, answers(5, 5))), { language: 60, listening: 30, total: 90, pass: true });
  assert.equal(grade(exam, answers(10, 0)).pass, false); // Listening below 19.
  assert.equal(grade(exam, answers(3, 5)).pass, false); // Language below 38.
  assert.equal(grade(exam, answers(4, 3)).pass, false); // Total below 80.
});

test('mock exam papers match the JLPT N5 layout', () => {
  const { papers } = course();
  for (const paper of papers) {
    const exam = mockExam(paper);
    assert.deepEqual(exam.sections.map((s) => s.minutes), [20, 40, 30], paper.id);
    assert.deepEqual(exam.sections.map((s) => s.score), ['language', 'language', 'listening'], paper.id);
    assert.deepEqual(paper.sections.map((s) => s.parts.map((p) => p.questions.length)), [[7, 5, 6, 3], [9, 4, 4, 2, 2, 1], [7, 6, 5, 6]], paper.id);
    for (const q of exam.sections.flatMap((s) => s.questions)) {
      assert.ok(q.o[q.a] !== undefined && q.w, q.id);
      assert.equal(new Set(q.o).size, q.o.length, q.id);
    }
    for (const q of exam.sections[2].questions) assert.ok(q.play?.length, q.id);
  }
  assert.ok(papers.length >= 1);
});

test('backup keeps course, practice and exam progress', () => {
  const state = { ...blank(), v: 1, course: { done: { u01a: 1 }, passed: { u01: 1 }, missed: {}, best: { u01: 0.9 }, current: null, stories: { u01: 1 } }, practice: { sent: { s01: 1 }, part: {}, rushBest: 12 }, exams: { current: null, history: [{ total: 100 }] } };
  const { state: restored } = parseBackup(backupJson(state, NOW));
  assert.deepEqual(restored.course, state.course);
  assert.deepEqual(restored.practice, state.practice);
  assert.deepEqual(restored.exams, state.exams);
  const old = parseBackup(backupJson(blankOld(), NOW)).state;
  assert.deepEqual(old.course, { done: {}, passed: {}, missed: {}, best: {}, current: null, stories: {} });
});

test('backup round-trips and rejects bad files without changing anything', () => {
  const state = blank();
  state.v = 1;
  state.items['k:日'] = rate(newRecord(), 'good', NOW);
  const { state: restored, exportedAt } = parseBackup(backupJson(state, NOW));
  assert.equal(exportedAt, NOW);
  assert.deepEqual(restored.items, state.items);
  assert.equal(restored.settings.newPerDay, 4);
  for (const bad of ['nope', '[]', '{"app":"other"}', '{"app":"jp-trainer","v":2}',
    '{"app":"jp-trainer","v":1,"items":{"k:日":{"ease":"x"}},"days":{}}']) {
    let threw = false;
    try { parseBackup(bad); } catch { threw = true; }
    assert.ok(threw, bad);
  }
});

test('login needs the right username and password; username case and spaces are ignored', async () => {
  const salt = 'AAAAAAAAAAAAAAAAAAAAAA==';
  const accounts = {
    iter: 1000,
    users: [{ id: await userId('sample'), salt, hash: await hashPassword('right', salt, 1000) }],
  };
  assert.equal(await checkLogin(accounts, 'sample', 'right'), true);
  assert.equal(await checkLogin(accounts, ' SAMPLE ', 'right'), true);
  assert.equal(await checkLogin(accounts, 'sample', 'wrong'), false);
  assert.equal(await checkLogin(accounts, 'sample', 'RIGHT'), false);
  assert.equal(await checkLogin(accounts, 'other', 'right'), false);
  assert.equal(await checkLogin(accounts, '', ''), false);
});

test('particles are respelled for speech when spoken alone', () => {
  const g = json('glossary');
  assert.equal(spoken('は', g['は']), 'わ');
  assert.equal(spoken('を', g['を']), 'お');
  assert.equal(spoken('学校', g['学校']), 'がっこう');
});

test('glossary covers every sentence word, so shadow romaji is complete', () => {
  const g = json('glossary');
  for (const s of data.sentences) for (const b of s.blocks) assert.ok(g[b.t], `${s.id} ${b.t}`);
});

test('every word and kanji matches JMdict and KANJIDIC2', () => {
  // data/dict-check.json is built by tools/dict-check.html. If a new word fails here,
  // run that page to check it against the dictionary and refresh the file.
  const dict = json('dict-check');
  const c = course();
  const entries = [
    ...Object.entries(c.glossary).map(([w, g]) => [w, g.y]),
    ...c.vocab.map((v) => [v.w, v.y]),
    ...c.units.flatMap((u) => Object.entries(u.lex || {}).map(([w, [y]]) => [w, y])),
    ...Object.entries(json('talk').lex).map(([w, [y]]) => [w, y]),
    ...Object.entries(json('trip').lex).map(([w, [y]]) => [w, y]),
  ].filter(([w]) => !/[\sA-Za-z]/.test(w) && /[぀-ヿ一-龯]/.test(w));
  const wrong = [];
  const unchecked = [];
  for (const [w, y] of entries) {
    const reading = toHiragana(y);
    if (dict.words[w]) {
      if (!dict.words[w].split('|').includes(reading)) wrong.push(`${w} ${y} (dictionary: ${dict.words[w]})`);
    } else if (dict.built[w] !== reading) unchecked.push(`${w} ${y}`);
  }
  assert.deepEqual(wrong, [], 'readings that differ from JMdict');
  assert.deepEqual([...new Set(unchecked)], [], 'words not yet checked: run tools/dict-check.html');

  const kanjiIssues = [];
  for (const k of [...c.kanji, ...(optional('kanji-more') || [])]) {
    const d = dict.kanji[k.k];
    if (!d) { kanjiIssues.push(`${k.k} missing`); continue; }
    const [on, kun, strokes] = [d[0].split(' '), d[1].split(' ').map((r) => r.replace(/^-|-$/g, '')), d[2]];
    if (k.strokes !== strokes) kanjiIssues.push(`${k.k} strokes ${k.strokes}, dictionary ${strokes}`);
    for (const r of k.on) if (!on.includes(r)) kanjiIssues.push(`${k.k} on ${r}`);
    for (const r of k.kun) {
      if (!kun.includes(r.replace(/-/g, '.')) && !kun.some((x) => x.replace('.', '') === r.replace(/-/g, ''))) kanjiIssues.push(`${k.k} kun ${r}`);
    }
  }
  assert.deepEqual(kanjiIssues, []);
});

test('Talk phrases are sourced, categorised, and every word can be tapped', () => {
  const talk = json('talk');
  const g = { ...course().glossary };
  for (const [w, [y, m]] of Object.entries(talk.lex)) g[w] ||= { y, m };
  const phrases = talk.categories.flatMap((c) => c.items);
  assert.ok(talk.categories.length >= 8);
  for (const c of talk.categories) assert.ok(c.id && c.title && c.jp && c.items.length >= 8, c.id);
  assert.equal(new Set(phrases.map((p) => p.id)).size, phrases.length, 'duplicate Tatoeba ids');
  const unknown = [];
  for (const p of phrases) {
    assert.ok(/^\d+$/.test(p.id) && p.en && p.t, p.id);
    for (const w of p.t.split(' ')) if (!/^[。、！？…]+$/.test(w) && !g[w]) unknown.push(`${p.id}:${w}`);
  }
  assert.deepEqual(unknown, []);
});

test('starred Talk phrases join reviews until they are reviewed', () => {
  const c = course();
  c.talkPhrases = json('talk').categories.flatMap((cat) => cat.items);
  const state = { ...blank(), talk: { saved: { [c.talkPhrases[0].id]: NOW } } };
  const first = reviewSteps(state, c, NOW);
  const step = first.find((s) => s.type === 'talk');
  assert.equal(step.id, talkId(c.talkPhrases[0]));
  state.items[step.id] = rate(newRecord(), 'good', NOW);
  assert.ok(!reviewSteps(state, c, NOW).some((s) => s.type === 'talk'));
  assert.ok(reviewSteps(state, c, NOW + 2 * DAY).some((s) => s.type === 'talk'));
});

test('a big lesson comes in parts of at most LESSON_NEW new items', () => {
  const merged = course();
  const state = blank();
  const unit = merged.units.find((u) => u.n === 6);
  const steps = lessonSteps(unit, unit.lessons[0], state, merged);
  const learn = steps.filter((s) => s.type === 'learn');
  assert.ok(learn.length <= LESSON_NEW);
  assert.equal(steps.at(-1).type, 'lessonPart');
  for (const s of learn) state.items[s.id] = newRecord();
  const rest = lessonSteps(unit, unit.lessons[0], state, merged);
  assert.equal(rest.at(-1).type, 'lessonEnd');
  assert.ok(rest.filter((s) => s.type === 'learn').every((s) => !learn.some((x) => x.id === s.id)));
});

test('new items are recalled in small groups, soon after they are taught', () => {
  const merged = course();
  const unit = merged.units.find((u) => u.n === 4);
  // A new-parts card before a group isn't teaching an item, so it doesn't count here.
  const types = lessonSteps(unit, unit.lessons[0], blank(), merged).map((s) => s.type).filter((t) => t !== 'parts');
  const firstCard = types.indexOf('card');
  assert.ok(firstCard > 0 && firstCard <= 5, `first recall at step ${firstCard}`);
});

test('a resumed lesson rebuilds the same steps even after cards were rated', () => {
  const merged = course();
  const state = blank();
  const [unit] = merged.units;
  const steps = lessonSteps(unit, unit.lessons[0], state, merged);
  const fresh = steps.filter((s) => s.type === 'learn').map((s) => s.id);
  for (const id of fresh) state.items[id] = newRecord();
  const again = lessonSteps(unit, unit.lessons[0], state, merged, { fresh, part: false });
  assert.deepEqual(again.map((s) => `${s.type}:${s.id}`), steps.map((s) => `${s.type}:${s.id}`));
});

test('course steps count lessons and unit tests, and ranks only rise', () => {
  const merged = course();
  const state = blank();
  const lessons = merged.units.reduce((n, u) => n + u.lessons.length, 0);
  assert.deepEqual(courseSteps(state, merged.units), { done: 0, total: lessons + merged.units.length });
  state.course.done.u01a = 1;
  state.course.passed.u01 = 1;
  assert.equal(courseSteps(state, merged.units).done, 2);
  assert.equal(rankOf(0).en, 'Beginner');
  assert.equal(rankOf(5).en, 'Starter');
  assert.equal(rankOf(24).next, null);
});

test('every unit ends on a Words lesson with a reading, and keeps its dialogue on the last grammar lesson', () => {
  const merged = course();
  const ids = merged.units.flatMap((u) => u.lessons.map((l) => l.id));
  assert.equal(new Set(ids).size, ids.length, 'a lesson id is used twice');
  for (const u of merged.units) {
    const last = u.lessons.at(-1);
    assert.equal(last.kind, 'words', `${u.id} ends on ${last.id}`);
    assert.ok(u.reading?.lines.length >= 4 && u.reading.check.length >= 2, `${u.id} reading`);
    const steps = lessonSteps(u, last, blank(), merged, { fresh: [], part: false });
    assert.ok(steps.some((s) => s.type === 'reading'), `${u.id} words lesson has no reading`);
    assert.ok(!steps.some((s) => s.type === 'dialogue'), `${u.id} dialogue moved into the words lesson`);
    const grammar = u.lessons.filter((l) => l.kind !== 'words').at(-1);
    assert.ok(lessonSteps(u, grammar, blank(), merged, { fresh: [], part: false }).some((s) => s.type === 'dialogue'), `${u.id} lost its dialogue`);
  }
  // Extra lessons can slot in before an existing one.
  const u16 = merged.units.find((u) => u.id === 'u16');
  assert.deepEqual(u16.lessons.map((l) => l.id).slice(0, 2), ['u16v', 'u16a']);
});

test('the course teaches at least 550 words', () => {
  const merged = course();
  const taught = new Set(merged.units.flatMap((u) => u.lessons.flatMap((l) => l.words || [])));
  assert.ok(taught.size >= 550, `only ${taught.size}`);
});

test('every unit test has at least 10 questions', () => {
  const merged = course();
  for (const unit of merged.units) {
    const n = unitTest(unit, merged).sections[0].questions.length;
    assert.ok(n >= 10, `Unit ${unit.n} has ${n}`);
  }
});

test('the particle drill label does not name the answer', () => {
  const merged = course();
  for (let i = 0; i < 20; i++) {
    const item = particleItem(merged.bank, { rng: Math.random });
    assert.equal(item.label, 'Pick the particle');
  }
});

test('memory stages follow the review interval', () => {
  assert.equal(stageOf(undefined), 0);
  assert.equal(stageOf({ interval: 0 }), 1);
  assert.equal(stageOf({ interval: 2 }), 1);
  assert.equal(stageOf({ interval: 3 }), 2);
  assert.equal(stageOf({ interval: 21 }), 3);
});

test('typed romaji becomes hiragana', () => {
  const cases = { kyou: 'きょう', gakusei: 'がくせい', kitte: 'きって', konnichiha: 'こんにちは', shinbun: 'しんぶん', "kin'en": 'きんえん', chuugakkou: 'ちゅうがっこう', tsukue: 'つくえ', 'ra-men': 'らーめん', jisho: 'じしょ', fujisan: 'ふじさん' };
  for (const [typed, kana] of Object.entries(cases)) assert.equal(toKana(typed, { done: true }), kana, typed);
  assert.equal(toKana('hon'), 'ほn', 'a trailing n waits while typing');
  assert.equal(toKana('ほん'), 'ほん', 'kana typed directly passes through');
});

test('typed readings are right, close or wrong', () => {
  assert.equal(judgeReading('きょう', ['きょう']), 'right');
  assert.equal(judgeReading('キョウ', ['きょう']), 'right');
  assert.equal(judgeReading('きよう', ['きょう']), 'close');
  assert.equal(judgeReading('きょ', ['きょう']), 'close');
  assert.equal(judgeReading('かくせい', ['がくせい']), 'close');
  assert.equal(judgeReading('あした', ['きょう']), 'wrong');
  assert.equal(judgeReading('', ['きょう']), 'wrong');
});

test('grammar points are reviewed through one of their lesson drills', () => {
  const merged = course();
  const state = blank();
  const lesson = merged.units[0].lessons[0];
  state.items[grammarId(lesson)] = { ...newRecord(), due: NOW - DAY, reps: 1, interval: 1 };
  const step = reviewSteps(state, merged, NOW, { rng: () => 0 }).find((s) => s.grammar);
  assert.equal(step.id, grammarId(lesson));
  assert.ok(['sentence', 'particle'].includes(step.type));
  assert.equal(step.ref.lesson, lesson.id);
});

test('unit stars: passed, then 80% strong, then 80% mastered', () => {
  const merged = course();
  const state = blank();
  const [unit] = merged.units;
  assert.equal(unitStars(state, unit), 0);
  state.course.passed[unit.id] = 1;
  assert.equal(unitStars(state, unit), 1);
  const ids = unitItems(unit);
  for (const id of ids) state.items[id] = { ...newRecord(), interval: 5 };
  assert.equal(unitStars(state, unit), 2);
  for (const id of ids) state.items[id] = { ...newRecord(), interval: 30 };
  assert.equal(unitStars(state, unit), 3);
});

test('speech uses kana for words with kanji, so the device voice cannot misread them', () => {
  const g = { 行ってらっしゃい: { y: 'いってらっしゃい' }, 今日: { y: 'きょう' }, 今: { y: 'いま' }, 学生: { y: 'がくせい' }, 私: { y: 'わたし' }, は: { y: 'は' } };
  assert.equal(speechText('行ってらっしゃい 。', g), 'いってらっしゃい。');
  assert.equal(speechText('私 は 学生 です', g), 'わたしはがくせいです');
  assert.equal(speechText('今日は', g), 'きょうは', 'joined text is matched longest word first');
  assert.equal(speechText('未知', g), '未知', 'unknown kanji are left for the voice');
});

const STORY_GRAMMAR = new Set(['は', 'が', 'を', 'に', 'で', 'と', 'も', 'の', 'か', 'ね', 'よ', 'へ', '。', '、', '！', '？', '…']);

test('story chapters use only words taught up to their unit', () => {
  const merged = course();
  const stories = json('stories');
  assert.ok(stories.length >= 4);
  const allowed = new Set(STORY_GRAMMAR);
  for (const unit of merged.units) {
    Object.keys(unit.lex || {}).forEach((w) => allowed.add(w));
    for (const l of unit.lessons) [...(l.words || []), ...(l.kanji || [])].forEach((w) => allowed.add(w));
    const story = stories.find((s) => s.unit === unit.id);
    if (!story) continue;
    assert.ok(story.title && story.lines.length >= 5, `${unit.id} has a real chapter`);
    for (const line of story.lines) {
      assert.ok(story.cast[line.s], `${unit.id}: ${line.s} is in the cast`);
      assert.ok(line.en, `${unit.id}: every line has English`);
      const unknown = line.t.split(' ').filter((w) => !allowed.has(w));
      assert.deepEqual(unknown, [], `${unit.id}: "${line.t}" uses words not taught yet`);
    }
  }
  for (const s of stories) assert.ok(merged.units.some((u) => u.id === s.unit), `${s.unit} is a unit`);
});

test('radio plays trip scenes, then finished lessons and read stories', () => {
  const merged = course();
  merged.trip = json('trip').scenes;
  merged.stories = json('stories');
  const state = blank();
  const sceneIds = merged.trip.map((s) => `trip-${s.id}`);
  assert.deepEqual(radioChannels(state, merged).map((c) => c.id), ['trip', ...sceneIds]);
  const [unit] = merged.units;
  state.course.done[unit.lessons[0].id] = 1;
  state.course.stories = { [unit.id]: 1 };
  const ids = radioChannels(state, merged).map((c) => c.id);
  assert.deepEqual(ids, ['trip', ...sceneIds, 'course', 'unit', 'stories']);
  for (const ch of radioChannels(state, merged)) {
    assert.ok(ch.items.every((x) => x.t && x.en), ch.id);
    assert.equal(new Set(ch.items.map((x) => x.t)).size, ch.items.length, `${ch.id}: no line twice`);
  }
});

test('kanji rush reading asks four different hiragana readings, one of them right', () => {
  const all = json('kanji-n5');
  const pool = all.slice(0, 8);
  const readOf = (k) => toHiragana((k.kun[0] || k.on[0]).replace(/[-.]/g, ''));
  let last = null;
  for (let n = 0; n < 50; n++) {
    const q = rushQuestion(pool, all, Math.random, last, 'reading', readOf);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.equal(q.right, readOf(q.k));
    assert.ok(q.options.every((o) => !/[ァ-ヶ]/.test(o)), 'all hiragana');
    const own = [...q.k.on, ...q.k.kun].map((r) => toHiragana(r.replace(/[-.]/g, '')));
    assert.ok(q.options.filter((o) => own.includes(o)).length === 1, 'only one option fits the kanji');
    last = q.k;
  }
});

test('kanji rush asks four different meanings, one of them right', () => {
  const all = json('kanji-n5');
  const pool = all.slice(0, 8);
  let last = null;
  for (let n = 0; n < 50; n++) {
    const q = rushQuestion(pool, all, Math.random, last);
    assert.equal(q.options.length, 4);
    assert.equal(new Set(q.options).size, 4);
    assert.ok(q.options.includes(q.right));
    assert.equal(q.right, q.k.mean[0]);
    assert.notEqual(q.k, last, 'never the same kanji twice in a row');
    last = q.k;
  }
});

// Every line the app speaks, with its kanji turned into kana before the voice sees it.
// A kanji left over would be guessed by the device voice, which is how audio drifts from the text.
function spokenLines() {
  const merged = course();
  const talk = optional('talk') || { categories: [], lex: {} };
  for (const [w, [y, m]] of Object.entries(talk.lex || {})) if (!merged.glossary[w]) merged.glossary[w] = { y, m, ro: romaji(y) };
  const out = [];
  const add = (where, t) => { if (t) out.push([where, t]); };
  for (const u of merged.units) {
    for (const l of u.lessons) {
      l.examples.forEach((e) => add(`${l.id} example`, e.t));
      (l.drills || []).forEach((d) => add(`${l.id} drill`, d.b || (d.c && d.c.replace('___', d.a))));
    }
    (u.dialogue?.lines || []).forEach((l) => add(`${u.id} dialogue`, l.t));
  }
  merged.sentences.forEach((s) => add(`sentence ${s.id}`, s.blocks.map((b) => b.t).join(' ')));
  for (const c of talk.categories) c.items.forEach((p) => add(`talk ${p.id}`, p.t));
  for (const s of optional('stories') || []) s.lines.forEach((l) => add(`story ${s.unit}`, l.t));
  const trip = optional('trip') || { scenes: [], lex: {} };
  for (const [w, [y, m]] of Object.entries(trip.lex)) if (!merged.glossary[w]) merged.glossary[w] = { y, m, ro: romaji(y) };
  for (const s of trip.scenes) {
    sceneLines(s).forEach((t) => add(`trip ${s.id}`, t));
    s.signs.forEach((x) => add(`trip ${s.id} sign`, x.y || x.t));
  }
  for (const paper of merged.papers) {
    for (const sec of paper.sections) for (const part of sec.parts) for (const q of part.questions) {
      (q.play || []).forEach(([, t]) => add(`${paper.id} ${part.id}`, t));
      if (q.ao) q.o.forEach((o) => add(`${paper.id} ${part.id} option`, o));
    }
  }
  return { lines: out, glossary: merged.glossary };
}

test('every spoken line reaches the voice as kana, with no kanji left to guess', () => {
  const { lines, glossary } = spokenLines();
  assert.ok(lines.length > 500, `only ${lines.length} lines found`);
  const left = lines.map(([where, t]) => [where, t, speechText(t, glossary)]).filter(([, , s]) => /[一-龯々]/.test(s));
  assert.equal(left.length, 0, `kanji left for the voice:\n${left.slice(0, 40).map(([w, t, s]) => `${w}: ${t} → ${s}`).join('\n')}`);
});

test('何 is read なん before で, の and です, and なに elsewhere', () => {
  const g = { 何: { y: 'なに' } };
  assert.equal(speechText('これ は 何 です か', g), 'これはなんですか');
  assert.equal(speechText('何 の 本', { ...g, 本: { y: 'ほん' } }), 'なんのほん');
  assert.equal(speechText('何 を 食べます か', g), 'なにを食べますか');
});

test('every kanji in every word the app shows has a breakdown', () => {
  const c = course();
  const more = json('kanji-more');
  const talk = json('talk');
  const words = [...Object.keys(c.glossary), ...c.vocab.map((v) => v.w), ...Object.keys(talk.lex), ...Object.keys(json('trip').lex)];
  const covered = new Set([...c.kanji, ...more].map((k) => k.k));
  const missing = [...new Set(words.join('').match(/[一-龯]/g))].filter((k) => !covered.has(k));
  assert.deepEqual(missing, [], 'add these to tools/kanji-parts.txt and run tools/kanji-more.html');
  for (const k of more) {
    assert.ok(k.parts.length && k.parts.every((p) => p.c && p.label && p.mn), `${k.k} breakdown`);
    assert.ok(k.mean.length && k.strokes > 0, `${k.k} meaning and strokes`);
  }
  assert.equal(new Set(more.map((k) => k.k)).size, more.length, 'a kanji is listed twice');
});

test('every particle pair has at least 12 sentences, and recent ones never come straight back', () => {
  const { bank } = course();
  for (const pair of [['は', 'が'], ['に', 'で'], ['を', 'が'], ['と', 'も'], ['から', 'まで'], ['か', 'ね']]) {
    const n = bank.frames.filter((f) => pair.includes(f.a) && f.w[pair.find((p) => p !== f.a)]).length;
    assert.ok(n >= 12, `${pair.join('/')} has ${n}`);
    const recent = [];
    for (let i = 0; i < 60; i++) {
      const it = particleItem(bank, { pair, recent });
      assert.ok(!recent.slice(-5).includes(it.id), `${pair.join('/')} repeated ${it.id}`);
      recent.push(it.id);
    }
  }
});

test('trip scenes: every part is filled, ids are unique, and every word can be tapped', () => {
  const trip = json('trip');
  const { glossary } = course();
  for (const [w, [y, m]] of Object.entries(trip.lex)) if (!glossary[w]) glossary[w] = { y, m, ro: romaji(y) };
  const ids = [];
  for (const s of trip.scenes) {
    for (const p of PARTS) assert.ok(s[p.key]?.length, `${s.id} has no ${p.key}`);
    assert.ok(s.signs.length >= 10 && s.say.length >= 6 && s.hear.length >= 8, `${s.id} is too small`);
    for (const p of PARTS) ids.push(...s[p.key].map((x) => x.id));
    for (const x of s.signs) assert.ok(x.m && (x.y || glossary[x.t]?.y), `sign ${x.id} needs a meaning and a reading`);
    for (const t of sceneLines(s)) {
      for (const w of t.split(' ').filter((w) => !/^[。、？！]$/.test(w))) assert.ok(glossary[w], `${s.id}: ${w} in "${t}" has no gloss`);
    }
    for (const play of s.play) {
      for (const turn of play.turns) {
        if (turn.who === 'staff') { assert.ok(turn.t && turn.en, `${play.id} staff line`); continue; }
        assert.ok(turn.who === 'you' || turn.who === 'check', `${play.id} turn ${turn.who}`);
        assert.equal(turn.options.filter((o) => o.ok).length, 1, `${play.id}: one right option`);
        for (const o of turn.options.filter((x) => !x.ok)) assert.ok(o.why, `${play.id}: wrong option explained`);
      }
    }
  }
  assert.equal(new Set(ids).size, ids.length, 'a trip id is used twice');
});

test('trip parts: new and due first, then free practice that leaves the schedule alone', () => {
  const [scene] = json('trip').scenes;
  const fresh = partSteps(scene, 'signs', {}, NOW, () => 0.5);
  assert.ok(fresh.useSrs && fresh.steps.length === 8 && fresh.steps.every((s) => s.type === 'tripSign'));
  const say = partSteps(scene, 'say', {}, NOW, () => 0.5);
  const learn = say.steps.filter((s) => s.type === 'tripLearn');
  assert.equal(learn.length, 5, 'five new lines are taught');
  assert.equal(say.steps.filter((s) => s.type === 'tripSay').length, 5, 'then recalled');
  assert.ok(say.steps.indexOf(learn.at(-1)) < say.steps.findIndex((s) => s.type === 'tripSay'), 'taught before recalled');
  // Everything known and not due: practice only.
  const items = {};
  for (const p of PARTS) for (const x of scene[p.key]) items[tripId(x)] = rate(rate(newRecord(), 'good', NOW), 'good', NOW);
  const later = partSteps(scene, 'hear', items, NOW);
  assert.equal(later.useSrs, false);
  assert.ok(later.steps.length > 0);
  assert.equal(readiness(scene, items), 1, 'strong everywhere is fully ready');
  assert.equal(readiness(scene, {}), 0);
});

test('trip: due parts come first, then new ones in scene order; due items join reviews', () => {
  const { scenes } = json('trip');
  assert.equal(nextPart(scenes, {}, NOW).scene.id, scenes[0].id);
  assert.equal(nextPart(scenes, {}, NOW).part.key, 'signs');
  const learnt = {};
  for (const x of scenes[0].signs) learnt[tripId(x)] = { ...newRecord(), reps: 1, interval: 1, due: NOW + DAY };
  assert.equal(nextPart(scenes, learnt, NOW).part.key, 'say', 'signs learnt and not due, so say is next');
  const items = {};
  for (const x of scenes[0].signs) items[tripId(x)] = { ...newRecord(), reps: 1, interval: 1, due: NOW - 1 };
  for (const x of scenes[1].hear.slice(0, 2)) items[tripId(x)] = { ...newRecord(), reps: 1, interval: 1, due: NOW - 1 };
  const go = nextPart(scenes, items, NOW);
  assert.equal(`${go.scene.id} ${go.part.key}`, `${scenes[0].id} signs`, 'the part with the most due comes before anything new');
  // A miss never raises readiness.
  const missed = Object.fromEntries(scenes[0].signs.map((x) => [tripId(x), rate(newRecord(), 'again', NOW)]));
  assert.equal(readiness(scenes[0], missed), 0);
  const due = tripReviewSteps(scenes, items, NOW, 5);
  assert.equal(due.length, 5);
  assert.ok(due.every((s) => s.type === 'tripSign'));
  const state = { ...blank(), items };
  const steps = reviewSteps(state, { ...data, trip: scenes }, NOW);
  assert.ok(steps.some((s) => s.type === 'tripSign'), 'trip items appear in the daily review');
});

test('trip countdown counts whole days from local midnight', () => {
  const now = new Date(2026, 10, 10, 23, 30).getTime();
  assert.equal(daysUntil('2026-11-11', now), 1);
  assert.equal(daysUntil('2026-11-10', now), 0);
  assert.equal(daysUntil('2027-05-10', now), 181);
  assert.equal(daysUntil(null, now), null);
});

test('testing out of a later unit passes the units before it, so none is left behind', () => {
  const { units } = course();
  const state = blank();
  passUnit(state, units, units[0]);
  const cleared = passUnit(state, units, units[2]);
  assert.deepEqual(cleared.map((u) => u.n), [2, 3], 'unit 2 is passed along with unit 3');
  assert.ok(units.slice(0, 3).every((u) => state.course.passed[u.id]));
  assert.equal(nextUp(state, units).unit.n, 4);
  assert.deepEqual(passUnit(state, units, units[1]), [], 'a retake changes nothing');
});

test('trip role-play: one variant a session, new ones first, then the most overdue', () => {
  const scene = json('trip').scenes.find((s) => s.play.length >= 2);
  const [a, b] = scene.play;
  const first = partSteps(scene, 'play', {}, NOW);
  assert.equal(first.steps.length, 1);
  assert.equal(first.steps[0].ref.id, a.id);
  const items = {};
  for (const p of scene.play) items[tripId(p)] = { ...newRecord(), reps: 1, interval: 1, due: NOW + DAY };
  items[tripId(b)].due = NOW - 2 * DAY;
  items[tripId(a)].due = NOW - DAY;
  assert.equal(partSteps(scene, 'play', items, NOW).steps[0].ref.id, b.id, 'the most overdue first');
  for (const p of scene.play) items[tripId(p)].due = NOW + DAY;
  const practice = partSteps(scene, 'play', items, NOW, () => 0);
  assert.equal(practice.useSrs, false);
  assert.equal(practice.steps.length, 1);
  for (const s of json('trip').scenes) assert.ok(s.play.length >= 2, `${s.id} has role-play variants`);
});

test('recorded clips: stable names, checked readings, and every radio line listed', () => {
  assert.equal(clipId('ja', 'これ を ください 。'), clipId('ja', 'これ を ください 。'));
  assert.notEqual(clipId('ja', 'はい 。'), clipId('en', 'はい 。'));
  const glossary = { 今日: { y: 'きょう' }, 何: { y: 'なに' } };
  assert.equal(clipSsml('ja', '今日 は 何 です か 。', glossary), '<sub alias="きょう">今日</sub>は<sub alias="なん">何</sub>ですか。');
  assert.equal(clipSsml('en', 'Hello (Staff.) & bye'), 'Hello &amp; bye');
  assert.equal(englishSaid('Yes. (Polite.)'), 'Yes.');
  // The recorder's list has to cover every trip line, or Radio falls back to device speech.
  const listed = new Set(json('audio-lines').map((l) => l.id));
  for (const s of json('trip').scenes) {
    for (const l of [...s.say, ...s.hear]) {
      assert.ok(listed.has(clipId('ja', l.t)) && listed.has(clipId('en', englishSaid(l.en))), `${l.id} missing: open tools/audio-lines.html`);
    }
  }
});

test('dictionary: English, romaji, kana and kanji all find the word, best match first', () => {
  const index = makeIndex([
    ['駅', 'えき', 'railway station; train station', 'n', 1 | 4 | 8, ''],
    ['次', 'つぎ', 'next; following|stage; station', 'n', 1 | 4 | 8, ''],
    ['液', 'えき', 'liquid; fluid', 'n', 4, ''],
    ['食べる', 'たべる', 'to eat|to live on (e.g. a salary)', 'v1', 1 | 4 | 8, ''],
    ['猫', 'ねこ', 'cat (esp. the domestic cat, Felis catus); feline', 'n', 1 | 4 | 8, 'ネコ'],
    ['', 'ライン', 'line', 'n', 4, ''],
    ['雨', 'あめ', 'rain', 'n', 1 | 4 | 8, ''],
    ['有難う', 'ありがとう', 'thank you; thanks', 'int', 2 | 4, '有り難う'],
  ]);
  const first = (q) => search(index, q)[0]?.head;
  assert.equal(first('eat'), '食べる');
  assert.equal(first('to eat'), '食べる');
  assert.equal(first('cat'), '猫');
  assert.equal(first('neko'), '猫');
  assert.equal(first('ネコ'), '猫');
  assert.equal(first('tabe'), '食べる');
  assert.equal(first('食'), '食べる');
  assert.equal(first('eki'), '駅', 'the course word beats the rarer one');
  assert.equal(first('station'), '駅', 'a whole first-sense match beats a later sense');
  assert.equal(first('rain'), '雨', 'English beats the romaji reading of ライン');
  assert.equal(first('arigatou'), 'ありがとう', 'usually-kana words show in kana');
  assert.deepEqual(search(index, '   '), []);
  assert.deepEqual(search(index, 'zzzz'), []);
  assert.equal(posName('v5u'), 'う verb');
  assert.equal(posName('adj-na'), 'な adjective');
});

test('dictionary file, if built: has the course words and every row is well formed', () => {
  const dict = optional('dict');
  if (!dict) return;
  assert.ok(dict.words.length > 15000);
  for (const r of dict.words) assert.ok(r.length === 6 && r[1] && r[2] && Number.isInteger(r[4]), JSON.stringify(r));
  const index = makeIndex(dict.words);
  const d = course();
  const taught = new Set(d.units.flatMap((u) => u.lessons.flatMap((l) => l.words || [])));
  const found = new Set(index.flatMap((e) => [e.w, e.y, ...e.forms]));
  assert.deepEqual([...taught].filter((w) => !found.has(w) && !found.has(toHiragana(w))), []);
});

test('flashcards: decks by unit, all of N5 and finished lessons, with a picture where there is one', () => {
  const d = course();
  const emoji = optional('emoji') || {};
  const u5 = d.units.find((u) => u.id === 'u05');
  const words = deckOf('u05-w', d.units, {});
  assert.ok(words.length >= 15);
  assert.ok(words.every((c) => c.unit === u5 && d.glossary[c.w]), 'every card word can be glossed');
  assert.equal(new Set(words.map((c) => c.w)).size, words.length);
  const all = deckOf('all-w', d.units, {});
  assert.ok(all.length >= 550);
  assert.deepEqual(deckOf('done-w', d.units, {}), []);
  const done = { [u5.lessons[0].id]: 1 };
  assert.ok(deckOf('done-w', d.units, done).every((c) => c.lesson === u5.lessons[0].id));
  const sents = deckOf('u05-s', d.units, {});
  assert.ok(sents.length >= 10 && sents.every((c) => c.t && c.en));
  assert.deepEqual(deckOf('done-s', d.units, {}), []);
  assert.deepEqual(deckOf('nope-w', d.units, {}), []);
  assert.equal(emojiOf({ kind: 'sentence', t: '毎日 コーヒー を 飲みます 。' }, { 毎日: '📆', コーヒー: '☕' }), '☕');
  const pictured = all.filter((c) => emojiOf(c, emoji)).length;
  assert.ok(pictured / all.length > 0.6, `${pictured} of ${all.length} word cards have a picture`);
});

test('home reading card: finished lessons first, never the same card twice running', () => {
  const d = course();
  const first = homeCard(d.units, {}, () => 0);
  assert.equal(first.kind, 'word', 'nothing finished yet: a word from unit 1');
  assert.equal(first.unit.n, 1);
  const done = Object.fromEntries(d.units[1].lessons.map((l) => [l.id, 1]));
  const card = homeCard(d.units, done, () => 0);
  assert.equal(card.kind, 'sentence');
  assert.equal(card.unit, d.units[1]);
  const next = homeCard(d.units, done, () => 0, card.t);
  assert.notEqual(next.t, card.t);
});

test('kanji notes: kept by backups, shown above the breakdown, escaped, read-only in hints', () => {
  const state = { ...blank(), v: 1, notes: { 休: 'Leaning on the oak', 木: '  ', 山: 7 } };
  const { state: restored } = parseBackup(backupJson(state, NOW));
  assert.deepEqual(restored.notes, { 休: 'Leaning on the oak' }, 'only real text survives');
  assert.deepEqual(parseBackup(backupJson(blankOld(), NOW)).state.notes, {});
  setNotes({ 休: 'a <b>bold</b> & "odd" note' });
  const k = { k: '休', parts: [{ c: '亻', label: 'Person', mn: 'A person.' }, { c: '木', label: 'Tree', mn: 'Resting on a tree.' }] };
  const html = partsHtml(k);
  assert.ok(html.indexOf('knote') < html.indexOf('class="part"'), 'the note comes before the parts');
  assert.ok(html.includes('Resting on a tree.'), 'the breakdown is still there');
  assert.ok(html.includes('&lt;b&gt;bold&lt;/b&gt; &amp; &quot;odd&quot;') && !html.includes('<b>bold'));
  assert.ok(html.includes('data-note="休"'), 'editable on a card');
  assert.ok(!partsHtml(k, { edit: false }).includes('data-note='), 'not editable in a hint');
  assert.ok(noteSlotInner('木').includes('+ Add your note'));
  assert.equal(noteSlotInner('木', false), '');
  setNotes({});
});

test('struggling: Forgot or Shaky puts it on, 3 good reviews in a row take it off', () => {
  const good = (r, n) => { for (let i = 0; i < n; i++) r = rate(r, 'good', NOW); return r; };
  let r = good(newRecord(), 2);
  assert.ok(!isStruggling(r), 'never rated badly');
  assert.ok(!isStruggling(rate(r, 'easy', NOW)));
  r = rate(r, 'hard', NOW);
  assert.ok(isStruggling(r), 'Shaky puts it on');
  r = good(r, CLEARS - 1);
  assert.ok(isStruggling(r), 'not yet');
  r = rate(r, 'again', NOW);
  r = good(r, CLEARS - 1);
  assert.ok(isStruggling(r), 'Forgot resets the count');
  r = rate(r, 'easy', NOW);
  assert.ok(!isStruggling(r), 'Instant counts as good too');
  assert.ok(!isStruggling(rate(good(r, 5), 'good', NOW)), 'stays off, even with low ease and past lapses');
  assert.ok(isStruggling(rate(r, 'hard', NOW)), 'and comes back on a new slip');
  // Saved before the count existed: a past struggle starts at zero.
  const old = { ease: 2.2, interval: 3, reps: 4, lapses: 1, due: 0 };
  assert.ok(isStruggling(old));
  assert.ok(!isStruggling(good(old, CLEARS)));
  assert.ok(!isStruggling({ ease: 2.6, interval: 9, reps: 4, lapses: 0, due: 0 }));
});

test('kanji breakdowns: one name per part, a story for every built-up kanji', () => {
  const all = [...json('kanji-n5'), ...json('kanji-more')];
  const names = new Map();
  const clashes = [];
  for (const k of all) {
    const own = k.parts.length === 1 && k.parts[0].c === k.k;
    if (!own) assert.ok(k.story && k.parts.every((p) => p.label && p.mn), `${k.k} needs parts and a story`);
    else assert.ok(!k.story && k.parts[0].mn, `${k.k} is its own picture: the story is its one line`);
    for (const p of own ? [] : k.parts) {
      if (names.has(p.c) && names.get(p.c) !== p.label) clashes.push(`${p.c}: ${names.get(p.c)} / ${p.label} (${k.k})`);
      names.set(p.c, p.label);
    }
  }
  assert.deepEqual(clashes, [], 'a part with two names');
  // Rare characters show as empty boxes on some phones: parts stay in the main kanji block, kana and the radical forms.
  const rare = [...names.keys()].filter((c) => c.codePointAt(0) > 0xffff || /[⺀-⿟㐀-䶿]/.test(c));
  assert.deepEqual(rare, [], 'parts that may not display');
});

test('lessons show new parts once, just before the kanji built from them', () => {
  const merged = course();
  const unit = merged.units.find((u) => u.lessons.some((l) => (l.kanji || []).some((c) => {
    const k = merged.kanji.find((x) => x.k === c);
    return k && k.parts.some((p) => p.c !== c);
  })));
  const lesson = unit.lessons.find((l) => (l.kanji || []).length);
  const steps = lessonSteps(unit, lesson, blank(), merged);
  const shown = steps.filter((s) => s.type === 'parts').flatMap((s) => s.ref.map((p) => p.c));
  assert.ok(shown.length, 'a first lesson with built-up kanji meets some parts');
  assert.equal(new Set(shown).size, shown.length, 'each part once');
  for (const s of steps.filter((x) => x.type === 'learn' && x.kind === 'kanji')) {
    const first = steps.indexOf(s);
    for (const p of s.ref.parts) {
      if (p.c === s.ref.k) continue;
      const at = steps.findIndex((x) => x.type === 'parts' && x.ref.some((q) => q.c === p.c));
      assert.ok(at === -1 || at < first, `${p.c} comes before ${s.ref.k}`);
    }
  }
  // Parts of kanji you've started are known.
  const state = blank();
  for (const k of merged.kanji) state.items[`k:${k.k}`] = newRecord();
  for (const k of lesson.kanji) delete state.items[`k:${k}`];
  const later = lessonSteps(unit, lesson, state, merged).filter((s) => s.type === 'parts').flatMap((s) => s.ref.map((p) => p.c));
  const others = new Set(merged.kanji.filter((k) => !lesson.kanji.includes(k.k)).flatMap((k) => [k.k, ...k.parts.map((p) => p.c)]));
  assert.ok(later.every((c) => !others.has(c)), 'a part you already know is not shown again');
});

test('kanji breakdowns say whether they are real or a memory trick, and sound families hold together', () => {
  const all = [...json('kanji-n5'), ...json('kanji-more')];
  const have = new Set(all.map((k) => k.k));
  assert.ok(all.every((k) => k.origin === 'real' || k.origin === 'trick'));
  const real = all.filter((k) => k.origin === 'real').map((k) => k.k);
  for (const c of '休明男日山川木') assert.ok(real.includes(c), `${c} is a real origin`);
  const byKanji = new Map(all.map((k) => [k.k, k]));
  for (const k of all.filter((x) => x.sound)) {
    assert.ok(k.sound.on && k.sound.kin.length && k.sound.kin.every((c) => have.has(c) && c !== k.k), `${k.k} sound family`);
  }
  assert.deepEqual(['晴', '清', '精', '静'].map((c) => byKanji.get(c).sound?.c), ['青', '青', '青', '青']);
});

test('kanji in stories and sound families can be tapped to see what they are', () => {
  const all = [...json('kanji-n5'), ...json('kanji-more')];
  setKanji(all);
  const by = new Map(all.map((k) => [k.k, k]));
  // Every kanji a story, part line or sound family mentions can be looked up.
  const dead = new Set();
  for (const k of all) {
    const text = [k.story || '', ...k.parts.map((p) => p.mn), ...(k.sound ? [k.sound.c, ...k.sound.kin] : [])].join('');
    for (const c of text.match(/[一-龯々]/g) || []) if (c !== k.k && !linkKanji(c, k.k).includes('data-kref')) dead.add(c);
  }
  assert.deepEqual([...dead], [], 'kanji mentioned with nothing to show');
  assert.ok(!linkKanji('Compare 士', '士').includes('data-kref'), 'not the kanji being explained');
  assert.ok(soundLine(by.get('晴')).includes('data-kref="青"'));
  assert.ok(peekHtml('青').includes('blue'));
  assert.ok(peekHtml('甬').includes('a part'), 'a part that is not a kanji still has a card');
});
