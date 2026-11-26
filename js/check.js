// Kanji check: one kanji at a time, and one kind of card for the whole check, so the controls
// never change mid-way. The kind is picked at random each time, never the same twice running:
//   swipe: recall its meaning and reading, tap to reveal, then grade yourself. Right: knew it.
//     Down: slow, got there with effort or only half. Left: forgot.
//   choice: multiple choice the app grades (the reading in a word, or the kanji among look-alikes).
//   build: tap the parts the kanji is made of.
// Only the graded kinds (choice, build) can make a kanji Mastered.
import { rate, isDue, isStruggling, dueAfter, stageOf, STAGES, STRONG } from './srs.js';
import { romaji } from './romaji.js';
import { icons } from './icons.js';

export const CHECK_SIZE = 12;
export const CHECK_MODES = { swipe: 'Swipe', choice: 'Multiple choice', build: 'Build' };
// The next check's kind: any but the last one.
export function nextCheckMode(last, rng = Math.random) {
  const modes = Object.keys(CHECK_MODES).filter((m) => m !== last);
  return modes[Math.floor(rng() * modes.length)];
}
// How far a card must travel before letting go counts as a swipe.
const SWIPE_PX = 80;
// Revealed within this long counts as instant recall, worth the bigger jump.
export const FAST_MS = 4000;
// A kanji is Mastered from this many days between reviews (stageOf in srs.js).
const MASTERED_DAYS = 21;
const CAP = MASTERED_DAYS - 1;
// Taps this soon after a card appears are ignored: a double tap meant for the last card.
const SETTLE_MS = 300;

// Struggling kanji first, then due ones, then the rest you've started, soonest due first.
export function checkDeck({ struggling = [], due = [], started = [], size = CHECK_SIZE, recs = {} }) {
  const rest = [...started].sort((a, b) => (recs[a.k]?.due ?? 0) - (recs[b.k]?.due ?? 0));
  return [...new Set([...struggling, ...due, ...rest])].slice(0, size);
}

// Which multiple-choice question a kanji gets. A Strong kanji that's due is one review from
// Mastered, so it's asked the reading in a word. Otherwise the two take turns with each review.
export function choiceKind(rec, i = 0, now = Date.now()) {
  if (rec && isDue(rec, now) && stageOf(rec) === STRONG) return 'read';
  return ((rec?.reps ?? 0) + i) % 2 ? 'pick' : 'read';
}

// What a card's result does to a kanji's review record.
//   grade 'forgot': relearn it, like Forgot anywhere else.
//   grade 'slow': Shaky. Back soon and struggling again, never Mastered, never pushed later.
//   grade 'missed': a question the app graded, answered wrong. Shaky, and back by tomorrow
//     whatever its gap was, but without wiping its progress the way Forgot does.
//   grade 'knew': on a due kanji the normal step, or Instant when fast. Early, it changes nothing,
//     so checking ahead never pushes a review out. Only a question the app graded (proven) can
//     carry a kanji into Mastered, and only once it is no longer struggling; otherwise it stops just
//     short of it.
export function checkRecord(rec, { grade, fast = false, proven = false }, now = Date.now()) {
  if (!rec) return rec;
  if (grade === 'forgot') return rate(rec, 'again', now);
  const due = isDue(rec, now);
  if (grade === 'missed') {
    const shaky = rate(rec, 'hard', now);
    return { ...shaky, reps: rec.reps, interval: 1, due: Math.min(rec.due, dueAfter(1, now)) };
  }
  if (grade === 'slow') {
    const shaky = rate(rec, 'hard', now);
    if (!due) return { ...shaky, reps: rec.reps, interval: Math.min(rec.interval, shaky.interval, CAP), due: Math.min(rec.due, dueAfter(1, now)) };
    return shaky.interval <= CAP ? shaky : { ...shaky, interval: CAP, due: dueAfter(CAP, now) };
  }
  if (!due) return rec;
  const next = rate(rec, fast ? 'easy' : 'good', now);
  if ((!proven || isStruggling(next)) && rec.interval < MASTERED_DAYS && next.interval >= MASTERED_DAYS) return { ...next, interval: CAP, due: dueAfter(CAP, now) };
  return next;
}

// A drag counts as Slow only when it goes clearly down, so a thumb's arc toward Knew it or
// Forgot stays sideways. Null: not far enough to count, the card springs back.
export function swipeGrade(dx, dy) {
  if (dy >= SWIPE_PX * 1.25 && dy > Math.abs(dx) * 1.5) return 'slow';
  if (Math.abs(dx) >= SWIPE_PX && dy <= Math.abs(dx) * 1.5) return dx > 0 ? 'knew' : 'forgot';
  return null;
}

