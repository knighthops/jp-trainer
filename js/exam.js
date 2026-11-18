// Unit tests and mock exams share this runner. The pure functions at the top build
// and grade a test; startExam runs it on screen. In the data, the first option of a
// question is the right one. Options are shuffled here, with a fixed order per exam
// so a mock exam can be resumed.
import { words, PASS_SHARE, textTaught } from './course.js';
import { shuffled, romajiLine, bindGloss, glossHtml, compareHtml, MARK_SVG } from './drills.js';
import { sameMeaning } from './exercises.js';
import { speakLines, cancel, SLOW, NORMAL } from './tts.js';
import { icons } from './icons.js';

// After a failed unit test, a short break before the next try, so it can't be passed by memorising answers.
export const RETAKE_MIN = 10;

function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) + 0x6d2b79f5;
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
}

function prepared(q, rng) {
  // A build question's pieces come in order; any shuffle but the right one will do.
  if (q.build) {
    let o = shuffled(q.o, rng);
    for (let n = 0; n < 5 && o.join(' ') === q.o.join(' '); n++) o = shuffled(q.o, rng);
    if (o.join(' ') === q.o.join(' ')) o = [...o.slice(1), o[0]];
    return { ...q, o, a: q.o.join(' ') };
  }
  const o = shuffled(q.o, rng);
  return { ...q, o, a: o.indexOf(q.o[0]) };
}

// What an answer says, for the results: the option picked, or the sentence as built.
export function answerText(q, ans) {
  if (!q.build) return q.o[ans];
  return [...q.before, ...String(ans).split(' '), ...q.after].join(' ');
}

// Quick response, as the listening section asks it: one line is heard, and you pick the
// reply. Built only from conversations you've finished, so every word is taught. A wrong reply
// answers a different kind of question, one that can't pass for an answer here: a price for
// a yes/no question, はい for "where". "What do you do?" fits almost any action, so it only
// takes はい/いいえ or a number as wrong replies. A request (入って ください) is answered too.
const QWORDS = [['何時', 'when'], ['何曜日', 'when'], ['いつ', 'when'], ['何人', 'num'], ['いくら', 'num'], ['いくつ', 'num'],
  ['何', 'what'], ['なに', 'what'], ['なん', 'what'], ['どこ', 'where'], ['だれ', 'who'], ['誰', 'who'],
  ['どれ', 'which'], ['どの', 'which'], ['どちら', 'which'], ['どうして', 'why'], ['なぜ', 'why'], ['どんな', 'how'], ['どう', 'how']];
const askKind = (t) => {
  const ts = words(t);
  // 何か, だれか: "something", "someone", which makes a yes/no question.
  const hit = QWORDS.find(([w]) => ts.some((x, j) => x.startsWith(w) && x !== `${w}か` && !(x === w && ts[j + 1] === 'か')));
  return hit ? hit[1] : /ください$/.test(t) ? 'req' : 'yn';
};
const PLAIN = ['yn', 'num', 'when', 'who', 'where', 'which'];
const FITS_NOT = {
  yn: ['num', 'when', 'who', 'where', 'which'], what: ['yn', 'num'], how: ['yn', 'num'], why: ['yn', 'num'],
  // A price can answer an order (この パン も ください), and a season can pass for which of two.
  req: ['when', 'who', 'where', 'which', 'what'], which: ['yn', 'num', 'who', 'where'],
};
const sentences = (t) => t.split(/ ?[。？！] ?/).map((x) => x.trim()).filter(Boolean);
// Only the question itself is heard (今 何時 です か, not the すみません before it), and a
// reply loses a question asked back at the end (… 田中 さん は 学生 です か).
const replyPairs = (u) => (u.dialogue?.lines || []).flatMap((l, i, all) => {
  const next = all[i + 1];
  if (!next || next.s === l.s) return [];
  const ask = sentences(l.t).at(-1);
  const kind = askKind(ask);
  // A question ends in か, or asks with a question word in casual speech (何 を した).
  if (!ask || !(/か$/.test(ask) || kind !== 'yn')) return [];
  const said = sentences(next.t);
  while (said.length > 1 && /(か|は)$/.test(said.at(-1))) said.pop();
  const reply = said.join(' 。 ');
  if (!reply || /か$/.test(reply) || /^(はい|ええ|そう です か|そうですか)$/.test(reply)) return [];
  return [{ unit: u, i, ask, en: l.en, reply, kind }];
});
export function quickReplies(heard, unit, rng = Math.random, max = 3) {
  const all = heard.flatMap(replyPairs);
  const flat = (t) => t.replace(/ +/g, '');
  const yesNo = (t) => /^(はい|いいえ|ええ|うん)/.test(t);
  const kindOf = (o) => (yesNo(o.reply) ? 'yn' : o.kind);
  return shuffled(replyPairs(unit), rng).flatMap((p) => {
    const ok = FITS_NOT[p.kind] || PLAIN.filter((k) => k !== p.kind);
    // いいですね answers a yes/no question, but also how something is: only はい/いいえ will do there.
    const open = ['what', 'how', 'why'].includes(p.kind);
    const wrong = shuffled(all.filter((o) => o !== p && ok.includes(kindOf(o)) && flat(o.reply) !== flat(p.reply)
      && !(open && kindOf(o) === 'yn' && !yesNo(o.reply))), rng);
    const picked = [];
    for (const o of wrong) if (picked.length < 2 && !picked.some((x) => flat(x) === flat(o.reply))) picked.push(o.reply);
    if (picked.length < 2) return [];
    return [{
      q: 'Listen, then choose the best reply.', ask: 'Quick response', ao: true, play: [['A', p.ask]],
      o: [p.reply, ...picked],
      w: `They said ${flat(p.ask)} (${p.en}) The reply: ${flat(p.reply)}.`,
    }];
  }).slice(0, max);
}

