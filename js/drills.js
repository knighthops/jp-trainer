// Tap-to-assemble and particle drills. The logic functions are pure; the
// render functions build UI inside the element they are given.
import { icons } from './icons.js';
import { sayBtn, speakLines } from './tts.js';
import { romaji as kanaToRomaji } from './romaji.js';
import { matchReading } from './readings.js';

/* ---------- Kanji breakdowns, wherever a word shows up ---------- */

let kanjiIndex = new Map();
// Every kanji with a breakdown: the N5 set and the rest of the app's words.
export const setKanji = (list) => { kanjiIndex = new Map(list.map((k) => [k.k, k])); partIndex = null; };
export const kanjiOf = (c) => kanjiIndex.get(c);
// The kanji in a word, in order, once each.
export const kanjiIn = (word) => [...new Set([...String(word)])].map((c) => kanjiIndex.get(c)).filter(Boolean);

/* Your own notes, by kanji. They sit above the breakdown and never replace it. */
let notes = {};
export const setNotes = (n) => { notes = n; };
export const noteOf = (c) => notes[c] || '';
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
export const NOTE_MAX = 300;

// What goes in a kanji's note slot: the note (tap to edit), or a quiet link to add one.
export function noteSlotInner(c, edit = true) {
  const n = noteOf(c);
  if (!edit) return n ? `<p class="knote">${esc(n)}</p>` : '';
  return n
    ? `<button class="knote" data-note="${c}" aria-label="Edit your note for ${c}">${esc(n)}</button>`
    : `<button class="knote-add" data-note="${c}">+ Add your note</button>`;
}
const noteSlot = (c, edit) => `<div class="knote-slot" data-k="${c}"${edit ? '' : ' data-ro'}>${noteSlotInner(c, edit)}</div>`;

// The editor that replaces a slot while you write. An empty note is removed on save.
export const noteEditorHtml = (c) => `<div class="knote-edit">
    <textarea maxlength="${NOTE_MAX}" rows="2" placeholder="Your own way to remember ${c}" aria-label="Your note for ${c}">${esc(noteOf(c))}</textarea>
    <div class="knote-btns"><button data-note-cancel>Cancel</button><button class="save" data-note-save>Save</button></div>
  </div>`;

// The line that ties the parts together. A kanji that is its own picture has it on its one part.
export const storyOf = (k) => k.story || k.parts.at(-1).mn;

/* ---------- Tap a kanji in a story or sound family to see what it is ---------- */

// Parts that aren't kanji in the app (甬, 尃, 亲) still have a name and a picture.
let partIndex = null;
function partOf(c) {
  if (!partIndex) {
    partIndex = new Map();
    for (const k of kanjiIndex.values()) for (const p of k.parts) if (p.c !== k.k && !partIndex.has(p.c)) partIndex.set(p.c, p);
  }
  return partIndex.get(c);
}

// Kanji whose sound comes from c, for a sound part that isn't shown as a part (亲 in 新 and 親).
const soundUsers = (c) => [...kanjiIndex.values()].filter((k) => k.sound?.c === c);
const known = (c) => kanjiIndex.has(c) || !!partOf(c) || soundUsers(c).length > 0;
// A kanji you can tap, unless it's the one being explained or there's nothing to show.
const kref = (c, self) => (c !== self && known(c)
  ? `<button class="kref jp" data-kref="${c}" aria-label="What is ${c}?">${c}</button>` : `<b class="jp">${c}</b>`);
// Every kanji in a line of text, made tappable.
export const linkKanji = (text, self) => String(text).replace(/[一-龯々]/g, (c) => (c !== self && known(c) ? kref(c, self) : c));

