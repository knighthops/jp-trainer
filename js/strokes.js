// Stroke order from KanjiVG (kanjivg.tagaini.net, Ulrich Apel, CC BY-SA 3.0).
// Each kanji is a list of SVG path strings in a 109 by 109 box, in the order they are written.
// Watch: the strokes draw themselves one by one. Trace: draw each stroke with a finger;
// it is checked for where it starts, where it ends and the shape in between.

const BOX = 109;
let strokeMap = null;
let loading = null;

// Loaded the first time a kanji page needs it.
export function loadStrokes(tag = '') {
  loading ||= fetch(`data/strokes.json${tag}`)
    .then((r) => { if (!r.ok) throw new Error(r.status); return r.json(); })
    .then((d) => { strokeMap = d.k; return strokeMap; })
    .catch((err) => { loading = null; throw err; });
  return loading;
}
export const setStrokes = (map) => { strokeMap = map; };
export const strokesOf = (c) => strokeMap?.[c] || null;

const dist = (a, b) => Math.hypot(a.x - b.x, a.y - b.y);

// n points spaced evenly along a line drawn through the given points.
export function resample(points, n = 16) {
  if (points.length < 2) return Array.from({ length: n }, () => ({ ...points[0] }));
  const lens = [0];
  for (let i = 1; i < points.length; i++) lens.push(lens[i - 1] + dist(points[i - 1], points[i]));
  const total = lens.at(-1) || 1;
  const out = [];
  let j = 1;
  for (let s = 0; s < n; s++) {
    const at = (total * s) / (n - 1);
    while (j < points.length - 1 && lens[j] < at) j++;
    const span = lens[j] - lens[j - 1] || 1;
    const t = Math.min(1, Math.max(0, (at - lens[j - 1]) / span));
    out.push({ x: points[j - 1].x + (points[j].x - points[j - 1].x) * t, y: points[j - 1].y + (points[j].y - points[j - 1].y) * t });
  }
  return out;
}

export const pathLength = (points) => points.slice(1).reduce((n, p, i) => n + dist(points[i], p), 0);

// Is a drawn stroke the expected one? Both are point lists in the 109 box.
// Short strokes (dots, ticks) get more room, since a fingertip covers most of them.
export function judgeStroke(drawn, expected) {
  if (drawn.length < 2 || pathLength(drawn) < 3) return { ok: false, why: 'tap' };
  const short = pathLength(expected) < 20;
  const reach = short ? 24 : 20;
  const a = resample(drawn);
  const b = resample(expected);
  if (dist(a[0], b.at(-1)) < reach && dist(a.at(-1), b[0]) < reach && dist(a[0], b[0]) > reach) return { ok: false, why: 'backwards' };
  if (dist(a[0], b[0]) > reach) return { ok: false, why: 'start' };
  if (dist(a.at(-1), b.at(-1)) > reach * 1.2) return { ok: false, why: 'end' };
  const avg = a.reduce((n, p, i) => n + dist(p, b[i]), 0) / a.length;
  if (avg > (short ? 20 : 15)) return { ok: false, why: 'shape' };
  return { ok: true };
}

export const WHY = {
  tap: 'Draw the stroke as a line.',
  backwards: 'Right place, wrong way round. Start from the other end.',
  start: 'Start where the dot shows.',
  end: 'Close: end the stroke where the guide does.',
  shape: 'Follow the shape of the guide.',
};

const reduced = () => typeof matchMedia === 'function' && matchMedia('(prefers-reduced-motion: reduce)').matches;
const ns = 'http://www.w3.org/2000/svg';

const boxSvg = (list, { ghost = true } = {}) => `<svg class="sk-svg" viewBox="0 0 ${BOX} ${BOX}" role="img">
  <path class="sk-grid" d="M54.5 2V107M2 54.5H107"/>
  <g class="sk-ghost" ${ghost ? '' : 'hidden'}>${list.map((d) => `<path d="${d}"/>`).join('')}</g>
  <g class="sk-ink"></g>
  <g class="sk-nums"></g>
  <path class="sk-live" d=""/>
</svg>`;

// Points along a path element, in box units.
const pointsOf = (path, n = 24) => {
  const len = path.getTotalLength();
  return Array.from({ length: n }, (_, i) => {
    const p = path.getPointAtLength((len * i) / (n - 1));
    return { x: p.x, y: p.y };
  });
};

// Draws stroke i in ink, animated unless motion is reduced. Resolves when drawn.
function inkStroke(svg, d, i, { speed = 1, number = true } = {}) {
  const g = svg.querySelector('.sk-ink');
  const path = document.createElementNS(ns, 'path');
  path.setAttribute('d', d);
  g.append(path);
  if (number) {
    const start = path.getPointAtLength(0);
    const t = document.createElementNS(ns, 'text');
    t.setAttribute('x', String(Math.max(5, Math.min(BOX - 5, start.x - 5))));
    t.setAttribute('y', String(Math.max(8, Math.min(BOX - 2, start.y - 3))));
    t.textContent = String(i + 1);
    svg.querySelector('.sk-nums').append(t);
  }
  if (reduced() || !path.animate) return Promise.resolve();
  const len = path.getTotalLength();
  path.style.strokeDasharray = `${len}`;
  const anim = path.animate([{ strokeDashoffset: len }, { strokeDashoffset: 0 }], { duration: Math.max(220, len * 9) / speed, easing: 'ease-in-out', fill: 'forwards' });
  return anim.finished.catch(() => {});
}

const clearInk = (svg) => {
  svg.querySelector('.sk-ink').innerHTML = '';
  svg.querySelector('.sk-nums').innerHTML = '';
};

