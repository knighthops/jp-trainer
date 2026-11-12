// Routing and screens.
import { load, save, dayStats, daysStudied, dayKey, backupJson, parseBackup } from './store.js';
import { renderListen } from './listen.js';
import { speak, speakLines, speakStep, cancel, sayBtn, setReadings, unlockSpeech, NORMAL, SLOW } from './tts.js';
import { setRecorded, unlockAudio, hasClips } from './clips.js';
import { radioChannels, startRadio } from './radio.js';
import { startRush, bestKey as rushKey } from './rush.js';
import {
  GRADES, GRADE_NAMES, GRADE_HELP, TROUBLE, CLEARS, isStruggling, struggleOrder, newRecord, rate, label, STAGES, stageOf, STRONG,
} from './srs.js';
import { reviewSteps, kanjiId } from './session.js';
import {
  renderSentence, renderParticle, renderCheck, particleCardHtml, bindGloss, glossHtml, glossText, romajiLine, shuffled, glued, setKanji, partsHtml, wordKanjiHtml, kanjiOf, kanjiIn,
  setNotes, noteOf, noteSlotInner, noteEditorHtml,
} from './drills.js';
import {
  UNIT_FILES, mergeCourse, isUnlocked, unitProgress, nextUp, examUnlocked, lessonSteps, words as splitWords,
  LEVELS, levelSentences, levelProgress, levelUnlocked, particleItem, courseSteps, rankOf, unitStars, grammarId, passUnit, isWords,
} from './course.js';
import { mockExam, unitTest, startExam } from './exam.js';
import { icons } from './icons.js';
import { romaji, toHiragana, toKana, judgeReading } from './romaji.js';
import { matchReading } from './readings.js';
import { currentUser, logOut } from './lock.js';
import { makeIndex, search, posName, BROWSE, N5 as DICT_N5, KANA_ONLY } from './dict.js';
import { deckOf, emojiOf, homeCard } from './cards.js';
import {
  PARTS, COMING, readiness, tripReadiness, partStatus, partSteps, nextPart, daysUntil, signHtml,
  renderSign, renderSayLearn, renderSayRecall, renderHear, renderPlay,
} from './trip.js';

const view = document.getElementById('view');
const top = document.getElementById('top');
const tabbar = document.getElementById('tabbar');
const runbar = document.getElementById('runbar');
const state = load();
let data = null;
let run = null;
let stepCleanup = null;
let settingsNotice = '';

const TABS = [['today', 'Home'], ['trip', 'Trip'], ['course', 'Course'], ['listen', 'Listen'], ['dojo', 'Dojo']];
// Leaving a screen stops whatever it was doing (Radio playback, the Rush timer).
let screenCleanup = null;

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

// The edge-swipe target for the current screen: Previous in a run, Back on a sub-screen.
let swipeBack = null;

// Sessions (lessons, reviews, drills, Rush, Radio, exams) put Exit, Previous and the count
// in a bar at the bottom, in thumb reach. Sub-screens (`back`) keep the tab bar and a back
// arrow at the top. `jump` turns the count into "Back to N" after Previous.
// `confirm` asks for a second tap on Exit, so a stray thumb doesn't end a session.
function setTop(title, {
  close = false, onClose = endRun, onPrev = null, count = '', progress = null, back = false, jump = null, confirm = false,
} = {}) {
  const barred = close && !back;
  document.body.classList.toggle('has-runbar', barred);
  runbar.hidden = !barred;
  swipeBack = onPrev || (back ? onClose : null);
  if (!barred) {
    top.innerHTML = `<div class="top-in">
        ${close ? `<button class="hbtn" id="close" aria-label="Back">${icons.back}</button>` : '<span class="mark" aria-hidden="true">学</span>'}
        <h1>${title}</h1>
        ${close ? '' : `<a class="hbtn" href="#/dict" aria-label="Dictionary">${icons.search}</a><a class="hbtn gear" href="#/settings" aria-label="Settings">${icons.gear}</a>`}</div>`;
    if (close) top.querySelector('#close').onclick = onClose;
    runbar.innerHTML = '';
    return;
  }
  top.innerHTML = `<div class="top-in slim"><h1>${title}</h1></div>
    ${progress === null ? '' : `<div class="progress"><i style="width:${progress}%"></i></div>`}`;
  runbar.innerHTML = `
    <button id="rbexit"><span class="rbi">${icons.close}</span><span class="rbl">Exit</span></button>
    <button id="rbprev" ${onPrev ? '' : 'disabled'}><span class="rbi">${icons.back}</span><span class="rbl">Previous</span></button>
    ${jump ? `<button id="rbjump" class="jump"><span class="rbi">${icons.next}</span><span class="rbl">${jump.label}</span></button>`
    : `<span class="rbcount"><b class="count">${count}</b></span>`}`;
  const exit = runbar.querySelector('#rbexit');
  let armed = null;
  exit.onclick = () => {
    if (!confirm || armed) { clearTimeout(armed); onClose(); return; }
    exit.classList.add('armed');
    exit.querySelector('.rbl').textContent = 'Tap to exit';
    armed = setTimeout(() => {
      armed = null;
      exit.classList.remove('armed');
      exit.querySelector('.rbl').textContent = 'Exit';
    }, 2500);
  };
  if (onPrev) runbar.querySelector('#rbprev').onclick = onPrev;
  if (jump) runbar.querySelector('#rbjump').onclick = jump.go;
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
    type: 'card', kind: 'kanji', id: kanjiId(k), ref: k, label: 'Guess the kanji',
  }));
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

// Kanji and words you keep forgetting, most-forgotten first.
function troubleSteps() {
  const cards = [
    ...data.kanji.map((x) => ({ type: 'card', kind: 'kanji', id: kanjiId(x), ref: x })),
    ...data.vocab.map((x) => ({ type: 'card', kind: 'word', id: `w:${x.w}`, ref: x })),
  ].filter((s) => isTrouble(s.id));
  return cards.sort((a, b) => state.items[b.id].lapses - state.items[a.id].lapses);
}

function troubleCard() {
  const list = troubleSteps();
  if (!list.length) return '';
  return `<button class="card kod trouble" id="trouble" aria-label="Drill your trouble list">
    <span class="kod-glyph jp" aria-hidden="true">${list.slice(0, 3).map((s) => (s.kind === 'kanji' ? s.ref.k : s.ref.w[0])).join('')}</span>
    <span class="kod-info">
      <span class="caps">Trouble list · ${list.length}</span>
      <strong>Forgotten ${TROUBLE}+ times</strong>
      <span class="small muted">Relearn each one from its breakdown</span>
    </span>
    <span class="chev">${icons.chevron}</span>
  </button>`;
}

// Home: the trip, the course (reviews include kanji), plus anything you keep forgetting.
function screenToday() {
  setTop('JP Trainer');
  const next = nextUp(state, data.units);
  view.innerHTML = `
    ${tripCard()}
    ${courseCard(next)}
    <div id="readcard"></div>
    ${troubleCard()}
    ${backupDue() ? `<a class="nudge" href="#/settings">${icons.download}<span class="grow">Back up your progress. Safari can clear saved data.</span><span class="chev">${icons.chevron}</span></a>` : ''}`;
  view.querySelector('#cont')?.addEventListener('click', () => nextAction(next).go());
  view.querySelector('#revonly')?.addEventListener('click', startReviews);
  view.querySelector('#tripgo')?.addEventListener('click', () => {
    const go = nextPart(data.trip, state.items);
    if (go) startPart(go.scene, go.part);
    else location.hash = '#/trip';
  });
  view.querySelector('#trouble')?.addEventListener('click', () => startRun(troubleSteps(), 'Trouble list', { useSrs: true }));
  drawReadCard(view.querySelector('#readcard'));
}

// Home's "Try reading this": a random card from what you've learned. Flip to check, or get another.
let homeShown = null;
function drawReadCard(root, fresh = false) {
  if (fresh || !homeShown) homeShown = homeCard(data.units, state.course.done, Math.random, homeShown?.t || homeShown?.w);
  const card = homeShown;
  if (!card) { root.innerHTML = ''; return; }
  root.innerHTML = `<section class="card fcard home-read gloss-zone">
    <div class="kod-head"><span class="caps">Try reading this</span><span class="small muted">Unit ${card.unit.n}</span></div>
    ${flashFront(card)}
    <div class="fnav">
      <button class="btn ghost" id="rdsay" aria-label="Listen">${icons.speaker}</button>
      <button class="btn ghost" id="rdflip">Check</button>
      <button class="btn ghost" id="rdnext">Another</button>
    </div>
    <div class="fback"></div>
    ${card.kind === 'sentence' ? glossHtml() : ''}</section>`;
  if (card.kind === 'sentence') bindGloss(root.querySelector('.gloss-zone'), data.glossary);
  root.querySelector('#rdsay').onclick = () => playCard(card);
  root.querySelector('#rdflip').onclick = (e) => {
    root.querySelector('.fback').innerHTML = flashBack(card);
    root.querySelector('.fcard').classList.add('open');
    e.currentTarget.disabled = true;
  };
  root.querySelector('#rdnext').onclick = () => drawReadCard(root, true);
}

