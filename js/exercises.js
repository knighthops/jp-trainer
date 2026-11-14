// Lesson exercises that make you produce, not just recognise: a word's meaning both ways,
// a word heard (on a tap), its reading spelled from kana tiles, and match-the-pairs.
// The builders at the top are pure and tested; the renderers draw one exercise and call
// onDone(clean) when it's finished, or onDone(null) when it was skipped.
import { shuffled, showSheet } from './drills.js';
import { sayBtn } from './tts.js';
import { romaji } from './romaji.js';

const KANJI = /[一-龯々]/;

// Two meanings that share a content word ("half" and "half past", "student" and "school
// student") are both right, so one is never a wrong option for the other.
const STOP = new Set(['the', 'and', 'for', 'one', 'thing', 'things', 'something', 'someone', 'very', 'with', 'from', 'that', 'this']);
const contentWords = (m) => String(m).toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w) && w !== 'to');
export const sameMeaning = (a, b) => {
  const set = new Set(contentWords(b));
  return a === b || contentWords(a).some((w) => set.has(w));
};
const kindOf = (v) => (/^to /.test(v.m) ? 'verb' : /[一-龯]い$/.test(v.w) ? 'adj' : 'noun');

// Three wrong options that look like the right one: the same kind of word, sharing a kanji
// if possible, then words from the course, then any.
export function similarWords(v, vocab, { known = new Set(), rng = Math.random } = {}) {
  const pool = vocab.filter((x) => x !== v && x.w !== v.w && !sameMeaning(x.m, v.m));
  const same = pool.filter((x) => kindOf(x) === kindOf(v));
  const kanji = [...v.w].filter((c) => KANJI.test(c));
  const rank = (x) => (kanji.some((c) => x.w.includes(c)) ? 0 : known.has(x.w) ? 1 : 2);
  const ranked = shuffled(same.length >= 3 ? same : pool, rng).sort((a, b) => rank(a) - rank(b));
  const out = [];
  for (const x of ranked) {
    if (out.length === 3) break;
    if (!out.some((o) => sameMeaning(o.m, x.m) || o.w === x.w)) out.push(x);
  }
  return out;
}

// dir: 'en' shows the Japanese and asks the meaning; 'jp' shows the meaning and asks the word;
// 'hear' plays the word (on a tap) and asks the meaning.
export function wordQuestion(v, vocab, dir, opts = {}) {
  const rng = opts.rng || Math.random;
  const list = shuffled([v, ...similarWords(v, vocab, opts)], rng);
  return { dir, word: v, options: list.map((x) => (dir === 'jp' ? x.w : x.m)), answer: list.indexOf(v) };
}

// Small kana and the long-vowel mark ride with the kana before them, so tiles are sounds.
export function kanaTiles(reading) {
  const out = [];
  for (const c of reading) {
    if (/[ゃゅょぁぃぅぇぉャュョァィゥェォー]/.test(c) && out.length) out[out.length - 1] += c;
    else out.push(c);
  }
  return out;
}

// Look-alike sounds for the spare tiles: the same kana with or without its dakuten, or a near neighbour.
const NEAR = { か: 'が', が: 'か', き: 'ぎ', ぎ: 'き', く: 'ぐ', ぐ: 'く', け: 'げ', げ: 'け', こ: 'ご', ご: 'こ', さ: 'ざ', ざ: 'さ', し: 'じ', じ: 'し',
  す: 'ず', ず: 'す', せ: 'ぜ', そ: 'ぞ', た: 'だ', だ: 'た', ち: 'ぢ', つ: 'っ', っ: 'つ', て: 'で', で: 'て', と: 'ど', ど: 'と', は: 'ば', ば: 'は',
  ひ: 'び', び: 'ひ', ふ: 'ぶ', ぶ: 'ふ', へ: 'べ', べ: 'へ', ほ: 'ぼ', ぼ: 'ほ', う: 'お', お: 'う', い: 'え', え: 'い', ん: 'の', る: 'ろ', ろ: 'る',
  め: 'ぬ', ぬ: 'め', わ: 'ね', ね: 'わ', あ: 'お' };