// The small card a tapped kanji opens: meaning, readings and its story; for a part, its name and picture.
export function peekHtml(c) {
  const k = kanjiIndex.get(c);
  const reads = k ? [...k.on.slice(0, 2), ...k.kun.slice(0, 2).map((r) => r.replace(/-/g, ''))] : [];
  if (k) {
    return `<div class="kpeek" data-peek="${c}"><span class="kp-g jp">${c}</span><div>
      <strong>${k.mean.join(', ')}</strong>${reads.length ? ` <span class="jp kp-r">${reads.join('・')}</span>` : ''}
      <div class="small">${storyOf(k)}</div></div></div>`;
  }
  const p = partOf(c);
  if (!p) {
    const users = soundUsers(c);
    return `<div class="kpeek" data-peek="${c}"><span class="kp-g jp">${c}</span><div>
      <strong>Sound part</strong> <span class="jp kp-r">${users[0].sound.on}</span>
      <div class="small">An old part that gives <span class="jp">${users.map((k) => k.k).join(' ')}</span> the reading <span class="jp">${users[0].sound.on}</span>.</div></div></div>`;
  }
  const users = [...kanjiIndex.values()].filter((x) => x.parts.some((q) => q.c === c && x.k !== c)).slice(0, 6).map((x) => x.k);
  return `<div class="kpeek" data-peek="${c}"><span class="kp-g jp">${c}</span><div>
    <strong>${p.label}</strong> <span class="small muted">a part</span>
    <div class="small">${p.mn}${users.length ? ` Found in <span class="jp">${users.join(' ')}</span>.` : ''}</div></div></div>`;
}

// Opens the card just under the line that was tapped; tapping the same kanji again closes it.
export function togglePeek(btn) {
  const host = btn.closest('.part, .kstory, .kmeta, .gk-one > p, .kpeek-host') || btn.parentElement;
  const open = host.nextElementSibling?.classList.contains('kpeek') ? host.nextElementSibling : null;
  const same = open?.dataset.peek === btn.dataset.kref;
  open?.remove();
  if (!same) host.insertAdjacentHTML('afterend', peekHtml(btn.dataset.kref));
}

// Kanji that share a sound part tend to share a reading: 青 セイ gives 晴, 清, 精 and 静 theirs.
export function soundLine(k) {
  const s = k.sound;
  if (!s) return '';
  const jp = (list) => list.map((c) => kref(c, k.k)).join(' ');
  const others = s.kin.filter((c) => c !== s.c);
  if (k.k === s.c) return `Sound family: <b class="jp">${s.c}</b> lends <span class="jp">${s.on}</span> to ${jp(s.kin)}`;
  return `Sound family: sounds like ${kref(s.c, k.k)}, <span class="jp">${s.on}</span>${others.length ? `, as in ${jp(others)}` : ''}`;
}

// Whether the breakdown is how the kanji really came about, or just a way to remember it.
const originTag = (k) => (k.origin
  ? `<span class="ktag ${k.origin}">${k.origin === 'real' ? 'Real origin' : 'Memory trick'}</span>` : '');

// Your note, then each part with its name and picture, then the story, its origin and sound family.
// edit: false where the note must not be changed, like a hint shown before you answer.
export const partsHtml = (k, { edit = true } = {}) => noteSlot(k.k, edit) + k.parts.map((p) => `<div class="part">
    <span class="pg">${p.c}</span>
    <div><strong>${p.label}</strong><div class="small">${linkKanji(p.mn, k.k)}</div></div></div>`).join('')
  + (k.story ? `<p class="kstory">${linkKanji(k.story, k.k)}</p>` : '')
  + (k.origin || k.sound ? `<div class="kmeta">${originTag(k)}${k.sound ? `<span>${soundLine(k)}</span>` : ''}</div>` : '');

// Which reading of k this word uses, as a small On or Kun chip.
function readingChip(k, w, y) {
  const hit = y ? matchReading(k, { w }, y) : null;
  if (!hit) return '<span class="rt">Special reading</span>';
  return `<span class="rt ${hit.type}">${hit.type === 'on' ? 'On' : 'Kun'} · <span class="jp">${hit.reading}</span> ${kanaToRomaji(hit.reading)}</span>`;
}

// Each kanji of a word with its full breakdown: for word cards.
export function wordKanjiHtml(w, y) {
  const list = kanjiIn(w);
  if (!list.length) return '';
  return `<div class="block-sec wk"><span class="caps">${list.length > 1 ? `The ${list.length} kanji in this word` : 'The kanji in this word'}</span>
    ${list.map((k) => `<div class="wk-one">
      <div class="wk-head"><span class="wk-g jp">${k.k}</span><span class="grow"><strong>${k.mean.join(', ')}</strong><br>${readingChip(k, w, y)}</span></div>
      ${partsHtml(k)}</div>`).join('')}</div>`;
}

