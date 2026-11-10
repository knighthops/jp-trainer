// Trip: travel scenes (convenience store, trains, …), each in four parts.
// Signs: recognise a sign at a glance. Say: recall a line from its English.
// Hear: catch what staff or announcements say, by ear first. Role-play: a whole exchange.
// Planning functions are pure, so they can be unit tested; render functions build UI in `root`.
import { speak, speakStep, sayBtn, NORMAL, SLOW } from './tts.js';
import { bindGloss, glossHtml, romajiLine, shuffled, wordKanjiHtml, glued } from './drills.js';
import { isDue, newRecord, stageOf, STRONG, GRADES, GRADE_NAMES, label } from './srs.js';
import { romaji } from './romaji.js';
import { icons } from './icons.js';

export const PARTS = [
  { key: 'signs', label: 'Signs', jp: '看板', desc: 'Read them at a glance' },
  { key: 'say', label: 'Say', jp: '話す', desc: 'Ask for what you need' },
  { key: 'hear', label: 'Hear', jp: '聞く', desc: 'Understand what staff say' },
  { key: 'play', label: 'Role-play', jp: '会話', desc: 'Put it all together' },
];
// Scenes still being written, so the Trip tab can say what's coming.
export const COMING = []; // Scenes still being written, shown as "On the way" on the Trip tab.

const NEW_SIGNS = 8;
const NEW_LINES = 5;
const NEW_HEAR = 8;
const PRACTICE = 8;

export const tripId = (item) => `x:${item.id}`;
const TYPE = { signs: 'tripSign', say: 'tripSay', hear: 'tripHear', play: 'tripPlay' };
const stepOf = (scene, part, ref) => ({ type: TYPE[part], id: tripId(ref), ref, scene });

// How ready a set of items is: recalled once counts half, strong or better counts in full.
// A miss (reps back to 0) counts nothing, so wrong answers never raise the score.
const worth = (rec) => (!rec || !rec.reps ? 0 : stageOf(rec) >= STRONG ? 1 : 0.5);
function share(ids, items) {
  if (!ids.length) return 0;
  const sum = ids.reduce((n, id) => n + worth(items[id]), 0);
  return sum / ids.length;
}
const partIds = (scene, part) => (scene[part] || []).map(tripId);
const sceneIds = (scene) => PARTS.flatMap((p) => partIds(scene, p.key));

export const readiness = (scene, items) => share(sceneIds(scene), items);
export const tripReadiness = (scenes, items) => share(scenes.flatMap(sceneIds), items);

// Per part: how many items are new, due, and known.
export function partStatus(scene, part, items, now = Date.now()) {
  const ids = partIds(scene, part);
  return {
    total: ids.length,
    fresh: ids.filter((id) => !items[id]).length,
    due: ids.filter((id) => isDue(items[id], now)).length,
    ready: share(ids, items),
  };
}

// The steps for one part of a scene. New and due items are studied and scheduled;
// with nothing new or due, the part runs as free practice and leaves the schedule alone.
export function partSteps(scene, part, items, now = Date.now(), rng = Math.random) {
  const all = (scene[part] || []).map((ref) => stepOf(scene, part, ref));
  const fresh = all.filter((s) => !items[s.id]);
  const due = all.filter((s) => isDue(items[s.id], now));
  if (part === 'say') {
    const learn = fresh.slice(0, NEW_LINES);
    if (learn.length || due.length) {
      return {
        useSrs: true,
        steps: [...learn.map((s) => ({ ...s, type: 'tripLearn', id: `${s.id}#learn` })), ...shuffled([...learn, ...due], rng)],
      };
    }
    return { useSrs: false, steps: shuffled(all, rng).slice(0, PRACTICE) };
  }
  // A scene has a few role-play variants so replays don't turn into memorising one script.
  // One per session: a new one first, else the most overdue, else any for practice.
  if (part === 'play') {
    const pick = fresh[0] || [...due].sort((a, b) => items[a.id].due - items[b.id].due)[0];
    return pick ? { useSrs: true, steps: [pick] } : { useSrs: false, steps: [all[Math.floor(rng() * all.length)]] };
  }
  const pick = [...fresh.slice(0, part === 'signs' ? NEW_SIGNS : NEW_HEAR), ...due];
  if (pick.length) return { useSrs: true, steps: pick };
  return { useSrs: false, steps: shuffled(all, rng).slice(0, PRACTICE) };
}

