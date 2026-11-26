// Paint each goldfish with smooth vector shapes at K× size, then pixelate to a fixed palette with an outline.
const W = 100, H = 80, K = 8;
const PALETTE = ['#3a1206', '#5a1e08', '#8a2a06', '#b83e0a', '#d9560e', '#ee7016', '#f88a24', '#ffa640', '#ffc070', '#ffd9a0',
  '#fff6e8', '#ffffff', '#f2e2cc', '#e0c8a8', '#c8ab88',
  '#6e1010', '#a01e1a', '#c8302a', '#e64a3a', '#ff7a5e', '#ff9f86',
  '#120806', '#4a1e0c', '#7a3a1c'].map((h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)]);
const BAYER = [0, 8, 2, 10, 12, 4, 14, 6, 3, 11, 1, 9, 15, 7, 13, 5];
const OUT = '#3a1206';

function nearest(r, g, b) {
  let best = 0, bd = 1e9;
  const reddish = r > 110 && g / r < 0.4;
  PALETTE.forEach((p, i) => { if (i >= 15 && i <= 20 && !reddish) return; const d = 2 * (p[0] - r) ** 2 + 4 * (p[1] - g) ** 2 + 3 * (p[2] - b) ** 2; if (d < bd) { bd = d; best = i; } });
  const p = PALETTE[best]; return `rgb(${p[0]},${p[1]},${p[2]})`;
}

function pixelate(draw, dither = 10) {
  const big = document.createElement('canvas'); big.width = W * K; big.height = H * K;
  const c = big.getContext('2d'); c.scale(K, K); c.lineJoin = 'round'; c.lineCap = 'round'; draw(c);
  const d = c.getImageData(0, 0, W * K, H * K).data, px = new Array(W * H).fill(null);
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) { const k = ((y * K + j) * W * K + x * K + i) * 4, al = d[k + 3]; r += d[k] * al; g += d[k + 1] * al; b += d[k + 2] * al; a += al; }
    if (a / (K * K * 255) < 0.5) continue;
    const t = (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * dither;
    px[y * W + x] = nearest(r / a + t, g / a + t, b / a + t);
  }
  const o = px.slice();
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) if (!px[y * W + x]) {
    const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < W && yy < H && px[yy * W + xx];
    if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) o[y * W + x] = OUT;
  }
  return o;
}

function blit(ctx, px, ox, oy, s, flip) {
  for (let y = 0; y < H; y++) for (let x = 0; x < W; x++) { const c = px[y * W + x]; if (!c) continue; ctx.fillStyle = c; ctx.fillRect(ox + (flip ? W - 1 - x : x) * s, oy + y * s, s, s); }
}

