import test from 'node:test';
import assert from 'node:assert/strict';
import { readFileSync } from 'node:fs';
import { newRecord, rate, isDue } from '../js/srs.js';
import { validNext, explainWrong, orders, tokenize, romajiLine } from '../js/drills.js';
import { buildSession, kanjiId } from '../js/session.js';

const json = (f) => JSON.parse(readFileSync(new URL(`../data/${f}.json`, import.meta.url)));
const data = {
  kanji: json('kanji-n5'), vocab: json('vocab-n5'), sentences: json('sentences'), particles: json('particles'),
};
const NOW = new Date(2026, 10, 5, 22, 0).getTime();
const DAY = 864e5;
const blank = () => ({ items: {}, days: {}, settings: { newPerDay: 4, hints: true, theme: 'system' } });

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
  assert.equal(cards.length, 9);
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
  const g = json('glossary');
  const { cards, sets } = data.particles;
  for (const c of cards) for (const b of c.ex) assert.ok(g[b.t], `${c.p} ${b.t}`);
  for (const c of cards) assert.ok(g[c.p], c.p);
  for (const set of sets) {
    for (const it of set.items) {
      for (const w of [...tokenize(set.noun, g), ...tokenize(it.after, g)]) assert.ok(g[w], `${it.id} ${w}`);
    }
  }
});

test('kanji data: example words exist in vocab', () => {
  for (const k of data.kanji) {
    for (const w of k.words) assert.ok(data.vocab.some((v) => v.w === w), `${k.k} ${w}`);
  }
});

test('new session teaches, tests, then drills, within daily caps', () => {
  const { steps, counts } = buildSession(blank(), data, NOW);
  assert.deepEqual(counts, { reviews: 0, learn: 6, sentences: 3, particles: 3 });
  assert.deepEqual(steps.map((s) => s.type), [
    ...Array(6).fill('learn'), ...Array(6).fill('card'), ...Array(3).fill('sentence'), ...Array(3).fill('particle'),
  ]);
});

test('due items lead the session; finished daily caps are respected', () => {
  const state = blank();
  const key = data.kanji[0];
  state.items[kanjiId(key)] = { ...newRecord(), due: NOW - DAY, reps: 2, interval: 3 };
  assert.equal(buildSession(state, data, NOW).steps[0].id, kanjiId(key));
  const d = new Date(NOW);
  const today = `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}-${String(d.getDate()).padStart(2, '0')}`;
  state.days[today] = { newK: 4, newW: 2, reviews: 1, sentences: 3, particles: 3 };
  assert.deepEqual(buildSession(state, data, NOW).counts, { reviews: 1, learn: 0, sentences: 0, particles: 0 });
});
