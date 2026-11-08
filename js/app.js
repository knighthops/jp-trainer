// Routing and screens.
import { load, save, dayStats, daysStudied, dayKey, backupJson, parseBackup } from './store.js';
import { renderListen } from './listen.js';
import { speak, speakLines, cancel, sayBtn, setReadings, NORMAL, SLOW } from './tts.js';
import { GRADES, newRecord, rate, label, STAGES, stageOf, STRONG } from './srs.js';
import { reviewSteps, kanjiId } from './session.js';
import { renderSentence, renderParticle, renderCheck, particleCardHtml, bindGloss, glossHtml, romajiLine, shuffled } from './drills.js';
import {
  UNIT_FILES, mergeCourse, isUnlocked, unitProgress, nextUp, examUnlocked, lessonSteps, words as splitWords,
  LEVELS, levelSentences, levelProgress, levelUnlocked, particleItem, courseSteps, rankOf, unitStrength, unitStars, grammarId,
} from './course.js';
import { mockExam, unitTest, startExam } from './exam.js';
import { icons } from './icons.js';
import { romaji, toHiragana, toKana, judgeReading } from './romaji.js';
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

const TABS = [['today', 'Today'], ['course', 'Course'], ['practice', 'Practice'], ['talk', 'Talk'], ['settings', 'Settings']];

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
// Only once there is a week of study worth losing.
const backupDue = () => daysStudied(state) >= 7
  && (!state.lastBackup || Date.now() - state.lastBackup > BACKUP_DAYS * 864e5);

/* ---------- Home ---------- */

const DAY_MS = 864e5;
const localDay = (t = Date.now()) => Math.floor((t - new Date(t).getTimezoneOffset() * 6e4) / DAY_MS);
const activity = (d) => (d ? Object.values(d).reduce((n, v) => n + (Number.isFinite(v) ? v : 0), 0) : 0);

// The day's kanji comes from the unit you're on, or the nearest earlier unit that teaches some.
function featuredKanji() {
  const units = data.units || [];
  const next = nextUp(state, units);
  let i = next?.unit ? units.indexOf(next.unit) : units.length - 1;
  let pool = [];
  for (; i >= 0 && !pool.length; i--) pool = units[i].lessons.flatMap((l) => l.kanji || []);
  const list = pool.map((c) => data.kanji.find((k) => k.k === c)).filter(Boolean);
  const from = list.length ? list : data.kanji;
  return from[localDay() % from.length];
}

// Consecutive days with any study, counting back from today (or yesterday, if today is still open).
function streak(now = Date.now()) {
  let n = 0;
  let t = now;
  if (!activity(state.days[dayKey(t)])) t -= DAY_MS;
  while (activity(state.days[dayKey(t)])) { n++; t -= DAY_MS; }
  return n;
}

function ringSvg(share) {
  const pct = Math.round(Math.max(0, Math.min(1, share)) * 100);
  return `<svg class="ring" viewBox="0 0 120 120" aria-hidden="true">
    <circle cx="60" cy="60" r="50" class="track"/>
    <circle cx="60" cy="60" r="50" class="fill" pathLength="100" stroke-dasharray="${pct} 100" transform="rotate(-90 60 60)"/></svg>`;
}

// Kanji at your level: every kanji taught up to and including the unit you're on.
function levelKanji() {
  const units = data.units || [];
  const next = nextUp(state, units);
  const upTo = next?.unit ? units.indexOf(next.unit) : units.length - 1;
  const chars = units.slice(0, upTo + 1).flatMap((u) => u.lessons.flatMap((l) => l.kanji || []));
  const list = [...new Set(chars)].map((c) => data.kanji.find((k) => k.k === c)).filter(Boolean);
  return list.length ? list : data.kanji;
}

// The guessing deck: today's kanji, then due ones, then ones not seen yet, then the rest by due date.
function kanjiDeck(now = Date.now()) {
  const first = featuredKanji();
  const rec = (k) => state.items[kanjiId(k)];
  const rest = levelKanji().filter((k) => k !== first);
  const due = rest.filter((k) => rec(k) && rec(k).due <= now).sort((a, b) => rec(a).due - rec(b).due);
  const unseen = rest.filter((k) => !rec(k));
  const later = rest.filter((k) => rec(k) && rec(k).due > now).sort((a, b) => rec(a).due - rec(b).due);
  return [first, ...due, ...unseen, ...later].map((k, n) => ({
    type: 'card', kind: 'kanji', id: kanjiId(k), ref: k, label: n ? 'Guess the kanji' : 'Kanji of the day',
  }));
}

function kanjiOfTheDay() {
  const k = featuredKanji();
  const pool = levelKanji();
  const due = pool.filter((x) => state.items[kanjiId(x)]?.due <= Date.now()).length;
  return `<button class="card kod" id="kodopen" aria-label="Guess today's kanji">
    <span class="kod-glyph jp" aria-hidden="true">${k.k}</span>
    <span class="kod-info">
      <span class="caps">Kanji of the day</span>
      <strong>What does it mean?</strong>
      <span class="small muted">Tap to guess, then keep going through ${pool.length} kanji at your level${due ? ` · ${due} due` : ''}</span>
    </span>
    <span class="chev">${icons.chevron}</span>
  </button>`;
}

