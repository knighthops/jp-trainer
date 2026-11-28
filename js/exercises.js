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
// Words that mean the same thing in English count as one (お手洗い "restroom" and トイレ "toilet").
const SYNONYM = { toilet: 'restroom', bathroom: 'restroom', lavatory: 'restroom', movie: 'film', fall: 'autumn', shop: 'store', large: 'big', little: 'small', begin: 'start', finish: 'end', tasty: 'delicious', pupil: 'student', mum: 'mother', dad: 'father', photo: 'photograph', picture: 'photograph' };
const contentWords = (m) => String(m).toLowerCase().replace(/\([^)]*\)/g, ' ').split(/[^a-z]+/).filter((w) => w.length > 2 && !STOP.has(w) && w !== 'to').map((w) => SYNONYM[w] || w);
export const sameMeaning = (a, b) => {
  const set = new Set(contentWords(b));
  return a === b || contentWords(a).some((w) => set.has(w));
};
const kindOf = (v) => (/^to /.test(v.m) ? 'verb' : /[一-龯]い$/.test(v.w) ? 'adj' : 'noun');

// Three wrong options that look like the right one: the same kind of word, sharing a kanji
// if possible, then words from the course, then any.
// `only` (word → bool) keeps wrong options to words you've been taught, even if that leaves
// fewer than three: every choice now shows its kana, so an untaught one would be on screen.
export function similarWords(v, vocab, { known = new Set(), rng = Math.random, only = null, dir = 'en' } = {}) {
  const all = vocab.filter((x) => x !== v && x.w !== v.w && !sameMeaning(x.m, v.m));
  const taught = only ? all.filter((x) => only(x.w)) : all;
  const pool = taught;
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
  const list = shuffled([v, ...similarWords(v, vocab, { ...opts, dir })], rng);
  return { dir, word: v, options: list.map((x) => (dir === 'jp' ? x.w : x.m)), answer: list.indexOf(v), items: list };
}

// A choice led by its kana, with its meaning under it. The meaning is cut to its first sense.
export const kanaOption = (y, m) => `<span class="jp">${y}</span><small>${String(m).split(/[;；]/)[0].trim()}</small>`;

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

// Form gym (Casual): a verb in its dictionary form and a target form; you build the answer
// from kana tiles. Spares are the sounds forms mix up (っ for ん, い for っ, で for て).
const FORM_SPARES = ['っ', 'ん', 'い', 'で', 'て', 'た', 'だ', 'き', 'り', 'み'];
export function formPuzzle(f, glossary = {}, rng = Math.random) {
  // The part that stays the same as the dictionary form (たべ in たべて) is given; you build the ending.
  const all = kanaTiles(f.y);
  const dict = glossary[f.d]?.y ? kanaTiles(glossary[f.d].y) : [];
  let same = 0;
  while (same < all.length - 1 && same < dict.length - 1 && all[same] === dict[same]) same++;
  const given = all.slice(0, same);
  const tiles = all.slice(same);
  const spares = shuffled(FORM_SPARES.filter((t) => !tiles.includes(t)), rng).slice(0, 3);
  const pool = shuffled([...tiles.map((t, i) => ({ t, i })), ...spares.map((t, k) => ({ t, i: tiles.length + k, spare: true }))], rng);
  const g = glossary[f.d];
  const m = g?.m || '';
  return {
    word: { w: f.a, y: f.y, m },
    tiles,
    given,
    pool,
    tag: `Form gym · ${f.f}`,
    prompt: `<p class="qz-big jp">${f.d}</p><p class="small muted center">${g && g.y !== f.d ? `<span class="jp">${g.y}</span> · ` : ''}${m}</p>
      <p class="form-target">→ <b>${f.f}</b></p>`,
    lines: [`<span class="small">${f.why}</span>`],
  };
}

// Words worth spelling: written with kanji, with a reading short enough for tiles.
export const spellable = (v) => KANJI.test(v.w) && v.w !== v.y && kanaTiles(v.y).length <= 6;

/* ---------- Renderers ---------- */