/* ---------- Listen: Radio ---------- */

const PUNCT = /^[。、！？…]+$/;
// A starred Talk phrase (from before Talk moved into Trip) in the shape the listening step expects.
const talkSentence = (p) => ({ id: p.id, en: p.en, blocks: p.t.split(' ').filter((w) => !PUNCT.test(w)).map((t) => ({ t })) });
const lineRo = (text) => romajiLine(text.split(' '), data.glossary);

// Hands-free listening: your trip scenes first, then what the course has taught.
function screenListen() {
  setTop('Listen');
  const channels = radioChannels(state, data);
  const chRow = (c) => `<a class="crow" href="#/listen/radio/${c.id}">
      <span class="cjp jp big">${c.jp}</span>
      <span class="grow"><strong>${c.title}</strong><span class="small muted">${c.items.length} lines · ${c.sub}</span></span>
      <span class="playdot" aria-hidden="true">${icons.play}</span></a>`;
  const trip = channels.filter((c) => c.trip);
  const course = channels.filter((c) => !c.trip);
  view.innerHTML = `
    <div class="caps sect"><span><span class="jp">旅</span> Trip radio</span><span class="muted">Hands-free</span></div>
    <section class="clist">${trip.map(chRow).join('')}</section>
    <div class="caps sect"><span><span class="jp">講座</span> Course radio</span></div>
    <section class="clist">${course.length ? course.map(chRow).join('') : '<p class="small muted pad">Finish a course lesson to tune in to what you have learned.</p>'}</section>
    <p class="small muted center">Each line plays in Japanese, pauses, then in English.${data.trip.some((s) => s.say.every(hasClips)) ? ' Recorded channels keep playing with the phone locked.' : ' Keep the screen on while listening.'}</p>`;
}