function courseCard(next) {
  const units = data.units || [];
  const passed = units.filter((u) => state.course.passed[u.id]).length;
  const steps = courseSteps(state, units);
  const rank = rankOf(passed);
  const go = nextAction(next);
  const due = reviewSteps(state, data).length;
  const label = next?.type === 'lesson' ? next.lesson.title
    : next?.type === 'test' ? `Unit ${next.unit.n} test` : next?.type === 'exam' ? 'Mock exam' : 'Course complete';
  const seg = (u) => (state.course.passed[u.id] ? 'on' : u === next?.unit ? 'now' : '');
  return `<section class="card course-card">
    <div class="cc-top">
      <div class="ringbox">${ringSvg(steps.total ? steps.done / steps.total : 0)}
        <span class="ringtext"><b>${steps.done}</b><small>of ${steps.total}</small></span></div>
      <div class="grow">
        <span class="caps">Course${next?.unit ? ` · Unit ${next.unit.n}` : ''}</span>
        <h3>${label}</h3>
        <p class="small muted"><span class="jp">${rank.jp}</span> ${rank.en}${next?.unit ? ` · ${pips(next.unit)}` : ''}</p>
      </div>
    </div>
    <div class="segs" aria-label="${passed} of ${units.length} units passed">${units.map((u) => `<i class="${seg(u)}"></i>`).join('')}</div>
    ${go ? `<button class="btn" id="cont">${go.label}</button>` : ''}
    ${due ? `<button class="btn ghost" id="revonly">Review only · ${due}</button>` : ''}
  </section>`;
}

function heatmap(now = Date.now()) {
  // Five weeks, Monday first, ending this week.
  const today = new Date(now);
  const back = (today.getDay() + 6) % 7;
  const start = now - (back + 28) * DAY_MS;
  const cells = Array.from({ length: 35 }, (_, i) => {
    const t = start + i * DAY_MS;
    if (t > now) return '<i class="future"></i>';
    const n = activity(state.days[dayKey(t)]);
    const level = n === 0 ? 0 : n < 5 ? 1 : n < 15 ? 2 : n < 30 ? 3 : 4;
    return `<i class="l${level} ${i === back + 28 ? 'now' : ''}"></i>`;
  });
  const s = streak(now);
  return `<section class="card">
    <div class="kod-head"><span class="caps">Last 5 weeks</span>
      <span class="small"><b class="num">${s}</b> ${s === 1 ? 'day' : 'days'} in a row</span></div>
    <div class="heat-days">${'月火水木金土日'.split('').map((d) => `<span class="jp">${d}</span>`).join('')}</div>
    <div class="heat">${cells.join('')}</div>
    <p class="small muted center">Greener squares mean more study. A missed day never resets your progress.</p>
  </section>`;
}

// Home: the course and the kanji of the day, nothing else.
function screenToday() {
  setTop('JP Trainer');
  const next = nextUp(state, data.units);
  view.innerHTML = `
    ${courseCard(next)}
    ${kanjiOfTheDay()}
    ${backupDue() ? `<a class="nudge" href="#/settings">${icons.download}<span class="grow">Back up your progress. Safari can clear saved data.</span><span class="chev">${icons.chevron}</span></a>` : ''}`;
  view.querySelector('#cont')?.addEventListener('click', () => nextAction(next).go());
  view.querySelector('#revonly')?.addEventListener('click', startReviews);
  view.querySelector('#kodopen').onclick = () => startRun(kanjiDeck(), 'Kanji', { useSrs: true });
}

/* ---------- Talk ---------- */

const PUNCT = /^[。、！？…]+$/;
// A Talk phrase in the shape the listening step expects.
const talkSentence = (p) => ({ id: p.id, en: p.en, blocks: p.t.split(' ').filter((w) => !PUNCT.test(w)).map((t) => ({ t })) });

function screenTalk() {
  setTop('Talk');
  const saved = state.talk.saved;
  const starred = data.talkPhrases.filter((p) => saved[p.id]).length;
  view.innerHTML = `
    <section class="card hero">
      <span class="water" aria-hidden="true">話</span>
      <span class="caps">Everyday Japanese</span>
      <h2>Phrases people<br>actually say</h2>
      <p class="sub">${data.talkPhrases.length} phrases written or approved by native speakers. Star one to practise it by ear in your daily session.</p>
    </section>
    ${starred ? `<a class="action" href="#/talk/saved"><span class="icbox">${icons.star}</span>
      <span class="grow"><strong>Starred</strong><span class="small">${starred} ${starred === 1 ? 'phrase' : 'phrases'} in your reviews</span></span>
      <span class="chev">${icons.chevron}</span></a>` : ''}
    <div class="caps sect"><span>Situations</span></div>
    <section class="cgrid">${data.talk.map((c) => {
    const n = c.items.filter((p) => saved[p.id]).length;
    return `<a class="ctile" href="#/talk/${c.id}"><span class="cjp jp">${c.jp}</span><strong>${c.title}</strong>
        <span class="small muted">${c.items.length} phrases${n ? ` · ${n} starred` : ''}</span></a>`;
  }).join('')}</section>
    <p class="small muted center">From Tatoeba, a free collection of sentences. Casual phrases are marked: use them with friends.</p>`;
}