// The stroke-order box: watch it draw, then trace it, then trace it from memory.
// ctx: { onTraced(slips, fromMemory) }
export function mountStrokes(root, c, ctx = {}) {
  const list = strokesOf(c);
  if (!list) { root.hidden = true; return; }
  let token = 0;

  async function watch() {
    const my = ++token;
    root.innerHTML = `<div class="sechead"><span class="caps">Stroke order · ${list.length} ${list.length === 1 ? 'stroke' : 'strokes'}</span></div>
      <div class="sk-box">${boxSvg(list)}</div>
      <div class="sk-row"><button class="btn ghost" data-sk="replay">Replay</button><button class="btn" data-sk="trace">Trace it</button></div>`;
    const svg = root.querySelector('svg');
    for (let i = 0; i < list.length; i++) {
      if (my !== token) return;
      await inkStroke(svg, list[i], i);
      if (!reduced()) await new Promise((r) => setTimeout(r, 120));
    }
  }

  function trace(memory = false) {
    const my = ++token;
    let i = 0;
    let slips = 0;
    let missesHere = 0;
    root.innerHTML = `<div class="sechead"><span class="caps">${memory ? 'From memory' : 'Trace'} · stroke <b class="num" data-sk-n>1</b> of ${list.length}</span>
        <button class="chip" data-sk="watch">Watch</button></div>
      <div class="sk-box big ${memory ? 'memory' : ''}">${boxSvg(list, { ghost: !memory })}<span class="sk-start" aria-hidden="true"></span></div>
      <p class="small center sk-msg" aria-live="polite">${memory ? 'No guide this time. Write it stroke by stroke.' : 'Draw each stroke in order, starting at the dot.'}</p>`;
    const svg = root.querySelector('svg');
    const live = svg.querySelector('.sk-live');
    const msg = root.querySelector('.sk-msg');
    const box = root.querySelector('.sk-box');
    const dot = root.querySelector('.sk-start');
    // Each stroke's points, from hidden paths so the browser does the curve maths.
    const probe = document.createElementNS(ns, 'path');
    probe.setAttribute('class', 'sk-probe');
    svg.append(probe);
    const expected = list.map((d) => { probe.setAttribute('d', d); return pointsOf(probe); });
    probe.remove();

    const showDot = () => {
      const show = !memory || missesHere >= 2;
      dot.hidden = !show || i >= list.length;
      if (dot.hidden) return;
      const p = expected[i][0];
      dot.style.left = `${(p.x / BOX) * 100}%`;
      dot.style.top = `${(p.y / BOX) * 100}%`;
    };
    const highlightGhost = () => {
      svg.querySelectorAll('.sk-ghost path').forEach((p, n) => p.classList.toggle('next', n === i));
    };
    showDot();
    highlightGhost();

    const toBox = (e) => {
      const m = svg.getScreenCTM().inverse();
      const pt = new DOMPoint(e.clientX, e.clientY).matrixTransform(m);
      return { x: pt.x, y: pt.y };
    };
    let drawn = null;
    svg.onpointerdown = (e) => {
      if (i >= list.length) return;
      e.preventDefault();
      svg.setPointerCapture(e.pointerId);
      drawn = [toBox(e)];
    };
    svg.onpointermove = (e) => {
      if (!drawn) return;
      drawn.push(toBox(e));
      live.setAttribute('d', `M${drawn.map((p) => `${p.x.toFixed(1)},${p.y.toFixed(1)}`).join('L')}`);
    };
    const up = async () => {
      if (!drawn) return;
      const got = drawn;
      drawn = null;
      live.setAttribute('d', '');
      const verdict = judgeStroke(got, expected[i]);
      if (verdict.ok) {
        missesHere = 0;
        const n = i;
        i++;
        root.querySelector('[data-sk-n]').textContent = String(Math.min(i + 1, list.length));
        msg.textContent = '';
        showDot();
        highlightGhost();
        await inkStroke(svg, list[n], n, { speed: 3 });
        if (my !== token) return;
        if (i >= list.length) done();
        return;
      }
      slips++;
      missesHere++;
      msg.textContent = WHY[verdict.why];
      box.classList.remove('shake2');
      void box.offsetWidth;
      box.classList.add('shake2');
      showDot();
      // After two misses on one stroke, show it drawn, then take it away again.
      if (missesHere >= 2) {
        const g = svg.querySelector('.sk-ink');
        const before = g.children.length;
        await inkStroke(svg, list[i], i, { number: false });
        if (my !== token) return;
        setTimeout(() => { if (my === token && g.children.length > before) g.lastChild.remove(); }, 500);
      }
    };
    svg.onpointerup = up;
    svg.onpointercancel = () => { drawn = null; live.setAttribute('d', ''); };

    function done() {
      box.classList.add('sk-done');
      msg.innerHTML = slips ? `Done, with ${slips} ${slips === 1 ? 'slip' : 'slips'}.` : '<strong>Clean! Every stroke right first time.</strong>';
      const row = document.createElement('div');
      row.className = 'sk-row';
      row.innerHTML = `<button class="btn ghost" data-sk="${memory ? 'memory' : 'trace'}">Again</button>${memory ? '<button class="btn ghost" data-sk="trace">With guide</button>' : '<button class="btn" data-sk="memory">From memory</button>'}`;
      root.append(row);
      ctx.onTraced?.(slips, memory);
    }
  }

  root.onclick = (e) => {
    const b = e.target.closest('[data-sk]');
    if (!b) return;
    const act = b.dataset.sk;
    if (act === 'replay' || act === 'watch') watch();
    else trace(act === 'memory');
  };
  watch();
  return () => { token++; };
}