// A short breakdown under a tapped word: parts in a row, then the line that ties them together.
function glossKanji(word, y) {
  const list = kanjiIn(word);
  if (!list.length) return '';
  return `<div class="gk">${list.map((k) => `<div class="gk-one">
    <div class="gk-top"><b class="jp">${k.k}</b><span>${k.mean[0]}</span>${readingChip(k, word, y)}</div>
    ${noteSlot(k.k, false)}
    <div class="gk-parts">${k.parts.map((p) => `<span><b class="jp">${p.c}</b> ${p.label}</span>`).join('<i>+</i>')}</div>
    <p class="small">${linkKanji(storyOf(k), k.k)}</p></div>`).join('')}</div>`;
}

// Alone, these particles need respelling or speech reads は as "ha".
const PARTICLE_SAY = { は: 'わ', へ: 'え', を: 'お' };
export const spoken = (word, g) => PARTICLE_SAY[word] ?? g?.y ?? word;

const ROLE_NAMES = { topic: 'topic', subject: 'subject', object: 'object', verb: 'verb', particle: 'particle', other: 'other' };

const NEXT_HINT = {
  topic: 'Start with the topic: what the sentence is about.',
  subject: 'Next is the subject: who or what does the action.',
  object: 'Next is the object: what the verb acts on.',
  particle: 'The word you just placed needs its particle straight after it.',
  verb: 'The verb comes now, at the very end.',
  other: 'Next is a detail, such as a time, place, or description.',
};

export function shuffled(list, rng = Math.random) {
  const a = [...list];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
}

// Every accepted word order, as lists of block texts. Japanese word order is
// flexible, so a sentence can list natural alternatives in `alts`.
export function orders(sentence) {
  const texts = sentence.blocks.map((b) => b.t);
  return [texts, ...(sentence.alts || []).map((alt) => alt.map((i) => texts[i]))];
}

// The sheet that slides up after every answer, whatever the exercise: right or wrong, a
// headline, then what was asked with its reading and meaning, and one Continue.
// A drawn tick or cross for the sheet's badge and the answer marks.
export const MARK_SVG = {
  good: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M6 12.6l3.9 3.9L18 8.4"/></svg>',
  bad: '<svg viewBox="0 0 24 24" aria-hidden="true"><path d="M7.5 7.5l9 9"/><path d="M16.5 7.5l-9 9"/></svg>',
};

// A wrong answer side by side with the right one: what you picked (and what that really is),
// then the answer, made the loudest thing on the sheet. picked: one or a list of
// { text, note } (note: what the picked option actually means, or why it doesn't fit).
export function compareHtml(picked, answer) {
  // The same slip twice is shown once, and three at most keep the sheet short.
  const list = [].concat(picked || []).filter((p, i, a) => p && p.text && a.findIndex((x) => x?.text === p.text) === i).slice(0, 3);
  if (!list.length && !answer) return '';
  const row = (cls, label, text, note) => `<div class="cmp-row ${cls}"><span class="cmp-l">${label}</span>
    <span class="cmp-v"><span class="cmp-t">${text}</span>${note ? `<span class="cmp-n">${note}</span>` : ''}</span></div>`;
  return `<div class="cmp">${list.map((p) => row('was', p.label || (list.length > 1 ? 'Tried' : 'You picked'), p.text, p.note)).join('')}${
    answer ? row('is', 'Answer', answer) : ''}</div>`;
}

// The sheet that slides up after every answer, whatever the exercise: right or wrong, a
// headline, then what was asked with its reading and meaning, and one Continue.
// A wrong answer adds the comparison (picked, answer); a run of right answers adds a streak chip.
export function feedbackSheet({ right, headline, glyph = '', title = '', lines = [], picked = null, answer = '', streak = 0 }) {
  const body = glyph || title || lines.length
    ? `<div class="sh-body">${glyph ? `<span class="sh-k jp">${glyph}</span>` : ''}
      <span class="grow">${title ? `<strong>${title}</strong>` : ''}${lines.filter(Boolean).map((l) => `<span class="sh-line">${l}</span>`).join('')}</span></div>`
    : '';
  const chip = right && streak >= 3 ? `<span class="sh-streak" aria-label="${streak} right in a row">${streak} in a row</span>` : '';
  return `<div class="sheet ${right ? 'good' : 'bad'}" role="status">
    <div class="sh-head"><span class="sh-badge" aria-hidden="true">${right ? MARK_SVG.good : MARK_SVG.bad}</span><b>${headline}</b>${chip}</div>
    ${right ? '' : compareHtml(picked, answer)}${body}<button class="btn" id="cont">Continue</button></div>`;
}