// What to do next: reviews first (the part with the most due), so nothing slips while new
// items pile on; then the first part with something new, scene by scene.
export function nextPart(scenes, items, now = Date.now()) {
  let best = null;
  for (const scene of scenes) {
    for (const p of PARTS) {
      const { due } = partStatus(scene, p.key, items, now);
      if (due && (!best || due > best.due)) best = { scene, part: p, due };
    }
  }
  if (best) return best;
  for (const scene of scenes) {
    for (const p of PARTS) if (partStatus(scene, p.key, items, now).fresh) return { scene, part: p, due: 0 };
  }
  return null;
}

// After an answer: keep only the right choice (and a wrong pick), say the result where the
// thumb is, and scroll so the reveal and Continue are both in view.
function settle(root, rightIndex, text, good) {
  root.querySelectorAll('.choice').forEach((b) => {
    b.disabled = true;
    if (Number(b.dataset.i) === rightIndex) b.classList.add('right');
    else if (!b.classList.contains('wrong')) b.hidden = true;
  });
  const fb = root.querySelector('#fb');
  fb.className = `fb ${good ? 'good' : 'bad'}`;
  fb.textContent = text;
  requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight }));
}

// Due trip items for the daily review block. Role-plays stay in their scene: they're too long for a review.
export function tripReviewSteps(scenes, items, now = Date.now(), n = 5) {
  return scenes.flatMap((scene) => ['signs', 'say', 'hear'].flatMap((part) => (scene[part] || [])
    .map((ref) => stepOf(scene, part, ref))))
    .filter((s) => isDue(items[s.id], now))
    .sort((a, b) => items[a.id].due - items[b.id].due)
    .slice(0, n);
}

// Whole days until the trip date ("2027-05-01"), counted from local midnight. Null when unset.
export function daysUntil(date, now = Date.now()) {
  if (!date) return null;
  const [y, m, d] = date.split('-').map(Number);
  const today = new Date(now);
  today.setHours(0, 0, 0, 0);
  return Math.round((new Date(y, m - 1, d).getTime() - today.getTime()) / 864e5);
}

/* ---------- Rendering ---------- */

const words = (t) => t.split(' ').filter((w) => !/^[。、？！]$/.test(w));
const jpLine = (t, glossary) => `<div class="pline">${glued(t.split(' '), (w) => (glossary[w]
  ? `<button class="word" data-word="${w}">${w}</button>` : `<span>${w}</span>`))}</div>`;
const roLine = (t, glossary) => `<p class="romaji center">${romajiLine(t.split(' '), glossary)} ${sayBtn(t)}</p>`;
const head = (kind, step) => `<span class="caps">${kind} · ${step.scene.title}</span>`;
export const signHtml = (sign, big = false) => `<span class="sign ${sign.style || 'notice'} ${big ? 'big' : ''} jp">${sign.t}</span>`;

function choicesHtml(options) {
  return `<div class="choices" id="opts">${options.map((o, i) => `<button class="choice" data-i="${i}">${o}</button>`).join('')}</div>`;
}

