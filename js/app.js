// Routing and screens.
import { load, save, dayStats, daysStudied, lastWeek, dayKey, backupJson, parseBackup } from './store.js';
import { renderShadow } from './shadow.js';
import { speak, cancel, sayBtn } from './tts.js';
import { GRADES, newRecord, rate, label } from './srs.js';
import { buildSession, kanjiId, wordId } from './session.js';
import { renderSentence, renderParticle, particleCardHtml, bindGloss, shuffled } from './drills.js';
import { icons } from './icons.js';
import { romaji } from './romaji.js';

const view = document.getElementById('view');
const top = document.getElementById('top');
const tabbar = document.getElementById('tabbar');
const state = load();
let data = null;
let run = null;
let stepCleanup = null;
let settingsNotice = '';

const WEEKDAYS = '日月火水木金土';
const TABS = [['today', 'Today'], ['practice', 'Practice'], ['kanji', 'Kanji'], ['settings', 'Settings']];

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

function setTop(title, { close = false, count = '', progress = null } = {}) {
  top.innerHTML = `<div class="top-in">
      ${close ? `<button class="hbtn" id="close" aria-label="Exit">${icons.close}</button>` : '<span class="mark" aria-hidden="true">学</span>'}
      <h1>${title}</h1><span class="count">${count}</span></div>
    ${progress === null ? '' : `<div class="progress"><i style="width:${progress}%"></i></div>`}`;
  if (close) top.querySelector('#close').onclick = endRun;
}

/* ---------- Home ---------- */

const BACKUP_DAYS = 14;
const backupDue = () => Object.keys(state.items).length > 0
  && (!state.lastBackup || Date.now() - state.lastBackup > BACKUP_DAYS * 864e5);

function screenToday() {
  setTop('JP Trainer');
  const { steps, counts } = buildSession(state, data);
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
        ? `<h2>Your session<br>is ready</h2><p class="sub">${steps.length} steps, about 15 minutes. Progress saves as you go.</p>
           <button class="btn" id="start">Start session</button>`
        : '<h2>All caught up</h2><p class="sub">Nothing is due. Practice if you want more.</p>'}
    </section>
    <section class="card list">
      ${row(icons.repeat, 'Reviews', counts.reviews, 'About 5 min')}
      ${row(icons.spark, 'New kanji and words', counts.learn, 'About 3 min')}
      ${row(icons.blocks, 'Sentences and particles', counts.sentences + counts.particles, 'About 4 min')}
      ${row(icons.voice, 'Listen and shadow', counts.shadow, 'About 3 min')}
    </section>
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

