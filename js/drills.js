// Tap-to-assemble and particle drills. The logic functions are pure; the
// render functions build UI inside the element they are given.
import { icons } from './icons.js';
import { sayBtn } from './tts.js';
import { romaji as kanaToRomaji } from './romaji.js';

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

export function renderSentence(root, sentence, { hints, review = false, onDone }) {
  // Keep shuffling until the pool is not already a correct answer.
  const accepted = orders(sentence).map((o) => o.join('|'));
  let pool = shuffled(sentence.blocks.map((b, i) => ({ ...b, i })));
  for (let n = 0; n < 8 && accepted.includes(pool.map((b) => b.t).join('|')); n++) pool = shuffled(pool);

  const placed = [];
  let clean = true;
  const blockHtml = (b, cls = '') => `<button class="block ${ROLE_NAMES[b.r]} ${cls}" data-i="${b.i}">
    <span>${b.t}</span>${hints && b.y ? `<small>${b.y}</small>` : ''}</button>`;

  root.innerHTML = `
    <div class="card">
      <span class="caps">Build the sentence</span>
      <p class="en">${sentence.en}</p>
      <div class="answer" id="ans" aria-live="polite">${'<i class="slot"></i>'.repeat(sentence.blocks.length)}</div>
    </div>
    <div class="pool" id="pool">${pool.map((b) => blockHtml(b)).join('')}</div>
    <div class="fb" id="fb" role="status"></div>
    <div class="legend">
      <span class="topic"><i></i>topic</span><span class="subject"><i></i>subject</span>
      <span class="object"><i></i>object</span><span class="verb"><i></i>verb</span>
      <span class="particle"><i></i>particle</span><span><i></i>other</span>
    </div>
    <div class="dock" id="after"></div>`;
  const fb = root.querySelector('#fb');

  root.querySelector('#pool').onclick = (e) => {
    const el = e.target.closest('.block');
    if (!el || el.classList.contains('used')) return;
    const block = pool.find((b) => b.i === Number(el.dataset.i));
    if (!validNext(sentence, placed).has(block.t)) {
      clean = false;
      fb.className = 'fb bad';
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
      ans.insertAdjacentHTML('beforeend', sayBtn(sentence.blocks.map((b) => b.t).join('')));
      fb.className = 'fb good';
      fb.textContent = sentence.note || 'Correct.';
      root.querySelector('#after').innerHTML = '<button class="btn" id="cont">Continue</button>';
      root.querySelector('#cont').onclick = () => onDone(clean);
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
export function romajiLine(words, glossary, end = '.') {
  const line = words.map((w) => (w === null ? '___' : glossary[w]?.ro ?? kanaToRomaji(w))).join(' ')
    .replace(/ ?。/g, '.').replace(/ ?、/g, ',').replace(/ ?？/g, '?').replace(/ ?！/g, '!')
    .replace(/\bnani desu/g, 'nan desu') // 何 is read なん before です.
    .replace(/([.?!] )(\p{Ll})/gu, (_, gap, c) => gap + c.toUpperCase());
  const closed = /[.?!]$/.test(line) ? '' : end;
  return line[0].toUpperCase() + line.slice(1) + closed;
}

const GLOSS_HINT = '<span class="muted small">Tap a word for its reading and meaning.</span>';
export const glossHtml = () => `<div class="gloss" aria-live="polite">${GLOSS_HINT}</div>`;

export function glossText(word, g) {
  if (!g) return word;
  const reading = g.y === word ? '' : ` <span class="jp">${g.y}</span> ·`;
  return `<span><b class="jp">${word}</b>${reading} ${g.ro} · ${g.m}</span>${sayBtn(spoken(word, g))}`;
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
    <div class="opts ${item.options.some((o) => o.length > 3) ? 'long' : ''}" id="opts">${item.options.map((o) => `<button class="opt" data-o="${o}">${o}</button>`).join('')}</div>
    <div class="fb" id="fb" role="status"></div>
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
      el.classList.add('wrong');
      el.disabled = true;
      fb.className = 'fb bad';
      fb.textContent = item.why[choice];
      return;
    }
    el.classList.add('right');
    opts.querySelectorAll('.opt').forEach((b) => { b.disabled = true; });
    root.querySelector('#line').innerHTML = line(choice);
    root.querySelector('#romaji').innerHTML = `${romaji(choice)} ${sayBtn([...before, choice, ...after].join(''))}`;
    const card = cards.find((c) => c.p === choice);
    fb.className = 'fb good';
    if (card) fb.textContent = item.note ? `${card.name}. ${item.note}` : `${card.name}: ${card.fn}`;
    else fb.textContent = item.note || 'Correct.';
    root.querySelector('#after').innerHTML = '<button class="btn" id="cont">Continue</button>';
    root.querySelector('#cont').onclick = () => onDone(clean);
  };
  if (review) opts.querySelector(`[data-o="${item.answer}"]`).click();
}

// A multiple-choice question with instant feedback. `q` is "word word" text, and the
// first option in `o` is the right one.
export function renderCheck(root, q, { glossary, review = false, onDone }) {
  let clean = true;
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
  const romajiRow = hasSecret ? '' : `<p class="romaji center">${romajiLine(tokens, glossary, '')} ${sayBtn(tokens.join(''))}</p>`;
  root.innerHTML = `
    <div class="card gloss-zone">
      <span class="caps">Check</span>
      ${q.ask ? `<p class="small muted">${q.ask}</p>` : ''}
      ${english ? `<p class="en">${q.q}</p>` : `<div class="pline small-line">${tokens.map(wordHtml).join('')}</div>
      ${romajiRow}
      ${tokens.some((w) => !secret(w) && glossary[w]) ? glossHtml() : ''}`}
    </div>
    <div class="choices" id="opts">${options.map((o) => `<button class="choice" data-o="${o}">${show(o)}</button>`).join('')}</div>
    <div class="fb" id="fb" role="status"></div>
    <div class="dock" id="after"></div>`;
  bindGloss(root.querySelector('.gloss-zone'), glossary);
  const fb = root.querySelector('#fb');
  root.querySelector('#opts').onclick = (e) => {
    const b = e.target.closest('.choice');
    if (!b || b.disabled) return;
    if (b.dataset.o !== q.o[0]) {
      clean = false;
      b.classList.add('wrong');
      b.disabled = true;
      fb.className = 'fb bad';
      fb.textContent = q.w || 'Not quite. Try another answer.';
      return;
    }
    b.classList.add('right');
    root.querySelectorAll('.choice').forEach((x) => { x.disabled = true; });
    fb.className = 'fb good';
    fb.textContent = q.w || 'Correct.';
    root.querySelector('#after').innerHTML = '<button class="btn" id="cont">Continue</button>';
    root.querySelector('#cont').onclick = () => onDone(clean);
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
    <p class="romaji center">${romajiLine(c.ex.map((b) => b.t), glossary, end)} ${sayBtn(c.ex.map((b) => b.t).join(''))}</p>
    ${glossHtml()}
    <p class="picture">${icons.bulb}<span><b>Picture it:</b> ${c.picture}</span></p>
  </div>`;
}
