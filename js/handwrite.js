// Handwritten kanji lookup, all on the device. data/write.json holds every jōyō and
// jinmeiyō kanji as its KanjiVG strokes, each cut to PTS evenly spaced points, plus
// KANJIDIC2 meanings and readings. A drawing is matched stroke by stroke against them.
//
// The match forgives the things people get wrong when copying a sign: size and place
// on the pad, the stroke order, a stroke drawn backwards, and a stroke or two too many
// or too few. Each costs a little, so the right kanji still tends to come first.
import { resample } from './strokes.js';

export const PTS = 10;
export const ALPHA = '0123456789ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghijklmnopqrstuvwxyz-_';
const STEP = ALPHA.length - 1;

const MISSING = 0.32; // A stroke with no partner.
const BACKWARDS = 0.08; // A stroke drawn from the wrong end.
const ORDER = 0.06; // A stroke out of its place in the order.
const RARE = 0.012; // A kanji outside the 2,500 most used.

// Points in a 0..1 box, PTS to a stroke, as two characters each.
export function encodeStrokes(strokes) {
  const q = (v) => ALPHA[Math.max(0, Math.min(STEP, Math.round(v * STEP)))];
  return strokes.map((s) => resample(s, PTS).map((p) => q(p.x) + q(p.y)).join('')).join('');
}

export function decodeStrokes(code) {
  const per = PTS * 2;
  const out = [];
  for (let s = 0; s + per <= code.length; s += per) {
    const stroke = [];
    for (let i = 0; i < per; i += 2) stroke.push({ x: ALPHA.indexOf(code[s + i]) / STEP, y: ALPHA.indexOf(code[s + i + 1]) / STEP });
    out.push(stroke);
  }
  return out;
}

// Centres the drawing and scales its longer side to 1, keeping its shape. A drawing
// smaller than a third of the box (a dot, a short tick) isn't blown up to fill it.
export function normalize(strokes, box = 1) {
  let x0 = Infinity; let y0 = Infinity; let x1 = -Infinity; let y1 = -Infinity;
  for (const s of strokes) for (const p of s) {
    x0 = Math.min(x0, p.x); x1 = Math.max(x1, p.x); y0 = Math.min(y0, p.y); y1 = Math.max(y1, p.y);
  }
  const scale = Math.max(x1 - x0, y1 - y0, box / 3);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  const flat = new Float32Array(strokes.length * PTS * 2);
  strokes.forEach((s, i) => resample(s, PTS).forEach((p, j) => {
    flat[(i * PTS + j) * 2] = (p.x - cx) / scale + 0.5;
    flat[(i * PTS + j) * 2 + 1] = (p.y - cy) / scale + 0.5;
  }));
  return { n: strokes.length, flat };
}

// Mean distance between stroke i of a and stroke j of b, either way round.
function strokeCost(a, i, b, j) {
  let fwd = 0;
  let back = 0;
  const ai = i * PTS * 2;
  const bj = j * PTS * 2;
  for (let k = 0; k < PTS; k++) {
    const ax = a[ai + k * 2];
    const ay = a[ai + k * 2 + 1];
    let dx = ax - b[bj + k * 2];
    let dy = ay - b[bj + k * 2 + 1];
    fwd += Math.sqrt(dx * dx + dy * dy);
    const r = PTS - 1 - k;
    dx = ax - b[bj + r * 2];
    dy = ay - b[bj + r * 2 + 1];
    back += Math.sqrt(dx * dx + dy * dy);
  }
  return Math.min(fwd, back + BACKWARDS * PTS) / PTS;
}

// Reused between calls: one cell per stroke pair.
let grid = new Float32Array(1024);

// How far a drawing is from a kanji: lower is closer. Strokes pair up cheapest first,
// so a wrong stroke order costs only a little.
export function distance(drawn, ref) {
  const { n } = drawn;
  const m = ref.n;
  if (grid.length < n * m) grid = new Float32Array(n * m * 2);
  for (let i = 0; i < n; i++) for (let j = 0; j < m; j++) {
    grid[i * m + j] = strokeCost(drawn.flat, i, ref.flat, j) + (ORDER * Math.abs(i / n - j / m));
  }
  let cost = 0;
  for (let left = Math.min(n, m); left > 0; left--) {
    let best = Infinity;
    let at = -1;
    for (let c = 0; c < n * m; c++) if (grid[c] < best) { best = grid[c]; at = c; }
    cost += best;
    const i = Math.floor(at / m);
    const j = at % m;
    for (let x = 0; x < m; x++) grid[i * m + x] = Infinity;
    for (let y = 0; y < n; y++) grid[y * m + j] = Infinity;
  }
  return (cost + MISSING * Math.abs(n - m)) / Math.max(n, m);
}

// The file as lookups: [{ k, ref, mean, on, kun, freq }].
export function makeWriteIndex(file) {
  return file.k.map(([k, code, mean, on, kun, freq]) => ({
    k, ref: normalize(decodeStrokes(code)), mean, on, kun, freq,
  }));
}

// The closest kanji to a drawing, as strokes of {x, y} points in a box of the given size.
export function recognize(index, strokes, { box = 1, limit = 10 } = {}) {
  const drawn = strokes.filter((s) => s.length);
  if (!drawn.length) return [];
  const d = normalize(drawn.map((s) => s.map((p) => ({ x: p.x / box, y: p.y / box }))), 1);
  const slack = Math.max(2, Math.round(d.n * 0.25));
  const scored = [];
  for (const e of index) {
    if (Math.abs(e.ref.n - d.n) > slack) continue;
    scored.push([distance(d, e.ref) + (e.freq ? 0 : RARE), e]);
  }
  scored.sort((a, b) => a[0] - b[0]);
  return scored.slice(0, limit).map(([, e]) => e);
}
