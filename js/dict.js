// The offline dictionary: search over data/dict.json, built from JMdict by tools/dict-build.html.
// Pure functions, so the tests can run them without the app.
import { toKana, toHiragana } from './romaji.js';

// Row flags, as tools/dict-build.html writes them.
export const N5 = 1;
export const KANA_ONLY = 2;
export const COMMON = 4;
export const TAUGHT = 8;

const JP = /[぀-ヿ㐀-鿿々]/;
// Words that start a gloss but don't help find it: "to eat", "a cat", "the sea".
// "to get tired" and "I'm sorry" are found by "tired" and "sorry".
const lead = (s) => s.replace(/^(to|a|an|the) /, '').replace(/^(get|become|be|i'm|i am) (?=\S)/, '');
const tidy = (s) => s.toLowerCase().replace(/\([^)]*\)/g, ' ').replace(/[^a-z0-9' -]/g, ' ').replace(/\s+/g, ' ').trim();
// "cat (esp. the domestic cat)" is found by "cat", not by what's in brackets.
const clean = (s) => lead(tidy(s));

// One entry per row, with what search needs worked out once.
export function makeIndex(rows) {
  return rows.map(([w, y, m, pos, f, alt, freq = 0]) => {
    const senses = m.split('|').map((s) => s.split('; '));
    return {
      w: w || y, y, pos, f, senses, freq,
      // Shown as written: kana for words usually written in kana.
      head: !w || f & KANA_ONLY ? y : w,
      forms: [w, y, ...(alt ? alt.split(',') : [])].filter(Boolean).map(toHiragana),
      // Each gloss cleaned, with its sense number, its place in that sense, and whether it's a verb ("to exit").
      gl: senses.flatMap((s, n) => s.map((g, i) => [clean(g), n, i, /^to /.test(tidy(g))])),
    };
  });
}

// Plurals ("women", "lockers") also find the singular gloss, a little lower.
const IRREGULAR = { men: 'man', women: 'woman', children: 'child', people: 'person', feet: 'foot', teeth: 'tooth', mice: 'mouse' };
export function singular(q) {
  const last = q.split(' ').pop();
  const one = IRREGULAR[last] || (/ies$/.test(last) ? `${last.slice(0, -3)}y`
    : /(ss|us)$/.test(last) ? null
      : /(ch|sh|x|ss|us)es$/.test(last) ? last.slice(0, -2)
        : /s$/.test(last) ? last.slice(0, -1) : null);
  return one && one !== last ? q.replace(/[a-z']+$/, one) : null;
}

// How well one entry matches English text: exact gloss beats a gloss that ends with it
// ("railway station"), which beats one that starts with it, which beats a word inside a
// gloss. The first sense counts most, and the first gloss in a sense a little more.
// "exit" leans to the noun 出口 and "to exit" to the verb 出る.
function englishScore(e, q, verb) {
  let best = 0;
  for (const [g, n, i, isVerb] of e.gl) {
    const cut = Math.min(n, 2) * 30 - (i === 0 ? 4 : 0) + (isVerb === verb ? 0 : 12);
    const words = g.split(' ').length;
    if (g === q) best = Math.max(best, 100 - cut);
    else if (g.endsWith(` ${q}`) && words <= 3) best = Math.max(best, (words === 2 ? 70 : 62) - cut);
    else if (g.startsWith(`${q} `)) best = Math.max(best, 60 - cut);
    else if (` ${g} `.includes(` ${q} `)) best = Math.max(best, 40 - cut);
    else if (q.length >= 3 && (g.startsWith(q) || g.includes(` ${q}`))) best = Math.max(best, 22 - cut);
  }
  return best;
}

function kanaScore(e, q, inside = true) {
  let best = 0;
  for (const f of e.forms) {
    if (f === q) best = Math.max(best, 95);
    else if (f.startsWith(q)) best = Math.max(best, 50 - Math.min(20, f.length - q.length));
    else if (inside && q.length >= 2 && f.includes(q)) best = Math.max(best, 15);
  }
  return best;
}

// Course words, N5 words, everyday ones and words met often in real sentences lead among equal matches.
const boost = (e) => (e.f & TAUGHT ? 14 : 0) + (e.f & N5 ? 10 : 0) + (e.f & COMMON ? 6 : 0) + e.freq * 1.5;

// Results for what's typed so far: English, kana, kanji or romaji ("neko").
export function search(index, query, limit = 8) {
  const raw = query.trim().toLowerCase();
  if (!raw) return [];
  let scoreOf;
  if (JP.test(raw)) {
    const q = toHiragana(raw);
    scoreOf = (e) => kanaScore(e, q);
  } else {
    const q = clean(raw);
    const verb = /^to /.test(tidy(raw));
    if (!q) return [];
    // Romaji counts once it spells kana cleanly ("neko"). When the text is also a real
    // English word ("rain", not ライン), the English matches come first.
    const kana = toKana(raw.replace(/\s+/g, ''), { done: true });
    const asKana = /^[぀-ゟー]+$/.test(kana) ? kana : '';
    let english = 0;
    for (const e of index) english = Math.max(english, englishScore(e, q, verb));
    const weight = english >= 60 ? 0.4 : 0.85;
    const one = singular(q);
    scoreOf = (e) => Math.max(englishScore(e, q, verb), one ? englishScore(e, one, verb) - 3 : 0, asKana ? kanaScore(e, asKana, false) * weight : 0);
  }
  const hits = [];
  for (const e of index) {
    const s = scoreOf(e);
    if (s > 0) hits.push([s + boost(e), e]);
  }
  hits.sort((a, b) => b[0] - a[0] || a[1].head.length - b[1].head.length);
  // The same word can appear as two entries (a noun and a suffix): show it once.
  const seen = new Set();
  const out = [];
  for (const [, e] of hits) {
    const key = `${e.head}|${e.y}`;
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(e);
    if (out.length === limit) break;
  }
  return out;
}

// JMdict's part-of-speech codes, as words.
const POS = [
  [/^v1/, 'る verb'], [/^v5/, 'う verb'], [/^vs/, 'する verb'], [/^vk/, 'irregular verb'], [/^adj-i/, 'い adjective'],
  [/^adj-na/, 'な adjective'], [/^adj/, 'adjective'], [/^adv/, 'adverb'], [/^n/, 'noun'], [/^pn/, 'pronoun'],
  [/^prt/, 'particle'], [/^ctr/, 'counter'], [/^(int|exp)/, 'expression'], [/^conj/, 'conjunction'], [/^suf/, 'suffix'],
  [/^pref/, 'prefix'], [/^num/, 'number'], [/^aux/, 'grammar ending'],
];
export const posName = (pos) => POS.find(([re]) => re.test(pos))?.[1] || '';

// Short lists to browse before typing anything. Each item: [Japanese, reading, English].
export const BROWSE = [
  { id: 'numbers', title: 'Numbers', items: [
    ['一', 'いち', 'one'], ['二', 'に', 'two'], ['三', 'さん', 'three'], ['四', 'よん', 'four'], ['五', 'ご', 'five'],
    ['六', 'ろく', 'six'], ['七', 'なな', 'seven'], ['八', 'はち', 'eight'], ['九', 'きゅう', 'nine'], ['十', 'じゅう', 'ten'],
    ['百', 'ひゃく', 'hundred'], ['千', 'せん', 'thousand'], ['万', 'まん', 'ten thousand'], ['ゼロ', 'ぜろ', 'zero'],
  ] },
  { id: 'counters', title: 'Counting things', items: [
    ['一つ', 'ひとつ', 'one (thing)'], ['二つ', 'ふたつ', 'two (things)'], ['三つ', 'みっつ', 'three (things)'],
    ['一人', 'ひとり', 'one person'], ['二人', 'ふたり', 'two people'], ['三人', 'さんにん', 'three people'],
    ['一枚', 'いちまい', 'one flat thing (ticket, paper)'], ['一本', 'いっぽん', 'one long thing (bottle, pen)'],
    ['一匹', 'いっぴき', 'one small animal'], ['一冊', 'いっさつ', 'one book'], ['一個', 'いっこ', 'one small object'],
    ['一回', 'いっかい', 'once, one time'], ['一階', 'いっかい', 'first floor'], ['一円', 'いちえん', 'one yen'],
    ['いくつ', 'いくつ', 'how many?'], ['いくら', 'いくら', 'how much?'],
  ] },
  { id: 'time', title: 'Time and days', items: [
    ['今日', 'きょう', 'today'], ['明日', 'あした', 'tomorrow'], ['昨日', 'きのう', 'yesterday'], ['今', 'いま', 'now'],
    ['朝', 'あさ', 'morning'], ['昼', 'ひる', 'noon, daytime'], ['晩', 'ばん', 'evening'], ['夜', 'よる', 'night'],
    ['一時', 'いちじ', "one o'clock"], ['半', 'はん', 'half past'], ['分', 'ふん', 'minute'], ['何時', 'なんじ', 'what time?'],
    ['月曜日', 'げつようび', 'Monday'], ['火曜日', 'かようび', 'Tuesday'], ['水曜日', 'すいようび', 'Wednesday'],
    ['木曜日', 'もくようび', 'Thursday'], ['金曜日', 'きんようび', 'Friday'], ['土曜日', 'どようび', 'Saturday'],
    ['日曜日', 'にちようび', 'Sunday'], ['週末', 'しゅうまつ', 'weekend'],
  ] },
  { id: 'directions', title: 'Directions and places', items: [
    ['右', 'みぎ', 'right'], ['左', 'ひだり', 'left'], ['まっすぐ', 'まっすぐ', 'straight ahead'], ['前', 'まえ', 'in front'],
    ['後ろ', 'うしろ', 'behind'], ['上', 'うえ', 'above, on top'], ['下', 'した', 'below, under'], ['中', 'なか', 'inside'],
    ['外', 'そと', 'outside'], ['隣', 'となり', 'next to'], ['近く', 'ちかく', 'nearby'], ['駅', 'えき', 'station'],
    ['入口', 'いりぐち', 'entrance'], ['出口', 'でぐち', 'exit'], ['トイレ', 'といれ', 'toilet'], ['どこ', 'どこ', 'where?'],
    ['北', 'きた', 'north'], ['南', 'みなみ', 'south'], ['東', 'ひがし', 'east'], ['西', 'にし', 'west'],
  ] },
  { id: 'phrases', title: 'Common phrases', items: [
    ['おはようございます', 'おはようございます', 'good morning'], ['こんにちは', 'こんにちは', 'hello, good afternoon'],
    ['こんばんは', 'こんばんは', 'good evening'], ['ありがとうございます', 'ありがとうございます', 'thank you'],
    ['すみません', 'すみません', 'excuse me, sorry'], ['ごめんなさい', 'ごめんなさい', "I'm sorry"],
    ['お願いします', 'おねがいします', 'please'], ['いただきます', 'いただきます', 'said before eating'],
    ['ごちそうさまでした', 'ごちそうさまでした', 'said after eating'], ['いってきます', 'いってきます', "I'm off"],
    ['ただいま', 'ただいま', "I'm home"], ['おやすみなさい', 'おやすみなさい', 'good night'],
    ['はじめまして', 'はじめまして', 'nice to meet you'], ['さようなら', 'さようなら', 'goodbye'],
  ] },
  { id: 'responses', title: 'Responses', items: [
    ['はい', 'はい', 'yes'], ['いいえ', 'いいえ', 'no'], ['そうです', 'そうです', "that's right"],
    ['ちがいます', 'ちがいます', "that's wrong, no"], ['わかりました', 'わかりました', 'understood'],
    ['わかりません', 'わかりません', "I don't understand"], ['大丈夫です', 'だいじょうぶです', "it's fine"],
    ['いいですね', 'いいですね', 'sounds good'], ['ちょっと…', 'ちょっと', "that's a bit… (a polite no)"],
    ['どうぞ', 'どうぞ', 'go ahead, here you are'], ['どういたしまして', 'どういたしまして', "you're welcome"],
    ['もう一度お願いします', 'もういちどおねがいします', 'once more, please'],
  ] },
  { id: 'questions', title: 'Question words', items: [
    ['何', 'なに', 'what'], ['誰', 'だれ', 'who'], ['どこ', 'どこ', 'where'], ['いつ', 'いつ', 'when'],
    ['どうして', 'どうして', 'why'], ['どう', 'どう', 'how'], ['どれ', 'どれ', 'which one'], ['どの', 'どの', 'which (+ noun)'],
    ['どちら', 'どちら', 'which way, which of two'], ['いくつ', 'いくつ', 'how many, how old'], ['いくら', 'いくら', 'how much'],
    ['どんな', 'どんな', 'what kind of'],
  ] },
];