const optRow = (options, cls) => options.map((o, n) => `<button class="opt ${cls}" data-n="${n}">${o}</button>`).join('');

// regrade: a right pick also offers Forgot and Shaky; onDone gets the grade picked, or null.
export function renderWordQ(root, q, { tag, review = false, regrade = false, onDone }) {
  const v = q.word;
  // Word → meaning leads with kana, unless the word is itself kana: then its kana would give it away.
  const kana = q.dir === 'en' && q.items && v.w !== v.y;
  const prompt = q.dir === 'jp' ? `<p class="qz-q">Which word means</p><p class="qz-mean">${v.m}</p>`
    : q.dir === 'hear' ? `<p class="qz-q">Tap to listen. What does it mean?</p><div class="hear">${sayBtn(v.y)}</div>`
      : `<p class="qz-q">${kana ? 'Which is this word?' : 'What does this word mean?'}</p><p class="qz-big jp">${v.w}</p>`;
  const long = !kana && q.options.some((o) => o.length > 14);
  root.innerHTML = `<div class="qz">
      <span class="qz-tag">${tag}</span>
      ${prompt}
    </div>
    <div class="reach">
      <div class="opts qz-opts ${long ? 'long' : ''}" id="opts">${kana
    ? q.items.map((x, n) => `<button class="opt kana" data-n="${n}">${kanaOption(x.y, x.m)}</button>`).join('')
    : optRow(q.options, q.dir === 'jp' ? 'qk jp' : 'qm')}</div>
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
    // A wrong pick is shown for what it really is, so the mix-up teaches something too.
    const x = right ? null : q.items?.[picked];
    const was = x && (q.dir === 'jp'
      ? { text: `<span class="jp">${x.w}</span>`, note: `${x.w !== x.y ? `<span class="jp">${x.y}</span> · ` : ''}${x.m}` }
      : { text: x.m, note: `That's <span class="jp">${x.w}</span>${x.w !== x.y ? ` <span class="jp">${x.y}</span>` : ''}` });
    showSheet(root, {
      right,
      headline: right ? 'Correct' : 'Not quite',
      picked: was || (right ? null : { text: q.options[picked] }),
      answer: q.dir === 'jp' ? `<span class="jp">${v.w}</span>` : v.m,
      glyph: KANJI.test(v.w) && v.w.length <= 2 ? v.w : '',
      title: `<span class="jp">${v.w}</span> ${v.w !== v.y ? `<span class="jp muted">${v.y}</span>` : ''}`,
      lines: [`<span class="small muted">${romaji(v.y)} · ${v.m}</span> ${sayBtn(v.y)}`],
      regrade: regrade && !review,
    }, (grade) => onDone(clean, grade));
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
  const tries = [];
  // A Form gym puzzle brings its own tag, prompt and closing line.
  root.innerHTML = `<div class="qz">
      <span class="qz-tag">${p.tag || 'Spell the reading'}</span>
      ${p.prompt || `<p class="qz-big jp">${v.w}</p>
      <p class="small muted center">${v.m}</p>`}
      <div class="answer spell" id="ans">${(p.given || []).map((t) => `<span class="block kana placed given"><span class="jp">${t}</span></span>`).join('')}${'<i class="slot"></i>'.repeat(p.tiles.length)}</div>
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
      tries.push({ text: `<span class="jp">${b.t}</span>`, note: b.spare ? 'Not in this word' : 'Right sound, wrong place' });
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
        headline: clean ? (p.tag ? 'Built it' : 'Spelled it') : 'Got there',
        picked: tries,
        title: `<span class="jp">${v.w}</span> <span class="jp muted">${v.y}</span>`,
        lines: p.lines || [`<span class="small muted">${romaji(v.y)} · ${v.m}</span> ${sayBtn(v.y)}`],
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
  // Only the pairs you mixed up count as missed, not the whole set.
  const missed = new Set();
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
  }, () => onDone(clean, [...missed].map((i) => pairs[i])));
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
    missed.add(Number(pick.dataset.i));
    missed.add(Number(b.dataset.i));
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

/* ---------- Building kanji and words from pieces ---------- */

// A kanji's own parts, without itself (八 is just 八, so it can't be built).
const ownParts = (k) => (k.parts || []).filter((p, i, a) => p.c !== k.k && a.findIndex((x) => x.c === p.c) === i);
export const buildable = (k) => ownParts(k).length >= 2;

// Build a kanji from its parts: its parts and two spare parts from kanji you've met, so every
// tile is one you've seen. A spare never shares a label with a real part (two "Person" tiles
// would read as the same thing). Null when there aren't two spares.
export function partsPuzzle(k, metKanji, rng = Math.random) {
  const parts = ownParts(k);
  if (parts.length < 2) return null;
  const mine = new Set(parts.map((p) => p.c));
  const labels = new Set(parts.map((p) => p.label.toLowerCase()));
  const spares = [];
  for (const other of shuffled(metKanji.filter((x) => x.k !== k.k), rng)) {
    for (const p of ownParts(other)) {
      if (spares.length >= 2) break;
      if (mine.has(p.c) || labels.has(p.label.toLowerCase()) || spares.some((s) => s.c === p.c || s.label === p.label)) continue;
      spares.push({ ...p, spare: true });
    }
    if (spares.length >= 2) break;
  }
  if (spares.length < 2) return null;
  return { kanji: k, parts, pool: shuffled([...parts, ...spares], rng) };
}

// Build a word from its kanji, in order: two or three spare kanji you've been taught, ones
// that look or sound like the word's kanji (a shared part or reading) first.
export const compoundable = (v) => /^[一-龯]{2,3}$/.test(v.w) && new Set(v.w).size === v.w.length;
export function compoundPuzzle(v, taughtKanji, rng = Math.random) {
  if (!compoundable(v)) return null;
  const chars = [...v.w];
  const inWord = taughtKanji.filter((k) => chars.includes(k.k));
  const partsOf = (k) => new Set((k.parts || []).map((p) => p.c));
  const near = (x) => inWord.reduce((n, k) => n + [...partsOf(x)].filter((p) => partsOf(k).has(p)).length
    + ((x.on || []).some((r) => (k.on || []).includes(r)) ? 1 : 0), 0);
  const spares = shuffled(taughtKanji.filter((k) => !chars.includes(k.k)), rng)
    .sort((a, b) => near(b) - near(a)).slice(0, chars.length === 2 ? 3 : 2);
  if (spares.length < 2) return null;
  const info = (c) => taughtKanji.find((k) => k.k === c);
  return {
    word: v, chars,
    pool: shuffled([...chars.map((c) => ({ c, m: info(c)?.mean[0] || '' })), ...spares.map((k) => ({ c: k.k, m: k.mean[0], spare: true }))], rng),
  };
}

// Tap the parts a kanji is made of, in any order. Its meaning is the clue.
export function renderPartsBuild(root, p, { review = false, onDone }) {
  const k = p.kanji;
  const found = [];
  let clean = true;
  const tries = [];
  root.innerHTML = `<div class="qz">
      <span class="qz-tag">Build the kanji</span>
      <p class="qz-q">Which parts make the kanji for</p>
      <p class="qz-mean">${k.mean.slice(0, 2).join(', ')}</p>
      <div class="answer kbuild" id="ans">${'<i class="slot"></i>'.repeat(p.parts.length)}</div>
    </div>
    <div class="reach">
      <div class="fb" id="fb" role="status"></div>
      <div class="pool" id="pool">${p.pool.map((x, n) => `<button class="block ptile" data-n="${n}"><b class="jp">${x.c}</b><small>${x.label}</small></button>`).join('')}</div>
    </div>`;
  const fb = root.querySelector('#fb');
  const pool = root.querySelector('#pool');
  const done = () => {
    root.querySelector('#ans').outerHTML = `<div class="kbuilt jp">${k.k}</div>`;
    pool.querySelectorAll('.block').forEach((x) => x.classList.add('used'));
    showSheet(root, {
      right: clean,
      headline: clean ? 'Built it' : 'Got there',
      picked: tries,
      title: `<span class="jp">${k.k}</span> <span class="small muted">${k.mean.slice(0, 2).join(', ')}</span>`,
      lines: p.parts.map((x) => `<span class="jp">${x.c}</span> <strong>${x.label}</strong> <span class="small muted">${x.mn}</span>`),
    }, () => onDone(clean));
  };
  pool.onclick = (e) => {
    const el = e.target.closest('.block');
    if (!el || el.classList.contains('used')) return;
    const x = p.pool[Number(el.dataset.n)];
    if (x.spare) {
      tries.push({ text: `<span class="jp">${x.c}</span> ${x.label}`, note: 'Not one of its parts' });
      clean = false;
      fb.className = 'fb bad';
      fb.textContent = `${x.c} (${x.label}) isn't in this kanji.`;
      el.classList.add('used', 'gone');
      return;
    }
    found.push(x);
    el.classList.add('used');
    const slot = root.querySelector('#ans .slot');
    slot.insertAdjacentHTML('beforebegin', `<span class="block ptile placed"><b class="jp">${x.c}</b><small>${x.label}</small></span>`);
    slot.remove();
    fb.className = 'fb';
    fb.textContent = '';
    if (found.length === p.parts.length) done();
  };
  if (review) p.pool.forEach((x, n) => { if (!x.spare) pool.querySelector(`[data-n="${n}"]`).click(); });
}