// How many right in a row this answer makes, for the sheet's streak chip. The app says (0 when
// looking back at answers, or outside a run).
let streakOf = () => 0;
export const setStreak = (fn) => { streakOf = fn; };
// Continue sits where the answers were. A quick double tap would land its second tap on the
// next question's options, so real taps are ignored for a moment after Continue.
const LATE_MS = 300;
let quietUntil = 0;
const swallow = (e) => {
  if (e.isTrusted && Date.now() < quietUntil) { e.stopPropagation(); e.preventDefault(); }
};
if (typeof document !== 'undefined') for (const t of ['pointerdown', 'click']) document.addEventListener(t, swallow, true);
export function showSheet(root, opts, onContinue) {
  root.querySelector('.sheet')?.remove();
  // opts.html: a sheet of the step's own (the kanji quiz's); opts.review: an answer looked back at.
  const streak = opts.right ? streakOf(opts) : 0;
  root.insertAdjacentHTML('beforeend', opts.html || feedbackSheet({ ...opts, streak }));
  document.body.classList.add('has-sheet');
  const cont = root.querySelector('#cont');
  cont.onclick = () => {
    if (!cont.isConnected || cont.dataset.gone) return;
    cont.dataset.gone = '1';
    quietUntil = Date.now() + LATE_MS;
    document.body.classList.remove('has-sheet');
    onContinue();
  };
}

// Headline for a finished item: right first time, or got there after a wrong tap.
const doneHeadline = (clean) => (clean ? 'Correct' : 'Got there');

export function validNext(sentence, placed) {
  const next = new Set();
  for (const order of orders(sentence)) {
    if (placed.every((t, i) => order[i] === t) && order[placed.length]) next.add(order[placed.length]);
  }
  return next;
}

export function explainWrong(sentence, placed, tapped) {
  const next = validNext(sentence, placed);
  const expected = sentence.blocks.find((b) => next.has(b.t));
  const lead = tapped.r === 'verb' && expected?.r !== 'verb'
    ? `Save ${tapped.t} for last: Japanese verbs end the sentence. `
    : tapped.r === 'particle' && expected?.r !== 'particle'
      ? `${tapped.t} has to follow the word it marks, so that word comes first. `
      : '';
  return lead + (NEXT_HINT[expected?.r] || 'Try another block.');
}

// One or two spare particles join the tiles, so the last few can't be placed by elimination.
// Only particles already taught are used as spares (taught says which).
// は and が stand in for each other too easily to be fair as spares for one another, and
// に and へ both mark where you're going (日本 へ 行きます, 日本 に 行きます).
const SPARE = ['を', 'に', 'で', 'へ', 'と', 'も', 'が', 'は'];
const STANDS_IN = { が: 'は', は: 'が', に: 'へ', へ: 'に' };
export function decoysFor(sentence, rng = Math.random, taught = () => true) {
  const used = new Set(sentence.blocks.map((b) => b.t));
  const options = SPARE.filter((p) => taught(p) && !used.has(p) && !used.has(STANDS_IN[p]));
  const n = sentence.blocks.length >= 5 ? 2 : 1;
  return shuffled(options, rng).slice(0, n).map((t, k) => ({ t, r: 'particle', i: sentence.blocks.length + k, decoy: true }));
}

