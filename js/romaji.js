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

const toHiragana = (s) => s.replace(/[ァ-ヶ]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0x60));

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
