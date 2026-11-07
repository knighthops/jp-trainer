// Routing and screens.
import { load, save, dayStats, daysStudied, lastWeek, dayKey, backupJson, parseBackup } from './store.js';
import { renderListen } from './listen.js';
import { speak, speakLines, cancel, sayBtn, NORMAL, SLOW } from './tts.js';
import { GRADES, newRecord, rate, label } from './srs.js';
import { buildSession, kanjiId, wordId } from './session.js';
import { renderSentence, renderParticle, renderCheck, particleCardHtml, bindGloss, glossHtml, romajiLine, shuffled } from './drills.js';
import {
  UNIT_FILES, mergeCourse, isUnlocked, unitProgress, nextUp, examUnlocked, lessonSteps, words as splitWords,
  LEVELS, levelSentences, levelProgress, levelUnlocked, particleItem,
} from './course.js';
import { mockExam, unitTest, startExam } from './exam.js';
import { icons } from './icons.js';
import { romaji } from './romaji.js';
import { matchReading } from './readings.js';
import { currentUser, logOut } from './lock.js';

const view = document.getElementById('view');
const top = document.getElementById('top');
const tabbar = document.getElementById('tabbar');
const state = load();
let data = null;
let run = null;
let stepCleanup = null;
let settingsNotice = '';

const WEEKDAYS = '日月火水木金土';
const TABS = [['today', 'Today'], ['course', 'Course'], ['practice', 'Practice'], ['kanji', 'Kanji'], ['settings', 'Settings']];

const applyTheme = () => {
  const t = state.settings.theme;
  if (t === 'system') document.documentElement.removeAttribute('data-theme');
  else document.documentElement.dataset.theme = t;
};

function animate() {
  view.classList.remove('anim');
  void view.offsetWidth;
  view.classList.add('anim');
}

function setTop(title, { close = false, onClose = endRun, onPrev = null, count = '', progress = null } = {}) {
  top.innerHTML = `<div class="top-in">
      ${close ? `<button class="hbtn" id="close" aria-label="Exit">${icons.close}</button>` : '<span class="mark" aria-hidden="true">学</span>'}
      ${onPrev ? `<button class="hprev" id="hprev">${icons.back}<span>Previous</span></button>` : ''}
      <h1>${onPrev ? '' : title}</h1><span class="count">${count}</span></div>
    ${progress === null ? '' : `<div class="progress"><i style="width:${progress}%"></i></div>`}`;
  if (close) top.querySelector('#close').onclick = onClose;
  if (onPrev) top.querySelector('#hprev').onclick = onPrev;
}

/* ---------- Home ---------- */

const BACKUP_DAYS = 14;
const backupDue = () => Object.keys(state.items).length > 0
  && (!state.lastBackup || Date.now() - state.lastBackup > BACKUP_DAYS * 864e5);

