// Kanji check: one kanji at a time, nothing to pick from. Recall its meaning and reading,
// tap to reveal, then swipe. Right: known by heart, no hesitation. Left: anything less.
// The swipes are kanji reviews, so the Mastered stage is earned here like anywhere else.
import { rate, isDue } from './srs.js';
import { romaji } from './romaji.js';

export const CHECK_SIZE = 12;
// How far a card must travel before letting go counts as a swipe.
const SWIPE_PX = 80;

// Struggling kanji first, then due ones, then the rest you've started, soonest due first.
export function checkDeck({ struggling = [], due = [], started = [], size = CHECK_SIZE, recs = {} }) {
  const rest = [...started].sort((a, b) => (recs[a.k]?.due ?? 0) - (recs[b.k]?.due ?? 0));
  return [...new Set([...struggling, ...due, ...rest])].slice(0, size);
}

// What a swipe does to a kanji's review record.
// Right on a due kanji counts as Instant. Right on one not due yet leaves its schedule alone,
// so checking early never pushes a review out. Left is Shaky: back within a day and
// struggling again, but its progress isn't wiped and its review is never pushed later.
export function swipeRecord(rec, known, now = Date.now()) {
  if (!rec) return rec;
  if (known) return isDue(rec, now) ? rate(rec, 'easy', now) : rec;
  const shaky = rate(rec, 'hard', now);
  return { ...shaky, reps: rec.reps, interval: Math.min(rec.interval, shaky.interval), due: Math.min(rec.due, now + 864e5) };
}