function screenTalkList(catId) {
  const cat = data.talk.find((c) => c.id === catId);
  const saved = state.talk.saved;
  const list = catId === 'saved' ? data.talkPhrases.filter((p) => saved[p.id]) : cat?.items;
  if (!list) { location.hash = '#/talk'; return; }
  setTop(cat ? cat.title : 'Starred', backTo('#/talk'));
  let rate = NORMAL;
  const card = (p) => {
    const tokens = p.t.split(' ');
    return `<article class="card phrase gloss-zone" data-id="${p.id}">
      <div class="pline jp">${tokens.map((w) => (data.glossary[w] ? `<button class="word" data-word="${w}">${w}</button>` : `<span>${w}</span>`)).join('')}</div>
      <p class="romaji">${romajiLine(tokens, data.glossary)}</p>
      <p class="pen">${p.en}</p>
      <div class="prow"><span class="tag ${p.c ? 'casual' : ''}">${p.c ? 'Casual' : 'Polite'}</span><span class="grow"></span>
        <button class="say" data-play aria-label="Play">${icons.speaker}</button>
        <button class="say star ${saved[p.id] ? 'on' : ''}" data-star aria-pressed="${Boolean(saved[p.id])}" aria-label="Star for review">${icons.star}</button></div>
      ${glossHtml()}
    </article>`;
  };
  view.innerHTML = `
    <div class="talkbar">${cat ? `<span class="cjp jp">${cat.jp}</span>` : '<span></span>'}
      <div class="seg mini" id="speed"><button class="on" data-r="${NORMAL}">Normal</button><button data-r="${SLOW}">Slow</button></div></div>
    ${list.length ? list.map(card).join('') : '<p class="small muted center">No starred phrases yet. Tap the star on any phrase.</p>'}
    <p class="small muted center">Tap a word for its meaning. Starred phrases come back in your daily session.</p>`;
  view.querySelectorAll('.phrase').forEach((el) => bindGloss(el, data.glossary));
  view.onclick = (e) => {
    const sp = e.target.closest('#speed [data-r]');
    if (sp) {
      rate = Number(sp.dataset.r);
      view.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === sp));
      return;
    }
    const art = e.target.closest('.phrase');
    if (!art) return;
    const p = list.find((x) => x.id === art.dataset.id);
    if (e.target.closest('[data-play]')) speak(p.t.replace(/ /g, ''), { rate });
    const star = e.target.closest('[data-star]');
    if (star) {
      if (saved[p.id]) {
        delete saved[p.id];
        delete state.items[`t:${p.id}`];
      } else saved[p.id] = Date.now();
      save(state);
      star.classList.toggle('on', Boolean(saved[p.id]));
      star.setAttribute('aria-pressed', String(Boolean(saved[p.id])));
    }
  };
}

/* ---------- Step runner ---------- */

// `more` makes a run endless: it supplies the next step when the list runs out.
const kanjiKnown = () => Object.keys(state.items).filter((id) => id.startsWith('k:')).length;

// `lesson` ({ unit, lesson }) marks a course lesson: its place is saved, and it ends on a lesson-complete screen.
// `then` runs when the steps run out, in place of the summary.
// What moved up during reviews that flowed into a lesson, so the lesson's end screen can show it.
let carried = null;
const starMap = () => Object.fromEntries((data.units || []).map((u) => [u.id, unitStars(state, u)]));