const rng = (s) => () => { s |= 0; s = s + 0x6D2B79F5 | 0; let t = Math.imul(s ^ s >>> 15, 1 | s); t = t + Math.imul(t ^ t >>> 7, 61 | t) ^ t; return ((t ^ t >>> 14) >>> 0) / 4294967296; };
// ---------- helpers ----------
const lin = (c, x0, y0, x1, y1, stops) => { const g = c.createLinearGradient(x0, y0, x1, y1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
const rad = (c, x0, y0, r0, x1, y1, r1, stops) => { const g = c.createRadialGradient(x0, y0, r0, x1, y1, r1); stops.forEach(([o, col]) => g.addColorStop(o, col)); return g; };
function shape(c, pts) { c.beginPath(); c.moveTo(pts[0], pts[1]); for (let i = 2; i < pts.length; i += 6) c.bezierCurveTo(pts[i], pts[i + 1], pts[i + 2], pts[i + 3], pts[i + 4], pts[i + 5]); c.closePath(); }
function fin(c, pts, base, tip, opt = {}) {
  shape(c, pts);
  c.fillStyle = lin(c, base[0], base[1], tip[0], tip[1], FLAT ? [[0, '#ee7016'], [0.55, '#ee7016'], [0.72, '#fff0dc'], [1, '#fff0dc']] : opt.stops || [[0, '#ee6e16'], [0.35, '#f98a26'], [0.62, '#ffbe70'], [0.85, '#fff0dc'], [1, '#ffffff']]);
  c.fill();
  c.save(); shape(c, pts); c.clip();
  const n = FLAT ? -1 : opt.rays || 9, len = Math.hypot(tip[0] - base[0], tip[1] - base[1]) * 1.5, a0 = Math.atan2(tip[1] - base[1], tip[0] - base[0]), spread = opt.spread || 1.2;
  for (let i = 0; i <= n; i++) {
    const a = a0 - spread / 2 + (spread * i) / n;
    c.strokeStyle = i % 2 ? 'rgba(238,112,22,.8)' : 'rgba(255,255,255,.5)'; c.lineWidth = i % 2 ? 0.8 : 0.7;
    c.beginPath(); c.moveTo(base[0], base[1]); c.lineTo(base[0] + Math.cos(a) * len, base[1] + Math.sin(a) * len); c.stroke();
  }
  c.restore();
  shape(c, pts); c.strokeStyle = OUT; c.lineWidth = opt.lw || 1; c.stroke();
}
function eye(c, x, y, r) {
  c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = '#fff8ee'; c.fill(); c.strokeStyle = OUT; c.lineWidth = 1; c.stroke();
  c.beginPath(); c.arc(x + r * 0.08, y + r * 0.05, r * 0.76, 0, 7); c.fillStyle = rad(c, x - r * .2, y - r * .2, 0, x, y, r * .8, [[0, '#7a3a1c'], [1, '#2a0e06']]); c.fill();
  c.beginPath(); c.arc(x + r * 0.1, y + r * 0.08, r * 0.46, 0, 7); c.fillStyle = '#0e0604'; c.fill();
  c.beginPath(); c.arc(x - r * 0.28, y - r * 0.28, r * 0.28, 0, 7); c.fillStyle = '#ffffff'; c.fill();
  c.beginPath(); c.arc(x + r * 0.35, y + r * 0.38, r * 0.12, 0, 7); c.fill();
}
function wen(c, cx, cy, rx, ry) {
  // A smooth cap: four big bumps give a soft scalloped edge, filled with one gradient and no inner lines.
  const m = Math.min(rx, ry), lobes = [[cx - rx * 0.5, cy + ry * 0.15, m * 0.62], [cx - rx * 0.15, cy - ry * 0.3, m * 0.68], [cx + rx * 0.35, cy - ry * 0.15, m * 0.64], [cx + rx * 0.45, cy + ry * 0.35, m * 0.55], [cx, cy + ry * 0.2, m * 0.7]];
  lobes.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r + 0.9, 0, 7); c.fillStyle = OUT; c.fill(); });
  const g = FLAT ? '#e64a3a' : rad(c, cx - rx * 0.35, cy - ry * 0.45, 0, cx, cy, rx * 1.1, [[0, '#ff9f86'], [0.4, '#ff7a5e'], [0.8, '#e64a3a'], [1, '#c8302a']]);
  lobes.forEach(([x, y, r]) => { c.beginPath(); c.arc(x, y, r, 0, 7); c.fillStyle = g; c.fill(); });
  if (FLAT) return; c.fillStyle = 'rgba(255,214,190,.85)'; c.beginPath(); c.ellipse(cx - rx * 0.3, cy - ry * 0.4, rx * 0.2, ry * 0.12, -0.4, 0, 7); c.fill();
}
// Irregular orange patches: each is a cluster of jittered circles, lit from the top-left, with loose speckles around it.
function patches(c, list, seed, tone = ['#ee7016', '#f88a24', '#ffa640']) {
  if (FLAT) return; const r = rng(seed);
  list.forEach(([px, py, rx, ry]) => {
    const parts = [];
    for (let k = 0; k < 9; k++) { const a = r() * Math.PI * 2, d = Math.sqrt(r()) * 0.75; parts.push([px + Math.cos(a) * rx * d, py + Math.sin(a) * ry * d, Math.min(rx, ry) * (0.45 + r() * 0.4)]); }
    parts.forEach(([x, y, pr]) => { c.beginPath(); c.arc(x, y, pr, 0, 7); c.fillStyle = tone[0]; c.fill(); });
    parts.forEach(([x, y, pr]) => { c.beginPath(); c.arc(x - pr * .2, y - pr * .25, pr * .72, 0, 7); c.fillStyle = tone[1]; c.fill(); });
    parts.slice(0, 4).forEach(([x, y, pr]) => { c.beginPath(); c.arc(x - pr * .35, y - pr * .4, pr * .35, 0, 7); c.fillStyle = tone[2]; c.fill(); });
    for (let k = 0; k < 6; k++) { const a = r() * Math.PI * 2, d = 1 + r() * 0.5; c.beginPath(); c.arc(px + Math.cos(a) * rx * d, py + Math.sin(a) * ry * d, 0.6 + r() * 0.7, 0, 7); c.fillStyle = tone[1]; c.fill(); }
  });
}
// Tail wag: squeeze the tail toward its base. WAG is 1 at rest, lower mid-stroke.
let WAG = 1, TAILS = 1, NOWEN = false, FLAT = false; // FLAT paints solid fills with no patches, rays or scales, for fry and young; // TAILS shortens the tail and NOWEN hides the hood, for fry
function tail(c, bx, by, f) { c.save(); c.translate(bx, by); c.scale(WAG * TAILS, (1 + (1 - WAG) * 0.25) * (0.6 + TAILS * 0.4)); c.translate(-bx, -by); f(); c.restore(); }
function bodyShade(c, pts, cx, cy, r) {
  shape(c, pts);
  c.fillStyle = FLAT ? '#ee7016' : rad(c, cx, cy, 1, cx + 4, cy + 8, r, [[0, '#ffb24e'], [0.3, '#f98a26'], [0.65, '#ee7016'], [0.9, '#d9560e'], [1, '#b83e0a']]);
  c.fill();
}
function scales(c, x0, y0, x1, y1, col) {
  if (FLAT) return; c.strokeStyle = col; c.lineWidth = 0.7;
  let row = 0;
  for (let y = y0; y < y1; y += 4, row++) for (let x = x0 + (row % 2) * 2.5; x < x1; x += 5) { c.beginPath(); c.arc(x, y, 2, 0.25 * Math.PI, 0.75 * Math.PI); c.stroke(); }
}