function screenRadio(id) {
  const channel = radioChannels(state, data).find((c) => c.id === id);
  if (!channel) { location.replace('#/listen'); return; }
  screenCleanup = startRadio({
    view, setTop, settings: state.settings,
    persist: () => save(state),
    romajiOf: lineRo,
    onExit: () => { history.length > 1 ? history.back() : (location.hash = '#/listen'); },
  }, channel);
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
  // Talk, grammar and trip items count as reviews, not as new words.
  else if (kind === 't' || kind === 'g' || kind === 'x') stats.reviews++;
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
  // After Previous, the count turns into a jump straight back to where you left off.
  run.max = Math.max(run.max ?? 0, run.i);
  const behind = run.i < run.max;
  setTop(run.title, {
    close: true,
    onClose: closeRun,
    onPrev: run.i > 0 ? goPrevious : null,
    count: run.more ? `${run.clean} / ${run.drills} right` : `${run.i + 1} / ${run.steps.length}`,
    progress: run.more ? null : (run.i / run.steps.length) * 100,
    jump: behind ? { label: `Back to ${run.max + 1}`, go: () => { run.i = run.max; renderStep(); } } : null,
    // A session with answers to lose asks before it closes. Browsing just closes.
    // A role-play is one long step, so it asks from its first turn.
    confirm: !run.browse && (run.i > 0 || step.type === 'tripPlay'),
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
  // A missed sign or line comes back a few steps later in the same session.
  const tripDone = (clean) => {
    if (!clean && !step.done && run.useSrs) run.steps.splice(Math.min(run.i + 4, run.steps.length), 0, { ...step, done: false });
    finishDrill(clean);
  };
  if (step.type === 'learn') renderLearn(step);
  else if (step.type === 'card') renderCard(step);
  else if (step.type === 'lesson') renderLesson(step);
  else if (step.type === 'dialogue') renderDialogue(step);
  else if (step.type === 'reading') renderReading(step);
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
  } else if (step.type === 'tripSign') {
    renderSign(view, step, { signs: data.trip.flatMap((s) => s.signs), glossary: data.glossary, review, onDone: tripDone });
  } else if (step.type === 'tripLearn') {
    renderSayLearn(view, step, { glossary: data.glossary, onDone: advance });
  } else if (step.type === 'tripSay') {
    renderSayRecall(view, step, {
      glossary: data.glossary,
      rec: state.items[step.id],
      review,
      onRate: (grade) => {
        if (grade && !step.done) {
          step.done = true;
          run.drills++;
          if (grade !== 'again') run.clean++;
          record(step.id, grade);
          // A forgotten line comes back later in this session.
          if (grade === 'again' && run.useSrs) run.steps.splice(Math.min(run.i + 4, run.steps.length), 0, { ...step, done: false });
        }
        advance();
      },
    });
  } else if (step.type === 'tripHear') {
    const others = step.scene.hear.map((l) => l.en);
    renderHear(view, step, {
      glossary: data.glossary,
      others: others.length > 3 ? others : data.trip.flatMap((s) => s.hear.map((l) => l.en)),
      review,
      onDone: tripDone,
    });
  } else if (step.type === 'tripPlay') {
    stepCleanup = renderPlay(view, step, { glossary: data.glossary, review, onDone: finishDrill });
  } else if (step.type === 'particleCard') {
    view.innerHTML = `${particleCardHtml(step.ref, data.glossary)}<div class="dock"><button class="btn" id="next">Continue</button></div>`;
    bindGloss(view.querySelector('.gloss-zone'), data.glossary);
    view.querySelector('#next').onclick = advance;
  }
  // A grammar review says which lesson it comes from, but not the pattern: that would give the answer away.
  if (step.grammar) {
    const { unit, lesson } = step.grammar;
    view.insertAdjacentHTML('afterbegin', `<div class="gtag"><span class="caps grow">${isWords(lesson) ? 'Words' : 'Grammar'} review · Lesson ${unit.n}.${unit.lessons.indexOf(lesson) + 1}</span>
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

// A word for a kanji card: from the vocabulary, or any word the app glosses.
const wordEntry = (w) => data.vocab.find((v) => v.w === w) || (data.glossary[w] ? { w, y: data.glossary[w].y, m: data.glossary[w].m } : null);

// The one reading to learn first, in hiragana: the kanji as a word if it is one
// (人 is ひと, 本 is ほん), else the reading its words use most (学 is がく from 学生
// and 大学; 食 is たべる), else its first Chinese reading (京 is きょう, not みやこ).
function headReading(k) {
  const alone = wordEntry(k.k);
  if (alone) return toHiragana(alone.y);
  const tally = new Map();
  for (const w of k.words.map(wordEntry).filter(Boolean)) {
    const hit = matchReading(k, w, w.y);
    if (hit) tally.set(toHiragana(hit.reading), (tally.get(toHiragana(hit.reading)) || 0) + 1);
  }
  const used = [...tally].sort((a, b) => b[1] - a[1])[0]?.[0];
  // A verb or adjective reading reads best in full: た + べる is たべる.
  const full = (r) => toHiragana(r.replace(/[-.]/g, ''));
  if (used) {
    const kun = k.kun.find((r) => toHiragana(r.split(/[-.]/)[0]) === used && /[-.]/.test(r));
    return kun ? full(kun) : used;
  }
  return full(k.on[0] || k.kun[0] || '');
}

// Breakdown first: the parts are what make a kanji stick.
function kanjiFacts(k) {
  const words = k.words.map(wordEntry).filter(Boolean);
  const said = headReading(k);
  return `<div>
      <p class="mean">${k.mean.join(', ')}</p>
      ${said ? `<p class="head-read"><span class="jp">${said}</span> <span class="ro">${romaji(said)}</span></p>` : ''}
    </div>
    <div class="block-sec"><span class="caps">Breakdown</span>${partsHtml(k)}</div>
    <div class="block-sec">
      <div class="sechead"><span class="caps">All readings</span>
        <button class="info" data-info aria-label="What are On and Kun?" aria-expanded="false">${icons.info}</button></div>
      <p class="explain small" hidden><b>On</b> comes from Chinese and mostly appears in compounds, like 学生. <b>Kun</b> is native Japanese, mostly used alone or before hiragana, like 山 or 食べる.</p>
      <div class="reads">
        <div class="read"><span class="caps">On</span>${readingLines(k.on)}</div>
        <div class="read"><span class="caps">Kun</span>${readingLines(k.kun)}</div>
      </div>
    </div>
    ${words.length ? `<div class="block-sec"><span class="caps">In words</span>${words.map((w) => wordRow(k, w)).join('')}</div>` : ''}`;
}

// A word card's answer, then each of its kanji with the breakdown.
const wordFacts = (w) => `<div>
    <p class="mean">${w.m}</p>
    <p class="meta jp" style="font-size:18px">${w.y}</p>
    <p class="meta">${romaji(w.y)}</p>
    <div class="center">${sayBtn(w.y)}</div>
  </div>
  ${wordKanjiHtml(w.w, w.y)}`;

const factsHtml = (step) => (step.kind === 'kanji' ? kanjiFacts(step.ref) : wordFacts(step.ref));

// A small 新/習/強/極 chip for how well an item is known.
const stageChip = (rec) => {
  const s = STAGES[stageOf(rec)];
  return `<span class="stage s-${s.id}"><span class="jp">${s.jp}</span>${s.en}</span>`;
};

const headHtml = (title, step) => `<div class="study-head"><span class="caps">${title}</span>
  <span class="head-tags">${state.items[step.id] && !run?.browse ? stageChip(state.items[step.id]) : ''}
  ${step.kind === 'kanji' ? `<span class="tag">${step.ref.jlpt ? `N${step.ref.jlpt}` : 'Kanji'}</span>` : '<span class="tag">Word</span>'}</span></div>`;

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
    ${GRADE_NAMES[g]}<small>${label(rec, g)}</small></button>`).join('')}</div>`;
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
  // A forgotten card comes back later in this session, opening on its breakdown.
  if (grade === 'again') run.steps.splice(Math.min(run.i + 4, run.steps.length), 0, { ...step, done: false, relearn: true });
  advance();
}

function reveal() {
  view.querySelector('#back').hidden = false;
  view.querySelector('#ask').hidden = true;
  view.querySelector('#hint')?.remove();
  view.querySelector('#studycard').classList.add('revealed');
}

// Forgotten cards, and trouble items, open on their parts before you try again:
// relearning through the breakdown, not just seeing the answer once more.
const isTrouble = (id) => (state.items[id]?.lapses || 0) >= TROUBLE;
function hintHtml(step) {
  if (step.done || !(step.relearn || isTrouble(step.id))) return '';
  const list = step.kind === 'kanji' ? [step.ref] : kanjiIn(step.ref.w);
  if (!list.length) return '';
  return `<div class="hintbd" id="hint"><span class="caps">${step.relearn ? 'You forgot this one. Rebuild it from its parts' : 'A tricky one. Start from its parts'}</span>
    ${list.map((k) => `${list.length > 1 ? `<p class="hint-k jp">${k.k}</p>` : ''}${partsHtml(k, { edit: false })}`).join('')}</div>`;
}

const RATE_HELP = `<div class="block-sec">
    <div class="sechead"><span class="caps">How to rate</span>
      <button class="info" data-info aria-label="What do the ratings mean?" aria-expanded="false">${icons.info}</button></div>
    <div class="explain small" hidden>${GRADES.map((g) => `<p><b>${GRADE_NAMES[g]}:</b> ${GRADE_HELP[g]}</p>`).join('')}
      <p>Anything you forget ${TROUBLE} times goes on the Trouble list on Home.</p></div>
  </div>`;

function renderCard(step) {
  const typed = !step.done && typesReading(step);
  const ask = step.label ? 'Guess the meaning and reading, then check.'
    : typed ? `Type ${step.kind === 'kanji' ? 'a reading' : 'the reading'} in romaji or kana.` : 'Recall the reading and meaning, then check.';
  view.innerHTML = `<div class="card study" id="studycard">
      ${headHtml(step.label || (step.isNew ? 'Now recall it' : 'Review'), step)}${glyphHtml(step)}
      ${hintHtml(step)}
      <p class="ask" id="ask">${ask}</p>
      ${typed ? `<form class="type-in" id="typein" autocomplete="off">
        <input id="typed" class="jp" inputmode="text" autocapitalize="off" autocorrect="off" spellcheck="false" enterkeyhint="done" aria-label="Reading">
        <p class="small muted center" id="kana">&nbsp;</p></form>` : ''}
      <div class="fb" id="fb" role="status" hidden></div>
      <div class="back" id="back" hidden>${factsHtml(step)}${run.useSrs && !step.label ? RATE_HELP : ""}</div>
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
const wordLine = (text) => glued(splitWords(text), (w) => (data.glossary[w]
  ? `<button class="word" data-word="${w}">${w}</button>` : `<span>${w}</span>`));
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
        <p class="romaji">${lineRomaji(e.t)} ${sayBtn(e.t)}</p>
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
      <p class="small muted center" id="nowline" aria-live="polite">&nbsp;</p>
      <button class="btn ghost" id="show">Show the words</button>
      <div id="lines" hidden>${d.lines.map((l, i) => `<div class="dline" data-i="${i}"><span class="who">${l.s}</span><div class="grow">
        <div class="stem jp">${wordLine(l.t)}</div>
        <p class="romaji">${lineRomaji(l.t)}</p><p class="small muted">${l.en}</p></div>
        <button class="say" data-line="${i}" aria-label="Play line ${i + 1}">${icons.speaker}</button></div>`).join('')}
        ${glossHtml()}</div>
    </div>
    <div class="dock"><button class="btn" id="next">Continue</button></div>`;
  bindGloss(view.querySelector('.gloss-zone'), data.glossary);
  // The line being spoken lights up, and the status says whose turn it is, words shown or not.
  const rows = view.querySelectorAll('.dline');
  const nowline = view.querySelector('#nowline');
  const mark = (i) => {
    rows.forEach((el, n) => el.classList.toggle('now', n === i));
    nowline.innerHTML = i < 0 ? '&nbsp;' : `Speaker ${d.lines[i].s} · line ${i + 1} of ${d.lines.length}`;
  };
  view.querySelector('#play').onclick = () => speakLines(d.lines, { rate, onLine: mark });
  view.querySelector('#lines').addEventListener('click', (e) => {
    const b = e.target.closest('[data-line]');
    if (!b) return;
    const i = Number(b.dataset.line);
    speakLines([d.lines[i]], { rate, onLine: (n) => mark(n < 0 ? -1 : i) });
  });
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

// A short passage to read, as the exam asks: Japanese first, English only on request.
function renderReading(step) {
  const r = step.ref;
  view.innerHTML = `<div class="card gloss-zone">
      <span class="caps"><span class="jp">読解</span> Reading</span>
      <h3>${r.title}</h3>
      <p class="small muted">Read it through on your own first. Tap a word for its meaning, or the speaker to hear a line.</p>
      <div class="reading" id="lines">${r.lines.map((l, i) => `<div class="rdline" data-i="${i}"><div class="grow">
        <div class="stem jp">${wordLine(l.t)}</div>
        <p class="romaji">${lineRomaji(l.t)}</p><p class="small muted sen">${l.en}</p></div>
        <button class="say" data-line="${i}" aria-label="Play line ${i + 1}">${icons.speaker}</button></div>`).join('')}</div>
      <button class="btn ghost" id="show">Show the English</button>
      ${glossHtml()}
    </div>
    <div class="dock"><button class="btn" id="next">Answer the questions</button></div>`;
  bindGloss(view.querySelector('.gloss-zone'), data.glossary);
  view.querySelector('#lines').addEventListener('click', (e) => {
    const b = e.target.closest('[data-line]');
    if (b) speakLines([{ t: r.lines[Number(b.dataset.line)].t }], { rate: NORMAL });
  });
  view.querySelector('#show').onclick = (e) => {
    view.querySelector('#lines').classList.add('open');
    e.currentTarget.hidden = true;
  };
  view.querySelector('#next').onclick = advance;
}

/* ---------- Stories ---------- */

// Each unit's chapter opens once its test is passed, and uses only words taught so far.
const storyOf = (unitId) => (data.stories || []).find((s) => s.unit === unitId);
const PITCH = { A: 1.15, B: 0.8 };

function screenStory(unitId) {
  const story = storyOf(unitId);
  const unit = data.units.find((u) => u.id === unitId);
  if (!story || !unit || !state.course.passed[unitId]) { location.replace('#/course'); return; }
  setTop(`Story ${unit.n}`, backTo('#/course'));
  let rate = NORMAL;
  let playing = -1;
  const read = state.course.stories?.[unitId];
  view.innerHTML = `
    <section class="card story-head">
      <span class="caps"><span class="jp">物語</span> Chapter ${unit.n}${read ? ' · read' : ''}</span>
      <h2>${story.title}</h2>
      <div class="row tight">
        <button class="btn small-btn" id="play">${icons.play}<span>Play chapter</span></button>
        <div class="seg mini" id="speed"><button class="on" data-r="${NORMAL}">Normal</button><button data-r="${SLOW}">Slow</button></div>
      </div>
      <p class="small muted">Every word here is one you have learned. Tap a line to hear it, a word for its meaning.</p>
    </section>
    <div class="row tight"><span class="grow"></span><button class="chip" id="showall">Show all English</button></div>
    <section class="card story gloss-zone" id="lines">
      ${story.lines.map((l, i) => `<div class="sline ${story.cast[l.s] === 'B' ? 'b' : ''}" data-i="${i}">
        <span class="who jp">${l.s}</span>
        <div class="grow"><div class="stem jp">${wordLine(l.t)}</div>
          <p class="romaji">${lineRomaji(l.t)}</p><p class="sen small">${l.en}</p></div>
        <button class="say" data-line aria-label="Play line">${icons.speaker}</button></div>`).join('')}
      ${glossHtml()}
    </section>
    <div class="dock"><button class="btn" id="done">${read ? 'Back to the course' : 'Finish the chapter'}</button></div>`;
  const lines = view.querySelectorAll('.sline');
  bindGloss(view.querySelector('#lines'), data.glossary);
  const mark = (i) => lines.forEach((el, n) => el.classList.toggle('now', n === i));
  const say = (i, chain) => {
    playing = i;
    mark(i);
    const l = story.lines[i];
    speakStep(l.t, {
      rate, pitch: PITCH[story.cast[l.s]] || 1,
      onend: () => {
        if (chain && i + 1 < story.lines.length) setTimeout(() => { if (playing === i) say(i + 1, true); }, 350);
        else { playing = -1; mark(-1); }
      },
    });
  };
  view.querySelector('#play').onclick = () => say(0, true);
  view.querySelector('#speed').onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rate = Number(b.dataset.r);
    view.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
  };
  view.querySelector('#lines').addEventListener('click', (e) => {
    if (e.target.closest('[data-word]')) return;
    const line = e.target.closest('.sline');
    if (!line) return;
    line.classList.add('open');
    say(Number(line.dataset.i), false);
  });
  view.querySelector('#showall').onclick = (e) => {
    const open = !view.querySelector('#lines').classList.contains('all');
    view.querySelector('#lines').classList.toggle('all', open);
    e.currentTarget.textContent = open ? 'Hide English' : 'Show all English';
  };
  view.querySelector('#done').onclick = () => {
    if (!read) {
      (state.course.stories ||= {})[unitId] = Date.now();
      save(state);
    }
    location.hash = '#/course';
  };
  screenCleanup = () => { playing = -1; cancel(); };
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
  // After a resume, the count at the start already held some of this lesson's kanji, so "before" comes from the gain.
  const kanjiFrom = Math.min(run.kanjiBefore, Math.max(0, kanjiNow - kanji.length));
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
      <div class="row"><span class="grow">Kanji collected</span><span class="num">${kanjiNow > kanjiFrom ? `${kanjiFrom} → ` : ''}<b>${kanjiNow}</b> / ${data.kanji.length}</span></div>
      <div class="row"><span class="grow">Course<div class="meter"><i style="width:${(steps.done / steps.total) * 100}%"></i></div></span><span class="num">${steps.done} / ${steps.total}</span></div>
    </section>
    <div class="dock stack">
      ${go ? `<button class="btn" id="go">${run.part ? 'Keep going: part 2' : `Next: ${go.label.replace(/^(Take the|Start|Open the) /, '')}`}</button>` : ''}
    </div>`;
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
  animate();
  requestAnimationFrame(() => requestAnimationFrame(() => {
    const fg = view.querySelector('#ringfg');
    if (fg) fg.style.strokeDashoffset = C * (1 - share);
  }));
}

/* ---------- Other tabs ---------- */

// Kanji Rush plays the kanji you have met: N5 kanji you've studied or reached in the course,
// and the other kanji in words from lessons you've finished. Topped up so there's always a field.
function rushPool() {
  const seen = data.kanji.filter((k) => state.items[kanjiId(k)]);
  const doneWords = (data.units || []).flatMap((u) => u.lessons.filter((l) => state.course.done[l.id]).flatMap((l) => l.words || []));
  const fromWords = kanjiIn(doneWords.join('')).filter((k) => !data.kanji.includes(k));
  const pool = [...new Set([...seen, ...levelKanji(), ...fromWords])];
  return pool.length >= 8 ? pool : [...new Set([...pool, ...data.kanji])].slice(0, 8);
}

// Best scores are kept per mode and clock. The old single best was for meanings at 60 seconds.
const rushBest = (key) => state.practice.rushBests?.[key] ?? (key === 'meaning-60' ? state.practice.rushBest || 0 : 0);

const headCache = new Map();
function screenRush() {
  screenCleanup = startRush({
    view, setTop, pool: rushPool(), all: [...data.kanji, ...(data.kanjiMore || [])], readOf: (k) => headCache.get(k) ?? headCache.set(k, headReading(k)).get(k),
    settings: state.practice.rush || {},
    saveSettings: (s) => { state.practice.rush = s; save(state); },
    best: rushBest,
    onBest: (key, n) => {
      (state.practice.rushBests ||= {})[key] = n;
      if (key === 'meaning-60') state.practice.rushBest = n;
      save(state);
    },
    onExit: () => { location.hash = '#/dojo'; },
  });
}

/* ---------- Trip ---------- */

const pct = (x) => `${Math.round(x * 100)}%`;
const sceneOf = (id) => data.trip.find((s) => s.id === id);

function startPart(scene, part) {
  const { steps, useSrs } = partSteps(scene, part.key, state.items);
  if (!steps.length) return;
  startRun(steps, `${scene.title} · ${part.label}`, { useSrs });
}

// What a part has waiting: new items, due ones, or nothing (free practice).
function partNote(st, key) {
  if (st.fresh && st.due) return `${st.fresh} new · ${st.due} due`;
  if (st.fresh && key === 'play') return st.fresh === 1 ? 'Not played yet' : `${st.fresh} to play`;
  if (st.fresh) return st.fresh === st.total ? `${st.total} to learn` : `${st.fresh} new`;
  if (st.due) return `${st.due} due`;
  return 'Done for now · practice';
}

const countdown = () => {
  const days = daysUntil(state.trip?.date);
  if (days === null) return '';
  if (days > 1) return `Japan in ${days} days`;
  if (days === 1) return 'Japan tomorrow';
  if (days === 0) return 'Japan today';
  return 'Back from Japan';
};

// Home: the trip's next step, one tap away.
function tripCard() {
  if (!data.trip?.length) return '';
  const next = nextPart(data.trip, state.items);
  const ready = tripReadiness(data.trip, state.items);
  return `<button class="card trip-card" id="tripgo">
    <span class="water" aria-hidden="true">旅</span>
    <span class="caps">${countdown() || 'Trip'} · ${pct(ready)} ready</span>
    <strong>${next ? `${next.scene.title}: ${next.part.label}` : 'All caught up'}</strong>
    <span class="small muted">${next ? next.part.desc : 'Practise any scene from the Trip tab'}</span>
    <span class="bar"><i style="width:${pct(ready)}"></i></span>
  </button>`;
}

function screenTrip() {
  setTop('Trip');
  const next = nextPart(data.trip, state.items);
  const ready = tripReadiness(data.trip, state.items);
  const date = state.trip?.date || '';
  view.innerHTML = `
    <section class="card hero trip-hero">
      <span class="water" aria-hidden="true">旅</span>
      <span class="caps">${countdown() || 'Your trip to Japan'}</span>
      <h2>${pct(ready)} ready</h2>
      <span class="bar"><i style="width:${pct(ready)}"></i></span>
      <label class="trip-date"><span class="small">Trip date</span><input type="date" id="tripdate" value="${date}"></label>
      ${next ? `<button class="btn" id="next">Next: ${next.scene.title} · ${next.part.label}</button>` : ''}
    </section>
    <div class="caps sect"><span>Scenes</span></div>
    ${data.trip.map((s, n) => `<a class="scene-row card" href="#/trip/${s.id}">
      <span class="scene-jp jp" aria-hidden="true">${s.jp}</span>
      <span class="grow"><span class="caps">Scene ${n + 1}</span><strong>${s.title}</strong>
        <span class="bar"><i style="width:${pct(readiness(s, state.items))}"></i></span></span>
      <span class="num small">${pct(readiness(s, state.items))}</span><span class="chev">${icons.chevron}</span></a>`).join('')}
    ${COMING.length ? `<p class="small muted center">On the way: ${COMING.join(', ')}.</p>` : ''}`;
  view.querySelector('#tripdate').onchange = (e) => {
    state.trip = { ...state.trip, date: e.target.value || null };
    save(state);
    screenTrip();
  };
  view.querySelector('#next')?.addEventListener('click', () => startPart(next.scene, next.part));
}

function screenScene(id) {
  const scene = sceneOf(id);
  if (!scene) { location.replace('#/trip'); return; }
  setTop(scene.title, backTo('#/trip'));
  const next = nextPart([scene], state.items);
  view.innerHTML = `
    <section class="card hero">
      <span class="water jp" aria-hidden="true">${scene.jp}</span>
      <span class="caps">${pct(readiness(scene, state.items))} ready</span>
      <h2>${scene.title}</h2>
      <span class="sub">${scene.blurb}</span>
      <div class="sign-strip">${scene.signs.slice(0, 4).map((s) => signHtml(s)).join('')}</div>
    </section>
    ${PARTS.map((p) => {
    const st = partStatus(scene, p.key, state.items);
    const now = next?.part.key === p.key;
    return `<button class="action part-row ${now ? 'now' : ''}" data-part="${p.key}">
      <span class="icbox jp">${p.jp}</span>
      <span class="grow"><strong>${p.label}</strong>
        <span class="small">${p.key === 'play' ? scene.play.map((x) => x.title).join(' · ') : p.desc}</span>
        <span class="small muted">${partNote(st, p.key)}</span></span>
      <span class="num small">${pct(st.ready)}</span><span class="chev">${icons.chevron}</span></button>`;
  }).join('')}`;
  view.onclick = (e) => {
    const b = e.target.closest('[data-part]');
    if (b) startPart(scene, PARTS.find((p) => p.key === b.dataset.part));
  };
}

function screenDojo() {
  setTop('Dojo');
  const rush = { mode: 'meaning', secs: 60, penalty: true, ...state.practice.rush };
  const best = rushBest(rushKey(rush));
  const done = courseSentences().length;
  const action = (id, icon, name, sub, off = false) => `<button class="action" id="${id}" ${off ? 'disabled' : ''}><span class="icbox">${icon}</span>
    <span class="grow"><strong>${name}</strong><span class="small">${sub}</span></span><span class="chev">${icons.chevron}</span></button>`;
  view.innerHTML = `
    <button class="card hero rush-tile" id="rush">
      <span class="water" aria-hidden="true">速</span>
      <span class="caps">${rush.secs ? `${rush.secs} seconds` : 'No clock'} · ${rush.mode === 'reading' ? 'Readings' : 'Meanings'}${best ? ` · Best ${best}` : ''}</span>
      <h2>Kanji Rush</h2>
      <span class="sub">Match kanji to their meanings or readings, fast. Set the clock your way.</span>
    </button>
    ${action('cards', icons.story, 'Flashcards', 'Words and sentences to read, by unit or all of N5')}
    ${action('sent', icons.blocks, 'Sentence drill', done ? `${done} sentences from your finished lessons` : 'Finish a course lesson to fill this', !done)}
    ${action('part', icons.practice, 'Particles', 'Guides and unlimited practice, focused on what you miss')}
    ${action('kan', icons.kanji, 'Kanji', `All ${data.kanji.length} N5 kanji. Filter to the ones you struggle with or have notes on`)}
    ${action('exam', icons.exam, 'JLPT N5 mock exam', 'Only if you plan to sit the exam')}
    <p class="small muted center">Dojo practice doesn't change your review schedule.</p>`;
  view.querySelector('#rush').onclick = () => { location.hash = '#/dojo/rush'; };
  view.querySelector('#cards').onclick = () => { location.hash = '#/dojo/cards'; };
  view.querySelector('#sent').onclick = startCourseSentences;
  view.querySelector('#part').onclick = () => { location.hash = '#/dojo/particles'; };
  view.querySelector('#kan').onclick = () => { location.hash = '#/dojo/kanji'; };
  view.querySelector('#exam').onclick = () => { location.hash = '#/dojo/exam'; };
}

const backTo = (hash) => ({ close: true, back: true, onClose: () => { location.hash = hash; } });

// Sentence building from lessons you've finished: ones not yet built cleanly come first.
const courseSentences = () => levelSentences(LEVELS.find((l) => l.course), state, data);
function startCourseSentences() {
  const list = courseSentences();
  if (!list.length) return;
  const order = [...shuffled(list.filter((s) => !state.practice.sent[s.id])), ...shuffled(list.filter((s) => state.practice.sent[s.id]))];
  startRun(order.map((s) => ({ type: 'sentence', id: `s:${s.id}`, ref: s })), 'Sentence drill', {
    onDrill: (step, clean) => {
      if (clean) {
        state.practice.sent[step.ref.id] = 1;
        save(state);
      }
    },
  });
}

function startParticles(title, choice, lead = []) {
  const stats = state.practice.part;
  // The last few sentences sit out, so the same one never comes straight back.
  const recent = [];
  const nextItem = () => {
    const ref = particleItem(data.bank, { ...choice, stats, recent });
    recent.push(ref.id);
    if (recent.length > 8) recent.shift();
    return { type: 'particle', id: 'free', ref, set: {} };
  };
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

// One screen for particles: practise them all, two side by side, or one with its guide first.
function screenParticleChoice() {
  setTop('Particles', backTo('#/dojo'));
  const { cards, sets } = data.particles;
  const usable = PAIRS.filter((pair) => data.bank.frames.some((f) => pair.includes(f.a) && f.w[pair.find((p) => p !== f.a)]));
  const seen = Object.values(state.practice.part).reduce((n, s) => n + s.seen, 0);
  view.innerHTML = `
    <section class="card hero">
      <span class="caps">Unlimited${seen ? ` · ${seen} answered` : ''}</span>
      <h2>All particles</h2>
      <p class="sub">New sentences every time, for as long as you like. What you miss comes back more often. Tap Exit to stop.</p>
      <button class="btn" id="all">Start</button>
    </section>
    <div class="caps sect"><span>Tell two apart</span></div>
    <section class="pgrid" id="pairs">${usable.map((pair) => `<button class="ptile short" data-pair="${pair.join(',')}"><b>${pair.join(' ')}</b><small>Compare</small></button>`).join('')}</section>
    <div class="caps sect"><span>One particle</span><span class="muted">Guide, then practice</span></div>
    <section class="pgrid" id="one">${cards.map((c) => `<button class="ptile" data-p="${c.p}"><b>${c.p}</b><small>${c.name}</small></button>`).join('')}</section>`;
  view.querySelector('#all').onclick = () => startParticles('Particles', {});
  view.querySelector('#pairs').onclick = (e) => {
    const b = e.target.closest('[data-pair]');
    if (b) startParticles('Particles', { pair: b.dataset.pair.split(',') });
  };
  view.querySelector('#one').onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const card = cards.find((c) => c.p === b.dataset.p);
    const guided = sets.flatMap((set) => set.items.filter((it) => it.answer === card.p)
      .map((it) => ({ type: 'particle', id: `p:${it.id}`, ref: it, set })));
    startParticles(card.name, { focus: card.p }, [{ type: 'particleCard', ref: card }, ...guided]);
  };
}

/* ---------- Course ---------- */

function screenCourse() {
  setTop('Course');
  const units = data.units;
  const next = nextUp(state, units);
  const passed = units.filter((u) => state.course.passed[u.id]).length;
  const steps = courseSteps(state, units);
  const rank = rankOf(passed);
  // Units up to two past the current one are shown; the rest fold into one row.
  const here = next?.unit ? units.indexOf(next.unit) : units.length - 1;
  const shown = units.slice(0, here + 2);
  const folded = units.length - shown.length;
  // One signal per unit: lesson dots until it's passed, then stars for how well it's remembered.
  const node = (u) => {
    const p = unitProgress(state, u);
    const open = isUnlocked(state, units, u);
    const now = u === next?.unit;
    const sub = p.passed ? '' : now ? `${p.done} of ${p.total} lessons${p.done === p.total ? ' · test ready' : ''}`
      : open ? u.goal : 'Locked · pass its test to skip ahead';
    return `<a class="node ${p.passed ? 'done' : ''} ${now ? 'now' : ''} ${open ? '' : 'off'}" href="#/course/${u.id}">
        <span class="dot">${p.passed ? icons.check : open ? u.n : icons.lock}</span>
        <span class="grow"><span class="label">${u.title}</span>
          <span class="nsub">${p.passed ? `<span class="stars">${starHtml(unitStars(state, u))}</span>` : `${pips(u)}<span class="small muted">${sub}</span>`}</span></span>
        <span class="chev">${icons.chevron}</span></a>`;
  };
  // A unit's story chapter sits just after it on the path, open once the unit is passed.
  const storyNode = (u) => {
    const open = Boolean(state.course.passed[u.id]);
    // A locked chapter shows only for the unit you're on, as something to aim for.
    if (!storyOf(u.id) || (!open && u !== next?.unit)) return '';
    const read = state.course.stories?.[u.id];
    const inner = `<span class="dot">${open ? icons.story : icons.lock}</span>
        <span class="grow"><span class="label">Story: ${storyOf(u.id).title}</span>
          <span class="small muted">${open ? (read ? 'Read · on Radio' : 'New chapter, all words you know') : `Pass Unit ${u.n} to read`}</span></span>`;
    return open ? `<a class="node story-node ${read ? 'done' : 'unread'}" href="#/course/story/${u.id}">${inner}<span class="chev">${icons.chevron}</span></a>`
      : `<div class="node story-node off">${inner}</div>`;
  };
  // The next step starts from Home; this tab is the map.
  view.innerHTML = `
    <section class="course-strip">
      <div class="row tight"><span class="grow"><span class="jp">${rank.jp}</span> <strong>${rank.en}</strong></span>
        <span class="small muted num">${steps.done} of ${steps.total} steps</span></div>
      <div class="meter"><i style="width:${(steps.done / steps.total) * 100}%"></i></div>
      <a class="syl-link small" href="#/course/syllabus">See the full N5 syllabus${icons.chevron}</a>
    </section>
    <section class="path">${shown.map((u) => node(u) + storyNode(u)).join('')}
      ${folded ? `<div class="node off fold"><span class="dot">${icons.lock}</span><span class="grow"><span class="label">Units ${shown.length + 1}–${units.length}</span>
        <span class="small muted">Open as you pass each unit</span></span></div>` : ''}
    </section>
    <p class="small muted center">★ passed · ★★ most of it remembered · ★★★ mastered</p>`;
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
  // After the last unit the course is done; the mock exam waits in Dojo for anyone who wants it.
  return null;
}

// Reviews on their own, for a pocket of time too short for a lesson.
function startReviews() {
  const due = reviewSteps(state, data);
  if (due.length) startRun(due, 'Reviews', { useSrs: true });
}

// Three mastery stars, filled up to n.
const starHtml = (n) => [1, 2, 3].map((i) => `<i class="${i <= n ? 'on' : ''}">★</i>`).join('');


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
      let cleared = [];
      if (result.pass) {
        cleared = passUnit(state, data.units, unit);
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
          ],
        };
      }
      const passed = data.units.filter((u) => state.course.passed[u.id]).length;
      const rank = rankOf(passed);
      const rose = rankOf(passedBefore).at !== rank.at;
      const next = nextUp(state, data.units);
      const go = nextAction(next);
      // Stories unlocked by this pass: the unit's own chapter, plus any from skipped units.
      const story = [unit, ...cleared].map((u) => storyOf(u.id)).find((s) => s && !state.course.stories?.[s.unit]);
      const skipped = cleared.filter((u) => u !== unit);
      const toGo = rank.next ? rank.next.at - passed : 0;
      return {
        note: `${skipped.length ? `Units ${skipped[0].n}–${unit.n} cleared: testing out passes the units before it too.` : `Unit ${unit.n} cleared.`} ${passed} of ${data.units.length} units passed.`,
        badge: `<div class="rankup ${rose ? '' : 'quiet'}"><span class="jp">${rank.jp}</span><span><small>${rose ? 'New rank' : 'Rank'}</small><b>${rank.en}</b>${rank.next
          ? `<small>${toGo} more ${toGo === 1 ? 'unit' : 'units'} to ${rank.next.en}</small>` : ''}</span></div>
          ${story ? `<p class="unlock">${icons.story}<span><small>Story unlocked</small><b>${story.title}</b></span></p>` : ''}`,
        actions: [
          ...(go ? [{ label: next.type === 'lesson' ? `Start Unit ${next.unit.n}` : go.label, run: go.go }] : []),
          ...(story ? [{ label: 'Read the new story', run: () => { location.hash = `#/course/story/${story.unit}`; } }] : []),
        ],
      };
    },
  }, unitTest(unit, data));
}