function startRun(steps, title, { useSrs = false, browse = false, start = 0, more = null, onDrill = null, lesson = null, then = null } = {}) {
  const from = carried || { ups: [0, 0, 0, 0], stars: starMap(), kanji: kanjiKnown() };
  carried = null;
  run = { steps: [...steps], i: start, title, useSrs, browse, more, onDrill, lesson, then, kanjiBefore: from.kanji, ups: from.ups, starsBefore: from.stars, clean: 0, drills: 0, cards: 0 };
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
  const before = stageOf(prev);
  const after = stageOf(state.items[id]);
  if (after > before) run.ups[after]++;
  const kind = id[0];
  if (kind === 's') stats.sentences++;
  else if (kind === 'p') stats.particles++;
  else if (kind === 't' || kind === 'g') stats.reviews++;
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
    // Reviews before a lesson flow straight into it.
    if (run.then) {
      const then = run.then;
      carried = { ups: run.ups, stars: run.starsBefore, kanji: run.kanjiBefore };
      clearStep();
      run = null;
      return then();
    }
    return renderSummary();
  }
  const step = run.steps[run.i];
  // Finishing a lesson (or one part of a big one) has no screen of its own.
  if (step.type === 'lessonEnd' || step.type === 'lessonPart') {
    if (!step.done) {
      step.done = true;
      if (step.type === 'lessonEnd') {
        if (!state.course.done[step.id]) dayStats(state).lessons = (dayStats(state).lessons || 0) + 1;
        state.course.done[step.id] = Date.now();
        // The lesson's grammar point starts its own reviews.
        state.items[`g:${step.id}`] ||= rate(newRecord(), 'good');
      } else run.part = true;
      if (state.course.current?.lesson === step.id) delete state.course.current;
      save(state);
    }
    return advance();
  }
  // Save the place in a course lesson, so leaving the app doesn't lose it.
  if (run.lesson && state.course.current?.lesson === run.lesson.lesson.id && state.course.current.i !== run.i) {
    state.course.current.i = run.i;
    save(state);
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
  } else if (step.type === 'talk') {
    renderListen(view, talkSentence(step.ref), {
      glossary: data.glossary,
      others: data.talkPhrases.map((p) => p.en),
      review,
      onDone: (right) => {
        if (!step.done) record(step.id, right ? 'good' : 'again');
        step.done = true;
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
  // A grammar review says which lesson it comes from, but not the pattern: that would give the answer away.
  if (step.grammar) {
    const { unit, lesson } = step.grammar;
    view.insertAdjacentHTML('afterbegin', `<div class="gtag"><span class="caps grow">Grammar review · Lesson ${unit.n}.${unit.lessons.indexOf(lesson) + 1}</span>
      ${stageChip(state.items[step.id])}</div>`);
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

// A small 新/習/強/極 chip for how well an item is known.
const stageChip = (rec) => {
  const s = STAGES[stageOf(rec)];
  return `<span class="stage s-${s.id}"><span class="jp">${s.jp}</span>${s.en}</span>`;
};

const headHtml = (title, step) => `<div class="study-head"><span class="caps">${title}</span>
  <span class="head-tags">${state.items[step.id] && !run?.browse ? stageChip(state.items[step.id]) : ''}
  ${step.kind === 'kanji' ? `<span class="tag">N${step.ref.jlpt}</span>` : '<span class="tag">Word</span>'}</span></div>`;

function renderLearn(step) {
  const title = run.browse ? 'Kanji' : `New ${step.kind === 'kanji' ? 'kanji' : 'word'}`;
  const last = run.i === run.steps.length - 1;
  view.innerHTML = `<div class="card study">
      ${headHtml(title, step)}${glyphHtml(step)}${factsHtml(step)}
    </div>
    <div class="dock"><button class="btn" id="next">${run.browse ? (last ? 'Done' : 'Next') : 'Got it'}</button></div>`;
  view.querySelector('#next').onclick = advance;
}

/* ---------- Typing the reading ---------- */

const KANJI_RE = /[一-龯々]/;
// Every reading that counts as right: a kanji takes any of its on or kun readings,
// with or without its okurigana; a word takes its kana spelling.
function readingsOf(step) {
  if (step.kind !== 'kanji') return [toHiragana(step.ref.y)];
  return [...new Set([...step.ref.on, ...step.ref.kun].flatMap((r) => {
    const h = toHiragana(r).replace(/^-|-$/g, '');
    return [h.replace(/[-.]/g, ''), h.split(/[-.]/)[0]];
  }).filter(Boolean))];
}

// Known items (Strong and up) are reviewed by typing the reading. Kana-only words and guessing decks aren't.
const typesReading = (step) => run.useSrs && !step.isNew && !step.label && stageOf(state.items[step.id]) >= STRONG
  && (step.kind === 'kanji' || KANJI_RE.test(step.ref.w));

function rateButtons(step, grades = GRADES) {
  const rec = state.items[step.id] || newRecord();
  const act = view.querySelector('#act');
  act.innerHTML = `<div class="rate ${grades.length < 4 ? 'three' : ''}">${grades.map((g) => `<button class="${g}" data-g="${g}">
    ${g[0].toUpperCase() + g.slice(1)}<small>${label(rec, g)}</small></button>`).join('')}</div>`;
  act.onclick = (e) => {
    // Only rating buttons: the click that attached this handler bubbles here too.
    const btn = e.target.closest('[data-g]');
    if (btn) finishCard(step, btn.dataset.g);
  };
}

function finishCard(step, grade) {
  record(step.id, grade);
  run.cards++;
  step.done = true;
  // "Again" comes back later in this session.
  if (grade === 'again') run.steps.splice(Math.min(run.i + 4, run.steps.length), 0, { ...step, done: false });
  advance();
}

function reveal() {
  view.querySelector('#back').hidden = false;
  view.querySelector('#ask').hidden = true;
  view.querySelector('#studycard').classList.add('revealed');
}

function renderCard(step) {
  const typed = !step.done && typesReading(step);
  const ask = step.label ? 'Guess the meaning and reading, then check.'
    : typed ? `Type ${step.kind === 'kanji' ? 'a reading' : 'the reading'} in romaji or kana.` : 'Recall the reading and meaning, then check.';
  view.innerHTML = `<div class="card study" id="studycard">
      ${headHtml(step.label || (step.isNew ? 'Now recall it' : 'Review'), step)}${glyphHtml(step)}
      <p class="ask" id="ask">${ask}</p>
      ${typed ? `<form class="type-in" id="typein" autocomplete="off">
        <input id="typed" class="jp" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Reading">
        <p class="small muted center" id="kana">&nbsp;</p></form>` : ''}
      <div class="fb" id="fb" role="status" hidden></div>
      <div class="back" id="back" hidden>${factsHtml(step)}</div>
    </div>
    <div class="dock" id="act">${typed
    ? '<div class="pair"><button class="btn ghost" id="dunno">Show me</button><button class="btn" id="check">Check</button></div>'
    : '<button class="btn" id="show">Show answer</button>'}</div>`;
  // Already rated in this run: show the answer without rating it again.
  if (step.done) {
    reveal();
    view.querySelector('#act').innerHTML = '<button class="btn" id="next">Next</button>';
    view.querySelector('#next').onclick = advance;
    return;
  }
  if (!typed) {
    view.querySelector('#show').onclick = () => { reveal(); rateButtons(step); };
    return;
  }
  const input = view.querySelector('#typed');
  const kana = view.querySelector('#kana');
  const fb = view.querySelector('#fb');
  input.focus();
  input.oninput = () => { kana.textContent = toKana(input.value) || '\u00a0'; };
  const answers = readingsOf(step);
  const settle = (verdict) => {
    reveal();
    input.disabled = true;
    const shown = step.kind === 'kanji' ? '' : ` It's ${answers[0]}.`;
    fb.hidden = false;
    if (verdict === 'right') {
      fb.className = 'fb good';
      fb.textContent = 'Right.';
      // Recalled it: no "Again" needed.
      rateButtons(step, ['hard', 'good', 'easy']);
      return;
    }
    fb.className = verdict === 'close' ? 'fb info' : 'fb bad';
    fb.textContent = verdict === 'close' ? `Close: check the small kana, dakuten and long vowels.${shown}`
      : `Not this time.${shown}`;
    view.querySelector('#act').innerHTML = '<button class="btn" id="next">Next</button>';
    view.querySelector('#next').onclick = () => finishCard(step, verdict === 'close' ? 'hard' : 'again');
  };
  view.querySelector('#typein').onsubmit = (e) => {
    e.preventDefault();
    settle(judgeReading(toKana(input.value, { done: true }), answers));
  };
  view.querySelector('#check').onclick = () => settle(judgeReading(toKana(input.value, { done: true }), answers));
  view.querySelector('#dunno').onclick = () => settle('wrong');
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

// The end of a course lesson: what was gained, how far the course has come, and the next step.
// What got stronger in this run: items that reached Strong or Mastered, and units that earned a star.
function memoryHtml() {
  const strong = run.ups[STRONG];
  const mastered = run.ups[STRONG + 1];
  const stars = (data.units || []).map((u) => ({ u, n: unitStars(state, u) })).filter(({ u, n }) => n > (run.starsBefore[u.id] || 0) && n > 1);
  if (!strong && !mastered && !stars.length) return '';
  return `${stars.map(({ u, n }) => `<div class="starup"><span class="stars">${starHtml(n)}</span><span><small>Unit ${u.n} mastery</small><b>${u.title}</b></span></div>`).join('')}
    ${strong || mastered ? `<div class="row"><span class="grow">Moved up</span><span class="num">${[
    strong ? `${stageChip({ interval: 3 })} +${strong}` : '', mastered ? `${stageChip({ interval: 21 })} +${mastered}` : ''].filter(Boolean).join(' ')}</span></div>` : ''}`;
}

function renderLessonDone() {
  const { unit, lesson } = run.lesson;
  setTop(run.title, { close: true, progress: 100 });
  const name = `Lesson ${unit.n}.${unit.lessons.indexOf(lesson) + 1}`;
  const seen = new Set();
  const learned = run.steps.filter((s) => s.type === 'learn' && !seen.has(s.id) && seen.add(s.id));
  const kanji = learned.filter((s) => s.kind === 'kanji').map((s) => s.ref.k);
  const words = learned.filter((s) => s.kind === 'word').length;
  const kanjiNow = kanjiKnown();
  const steps = courseSteps(state, data.units);
  const p = unitProgress(state, unit);
  const next = nextUp(state, data.units);
  const go = nextAction(next);
  const perfect = run.drills > 0 && run.clean === run.drills;
  const chip = (big, small, glyphs = '') => `<div class="gain"><b>${big}</b><span>${small}</span>${glyphs ? `<span class="jp gl">${glyphs}</span>` : ''}</div>`;
  const status = run.part ? 'More new items are waiting in part 2.'
    : p.done === p.total ? `Unit ${unit.n} test is ready.` : `${p.done} of ${p.total} lessons in Unit ${unit.n}.`;
  view.innerHTML = `<section class="card hero done-hero lesson-done">
      <div class="burst" aria-hidden="true">${icons.check}</div>
      <span class="caps">${run.part ? 'Part done' : perfect ? 'Clean run' : 'Lesson done'}</span>
      <h2>${name}${run.part ? ', part 1' : ''}</h2>
      <div class="unit-strip">${pips(unit, run.part ? null : lesson.id)}<span class="small">${status}</span></div>
    </section>
    ${kanji.length || words ? `<div class="caps sect"><span>You gained</span></div>
      <div class="gains">${kanji.length ? chip(`+${kanji.length}`, kanji.length === 1 ? 'kanji' : 'kanji', kanji.join(' ')) : ''}${words ? chip(`+${words}`, words === 1 ? 'word' : 'words') : ''}</div>` : ''}
    <section class="card list">
      ${run.drills ? `<div class="row"><span class="grow">Drills right first time</span><span class="num">${run.clean} / ${run.drills}</span></div>` : ''}
      ${memoryHtml()}
      <div class="row"><span class="grow">Kanji collected</span><span class="num">${kanjiNow > run.kanjiBefore ? `${run.kanjiBefore} → ` : ''}<b>${kanjiNow}</b> / ${data.kanji.length}</span></div>
      <div class="row"><span class="grow">Course<div class="meter"><i style="width:${(steps.done / steps.total) * 100}%"></i></div></span><span class="num">${steps.done} / ${steps.total}</span></div>
    </section>
    <div class="dock stack">
      ${go ? `<button class="btn" id="go">${run.part ? 'Keep going: part 2' : `Next: ${go.label.replace(/^(Take the|Start|Open the) /, '')}`}</button>` : ''}
      <button class="btn ghost" id="fin">Done for now</button>
    </div>`;
  view.querySelector('#fin').onclick = endRun;
  view.querySelector('#go')?.addEventListener('click', () => {
    endRun();
    go.go();
  });
  animate();
}

function renderSummary() {
  if (run.lesson) return renderLessonDone();
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
    ${memoryHtml() ? `<section class="card list">${memoryHtml()}</section>` : ''}
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
    ${action('kan', icons.kanji, 'Kanji', `All ${data.kanji.length} N5 kanji, with parts, readings and words`)}
    <p class="small muted center">Free practice doesn't change your review schedule.</p>
    <div class="caps sect"><span>Particle guides</span></div>
    <section class="pgrid" id="cards">${cards.map((c) => `<button class="ptile" data-p="${c.p}">
      <b>${c.p}</b><small>${c.name}</small></button>`).join('')}</section>`;
  view.querySelector('#sent').onclick = () => { location.hash = '#/practice/sentences'; };
  view.querySelector('#part').onclick = () => { location.hash = '#/practice/particles'; };
  view.querySelector('#kan').onclick = () => { location.hash = '#/practice/kanji'; };
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
  const go = nextAction(next);
  const due = reviewSteps(state, data).length;
  const passed = units.filter((u) => state.course.passed[u.id]).length;
  const steps = courseSteps(state, units);
  const rank = rankOf(passed);
  const toRank = rank.next ? rank.next.at - passed : 0;
  const nextLabel = next?.type === 'lesson' ? next.lesson.title
    : next?.type === 'test' ? `Unit ${next.unit.n} test` : next?.type === 'exam' ? 'Mock exam' : 'Course';
  // Units up to two past the current one are shown; the rest fold into one row.
  const here = next?.unit ? units.indexOf(next.unit) : units.length - 1;
  const shown = units.slice(0, here + 2);
  const folded = units.length - shown.length;
  const node = (u) => {
    const p = unitProgress(state, u);
    const open = isUnlocked(state, units, u);
    const now = u === next?.unit;
    const best = state.course.best?.[u.id];
    const known = p.passed || now ? strengthLine(u) : '';
    const sub = now ? `${p.done} of ${p.total} lessons${p.done === p.total ? ' · test ready' : ''}${known ? ` · ${known}` : ''}`
      : p.passed ? [known, best ? `best ${Math.round(best * 100)}%` : ''].filter(Boolean).join(' · ') : open ? u.goal : 'Locked · pass its test to skip ahead';
    return `<a class="node ${p.passed ? 'done' : ''} ${now ? 'now' : ''} ${open ? '' : 'off'}" href="#/course/${u.id}">
        <span class="dot">${p.passed ? icons.check : open ? u.n : icons.lock}</span>
        <span class="grow"><span class="label">${u.title}${p.passed ? `<span class="stars">${starHtml(unitStars(state, u))}</span>` : ''}</span>
          <span class="nsub">${pips(u)}<span class="small muted">${sub}</span></span></span>
        <span class="chev">${icons.chevron}</span></a>`;
  };
  view.innerHTML = `
    <section class="card hero course-hero">
      <span class="caps">${next?.unit ? `Unit ${next.unit.n} · ` : ''}<span class="jp">${rank.jp}</span> ${rank.en}</span>
      <h2>${nextLabel}</h2>
      <div class="meter"><i style="width:${(steps.done / steps.total) * 100}%"></i></div>
      <span class="small hero-meta">${steps.done} of ${steps.total} steps${rank.next ? ` · ${toRank} ${toRank === 1 ? 'unit' : 'units'} to ${rank.next.en}` : ''}</span>
      ${go ? `<button class="btn" id="go">${go.label}</button>` : ''}
      ${due ? `<button class="btn ghost hero-ghost" id="revonly">Review only · ${due}</button>` : ''}
    </section>
    <section class="path">${shown.map(node).join('')}
      ${folded ? `<div class="node off fold"><span class="dot">${icons.lock}</span><span class="grow"><span class="label">Units ${shown.length + 1}–${units.length}</span>
        <span class="small muted">Open as you pass each unit</span></span></div>` : ''}
      <a class="node ${examUnlocked(state, units) ? '' : 'off'} last" href="#/course/exam">
        <span class="dot">${examUnlocked(state, units) ? icons.exam : icons.lock}</span>
        <span class="grow"><span class="label">Mock exam</span><span class="small muted">The full JLPT N5 format, timed and scored</span></span>
        <span class="chev">${icons.chevron}</span></a>
    </section>`;
  view.querySelector('#go')?.addEventListener('click', go.go);
  view.querySelector('#revonly')?.addEventListener('click', startReviews);
}

// A lesson left part-way picks up at the same step with the same new items.
function startLesson(unit, lesson) {
  const saved = state.course.current?.lesson === lesson.id ? state.course.current : null;
  const steps = lessonSteps(unit, lesson, state, data, saved);
  const start = saved ? Math.min(saved.i, steps.length - 1) : 0;
  state.course.current = {
    lesson: lesson.id,
    fresh: steps.filter((s) => s.type === 'learn').map((s) => s.id),
    part: steps.at(-1).type === 'lessonPart',
    i: start,
  };
  save(state);
  startRun(steps, lesson.title, { useSrs: true, start, lesson: { unit, lesson } });
}

const resumable = (next) => next?.type === 'lesson' && state.course.current?.lesson === next.lesson.id && state.course.current.i > 0;

// The label and action for whatever the course wants next.
function nextAction(next) {
  if (!next) return null;
  if (next.type === 'lesson') {
    const name = `${next.unit.n}.${next.unit.lessons.indexOf(next.lesson) + 1}`;
    const lesson = () => startLesson(next.unit, next.lesson);
    if (resumable(next)) return { label: `Resume lesson ${name}`, go: lesson };
    // What's due comes first, then the lesson, in one tap.
    const due = reviewSteps(state, data);
    if (due.length) return { label: `Review ${due.length} → Lesson ${name}`, go: () => startRun(due, 'Reviews', { useSrs: true, then: lesson }) };
    return { label: `Start lesson ${name}`, go: lesson };
  }
  if (next.type === 'test') return { label: `Take the Unit ${next.unit.n} test`, go: () => runUnitTest(next.unit) };
  return { label: 'Open the mock exam', go: () => { location.hash = '#/course/exam'; } };
}

// Reviews on their own, for a pocket of time too short for a lesson.
function startReviews() {
  const due = reviewSteps(state, data);
  if (due.length) startRun(due, 'Reviews', { useSrs: true });
}

// Three mastery stars, filled up to n.
const starHtml = (n) => [1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('');

// How much of a unit is remembered well, as a short line.
function strengthLine(unit) {
  const s = unitStrength(state, unit);
  return s.total ? `${s.strong} / ${s.total} strong` : '';
}

// Lesson dots and a test diamond for one unit.
function pips(unit, justDone = null) {
  const dot = (l) => `<i class="pip ${state.course.done[l.id] ? 'on' : ''} ${l.id === justDone ? 'pop' : ''}"></i>`;
  return `<span class="pips" aria-hidden="true">${unit.lessons.map(dot).join('')}<i class="pip test ${state.course.passed[unit.id] ? 'on' : ''}"></i></span>`;
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

// A missed question, in the shape the check drill uses: right answer first.
const asCheck = (q) => ({ id: q.id, q: q.q, ask: q.ask, w: q.w, o: [q.o[q.a], ...q.o.filter((_, i) => i !== q.a)] });

function runUnitTest(unit) {
  // Testing out of a locked unit covers things not taught yet, so misses there aren't scheduled.
  const wasOpen = isUnlocked(state, data.units, unit);
  const passedBefore = data.units.filter((u) => state.course.passed[u.id]).length;
  document.body.classList.add('in-run');
  startExam({
    ...examContext(),
    persist: () => {},
    onResult: (result, exam, answers) => {
      const missed = exam.sections[0].questions.filter((q) => answers[q.id] !== q.a);
      state.course.best ||= {};
      state.course.best[unit.id] = Math.max(state.course.best[unit.id] || 0, result.share);
      if (result.pass) {
        state.course.passed[unit.id] ||= Date.now();
        // Passing the unit settles its old misses.
        for (const id of Object.keys(state.course.missed)) if (id.startsWith(`${unit.id}-`)) delete state.course.missed[id];
      } else if (wasOpen) {
        for (const q of missed) {
          // Missed words go back to reviews, and missed grammar comes back to be re-checked.
          if (q.word) {
            const id = `w:${q.word}`;
            if (state.items[id]) state.items[id] = rate(state.items[id], 'again');
          } else state.course.missed[q.id] = asCheck(q);
        }
      }
      save(state);
      const drill = () => startRun(missed.map((q) => ({ type: 'check', id: q.id, ref: asCheck(q) })), `Unit ${unit.n} misses`);
      if (!result.pass) {
        return {
          actions: [
            ...(missed.length ? [{ label: `Drill the ${missed.length} ${missed.length === 1 ? 'miss' : 'misses'} now`, run: drill }] : []),
            { label: 'Done for now', run: null },
          ],
        };
      }
      const passed = data.units.filter((u) => state.course.passed[u.id]).length;
      const rank = rankOf(passed);
      const rose = rankOf(passedBefore).at !== rank.at;
      const next = nextUp(state, data.units);
      const go = nextAction(next);
      return {
        note: `Unit ${unit.n} cleared. ${passed} of ${data.units.length} units passed.`,
        badge: rose ? `<div class="rankup"><span class="jp">${rank.jp}</span><span><small>New rank</small><b>${rank.en}</b></span></div>` : '',
        actions: [
          ...(go ? [{ label: next.type === 'lesson' ? `Start Unit ${next.unit.n}` : go.label, run: go.go }] : []),
          { label: 'Done for now', run: null },
        ],
      };
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
  const nextAfter = data.units[data.units.indexOf(unit) + 1];
  view.innerHTML = `
    <section class="card">
      <div class="kod-head"><span class="caps">Unit ${unit.n}</span>${pips(unit)}</div>
      <h3>${unit.title}</h3>
      ${strengthLine(unit) ? `<div class="unit-mem"><span class="stars">${starHtml(unitStars(state, unit))}</span><span class="small muted">${strengthLine(unit)} · ★★ at 80% strong, ★★★ at 80% mastered</span></div>` : ''}
      <p class="small">By the end, you can: ${unit.goal.toLowerCase()}.</p>
      ${open ? '' : '<p class="small muted">This unit is locked. If you already know the material, pass this unit\'s test to skip ahead to it.</p>'}
    </section>
    <section class="card list">${unit.lessons.map((l, i) => `<button class="row tap lessonrow" data-i="${i}" ${open ? '' : 'disabled'}>
        <span class="unum ${state.course.done[l.id] ? 'on' : ''}">${state.course.done[l.id] ? icons.check : i + 1}</span>
        <span class="grow"><span class="label">${l.title}</span></span><span class="chev">${icons.chevron}</span></button>`).join('')}
    </section>
    ${p.passed ? `<p class="small muted center">You passed this unit${state.course.best?.[unit.id] ? ` with a best of ${Math.round(state.course.best[unit.id] * 100)}%` : ''}. You can retake the test any time.</p>` : ''}
    ${p.passed && nextAfter ? `<button class="btn" id="onward">Go to Unit ${nextAfter.n}</button>` : ''}
    <button class="btn ${(ready || !open) && !p.passed ? '' : 'ghost'}" id="test">${p.passed ? 'Retake the unit test' : open && !ready ? 'Take the test early' : 'Take the unit test'}</button>`;
  view.querySelector('#onward')?.addEventListener('click', () => { location.hash = `#/course/${nextAfter.id}`; });
  view.onclick = (e) => {
    const b = e.target.closest('.lessonrow');
    if (b && !b.disabled) startLesson(unit, unit.lessons[Number(b.dataset.i)]);
  };
  view.querySelector('#test').onclick = () => runUnitTest(unit);
}

function runMock(paper, mode, resume = null) {
  document.body.classList.add('in-run');
  const base = examContext();
  // There's one resume slot. A practice run never takes it from a paused timed exam.
  const keepPaused = mode === 'practice' && state.exams.current?.mode === 'exam' && !resume;
  startExam({
    ...base,
    persist: keepPaused ? () => {} : base.persist,
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
  setTop('Kanji', backTo('#/practice'));
  const started = data.kanji.filter((k) => state.items[kanjiId(k)]).length;
  const steps = data.kanji.map((x) => ({ type: 'learn', kind: 'kanji', id: kanjiId(x), ref: x }));
  // The bar under a tile shows its memory stage: a third for Learning, two for Strong, full for Mastered.
  const stage = (k) => stageOf(state.items[kanjiId(k)]);
  view.innerHTML = `
    <section class="card">
      <div class="row" style="min-height:0"><span class="grow"><strong>JLPT N5</strong></span>
        <span class="small muted"><span class="num">${started}</span> of ${data.kanji.length} started</span></div>
      <div class="meter"><i style="width:${(started / data.kanji.length) * 100}%"></i></div>
    </section>
    <div class="grid" id="grid">${data.kanji.map((k, i) => `<button class="tile" data-i="${i}">
      <b>${k.k}</b><small>${k.mean[0]}</small>${stage(k) ? `<i class="s-${STAGES[stage(k)].id}" style="width:${(stage(k) / 3) * 100}%"></i>` : ''}</button>`).join('')}</div>
    <p class="small muted center">The bar fills as a kanji moves from ${STAGES.slice(1).map((s) => `<span class="jp">${s.jp}</span> ${s.en}`).join(' to ')}.</p>`;
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
    <div class="caps sect"><span>Activity</span></div>
    ${heatmap()}
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
      <p class="small">Course lessons and exams are written for this app. Words and kanji are checked against JMdict and KANJIDIC2 (Electronic Dictionary Research and Development Group, CC BY-SA 4.0). Talk phrases come from Tatoeba (tatoeba.org, CC BY 2.0 FR). Audio uses your device's Japanese voice.</p></section>`;
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
  'practice/kanji': screenKanji,
  // Kanji used to be a tab; old links land in Practice.
  kanji: () => { location.replace('#/practice/kanji'); },
  talk: screenTalk,
  settings: screenSettings,
};

function route() {
  if (!data || run) return;
  view.onclick = null;
  const name = location.hash.replace('#/', '');
  const unitId = /^course\/(u\d+)$/.exec(name)?.[1];
  const catId = /^talk\/(\w+)$/.exec(name)?.[1];
  const screen = unitId ? () => screenUnit(unitId) : catId ? () => screenTalkList(catId) : SCREENS[name] || screenToday;
  const tab = SCREENS[name] || unitId || catId ? name.split('/')[0] : 'today';
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
    const [kanji, vocab, sentences, particles, glossary, bank, talk, ...rest] = await Promise.all([
      ...['kanji-n5', 'vocab-n5', 'sentences', 'particles', 'glossary', 'particle-bank'].map(get),
      get('talk').catch(() => ({ categories: [], lex: {} })),
      ...UNIT_FILES.map((f) => get(`course/${f}`).catch(() => [])),
      ...['exam-n5-1', 'exam-n5-2'].map((f) => get(`course/${f}`).catch(() => null)),
    ]);
    const papers = rest.slice(UNIT_FILES.length).filter(Boolean);
    data = mergeCourse({ kanji, vocab, sentences, particles, glossary, bank, papers }, rest.slice(0, UNIT_FILES.length));
    for (const [w, [y, m, ro]] of [...Object.entries(bank.lex), ...Object.entries(talk.lex)]) {
      if (!glossary[w]) glossary[w] = { y, m, ro: ro ?? romaji(y) };
    }
    data.talk = talk.categories;
    setReadings(glossary);
    // Lessons finished before grammar had its own reviews get their grammar item now.
    let added = false;
    for (const u of data.units) {
      for (const l of u.lessons) {
        if (state.course.done[l.id] && !state.items[grammarId(l)]) {
          state.items[grammarId(l)] = rate(newRecord(), 'good');
          added = true;
        }
      }
    }
    if (added) save(state);
    data.talkPhrases = talk.categories.flatMap((c) => c.items.map((p) => ({ ...p, cat: c.id })));
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    view.innerHTML = `<div class="card"><h3>The study data didn't load</h3>
      <p class="small muted">${err.message}. Check your connection and reopen the app.</p></div>`;
  }
}

init();
