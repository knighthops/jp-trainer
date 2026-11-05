// Tap-to-assemble and particle drills. The logic functions are pure; the
// render functions build UI inside the element they are given.

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

export function renderSentence(root, sentence, { hints, onDone }) {
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
      <div class="answer" id="ans" aria-live="polite"></div>
    </div>
    <div class="pool" id="pool">${pool.map((b) => blockHtml(b)).join('')}</div>
    <div class="fb" id="fb" role="status"></div>
    <div class="legend">
      <span class="topic"><i></i>topic</span><span class="subject"><i></i>subject</span>
      <span class="object"><i></i>object</span><span class="verb"><i></i>verb</span>
      <span class="particle"><i></i>particle</span><span><i></i>other</span>
    </div>
    <div id="after"></div>`;
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
    root.querySelector('#ans').insertAdjacentHTML('beforeend', blockHtml(block, 'placed'));
    fb.textContent = '';
    fb.className = 'fb';
    if (placed.length === sentence.blocks.length) {
      fb.className = 'fb good';
      fb.textContent = sentence.note || 'Correct.';
      root.querySelector('#after').innerHTML = '<button class="btn" id="cont">Continue</button>';
      root.querySelector('#cont').onclick = () => onDone(clean);
    }
  };
}

export function renderParticle(root, item, set, cards, { onDone }) {
  let clean = true;
  const line = (fill) => `${item.before ?? set.noun}<span class="blank">${fill}</span>${item.after}`;
  root.innerHTML = `
    <div class="card">
      <span class="caps">Particle · ${set.noun} (${set.reading})</span>
      <p class="en">${item.en}</p>
      <p class="pline" id="line">${line('&nbsp;')}</p>
    </div>
    <div class="opts" id="opts">${item.options.map((o) => `<button class="opt" data-o="${o}">${o}</button>`).join('')}</div>
    <div class="fb" id="fb" role="status"></div>
    <div id="after"></div>`;
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
    const card = cards.find((c) => c.p === choice);
    fb.className = 'fb good';
    fb.textContent = item.note ? `${card.name}. ${item.note}` : `${card.name}: ${card.fn}`;
    root.querySelector('#after').innerHTML = '<button class="btn" id="cont">Continue</button>';
    root.querySelector('#cont').onclick = () => onDone(clean);
  };
}

export function particleCardHtml(c) {
  return `<div class="card">
    <div class="row"><span class="pbig">${c.p}</span>
      <div class="grow"><h3>${c.name}</h3><span class="muted small">Read as “${c.reads}”</span></div></div>
    <p>${c.fn}</p>
    <div class="exrow">${c.ex.map((b) => `<span class="block ${b.r}">${b.t}</span>`).join('')}</div>
    <p class="center small muted">${c.en}</p>
    <p class="small"><b>Picture it:</b> ${c.picture}</p>
  </div>`;
}