// What a lesson covers, as a textbook would label it.
function lessonKind(unit, lesson) {
  if (isWords(lesson)) return `Words · ${(lesson.words || []).length}${unit.reading ? ' · Reading' : ''}`;
  const lastGrammar = unit.lessons.filter((l) => !isWords(l)).at(-1) === lesson;
  return `Grammar${lesson.kanji?.length ? ` · Kanji ${lesson.kanji.join(' ')}` : ''}${lastGrammar && unit.dialogue ? ' · Listening' : ''}`;
}

// The unit's parts at a glance: grammar, words, kanji, reading and listening.
function unitContents(unit) {
  const grammar = unit.lessons.filter((l) => !isWords(l)).length;
  const words = new Set(unit.lessons.flatMap((l) => l.words || [])).size;
  const kanji = unit.lessons.flatMap((l) => l.kanji || []);
  const cell = (n, label) => `<div class="uc"><b>${n}</b><span>${label}</span></div>`;
  return `<section class="ucontents">
    ${cell(grammar, grammar === 1 ? 'grammar point' : 'grammar points')}${cell(words, 'words')}${cell(kanji.length, 'kanji')}
    ${unit.reading ? cell('読', 'reading') : ''}${unit.dialogue ? cell('聞', 'listening') : ''}</section>`;
}