function screenToday() {
  setTop('JP Trainer');
  const { steps, counts, next } = buildSession(state, data);
  const now = new Date();
  const kanjiStarted = data.kanji.filter((k) => state.items[kanjiId(k)]).length;
  const wordsStarted = data.vocab.filter((w) => state.items[wordId(w)]).length;
  const dayName = now.toLocaleDateString('en', { weekday: 'long' });
  const glyph = WEEKDAYS[now.getDay()];

  const row = (icon, name, n, mins) => `<div class="row plan"><span class="icbox">${icon}</span>
    <span class="grow"><span class="label">${name}</span><br><span class="sub">${mins}</span></span>
    <span class="pill ${n ? 'live' : ''}">${n}</span></div>`;

  view.innerHTML = `
    <section class="card hero">
      <span class="water" aria-hidden="true">${glyph}</span>
      <span class="caps">${dayName} · <span class="jp">${now.getMonth() + 1}月${now.getDate()}日 ${glyph}曜日</span></span>
      ${steps.length
        ? `<h2>Your session<br>is ready</h2><p class="sub">${steps.length} steps. Progress saves as you go.</p>
           <button class="btn" id="start">Start session</button>`
        : '<h2>All caught up</h2><p class="sub">Nothing is due. Practice if you want more.</p>'}
    </section>
    <section class="card list">
      ${row(icons.repeat, 'Reviews', counts.reviews, 'Words, kanji and sentences that are due')}
      ${row(icons.course, 'Next lesson', counts.lesson, next?.type === 'lesson' ? `Unit ${next.unit.n}: ${next.lesson.title}` : 'One a day here. Take more from Course.')}
      ${row(icons.ear, 'Listen', counts.listen, 'Hear a sentence and choose its meaning')}
    </section>
    ${next?.type === 'test' ? `<a class="nudge" href="#/course/${next.unit.id}">${icons.exam}<span class="grow">Your Unit ${next.unit.n} test is ready.</span><span class="chev">${icons.chevron}</span></a>` : ''}
    ${next?.type === 'exam' ? `<a class="nudge" href="#/course/exam">${icons.exam}<span class="grow">You've finished the units. The mock exam is open.</span><span class="chev">${icons.chevron}</span></a>` : ''}
    ${backupDue() ? `<a class="nudge" href="#/settings">${icons.download}<span class="grow">Back up your progress. Safari can clear saved data.</span><span class="chev">${icons.chevron}</span></a>` : ''}
    <div class="caps sect"><span>Last 7 days</span></div>
    <section class="card">
      <div class="week" aria-label="Days studied in the last 7 days">${lastWeek(state, now.getTime()).map((d, i) => `<div class="${d.on ? 'on' : ''} ${i === 6 ? 'now' : ''}">${WEEKDAYS[d.weekday]}</div>`).join('')}</div>
      <p class="small muted center">A missed day never resets your progress.</p>
    </section>
    <section class="card strip">
      <div><b>${daysStudied(state)}</b><span>${daysStudied(state) === 1 ? 'day' : 'days'} studied</span></div>
      <div><b>${kanjiStarted}<small> / ${data.kanji.length}</small></b><span>kanji</span></div>
      <div><b>${wordsStarted}<small> / ${data.vocab.length}</small></b><span>words</span></div>
    </section>`;
  view.querySelector('#start')?.addEventListener('click', () => startRun(steps, 'Daily session', { useSrs: true }));
}

/* ---------- Step runner ---------- */

// `more` makes a run endless: it supplies the next step when the list runs out.
function startRun(steps, title, { useSrs = false, browse = false, start = 0, more = null, onDrill = null } = {}) {
  run = { steps: [...steps], i: start, title, useSrs, browse, more, onDrill, clean: 0, drills: 0, cards: 0 };
  document.body.classList.add('in-run');
  renderStep();
}

function closeRun() {
  if (run?.more && run.drills) {
    run.more = null;
    run.i = run.steps.length;
    renderStep();
  } else endRun();
}

function goPrevious() {
  let i = run.i - 1;
  while (i > 0 && run.steps[i].type === 'lessonEnd') i--;
  run.i = Math.max(0, i);
  renderStep();
}

function clearStep() {
  stepCleanup?.();
  stepCleanup = null;
  cancel();
}

function endRun() {
  clearStep();
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
  clearStep();
  window.scrollTo(0, 0);
  if (run.i >= run.steps.length && run.more) run.steps.push(run.more());
  if (run.i >= run.steps.length) {
    // Browsing has nothing to summarize, so it just closes.
    if (run.browse) return endRun();
    return renderSummary();
  }
  const step = run.steps[run.i];
  // Finishing a lesson has no screen of its own.
  if (step.type === 'lessonEnd') {
    if (!step.done) {
      step.done = true;
      if (!state.course.done[step.id]) dayStats(state).lessons = (dayStats(state).lessons || 0) + 1;
      state.course.done[step.id] = Date.now();
      save(state);
    }
    return advance();
  }
  setTop(run.title, {
    close: true,
    onClose: closeRun,
    onPrev: run.i > 0 ? goPrevious : null,
    count: run.more ? `${run.clean} / ${run.drills} right` : `${run.i + 1} / ${run.steps.length}`,
    progress: run.more ? null : (run.i / run.steps.length) * 100,
  });
  view.innerHTML = '';
  // Steps reached with Previous show the answer and don't count again.
  const review = Boolean(step.done);
  const finishDrill = (clean) => {
    if (!step.done) {
      step.done = true;
      run.drills++;
      if (clean) run.clean++;
      record(step.id, clean ? 'good' : 'again');
      run.onDrill?.(step, clean);
    }
    advance();
  };
  if (step.type === 'learn') renderLearn(step);
  else if (step.type === 'card') renderCard(step);
  else if (step.type === 'lesson') renderLesson(step);
  else if (step.type === 'dialogue') renderDialogue(step);
  else if (step.type === 'sentence') renderSentence(view, step.ref, { hints: state.settings.hints, review, onDone: finishDrill });
  else if (step.type === 'particle') renderParticle(view, step.ref, step.set, data.particles.cards, { glossary: data.glossary, review, onDone: finishDrill });
  else if (step.type === 'check') {
    renderCheck(view, step.ref, {
      glossary: data.glossary,
      review,
      onDone: (clean) => {
        if (!step.done) {
          step.done = true;
          run.drills++;
          if (clean) run.clean++;
          if (step.missed && clean) {
            delete state.course.missed[step.id];
            save(state);
          }
        }
        advance();
      },
    });
  } else if (step.type === 'listen') {
    renderListen(view, step.ref, {
      glossary: data.glossary,
      others: data.sentences.map((s) => s.en),
      review,
      onDone: () => {
        if (run.useSrs && !step.done) {
          dayStats(state).shadow = (dayStats(state).shadow || 0) + 1;
          state.shadow[step.id] = Date.now();
          save(state);
        }
        step.done = true;
        advance();
      },
    });
  } else if (step.type === 'particleCard') {
    view.innerHTML = `${particleCardHtml(step.ref, data.glossary)}<div class="dock"><button class="btn" id="next">Continue</button></div>`;
    bindGloss(view.querySelector('.gloss-zone'), data.glossary);
    view.querySelector('#next').onclick = advance;
  }
  animate();
}

const readingLines = (a) => (a.length
  ? a.map((r) => `<span class="rline"><span class="jp">${r}</span><span class="ro">${romaji(r)}</span></span>`).join('')
  : '<span class="muted">—</span>');

const glyphHtml = (step) => (step.kind === 'kanji'
  ? `<div class="genko">${step.ref.k}</div>`
  : `<div class="wordglyph">${step.ref.w}</div>`);

// One example word, with the part of its kana that this kanji reads marked.
function wordRow(k, w) {
  const hit = matchReading(k, w, w.y);
  const kana = hit
    ? `${w.y.slice(0, hit.start)}<mark>${w.y.slice(hit.start, hit.start + hit.length)}</mark>${w.y.slice(hit.start + hit.length)}`
    : w.y;
  const chip = hit
    ? `<span class="rt ${hit.type}">${hit.type === 'on' ? 'On' : 'Kun'} · ${romaji(hit.reading)}</span>`
    : '<span class="rt">Special reading</span>';
  return `<div class="wrow big">
      <span class="wl"><span class="wtop"><b>${w.w}</b><span class="y">${kana}</span></span>
        <span class="ro">${romaji(w.y)} · ${w.m}</span>${chip}</span>
      ${sayBtn(w.y)}</div>`;
}

function kanjiFacts(k) {
  const words = k.words.map((w) => data.vocab.find((v) => v.w === w)).filter(Boolean);
  return `<div>
      <p class="mean">${k.mean.join(', ')}</p>
      <p class="meta">${k.strokes} ${k.strokes === 1 ? 'stroke' : 'strokes'}</p>
    </div>
    ${words.length ? `<div class="block-sec"><span class="caps">In words</span>${words.map((w) => wordRow(k, w)).join('')}</div>` : ''}
    <div class="block-sec">
      <div class="sechead"><span class="caps">All readings</span>
        <button class="info" data-info aria-label="What are On and Kun?" aria-expanded="false">${icons.info}</button></div>
      <p class="explain small" hidden><b>On</b> comes from Chinese and mostly appears in compounds, like 学生. <b>Kun</b> is native Japanese, mostly used alone or before hiragana, like 山 or 食べる.</p>
      <div class="reads">
        <div class="read"><span class="caps">On</span>${readingLines(k.on)}</div>
        <div class="read"><span class="caps">Kun</span>${readingLines(k.kun)}</div>
      </div>
    </div>
    <div class="block-sec"><span class="caps">Breakdown</span>${k.parts.map((p) => `<div class="part">
      ${p.img ? `<img src="${p.img}" alt="${p.label}">` : `<span class="pg">${p.c}</span>`}
      <div><strong>${p.label}</strong><div class="small">${p.mn}</div></div></div>`).join('')}</div>`;
}

const wordFacts = (w) => `<div>
    <p class="mean">${w.m}</p>
    <p class="meta jp" style="font-size:18px">${w.y}</p>
    <p class="meta">${romaji(w.y)}</p>
    <div class="center">${sayBtn(w.y)}</div>
  </div>`;

const factsHtml = (step) => (step.kind === 'kanji' ? kanjiFacts(step.ref) : wordFacts(step.ref));

const headHtml = (title, step) => `<div class="study-head"><span class="caps">${title}</span>
  ${step.kind === 'kanji' ? `<span class="tag">N${step.ref.jlpt}</span>` : '<span class="tag">Word</span>'}</div>`;

function renderLearn(step) {
  const title = run.browse ? 'Kanji' : `New ${step.kind === 'kanji' ? 'kanji' : 'word'}`;
  const last = run.i === run.steps.length - 1;
  view.innerHTML = `<div class="card study">
      ${headHtml(title, step)}${glyphHtml(step)}${factsHtml(step)}
    </div>
    <div class="dock"><button class="btn" id="next">${run.browse ? (last ? 'Done' : 'Next') : 'Got it'}</button></div>`;
  view.querySelector('#next').onclick = advance;
}

function renderCard(step) {
  view.innerHTML = `<div class="card study" id="studycard">
      ${headHtml(step.isNew ? 'Now recall it' : 'Review', step)}${glyphHtml(step)}
      <p class="ask" id="ask">Recall the reading and meaning, then check.</p>
      <div class="back" id="back" hidden>${factsHtml(step)}</div>
    </div>
    <div class="dock" id="act"><button class="btn" id="show">Show answer</button></div>`;
  // Already rated in this run: show the answer without rating it again.
  if (step.done) {
    view.querySelector('#back').hidden = false;
    view.querySelector('#ask').hidden = true;
    view.querySelector('#studycard').classList.add('revealed');
    view.querySelector('#act').innerHTML = `<button class="btn" id="next">Next</button>`;
    view.querySelector('#next').onclick = advance;
    return;
  }
  view.querySelector('#show').onclick = () => {
    view.querySelector('#back').hidden = false;
    view.querySelector('#ask').hidden = true;
    view.querySelector('#studycard').classList.add('revealed');
    const rec = (run.useSrs && state.items[step.id]) || newRecord();
    const act = view.querySelector('#act');
    act.innerHTML = `<div class="rate">${GRADES.map((g) => `<button class="${g}" data-g="${g}">
      ${g[0].toUpperCase() + g.slice(1)}<small>${label(rec, g)}</small></button>`).join('')}</div>`;
    act.onclick = (e) => {
      // Only rating buttons: the Show click that attached this handler bubbles here too.
      const btn = e.target.closest('[data-g]');
      if (!btn) return;
      record(step.id, btn.dataset.g);
      run.cards++;
      step.done = true;
      // "Again" comes back later in this session.
      if (btn.dataset.g === 'again') run.steps.splice(Math.min(run.i + 4, run.steps.length), 0, { ...step, done: false });
      advance();
    };
  };
}

// A row of tappable words, for text written as "word word word".
const wordLine = (text) => splitWords(text).map((w) => (data.glossary[w]
  ? `<button class="word" data-word="${w}">${w}</button>` : `<span>${w}</span>`)).join('');
const lineRomaji = (text) => romajiLine(splitWords(text), data.glossary);

function renderLesson(step) {
  const l = step.ref;
  view.innerHTML = `<div class="card gloss-zone lesson">
      <span class="caps">Unit ${step.unit.n} · ${step.unit.title}</span>
      <h3>${l.title}</h3>
      ${l.pattern ? `<div class="pattern jp">${l.pattern}</div>` : ''}
      ${l.note.map((p) => `<p>${p}</p>`).join('')}
      <div class="block-sec"><span class="caps">Examples</span>${l.examples.map((e) => `<div class="example">
        <div class="stem jp">${wordLine(e.t)}</div>
        <p class="romaji">${lineRomaji(e.t)} ${sayBtn(e.t.replace(/\s+/g, ''))}</p>
        <p class="small muted">${e.en}</p></div>`).join('')}</div>
      ${glossHtml()}
    </div>
    <div class="dock"><button class="btn" id="next">Continue</button></div>`;
  bindGloss(view.querySelector('.gloss-zone'), data.glossary);
  view.querySelector('#next').onclick = advance;
}

function renderDialogue(step) {
  const d = step.ref;
  let rate = NORMAL;
  view.innerHTML = `<div class="card gloss-zone">
      <span class="caps">Dialogue</span>
      <h3>${d.title}</h3>
      <p class="small muted">Listen first and see how much you catch. Then read along.</p>
      <button class="btn ghost" id="play">${icons.speaker}<span>Play conversation</span></button>
      <div class="seg mini" id="speed"><button class="on" data-r="${NORMAL}">Normal</button><button data-r="${SLOW}">Slow</button></div>
      <button class="btn ghost" id="show">Show the words</button>
      <div id="lines" hidden>${d.lines.map((l) => `<div class="dline"><span class="who">${l.s}</span><div class="grow">
        <div class="stem jp">${wordLine(l.t)}</div>
        <p class="romaji">${lineRomaji(l.t)}</p><p class="small muted">${l.en}</p></div></div>`).join('')}
        ${glossHtml()}</div>
    </div>
    <div class="dock"><button class="btn" id="next">Continue</button></div>`;
  bindGloss(view.querySelector('.gloss-zone'), data.glossary);
  view.querySelector('#play').onclick = () => speakLines(d.lines, { rate });
  view.querySelector('#speed').onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rate = Number(b.dataset.r);
    view.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
  };
  view.querySelector('#show').onclick = (e) => {
    view.querySelector('#lines').hidden = false;
    e.currentTarget.hidden = true;
  };
  view.querySelector('#next').onclick = advance;
}

function renderSummary() {
  setTop(run.title, { close: true, progress: 100 });
  const C = 2 * Math.PI * 46;
  const share = run.drills ? run.clean / run.drills : 1;
  const inner = run.drills ? `${Math.round(share * 100)}%` : icons.check;
  const drills = run.drills ? `<div class="row"><span class="grow">Drills right first time</span>
    <span class="num">${run.clean} / ${run.drills}</span></div>` : '';
  const cards = run.cards ? `<div class="row"><span class="grow">Cards rated</span><span class="num">${run.cards}</span></div>` : '';
  view.innerHTML = `<section class="card hero done-hero">
      <div class="ring"><svg viewBox="0 0 108 108" aria-hidden="true">
        <circle class="tr" cx="54" cy="54" r="46"/>
        <circle class="fg" id="ringfg" cx="54" cy="54" r="46" stroke-dasharray="${C}" stroke-dashoffset="${C}"/>
      </svg><div>${inner}</div></div>
      <h2>${share >= 0.8 ? 'Nice work' : 'Good effort'}</h2>
      <p class="sub">${run.useSrs ? 'Your next reviews are scheduled.' : 'Practice does not change your review schedule.'}</p>
    </section>
    ${cards || drills ? `<section class="card list">${cards}${drills}</section>` : ''}
    <div class="dock"><button class="btn" id="fin">Finish</button></div>`;
  view.querySelector('#fin').onclick = endRun;
  animate();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fg = view.querySelector('#ringfg');
    if (fg) fg.style.strokeDashoffset = C * (1 - share);
  }));
}

/* ---------- Other tabs ---------- */

function screenPractice() {
  setTop('Practice');
  const { cards, sets } = data.particles;
  const action = (id, icon, name, sub) => `<button class="action" id="${id}"><span class="icbox">${icon}</span>
    <span class="grow"><strong>${name}</strong><span class="small">${sub}</span></span><span class="chev">${icons.chevron}</span></button>`;
  view.innerHTML = `
    ${action('sent', icons.blocks, 'Sentence drill', `${LEVELS.length} levels, from short to long`)}
    ${action('part', icons.practice, 'Particle drill', 'Unlimited, with focus on what you miss')}
    ${action('lis', icons.ear, 'Listen', 'Hear a sentence and choose its meaning')}
    <p class="small muted center">Free practice doesn't change your review schedule.</p>
    <div class="caps sect"><span>Particle guides</span></div>
    <section class="pgrid" id="cards">${cards.map((c) => `<button class="ptile" data-p="${c.p}">
      <b>${c.p}</b><small>${c.name}</small></button>`).join('')}</section>`;
  view.querySelector('#sent').onclick = () => { location.hash = '#/practice/sentences'; };
  view.querySelector('#part').onclick = () => { location.hash = '#/practice/particles'; };
  view.querySelector('#lis').onclick = () => startRun(
    shuffled(data.sentences).map((s) => ({ type: 'listen', id: s.id, ref: s })), 'Listen',
  );
  view.querySelector('#cards').onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const card = cards.find((c) => c.p === b.dataset.p);
    const guided = sets.flatMap((set) => set.items.filter((it) => it.answer === card.p)
      .map((it) => ({ type: 'particle', id: `p:${it.id}`, ref: it, set })));
    startParticles(card.name, { focus: card.p }, [{ type: 'particleCard', ref: card }, ...guided]);
  };
}

const backTo = (hash) => ({ close: true, onClose: () => { location.hash = hash; } });

function screenSentenceLevels() {
  setTop('Sentence drill', backTo('#/practice'));
  view.innerHTML = `
    <p class="small muted">Build a sentence right the first time to clear it. Clear 80% of a level to open the next.</p>
    ${LEVELS.map((level) => {
    const open = levelUnlocked(level, state, data);
    const p = levelProgress(level, state, data);
    const empty = !p.total;
    return `<button class="action level" data-n="${level.n}" ${open && !empty ? '' : 'disabled'}>
        <span class="icbox">${open ? level.n : icons.lock}</span>
        <span class="grow"><strong>${level.title}</strong><span class="small">${empty && open ? 'Finish a course lesson to fill this level' : level.sub}</span>
          <span class="meter"><i style="width:${p.share * 100}%"></i></span></span>
        <span class="small muted num">${p.done}/${p.total}</span></button>`;
  }).join('')}`;
  view.onclick = (e) => {
    const b = e.target.closest('.level');
    if (!b || b.disabled) return;
    const level = LEVELS[Number(b.dataset.n) - 1];
    const list = levelSentences(level, state, data);
    const order = [...shuffled(list.filter((s) => !state.practice.sent[s.id])), ...shuffled(list.filter((s) => state.practice.sent[s.id]))];
    startRun(order.map((s) => ({ type: 'sentence', id: `s:${s.id}`, ref: s })), `Level ${level.n}`, {
      onDrill: (step, clean) => {
        if (clean) {
          state.practice.sent[step.ref.id] = 1;
          save(state);
        }
      },
    });
  };
}

function startParticles(title, choice, lead = []) {
  const stats = state.practice.part;
  const nextItem = () => ({ type: 'particle', id: 'free', ref: particleItem(data.bank, { ...choice, stats }), set: {} });
  startRun(lead, title, {
    more: nextItem,
    onDrill: (step, clean) => {
      const s = (stats[step.ref.id] ||= { seen: 0, miss: 0 });
      s.seen++;
      if (clean) s.miss = Math.max(0, s.miss - 1);
      else s.miss++;
      save(state);
    },
  });
}

const PAIRS = [['は', 'が'], ['に', 'で'], ['を', 'が'], ['と', 'も'], ['から', 'まで'], ['か', 'ね']];

function screenParticleChoice() {
  setTop('Particle drill', backTo('#/practice'));
  const { cards } = data.particles;
  const usable = PAIRS.filter((pair) => data.bank.frames.some((f) => pair.includes(f.a) && f.w[pair.find((p) => p !== f.a)]));
  const seen = Object.values(state.practice.part).reduce((n, s) => n + s.seen, 0);
  view.innerHTML = `
    <section class="card hero">
      <span class="caps">Unlimited</span>
      <h2>All particles</h2>
      <p class="sub">New sentences every time, for as long as you like. What you miss comes back more often. Press X to stop.</p>
      <button class="btn" id="all">Start</button>
    </section>
    <p class="small muted center">${seen} answered so far</p>
    <div class="caps sect"><span>Tell two apart</span></div>
    <section class="pgrid" id="pairs">${usable.map((pair) => `<button class="ptile short" data-pair="${pair.join(',')}"><b>${pair.join(' ')}</b><small>Compare</small></button>`).join('')}</section>
    <div class="caps sect"><span>One particle</span></div>
    <section class="pgrid" id="one">${cards.map((c) => `<button class="ptile short" data-p="${c.p}"><b>${c.p}</b><small>${c.name}</small></button>`).join('')}</section>`;
  view.querySelector('#all').onclick = () => startParticles('Particle drill', {});
  view.querySelector('#pairs').onclick = (e) => {
    const b = e.target.closest('[data-pair]');
    if (b) startParticles('Particle drill', { pair: b.dataset.pair.split(',') });
  };
  view.querySelector('#one').onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (b) startParticles('Particle drill', { focus: b.dataset.p });
  };
}

/* ---------- Course ---------- */

function screenCourse() {
  setTop('Course');
  const units = data.units;
  const next = nextUp(state, units);
  const passed = units.filter((u) => state.course.passed[u.id]).length;
  const nextLabel = next?.type === 'lesson' ? next.lesson.title
    : next?.type === 'test' ? 'Unit test' : next?.type === 'exam' ? 'Mock exam' : '';
  view.innerHTML = `
    <section class="card hero">
      <span class="caps">${next?.unit ? `Unit ${next.unit.n} · ` : ''}${passed} of ${units.length} units passed</span>
      <h2>${nextLabel || 'Course'}</h2>
      <div class="meter"><i style="width:${units.length ? (passed / units.length) * 100 : 0}%"></i></div>
      ${next ? '<button class="btn" id="go">Continue</button>' : ''}
    </section>
    <section class="card list">${units.map((u) => {
    const p = unitProgress(state, u);
    const open = isUnlocked(state, units, u);
    return `<a class="row unit ${open ? '' : 'off'}" href="#/course/${u.id}">
        <span class="unum ${p.passed ? 'on' : ''}">${p.passed ? icons.check : open ? u.n : icons.lock}</span>
        <span class="grow"><span class="label">${u.title}</span><br><span class="small muted">${u.goal}</span></span>
        <span class="chev">${icons.chevron}</span></a>`;
  }).join('')}
      <a class="row unit ${examUnlocked(state, units) ? '' : 'off'}" href="#/course/exam">
        <span class="unum">${examUnlocked(state, units) ? icons.exam : icons.lock}</span>
        <span class="grow"><span class="label">Mock exam</span><br><span class="small muted">The full JLPT N5 format, timed and scored</span></span>
        <span class="chev">${icons.chevron}</span></a>
    </section>`;
  view.querySelector('#go')?.addEventListener('click', () => {
    if (next.type === 'lesson') startLesson(next.unit, next.lesson);
    else if (next.type === 'test') runUnitTest(next.unit);
    else location.hash = '#/course/exam';
  });
}

function startLesson(unit, lesson) {
  startRun(lessonSteps(unit, lesson, state, data), lesson.title, { useSrs: true });
}

const examContext = () => ({
  view,
  setTop,
  glossary: data.glossary,
  persist: (current) => {
    state.exams.current = current;
    save(state);
  },
  onExit: () => {
    document.body.classList.remove('in-run');
    route();
  },
});

function runUnitTest(unit) {
  document.body.classList.add('in-run');
  startExam({
    ...examContext(),
    persist: () => {},
    onResult: (result, exam, answers) => {
      if (result.pass) state.course.passed[unit.id] = Date.now();
      for (const q of exam.sections[0].questions) {
        if (answers[q.id] === q.a) continue;
        // Missed words go back to reviews, and missed grammar comes back in the next session.
        if (q.word) {
          const id = `w:${q.word}`;
          state.items[id] = rate(state.items[id] || newRecord(), 'again');
        } else {
          state.course.missed[q.id] = { id: q.id, q: q.q, w: q.w, o: [q.o[q.a], ...q.o.filter((_, i) => i !== q.a)] };
        }
      }
      save(state);
    },
  }, unitTest(unit, data));
}

function screenUnit(id) {
  const unit = data.units.find((u) => u.id === id);
  if (!unit) { location.hash = '#/course'; return; }
  setTop(`Unit ${unit.n}`, backTo('#/course'));
  const open = isUnlocked(state, data.units, unit);
  const p = unitProgress(state, unit);
  const ready = p.done === p.total;
  view.innerHTML = `
    <section class="card">
      <span class="caps">Unit ${unit.n}</span>
      <h3>${unit.title}</h3>
      <p class="small">By the end, you can: ${unit.goal.toLowerCase()}.</p>
      ${open ? '' : '<p class="small muted">This unit is locked. If you already know the material, pass this unit\'s test to skip ahead to it.</p>'}
    </section>
    <section class="card list">${unit.lessons.map((l, i) => `<button class="row tap lessonrow" data-i="${i}" ${open ? '' : 'disabled'}>
        <span class="unum ${state.course.done[l.id] ? 'on' : ''}">${state.course.done[l.id] ? icons.check : i + 1}</span>
        <span class="grow"><span class="label">${l.title}</span></span><span class="chev">${icons.chevron}</span></button>`).join('')}
    </section>
    ${p.passed ? '<p class="small muted center">You passed this unit. You can retake the test any time.</p>' : ''}
    <button class="btn ${ready || !open ? '' : 'ghost'}" id="test">${p.passed ? 'Retake the unit test' : open && !ready ? 'Take the test early' : 'Take the unit test'}</button>`;
  view.onclick = (e) => {
    const b = e.target.closest('.lessonrow');
    if (b && !b.disabled) startLesson(unit, unit.lessons[Number(b.dataset.i)]);
  };
  view.querySelector('#test').onclick = () => runUnitTest(unit);
}

function runMock(paper, mode, resume = null) {
  document.body.classList.add('in-run');
  startExam({
    ...examContext(),
    onResult: (r, exam, answers, m) => {
      state.exams.history.push({ id: paper.id, mode: m, at: Date.now(), total: r.total, language: r.language, listening: r.listening, pass: r.pass });
      save(state);
    },
  }, mockExam(paper), { mode, resume });
}

function screenExam() {
  setTop('Mock exam', backTo('#/course'));
  const open = examUnlocked(state, data.units);
  const current = state.exams.current;
  const resumable = current && data.papers.find((p) => p.id === current.key);
  const history = state.exams.history.slice(-5).reverse();
  view.innerHTML = `
    <section class="card">
      <span class="caps">JLPT N5 format</span>
      <h3>Three sections, about 90 minutes</h3>
      <div class="row"><span class="grow small">Vocabulary</span><span class="num small">20 min</span></div>
      <div class="row"><span class="grow small">Grammar and reading</span><span class="num small">40 min</span></div>
      <div class="row"><span class="grow small">Listening</span><span class="num small">30 min</span></div>
      <p class="small muted">Scored out of 180. To pass, the real test needs 80 overall, with at least 38 in vocabulary, grammar and reading and 19 in listening.</p>
      <p class="small muted">These are original questions in the official format, not real exam papers. Audio uses your device's voice, and the score is an estimate.</p>
    </section>
    ${open ? '' : '<p class="fb info">Pass the final unit to open the mock exam. You can test out of units to get there sooner.</p>'}
    ${resumable ? `<button class="btn" id="resume">Resume ${resumable.title}</button>` : ''}
    ${data.papers.map((p) => `<section class="card">
      <h3>${p.title}</h3>
      <button class="btn" data-paper="${p.id}" data-mode="exam" ${open ? '' : 'disabled'}>Exam mode</button>
      <button class="btn ghost" data-paper="${p.id}" data-mode="practice" ${open ? '' : 'disabled'}>Practice mode</button>
      <p class="small muted">Exam mode is timed with no help. Practice mode has no clock, and adds romaji, tappable words and replays.</p>
    </section>`).join('')}
    ${history.length ? `<div class="caps sect"><span>Past attempts</span></div><section class="card list">${history.map((h) => `<div class="row"><span class="grow small">${new Date(h.at).toLocaleDateString()} · ${h.mode === 'exam' ? 'Exam' : 'Practice'}</span><span class="num small">${h.total} / 180 ${h.pass ? '✓' : ''}</span></div>`).join('')}</section>` : ''}`;
  view.querySelector('#resume')?.addEventListener('click', () => runMock(resumable, current.mode, current));
  view.onclick = (e) => {
    const b = e.target.closest('[data-paper]');
    if (b && !b.disabled) runMock(data.papers.find((p) => p.id === b.dataset.paper), b.dataset.mode);
  };
}

function screenKanji() {
  setTop('Kanji');
  const started = data.kanji.filter((k) => state.items[kanjiId(k)]).length;
  const steps = data.kanji.map((x) => ({ type: 'learn', kind: 'kanji', id: kanjiId(x), ref: x }));
  // The bar under a tile grows as its review interval approaches three weeks.
  const strength = (k) => {
    const rec = state.items[kanjiId(k)];
    return rec ? Math.max(12, Math.min(100, (rec.interval / 21) * 100)) : 0;
  };
  view.innerHTML = `
    <section class="card">
      <div class="row" style="min-height:0"><span class="grow"><strong>JLPT N5</strong></span>
        <span class="small muted"><span class="num">${started}</span> of ${data.kanji.length} started</span></div>
      <div class="meter"><i style="width:${(started / data.kanji.length) * 100}%"></i></div>
    </section>
    <div class="grid" id="grid">${data.kanji.map((k, i) => `<button class="tile" data-i="${i}">
      <b>${k.k}</b><small>${k.mean[0]}</small>${strength(k) ? `<i style="width:${strength(k)}%"></i>` : ''}</button>`).join('')}</div>
    <p class="small muted center">The green bar grows as a kanji gets stronger.</p>`;
  view.querySelector('#grid').onclick = (e) => {
    const b = e.target.closest('.tile');
    if (b) startRun(steps, 'Kanji', { browse: true, start: Number(b.dataset.i) });
  };
}

function screenSettings() {
  setTop('Settings');
  const s = state.settings;
  const seg = (key, options) => `<div class="seg" data-key="${key}">${options.map(([v, text]) =>
    `<button class="${s[key] === v ? 'on' : ''}" data-v='${JSON.stringify(v)}'>${text}</button>`).join('')}</div>`;
  view.innerHTML = `
    <div class="caps sect"><span>Study</span></div>
    <section class="card">
      <strong>Readings on sentence blocks</strong>${seg('hints', [[true, 'Show'], [false, 'Hide']])}
    </section>
    <div class="caps sect"><span>Appearance</span></div>
    <section class="card"><strong>Theme</strong>${seg('theme', [['system', 'System'], ['light', 'Light'], ['dark', 'Dark']])}</section>
    <div class="caps sect"><span>Backup</span></div>
    <section class="card">
      <p class="small muted">Progress lives only on this device, and Safari can clear it. Last backup: <strong>${state.lastBackup ? new Date(state.lastBackup).toLocaleDateString() : 'never'}</strong>.</p>
      <div class="pair">
        <button class="btn ghost" id="export">${icons.download}<span>Export</span></button>
        <button class="btn ghost" id="import">${icons.upload}<span>Import</span></button>
      </div>
      <input type="file" id="file" hidden>
      <div id="confirm"></div>
      ${settingsNotice ? `<div class="fb ${settingsNotice.startsWith('!') ? 'bad' : 'good'}" role="status">${settingsNotice.replace(/^!/, '')}</div>` : ''}
    </section>
    <div class="caps sect"><span>Account</span></div>
    <section class="card">
      <p class="small muted">Signed in as <strong>${currentUser()}</strong>. Logging out keeps your progress on this device.</p>
      <button class="btn ghost" id="logout">Log out</button>
    </section>
    <div class="caps sect"><span>About</span></div>
    <section class="card">
      <p class="small">Content is hand-written for this app. Audio uses your device's Japanese voice. Third-party data sources will be credited here when they are added.</p></section>`;
  settingsNotice = '';
  view.querySelector('#logout').onclick = logOut;
  view.querySelector('#export').onclick = exportBackup;
  view.querySelector('#import').onclick = () => view.querySelector('#file').click();
  view.querySelector('#file').onchange = (e) => importBackup(e.target.files[0]);
  view.onclick = (e) => {
    const b = e.target.closest('.seg button');
    if (!b) return;
    s[b.parentElement.dataset.key] = JSON.parse(b.dataset.v);
    save(state);
    applyTheme();
    screenSettings();
  };
}

