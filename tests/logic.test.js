import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newRecord, rate, isDue, stageOf } from '../js/srs.js';
import { validNext, explainWrong, orders, tokenize, romajiLine, spoken } from '../js/drills.js';
import { backupJson, parseBackup } from '../js/store.js';
import { romaji, toHiragana, toKana, judgeReading } from '../js/romaji.js';
import { speechText } from '../js/tts.js';
import { matchReading } from '../js/readings.js';
import { reviewSteps, kanjiId, talkId } from '../js/session.js';
import {
  UNIT_FILES, mergeCourse, nextUp, isUnlocked, examUnlocked, lessonSteps, LEVELS, levelUnlocked, toBlocks, autoAlts, words, particleItem,
  courseSteps, rankOf, LESSON_NEW, unitStars, unitItems, grammarId,
} from '../js/course.js';
import { unitTest, mockExam, grade } from '../js/exam.js';
import { checkLogin, hashPassword, userId } from '../js/lock.js';

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
  const state = { ...blank(), v: 1, course: { done: { u01a: 1 }, passed: { u01: 1 }, missed: {}, best: { u01: 0.9 }, current: null }, practice: { sent: { s01: 1 }, part: {} }, exams: { current: null, history: [{ total: 100 }] } };
  const { state: restored } = parseBackup(backupJson(state, NOW));
  assert.deepEqual(restored.course, state.course);
  assert.deepEqual(restored.practice, state.practice);
  assert.deepEqual(restored.exams, state.exams);
  const old = parseBackup(backupJson(blankOld(), NOW)).state;
  assert.deepEqual(old.course, { done: {}, passed: {}, missed: {}, best: {}, current: null });
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
  for (const k of c.kanji) {
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
  const types = lessonSteps(unit, unit.lessons[0], blank(), merged).map((s) => s.type);
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
  assert.deepEqual(courseSteps(state, merged.units), { done: 0, total: merged.units.length * 3 });
  state.course.done.u01a = 1;
  state.course.passed.u01 = 1;
  assert.equal(courseSteps(state, merged.units).done, 2);
  assert.equal(rankOf(0).en, 'Beginner');
  assert.equal(rankOf(5).en, 'Starter');
  assert.equal(rankOf(24).next, null);
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