// Every grammar point in the course, with where it's taught and whether you've done it.
function screenSyllabus() {
  setTop('N5 syllabus', backTo('#/course'));
  const done = (l) => state.course.done[l.id];
  const all = data.units.flatMap((u) => u.lessons.filter((l) => !isWords(l)));
  view.innerHTML = `
    <section class="course-strip">
      <div class="row tight"><span class="grow"><strong>Grammar points</strong></span>
        <span class="small muted num">${all.filter(done).length} of ${all.length} done</span></div>
      <div class="meter"><i style="width:${(all.filter(done).length / all.length) * 100}%"></i></div>
    </section>
    ${data.units.map((u) => `<div class="caps sect"><span>Unit ${u.n} · ${u.title}</span>${state.course.passed[u.id] ? `<span>${icons.check}</span>` : ''}</div>
      <section class="card list syl">${u.lessons.filter((l) => !isWords(l)).map((l) => `<a class="row tap" href="#/course/${u.id}">
        <span class="unum ${done(l) ? 'on' : ''}">${done(l) ? icons.check : ''}</span>
        <span class="grow"><span class="label">${l.title}</span>${l.pattern ? `<span class="small muted jp">${l.pattern}</span>` : ''}</span></a>`).join('')}
      </section>`).join('')}
    <p class="small muted center">Each unit also has a Words lesson, a reading and a dialogue.</p>`;
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
      <div class="kod-head"><span class="caps">Unit ${unit.n}</span>${p.passed ? `<span class="stars">${starHtml(unitStars(state, unit))}</span>` : pips(unit)}</div>
      <h3>${unit.title}</h3>
      <p class="small">By the end, you can: ${unit.goal.toLowerCase()}.</p>
      ${open ? '' : '<p class="small muted">This unit is locked. If you already know the material, pass this unit\'s test to skip ahead to it.</p>'}
    </section>
    ${unitContents(unit)}
    <section class="card list">${unit.lessons.map((l, i) => `<button class="row tap lessonrow" data-i="${i}" ${open ? '' : 'disabled'}>
        <span class="unum ${state.course.done[l.id] ? 'on' : ''}">${state.course.done[l.id] ? icons.check : i + 1}</span>
        <span class="grow"><span class="caps">${lessonKind(unit, l)}</span><span class="label">${l.title.replace(/^Words: (.)/, (_, c) => c.toUpperCase())}</span></span><span class="chev">${icons.chevron}</span></button>`).join('')}
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
  setTop('Mock exam', backTo('#/dojo'));
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

// Struggling: rated Forgot or Shaky, until you get it right 3 reviews in a row. Hardest first.
function strugglingKanji() {
  return Object.keys(state.items)
    .filter((id) => id.startsWith('k:') && isStruggling(state.items[id]))
    .map((id) => kanjiOf(id.slice(2))).filter(Boolean)
    .sort((a, b) => struggleOrder(state.items[kanjiId(a)], state.items[kanjiId(b)]));
}
const notedKanji = () => Object.keys(state.notes).map(kanjiOf).filter(Boolean);

const KANJI_VIEWS = [
  { id: 'all', name: 'All', list: () => data.kanji },
  { id: 'hard', name: 'Struggling', list: strugglingKanji,
    empty: `Nothing here. Kanji you rate Forgot or Shaky show up here, and leave once you get them right ${CLEARS} reviews in a row.` },
  { id: 'notes', name: 'Notes', list: notedKanji,
    empty: 'No notes yet. Open any kanji and tap "+ Add your note" above its breakdown.' },
];

function screenKanji() {
  setTop('Kanji', backTo('#/dojo'));
  const pick = KANJI_VIEWS.find((v) => v.id === state.practice.kanjiView) || KANJI_VIEWS[0];
  const list = pick.list();
  const started = data.kanji.filter((k) => state.items[kanjiId(k)]).length;
  const steps = list.map((x) => ({ type: 'learn', kind: 'kanji', id: kanjiId(x), ref: x }));
  // The bar under a tile shows its memory stage: a third for Learning, two for Strong, full for Mastered.
  const stage = (k) => stageOf(state.items[kanjiId(k)]);
  view.innerHTML = `
    <section class="card">
      <div class="row" style="min-height:0"><span class="grow"><strong>JLPT N5</strong></span>
        <span class="small muted"><span class="num">${started}</span> of ${data.kanji.length} started</span></div>
      <div class="meter"><i style="width:${(started / data.kanji.length) * 100}%"></i></div>
    </section>
    <div class="seg mini" id="kview">${KANJI_VIEWS.map((v) => `<button data-v="${v.id}" class="${v === pick ? 'on' : ''}">
      ${v.name}${v.id === 'all' ? '' : ` <span class="num">${v.list().length}</span>`}</button>`).join('')}</div>
    ${list.length ? `<div class="grid" id="grid">${list.map((k, i) => `<button class="tile" data-i="${i}">
      ${noteOf(k.k) ? '<span class="tnote" aria-label="Has your note"></span>' : ''}
      <b>${k.k}</b><small>${k.mean[0]}</small>${stage(k) ? `<i class="s-${STAGES[stage(k)].id}" style="width:${(stage(k) / 3) * 100}%"></i>` : ''}</button>`).join('')}</div>`
    : `<p class="small muted center">${pick.empty}</p>`}
    <p class="small muted center">The bar fills as a kanji moves from ${STAGES.slice(1).map((s) => `<span class="jp">${s.jp}</span> ${s.en}`).join(' to ')}. A dot means it has your note.</p>`;
  view.querySelector('#kview').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    state.practice.kanjiView = b.dataset.v;
    save(state);
    screenKanji();
  };
  view.querySelector('#grid')?.addEventListener('click', (e) => {
    const b = e.target.closest('.tile');
    if (b) startRun(steps, pick.id === 'all' ? 'Kanji' : pick.name, { browse: true, start: Number(b.dataset.i) });
  });
}