async function exportBackup() {
  const now = Date.now();
  const name = `jp-trainer-backup-${dayKey(now)}.json`;
  const json = backupJson({ ...state, lastBackup: now }, now);
  const file = new File([json], name, { type: 'application/json' });
  let shared = false;
  if (navigator.canShare?.({ files: [file] })) {
    try {
      await navigator.share({ files: [file] });
      shared = true;
    } catch (err) {
      if (err.name === 'AbortError') return; // The user closed the share sheet.
    }
  }
  if (!shared) {
    const a = document.createElement('a');
    a.href = URL.createObjectURL(file);
    a.download = name;
    a.click();
    setTimeout(() => URL.revokeObjectURL(a.href), 10000);
  }
  state.lastBackup = now;
  save(state);
  settingsNotice = 'Backup exported. Keep the file somewhere safe, such as iCloud Drive.';
  screenSettings();
}

async function importBackup(file) {
  if (!file) return;
  let parsed;
  try {
    parsed = parseBackup(await file.text());
  } catch (err) {
    settingsNotice = `!${err.message}`;
    screenSettings();
    return;
  }
  const when = parsed.exportedAt ? new Date(parsed.exportedAt).toLocaleDateString() : 'an unknown date';
  const box = view.querySelector('#confirm');
  box.innerHTML = `<div class="fb info">Replace this device's progress with the backup from ${when}? It has ${Object.keys(parsed.state.items).length} study items. This can't be undone.</div>
    <div class="pair" style="margin-top:8px">
      <button class="btn ghost" id="nokeep">Cancel</button>
      <button class="btn danger" id="yesreplace">Replace</button>
    </div>`;
  box.querySelector('#nokeep').onclick = () => { screenSettings(); };
  box.querySelector('#yesreplace').onclick = () => {
    Object.assign(state, parsed.state);
    save(state);
    applyTheme();
    settingsNotice = 'Progress restored from the backup.';
    screenSettings();
  };
}