// ---------- Ryukin ----------
function ryukin(c) {
  // long flowing double tail, upper lobe sweeping up, lower lobe trailing down
  // big flowing double tail, about as large as the body
  tail(c, 40, 44, () => fin(c, [40, 38, 32, 29, 19, 15, 4, 2, 1, 10, 4, 20, 11, 28, 6, 34, 7, 39, 15, 44, 6, 51, 3, 60, 1, 71, 15, 66, 30, 58, 40, 50], [40, 44], [3, 40], { rays: 16, spread: 2.5 }));
  fin(c, [64, 11, 62, 4, 54, 0.5, 44, 1, 46, 6, 45, 12, 46, 16], [55, 11], [45, 2], { rays: 8, spread: 1 });
  fin(c, [48, 57, 45, 60, 41, 64, 37, 66, 38, 70, 42, 70, 45, 67, 48, 64, 50, 61, 51, 58], [49, 58], [38, 69], { rays: 4, spread: 0.8, lw: 0.8 });
  // hump near the middle, a long sloped forehead to a pointed snout, shallower belly
  const body = [98, 44, 97, 37, 93, 33, 87, 31, 80, 29, 75, 20, 68, 13, 63, 9, 54, 9, 48, 14, 44, 20, 41, 30, 38, 38, 36, 41, 36, 47, 38, 50, 44, 60, 56, 68, 70, 67, 84, 66, 96, 54, 98, 44];
  bodyShade(c, body, 64, 24, 42);
  c.save(); shape(c, body); c.clip();
  c.fillStyle = rad(c, 72, 64, 2, 72, 64, 16, [[0, '#ffffff'], [0.5, '#fff1de'], [0.8, 'rgba(255,220,170,.7)'], [1, 'rgba(255,200,140,0)']]); c.fillRect(40, 44, 60, 34);
  c.fillStyle = rad(c, 90, 51, 1, 90, 51, 7, [[0, 'rgba(255,240,220,.95)'], [1, 'rgba(255,200,140,0)']]); c.fillRect(78, 40, 22, 22);
  scales(c, 48, 26, 74, 54, 'rgba(255,196,112,.35)');
  if (!FLAT) { c.fillStyle = 'rgba(255,214,150,.9)'; c.beginPath(); c.ellipse(64, 15, 9, 2.8, -0.3, 0, 7); c.fill(); }
  c.strokeStyle = '#c4480a'; c.lineWidth = 1.2; c.beginPath(); c.moveTo(81, 31); c.quadraticCurveTo(76, 43, 81, 57); c.stroke();
  c.restore();
  shape(c, body); c.strokeStyle = OUT; c.lineWidth = 1.1; c.stroke();
  eye(c, 90.5, 40, 5);
  c.fillStyle = '#5a1608'; c.beginPath(); c.ellipse(97.4, 46.5, 1, 1.4, 0, 0, 7); c.fill();
  fin(c, [64, 64, 61, 67, 58, 70, 54, 72, 55, 74.5, 59, 74.5, 62, 73, 65, 71, 66, 68, 67, 65], [65, 66], [56, 73], { rays: 4, spread: 0.8, lw: 0.8 });
  fin(c, [72, 54, 68, 56, 64, 58, 60, 61, 60, 65, 62, 67, 65, 66, 68, 64, 71, 61, 74, 57], [72, 57], [61, 65], { rays: 5, spread: 0.9, lw: 0.8 });
}