export function mockExam(paper) {
  const rng = seeded(paper.id);
  return {
    key: paper.id,
    title: paper.title,
    scoring: 'jlpt',
    sections: paper.sections.map((s) => ({
      title: s.title,
      minutes: s.minutes,
      score: s.score,
      questions: s.parts.flatMap((part) => part.questions.map((q, i) => prepared({
        ...q, id: `${part.id}-${i}`, part: part.title, instr: part.instr, p: q.p || part.p,
      }, rng))),
    })),
  };
}

const MIN_QUESTIONS = 10;

const KATAKANA = /^[゠-ヿ]+$/;
// A rough word class from the vocab list, which has no part of speech: verbs are glossed
// "to …", and い-adjectives are kanji with a trailing い (きれい and friends count as nouns).
// な-adjectives and question words are short fixed lists at N5, so they're named here.
const NA_ADJ = new Set(['きれい', '静か', 'にぎやか', '有名', '元気', '好き', '嫌い', '大好き', '上手', '下手', '便利', '大丈夫', '大切', '暇', '簡単', 'いろいろ', '丈夫', '大変', '親切', '同じ']);
const QUESTION = new Set(['何', 'なに', 'なん', 'だれ', '誰', 'どなた', 'どこ', 'どちら', 'どれ', 'どの', 'どんな', 'いつ', 'いくら', 'いくつ', 'どう', 'どうして', 'なぜ', '何時', '何人', '何歳']);
// Verbs written in kana only, and words that end like a verb or adjective but aren't one.
const NOT_VERB = new Set(['向こう', '近く', '遠く']);
const KANA_VERBS = new Set(['はく', 'かぶる', 'ある', 'いる', 'する', 'なる', 'わかる', 'できる', 'あげる', 'もらう', 'くれる', 'いらっしゃる', 'かかる', 'ちがう', 'つく', 'つける', 'しまう']);
const NOT_ADJ = new Set(['お手洗い', '手洗い', '違い', 'お祝い', 'お願い']);
export function wordKind(v) {
  if (QUESTION.has(v.w)) return 'question';
  if (NA_ADJ.has(v.w)) return 'na';
  // Kanji with okurigana ending in an u-row kana is a verb (帰る, 引く, 待つ), but not
  // a counted thing (一つ, 五つ); so are kana-only verbs and する verbs.
  if (!NOT_VERB.has(v.w) && (/^to /.test(v.m) || KANA_VERBS.has(v.w) || /する$/.test(v.w)
    || (/[一-鿿][ぁ-ん]*[うくぐすつぬぶむる]$/.test(v.w) && !/^[一二三四五六七八九十幾]つ$/.test(v.w)))) return 'verb';
  if (!NOT_ADJ.has(v.w) && (/[一-鿿][ぁ-ん]*い$/.test(v.w)
    || /^(大きい|小さい|おいしい|おもしろい|かわいい|やさしい|うれしい|いい|よい|ない|まずい|ひくい|せまい|ひろい|あつい|さむい|つめたい|あたたかい|すずしい|あぶない|うるさい|きたない|ちかい|とおい|はやい|おそい|わるい|あかるい|くらい|たかい|やすい|ながい|みじかい|おもい|かるい|ふるい|あたらしい|むずかしい|やさしい|いそがしい|たのしい|さびしい|からい|あまい|まるい|ぬるい|つまらない|ほしい)$/.test(v.w))) return 'adj';
  return 'noun';
}

const CASE = new Set(['を', 'に', 'で', 'へ', 'から', 'まで', 'が']);
const MOVES = new Set(['ぜんぜん', 'ときどき', 'いつも', 'よく', 'あまり', 'とても', 'もう', 'まだ', 'すぐ', 'ちょっと', 'たぶん', 'ゆっくり', '一緒に', 'また', '少し', 'たくさん',
  'みんなで', '全部', '毎朝', '毎日', '毎晩', '毎週', '毎年', '今日', '明日', '昨日', '今', '今朝', '今晩', '今週', '先週', '来週', '今月', '先月', '来月', '今年', '去年', '来年',
  'おととい', 'あさって', '朝', '昼', '夜', '晩', '午前', '午後', 'さっき', 'これから', '初めて', 'まっすぐ', 'だんだん', 'もっと', 'いちばん', 'ほんとうに', '本当に']);