function startRun(steps, title, { useSrs = false, browse = false } = {}) {
  run = { steps: [...steps], i: 0, title, useSrs, browse, clean: 0, drills: 0, cards: 0 };
  document.body.classList.add('in-run');
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
  if (run.i >= run.steps.length) {
    // Browsing has nothing to summarize, so it just closes.
    if (run.browse) return endRun();
    return renderSummary();
  }
  const step = run.steps[run.i];
  setTop(run.title, { close: true, count: `${run.i + 1} / ${run.steps.length}`, progress: (run.i / run.steps.length) * 100 });
  view.innerHTML = '';
  const finishDrill = (clean) => {
    run.drills++;
    if (clean) run.clean++;
    record(step.id, clean ? 'good' : 'again');
    advance();
  };
  if (step.type === 'learn') renderLearn(step);
  else if (step.type === 'card') renderCard(step);
  else if (step.type === 'sentence') renderSentence(view, step.ref, { hints: state.settings.hints, onDone: finishDrill });
  else if (step.type === 'particle') renderParticle(view, step.ref, step.set, data.particles.cards, { glossary: data.glossary, onDone: finishDrill });
  else if (step.type === 'shadow') {
    stepCleanup = renderShadow(view, step.ref, {
      glossary: data.glossary,
      onDone: () => {
        if (run.useSrs) {
          dayStats(state).shadow = (dayStats(state).shadow || 0) + 1;
          state.shadow[step.id] = Date.now();
          save(state);
        }
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

function kanjiFacts(k) {
  const words = k.words.map((w) => data.vocab.find((v) => v.w === w)).filter(Boolean);
  return `<div>
      <p class="mean">${k.mean.join(', ')}</p>
      <p class="meta">${k.strokes} ${k.strokes === 1 ? 'stroke' : 'strokes'}</p>
    </div>
    <div class="reads">
      <div class="read"><span class="caps">On</span>${readingLines(k.on)}</div>
      <div class="read"><span class="caps">Kun</span>${readingLines(k.kun)}</div>
    </div>
    ${words.length ? `<div class="block-sec"><span class="caps">In words</span>${words.map((w) => `<div class="wrow">
      <span class="wl"><b>${w.w}</b><span class="y">${w.y}</span><span class="ro">${romaji(w.y)}</span></span><span class="m">${w.m}</span>${sayBtn(w.y)}</div>`).join('')}</div>` : ''}
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
      <p class="ask" id="ask">${icons.voice}<span>Say the reading and meaning out loud.</span></p>
      <div class="back" id="back" hidden>${factsHtml(step)}</div>
    </div>
    <div class="dock" id="act"><button class="btn" id="show">Show answer</button></div>`;
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
      // "Again" comes back later in this session.
      if (btn.dataset.g === 'again') run.steps.splice(Math.min(run.i + 4, run.steps.length), 0, step);
      advance();
    };
  };
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
    ${action('sent', icons.blocks, 'Sentence drill', `${data.sentences.length} sentences, shuffled`)}
    ${action('part', icons.practice, 'Particle drill', `${sets.length} nouns, each in several sentences`)}
    ${action('shad', icons.voice, 'Listen and shadow', 'Hear a sentence, record yourself, compare')}
    <p class="small muted center">Free practice doesn't change your review schedule.</p>
    <div class="caps sect"><span>Particle guides</span></div>
    <section class="pgrid" id="cards">${cards.map((c) => `<button class="ptile" data-p="${c.p}">
      <b>${c.p}</b><small>${c.name}</small></button>`).join('')}</section>`;
  view.querySelector('#sent').onclick = () => startRun(
    shuffled(data.sentences).map((s) => ({ type: 'sentence', id: `s:${s.id}`, ref: s })), 'Sentence drill',
  );
  view.querySelector('#part').onclick = () => startRun(
    sets.flatMap((set) => set.items.map((it) => ({ type: 'particle', id: `p:${it.id}`, ref: it, set }))), 'Particle drill',
  );
  view.querySelector('#shad').onclick = () => startRun(
    shuffled(data.sentences).map((s) => ({ type: 'shadow', id: s.id, ref: s })), 'Listen and shadow',
  );
  view.querySelector('#cards').onclick = (e) => {
    const b = e.target.closest('[data-p]');
    if (!b) return;
    const card = cards.find((c) => c.p === b.dataset.p);
    const drills = sets.flatMap((set) => set.items.filter((it) => it.answer === card.p)
      .map((it) => ({ type: 'particle', id: `p:${it.id}`, ref: it, set })));
    startRun([{ type: 'particleCard', ref: card }, ...drills], card.name);
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
    if (b) startRun(steps.slice(Number(b.dataset.i)), 'Kanji', { browse: true });
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
      <strong>New kanji per day</strong>${seg('newPerDay', [[3, '3'], [4, '4'], [5, '5']])}
      <strong style="margin-top:6px">Readings on sentence blocks</strong>${seg('hints', [[true, 'Show'], [false, 'Hide']])}
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
    <div class="caps sect"><span>About</span></div>
    <section class="card">
      <p class="small">Content is hand-written for this app. Audio uses your device's Japanese voice. Third-party data sources will be credited here when they are added.</p></section>`;
  settingsNotice = '';
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

const SCREENS = { today: screenToday, practice: screenPractice, kanji: screenKanji, settings: screenSettings };

function route() {
  if (!data || run) return;
  view.onclick = null;
  const name = location.hash.replace('#/', '');
  const tab = SCREENS[name] ? name : 'today';
  tabbar.querySelectorAll('a').forEach((a) => {
    const on = a.dataset.tab === tab;
    a.classList.toggle('on', on);
    if (on) a.setAttribute('aria-current', 'page');
    else a.removeAttribute('aria-current');
  });
  SCREENS[tab]();
  animate();
  window.scrollTo(0, 0);
}

async function init() {
  applyTheme();
  // Any listen button, on any screen.
  document.addEventListener('click', (e) => {
    const el = e.target.closest('[data-say]');
    if (el) speak(el.dataset.say);
  });
  setTop('JP Trainer');
  tabbar.innerHTML = TABS.map(([id, text]) => `<a href="#/${id}" data-tab="${id}">${icons[id]}<span>${text}</span></a>`).join('');
  try {
    const get = (f) => fetch(`data/${f}.json`).then((r) => {
      if (!r.ok) throw new Error(`${f}: ${r.status}`);
      return r.json();
    });
    const [kanji, vocab, sentences, particles, glossary] = await Promise.all(
      ['kanji-n5', 'vocab-n5', 'sentences', 'particles', 'glossary'].map(get),
    );
    data = { kanji, vocab, sentences, particles, glossary };
    window.addEventListener('hashchange', route);
    route();
  } catch (err) {
    view.innerHTML = `<div class="card"><h3>The study data didn't load</h3>
      <p class="small muted">${err.message}. Check your connection and reopen the app.</p></div>`;
  }
}

init();
