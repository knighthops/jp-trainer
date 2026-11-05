// Routing and screens.
import { load, save, dayStats, daysStudied, lastWeek } from './store.js';
import { GRADES, newRecord, rate, label } from './srs.js';
import { buildSession, kanjiId, wordId } from './session.js';
import { renderSentence, renderParticle, particleCardHtml, shuffled } from './drills.js';

const view = document.getElementById('view');
const top = document.getElementById('top');
const tabbar = document.getElementById('tabbar');
const state = load();
let data = null;
let run = null;

const applyTheme = () => {
  const t = state.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
};

function setTop(title, { close = false, count = '', progress = null } = {}) {
  top.innerHTML = `<div class="top-in">
      ${close ? '<button class="hbtn" id="close" aria-label="Exit">×</button>' : '<span class="dot"></span>'}
      <h1>${title}</h1><span class="count">${count}</span></div>
    ${progress === null ? '' : `<div class="progress"><i style="width:${progress}%"></i></div>`}`;
  if (close) top.querySelector('#close').onclick = endRun;
}

/* ---------- Daily screen ---------- */

function screenToday() {
  setTop('JP Trainer');
  const { steps, counts } = buildSession(state, data);
  const studied = daysStudied(state);
  const row = (name, n, mins) => `<div class="row"><span class="grow">${name}</span>
    <span class="muted small">${mins}</span><span class="num">${n}</span></div>`;
  view.innerHTML = `
    <section class="card hero">
      <span class="caps">Today</span>
      ${steps.length
        ? `<h2>Your session is ready</h2><p class="muted">About 15 minutes. Progress saves as you go.</p>
           <button class="btn" id="start">Start session</button>`
        : '<h2>All caught up</h2><p class="muted">Nothing is due. Practice if you want more.</p>'}
    </section>
    <section class="card list">
      ${row('Reviews due', counts.reviews, '5 min')}
      ${row('New kanji and words', counts.learn, '3 min')}
      ${row('Sentence and particle drills', counts.sentences + counts.particles, '4 min')}
      <div class="row muted"><span class="grow">Listen and shadow</span><span class="small">Next build</span></div>
    </section>
    <section class="card">
      <div class="row"><span class="grow"><span class="num">${studied}</span> ${studied === 1 ? 'day' : 'days'} studied</span>
        <span class="week" aria-label="Last 7 days">${lastWeek(state).map((on) => `<i class="${on ? 'on' : ''}"></i>`).join('')}</span></div>
      <p class="small muted">A missed day never resets your progress.</p>
    </section>`;
  view.querySelector('#start')?.addEventListener('click', () => startRun(steps, 'Daily session', true));
}

/* ---------- Step runner ---------- */

function startRun(steps, title, useSrs) {
  run = { steps: [...steps], i: 0, title, useSrs, clean: 0, drills: 0, cards: 0 };
  document.body.classList.add('in-run');
  renderStep();
}

function endRun() {
  run = null;
  document.body.classList.remove('in-run');
  route();
}

function advance() {
  run.i++;
  renderStep();
}

function record(id, grade) {
  if (!run.useSrs) return;
  const stats = dayStats(state);
  const prev = state.items[id];
  state.items[id] = rate(prev || newRecord(), grade);
  const kind = id[0];
  if (kind === 's') stats.sentences++;
  else if (kind === 'p') stats.particles++;
  else if (prev) stats.reviews++;
  else if (kind === 'k') stats.newK++;
  else stats.newW++;
  save(state);
}

function renderStep() {
  window.scrollTo(0, 0);
  if (run.i >= run.steps.length) return renderSummary();
  const step = run.steps[run.i];
  setTop(run.title, { close: true, count: `${run.i + 1} / ${run.steps.length}`, progress: (run.i / run.steps.length) * 100 });
  view.innerHTML = '';
  const finishDrill = (clean) => {
    run.drills++;
    if (clean) run.clean++;
    record(step.id, clean ? 'good' : 'again');
    advance();
  };
  if (step.type === 'learn') return renderLearn(step);
  if (step.type === 'card') return renderCard(step);
  if (step.type === 'sentence') {
    return renderSentence(view, step.ref, { hints: state.settings.hints, onDone: finishDrill });
  }
  if (step.type === 'particle') {
    return renderParticle(view, step.ref, step.set, data.particles.cards, { onDone: finishDrill });
  }
  if (step.type === 'particleCard') {
    view.innerHTML = `${particleCardHtml(step.ref)}<button class="btn" id="next">Continue</button>`;
    view.querySelector('#next').onclick = advance;
  }
}