export function spellPuzzle(v, rng = Math.random) {
  const tiles = kanaTiles(v.y);
  const spares = [];
  for (const t of shuffled(tiles, rng)) {
    const alt = NEAR[t[0]] ? NEAR[t[0]] + t.slice(1) : null;
    if (alt && !tiles.includes(alt) && !spares.includes(alt)) spares.push(alt);
    if (spares.length === 2) break;
  }
  const pool = shuffled([...tiles.map((t, i) => ({ t, i })), ...spares.map((t, k) => ({ t, i: tiles.length + k, spare: true }))], rng);
  return { word: v, tiles, pool };
}

// Words worth spelling: written with kanji, with a reading short enough for tiles.
export const spellable = (v) => KANJI.test(v.w) && v.w !== v.y && kanaTiles(v.y).length <= 6;

/* ---------- Renderers ---------- */

const optRow = (options, cls) => options.map((o, n) => `<button class="opt ${cls}" data-n="${n}">${o}</button>`).join('');

export function renderWordQ(root, q, { tag, review = false, onDone }) {
  const v = q.word;
  const prompt = q.dir === 'jp' ? `<p class="qz-q">Which word means</p><p class="qz-mean">${v.m}</p>`
    : q.dir === 'hear' ? `<p class="qz-q">Tap to listen. What does it mean?</p><div class="hear">${sayBtn(v.y)}</div>`
      : `<p class="qz-q">What does this word mean?</p><p class="qz-big jp">${v.w}</p>`;
  const long = q.options.some((o) => o.length > 14);
  root.innerHTML = `<div class="qz">
      <span class="qz-tag">${tag}</span>
      ${prompt}
    </div>
    <div class="reach">
      <div class="opts qz-opts ${long ? 'long' : ''}" id="opts">${optRow(q.options, q.dir === 'jp' ? 'qk jp' : 'qm')}</div>
      ${q.dir === 'hear' && !review ? '<button class="hero-link" id="skip" type="button">Can\'t listen now</button>' : ''}
    </div>`;
  const opts = root.querySelector('#opts');
  let clean = true;
  const settle = (picked) => {
    const right = picked === q.answer;
    if (!right) clean = false;
    opts.querySelectorAll('.opt').forEach((b, n) => {
      b.disabled = true;
      if (n === q.answer) b.classList.add('right');
      else if (n === picked) b.classList.add('wrong');
      else b.classList.add('dim');
    });
    root.querySelector('#skip')?.remove();
    showSheet(root, {
      right,
      headline: right ? 'Correct' : q.dir === 'jp' ? `It's ${v.w}` : `It means ${v.m}`,
      glyph: KANJI.test(v.w) && v.w.length <= 2 ? v.w : '',
      title: `<span class="jp">${v.w}</span> ${v.w !== v.y ? `<span class="jp muted">${v.y}</span>` : ''}`,
      lines: [`<span class="small muted">${romaji(v.y)} · ${v.m}</span> ${sayBtn(v.y)}`],
    }, () => onDone(clean));
  };
  opts.onclick = (e) => {
    const b = e.target.closest('[data-n]');
    if (b && !b.disabled) settle(Number(b.dataset.n));
  };
  root.querySelector('#skip')?.addEventListener('click', () => onDone(null));
  if (review) settle(q.answer);
}

