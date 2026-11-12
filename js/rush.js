// Kanji Rush: as many kanji as you can before the clock runs out. Pick each one's
// meaning, or its reading in kana. A miss costs time unless that's turned off.
// A miss on a kanji you're studying is logged as Shaky, so it comes back sooner in reviews.
// "Struggling" plays only the kanji you keep missing.
import { shuffled } from './drills.js';
import { romaji, toHiragana } from './romaji.js';

export const RUSH_MS = 60000;
export const PENALTY_MS = 2000;
export const TIMES = [30, 60, 90, 120, 0]; // 0: no clock, play until you stop.
export const MODES = [['meaning', 'Meaning'], ['reading', 'Reading']];

// A kanji's readings as they are spoken: たか-い is たかい.
const readingsOf = (k) => [...k.on, ...k.kun].map((r) => r.replace(/[-.]/g, ''));
// Without a better guess, the reading asked for is the first on, else the first kun, in hiragana.
const firstReading = (k) => toHiragana(readingsOf(k)[0] || '');

// Four options: the right answer and three that aren't answers for this kanji.
// In reading mode each option is a kanji's head reading in hiragana (readOf), the one
// you'd hear it by, and no wrong option is any reading of the asked kanji.
export function rushQuestion(pool, all, rng = Math.random, last = null, mode = 'meaning', readOf = firstReading) {
  const choices = pool.length > 1 ? pool.filter((k) => k !== last) : pool;
  const k = choices[Math.floor(rng() * choices.length)];
  if (mode === 'reading') {
    const right = readOf(k);
    const own = new Set([right, ...readingsOf(k).map(toHiragana)]);
    const others = shuffled(all.filter((x) => x !== k), rng).map(readOf)
      .filter((r, i, a) => r && !own.has(r) && a.indexOf(r) === i).slice(0, 3);
    return { k, right, options: shuffled([right, ...others], rng) };
  }
  const right = k.mean[0];
  const others = shuffled(all.filter((x) => x !== k && !k.mean.includes(x.mean[0])), rng)
    .map((x) => x.mean[0]).filter((m, i, a) => a.indexOf(m) === i).slice(0, 3);
  return { k, right, options: shuffled([right, ...others], rng) };
}

// The key a best score is kept under: each mode and clock has its own record.
export const bestKey = ({ mode, secs, penalty, only }) => `${mode}-${secs}${penalty ? '' : '-free'}${only === 'weak' ? '-weak' : ''}`;

const optHtml = (o, mode) => (mode === 'reading'
  ? `<button class="opt kana" data-o="${o}"><span class="jp">${o}</span><small>${romaji(o)}</small></button>`
  : `<button class="opt" data-o="${o}">${o}</button>`);