/* ---------- Flashcards ---------- */

// The front of a card: picture, then the Japanese. The back: reading, meaning and kanji.
function flashFront(card) {
  const pic = emojiOf(card, data.emoji || {});
  return `${pic ? `<div class="femoji" aria-hidden="true">${pic}</div>` : ''}
    ${card.kind === 'word'
    ? `<div class="fword jp">${card.w}</div>`
    : `<div class="stem jp fsent">${wordLine(card.t)}</div>`}`;
}

function flashBack(card) {
  if (card.kind === 'sentence') return `<p class="romaji">${lineRomaji(card.t)}</p><p class="en">${card.en}</p>`;
  const g = data.glossary[card.w] || {};
  const y = g.y || card.w;
  return `<p>${y === card.w ? '' : `<span class="jp">${y}</span> · `}${g.ro || romaji(y)}</p>
    <p class="en">${g.m || ''}</p>${wordKanjiHtml(card.w, y)}`;
}

const sayOf = (card) => (card.kind === 'word' ? data.glossary[card.w]?.y || card.w : card.t);
function playCard(card) {
  if (card.kind === 'word') speak(sayOf(card));
  else speakLines([{ t: card.t }], { rate: NORMAL });
}

function screenCards() {
  setTop('Flashcards', backTo('#/dojo'));
  const pref = (state.practice.cards ||= { kind: 'w' });
  const units = data.units;
  const done = state.course.done;
  const count = (id) => deckOf(id, units, done).length;
  const row = (id, name, sub) => {
    const n = count(id);
    return `<button class="action" data-deck="${id}" ${n ? '' : 'disabled'}><span class="grow"><strong>${name}</strong>
      <span class="small">${n ? `${n} cards` : 'Finish a lesson to fill this'}${sub ? ` · ${sub}` : ''}</span></span><span class="chev">${icons.chevron}</span></button>`;
  };
  const k = pref.kind;
  view.innerHTML = `
    <div class="seg" id="kind"><button data-k="w" class="${k === 'w' ? 'on' : ''}">Words</button><button data-k="s" class="${k === 's' ? 'on' : ''}">Sentences</button></div>
    <p class="small muted">${k === 'w' ? 'See the word, say it, then flip for the reading, meaning and kanji.' : 'Read the sentence out loud, then flip for the romaji and English. Tap any word for help.'}</p>
    ${row(`done-${k}`, 'What you\'ve learned', 'from finished lessons')}
    ${row(`all-${k}`, 'All of N5', 'the whole course')}
    <div class="caps sect"><span>By unit</span></div>
    ${units.map((u) => row(`${u.id}-${k}`, `Unit ${u.n} · ${u.title}`, unitProgress(state, u).done ? '' : 'not started')).join('')}
    <p class="small muted center">Flashcards are practice only. They don't change your review schedule.</p>`;
  view.querySelector('#kind').onclick = (e) => {
    const b = e.target.closest('[data-k]');
    if (!b) return;
    pref.kind = b.dataset.k;
    save(state);
    screenCards();
  };
  view.querySelectorAll('[data-deck]').forEach((b) => { b.onclick = () => { location.hash = `#/dojo/cards/${b.dataset.deck}`; }; });
}