// Signs: what does it mean? Four meanings, one try, then the reading and its kanji.
export function renderSign(root, step, { signs, glossary, review = false, onDone }) {
  const sign = step.ref;
  // Wrong meanings from the same scene first: an express-train sign is no decoy in a shop.
  const pool = [...shuffled(step.scene.signs), ...shuffled(signs)].filter((s) => s.m !== sign.m);
  const others = pool.map((s) => s.m).filter((m, i, a) => a.indexOf(m) === i).slice(0, 3);
  const options = shuffled([sign.m, ...others]);
  // Spoken and shown from its kana, so the voice never guesses a lone kanji.
  const y = sign.y || glossary[sign.t]?.y || sign.t;
  root.innerHTML = `
    <div class="card sign-card">
      ${head('Sign', step)}
      <div class="sign-stage">${signHtml(sign, true)}</div>
      <p class="en center" id="ask">What does it mean?</p>
      <div id="reveal" hidden>
        <p class="sign-read"><span class="jp">${y}</span> <span class="ro">${romaji(y)}</span> ${sayBtn(y)}</p>
        <p class="center"><strong>${sign.m}</strong></p>
        ${sign.note ? `<p class="small muted center">${sign.note}</p>` : ''}
        ${wordKanjiHtml(sign.t, y) ? `<details class="more"><summary>The kanji in this sign</summary>${wordKanjiHtml(sign.t, y)}</details>` : ''}
      </div>
    </div>
    <div class="reach"><div class="fb" id="fb" role="status"></div>${choicesHtml(options)}</div>
    <div class="dock" id="after"></div>`;
  let clean = true;
  const finish = () => {
    root.querySelector('#reveal').hidden = false;
    root.querySelector('#ask').hidden = true;
    settle(root, options.indexOf(sign.m), clean ? `Right: ${sign.m}.` : `It means ${sign.m}.`, clean);
    root.querySelector('#after').innerHTML = '<button class="btn" id="cont">Continue</button>';
    root.querySelector('#cont').onclick = () => onDone(clean);
  };
  root.querySelector('#opts').onclick = (e) => {
    const b = e.target.closest('.choice');
    if (!b || b.disabled) return;
    if (options[b.dataset.i] !== sign.m) {
      clean = false;
      b.classList.add('wrong');
    } else speak(y);
    finish();
  };
  if (review) finish();
}

// Say, first time: the line, its words, and when you'd use it.
export function renderSayLearn(root, step, { glossary, onDone }) {
  const line = step.ref;
  root.innerHTML = `
    <div class="card gloss-zone">
      ${head('New line', step)}
      <p class="en">${line.en}</p>
      ${line.when ? `<p class="small muted">${line.when}</p>` : ''}
      ${jpLine(line.t, glossary)}
      ${roLine(line.t, glossary)}
      ${glossHtml()}
    </div>
    <div class="dock"><button class="btn" id="next">Got it</button></div>`;
  bindGloss(root.querySelector('.gloss-zone'), glossary);
  speak(line.t);
  root.querySelector('#next').onclick = onDone;
}

// Say, recall: the English and the situation; think of the Japanese, then check and rate.
export function renderSayRecall(root, step, { glossary, rec, review = false, onRate }) {
  const line = step.ref;
  root.innerHTML = `
    <div class="card gloss-zone">
      ${head('Say it', step)}
      <p class="en">${line.en}</p>
      ${line.when ? `<p class="small muted">${line.when}</p>` : ''}
      <div id="reveal" hidden>${jpLine(line.t, glossary)}${roLine(line.t, glossary)}${glossHtml()}</div>
      <p class="small muted center" id="think">Say it in your head, then check.</p>
    </div>
    <div class="dock" id="after"><button class="btn" id="show">Show answer</button></div>`;
  bindGloss(root.querySelector('.gloss-zone'), glossary);
  const show = () => {
    root.querySelector('#reveal').hidden = false;
    root.querySelector('#think').hidden = true;
    const r = rec || newRecord();
    root.querySelector('#after').innerHTML = review
      ? '<button class="btn" id="cont">Continue</button>'
      : `<div class="rate">${GRADES.map((g) => `<button class="${g}" data-g="${g}">${GRADE_NAMES[g]}<small>${label(r, g)}</small></button>`).join('')}</div>`;
    if (review) root.querySelector('#cont').onclick = () => onRate(null);
    else root.querySelector('.rate').onclick = (e) => { const b = e.target.closest('[data-g]'); if (b) onRate(b.dataset.g); };
  };
  root.querySelector('#show').onclick = () => { show(); speak(line.t); };
  if (review) show();
}