// ---------- Oranda ----------
function oranda(c) {
  tail(c, 37, 46, () => fin(c, [37, 40, 26, 28, 13, 16, 1, 17, 6, 25, 8, 33, 14, 41, 6, 49, 3, 61, 2, 76, 14, 70, 27, 59, 37, 52], [37, 46], [3, 46], { rays: 14, spread: 2.2, stops: [[0, '#ee6e16'], [0.25, '#ffa640'], [0.5, '#ffe2bc'], [0.75, '#fff6e8'], [1, '#ffffff']] }));
  fin(c, [62, 27, 60, 17, 53, 11, 43, 10, 46, 16, 44, 24, 43, 32], [54, 28], [44, 11], { rays: 7, spread: 0.9 });
  fin(c, [46, 59, 43, 63, 39, 67, 35, 69, 36, 73, 40, 73, 43, 70, 46, 67, 48, 64, 48, 60], [47, 60], [36, 72], { rays: 4, spread: 0.8, lw: 0.8 });
  const body = [92, 47, 91, 35, 80, 27, 64, 27, 50, 27, 40, 33, 36, 42, 34, 46, 34, 50, 36, 54, 44, 66, 58, 72, 72, 69, 84, 66, 92, 58, 92, 47];
  bodyShade(c, body, 60, 36, 38);
  c.save(); shape(c, body); c.clip();
  c.fillStyle = rad(c, 85, 51, 1, 85, 51, 11, [[0, '#ffffff'], [0.6, '#fff1de'], [1, 'rgba(255,220,170,0)']]); c.fillRect(64, 30, 36, 40);
  patches(c, [[54, 50, 6, 5], [64, 66, 9, 4], [44, 40, 3, 3]], 31, ['#f2e2cc', '#fff6e8', '#ffffff']);
  scales(c, 44, 38, 64, 56, 'rgba(255,196,112,.35)');
  c.strokeStyle = '#c4480a'; c.lineWidth = 1.1; c.beginPath(); c.moveTo(72, 34); c.quadraticCurveTo(68, 46, 72, 60); c.stroke();
  c.restore();
  shape(c, body); c.strokeStyle = OUT; c.lineWidth = 1.1; c.stroke();
  if (!NOWEN) wen(c, 78, 30.5, 11.5, 8);
  eye(c, 85, 43, 5.2);
  c.fillStyle = '#5a1608'; c.beginPath(); c.ellipse(91.4, 51, 1.1, 1.6, 0, 0, 7); c.fill();
  fin(c, [60, 67, 57, 70, 54, 73, 50, 76, 51, 79, 55, 79, 58, 78, 61, 76, 63, 72, 63, 68], [61, 68], [52, 78], { rays: 4, spread: 0.8, lw: 0.8 });
  fin(c, [71, 60, 66, 62, 61, 65, 56, 69, 57, 73, 58, 76, 62, 76, 67, 73, 71, 70, 73, 65], [71, 64], [57, 73], { rays: 5, spread: 0.9, lw: 0.8 });
}