function screenDeck(id) {
  const base = deckOf(id, data.units, state.course.done);
  if (!base.length) { location.replace('#/dojo/cards'); return; }
  const [scope] = id.split('-');
  const unit = data.units.find((u) => u.id === scope);
  setTop(unit ? `Unit ${unit.n} cards` : scope === 'all' ? 'All of N5' : 'What you\'ve learned', backTo('#/dojo/cards'));
  let deck = base;
  let i = 0;
  let open = false;
  const draw = () => {
    const card = deck[i];
    view.innerHTML = `
      <div class="fbar"><span class="small muted"><b class="num">${i + 1}</b> / ${deck.length}</span>
        <button class="pill" id="shuf">${deck === base ? 'Shuffle' : 'In order'}</button></div>
      <section class="card fcard gloss-zone ${open ? 'open' : ''}">
        <span class="caps">Unit ${card.unit.n}${card.kind === 'word' ? '' : ' · Read it out loud'}</span>
        ${flashFront(card)}
        <button class="say fsay" id="say" aria-label="Listen">${icons.speaker}</button>
        <div class="fback">${open ? flashBack(card) : ''}</div>
        ${card.kind === 'sentence' ? glossHtml() : ''}
      </section>
      <div class="dock fnav">
        <button class="btn ghost" id="prev" ${i ? '' : 'disabled'} aria-label="Previous card">${icons.back}</button>
        <button class="btn" id="flip">${open ? (i + 1 < deck.length ? 'Next card' : 'Start again') : 'Flip'}</button>
      </div>`;
    // A new card starts at the top; a flipped one stays where you were reading.
    if (!open) window.scrollTo(0, 0);
    if (card.kind === 'sentence') bindGloss(view.querySelector('.gloss-zone'), data.glossary);
    view.querySelector('#say').onclick = () => playCard(card);
    view.querySelector('#prev').onclick = () => { i--; open = false; draw(); };
    view.querySelector('#flip').onclick = () => {
      if (!open) { open = true; draw(); return; }
      i = (i + 1) % deck.length;
      open = false;
      draw();
    };
    view.querySelector('#shuf').onclick = () => {
      deck = deck === base ? shuffled(base) : base;
      i = 0;
      open = false;
      draw();
    };
  };
  draw();
}

/* ---------- Dictionary ---------- */

const escHtml = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' })[c]);
// Loaded the first time the dictionary opens: it's the app's biggest file.
let dictIndex = null;
let dictQuery = '';
function loadDict() {
  dictIndex ||= fetch(`data/dict.json${new URL(import.meta.url).search}`)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => makeIndex(d.words))
    .catch((err) => { dictIndex = null; throw err; });
  return dictIndex;
}

// The first unit that teaches each word, by every spelling the course uses.
let taughtIn = null;
function unitOfWord(e) {
  if (!taughtIn) {
    taughtIn = new Map();
    for (const u of data.units) for (const l of u.lessons) for (const w of l.words || []) if (!taughtIn.has(w)) taughtIn.set(w, u);
  }
  return taughtIn.get(e.w) || taughtIn.get(e.y);
}

function dictRow(e, i) {
  const u = unitOfWord(e);
  return `<button class="dres" data-i="${i}">
    <span class="dres-w jp">${escHtml(e.head)}</span>
    <span class="grow"><span class="small">${e.head === e.y ? '' : `<span class="jp">${escHtml(e.y)}</span> · `}${romaji(e.y)}</span>
      <span class="dres-m">${escHtml(e.senses[0].join('; '))}</span></span>
    ${u ? `<span class="tag">U${u.n}</span>` : e.f & DICT_N5 ? '<span class="tag">N5</span>' : ''}</button>`;
}

function dictCard(e) {
  const u = unitOfWord(e);
  const others = e.forms.filter((f) => f !== toHiragana(e.head) && f !== e.y && f !== toHiragana(e.w));
  const kanjiPart = e.w !== e.y ? wordKanjiHtml(e.w, e.y) : '';
  return `<section class="card dcard">
    <div class="dhead"><span class="dword jp">${escHtml(e.head)}</span>${sayBtn(e.y)}</div>
    <p>${e.head === e.y ? '' : `<span class="jp">${escHtml(e.y)}</span> · `}${romaji(e.y)}</p>
    <p class="small muted">${[posName(e.pos), e.f & DICT_N5 ? 'JLPT N5' : '', e.f & KANA_ONLY && e.w !== e.y ? `usually written in kana (${escHtml(e.w)})` : '']
      .filter(Boolean).join(' · ')}</p>
    <ol class="senses">${e.senses.map((s) => `<li>${escHtml(s.join('; '))}</li>`).join('')}</ol>
    ${others.length ? `<p class="small muted">Also written <span class="jp">${escHtml(others.join('、'))}</span></p>` : ''}
    ${u ? `<a class="syl-link" href="#/course/${u.id}">Taught in Unit ${u.n} · ${escHtml(u.title)}</a>` : ''}
    ${kanjiPart}
  </section>`;
}