export function renderSentence(root, sentence, { hints, glossary = {}, review = false, taught, onDone }) {
  // Keep shuffling until the pool is not already a correct answer.
  const accepted = orders(sentence).map((o) => o.join('|'));
  let pool = shuffled([...sentence.blocks.map((b, i) => ({ ...b, i })), ...decoysFor(sentence, Math.random, taught)]);
  for (let n = 0; n < 8 && accepted.includes(pool.map((b) => b.t).join('|')); n++) pool = shuffled(pool);

  const placed = [];
  let clean = true;
  const tries = [];
  const blockHtml = (b, cls = '') => `<button class="block ${ROLE_NAMES[b.r]} ${cls}" data-i="${b.i}">
    <span>${b.t}</span>${b.y && (typeof hints === 'function' ? hints(b) : hints) ? `<small>${b.y}</small>` : ''}</button>`;

  root.innerHTML = `
    <div class="card">
      <span class="caps">Build the sentence</span>
      <p class="en">${sentence.en}</p>
      <div class="answer" id="ans" aria-live="polite">${'<i class="slot"></i>'.repeat(sentence.blocks.length)}</div>
    </div>
    <div class="reach">
      <div class="fb" id="fb" role="status"></div>
      <div class="pool" id="pool">${pool.map((b) => blockHtml(b)).join('')}</div>
      <div class="legend">
        <span class="topic"><i></i>topic</span><span class="subject"><i></i>subject</span>
        <span class="object"><i></i>object</span><span class="verb"><i></i>verb</span>
        <span class="particle"><i></i>particle</span><span><i></i>other</span>
      </div>
    </div>
    <div class="dock" id="after"></div>`;
  const fb = root.querySelector('#fb');

  root.querySelector('#pool').onclick = (e) => {
    const el = e.target.closest('.block');
    if (!el || el.classList.contains('used')) return;
    const block = pool.find((b) => b.i === Number(el.dataset.i));
    if (block.decoy) {
      // A spare tile that belongs nowhere: it says so and leaves the pool.
      clean = false;
      fb.className = 'fb bad';
      tries.push({ text: `<span class="jp">${block.t}</span>`, note: 'Not in this sentence' });
      fb.textContent = `${block.t} doesn't belong in this sentence.`;
      el.classList.add('used', 'gone');
      return;
    }
    if (!validNext(sentence, placed).has(block.t)) {
      clean = false;
      fb.className = 'fb bad';
      tries.push({ text: `<span class="jp">${block.t}</span>`, note: explainWrong(sentence, placed, block) });
      fb.textContent = explainWrong(sentence, placed, block);
      el.classList.remove('shake');
      void el.offsetWidth;
      el.classList.add('shake');
      return;
    }
    placed.push(block.t);
    el.classList.add('used');
    const ans = root.querySelector('#ans');
    const slot = ans.querySelector('.slot');
    slot.insertAdjacentHTML('beforebegin', blockHtml(block, 'placed'));
    slot.remove();
    fb.textContent = '';
    fb.className = 'fb';
    if (placed.length === sentence.blocks.length) {
      ans.classList.add('done');
      const said = sentence.blocks.map((b) => b.t).join(' ');
      ans.insertAdjacentHTML('beforeend', sayBtn(said));
      fb.textContent = '';
      fb.className = 'fb';
      root.querySelectorAll('#pool .block').forEach((b) => b.classList.add('used'));
      showSheet(root, {
        right: clean,
        headline: doneHeadline(clean),
        title: sentence.en,
        picked: tries,
        lines: [`<span class="romaji shown">${romajiLine(sentence.blocks.map((b) => b.t), glossary, '.')}</span>`, sentence.note ? `<span class="small muted">${sentence.note}</span>` : ''],
      }, () => onDone(clean));
    }
  };
  // Coming back with Previous shows the finished sentence.
  if (review) {
    for (const t of orders(sentence)[0]) {
      const taken = new Set([...root.querySelectorAll('.block.used')].map((x) => x.dataset.i));
      const b = pool.find((x) => x.t === t && !taken.has(String(x.i)));
      root.querySelector(`#pool .block[data-i="${b.i}"]`).click();
    }
  }
}

// Splits text into glossary words, longest match first. Unknown characters
// come through one at a time so nothing is lost.
export function tokenize(text, glossary) {
  const words = [];
  for (let i = 0; i < text.length;) {
    let len = 1;
    for (let n = text.length - i; n > 1; n--) {
      const word = text.slice(i, i + n);
      // 先生で + す is never right: stop short so です stays whole.
      if (word.endsWith('で') && text[i + n] === 'す') continue;
      if (glossary[word]) { len = n; break; }
    }
    words.push(text.slice(i, i + len));
    i += len;
  }
  return words;
}