// A build question: four pieces of a sentence are shuffled below it, and you tap them into
// the gaps in order. Needs at least one word after the gaps and four different pieces, so
// there's only one way to read the answer. The answer is the pieces joined by spaces, so it
// compares like any other answer.
export function starQuestion(sentence, id, rng = Math.random) {
  const list = words(sentence).filter((w) => !/^[。、？！]$/.test(w));
  if (list.length < 5) return null;
  // と and や join two things that could go either way round, and so do two adjectives.
  // Adverbs and times can sit in more than one place (ぜんぜん 肉 を, 肉 を ぜんぜん), and two
  // whole phrases can swap (母 に 花 を, 花 を 母 に), so a window with either is no good.
  const phrases = (p) => p.filter((x, i) => i > 0 && CASE.has(x) && !CASE.has(p[i - 1]) && p[i - 1] !== 'は').length;
  const fits = (p) => new Set(p).size === 4 && !p.some((x) => x === 'と' || x === 'や' || MOVES.has(x) || /^[一二三四五六七八九十百千何0-9０-９]/.test(x))
    && p.filter((x) => /い$/.test(x) && x !== 'ない').length < 2 && phrases(p) < 2;
  // Slots mid-sentence first; at the very start only when nothing else fits (short sentences).
  const starts = [...shuffled(Array.from({ length: Math.max(0, list.length - 5) }, (_, i) => i + 1), rng), 0];
  // From the very start, a window holding both sides of は can swap them (田中 さん は 医者 / 医者 は 田中 さん).
  const start = starts.find((s) => fits(list.slice(s, s + 4)) && !(s === 0 && list.slice(0, 4).includes('は')));
  if (start === undefined) return null;
  const pieces = list.slice(start, start + 4);
  return {
    id, build: true, before: list.slice(0, start), after: list.slice(start + 4),
    q: [...list.slice(0, start), '＿＿', ...list.slice(start + 4)].join(' '),
    ask: 'Tap the pieces in order to build the sentence.',
    o: pieces,
    w: list.join(' '),
  };
}

// Picks the right kanji for a word written in kana, underlined in a sentence when one from
// the unit uses it. Wrong spellings swap one kanji for a taught kanji that looks or sounds
// alike (sharing a part or a reading) where the course has taught one, and are never a real word.
export function spellingQuestion(v, taughtKanji, data, id, rng = Math.random, sentence = null) {
  const info = (c) => data.kanji.find((k) => k.k === c);
  const partsOf = (c) => new Set((info(c)?.parts || []).map((p) => p.c));
  const real = new Set(data.vocab.map((x) => x.w));
  const spots = [...v.w].map((c, i) => (/[一-龯]/.test(c) ? i : -1)).filter((i) => i >= 0);
  const fakes = [];
  for (const i of shuffled(spots, rng)) {
    const c = v.w[i];
    const mine = partsOf(c);
    const on = new Set(info(c)?.on || []);
    const strokes = info(c)?.strokes || 0;
    const like = (k) => [...partsOf(k)].filter((p) => mine.has(p) && p !== k).length * 2
      + ((info(k)?.on || []).some((r) => on.has(r)) ? 2 : 0)
      + (Math.abs((info(k)?.strokes || 0) - strokes) <= 1 ? 1 : 0);
    const pool = shuffled([...new Set(taughtKanji)].filter((k) => k !== c), rng).sort((a, b) => like(b) - like(a));
    for (const k of pool) {
      const fake = v.w.slice(0, i) + k + v.w.slice(i + 1);
      if (fakes.length < 3 && !real.has(fake) && !fakes.includes(fake)) fakes.push(fake);
    }
  }
  if (fakes.length < 3) return null;
  const tokens = sentence ? words(sentence) : [];
  const at = tokens.indexOf(v.w);
  const q = at >= 0 ? [...tokens.slice(0, at), `[${v.y}]`, ...tokens.slice(at + 1)].join(' ') : `[${v.y}]`;
  return {
    id, q, ask: at >= 0 ? 'How is the underlined word written?' : 'Which is the right way to write this word?',
    o: [v.w, ...fakes.slice(0, 3)], w: `${v.y} is written ${v.w}: ${v.m}.`, word: v.w,
  };
}