// Hear: the line plays before you see it. Pick what it means, then read it, and see how to reply.
export function renderHear(root, step, { glossary, others, review = false, onDone }) {
  const line = step.ref;
  let rate = NORMAL;
  const wrong = shuffled(others.filter((en) => en !== line.en)).slice(0, 2);
  const options = shuffled([line.en, ...wrong]);
  root.innerHTML = `
    <div class="card">
      ${head('Hear', step)}
      <p class="en">What did they say?</p>
      <button class="btn ghost" id="play">${icons.speaker}<span>Play again</span></button>
      <div class="seg mini" id="speed"><button class="on" data-r="${NORMAL}">Normal</button><button data-r="${SLOW}">Slow</button></div>
    </div>
    <div class="card gloss-zone" id="reveal" hidden>
      ${jpLine(line.t, glossary)}
      ${roLine(line.t, glossary)}
      <p class="center"><strong>${line.en}</strong></p>
      ${line.tip ? `<p class="small muted center">${line.tip}</p>` : ''}
      ${line.r ? `<div class="reply"><span class="caps">You can answer</span>${jpLine(line.r, glossary)}${roLine(line.r, glossary)}</div>` : ''}
      ${glossHtml()}
    </div>
    <div class="reach"><div class="fb" id="fb" role="status"></div>${choicesHtml(options)}</div>
    <div class="dock" id="after"></div>`;
  bindGloss(root.querySelector('#reveal'), glossary);
  const play = () => speak(line.t, { rate });
  root.querySelector('#play').onclick = play;
  root.querySelector('#speed').onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rate = Number(b.dataset.r);
    root.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
    play();
  };
  let clean = true;
  const finish = () => {
    settle(root, options.indexOf(line.en), clean ? 'Right.' : `They said: ${line.en}`, clean);
    root.querySelector('#reveal').hidden = false;
    root.querySelector('#after').innerHTML = '<button class="btn" id="cont">Continue</button>';
    root.querySelector('#cont').onclick = () => onDone(clean);
  };
  root.querySelector('#opts').onclick = (e) => {
    const b = e.target.closest('.choice');
    if (!b || b.disabled) return;
    if (options[b.dataset.i] !== line.en) { clean = false; b.classList.add('wrong'); }
    finish();
  };
  if (review) finish();
  else play();
}