// "Watashi wa gakusei desu." A null word renders as a blank.
// A form the glossary doesn't list (使って) borrows the reading of its kanji from a form it
// does (使う → つか), only where the kanji are the whole stem: 銀行 says nothing about 行って.
// Two verbs on one kanji (入る はい, 入れる い): the one whose ending matches, else the shorter.
const stems = new WeakMap();
function stemReading(w, glossary) {
  const m = /^([一-龯々]+)([ぁ-ゖ]+)$/.exec(w);
  if (!m) return null;
  // 来る changes its own sound: 来て きて, 来ない こない, 来れば くれば.
  if (m[1] === '来') return `${/^[なよさ]/.test(m[2]) ? 'こ' : /^[るれ]/.test(m[2]) ? 'く' : 'き'}${m[2]}`;
  if (!stems.has(glossary)) {
    const map = new Map();
    for (const [k, g] of Object.entries(glossary)) {
      const p = /^([一-龯々]+)([ぁ-ゖ]+)$/.exec(k);
      if (!p || !g.y?.endsWith(p[2])) continue;
      if (!map.has(p[1])) map.set(p[1], []);
      map.get(p[1]).push({ tail: p[2], y: g.y.slice(0, -p[2].length) });
    }
    stems.set(glossary, map);
  }
  const options = stems.get(glossary).get(m[1]);
  if (!options?.length) return null;
  // The verb whose conjugation makes this ending wins: 出た is 出る (でた), not 出す, and
  // 着ます is 着る (きます), not 着く. The longest matching stem is the most specific.
  const fit = options.filter((o) => conjugates(o, m[2])).sort((a, b) => b.tail.length - a.tail.length)[0];
  const best = fit || options.find((o) => o.tail[0] === m[2][0] && o.tail.length > 1)
    || options.slice().sort((a, b) => a.tail.length - b.tail.length)[0];
  return best.y + m[2];
}

// Can a verb listed with this kana ending (る, れる, く) take this ending (た, ます, って)?
const ROWS = { う: 'わいうえお', く: 'かきくけこ', ぐ: 'がぎぐげご', す: 'さしすせそ', つ: 'たちつてと', ぬ: 'なにぬねの', ぶ: 'ばびぶべぼ', む: 'まみむめも', る: 'らりるれろ' };
const TE = { う: 'っ', つ: 'っ', る: 'っ', く: 'い', ぐ: 'い', す: 'し', ぬ: 'ん', ぶ: 'ん', む: 'ん' };
const E_I = /[えけげせぜてでねへべぺめれいきぎしじちぢにひびぴみり]$/;
function conjugates({ tail, y }, ending) {
  const last = tail.at(-1);
  const base = tail.slice(0, -1);
  if (!ROWS[last] || !ending.startsWith(base)) return false;
  const next = ending[base.length];
  if (next === undefined) return false;
  // る after an e- or i-sound may be ichidan (食べる 食べた) as well as godan (入る 入った).
  const ichidan = last === 'る' && E_I.test(y + base) && /[まてたなよられろさ]/.test(next);
  return ichidan || ROWS[last].includes(next) || next === TE[last];
}

export function romajiLine(words, glossary, end = '.') {
  const line = words.map((w) => {
    if (w === null) return '___';
    if (glossary[w]?.ro) return glossary[w].ro;
    const y = /[一-龯々]/.test(w) ? stemReading(w, glossary) : null;
    return kanaToRomaji(y || w);
  }).join(' ')
    .replace(/「 ?/g, '“').replace(/ ?」/g, '”').replace(/ ?。/g, '.').replace(/ ?、/g, ',').replace(/ ?？/g, '?').replace(/ ?！/g, '!')
    .replace(/\bnani (d|t|no|na|ne)/g, 'nan $1') // 何 is read なん before d, t and n sounds, as the voice says it.
    .replace(/([.?!] )(\p{Ll})/gu, (_, gap, c) => gap + c.toUpperCase());
  const closed = /[.?!]$/.test(line) ? '' : end;
  return line[0].toUpperCase() + line.slice(1) + closed;
}

// Renders words in a wrapping row, keeping 。、？！ on the same line as the word before them.
const MARK = /^[。、？！]$/;
export function glued(tokens, render) {
  const out = [];
  for (const w of tokens) {
    if (MARK.test(w) && out.length) out[out.length - 1] = `<span class="glue">${out[out.length - 1]}<span>${w}</span></span>`;
    else out.push(render(w));
  }
  return out.join('');
}

const GLOSS_HINT ='<span class="muted small">Tap a word for its reading and meaning.</span>';
export const glossHtml = () => `<div class="gloss" aria-live="polite">${GLOSS_HINT}</div>`;

export function glossText(word, g) {
  if (!g) return word;
  const reading = g.y === word ? '' : ` <span class="jp">${g.y}</span> ·`;
  return `<span><b class="jp">${word}</b>${reading} ${g.ro} · ${g.m}</span>${sayBtn(spoken(word, g))}${glossKanji(word, g.y)}`;
}