const SCREENS = {
  today: screenToday,
  course: screenCourse,
  'course/exam': screenExam,
  practice: screenPractice,
  'practice/sentences': screenSentenceLevels,
  'practice/particles': screenParticleChoice,
  kanji: screenKanji,
  settings: screenSettings,
};

function route() {
  if (!data || run) return;
  view.onclick = null;
  const name = location.hash.replace('#/', '');
  const unitId = /^course\/(u\d+)$/.exec(name)?.[1];
  const screen = unitId ? () => screenUnit(unitId) : SCREENS[name] || screenToday;
  const tab = SCREENS[name] || unitId ? name.split('/')[0] : 'today';
  tabbar.querySelectorAll('a').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  screen();
  animate();
  window.scrollTo(0, 0);
}

async function init() {
  applyTheme();
  // Any listen button, on any screen.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-say]');
    if (el) speak(el.dataset.say);
    const info = e.target.closest('[data-info]');
    if (info) {
      const text = info.closest('.block-sec').querySelector('.explain');
      text.hidden = !text.hidden;
      info.setAttribute('aria-expanded', String(!text.hidden));
    }
  });
  setTop('JP Trainer');
  tabbar.innerHTML = TABS.map(([id, text]) => `<a href="#/${id}" data-tab="${id}">${icons[id]}<span>${text}</span></a>`).join('');
  try {
    // Data files carry the same release tag that index.html gave this module.
    const tag = new URL(import.meta.url).search;
    const get = (f) => fetch(`data/${f}.json${tag}`).then((r) => {
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r.json();
    });
    const [kanji, vocab, sentences, particles, glossary, bank, ...rest] = await Promise.all([
      ...['kanji-n5', 'vocab-n5', 'sentences', 'particles', 'glossary', 'particle-bank'].map(get),
      ...UNIT_FILES.map((f) => get(`course/${f}`).catch(() => [])),
      ...['exam-n5-1', 'exam-n5-2'].map((f) => get(`course/${f}`).catch(() => null)),
    ]);
    const papers = rest.slice(UNIT_FILES.length).filter(Boolean);
    data = mergeCourse({ kanji, vocab, sentences, particles, glossary, bank, papers }, rest.slice(0, UNIT_FILES.length));
    for (const [w, [y, m]] of Object.entries(bank.lex)) if (!glossary[w]) glossary[w] = { y, m, ro: romaji(y) };
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    view.innerHTML = `<div class="card"><h3>The study data didn't load</h3>
      <p class="small muted">${err.message}. Check your connection and reopen the app.</p></div>`;
  }
}

init();