const list = (a) => (a.length ? a.join('、') : '—');

function kanjiFacts(k) {
  const words = k.words.map((w) => data.vocab.find((v) => v.w === w)).filter(Boolean);
  return `<dl class="facts">
      <dt>On</dt><dd class="jp">${list(k.on)}</dd>
      <dt>Kun</dt><dd class="jp">${list(k.kun)}</dd>
      <dt>Means</dt><dd>${k.mean.join(', ')}</dd>
      <dt>Strokes</dt><dd>${k.strokes} · JLPT N${k.jlpt}</dd>
    </dl>
    ${words.length ? `<div>${words.map((w) => `<div class="small"><span class="jp"><b>${w.w}</b> ${w.y}</span> · ${w.m}</div>`).join('')}</div>` : ''}`;
}

const partsHtml = (k) => k.parts.map((p) => `<div class="part">
    ${p.img ? `<img src="${p.img}" alt="${p.label}">` : `<b>${p.c}</b>`}
    <div><strong>${p.label}</strong><div class="small">${p.mn}</div></div></div>`).join('');

const wordFacts = (w) => `<dl class="facts">
    <dt>Reads</dt><dd class="jp">${w.y}</dd><dt>Means</dt><dd>${w.m}</dd></dl>`;

function renderLearn(step) {
  const isK = step.kind === 'kanji';
  const x = step.ref;
  view.innerHTML = `<div class="card">
      <span class="caps">New ${isK ? 'kanji' : 'word'}</span>
      <div class="glyph ${isK ? '' : 'word'}">${isK ? x.k : x.w}</div>
      ${isK ? kanjiFacts(x) + partsHtml(x) : wordFacts(x)}
    </div>
    <button class="btn" id="next">Got it</button>`;
  view.querySelector('#next').onclick = advance;
}

function renderCard(step) {
  const isK = step.kind === 'kanji';
  const x = step.ref;
  view.innerHTML = `<div class="card">
      <span class="caps">${step.isNew ? 'Now recall it' : 'Review'}</span>
      <div class="glyph ${isK ? '' : 'word'}">${isK ? x.k : x.w}</div>
      <p class="center muted small" id="ask">Say the reading and meaning out loud, then check.</p>
      <div id="back" hidden>${isK ? kanjiFacts(x) + partsHtml(x) : wordFacts(x)}</div>
    </div>
    <div id="act"><button class="btn" id="show">Show answer</button></div>`;
  view.querySelector('#show').onclick = () => {
    view.querySelector('#back').hidden = false;
    view.querySelector('#ask').hidden = true;
    const rec = (run.useSrs && state.items[step.id]) || newRecord();
    const act = view.querySelector('#act');
    act.className = 'rate';
    act.innerHTML = GRADES.map((g) => `<button class="${g}" data-g="${g}">
      ${g[0].toUpperCase() + g.slice(1)}<small>${label(rec, g)}</small></button>`).join('');
    act.onclick = (e) => {
      // Only rating buttons: the Show click that attached this handler bubbles here too.
      const btn = e.target.closest('[data-g]');
      if (!btn) return;
      record(step.id, btn.dataset.g);
      run.cards++;
      // "Again" comes back later in this session.
      if (btn.dataset.g === 'again') run.steps.splice(Math.min(run.i + 4, run.steps.length), 0, step);
      advance();
    };
  };
}

function renderSummary() {
  setTop(run.title, { close: true, progress: 100 });
  const drills = run.drills ? `<div class="row"><span class="grow">Drills right first time</span>
    <span class="num">${run.clean} / ${run.drills}</span></div>` : '';
  view.innerHTML = `<section class="card hero"><span class="caps">Done</span><h2>Nice work.</h2>
      <p class="muted">${run.useSrs ? 'Your next reviews are scheduled.' : 'Practice does not change your review schedule.'}</p></section>
    <section class="card list">
      <div class="row"><span class="grow">Cards rated</span><span class="num">${run.cards}</span></div>${drills}
    </section>
    <button class="btn" id="fin">Finish</button>`;
  view.querySelector('#fin').onclick = endRun;
}

/* ---------- Other tabs ---------- */