// ---------- Ranchu ----------
function ranchu(c) {
  tail(c, 31, 47, () => fin(c, [31, 42, 25, 36, 17, 30, 8, 29, 12, 35, 12, 41, 17, 46, 12, 50, 10, 56, 7, 63, 16, 62, 24, 57, 31, 53], [31, 47], [9, 46], { rays: 10, spread: 1.9 }));
  const body = [92, 49, 91, 36, 80, 27, 62, 27, 45, 27, 30, 35, 29, 48, 28, 62, 42, 72, 60, 72, 80, 71, 92, 62, 92, 49];
  shape(c, body);
  c.fillStyle = rad(c, 58, 38, 2, 60, 46, 36, [[0, '#ffffff'], [0.45, '#fff6e8'], [0.8, '#f2e2cc'], [1, '#c8ab88']]); c.fill();
  c.save(); shape(c, body); c.clip();
  patches(c, [[48, 38, 11, 7], [40, 56, 6, 5], [62, 58, 8, 5], [33, 46, 3.5, 6]], 23);
  scales(c, 38, 36, 66, 60, 'rgba(255,255,255,.3)');
  c.fillStyle = 'rgba(160,120,80,.35)'; c.beginPath(); c.ellipse(58, 70, 26, 4, 0, 0, 7); c.fill();
  c.strokeStyle = '#d8b894'; c.lineWidth = 1; c.beginPath(); c.moveTo(72, 35); c.quadraticCurveTo(68, 47, 72, 61); c.stroke();
  c.restore();
  shape(c, body); c.strokeStyle = OUT; c.lineWidth = 1.1; c.stroke();
  if (!NOWEN) wen(c, 78, 31.5, 11.5, 8);
  eye(c, 85, 44, 5.2);
  c.fillStyle = '#5a1608'; c.beginPath(); c.ellipse(91.4, 52, 1.1, 1.6, 0, 0, 7); c.fill();
  fin(c, [57, 70, 55, 73, 52, 75, 49, 77, 50, 79, 53, 79, 56, 78, 58, 76, 60, 74, 60, 71], [58, 72], [51, 78], { rays: 4, spread: 0.8, lw: 0.8 });
  fin(c, [44, 66, 41, 69, 38, 71, 35, 73, 36, 76, 39, 76, 42, 74, 44, 72, 46, 70, 46, 67], [45, 67], [37, 75], { rays: 3, spread: 0.8, lw: 0.8 });
  fin(c, [73, 62, 69, 64, 65, 67, 61, 70, 62, 74, 64, 76, 67, 75, 70, 73, 73, 70, 75, 66], [73, 65], [63, 74], { rays: 5, spread: 0.9, lw: 0.8 });
}
const FISH = { ryukin, oranda, ranchu };