// The written questions of a unit, plus word questions drawn from what it teaches.
export function unitTest(unit, data, rng = Math.random) {
  const taught = unit.lessons.flatMap((l) => l.words || [])
    .map((w) => data.vocab.find((v) => v.w === w)).filter(Boolean);
  // Wrong options look like the right one: a verb's options are verbs, an adjective's are
  // adjectives. Words sharing a kanji come first (大学 next to 大人 and 学生), then words from
  // the course so far. Readings come from other kanji words, nearest in length, never katakana.
  const known = new Set(data.units.slice(0, data.units.indexOf(unit) + 1).flatMap((u) => u.lessons.flatMap((l) => l.words || [])));
  // Nothing on a test is from a later unit: not a wrong option, not a word in a question.
  const end = data.units.slice(0, data.units.indexOf(unit) + 1).reduce((n, u) => n + u.lessons.length, 0);
  // The question and its answer must be taught; an untaught wrong option is left off, and
  // a question left with fewer than three options is dropped.
  const ok = (t) => textTaught(t, data, end);
  const trim = (q) => (ok(q.q) && ok(q.o[0]) ? { ...q, o: q.o.filter((o, i) => i === 0 || ok(o)) } : null);
  const fair = (q) => q && q.o.length >= 3;
  const others = (field, right, of) => {
    const pool = data.vocab.filter((v) => known.has(v.w) && v[field] && v[field] !== right && v !== of
      && (field !== 'm' || !sameMeaning(v.m, right))
      && (field === 'm' || (v.w !== v.y && !KATAKANA.test(v.y))));
    const same = pool.filter((v) => wordKind(v) === wordKind(of));
    const kanji = [...of.w].filter((c) => /[一-龯]/.test(c));
    const near = (v) => (kanji.some((c) => v.w.includes(c)) ? 0 : known.has(v.w) ? 1 : 2)
      + (field === 'y' ? (Math.abs(v.y.length - right.length) + (v.y.at(-1) === right.at(-1) ? 0 : 0.5)) / 10 : 0);
    // Same-kind words first, nearest first; other words only to make up three.
    const byNear = (list) => shuffled(list, rng).sort((a, b) => near(a) - near(b));
    const ranked = [...byNear(same), ...byNear(pool.filter((v) => !same.includes(v)))];
    const out = [];
    for (const v of ranked) if (out.length < 3 && !out.some((o) => o === v[field] || (field === 'm' && sameMeaning(o, v.m)))) out.push(v[field]);
    return out;
  };
  // A word the unit's own quiz already asks about (はじめまして) isn't asked twice.
  const quizzed = new Set((unit.quiz || []).map((q) => q.q.replace(/[\s[\]。]/g, '')));
  // Two build questions (the exam’s ★ format, built in full), from sentences of different patterns (not 五人 です and
  // 四人 です). The unit's own sentences and conversation first, then earlier units'. Never
  // the spelling question's word, whose kanji the pieces would give away: it is picked after these.
  const sentencesOf = (u) => [...u.lessons.flatMap((l) => [...l.drills.filter((d) => d.b).map((d) => d.b), ...(l.examples || []).map((e) => e.t)]),
    ...(u.dialogue?.lines || []).map((l) => l.t)];
  const before = data.units.slice(0, data.units.indexOf(unit));
  const alike = (a, b) => {
    const x = words(a.w); const y = words(b.w);
    return x.length === y.length && x.filter((t, i) => t !== y[i]).length <= 2;
  };
  const order = [];
  for (const b of [...shuffled(sentencesOf(unit), rng), ...shuffled(before.flatMap(sentencesOf), rng)]) {
    if (order.length >= 2) break;
    // One sentence only: pieces from two (はい そう です | 田中 さん は…) blur where each ends.
    if (/[。、？！]/.test(b.trim().replace(/[。？！]$/, ''))) continue;
    const q = starQuestion(b, `${unit.id}-s${order.length}`, rng);
    if (q && ok(q.w) && !order.some((o) => o.w === q.w || alike(o, q))) order.push(q);
  }
  // The spelling question picks its word first, so a unit with few kanji words still gets one;
  // the word questions then leave that word alone. Set in one of the unit's sentences if it can be.
  const taughtKanji = data.units.slice(0, data.units.indexOf(unit) + 1)
    .flatMap((u) => u.lessons.flatMap((l) => l.kanji || []));
  const lines = unit.lessons.flatMap((l) => [...l.drills.filter((d) => d.b).map((d) => d.b), ...(l.examples || []).map((e) => e.t)]).filter(ok);
  const inStars = new Set(order.flatMap((q) => words(q.w)));
  const spellable = (v) => /[一-龯]/.test(v.w) && v.w !== v.y && !KATAKANA.test(v.y) && !quizzed.has(v.w) && !inStars.has(v.w)
    && [...v.w].every((c) => !/[一-龯]/.test(c) || taughtKanji.includes(c));
  const earlier = data.vocab.filter((v) => known.has(v.w) && !taught.includes(v));
  // The first word that makes a fair question; building one is slow, so it stops there.
  let spelled = null;
  for (const v of [...shuffled(taught.filter(spellable), rng), ...shuffled(earlier.filter(spellable), rng)]) {
    const q = spellingQuestion(v, taughtKanji, data, `${unit.id}-k`, rng, lines.find((t) => words(t).includes(v.w)));
    if (q) { spelled = { v, q }; break; }
  }
  const spelling = spelled?.q;
  const chosen = shuffled(taught.filter((v) => !quizzed.has(v.w) && v !== spelled?.v), rng).slice(0, 6);
  const wordQs = chosen.map((v, i) => (i % 2 === 0 && v.w !== v.y
    ? { id: `${unit.id}-r${i}`, q: `[${v.w}]`, ask: 'How is this read?', o: [v.y, ...others('y', v.y, v)], w: `${v.w} is read ${v.y}: ${v.m}.`, word: v.w }
    : { id: `${unit.id}-m${i}`, q: `[${v.w}]`, ask: 'What does this mean?', o: [v.m, ...others('m', v.m, v)], w: `${v.w} means ${v.m}.`, word: v.w }));
  const written = (unit.quiz || []).map((q, i) => ({ ...q, id: `${unit.id}-q${i}` })).map(trim).filter(fair);
  // Units that teach few words borrow fill-the-blank drills, so no test is too short to be fair.
  const blanks = unit.lessons.flatMap((l) => l.drills).filter((d) => d.c)
    .map((d, i) => ({
      id: `${unit.id}-c${i}`, q: d.c, ask: d.en ? `You want to say: “${d.en}”` : 'Which fits the blank?',
      o: [d.a, ...Object.keys(d.w)].slice(0, 4), w: d.note || '',
    })).map(trim).filter(fair);
  // The two JLPT formats a word list alone doesn't practise: putting pieces in order
  // and picking the right kanji spelling of a word written in kana.
  for (const q of [...order, spelling]) if (q) written.push(q);
  // Every few units, a longer passage with questions in Japanese, as the reading section asks.
  const passage = unit.passage && ok(unit.passage.p) ? unit.passage : null;
  if (passage) {
    written.push(...passage.questions.map((q, i) => ({
      ...q, id: `${unit.id}-p${i}`, p: passage.p, part: passage.title, ask: 'Read the passage, then answer.',
    })).map(trim).filter(fair));
  }
  const room = Math.max(0, MIN_QUESTIONS - wordQs.length - written.length);
  written.push(...shuffled(blanks, rng).slice(0, room));
  return {
    key: unit.id,
    title: `Unit ${unit.n} test`,
    scoring: 'unit',
    sections: [{
      title: `Unit ${unit.n} test`, minutes: null,
      // Questions on one passage stay together at the end, as on the exam.
      questions: [...shuffled([...wordQs, ...written.filter((q) => !q.p)], rng), ...written.filter((q) => q.p)].map((q) => prepared(q, rng)),
    }],
  };
}