export function renderSpell(root, p, { review = false, onDone }) {
  const v = p.word;
  const placed = [];
  let clean = true;
  root.innerHTML = `<div class="qz">
      <span class="qz-tag">Spell the reading</span>
      <p class="qz-big jp">${v.w}</p>
      <p class="small muted center">${v.m}</p>
      <div class="answer spell" id="ans">${'<i class="slot"></i>'.repeat(p.tiles.length)}</div>
    </div>
    <div class="reach">
      <div class="fb" id="fb" role="status"></div>
      <div class="pool" id="pool">${p.pool.map((b) => `<button class="block kana" data-i="${b.i}"><span class="jp">${b.t}</span></button>`).join('')}</div>
    </div>`;
  const fb = root.querySelector('#fb');
  const pool = root.querySelector('#pool');
  pool.onclick = (e) => {
    const el = e.target.closest('.block');
    if (!el || el.classList.contains('used')) return;
    const b = p.pool.find((x) => x.i === Number(el.dataset.i));
    if (b.t !== p.tiles[placed.length]) {
      clean = false;
      fb.className = 'fb bad';
      fb.textContent = b.spare ? `${b.t} isn't in this word.` : 'Not that sound yet. Say the word to yourself, one sound at a time.';
      if (b.spare) el.classList.add('used', 'gone');
      else {
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }
      return;
    }
    placed.push(b.t);
    el.classList.add('used');
    const slot = root.querySelector('#ans .slot');
    slot.insertAdjacentHTML('beforebegin', `<span class="block kana placed"><span class="jp">${b.t}</span></span>`);
    slot.remove();
    fb.className = 'fb';
    fb.textContent = '';
    if (placed.length === p.tiles.length) {
      pool.querySelectorAll('.block').forEach((x) => x.classList.add('used'));
      showSheet(root, {
        right: clean,
        headline: clean ? 'Spelled it' : 'Got there',
        title: `<span class="jp">${v.w}</span> <span class="jp muted">${v.y}</span>`,
        lines: [`<span class="small muted">${romaji(v.y)} · ${v.m}</span> ${sayBtn(v.y)}`],
      }, () => onDone(clean));
    }
  };
  if (review) {
    for (const t of p.tiles) {
      const b = p.pool.find((x) => x.t === t && !pool.querySelector(`[data-i="${x.i}"]`).classList.contains('used'));
      pool.querySelector(`[data-i="${b.i}"]`).click();
    }
  }
}

// pairs: [{ jp, en }]. Tap one side, then its partner on the other.
export function renderMatch(root, pairs, { rng = Math.random, review = false, onDone }) {
  const left = shuffled(pairs.map((p, i) => ({ t: p.jp, i })), rng);
  const right = shuffled(pairs.map((p, i) => ({ t: p.en, i })), rng);
  let pick = null;
  let clean = true;
  let matched = 0;
  root.innerHTML = `<div class="qz">
      <span class="qz-tag">Match the pairs</span>
      <p class="qz-q">Tap a word, then what it means</p>
    </div>
    <div class="match" id="match">
      <div class="mcol">${left.map((x) => `<button class="mt jp" data-side="l" data-i="${x.i}">${x.t}</button>`).join('')}</div>
      <div class="mcol">${right.map((x) => `<button class="mt" data-side="r" data-i="${x.i}">${x.t}</button>`).join('')}</div>
    </div>`;
  const box = root.querySelector('#match');
  const finish = () => showSheet(root, {
    right: clean,
    headline: clean ? 'All matched' : 'Got there',
    lines: pairs.map((p) => `<span class="jp">${p.jp}</span> <span class="small muted">· ${p.en}</span>`),
  }, () => onDone(clean));
  box.onclick = (e) => {
    const b = e.target.closest('.mt');
    if (!b || b.disabled) return;
    if (!pick || pick.dataset.side === b.dataset.side) {
      pick?.classList.remove('sel');
      pick = b;
      b.classList.add('sel');
      return;
    }
    if (pick.dataset.i === b.dataset.i) {
      for (const x of [pick, b]) { x.classList.remove('sel'); x.classList.add('right'); x.disabled = true; }
      pick = null;
      matched++;
      if (matched === pairs.length) finish();
      return;
    }
    clean = false;
    const was = pick;
    pick = null;
    was.classList.remove('sel');
    for (const x of [was, b]) {
      x.classList.remove('shake');
      void x.offsetWidth;
      x.classList.add('shake', 'wrong');
      setTimeout(() => x.classList.remove('wrong'), 450);
    }
  };
  if (review) {
    box.querySelectorAll('.mt').forEach((x) => { x.disabled = true; x.classList.add('right'); });
    finish();
  }
}