// Tapping a [data-word] inside zone fills the zone's .gloss panel.
export function bindGloss(zone, glossary) {
  zone.addEventListener('click', (e) => {
    const el = e.target.closest('[data-word]');
    if (!el) return;
    zone.querySelectorAll('.sel').forEach((x) => x.classList.remove('sel'));
    el.classList.add('sel');
    zone.querySelector('.gloss').innerHTML = glossText(el.dataset.word, glossary[el.dataset.word]);
  });
}

export function renderParticle(root, item, set, cards, { glossary, review = false, onDone }) {
  let clean = true;
  const tries = [];
  const before = tokenize(item.before ?? set.noun, glossary);
  const after = tokenize(item.after, glossary);
  const wordBtn = (w) => `<button class="word" data-word="${w}">${w}</button>`;
  const line = (fill) => `${before.map(wordBtn).join('')}${
    fill ? `<button class="word blank" data-word="${fill}">${fill}</button>` : '<span class="blank">&nbsp;</span>'
  }${after.map(wordBtn).join('')}`;
  const romaji = (fill) => romajiLine([...before, fill, ...after], glossary);
  root.innerHTML = `
    <div class="card gloss-zone">
      <span class="caps">${item.label || `Particle · ${set.noun} (${set.reading})`}</span>
      <p class="en">${item.en}</p>
      <div class="pline" id="line">${line(null)}</div>
      <p class="romaji center" id="romaji">${romaji(null)}</p>
      ${glossHtml()}
    </div>
    <div class="reach">
      <div class="fb" id="fb" role="status"></div>
      <div class="opts ${item.options.some((o) => o.length > 3) ? 'long' : ''}" id="opts">${item.options.map((o) => `<button class="opt" data-o="${o}">${o}</button>`).join('')}</div>
    </div>
    <div class="dock" id="after"></div>`;
  bindGloss(root.querySelector('.gloss-zone'), glossary);
  const fb = root.querySelector('#fb');
  const opts = root.querySelector('#opts');
  opts.onclick = (e) => {
    const el = e.target.closest('.opt');
    if (!el || el.disabled) return;
    const choice = el.dataset.o;
    if (choice !== item.answer) {
      clean = false;
      tries.push({ text: `<span class="jp">${choice}</span>`, note: item.why[choice] || '' });
      el.classList.add('wrong');
      el.disabled = true;
      fb.className = 'fb bad';
      fb.textContent = item.why[choice];
      return;
    }
    el.classList.add('right');
    opts.querySelectorAll('.opt').forEach((b) => { b.disabled = true; });
    root.querySelector('#line').innerHTML = line(choice);
    root.querySelector('#romaji').innerHTML = `${romaji(choice)} ${sayBtn([...before, choice, ...after].join(' '))}`;
    root.querySelector('#romaji').classList.add('shown');
    const card = cards.find((c) => c.p === choice);
    fb.className = 'fb';
    fb.textContent = '';
    const why = card ? (item.note ? `${card.name}. ${item.note}` : `${card.name}: ${card.fn}`) : item.note || '';
    showSheet(root, { right: clean, headline: doneHeadline(clean), glyph: choice, title: item.en, picked: tries, lines: [why ? `<span class="small">${why}</span>` : ''] }, () => onDone(clean));
  };
  if (review) opts.querySelector(`[data-o="${item.answer}"]`).click();
}