// Tap a word's kanji in order. Its meaning is the clue; the tiles show no meanings, so you
// know the kanji by sight. Each placed one shows its meaning, and the reading shows once built.
export function renderCompound(root, p, { review = false, onDone }) {
  const v = p.word;
  const placed = [];
  let clean = true;
  const tries = [];
  root.innerHTML = `<div class="qz">
      <span class="qz-tag">Build the word</span>
      <p class="qz-q">Put the kanji together for</p>
      <p class="qz-mean">${v.m}</p>
      <div class="answer kbuild" id="ans">${'<i class="slot"></i>'.repeat(p.chars.length)}</div>
    </div>
    <div class="reach">
      <div class="fb" id="fb" role="status"></div>
      <div class="pool" id="pool">${p.pool.map((x, n) => `<button class="block ctile" data-n="${n}"><b class="jp">${x.c}</b></button>`).join('')}</div>
    </div>`;
  const fb = root.querySelector('#fb');
  const pool = root.querySelector('#pool');
  pool.onclick = (e) => {
    const el = e.target.closest('.block');
    if (!el || el.classList.contains('used')) return;
    const x = p.pool[Number(el.dataset.n)];
    if (x.c !== p.chars[placed.length]) {
      clean = false;
      fb.className = 'fb bad';
      if (x.spare) {
        tries.push({ text: `<span class="jp">${x.c}</span>`, note: `means “${x.m}”, not in this word` });
        fb.textContent = `${x.c} means “${x.m}”. It isn't in this word.`;
        el.classList.add('used', 'gone');
      } else {
        fb.textContent = `${x.c} is in this word, but not here yet.`;
        el.classList.remove('shake');
        void el.offsetWidth;
        el.classList.add('shake');
      }
      return;
    }
    placed.push(x.c);
    el.classList.add('used');
    const slot = root.querySelector('#ans .slot');
    slot.insertAdjacentHTML('beforebegin', `<span class="block ctile placed"><b class="jp">${x.c}</b><small>${x.m}</small></span>`);
    slot.remove();
    fb.className = 'fb';
    fb.textContent = '';
    if (placed.length === p.chars.length) {
      pool.querySelectorAll('.block').forEach((b) => b.classList.add('used'));
      showSheet(root, {
        right: clean,
        headline: clean ? 'Built it' : 'Got there',
        picked: tries,
        title: `<span class="jp">${v.w}</span> <span class="jp muted">${v.y}</span>`,
        lines: [`<span class="small muted">${romaji(v.y)} · ${v.m}</span> ${sayBtn(v.y)}`],
      }, () => onDone(clean));
    }
  };
  if (review) for (const c of p.chars) pool.querySelector(`[data-n="${p.pool.findIndex((x) => x.c === c && !x.spare)}"]`).click();
}