export function grade(exam, answers) {
  const sections = exam.sections.map((s) => {
    const right = s.questions.filter((q) => answers[q.id] === q.a).length;
    return { title: s.title, score: s.score, right, total: s.questions.length };
  });
  const share = (list) => {
    const total = list.reduce((n, s) => n + s.total, 0);
    return total ? list.reduce((n, s) => n + s.right, 0) / total : 0;
  };
  if (exam.scoring === 'unit') {
    const pct = share(sections);
    return { scoring: 'unit', sections, share: pct, pass: pct >= PASS_SHARE };
  }
  // Real JLPT scores are scaled statistically, so this is only an estimate.
  const language = Math.round(share(sections.filter((s) => s.score === 'language')) * 120);
  const listening = Math.round(share(sections.filter((s) => s.score === 'listening')) * 60);
  const total = language + listening;
  return {
    scoring: 'jlpt', sections, language, listening, total, share: total / 180,
    pass: total >= 80 && language >= 38 && listening >= 19,
  };
}

const display = (text) => (/[A-Za-z]/.test(text) ? text : text.replace(/ +/g, '')).replace(/\[/g, '<u>').replace(/\]/g, '</u>').replace(/\n/g, '<br>');
const plain = (text) => words(text.replace(/[[\]]/g, '').replace(/\*/g, ''));
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const audioLines = (q) => [
  ...q.play.map(([s, t]) => ({ s, t })),
  ...(q.ao ? q.o.map((o, i) => ({ s: 'F', t: `${['いち', 'に', 'さん', 'よん'][i]}、${o}` })) : []),
];