// ctx: { view, setTop, pool, weak (struggling kanji), all, onMiss(kanji), readOf(kanji), settings, saveSettings(s), best(key), onBest(key, score), onExit }
export function startRush(ctx) {
  const { view, setTop } = ctx;
  const opts = { mode: 'meaning', secs: 60, penalty: true, only: 'all', ...ctx.settings };
  if (!ctx.weak?.length) opts.only = 'all';
  const pool = () => (opts.only === 'weak' ? ctx.weak : ctx.pool);
  let timer = null;

  function intro() {
    setTop('Kanji Rush', { close: true, onClose: ctx.onExit });
    const seg = (key, list) => `<div class="seg" data-key="${key}">${list.map(([v, text]) => `<button class="${opts[key] === v ? 'on' : ''}" data-v='${JSON.stringify(v)}'>${text}</button>`).join('')}</div>`;
    view.innerHTML = `
      <section class="card hero rush-hero">
        <span class="water" aria-hidden="true">速</span>
        <span class="caps">${opts.secs ? `${opts.secs} seconds` : 'No clock'}</span>
        <h2>Kanji Rush</h2>
        <p class="sub">${opts.mode === 'reading' ? 'Pick each kanji\'s reading in kana' : 'Pick each kanji\'s meaning'} as fast as you can.${opts.penalty && opts.secs ? ` A miss costs ${PENALTY_MS / 1000} seconds.` : ''} ${pool().length} kanji in play.</p>
        <button class="btn" id="go">Start</button>
      </section>
      <section class="card rush-set">
        ${ctx.weak?.length ? `<strong>Kanji</strong>${seg('only', [['all', 'All you\'ve met'], ['weak', `Struggling · ${ctx.weak.length}`]])}` : ''}
        <strong>Answer with</strong>${seg('mode', MODES)}
        <strong>Time</strong>${seg('secs', TIMES.map((s) => [s, s ? `${s}s` : 'Off']))}
        ${opts.secs ? `<strong>Penalty for a miss</strong>${seg('penalty', [[true, `−${PENALTY_MS / 1000}s`], [false, 'None']])}` : ''}
      </section>
      <p class="small muted center">Best at these settings: <strong class="num">${ctx.best(bestKey(opts))}</strong></p>`;
    view.querySelector('#go').onclick = play;
    view.querySelector('.rush-set').onclick = (e) => {
      const b = e.target.closest('.seg button');
      if (!b) return;
      opts[b.parentElement.dataset.key] = JSON.parse(b.dataset.v);
      ctx.saveSettings({ ...opts });
      intro();
    };
  }

  function play() {
    const total = opts.secs * 1000;
    const end = { at: Date.now() + total };
    let score = 0;
    let tries = 0;
    let combo = 0;
    let q = null;
    const misses = [];
    const stop = () => { clearInterval(timer); finish(score, tries, misses); };
    setTop('Kanji Rush', { close: true, confirm: true, onClose: () => { clearInterval(timer); ctx.onExit(); } });
    view.innerHTML = `
      ${total ? '<div class="rush-bar"><i id="rbar"></i></div>' : ''}
      <div class="rush-stats"><span><b class="num" id="rscore">0</b> right</span><span id="rcombo" class="muted"></span>
        ${total ? `<span class="num" id="rtime">${opts.secs}</span>` : '<button class="chip" id="rstop">Finish</button>'}</div>
      <section class="card rush-card"><div class="rush-k jp" id="rk"></div></section>
      <div class="reach"><div class="opts long rush-opts ${opts.mode}" id="ropts"></div></div>`;
    const el = (id) => view.querySelector(`#${id}`);
    const ask = () => {
      q = rushQuestion(pool(), ctx.all, Math.random, q?.k, opts.mode, ctx.readOf);
      el('rk').textContent = q.k.k;
      el('ropts').innerHTML = q.options.map((o) => optHtml(o, opts.mode)).join('');
    };
    const tick = () => {
      if (!total) return;
      const left = Math.max(0, end.at - Date.now());
      el('rbar').style.width = `${(left / total) * 100}%`;
      el('rtime').textContent = Math.ceil(left / 1000);
      if (!left) stop();
    };
    el('ropts').onclick = (e) => {
      const b = e.target.closest('[data-o]');
      if (!b || !q) return;
      const card = el('rk').parentElement;
      card.classList.remove('hit', 'miss');
      void card.offsetWidth;
      tries++;
      if (b.dataset.o === q.right) {
        score++;
        combo++;
        card.classList.add('hit');
      } else {
        combo = 0;
        if (opts.penalty) end.at -= PENALTY_MS;
        card.classList.add('miss');
        if (!misses.includes(q.k)) { misses.push(q.k); ctx.onMiss?.(q.k); }
      }
      el('rscore').textContent = score;
      el('rcombo').textContent = combo >= 3 ? `${combo} in a row` : '';
      ask();
      tick();
    };
    el('rstop')?.addEventListener('click', stop);
    ask();
    if (total) timer = setInterval(tick, 100);
    tick();
  }

  function finish(score, tries, misses) {
    clearInterval(timer);
    const key = bestKey(opts);
    const before = ctx.best(key);
    // With no clock, the score is how many you got right, so a record means little: just show it.
    const record = opts.secs > 0 && score > before;
    if (record) ctx.onBest(key, score);
    const answer = (k) => (opts.mode === 'reading'
      ? [...new Set([(ctx.readOf || firstReading)(k), ...readingsOf(k).map(toHiragana)])].slice(0, 3).map((r) => `<span class="jp">${r}</span> ${romaji(r)}`).join(', ')
      : k.mean.slice(0, 2).join(', '));
    setTop('Kanji Rush', { close: true, onClose: ctx.onExit });
    view.innerHTML = `
      <section class="card done-hero">
        <span class="caps">${record ? 'New best' : opts.secs ? 'Time' : 'Finished'}</span>
        <div class="rush-score num">${score}</div>
        <p class="small muted">${opts.secs ? (record ? (before ? `Up from ${before}` : 'Your first score') : `Best ${before}`) : `${score} of ${tries} right`}</p>
      </section>
      ${misses.length ? `<div class="caps sect"><span>Missed</span></div>
        <section class="card">${misses.map((k) => `<div class="row"><b class="jp rush-mk">${k.k}</b><span class="grow">${answer(k)}</span></div>`).join('')}</section>` : ''}
      <div class="dock stack"><button class="btn" id="again">Play again</button><button class="btn ghost" id="done">Change settings</button></div>`;
    view.querySelector('#again').onclick = play;
    view.querySelector('#done').onclick = intro;
  }

  intro();
  return () => clearInterval(timer);
}
