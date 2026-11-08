// Kana to Hepburn romaji, with macrons for long vowels.
// Long vowels are guessed from spelling, so a verb ending like おもう would come
// out as "omō". None of the current words hit this; a test checks them.
const ROWS = {
  あいうえお: ['a', 'i', 'u', 'e', 'o'],
  かきくけこ: ['ka', 'ki', 'ku', 'ke', 'ko'],
  がぎぐげご: ['ga', 'gi', 'gu', 'ge', 'go'],
  さしすせそ: ['sa', 'shi', 'su', 'se', 'so'],
  ざじずぜぞ: ['za', 'ji', 'zu', 'ze', 'zo'],
  たちつてと: ['ta', 'chi', 'tsu', 'te', 'to'],
  だぢづでど: ['da', 'ji', 'zu', 'de', 'do'],
  なにぬねの: ['na', 'ni', 'nu', 'ne', 'no'],
  はひふへほ: ['ha', 'hi', 'fu', 'he', 'ho'],
  ばびぶべぼ: ['ba', 'bi', 'bu', 'be', 'bo'],
  ぱぴぷぺぽ: ['pa', 'pi', 'pu', 'pe', 'po'],
  まみむめも: ['ma', 'mi', 'mu', 'me', 'mo'],
  やゆよ: ['ya', 'yu', 'yo'],
  らりるれろ: ['ra', 'ri', 'ru', 're', 'ro'],
  わを: ['wa', 'o'],
};
const MONO = {};
for (const [kana, roms] of Object.entries(ROWS)) [...kana].forEach((k, i) => { MONO[k] = roms[i]; });

const SMALL = { ゃ: 'a', ゅ: 'u', ょ: 'o' };
const SPECIAL = { し: 'sh', ち: 'ch', じ: 'j' };
const MACRON = { a: 'ā', i: 'ī', u: 'ū', e: 'ē', o: 'ō' };

export const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

export function romaji(kana) {
  const s = toHiragana(kana);
  let out = '';
  let double = false;
  let afterN = false;
  for (let i = 0; i < s.length; i++) {
    const c = s[i];
    if (c === 'っ') { double = true; continue; }
    if (c === 'ん') { out += 'n'; afterN = true; continue; }
    if (c === 'ー') { out = out.slice(0, -1) + (MACRON[out.at(-1)] || out.at(-1)); continue; }
    let rom = MONO[c];
    if (rom && SMALL[s[i + 1]]) {
      rom = (SPECIAL[c] || `${rom[0]}y`) + SMALL[s[i + 1]];
      i++;
    }
    if (!rom) { out += c; afterN = false; double = false; continue; }
    if (double) { rom = (rom.startsWith('ch') ? 't' : rom[0]) + rom; double = false; }
    if (afterN && /^[aiueoy]/.test(rom)) out += "'";
    afterN = false;
    out += rom;
  }
  return out.replace(/ou|oo/g, 'ō').replace(/uu/g, 'ū').replace(/aa/g, 'ā');
}

/* ---------- Typed romaji to hiragana ---------- */

const KANA = {};
for (const [kana, roms] of Object.entries(ROWS)) [...kana].forEach((k, i) => { KANA[roms[i]] ||= k; });
Object.assign(KANA, {
  si: 'し', ti: 'ち', tu: 'つ', hu: 'ふ', zi: 'じ', di: 'ぢ', du: 'づ', wo: 'を', o: 'お',
  la: 'ぁ', li: 'ぃ', lu: 'ぅ', le: 'ぇ', lo: 'ぉ', xa: 'ぁ', xi: 'ぃ', xu: 'ぅ', xe: 'ぇ', xo: 'ぉ',
  ltu: 'っ', xtu: 'っ', lya: 'ゃ', lyu: 'ゅ', lyo: 'ょ', xya: 'ゃ', xyu: 'ゅ', xyo: 'ょ', '-': 'ー',
});
// Two-letter starts that take a small ゃゅょ: kya → きゃ, sha → しゃ, ja → じゃ.
const YOON = { ky: 'き', gy: 'ぎ', sh: 'し', sy: 'し', j: 'じ', zy: 'じ', jy: 'じ', ch: 'ち', ty: 'ち', cy: 'ち', dy: 'ぢ', ny: 'に', hy: 'ひ', by: 'び', py: 'ぴ', my: 'み', ry: 'り' };
const Y_SMALL = { a: 'ゃ', u: 'ゅ', o: 'ょ' };
for (const [start, k] of Object.entries(YOON)) {
  for (const [v, small] of Object.entries(Y_SMALL)) KANA[start + v] ||= k + small;
}
Object.assign(KANA, { shi: 'し', chi: 'ち', tsu: 'つ', ji: 'じ', fu: 'ふ', she: 'しぇ', che: 'ちぇ', je: 'じぇ' });

// Converts as the learner types. A lone trailing "n" stays as "n" until `done`,
// so "kon" can still become "konnichiha".
export function toKana(text, { done = false } = {}) {
  const s = text.toLowerCase();
  let out = '';
  let i = 0;
  while (i < s.length) {
    const c = s[i];
    if (!/[a-z\-']/.test(c)) { out += c; i++; continue; }
    if (c === "'") { i++; continue; }
    // A doubled consonant is a small っ: "kitte" → きって.
    if (/[bcdfghjkmpqrstvwxyz]/.test(c) && s[i + 1] === c && c !== 'n') { out += 'っ'; i++; continue; }
    if (c === 'n') {
      const next = s[i + 1];
      // "nn" before a vowel is ん + な-row ("konnichiha"); otherwise it's just ん ("honn").
      if (next === 'n') {
        out += 'ん';
        i += /[aiueoy]/.test(s[i + 2] || '') ? 1 : 2;
        continue;
      }
      if (next === undefined) { out += done ? 'ん' : 'n'; i++; continue; }
      if (!/[aiueoy]/.test(next)) { out += 'ん'; i++; continue; }
    }
    let hit = null;
    for (let len = 3; len >= 1 && !hit; len--) {
      const piece = s.slice(i, i + len);
      if (piece.length === len && KANA[piece]) hit = [KANA[piece], len];
    }
    if (hit) { out += hit[0]; i += hit[1]; } else { out += s.slice(i); break; }
  }
  return out;
}

// Near misses: a missing dakuten, a big ゃ for a small one, a dropped long vowel or っ.
const SMALL_KANA = { ぁ: 'あ', ぃ: 'い', ぅ: 'う', ぇ: 'え', ぉ: 'お', ゃ: 'や', ゅ: 'ゆ', ょ: 'よ', っ: '' };
const loose = (s) => s.normalize('NFD').replace(/[\u3099\u309A]/g, '').normalize('NFC')
  .replace(/[ぁぃぅぇぉゃゅょっ]/g, (c) => SMALL_KANA[c]).replace(/[ーうい]/g, '');

// 'right', 'close' or 'wrong' for a typed reading against every accepted reading.
export function judgeReading(typed, answers) {
  const t = toHiragana(typed.trim());
  if (!t) return 'wrong';
  if (answers.includes(t)) return 'right';
  return answers.some((a) => loose(a) === loose(t)) ? 'close' : 'wrong';
}