// ctx: { view, setTop, deck, readingOf(k), wordsOf(k) → [{ w, y, m }], stage(k) → 0..3,
//        mastered (the stage number), swipe(k, known) → undo token, undo(token), onExit }
export function startCheck(ctx) {
  const { view, setTop } = ctx;
  let cleanup = () => {};

  function round(cards, first) {
    let i = 0;
    let revealed = false;
    const known = [];
    const left = [];
    const history = [];
    const stageBefore = new Map(cards.map((k) => [k, ctx.stage(k)]));

    const answer = (k) => {
      const head = ctx.readingOf(k);
      const others = [...new Set([...k.on, ...k.kun].map((r) => r.replace(/[-.]/g, '')))].filter((r) => r && r !== head).slice(0, 4);
      const words = ctx.wordsOf(k).slice(0, 2);
      return `<p class="ck-mean">${k.mean.slice(0, 3).join(', ')}</p>
        <p class="ck-read"><span class="jp">${head}</span><small>${romaji(head)}</small></p>
        ${others.length ? `<p class="ck-other jp">${others.join('・')}</p>` : ''}
        ${words.length ? `<div class="ck-words">${words.map((w) => `<span><b class="jp">${w.w}</b> <span class="jp">${w.y}</span> · ${w.m}</span>`).join('')}</div>` : ''}`;
    };

    function header() {
      // Previous in the bottom bar is Undo: it brings back the last card and its review.
      setTop('Kanji check', {
        close: true, onClose: ctx.onExit, onPrev: history.length ? undo : null,
        count: `${Math.min(i + 1, cards.length)} / ${cards.length}`, progress: (i / cards.length) * 100,
      });
    }

    function show() {
      if (i >= cards.length) { finish(); return; }
      revealed = false;
      header();
      const k = cards[i];
      view.innerHTML = `
        <div class="ck">
          <div class="ck-stack">
            <button class="card ck-card" id="ckcard" aria-label="Reveal the answer">
              <span class="ck-tint l" aria-hidden="true">Not yet</span><span class="ck-tint r" aria-hidden="true">Know it</span>
              <span class="ck-k jp">${k.k}</span>
              <span class="ck-ans" id="ckans"><span class="ck-hint">Meaning and reading?<br><small>Tap to reveal</small></span></span>
            </button>
          </div>
          <div class="ck-btns">
            <button class="ck-btn no" id="ckno" disabled aria-label="Not yet">✕</button>
            <button class="ck-btn yes" id="ckyes" disabled aria-label="Know it">✓</button>
          </div>
        </div>`;
      bind(k);
    }

    function reveal(k) {
      if (revealed) return;
      revealed = true;
      view.querySelector('#ckans').innerHTML = answer(k);
      view.querySelector('#ckcard').classList.add('open');
      view.querySelector('#ckcard').setAttribute('aria-label', 'Swipe right if you knew it by heart, left if not');
      view.querySelector('#ckno').disabled = false;
      view.querySelector('#ckyes').disabled = false;
    }

    function decide(k, isKnown) {
      const card = view.querySelector('#ckcard');
      card.style.transition = '';
      card.classList.add(isKnown ? 'fly-r' : 'fly-l');
      view.querySelectorAll('.ck-btn').forEach((b) => { b.disabled = true; });
      const token = first ? ctx.swipe(k, isKnown) : null;
      history.push({ k, isKnown, token });
      (isKnown ? known : left).push(k);
      i++;
      setTimeout(show, 180);
    }

    function undo() {
      const last = history.pop();
      if (!last) return;
      if (first) ctx.undo(last.token);
      const list = last.isKnown ? known : left;
      list.splice(list.lastIndexOf(last.k), 1);
      i--;
      show();
    }

    function bind(k) {
      const card = view.querySelector('#ckcard');
      let start = null;
      let dx = 0;
      card.addEventListener('pointerdown', (e) => {
        if (!revealed) return;
        start = e.clientX;
        dx = 0;
        card.setPointerCapture(e.pointerId);
        card.style.transition = 'none';
      });
      card.addEventListener('pointermove', (e) => {
        if (start === null) return;
        dx = e.clientX - start;
        card.style.transform = `translateX(${dx}px) rotate(${dx / 24}deg)`;
        card.style.setProperty('--l', Math.max(0, Math.min(1, -dx / SWIPE_PX)));
        card.style.setProperty('--r', Math.max(0, Math.min(1, dx / SWIPE_PX)));
      });
      const release = () => {
        if (start === null) return;
        start = null;
        if (Math.abs(dx) >= SWIPE_PX) { decide(k, dx > 0); return; }
        card.style.transition = '';
        card.style.transform = '';
        card.style.setProperty('--l', 0);
        card.style.setProperty('--r', 0);
      };
      card.addEventListener('pointerup', release);
      card.addEventListener('pointercancel', release);
      // A tap reveals; a drag that came back to the middle isn't a tap.
      card.addEventListener('click', () => { if (Math.abs(dx) < 6) reveal(k); });
      view.querySelector('#ckno').onclick = () => decide(k, false);
      view.querySelector('#ckyes').onclick = () => decide(k, true);
      // A swipe on the card is never the screen-edge back gesture.
      card.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }

    const onKey = (e) => {
      if (i >= cards.length) return;
      const k = cards[i];
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(k); } else if (revealed && e.key === 'ArrowLeft') decide(k, false);
      else if (revealed && e.key === 'ArrowRight') decide(k, true);
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);

    function finish() {
      cleanup();
      const newly = first ? cards.filter((k) => stageBefore.get(k) < ctx.mastered && ctx.stage(k) >= ctx.mastered) : [];
      setTop('Kanji check', { close: true, onClose: ctx.onExit });
      const tiles = (list, cls) => `<div class="ck-tiles">${list.map((k, n) => `<span class="ck-tile ${cls} jp" style="--d:${n * 90}ms">${k.k}</span>`).join('')}</div>`;
      view.innerHTML = `
        <section class="card hero done-hero ck-done ${newly.length ? 'gold' : ''}">
          <h2>${left.length ? `${known.length} <small>/ ${cards.length}</small>` : 'All known'}</h2>
          <p class="sub">${left.length ? 'known by heart' : first ? 'Every one by heart' : 'The pile is clear'}</p>
          ${newly.length ? `<span class="caps">Newly mastered</span>${tiles(newly, 'gold')}` : ''}
        </section>
        ${left.length ? `<section class="card"><span class="caps">To work on</span>${tiles(left, 'left')}</section>` : ''}
        <div class="dock stack">
          ${left.length ? `<button class="btn" id="ckagain">${left.length === 1 ? 'Again with this one' : `Again with these ${left.length}`}</button>` : ''}
          <button class="btn ${left.length ? 'ghost' : ''}" id="ckdone">Done</button>
        </div>`;
      view.querySelector('#ckagain')?.addEventListener('click', () => round(left.slice(), false));
      view.querySelector('#ckdone').onclick = ctx.onExit;
    }

    show();
  }

  round(ctx.deck, true);
  return () => cleanup();
}
