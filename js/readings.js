// Works out which of a kanji's readings a word uses, and where it sits in the
// word's kana. Returns null for irregular words such as 今日 (きょう).
import { toHiragana } from './romaji.js';

const isKana = (s) => /^[ぁ-んァ-ヶー]*$/.test(s);

const VOICED = { か: 'が', き: 'ぎ', く: 'ぐ', け: 'げ', こ: 'ご', さ: 'ざ', し: 'じ', す: 'ず', せ: 'ぜ', そ: 'ぞ', た: 'だ', ち: 'ぢ', つ: 'づ', て: 'で', と: 'ど', は: 'ば', ひ: 'び', ふ: 'ぶ', へ: 'べ', ほ: 'ぼ' };
const HALF_VOICED = { は: 'ぱ', ひ: 'ぴ', ふ: 'ぷ', へ: 'ぺ', ほ: 'ぽ' };

// A reading can change sound inside a word: がく becomes がっ in がっこう,
// and くち becomes ぐち in でぐち.
function variants(stem) {
  const out = [stem];
  for (const table of [VOICED, HALF_VOICED]) {
    if (table[stem[0]]) out.push(table[stem[0]] + stem.slice(1));
  }
  if (stem.length > 1 && 'くきつちう'.includes(stem.at(-1))) out.push(`${stem.slice(0, -1)}っ`);
  return out;
}

export function matchReading(kanji, word, kana) {
  const at = word.w.indexOf(kanji.k);
  if (at < 0) return null;
  const pre = word.w.slice(0, at);
  const post = word.w.slice(at + 1);
  const y = toHiragana(kana);

  const options = [
    ...kanji.on.map((r) => ({ type: 'on', r })),
    ...kanji.kun.map((r) => ({ type: 'kun', r })),
  ].map((o) => ({ ...o, stem: toHiragana(o.r.split('-')[0]) }))
    .sort((a, b) => b.stem.length - a.stem.length);

  // Kana around the kanji pin down where its reading has to sit.
  const fits = (form) => {
    if (isKana(pre)) return y.startsWith(toHiragana(pre) + form) ? pre.length : -1;
    if (isKana(post)) {
      const start = y.length - post.length - form.length;
      return start >= 0 && y.startsWith(form, start) && y.endsWith(toHiragana(post)) ? start : -1;
    }
    return y.indexOf(form);
  };

  for (const o of options) {
    for (const form of variants(o.stem)) {
      const start = fits(form);
      if (start >= 0) return { type: o.type, reading: o.stem, start, length: form.length };
    }
  }
  return null;
}