function screenPractice() {
  setTop('Practice');
  const { cards, sets } = data.particles;
  view.innerHTML = `
    <p class="small muted">Practice is free play. It doesn't change your review schedule.</p>
    <section class="card list">
      <button class="tap row" id="sent"><span class="grow"><strong>Sentence drill</strong><br><span class="small muted">${data.sentences.length} sentences, shuffled</span></span><span>›</span></button>
      <button class="tap row" id="part"><span class="grow"><strong>Particle drill</strong><br><span class="small muted">${sets.length} nouns, each in several sentences</span></span><span>›</span></button>
    </section>
    <span class="caps">Particle guides</span>
    <section class="card list" id="cards">${cards.map((c) => `<button class="tap row" data-p="${c.p}">
      <span class="pbig">${c.p}</span><span class="grow"><strong>${c.name}</strong></span><span>›</span></button>`).join('')}</section>`;
  view.querySelector('#sent').onclick = () => startRun(
    shuffled(data.sentences).map((s) => ({ type: 'sentence', id: `s:${s.id}`, ref: s })), 'Sentence drill', false,
  );
  view.querySelector('#part').onclick = () => startRun(
    sets.flatMap((set) => set.items.map((it) => ({ type: 'particle', id: `p:${it.id}`, ref: it, set }))), 'Particle drill', false,
  );
  view.querySelector('#cards').onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const card = cards.find((c) => c.p === b.dataset.p);
    const drills = sets.flatMap((set) => set.items.filter((it) => it.answer === card.p)
      .map((it) => ({ type: 'particle', id: `p:${it.id}`, ref: it, set })));
    startRun([{ type: 'particleCard', ref: card }, ...drills], card.name, false);
  };
}

function screenKanji() {
  setTop('Kanji');
  const kanjiSteps = data.kanji.map((x) => ({ type: 'learn', kind: 'kanji', id: kanjiId(x), ref: x }));
  const seenWords = data.vocab.filter((w) => state.items[wordId(w)]).length;
  view.innerHTML = `<p class="small muted">${data.kanji.filter((k) => state.items[kanjiId(k)]).length} of ${data.kanji.length} kanji started · ${seenWords} of ${data.vocab.length} words started</p>
    <div class="grid" id="grid">${data.kanji.map((k, i) => `<button class="tile ${state.items[kanjiId(k)] ? 'seen' : ''}" data-i="${i}">${k.k}</button>`).join('')}</div>`;
  view.querySelector('#grid').onclick = (e) => {
    const b = e.target.closest('.tile');
    if (b) startRun([kanjiSteps[Number(b.dataset.i)]], 'Kanji', false);
  };
}

function screenSettings() {
  setTop('Settings');
  const s = state.settings;
  const seg = (key, options) => `<div class="seg" data-key="${key}">${options.map(([v, text]) =>
    `<button class="${s[key] === v ? 'on' : ''}" data-v='${JSON.stringify(v)}'>${text}</button>`).join('')}</div>`;
  view.innerHTML = `
    <section class="card"><span class="caps">New kanji per day</span>${seg('newPerDay', [[3, '3'], [4, '4'], [5, '5']])}</section>
    <section class="card"><span class="caps">Readings on sentence blocks</span>${seg('hints', [[true, 'Show'], [false, 'Hide']])}</section>
    <section class="card"><span class="caps">Theme</span>${seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}</section>
    <section class="card"><span class="caps">About</span>
      <p class="small">Sample content, hand-written for this app. Third-party data sources will be credited here when they are added.</p></section>`;
  view.onclick = (e) => {
    const b = e.target.closest('.seg button');
    if (!b) return;
    s[b.parentElement.dataset.key] = JSON.parse(b.dataset.v);
    save(state);
    applyTheme();
    screenSettings();
  };
}

const SCREENS = { today: screenToday, practice: screenPractice, kanji: screenKanji, settings: screenSettings };

function route() {
  if (!data || run) return;
  view.onclick = null;
  const name = location.hash.replace('#/', '');
  const tab = SCREENS[name] ? name : 'today';
  tabbar.querySelectorAll('a').forEach((a) => a.classList.toggle('on', a.dataset.tab === tab));
  SCREENS[tab]();
  window.scrollTo(0, 0);
}

async function init() {
  applyTheme();
  setTop('JP Trainer');
  try {
    const get = (f) => fetch(`data/${f}.json`).then((r) => {
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r.json();
    });
    const [kanji, vocab, sentences, particles] = await Promise.all(
      ['kanji-n5', 'vocab-n5', 'sentences', 'particles'].map(get),
    );
    data = { kanji, vocab, sentences, particles };
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    view.innerHTML = `<div class="card"><h3>The study data didn't load</h3>
      <p class="small muted">${err.message}. Check your connection and reopen the app.</p></div>`;
  }
}

init();