const GRADE = {
  forgot: { label: 'Forgot', pip: 'n', fly: 'translateX(-130%) rotate(-14deg)' },
  slow: { label: 'Slow', pip: 's', fly: 'translateY(110%) rotate(3deg)' },
  missed: { label: 'Missed', pip: 'n' },
  knew: { label: 'Knew it', pip: 'y', fly: 'translateX(130%) rotate(14deg)' },
};

function shuffle(list) {
  const a = [...list];
  for (let n = a.length - 1; n > 0; n--) {
    const j = Math.floor(Math.random() * (n + 1));
    [a[n], a[j]] = [a[j], a[n]];
  }
  return a;
}

// ctx: { view, setTop, deck, mode (a CHECK_MODES key), readingOf(k), wordsOf(k) → [{ w, y, m }],
//        stage(k) → 0..3, mastered (the stage number), kind(k, i) → 'read' | 'pick' for a choice card,
//        question(k, kind, avoid) → { kind, k, word?, options, answer } (choice) or
//          { kind: 'build', puzzle } (build), or null when there's nothing fair to ask;
//        renderBuild(root, puzzle, onDone(clean));
//          avoid holds the words already asked this round, so none is asked twice,
//        grade(k, result) → undo token, undo(token), study(list, start, back), onExit }
export function startCheck(ctx) {
  const { view, setTop } = ctx;
  const mode = ctx.mode || 'swipe';
  let cleanup = () => {};
  // Set once the check is left, so nothing still on a timer draws over the next screen.
  let stopped = false;
  let pending = null;
  const later = (fn, ms) => {
    clearTimeout(pending);
    pending = setTimeout(() => { pending = null; if (!stopped) fn(); }, ms);
  };

  function round(cards, first) {
    let i = 0;
    // The card on screen: a graded card stays counted as current until the next one shows.
    let at = 0;
    let revealed = false;
    let shownAt = 0;
    let fast = false;
    const history = [];
    const stageBefore = new Map(cards.map((k) => [k, ctx.stage(k)]));
    // The "Again" round is practice in the same kind of card: nothing recorded.
    const questions = new Map();
    const asked = new Set();
    const questionOf = (k, n) => {
      if (mode === 'swipe') return null;
      if (!questions.has(k)) {
        const kind = mode === 'build' ? 'build' : ctx.kind(k, n);
        // A kanji with no parts to build (一, 人) is asked as a choice question instead.
        let q = ctx.question(k, kind, asked);
        if (!q && kind === 'build') q = ctx.question(k, ctx.kind(k, n), asked);
        if (q?.word) asked.add(q.word.w);
        // A kanji due a graded question that has none to ask (too little taught yet) can still
        // reach Mastered on its self-check, or it would be stuck short of it for good. Only when
        // nothing at all could be asked: not when this round's earlier questions used its word.
        questions.set(k, { q, stand: !q && !ctx.question(k, ctx.kind(k, n)) });
      }
      return questions.get(k);
    };

    const answer = (k) => {
      const head = ctx.readingOf(k);
      // Other readings, on and kun apart, at most four in all.
      const seen = new Set([head, '']);
      const pick = (list) => list.map((r) => r.replace(/[-.]/g, '')).filter((r) => !seen.has(r) && seen.add(r));
      const on = pick(k.on).slice(0, 3);
      const kun = pick(k.kun).slice(0, 4 - on.length);
      const words = ctx.wordsOf(k).slice(0, 2);
      return `<p class="ck-mean">${k.mean.slice(0, 3).join(', ')}</p>
        <p class="ck-read"><span class="jp">${head}</span><small>${romaji(head)}</small></p>
        ${on.length || kun.length ? `<p class="ck-other">${on.length ? `<span><i class="jp">音</i><span class="jp">${on.join('・')}</span></span>` : ''}${kun.length ? `<span><i class="jp">訓</i><span class="jp">${kun.join('・')}</span></span>` : ''}</p>` : ''}
        ${words.length ? `<div class="ck-words">${words.map((w) => `<span><b class="jp">${w.w}</b><span class="jp">${w.y}</span><em>${w.m}</em></span>`).join('')}</div>` : ''}`;
    };
    const badge = (k) => {
      const st = STAGES[ctx.stage(k)];
      return `<span class="stage s-${st.id}"><span class="jp">${st.jp}</span>${st.en}</span>`;
    };

    // One pip per card: green knew, amber slow, coral forgot or missed, the current one ringed.
    const pips = () => cards.map((_, n) => {
      const h = history[n];
      return `<i class="${h ? GRADE[h.grade].pip : n === i ? 'now' : ''}"></i>`;
    }).join('');

    function header() {
      // Previous in the bottom bar is Undo: it brings back the last card and its review.
      setTop(`Kanji check · ${CHECK_MODES[mode]}`, {
        close: true, onClose: ctx.onExit, onPrev: history.length ? undo : null,
        count: `${Math.min(at + 1, cards.length)} / ${cards.length}`, progress: (history.length / cards.length) * 100,
      });
    }

    const stack = (inner) => {
      const behind = Math.min(2, cards.length - i - 1);
      return `<div class="ck-stack">
        ${behind > 1 ? '<span class="ck-under u2" aria-hidden="true"></span>' : ''}${behind ? '<span class="ck-under u1" aria-hidden="true"></span>' : ''}
        ${inner}</div>`;
    };
    const settled = () => performance.now() - shownAt >= SETTLE_MS;

    function show() {
      clearTimeout(pending);
      if (i >= cards.length) { finish(); return; }
      revealed = false;
      fast = false;
      shownAt = performance.now();
      at = i;
      header();
      const k = cards[i];
      const { q } = questionOf(k, i) || {};
      if (q?.kind === 'build') { showBuild(k, q); return; }
      if (q) { showQuestion(k, q); return; }
      // The stage stays hidden until the reveal, so it can't hint at the answer.
      view.innerHTML = `
        <div class="ck">
          ${stack(`<button class="card ck-card" id="ckcard" aria-label="Reveal the answer">
              <span class="ck-wash" aria-hidden="true"></span>
              <span class="ck-tint l" aria-hidden="true">Forgot</span><span class="ck-tint r" aria-hidden="true">Knew it</span><span class="ck-tint d" aria-hidden="true">Slow</span>
              <span class="ck-top" id="cktop"></span>
              <span class="ck-k jp">${k.k}</span>
              <span class="ck-ans" id="ckans"><span class="ck-hint">Meaning and reading?<small>Tap to reveal</small></span></span>
            </button>`)}
          <span class="ck-pips" aria-hidden="true">${pips()}</span>
          <div class="ck-btns">
            <button class="ck-btn no" id="ckno" disabled aria-label="Forgot"><span class="ck-o">${icons.close}</span><small>Forgot</small></button>
            <button class="ck-btn slow" id="ckslow" disabled aria-label="Slow"><span class="ck-o">${icons.slow}</span><small>Slow</small></button>
            <button class="ck-btn yes" id="ckyes" disabled aria-label="Knew it"><span class="ck-o">${icons.check}</span><small>Knew it</small></button>
          </div>
        </div>`;
      bind(k);
    }

    // Build the kanji from its parts, graded: a wrong tile counts as a miss.
    function showBuild(k, q) {
      ctx.renderBuild(view, q.puzzle, (clean) => {
        if (stopped) return;
        record(k, clean ? 'knew' : 'missed', true);
        show();
      });
    }

    // A question the app grades: the reading of a word, or the kanji among look-alikes.
    function showQuestion(k, q) {
      const prompt = q.kind === 'read'
        ? `<span class="ck-qword jp">${q.word.w.replace(k.k, `<u>${k.k}</u>`)}</span><span class="ck-qsub">${q.word.m}</span><span class="ck-hint">How is it read?</span>`
        : `<span class="ck-qsay jp">${q.say || ctx.readingOf(k)}</span><span class="ck-qsub">${k.mean[0]}</span><span class="ck-hint">Which kanji?</span>`;
      const opt = (o) => (q.kind === 'read' ? `<span class="jp">${o}</span><small>${romaji(o)}</small>` : o);
      view.innerHTML = `
        <div class="ck">
          ${stack(`<div class="card ck-card ck-quiz" id="ckcard">
              <span class="ck-top" id="cktop"></span>
              ${prompt}
              <span class="ck-ans" id="ckans"></span>
            </div>`)}
          <span class="ck-pips" aria-hidden="true">${pips()}</span>
          <div class="opts qz-opts ck-opts" id="ckopts">${q.options.map((o, n) => `<button class="opt ${q.kind === 'read' ? 'kana' : 'qk jp'}" data-n="${n}">${opt(o)}</button>`).join('')}</div>
        </div>`;
      const opts = view.querySelector('#ckopts');
      opts.onclick = (e) => {
        const b = e.target.closest('[data-n]');
        if (!b || b.disabled || !settled()) return;
        const right = Number(b.dataset.n) === q.answer;
        opts.querySelectorAll('.opt').forEach((x, n) => {
          x.disabled = true;
          if (n === q.answer) x.classList.add('right');
          else if (x === b) x.classList.add('wrong');
          else x.classList.add('dim');
        });
        // Saved the moment you answer, so leaving straight after still counts it.
        record(k, right ? 'knew' : 'missed', right);
        if (right) { later(show, 450); return; }
        // A miss shows the full answer, then waits, so you see what it should have been.
        view.querySelector('#cktop').innerHTML = badge(k);
        view.querySelector('#ckans').innerHTML = `<span class="ck-qk jp">${k.k}</span>${answer(k)}`;
        view.querySelector('#ckcard').classList.add('missed');
        opts.insertAdjacentHTML('afterend', '<button class="btn ck-next" id="cknext">Next</button>');
        view.querySelector('#cknext').onclick = show;
        view.querySelector('#cknext').focus({ preventScroll: true });
      };
    }

    function reveal(k) {
      if (revealed) return;
      revealed = true;
      fast = performance.now() - shownAt <= FAST_MS;
      view.querySelector('#ckans').innerHTML = answer(k);
      view.querySelector('#cktop').innerHTML = badge(k);
      view.querySelector('#ckcard').classList.add('open');
      view.querySelector('#ckcard').setAttribute('aria-label', 'Swipe right if you knew it, down if it was slow, left if you forgot');
      view.querySelectorAll('.ck-btn').forEach((b) => { b.disabled = false; });
    }

    // Saves one card's result and steps past it; the caller decides when the next card shows.
    function record(k, grade, proven) {
      const stand = questions.get(k)?.stand;
      const token = first ? ctx.grade(k, { grade, fast: grade === 'knew' && fast && !proven, proven: proven || Boolean(stand) }) : null;
      history.push({ k, grade, token });
      i++;
      // Previous can take it back at once, even on the first card and while the next one loads.
      header();
    }

    function decide(k, grade) {
      const card = view.querySelector('#ckcard');
      if (!card || card.classList.contains('flying')) return;
      // Fly on from wherever the drag left it.
      card.style.transition = '';
      card.style.transform = GRADE[grade].fly;
      card.classList.add('flying');
      view.querySelector('.ck').style.setProperty({ forgot: '--l', slow: '--d', knew: '--r' }[grade], 1);
      view.querySelectorAll('.ck-btn').forEach((b) => { b.disabled = true; });
      record(k, grade, false);
      later(show, 180);
    }

    // Takes back the last result, even one still on its way to the next card.
    function undo() {
      clearTimeout(pending);
      const last = history.pop();
      if (!last) return;
      if (first) ctx.undo(last.token);
      i = history.length;
      show();
    }

    function bind(k) {
      const card = view.querySelector('#ckcard');
      // The drag amount lives on the whole check, so the card and its button both lean in.
      const box = view.querySelector('.ck');
      let start = null;
      let dx = 0;
      let dy = 0;
      const lean = (l, r, d) => {
        box.style.setProperty('--l', l);
        box.style.setProperty('--r', r);
        box.style.setProperty('--d', d);
      };
      card.addEventListener('pointerdown', (e) => {
        if (!revealed) return;
        start = [e.clientX, e.clientY];
        dx = 0;
        dy = 0;
        card.setPointerCapture(e.pointerId);
        card.style.transition = 'none';
      });
      card.addEventListener('pointermove', (e) => {
        if (start === null) return;
        dx = e.clientX - start[0];
        dy = Math.max(0, e.clientY - start[1]);
        const down = dy > Math.abs(dx) * 1.5;
        card.style.transform = down ? `translateY(${dy}px)` : `translateX(${dx}px) translateY(${Math.min(dy, 24)}px) rotate(${dx / 24}deg)`;
        const amt = (v, px = SWIPE_PX) => Math.max(0, Math.min(1, v / px));
        lean(down ? 0 : amt(-dx), down ? 0 : amt(dx), down ? amt(dy, SWIPE_PX * 1.25) : 0);
      });
      const release = () => {
        if (start === null) return;
        start = null;
        const grade = swipeGrade(dx, dy);
        if (grade) { decide(k, grade); return; }
        card.style.transition = '';
        card.style.transform = '';
        lean(0, 0, 0);
      };
      card.addEventListener('pointerup', release);
      card.addEventListener('pointercancel', release);
      // A tap reveals; a drag that came back to the middle isn't a tap.
      card.addEventListener('click', () => { if (Math.abs(dx) < 6 && dy < 6) reveal(k); });
      const tap = (grade) => () => { if (settled()) decide(k, grade); };
      view.querySelector('#ckno').onclick = tap('forgot');
      view.querySelector('#ckslow').onclick = tap('slow');
      view.querySelector('#ckyes').onclick = tap('knew');
      // A swipe on the card is never the screen-edge back gesture.
      card.addEventListener('touchstart', (e) => e.stopPropagation(), { passive: true });
    }

    const onKey = (e) => {
      if (i >= cards.length || !view.querySelector('#ckslow')) return;
      const k = cards[i];
      if (e.key === ' ' || e.key === 'Enter') { e.preventDefault(); reveal(k); return; }
      if (!revealed) return;
      const grade = { ArrowLeft: 'forgot', ArrowDown: 'slow', ArrowRight: 'knew' }[e.key];
      if (grade) { e.preventDefault(); decide(k, grade); }
    };
    document.addEventListener('keydown', onKey);
    cleanup = () => document.removeEventListener('keydown', onKey);

    function finish() {
      cleanup();
      comeBack = () => { stopped = false; finish(); return stop; };
      const known = history.filter((h) => h.grade === 'knew').map((h) => h.k);
      const left = history.filter((h) => h.grade !== 'knew').map((h) => h.k);
      const newly = first ? cards.filter((k) => stageBefore.get(k) < ctx.mastered && ctx.stage(k) >= ctx.mastered) : [];
      const count = (...grades) => history.filter((h) => grades.includes(h.grade)).length;
      // The number above already says how many you knew; this says what happened to the rest.
      const split = [count('slow') && `${count('slow')} slow`, count('forgot') && `${count('forgot')} forgot`, count('missed') && `${count('missed')} missed`]
        .filter(Boolean).join(' · ');
      setTop('Kanji check', { close: true, onClose: ctx.onExit });
      // Each tile opens the kanji's full card; closing it comes back to this screen.
      const tiles = (list, cls) => `<div class="ck-tiles" data-set="${cls}">${list.map((k, n) => `<button class="ck-tile ${cls} jp" data-i="${n}" style="--d:${n * 90}ms" aria-label="Study ${k.k}">${k.k}</button>`).join('')}</div>`;
      view.innerHTML = `
        <section class="card hero done-hero ck-done ${newly.length ? 'gold' : ''}">
          <h2>${left.length ? `${known.length} <small>/ ${cards.length}</small>` : 'All known'}</h2>
          <p class="sub">${left.length ? split : first ? 'Every one known' : 'The pile is clear'}</p>
          <span class="ck-pips" aria-hidden="true">${pips()}</span>
          ${newly.length ? `<span class="caps">Newly mastered</span>${tiles(newly, 'gold')}` : ''}
        </section>
        ${left.length ? `<section class="card"><span class="caps">To work on</span>${tiles(left, 'left')}<p class="small muted ck-tap">Tap a kanji to study it</p></section>` : ''}
        <div class="dock stack">
          ${left.length ? `<button class="btn" id="ckagain">${left.length === 1 ? 'Again with this one' : `Again with these ${left.length}`}</button>` : ''}
          <button class="btn ${left.length ? 'ghost' : ''}" id="ckdone">Done</button>
        </div>`;
      view.querySelectorAll('.ck-tiles').forEach((set) => set.addEventListener('click', (e) => {
        const b = e.target.closest('[data-i]');
        if (b) ctx.study(set.dataset.set === 'gold' ? newly : left, Number(b.dataset.i), comeBack);
      }));
      // The practice round comes in a fresh order each time.
      view.querySelector('#ckagain')?.addEventListener('click', () => round(shuffle(left), false));
      view.querySelector('#ckdone').onclick = ctx.onExit;
    }

    show();
  }

  const stop = () => {
    stopped = true;
    clearTimeout(pending);
    cleanup();
  };
  // Back from studying a kanji: the finish screen again, live, so Again still runs. Returns the
  // cleanup for the screen to hold, as at the start.
  let comeBack = null;
  round(ctx.deck, true);
  return stop;
}
