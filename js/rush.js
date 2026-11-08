// Kanji Rush: as many kanji meanings as you can in 60 seconds. A miss costs 2 seconds.
// Free play: it never touches the review schedule.
import { shuffled } from './drills.js';

export const RUSH_MS = 60000;
export const PENALTY_MS = 2000;

// Four options: the right meaning and three others that don't share it.
export function rushQuestion(pool, all, rng = Math.random, last = null) {
  const choices = pool.length > 1 ? pool.filter((k) => k !== last) : pool;
  const k = choices[Math.floor(rng() * choices.length)];
  const right = k.mean[0];
  const others = shuffled(all.filter((x) => x !== k && !k.mean.includes(x.mean[0])), rng)
    .map((x) => x.mean[0]).filter((m, i, a) => a.indexOf(m) === i).slice(0, 3);
  return { k, right, options: shuffled([right, ...others], rng) };
}

// ctx: { view, setTop, pool, all, best, onBest(score), onExit }
export function startRush(ctx) {
  const { view, setTop } = ctx;
  let timer = null;

  function intro() {
    setTop('Kanji Rush', { close: true, onClose: ctx.onExit });
    view.innerHTML = `
      <section class="card hero rush-hero">
        <span class="water" aria-hidden="true">速</span>
        <span class="caps">60 seconds</span>
        <h2>Kanji Rush</h2>
        <p class="sub">Pick each kanji's meaning as fast as you can. A miss costs 2 seconds. ${ctx.pool.length} kanji in play.</p>
        <button class="btn" id="go">Start</button>
      </section>
      <p class="small muted center">Best: <strong class="num">${ctx.best()}</strong></p>`;
    view.querySelector('#go').onclick = play;
  }

  function play() {
    const end = { at: Date.now() + RUSH_MS };
    let score = 0;
    let combo = 0;
    let q = null;
    const misses = [];
    setTop('Kanji Rush', { close: true, onClose: () => { clearInterval(timer); ctx.onExit(); } });
    view.innerHTML = `
      <div class="rush-bar"><i id="rbar"></i></div>
      <div class="rush-stats"><span><b class="num" id="rscore">0</b> right</span><span id="rcombo" class="muted"></span><span class="num" id="rtime">60</span></div>
      <section class="card rush-card"><div class="rush-k jp" id="rk"></div></section>
      <div class="opts long rush-opts" id="ropts"></div>`;
    const el = (id) => view.querySelector(`#${id}`);
    const ask = () => {
      q = rushQuestion(ctx.pool, ctx.all, Math.random, q?.k);
      el('rk').textContent = q.k.k;
      el('ropts').innerHTML = q.options.map((o) => `<button class="opt" data-o="${o}">${o}</button>`).join('');
    };
    const tick = () => {
      const left = Math.max(0, end.at - Date.now());
      el('rbar').style.width = `${(left / RUSH_MS) * 100}%`;
      el('rtime').textContent = Math.ceil(left / 1000);
      if (!left) finish(score, misses);
    };
    el('ropts').onclick = (e) => {
      const b = e.target.closest('[data-o]');
      if (!b || !q) return;
      const card = el('rk').parentElement;
      card.classList.remove('hit', 'miss');
      void card.offsetWidth;
      if (b.dataset.o === q.right) {
        score++;
        combo++;
        card.classList.add('hit');
      } else {
        combo = 0;
        end.at -= PENALTY_MS;
        card.classList.add('miss');
        if (!misses.includes(q.k)) misses.push(q.k);
      }
      el('rscore').textContent = score;
      el('rcombo').textContent = combo >= 3 ? `${combo} in a row` : '';
      ask();
      tick();
    };
    ask();
    timer = setInterval(tick, 100);
    tick();
  }

  function finish(score, misses) {
    clearInterval(timer);
    const before = ctx.best();
    const record = score > before;
    if (record) ctx.onBest(score);
    setTop('Kanji Rush', { close: true, onClose: ctx.onExit });
    view.innerHTML = `
      <section class="card done-hero">
        <span class="caps">${record ? 'New best' : 'Time'}</span>
        <div class="rush-score num">${score}</div>
        <p class="small muted">${record ? (before ? `Up from ${before}` : 'Your first score') : `Best ${before}`}</p>
      </section>
      ${misses.length ? `<div class="caps sect"><span>Missed</span></div>
        <section class="card">${misses.map((k) => `<div class="row"><b class="jp rush-mk">${k.k}</b><span class="grow">${k.mean.slice(0, 2).join(', ')}</span></div>`).join('')}</section>` : ''}
      <div class="dock stack"><button class="btn" id="again">Play again</button><button class="btn ghost" id="done">Done</button></div>`;
    view.querySelector('#again').onclick = play;
    view.querySelector('#done').onclick = ctx.onExit;
  }

  intro();
  return () => clearInterval(timer);
}