function screenDict() {
  setTop('Dictionary', backTo('#/today'));
  view.innerHTML = `
    <div class="dsearch">${icons.search}<input id="q" type="search" enterkeyhint="search" autocomplete="off" autocapitalize="off"
      spellcheck="false" placeholder="English, kana, kanji or romaji" aria-label="Search the dictionary" value="${escHtml(dictQuery)}"></div>
    <div id="detail"></div>
    <div id="results" class="dlist"></div>
    <div id="browse">
      ${BROWSE.map((b) => `<details class="card browse"><summary><strong>${b.title}</strong><span class="small muted">${b.items.length}</span></summary>
        <div class="list">${b.items.map(([w, y, en]) => `<div class="row brow"><button class="grow" data-find="${escHtml(w.replace('…', ''))}">
          <span class="jp">${w}</span> <span class="small muted">${w === y ? '' : `<span class="jp">${y}</span> · `}${romaji(y)}</span>
          <span class="small">${en}</span></button>${sayBtn(y)}</div>`).join('')}</div></details>`).join('')}
      <p class="small muted center">About 23,000 everyday words from JMdict, all offline. Tap a word in a list to look it up.</p>
    </div>`;
  const input = view.querySelector('#q');
  const results = view.querySelector('#results');
  const detail = view.querySelector('#detail');
  const browse = view.querySelector('#browse');
  let shown = [];
  let timer = null;
  const show = async (pick = false) => {
    dictQuery = input.value;
    detail.innerHTML = '';
    browse.hidden = !!dictQuery.trim();
    if (!dictQuery.trim()) { results.innerHTML = ''; return; }
    let index;
    try {
      index = await loadDict();
    } catch {
      results.innerHTML = '<p class="small muted center">The dictionary didn\'t load. Check your connection and try again.</p>';
      return;
    }
    if (input.value !== dictQuery) return;
    shown = search(index, dictQuery, 20);
    results.innerHTML = shown.length ? shown.map(dictRow).join('')
      : `<p class="small muted center">Nothing found for "${escHtml(dictQuery)}". Try a simpler word, or type it in kana.</p>`;
    if (pick && shown.length) detail.innerHTML = dictCard(shown[0]);
  };
  input.oninput = () => { clearTimeout(timer); timer = setTimeout(show, 120); };
  input.onkeydown = (e) => {
    if (e.key !== 'Enter') return;
    clearTimeout(timer);
    input.blur();
    show(true);
  };
  results.onclick = (e) => {
    const b = e.target.closest('.dres');
    if (!b) return;
    detail.innerHTML = dictCard(shown[Number(b.dataset.i)]);
    input.blur();
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };
  browse.onclick = (e) => {
    const b = e.target.closest('[data-find]');
    if (!b) return;
    input.value = b.dataset.find;
    show(true).then(() => window.scrollTo(0, 0));
  };
  if (dictQuery) show();
  else input.focus({ preventScroll: true });
  // Start loading while you type the first letters.
  loadDict().catch(() => {});
}

function screenSettings() {
  setTop('Settings', backTo('#/today'));
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
      <p class="small">Course lessons and exams are written for this app. The dictionary comes from JMdict, and words and kanji are checked against JMdict and KANJIDIC2 (Electronic Dictionary Research and Development Group, CC BY-SA 4.0). Talk phrases come from Tatoeba (tatoeba.org, CC BY 2.0 FR). Audio uses your device's Japanese voice.</p></section>`;
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
    setNotes(state.notes);
    save(state);
    applyTheme();
    settingsNotice = 'Progress restored from the backup.';
    screenSettings();
  };
}

const SCREENS = {
  today: screenToday,
  trip: screenTrip,
  course: screenCourse,
  listen: screenListen,
  dojo: screenDojo,
  'dojo/exam': screenExam,
  'dojo/rush': screenRush,
  'dojo/particles': screenParticleChoice,
  'dojo/kanji': screenKanji,
  'dojo/cards': screenCards,
  'course/syllabus': screenSyllabus,
  dict: screenDict,
  settings: screenSettings,
};

// Screens with a parameter: [pattern, screen].
const PARAM_SCREENS = [
  [/^course\/(u\d+)$/, (id) => screenUnit(id)],
  [/^trip\/(\w+)$/, (id) => screenScene(id)],
  [/^course\/story\/(u\d+)$/, (id) => screenStory(id)],
  [/^listen\/radio\/([\w-]+)$/, (id) => screenRadio(id)],
  [/^dojo\/cards\/(\w+-[ws])$/, (id) => screenDeck(id)],
];

// Old addresses: from before the tabs were reshuffled, and screens folded into others.
const MOVED = [[/^practice(\/|$)/, 'dojo$1'], [/^(listen\/)?talk(\/[\w-]+)?$/, 'listen'], [/^kanji$/, 'dojo/kanji'],
  [/^course\/exam$/, 'dojo/exam'], [/^dojo\/sentences$/, 'dojo'], [/^listen\/radio\/(starred|talk-[\w-]+)$/, 'listen']];

function route() {
  if (!data || run) return;
  screenCleanup?.();
  screenCleanup = null;
  view.onclick = null;
  const name = location.hash.replace('#/', '');
  const moved = MOVED.find(([re]) => re.test(name));
  if (moved) { location.replace(`#/${name.replace(moved[0], moved[1])}`); return; }
  let screen = SCREENS[name];
  for (const [re, fn] of PARAM_SCREENS) {
    const m = !screen && re.exec(name);
    if (m) screen = () => fn(m[1]);
  }
  // Settings sits outside the tabs; the rest light up the tab they belong to.
  const tab = screen ? name.split('/')[0] : 'today';
  tabbar.querySelectorAll('a').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  (screen || screenToday)();
  animate();
  window.scrollTo(0, 0);
}

/* ---------- Your notes on kanji ---------- */

// Every slot for this kanji on screen shows the note as it is now.
const redrawNotes = (c) => document.querySelectorAll(`.knote-slot[data-k="${c}"]`)
  .forEach((s) => { s.innerHTML = noteSlotInner(c, !s.hasAttribute('data-ro')); });

// Tap a note or "+ Add your note" to write in place; Save keeps it, an empty Save removes it.
function noteClick(e) {
  const open = e.target.closest('[data-note]');
  if (open) {
    const slot = open.closest('.knote-slot');
    slot.innerHTML = noteEditorHtml(slot.dataset.k);
    const box = slot.querySelector('textarea');
    const fit = () => { box.style.height = 'auto'; box.style.height = `${box.scrollHeight}px`; };
    box.addEventListener('input', fit);
    fit();
    box.focus();
    box.setSelectionRange(box.value.length, box.value.length);
    return;
  }
  const btn = e.target.closest('[data-note-save], [data-note-cancel]');
  if (!btn) return;
  const slot = btn.closest('.knote-slot');
  const c = slot.dataset.k;
  if (btn.hasAttribute('data-note-save')) {
    const text = slot.querySelector('textarea').value.trim();
    if (text) state.notes[c] = text;
    else delete state.notes[c];
    save(state);
  }
  redrawNotes(c);
}

async function init() {
  applyTheme();
  // Any listen button, on any screen.
  document.addEventListener('click', (e) => {
    unlockSpeech();
    unlockAudio();
    const el = e.target.closest('[data-say]');
    if (el) speak(el.dataset.say);
    noteClick(e);
    const info = e.target.closest('[data-info]');
    if (info) {
      const text = info.closest('.block-sec').querySelector('.explain');
      text.hidden = !text.hidden;
      info.setAttribute('aria-expanded', String(!text.hidden));
    }
  });
  // A swipe in from the left edge goes back: Previous in a session, Back on a sub-screen.
  let swipe = null;
  document.addEventListener('touchstart', (e) => {
    const t = e.touches[0];
    swipe = e.touches.length === 1 && t.clientX < 28 && swipeBack ? { x: t.clientX, y: t.clientY } : null;
  }, { passive: true });
  document.addEventListener('touchend', (e) => {
    const t = e.changedTouches[0];
    if (swipe && t.clientX - swipe.x > 80 && Math.abs(t.clientY - swipe.y) < 60) swipeBack?.();
    swipe = null;
  }, { passive: true });
  setTop('JP Trainer');
  tabbar.innerHTML = TABS.map(([id, text]) => `<a href="#/${id}" data-tab="${id}">${icons[id]}<span>${text}</span></a>`).join('');
  try {
    // Data files carry the same release tag that index.html gave this module.
    const tag = new URL(import.meta.url).search;
    const get = (f) => fetch(`data/${f}.json${tag}`).then((r) => {
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r.json();
    });
    const [kanji, vocab, sentences, particles, glossary, bank, talk, stories, kanjiMore, trip, audio, emoji, ...rest] = await Promise.all([
      ...['kanji-n5', 'vocab-n5', 'sentences', 'particles', 'glossary', 'particle-bank'].map(get),
      get('talk').catch(() => ({ categories: [], lex: {} })),
      get('stories').catch(() => []),
      get('kanji-more').catch(() => []),
      get('trip').catch(() => ({ scenes: [], lex: {} })),
      get('audio').catch(() => []),
      get('emoji').catch(() => ({})),
      ...UNIT_FILES.map((f) => get(`course/${f}`).catch(() => [])),
      ...['exam-n5-1', 'exam-n5-2'].map((f) => get(`course/${f}`).catch(() => null)),
    ]);
    const papers = rest.slice(UNIT_FILES.length).filter(Boolean);
    data = mergeCourse({ kanji, vocab, sentences, particles, glossary, bank, papers }, rest.slice(0, UNIT_FILES.length));
    for (const [w, [y, m, ro]] of [...Object.entries(bank.lex), ...Object.entries(talk.lex), ...Object.entries(trip.lex)]) {
      if (!glossary[w]) glossary[w] = { y, m, ro: ro ?? romaji(y) };
    }
    data.trip = trip.scenes;
    data.talk = talk.categories;
    data.stories = stories;
    data.emoji = emoji;
    setRecorded(audio);
    // Every kanji with a breakdown, so word cards and word glosses can show each one.
    data.kanjiMore = kanjiMore;
    setKanji([...kanji, ...kanjiMore]);
    setNotes(state.notes ||= {});
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