// Role-play: a chat. Staff lines play aloud; you pick your line, or answer a question about what you heard.
// A wrong pick explains itself and stays on the turn. Tap a staff bubble for its English.
export function renderPlay(root, step, { glossary, review = false, onDone }) {
  const play = step.ref;
  root.innerHTML = `
    <div class="card">
      ${head('Role-play', step)}
      <h3>${play.title}</h3>
      <p class="small muted">${play.setup}</p>
    </div>
    <div class="chat" id="chat"></div>
    <div class="reach" id="turn"></div>
    <div class="dock" id="after"></div>`;
  const chat = root.querySelector('#chat');
  const turnEl = root.querySelector('#turn');
  let clean = true;
  let i = 0;
  let timer = null;
  const later = (fn, ms) => { timer = setTimeout(fn, review ? 0 : ms); };
  const bubble = (who, t, en) => {
    chat.insertAdjacentHTML('beforeend', `<div class="bub ${who}">
      <span class="jp">${t.replace(/ /g, '')}</span>
      <span class="ro">${romajiLine(t.split(' '), glossary)}</span>
      ${who === 'staff' ? `<span class="bub-en" hidden>${en}</span>` : `<span class="bub-en">${en}</span>`}
      ${sayBtn(t)}</div>`);
    toEnd();
  };
  // The newest line and your turn sit at the bottom of the page, just above the dock and bar,
  // so scroll to the end rather than to the bubble (which would leave it under the dock).
  const toEnd = () => requestAnimationFrame(() => window.scrollTo({ top: document.documentElement.scrollHeight, behavior: review ? 'auto' : 'smooth' }));
  const note = (text) => { chat.insertAdjacentHTML('beforeend', `<div class="bub-note">${text}</div>`); toEnd(); };
  // Waits for the voice to finish, with a fallback for devices without one.
  const say = (t, then) => {
    if (review) { then(); return; }
    let done = false;
    const go = () => { if (!done) { done = true; then(); } };
    // With a voice, wait for it to finish (the long fallback only catches a lost end event,
    // so a slow line is never cut off). With no speech at all, move on after a short pause.
    const speaking = speakStep(t, { onend: go });
    later(go, speaking ? 4000 + t.length * 300 : 700);
  };
  const next = () => {
    turnEl.innerHTML = '';
    const turn = play.turns[i++];
    if (!turn) {
      root.querySelector('#after').innerHTML = `<p class="small muted center">${clean ? 'Smooth. You got through it first time.' : 'Done. Run it again later to get it clean.'}</p>
        <button class="btn" id="cont">Continue</button>`;
      root.querySelector('#cont').onclick = () => onDone(clean);
      toEnd();
      return;
    }
    if (turn.who === 'staff') {
      bubble('staff', turn.t, turn.en);
      say(turn.t, () => later(next, 250));
      return;
    }
    const order = review ? turn.options : shuffled(turn.options);
    const isCheck = turn.who === 'check';
    turnEl.innerHTML = `<div class="fb" id="fb" role="status"></div>
      <p class="turn-goal"><span class="caps">${isCheck ? 'Did you catch it?' : 'Your turn'}</span>${isCheck ? turn.q : turn.goal}</p>
      <div class="choices">${order.map((o, n) => `<button class="choice ${o.t ? 'jpopt' : ''}" data-n="${n}">${o.t
        ? `<span class="jp">${o.t.replace(/ /g, '')}</span><small>${romajiLine(o.t.split(' '), glossary)}</small>`
        : o.act ? `<em>${o.act}</em>` : o.en}</button>`).join('')}</div>`;
    const fb = turnEl.querySelector('#fb');
    toEnd();
    const pick = (o, b) => {
      if (!o.ok) {
        clean = false;
        b.classList.add('wrong');
        b.disabled = true;
        fb.className = 'fb bad';
        fb.textContent = o.why || 'Not quite. Try another.';
        return;
      }
      turnEl.querySelectorAll('.choice').forEach((x) => { x.disabled = true; });
      b.classList.add('right');
      if (isCheck) { note(`${turn.q} <b>${o.en}</b>`); later(next, 500); return; }
      if (o.act) { note(o.act + (o.why ? `. ${o.why}` : '')); later(next, 500); return; }
      bubble('you', o.t, o.en);
      if (o.why) note(o.why);
      say(o.t, () => later(next, 250));
    };
    turnEl.querySelector('.choices').onclick = (e) => {
      const b = e.target.closest('.choice');
      if (b && !b.disabled) pick(order[b.dataset.n], b);
    };
    if (review) pick(order.find((o) => o.ok), turnEl.querySelector(`.choice[data-n="${order.findIndex((o) => o.ok)}"]`));
  };
  chat.onclick = (e) => {
    const b = e.target.closest('.bub.staff');
    if (b && !e.target.closest('[data-say]')) b.querySelector('.bub-en').hidden = false;
  };
  next();
  return () => clearTimeout(timer);
}

// For tests: every line the voice reads in a scene.
export const sceneLines = (scene) => [
  ...scene.say.map((l) => l.t), ...scene.hear.flatMap((l) => [l.t, l.r].filter(Boolean)),
  ...scene.play.flatMap((p) => p.turns.flatMap((t) => (t.t ? [t.t] : (t.options || []).map((o) => o.t).filter(Boolean)))),
];
export { words as tripWords };