// ctx: { view, setTop, glossary, persist(current|null), onFinish(result, exam, answers) }
export function startExam(ctx, exam, { mode = 'exam', resume = null } = {}) {
  const { view, setTop, glossary } = ctx;
  const timed = mode === 'exam' && exam.scoring === 'jlpt';
  // Unit tests check what you know, so they give no romaji or tap-to-translate either.
  const help = mode === 'practice';
  const once = mode === 'exam' && exam.scoring === 'jlpt';
  const st = resume || { key: exam.key, mode, sec: 0, i: 0, answers: {}, plays: {}, endAt: null, started: false };
  let tick = null;

  const save = () => { if (exam.scoring === 'jlpt') ctx.persist(st); };
  const stop = () => { clearInterval(tick); tick = null; cancel(); };
  const section = () => exam.sections[st.sec];
  const leave = () => { stop(); ctx.onExit(); };

  const header = (onPrev = null) => {
    const q = section().questions;
    setTop(section().title, {
      close: true,
      onClose: leave,
      onPrev,
      count: timed && st.endAt ? clock(st.endAt - Date.now()) : `${st.i + 1} / ${q.length}`,
      progress: (st.i / q.length) * 100,
      // A test can't be resumed, so Exit asks for a second tap.
      confirm: true,
    });
    if (timed && st.endAt && !tick) {
      tick = setInterval(() => {
        const left = st.endAt - Date.now();
        const el = document.querySelector('.count');
        if (el) el.textContent = clock(left);
        if (left <= 0) nextSection();
      }, 500);
    }
  };

  function intro() {
    const s = section();
    setTop(s.title, { close: true, onClose: leave });
    const rules = timed
      ? [`You have ${s.minutes} minutes for this section. The clock keeps running if you leave the app.`,
        'There is no romaji, and words can\'t be tapped.',
        s.score === 'listening' ? 'Each recording plays once, and you can\'t pause it. Use headphones.' : 'You can move back and change answers until the section ends.',
        'Once a section ends, you can\'t go back to it.']
      : exam.scoring === 'jlpt'
        ? ['There is no clock. Romaji and tappable words are available, and audio can be replayed.', 'This is good for learning, but it won\'t tell you how you\'d do on the day.']
        : [`Score ${Math.round(PASS_SHARE * 100)}% to pass. There's no romaji, and words can't be tapped.`,
          `You can go back and change answers before you finish. If you don't pass, you can retake it after a ${RETAKE_MIN}-minute break.`];
    view.innerHTML = `<section class="card">
        <span class="caps">${exam.title}</span>
        <h3>${s.title}</h3>
        <p class="small muted">${s.questions.length} questions${timed ? ` · ${s.minutes} minutes` : ''}</p>
        ${rules.map((r) => `<p class="small">${r}</p>`).join('')}
      </section>
      <div class="dock"><button class="btn" id="begin">Begin</button></div>`;
    view.querySelector('#begin').onclick = () => {
      if (timed) st.endAt = Date.now() + s.minutes * 60000;
      st.i = 0;
      st.started = true;
      save();
      question();
    };
  }

  function question() {
    window.scrollTo(0, 0);
    const list = section().questions;
    const q = list[st.i];
    const back = () => { cancel(); st.i--; save(); question(); };
    header(st.i > 0 ? back : null);
    // The underlined word is what's being tested, so help never gives it away.
    const secret = (w) => w.startsWith('[');
    const tokens = (q.q || '').split(/ +/).filter(Boolean);
    // A lone word ("What does this mean? 人") is the question itself: shown big, never tappable.
    const lone = tokens.length === 1 && !q.p && !q.play;
    const romajiOf = () => {
      if (!help || lone || tokens.every(secret)) return '';
      const ro = romajiLine(tokens.map((w) => (secret(w) ? null : plain(w)[0])), glossary, '');
      // A line with words it can't read (山田 san) is left out rather than half converted.
      // A blank on its own (（１）) has nothing to read.
      return /[一-龯々]/.test(ro) || !/[a-z]/.test(ro) ? '' : `<p class="romaji">${ro}</p>`;
    };
    const tappable = help && !q.ao && !lone && tokens.some((w) => !secret(w) && glossary[w]);
    const stem = lone ? `<div class="stem lone jp">${display(q.q)}</div>` : q.q ? (tappable
      ? `<div class="stem jp">${tokens.map((w) => (secret(w) ? display(w)
        : glossary[w] ? `<button class="word" data-word="${w}">${w}</button>` : `<span>${w}</span>`)).join('')}</div>`
      : `<div class="stem flow jp">${display(q.q)}</div>`) : '';
    const hideOptions = q.ao && !help;
    // A build question: the sentence with four gaps, and its pieces to tap into them.
    // Only a finished sentence counts as an answer; a half-built one waits in st.parts.
    st.parts ||= {};
    const built = q.build ? String(st.answers[q.id] ?? st.parts[q.id] ?? '').split(' ').filter(Boolean) : [];
    const buildHtml = () => `<div class="stem jp build-line">${q.before.map((w) => `<span>${w}</span>`).join('')}${q.o.map((_, i) => (built[i]
      ? `<button class="block placed" data-gap="${i}">${built[i]}</button>` : `<span class="gap ${i === built.length ? 'next' : ''}"></span>`)).join('')}${q.after.map((w) => `<span>${w}</span>`).join('')}</div>`;
    const bankHtml = () => `<div class="build-bank">${q.o.map((o) => `<button class="block ${built.includes(o) ? 'used' : ''}" data-piece="${o}">${o}</button>`).join('')}</div>`;
    view.innerHTML = `
      <div class="card ${tappable ? 'gloss-zone' : ''}">
        <span class="caps">${q.part || section().title}</span>
        ${q.instr ? `<p class="small muted">${q.instr}</p>` : ''}
        ${q.p ? `<div class="passage jp">${display(q.p)}</div>` : ''}
        ${q.play ? `<button class="btn ghost" id="play">${icons.speaker}<span>Play</span></button>
          ${help ? `<div class="seg mini" id="speed"><button class="on" data-r="${NORMAL}">Normal</button><button data-r="${SLOW}">Slow</button></div>` : ''}` : ''}
        ${q.ask ? `<p class="small muted">${q.ask}</p>` : ''}
        ${q.build ? buildHtml() : stem}
        ${q.build ? '' : romajiOf()}
        ${tappable ? glossHtml() : ''}
      </div>
      ${q.build ? `<div class="reach">${bankHtml()}</div>` : `<div class="reach"><div class="choices ${q.p && q.o.every((o) => o.length <= 12) ? 'grid2' : ''}" id="opts">${q.o.map((o, i) => `<button class="choice jp ${st.answers[q.id] === i ? 'picked' : ''}" data-i="${i}">
        <span class="cnum">${i + 1}</span><span class="grow">${hideOptions ? '' : display(o)}</span></button>`).join('')}</div></div>`}
      <div class="dock"><button class="btn" id="next">${st.i === list.length - 1 ? 'Review' : 'Next'}</button>
        <button class="link" id="map">All questions</button></div>`;
    if (tappable) bindGloss(view.querySelector('.gloss-zone'), glossary);

    let rate = NORMAL;
    const play = view.querySelector('#play');
    if (play) {
      const lockPlay = () => {
        play.disabled = true;
        play.querySelector('span').textContent = 'Played';
      };
      if (once && st.plays[q.id]) lockPlay();
      play.onclick = () => {
        if (once) {
          if (st.plays[q.id]) return;
          st.plays[q.id] = true;
          save();
          lockPlay();
          play.querySelector('span').textContent = 'Playing…';
          speakLines(audioLines(q), { rate, onend: lockPlay });
        } else {
          speakLines(audioLines(q), { rate });
        }
      };
    }
    view.querySelector('#speed')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      rate = Number(b.dataset.r);
      view.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
    });
    if (q.build) {
      // Tap a piece to put it in the next gap; tap a placed piece to take it back out.
      view.querySelector('.card').addEventListener('click', (e) => {
        const b = e.target.closest('[data-gap]');
        if (!b) return;
        built.splice(Number(b.dataset.gap), 1);
        keep();
      });
      view.querySelector('.build-bank').parentElement.addEventListener('click', (e) => {
        const b = e.target.closest('[data-piece]');
        if (!b || built.includes(b.dataset.piece) || built.length >= q.o.length) return;
        built.push(b.dataset.piece);
        keep();
      });
      const keep = () => {
        if (built.length === q.o.length) { st.answers[q.id] = built.join(' '); delete st.parts[q.id]; }
        else { delete st.answers[q.id]; st.parts[q.id] = built.join(' '); }
        save();
        view.querySelector('.build-line').outerHTML = buildHtml();
        view.querySelector('.build-bank').outerHTML = bankHtml();
      };
    }
    view.querySelector('#opts')?.addEventListener('click', (e) => {
      const b = e.target.closest('.choice');
      if (!b) return;
      st.answers[q.id] = Number(b.dataset.i);
      save();
      view.querySelectorAll('.choice').forEach((x) => x.classList.toggle('picked', x === b));
    });
    view.querySelector('#next').onclick = () => {
      cancel();
      if (st.i === list.length - 1) overview();
      else { st.i++; save(); question(); }
    };
    view.querySelector('#map').onclick = overview;
  }

  function overview() {
    cancel();
    window.scrollTo(0, 0);
    const list = section().questions;
    const blank = list.filter((q) => st.answers[q.id] === undefined).length;
    header();
    const lastSection = st.sec === exam.sections.length - 1;
    view.innerHTML = `<section class="card">
        <span class="caps">All questions</span>
        <p class="small muted">${blank ? `${blank} not answered. Tap a number to go to it.` : 'Everything is answered. Tap a number to check it.'}</p>
        <div class="qmap">${list.map((q, i) => `<button class="${st.answers[q.id] === undefined ? '' : 'on'}" data-i="${i}">${i + 1}</button>`).join('')}</div>
      </section>
      <div class="dock"><button class="btn" id="finish">${lastSection ? 'Finish and see results' : 'Finish this section'}</button></div>`;
    view.querySelector('.qmap').onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      st.i = Number(b.dataset.i);
      save();
      question();
    };
    view.querySelector('#finish').onclick = () => {
      // Ending a section can't be undone, so check first when answers are missing.
      if (blank && !window.confirm(`${blank} ${blank === 1 ? 'question is' : 'questions are'} not answered. ${lastSection ? 'Finish' : 'End this section'} anyway?`)) return;
      nextSection();
    };
  }

  function nextSection() {
    stop();
    if (st.sec < exam.sections.length - 1) {
      st.sec++;
      st.i = 0;
      st.endAt = null;
      st.started = false;
      save();
      intro();
    } else {
      ctx.persist(null);
      results();
    }
  }

  function results() {
    window.scrollTo(0, 0);
    const r = grade(exam, st.answers);
    // A unit test can add a note (a new rank) and its own buttons (next unit, drill the misses).
    const extra = ctx.onResult?.(r, exam, st.answers, mode) || {};
    const actions = extra.actions || [{ label: 'Finish', run: null }];
    setTop(exam.title, { close: true, onClose: () => ctx.onExit() });
    const headline = exam.scoring === 'jlpt' ? `${r.total}<small> / 180</small>` : `${Math.round(r.share * 100)}%`;
    const rows = exam.scoring === 'jlpt'
      ? `<div class="row"><span class="grow">Vocabulary, grammar and reading<br><span class="small muted">Needs at least 38</span></span><span class="num">${r.language} / 120</span></div>
         <div class="row"><span class="grow">Listening<br><span class="small muted">Needs at least 19</span></span><span class="num">${r.listening} / 60</span></div>`
      : '';
    const all = exam.sections.flatMap((s) => s.questions);
    const missed = all.filter((q) => st.answers[q.id] !== q.a);
    const right = all.filter((q) => st.answers[q.id] === q.a);
    // A built sentence is shown whole, so its explanation (the same sentence) is left off.
    const answerCard = (q, ok) => `<section class="card ${ok ? 'got' : ''}">
          ${q.p && !ok ? `<div class="passage jp">${display(q.p)}</div>` : ''}
          ${q.play ? `<div class="passage jp">${q.play.map(([s, t]) => `${s}: ${display(t)}`).join('<br>')}</div>` : ''}
          ${q.q && !q.build ? `<div class="stem flow jp">${display(q.q)}</div>` : ''}
          ${ok ? `<p class="got-line jp"><span class="got-mark">${MARK_SVG.good}</span>${display(answerText(q, q.a))}</p>`
            : compareHtml({ label: st.answers[q.id] === undefined ? 'Skipped' : 'You picked', text: st.answers[q.id] === undefined ? '<span class="muted">Not answered</span>' : `<span class="jp">${display(answerText(q, st.answers[q.id]))}</span>` }, `<span class="jp">${display(answerText(q, q.a))}</span>`)}
          ${q.w && !q.build ? `<p class="small">${q.w}</p>` : ''}
          ${q.en ? `<p class="small muted">${q.en}</p>` : ''}
        </section>`;
    view.innerHTML = `<section class="card hero done-hero">
        <div class="score">${headline}</div>
        <h2>${r.pass ? 'Passed' : 'Not yet'}</h2>
        <p class="sub">${exam.scoring === 'jlpt'
          ? `${r.pass ? 'Above' : 'Below'} the N5 pass mark of 80. This is an estimate: real scores are scaled, and this isn't an official result.`
          : extra.note || (r.pass ? 'Unit cleared.' : `You need ${Math.round(PASS_SHARE * 100)}%. Go over the answers below, then try again.`)}</p>
        ${extra.badge || ''}
      </section>
      ${rows || r.sections.length > 1 ? `<section class="card list">${rows}${r.sections.map((s) => `<div class="row"><span class="grow small">${s.title}</span><span class="num small">${s.right} / ${s.total}</span></div>`).join('')}</section>` : ''}
      ${missed.length ? `<div class="caps sect"><span>Answers to go over</span></div>
        ${missed.map((q) => answerCard(q, false)).join('')}` : ''}
      ${right.length ? (exam.scoring === 'jlpt'
        // A mock exam has a hundred questions, so the ones you got stay folded away.
        ? `<details class="got-right"><summary class="caps sect"><span>Answers you got right · ${right.length}</span></summary>${right.map((q) => answerCard(q, true)).join('')}</details>`
        : `<div class="caps sect"><span>Answers you got right</span></div>${right.map((q) => answerCard(q, true)).join('')}`) : ''}
      <div class="dock stack">${actions.map((a, i) => `<button class="btn ${i ? 'ghost' : ''}" data-act="${i}">${a.label}</button>`).join('')}</div>`;
    view.querySelector('.dock').onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      ctx.onExit();
      actions[Number(b.dataset.act)].run?.();
    };
  }

  if (st.started) {
    if (timed && st.endAt && st.endAt <= Date.now()) nextSection();
    else question();
  } else intro();
}