// A multiple-choice question with instant feedback. `q` is "word word" text, and the
// first option in `o` is the right one.
export function renderCheck(root, q, { glossary, review = false, onDone }) {
  let clean = true;
  const tries = [];
  // A [bracketed] word is the one being tested, so it gets no romaji, audio or tap-to-translate.
  const tokens = q.q.replace(/([。、？！])/g, ' $1 ').trim().split(/\s+/);
  const secret = (w) => /^\[.*\]$/.test(w);
  const bare = (w) => w.replace(/[[\]]/g, '');
  const hasSecret = tokens.some(secret);
  const options = shuffled(q.o);
  const english = /[A-Za-z]/.test(q.q);
  const show = (o) => (/[A-Za-z]/.test(o) ? o : o.replace(/ +/g, ''));
  const wordHtml = (w) => (secret(w) ? `<u>${bare(w)}</u>`
    : glossary[w] ? `<button class="word" data-word="${w}">${w}</button>` : `<span>${w}</span>`);
  // Romaji only when every word has a reading: half-converted lines (使tte) help no one.
  const ro = hasSecret ? '' : romajiLine(tokens, glossary, '');
  const romajiRow = hasSecret || /[一-龯々]/.test(ro) ? '' : `<p class="romaji center">${ro} ${sayBtn(tokens.join(' '))}</p>`;
  // A listening question plays its lines (and, for a quick response, the numbered replies),
  // and keeps the replies' words hidden until you answer.
  const NUM = ['いち', 'に', 'さん', 'よん'];
  const audio = q.play ? [...q.play.map(([s, t]) => ({ s, t })), ...(q.ao ? options.map((o, i) => ({ s: 'B', t: `${NUM[i]}、${o}` })) : [])] : null;
  const optHtml = (o, i) => (q.ao ? `<span class="cnum">${i + 1}</span><span class="grow ao" hidden>${show(o)}</span>` : show(o));
  root.innerHTML = `
    <div class="card gloss-zone">
      <span class="caps">Check</span>
      ${q.p ? `<div class="passage jp">${q.p.replace(/ +/g, '').replace(/\n/g, '<br>')}</div>` : ''}
      ${q.ask ? `<p class="small muted">${q.ask}</p>` : ''}
      ${audio ? `<button class="btn ghost" id="play">${icons.speaker}<span>Play</span></button>` : ''}
      ${english ? `<p class="en">${q.q}</p>` : `<div class="pline small-line">${tokens.map(wordHtml).join('')}</div>
      ${romajiRow}
      ${tokens.some((w) => !secret(w) && glossary[w]) ? glossHtml() : ''}`}
    </div>
    <div class="reach">
      <div class="fb" id="fb" role="status"></div>
      <div class="choices ${q.p && options.every((o) => o.length <= 12) ? 'grid2' : ''}" id="opts">${options.map((o, i) => `<button class="choice" data-o="${o}">${optHtml(o, i)}</button>`).join('')}</div>
    </div>
    <div class="dock" id="after"></div>`;
  bindGloss(root.querySelector('.gloss-zone'), glossary);
  const fb = root.querySelector('#fb');
  root.querySelector('#play')?.addEventListener('click', () => speakLines(audio));
  root.querySelector('#opts').onclick = (e) => {
    const b = e.target.closest('.choice');
    if (!b || b.disabled) return;
    if (b.dataset.o !== q.o[0]) {
      clean = false;
      // A quick response's replies are heard, not read, so a wrong one is named by its number.
      tries.push({ text: q.ao ? `Reply ${b.querySelector('.cnum')?.textContent || ''}` : show(b.dataset.o) });
      b.classList.add('wrong');
      b.disabled = true;
      fb.className = 'fb bad';
      // A quick response keeps its answer hidden: the feedback would give the reply away.
      fb.textContent = q.ao ? 'Not that one. Play it again and listen for the reply.' : q.w || 'Not quite. Try another answer.';
      return;
    }
    b.classList.add('right');
    root.querySelectorAll('.choice').forEach((x) => { x.disabled = true; });
    root.querySelectorAll('.ao').forEach((x) => { x.hidden = false; });
    fb.className = 'fb';
    fb.textContent = '';
    showSheet(root, { right: clean, headline: doneHeadline(clean), title: clean ? show(q.o[0]) : '', answer: show(q.o[0]), picked: tries, lines: [q.w ? `<span class="small">${q.w}</span>` : ''] }, () => onDone(clean));
  };
  if (review) root.querySelector(`.choice[data-o="${q.o[0]}"]`).click();
}

export function particleCardHtml(c, glossary) {
  const end = c.en.endsWith('.') ? '.' : '';
  return `<div class="card gloss-zone">
    <div class="pcard-head"><span class="pbig">${c.p}</span>
      <div><h3>${c.name}</h3><span class="muted small">Read as “${c.reads}”</span></div></div>
    <p>${c.fn}</p>
    <div class="exrow">${c.ex.map((b) => `<button class="block ${b.r}" data-word="${b.t}">${b.t}</button>`).join('')}</div>
    <p class="center small muted">${c.en}</p>
    <p class="romaji center">${romajiLine(c.ex.map((b) => b.t), glossary, end)} ${sayBtn(c.ex.map((b) => b.t).join(' '))}</p>
    ${glossHtml()}
    <p class="picture">${icons.bulb}<span><b>Picture it:</b> ${c.picture}</span></p>
  </div>`;
}
