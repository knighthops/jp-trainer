// Goldfish tank: sprites, homes and the live tank, ported from the approved mocks in docs/goldfish/src.
// paint.js and tanks.js are copied as they are; the live tank is life.js with hooks for the app.

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

// Tanks: painted with vector shapes at k× and pixelated to a scene palette, like the fish.
const hexRGB = (h) => [parseInt(h.slice(1, 3), 16), parseInt(h.slice(3, 5), 16), parseInt(h.slice(5, 7), 16)];
const SP = ['#ffffff', '#eaf7fb', '#cdebf4', '#a9dcec', '#86cbe2', '#62b2d4', '#4794bc', '#33739a', '#24546f', '#1a3a4c',
  '#e2f59a', '#b6e060', '#7fc443', '#4f9e35', '#2f7430', '#1d4c24',
  '#fbf0dc', '#ecd6b0', '#d4b486', '#ad8a60', '#7c6044', '#c9d0d6', '#9aa6b2', '#6e7a88', '#4a5460', '#2e343c',
  '#f4c4b8', '#e09a8c', '#d9776a', '#b8524a',
  '#e0a868', '#c07c3e', '#94562a', '#6a3a1a', '#43230e', '#2a160a', '#fff4c4', '#ffe28a', '#f0b84a'].map(hexRGB);

function pixG(draw, w, h, o = {}) {
  const K = o.k || 6, pal = o.pal || SP, dith = o.dither ?? 6;
  const big = document.createElement('canvas'); big.width = w * K; big.height = h * K;
  const c = big.getContext('2d'); c.scale(K, K); c.lineJoin = 'round'; c.lineCap = 'round'; draw(c);
  const d = c.getImageData(0, 0, w * K, h * K).data, px = new Array(w * h).fill(null);
  for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) {
    let r = 0, g = 0, b = 0, a = 0;
    for (let j = 0; j < K; j++) for (let i = 0; i < K; i++) { const k = ((y * K + j) * w * K + x * K + i) * 4, al = d[k + 3]; r += d[k] * al; g += d[k + 1] * al; b += d[k + 2] * al; a += al; }
    if (a / (K * K * 255) < 0.5) continue;
    const t = (BAYER[(y % 4) * 4 + (x % 4)] / 16 - 0.5) * dith; r = r / a + t; g = g / a + t; b = b / a + t;
    const reddish = r > 110 && g / r < 0.4; let best = 0, bd = 1e9;
    pal.forEach((p, i) => { if (o.red && i >= 15 && i <= 20 && !reddish) return; const dd = 2 * (p[0] - r) ** 2 + 4 * (p[1] - g) ** 2 + 3 * (p[2] - b) ** 2; if (dd < bd) { bd = dd; best = i; } });
    px[y * w + x] = pal[best];
  }
  if (o.out) {
    const oc = hexRGB(o.out), q = px.slice();
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (!px[y * w + x]) {
      const n = (xx, yy) => xx >= 0 && yy >= 0 && xx < w && yy < h && px[yy * w + xx];
      if (n(x - 1, y) || n(x + 1, y) || n(x, y - 1) || n(x, y + 1)) q[y * w + x] = oc;
    }
    return pack(q, w, h, o.tone || nightScene);
  }
  return pack(px, w, h, o.tone || nightScene);
}
// Night mode: every palette colour maps to one dimmer, bluer colour, so the pixel art stays clean.
// Lamp and lantern glow keep their warm colour.
const GLOW = new Set(['255,244,196', '255,226,138', '240,184,74']);
const nightScene = (p) => GLOW.has(p.join()) ? p : [p[0] * 0.2 + 12, p[1] * 0.27 + 22, p[2] * 0.38 + 38];
const nightFish = (p) => [p[0] * 0.7 + 4, p[1] * 0.58 + 8, p[2] * 0.6 + 24];
function pack(px, w, h, tone) { const cv = toCv(px, w, h); cv.night = toCv(px.map((p) => p && tone(p)), w, h); cv.px = px; return cv; }
function toCv(px, w, h) {
  const cv = document.createElement('canvas'); cv.width = w; cv.height = h;
  const x = cv.getContext('2d'), id = x.createImageData(w, h);
  px.forEach((p, k) => { if (p) { id.data[k * 4] = p[0]; id.data[k * 4 + 1] = p[1]; id.data[k * 4 + 2] = p[2]; id.data[k * 4 + 3] = 255; } });
  x.putImageData(id, 0, 0); return cv;
}
let NIGHT = false;
const pick = (cv) => (NIGHT ? cv.night : cv);

// ---------- scenery helpers ----------
const qpt = (a, b, cc, t) => [(1 - t) ** 2 * a[0] + 2 * (1 - t) * t * b[0] + t * t * cc[0], (1 - t) ** 2 * a[1] + 2 * (1 - t) * t * b[1] + t * t * cc[1]];
function pebbles(c, x0, x1, top, bot, seed, n, cols) {
  const r = rng(seed), list = [];
  for (let i = 0; i < n; i++) { const x = x0 + r() * (x1 - x0), t = top(x); list.push([x, t + r() * Math.max(0, bot - t), 1.2 + r() * 1.7, cols[r() * cols.length | 0]]); }
  list.sort((a, b) => a[1] - b[1]).forEach(([x, y, rr, col]) => {
    c.beginPath(); c.ellipse(x, y, rr * 1.3, rr, 0, 0, 7); c.fillStyle = col; c.fill(); c.strokeStyle = 'rgba(90,64,44,.6)'; c.lineWidth = 0.5; c.stroke();
    c.fillStyle = 'rgba(255,255,255,.75)'; c.beginPath(); c.arc(x - rr * 0.45, y - rr * 0.35, rr * 0.35, 0, 7); c.fill();
  });
}
function blade(c, x, y, h, bend, w, sway, cols = ['#2f7430', '#b6e060', '#1d4c24']) {
  const s = sway * h * 0.06, tip = [x + bend + s, y - h], mid = [x + bend * 0.3 + s * 0.4, y - h * 0.55];
  c.beginPath(); c.moveTo(x - w, y); c.quadraticCurveTo(mid[0] - w * 0.6, mid[1], tip[0], tip[1]); c.quadraticCurveTo(mid[0] + w * 0.8, mid[1], x + w, y); c.closePath();
  c.fillStyle = lin(c, x, y, tip[0], tip[1], [[0, cols[0]], [0.5, '#4f9e35'], [1, cols[1]]]); c.fill(); c.strokeStyle = cols[2]; c.lineWidth = 0.6; c.stroke();
}
function valis(c, x, y, n, hmin, hmax, sway, seed) {
  const r = rng(seed);
  for (let i = 0; i < n; i++) blade(c, x + (i - n / 2) * 2.4 + r() * 2, y, hmin + r() * (hmax - hmin), (r() - 0.5) * 14, 1.6 + r() * 0.6, sway * (0.7 + r() * 0.6));
}
function stem(c, x, y, h, sway, seed, warm) {
  const r = rng(seed), a = [x, y], tip = [x + sway * h * 0.07 + (r() - 0.5) * 8, y - h], b = [x + (r() - 0.5) * 4, y - h * 0.5];
  c.strokeStyle = warm ? '#94562a' : '#2f7430'; c.lineWidth = 1; c.beginPath(); c.moveTo(...a); c.quadraticCurveTo(...b, ...tip); c.stroke();
  let sd = r() > 0.5 ? 1 : -1;
  for (let t = 0.1; t <= 1.001; t += 0.055 + r() * 0.05) {
    const [px, py] = qpt(a, b, tip, t), s = (3.8 - t * 1.6) * (0.75 + r() * 0.45), up = t > 0.62;
    const col = warm ? (up ? '#e09a8c' : t > 0.35 ? '#d9776a' : '#b8524a') : (up ? '#b6e060' : t > 0.35 ? '#7fc443' : '#4f9e35');
    sd = -sd; const ang = sd * -(0.35 + r() * 0.5) + sway * 0.12;
    c.beginPath(); c.ellipse(px + sd * s * 0.75, py, s, s * 0.4, ang, 0, 7); c.fillStyle = col; c.fill(); c.strokeStyle = warm ? '#6a3a1a' : '#1d4c24'; c.lineWidth = 0.5; c.stroke();
  }
  c.beginPath(); c.ellipse(tip[0], tip[1] - 0.5, 1.4, 2.2, 0, 0, 7); c.fillStyle = warm ? '#f4c4b8' : '#e2f59a'; c.fill();
}
function bush(c, x, y, s, sway, seed) {
  const r = rng(seed), leaves = [];
  for (let i = 0; i < 7; i++) { const a = -Math.PI / 2 + (i / 6 - 0.5) * 2.4 + (r() - 0.5) * 0.25; leaves.push([a, s * (0.65 + r() * 0.45)]); }
  leaves.sort((p, q) => Math.abs(q[0] + Math.PI / 2) - Math.abs(p[0] + Math.PI / 2)).forEach(([a, len]) => {
    const ex = x + Math.cos(a) * len + sway * len * 0.08, ey = y + Math.sin(a) * len;
    c.strokeStyle = '#2f7430'; c.lineWidth = 0.8; c.beginPath(); c.moveTo(x, y); c.lineTo(ex, ey); c.stroke();
    c.save(); c.translate(ex, ey); c.rotate(a);
    c.beginPath(); c.ellipse(0, 0, len * 0.42, len * 0.2, 0, 0, 7); c.fillStyle = lin(c, 0, -len * 0.2, 0, len * 0.2, [[0, '#7fc443'], [0.5, '#4f9e35'], [1, '#2f7430']]); c.fill();
    c.strokeStyle = '#1d4c24'; c.lineWidth = 0.6; c.stroke(); c.strokeStyle = 'rgba(182,224,96,.8)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(-len * 0.38, 0); c.lineTo(len * 0.38, 0); c.stroke();
    c.restore();
  });
}
function moss(c, x0, x1, y, h, seed) {
  const r = rng(seed);
  for (let x = x0; x < x1; x += 1.6) { const hh = h * (0.5 + r() * 0.6); c.beginPath(); c.arc(x, y - hh * 0.5, hh * 0.55 + 0.8, 0, 7); c.fillStyle = r() > 0.5 ? '#7fc443' : '#4f9e35'; c.fill(); }
  for (let x = x0 + 1; x < x1 - 1; x += 2.3) { c.beginPath(); c.arc(x, y - h * (0.6 + r() * 0.4), 0.9, 0, 7); c.fillStyle = '#b6e060'; c.fill(); }
}
function rock(c, x, y, rx, ry, seed) {
  const r = rng(seed), pts = [];
  for (let i = 0; i <= 8; i++) { const a = Math.PI + (i / 8) * Math.PI, k = 0.82 + r() * 0.26; pts.push([x + Math.cos(a) * rx * (i === 0 || i === 8 ? 1 : k), y + Math.sin(a) * ry * k]); }
  c.beginPath(); c.moveTo(...pts[0]);
  for (let i = 1; i < pts.length - 1; i++) { const m = [(pts[i][0] + pts[i + 1][0]) / 2, (pts[i][1] + pts[i + 1][1]) / 2]; c.quadraticCurveTo(...pts[i], ...m); }
  c.lineTo(...pts[8]); c.closePath();
  c.fillStyle = rad(c, x - rx * 0.35, y - ry * 0.7, 1, x, y - ry * 0.3, Math.max(rx, ry) * 1.2, [[0, '#c9d0d6'], [0.4, '#9aa6b2'], [0.8, '#6e7a88'], [1, '#4a5460']]); c.fill();
  c.strokeStyle = '#2e343c'; c.lineWidth = 0.9; c.stroke();
  c.strokeStyle = 'rgba(74,84,96,.9)'; c.lineWidth = 0.6; c.beginPath(); c.moveTo(x + rx * 0.1, y - ry * 0.75); c.lineTo(x + rx * 0.25, y - ry * 0.35); c.lineTo(x + rx * 0.15, y - ry * 0.05); c.stroke();
  c.fillStyle = 'rgba(255,255,255,.55)'; c.beginPath(); c.ellipse(x - rx * 0.35, y - ry * 0.72, rx * 0.22, ry * 0.1, -0.3, 0, 7); c.fill();
}
function wood(c, path, w) {
  [[w + 1.6, '#2a160a'], [w, '#6a3a1a'], [w * 0.55, '#94562a']].forEach(([lw, col]) => { c.strokeStyle = col; c.lineWidth = lw; c.beginPath(); c.moveTo(path[0], path[1]); for (let i = 2; i < path.length; i += 4) c.quadraticCurveTo(path[i], path[i + 1], path[i + 2], path[i + 3]); c.stroke(); });
  c.save(); c.translate(-w * 0.18, -w * 0.25); c.strokeStyle = '#c07c3e'; c.lineWidth = w * 0.2; c.beginPath(); c.moveTo(path[0], path[1]); for (let i = 2; i < path.length; i += 4) c.quadraticCurveTo(path[i], path[i + 1], path[i + 2], path[i + 3]); c.stroke(); c.restore();
}
function waterFill(c, x0, y0, x1, y1) {
  c.fillStyle = lin(c, 0, y0, 0, y1, [[0, '#86cbe2'], [0.4, '#62b2d4'], [1, '#4794bc']]); c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.fillStyle = rad(c, (x0 + x1) / 2, y0, 2, (x0 + x1) / 2, y0, (x1 - x0) * 0.5, [[0, 'rgba(169,220,236,.45)'], [1, 'rgba(169,220,236,0)']]); c.fillRect(x0, y0, x1 - x0, y1 - y0);
}
function surface(c, x0, x1, y) {
  c.fillStyle = '#cdebf4'; c.fillRect(x0, y, x1 - x0, 2.2); c.fillStyle = '#eaf7fb'; c.fillRect(x0, y, x1 - x0, 0.9);
  c.fillStyle = 'rgba(234,247,251,.9)'; for (let x = x0 + 4; x < x1 - 6; x += 13) c.fillRect(x, y + 3.2, 5, 0.8);
}
function sandBed(c, x0, x1, top, y1, seed, light) {
  c.beginPath(); c.moveTo(x0, y1); for (let x = x0; x <= x1; x += 2) c.lineTo(x, top(x)); c.lineTo(x1, y1); c.closePath();
  c.fillStyle = lin(c, 0, top((x0 + x1) / 2), 0, y1, light ? [[0, '#fbf0dc'], [1, '#d4b486']] : [[0, '#ecd6b0'], [1, '#ad8a60']]); c.fill();
  pebbles(c, x0 + 2, x1 - 2, top, y1 - 1, seed, Math.round((x1 - x0) * 0.9), light ? ['#fbf0dc', '#ecd6b0', '#d4b486', '#c9d0d6'] : ['#ecd6b0', '#d4b486', '#ad8a60', '#c9d0d6', '#9aa6b2', '#f4c4b8', '#e2f59a']);
}
function glare(c, x, y, h, w) { c.fillStyle = '#ffffff'; c.beginPath(); c.moveTo(x + w, y); c.lineTo(x + w * 2, y); c.lineTo(x + w, y + h); c.lineTo(x, y + h); c.closePath(); c.fill(); }
function lantern(c, x, y) { // stone toro, base centre at (x, y)
  const st = (px, py, pw, ph) => { c.fillStyle = lin(c, px, 0, px + pw, 0, [[0, '#c9d0d6'], [0.5, '#9aa6b2'], [1, '#6e7a88']]); c.fillRect(px, py, pw, ph); c.strokeStyle = '#2e343c'; c.lineWidth = 0.8; c.strokeRect(px, py, pw, ph); };
  st(x - 8, y - 4, 16, 4); st(x - 2.5, y - 18, 5, 14); st(x - 6, y - 21, 12, 3);
  c.fillStyle = '#6e7a88'; c.fillRect(x - 5, y - 29, 10, 8); c.strokeStyle = '#2e343c'; c.strokeRect(x - 5, y - 29, 10, 8);
  c.fillStyle = '#ffe28a'; c.fillRect(x - 2.6, y - 27.5, 5.2, 5); c.fillStyle = '#fff4c4'; c.fillRect(x - 1.4, y - 26.5, 2.4, 2.6);
  c.beginPath(); c.moveTo(x - 11, y - 28); c.quadraticCurveTo(x - 6, y - 30, x - 3, y - 35); c.lineTo(x + 3, y - 35); c.quadraticCurveTo(x + 6, y - 30, x + 11, y - 28); c.closePath();
  c.fillStyle = lin(c, 0, y - 35, 0, y - 28, [[0, '#9aa6b2'], [1, '#4a5460']]); c.fill(); c.stroke();
  c.beginPath(); c.arc(x, y - 37, 2.2, 0, 7); c.fillStyle = '#9aa6b2'; c.fill(); c.stroke();
  c.fillStyle = '#7fc443'; [[x - 7, y - 4.5], [x + 5, y - 3.8], [x - 9, y - 28.5], [x + 2, y - 33]].forEach(([mx, my]) => { c.beginPath(); c.ellipse(mx, my, 2.4, 1.1, 0, 0, 7); c.fill(); });
}
function lily(c, x, y, r) {
  c.beginPath(); c.ellipse(x, y, r, r * 0.3, 0, 0.25, Math.PI * 2 - 0.05); c.lineTo(x, y); c.closePath();
  c.fillStyle = lin(c, 0, y - r * 0.3, 0, y + r * 0.3, [[0, '#b6e060'], [1, '#4f9e35']]); c.fill(); c.strokeStyle = '#1d4c24'; c.lineWidth = 0.7; c.stroke();
  c.strokeStyle = 'rgba(47,116,48,.8)'; c.lineWidth = 0.5; c.beginPath(); c.moveTo(x, y + r * 0.3); c.lineTo(x, y + r * 0.3 + 6); c.stroke();
}
function woodBar(c, x0, y0, x1, y1) {
  c.fillStyle = lin(c, 0, y0, 0, y1, [[0, '#c07c3e'], [0.35, '#94562a'], [1, '#6a3a1a']]); c.fillRect(x0, y0, x1 - x0, y1 - y0);
  c.strokeStyle = 'rgba(67,35,14,.6)'; c.lineWidth = 0.5; for (let yy = y0 + 2; yy < y1 - 1; yy += 2.5) { c.beginPath(); c.moveTo(x0 + 3, yy); c.lineTo(x1 - 3, yy + 0.3); c.stroke(); }
  c.fillStyle = '#e0a868'; c.fillRect(x0, y0, x1 - x0, 0.9);
}

// ---------- the four homes ----------
function bowlPath(c, cx, cy, r, yt, yb) { const at = Math.asin((yt - cy) / r), ab = Math.asin((yb - cy) / r); c.beginPath(); c.arc(cx, cy, r, at, ab); c.arc(cx, cy, r, Math.PI - ab, Math.PI - at); c.closePath(); }
const TANKS = [
  { id: 'bowl', jp: '金魚鉢', en: 'Fishbowl', cap: 1, w: 140, h: 126, out: '#1a3a4c', surf: 40, fs: 0.6, swim: [20, 40, 120, 110], inside: (x, y) => (x - 70) ** 2 + (y - 68) ** 2 < 50 ** 2 && y > 42 && y < 107, fish: ['oranda'], bubbles: [[98, 110]],
    back(c, sw) {
      bowlPath(c, 70, 68, 56, 22, 120); c.fillStyle = rad(c, 54, 50, 4, 70, 68, 60, [[0, '#ffffff'], [0.6, '#eaf7fb'], [1, '#cdebf4']]); c.fill();
      c.save(); bowlPath(c, 70, 68, 53, 36, 117); c.clip();
      waterFill(c, 0, 40, 140, 126);
      sandBed(c, 10, 130, (x) => 122 - 15 * Math.sqrt(Math.max(0, 1 - ((x - 70) / 50) ** 2)), 122, 5);
      valis(c, 98, 113, 4, 22, 34, sw, 3); bush(c, 42, 114, 11, sw, 8);
      bowlPath(c, 70, 68, 53, 36, 117); c.strokeStyle = 'rgba(71,148,188,.55)'; c.lineWidth = 3; c.stroke();
      c.restore();
      c.save(); bowlPath(c, 70, 68, 53, 36, 117); c.clip(); c.beginPath(); c.ellipse(70, 40, 45, 3.4, 0, 0, 7); c.fillStyle = '#cdebf4'; c.fill(); c.strokeStyle = '#86cbe2'; c.lineWidth = 0.8; c.stroke(); c.restore();
      c.fillStyle = '#cdebf4'; c.fillRect(48, 117, 44, 3.5);
      c.beginPath(); c.ellipse(70, 22, 34, 4.5, 0, 0, 7); c.strokeStyle = '#a9dcec'; c.lineWidth = 3.4; c.stroke(); c.strokeStyle = '#ffffff'; c.lineWidth = 1; c.beginPath(); c.ellipse(70, 21.2, 33.5, 3.8, 0, Math.PI * 1.05, Math.PI * 1.7); c.stroke();
    },
    front: [[0.65, (c) => { c.strokeStyle = '#fff'; c.lineCap = 'round'; c.lineWidth = 3.4; c.beginPath(); c.arc(70, 68, 47, 3.5, 4.15); c.stroke(); c.beginPath(); c.arc(70, 68, 47, 4.32, 4.42); c.stroke(); c.lineWidth = 2; c.beginPath(); c.arc(70, 68, 49, 0.25, 0.7); c.stroke(); }]] },

  { id: 'small', jp: 'すいそう', en: 'Small tank', cap: 3, w: 190, h: 130, out: '#2e343c', surf: 26, fs: 0.47, swim: [10, 22, 180, 104], fish: ['ryukin', 'ranchu', 'oranda'], bubbles: [[166, 108]],
    back(c, sw) {
      c.fillStyle = '#eaf7fb'; c.fillRect(6, 14, 178, 108);
      waterFill(c, 8, 26, 182, 120); surface(c, 8, 182, 26);
      rock(c, 42, 110, 20, 15, 11); bush(c, 40, 97, 13, sw, 4);
      stem(c, 124, 108, 40, sw, 9); stem(c, 130, 109, 32, sw, 10);
      valis(c, 166, 108, 7, 46, 74, sw, 6);
      rock(c, 168, 110, 6, 4, 2);
      sandBed(c, 8, 182, (x) => 106 + 2.5 * Math.sin(x * 0.06), 120, 7);
      c.fillStyle = 'rgba(234,247,251,.65)'; c.fillRect(6, 14, 3, 108); c.fillRect(181, 14, 3, 108);
      [[4, 9, 186, 15], [4, 119, 186, 127]].forEach(([a, b, cc, d]) => { c.fillStyle = lin(c, 0, b, 0, d, [[0, '#6e7a88'], [0.3, '#4a5460'], [1, '#2e343c']]); c.fillRect(a, b, cc - a, d - b); c.fillStyle = '#9aa6b2'; c.fillRect(a, b, cc - a, 0.9); });
    },
    front: [[0.5, (c) => { glare(c, 10, 18, 26, 6); glare(c, 24, 18, 14, 3); c.fillStyle = '#fff'; c.fillRect(178, 30, 1.6, 50); }]] },

  { id: 'planted', jp: 'みずくさ すいそう', en: 'Planted tank', cap: 5, w: 250, h: 152, out: '#2a160a', surf: 26, fs: 0.5, swim: [12, 24, 238, 124], fish: ['ryukin', 'oranda', 'ranchu', 'oranda', 'ryukin'], bubbles: [[60, 130], [228, 128]],
    back(c, sw) {
      c.fillStyle = '#eaf7fb'; c.fillRect(6, 16, 238, 122);
      waterFill(c, 9, 26, 241, 136); surface(c, 9, 241, 26);
      [[24, 120, 92, 1, 0], [36, 121, 80, 2, 1], [48, 122, 66, 3, 0], [200, 121, 86, 4, 1], [214, 120, 98, 5, 0], [228, 122, 76, 6, 0]].forEach(([x, y, h, s, warm]) => stem(c, x, y, h, sw, s, warm));
      valis(c, 96, 124, 9, 60, 92, sw, 12);
      wood(c, [118, 128, 108, 104, 80, 82, 104, 108, 104, 66, 120, 112, 152, 84], 4.2);
      bush(c, 92, 116, 15, sw, 13); bush(c, 160, 90, 10, sw, 14);
      rock(c, 156, 130, 22, 26, 21); rock(c, 184, 132, 13, 14, 22); rock(c, 132, 133, 8, 7, 23);
      sandBed(c, 9, 241, (x) => 126 + 3 * Math.sin(x * 0.05), 136, 15, true);
      moss(c, 12, 86, 128, 6, 31); moss(c, 196, 240, 128, 7, 32); moss(c, 140, 176, 131, 4, 33);
      c.fillStyle = 'rgba(234,247,251,.65)'; c.fillRect(6, 16, 3, 122); c.fillRect(241, 16, 3, 122);
      c.fillStyle = lin(c, 0, 3, 0, 14, [[0, '#4a5460'], [1, '#2e343c']]); c.fillRect(3, 3, 244, 11); c.fillStyle = '#6e7a88'; c.fillRect(3, 3, 244, 1);
      c.fillStyle = '#fff4c4'; c.fillRect(14, 13, 222, 1.6);
      woodBar(c, 3, 13.5, 247, 17); woodBar(c, 3, 136, 247, 148);
    },
    front: [[0.16, (c) => { c.fillStyle = '#fff4c4'; [[30, 18], [90, 26], [150, 18], [200, 22]].forEach(([x, w]) => { c.beginPath(); c.moveTo(x, 17); c.lineTo(x + w, 17); c.lineTo(x + w + 30, 136); c.lineTo(x + 30, 136); c.closePath(); c.fill(); }); }],
      [0.5, (c) => { glare(c, 12, 20, 30, 7); glare(c, 28, 20, 16, 3); c.fillStyle = '#fff'; c.fillRect(236, 34, 1.6, 64); }]] },

  { id: 'grand', jp: 'おおきい すいそう', en: 'Grand aquarium', cap: 8, w: 300, h: 212, out: '#2a160a', surf: 26, fs: 0.45, swim: [12, 26, 288, 142], fish: ['oranda', 'ryukin', 'ranchu', 'oranda', 'ryukin', 'ranchu', 'oranda', 'ryukin'], bubbles: [[34, 146], [272, 144]],
    stand(c) {
      woodBar(c, 6, 156, 294, 163);
      c.fillStyle = lin(c, 0, 163, 0, 206, [[0, '#6a3a1a'], [1, '#43230e']]); c.fillRect(12, 163, 276, 43);
      [[20, 146], [154, 280]].forEach(([a, b]) => {
        c.fillStyle = lin(c, a, 0, b, 0, [[0, '#94562a'], [0.5, '#a8673a'], [1, '#94562a']]); c.fillRect(a, 168, b - a, 33);
        c.strokeStyle = '#43230e'; c.lineWidth = 1; c.strokeRect(a, 168, b - a, 33); c.strokeStyle = '#c07c3e'; c.lineWidth = 0.7; c.strokeRect(a + 4, 172, b - a - 8, 25);
        const hx = a < 100 ? b - 9 : a + 9; c.beginPath(); c.arc(hx, 184.5, 2, 0, 7); c.fillStyle = '#ffe28a'; c.fill(); c.strokeStyle = '#6a3a1a'; c.lineWidth = 0.6; c.stroke();
      });
      c.fillStyle = '#2a160a'; c.fillRect(14, 204, 8, 6); c.fillRect(278, 204, 8, 6);
    },
    back(c, sw) {
      c.fillStyle = '#eaf7fb'; c.fillRect(6, 16, 288, 138);
      waterFill(c, 9, 26, 291, 150); surface(c, 9, 291, 26);
      [[20, 140, 104, 41, 0], [30, 141, 92, 42, 1], [42, 142, 80, 43, 0], [242, 141, 100, 44, 1], [256, 140, 112, 45, 0], [270, 141, 96, 46, 1], [282, 142, 82, 47, 0]].forEach(([x, y, h, s, warm]) => stem(c, x, y, h, sw, s, warm));
      valis(c, 120, 144, 10, 64, 104, sw, 48); valis(c, 214, 144, 7, 56, 90, sw, 49);
      wood(c, [150, 148, 166, 116, 196, 98, 168, 122, 150, 92, 180, 106, 214, 112], 4.6);
      rock(c, 186, 148, 24, 28, 51); rock(c, 216, 150, 14, 15, 52); rock(c, 98, 150, 16, 16, 53); rock(c, 160, 151, 8, 6, 54);
      lantern(c, 66, 148);
      bush(c, 100, 134, 14, sw, 55); bush(c, 236, 138, 12, sw, 56);
      sandBed(c, 9, 291, (x) => 142 + 3 * Math.sin(x * 0.045), 150, 57, true);
      moss(c, 12, 50, 146, 6, 61); moss(c, 120, 160, 147, 5, 62); moss(c, 228, 290, 146, 7, 63);
      lily(c, 70, 27, 9); lily(c, 88, 27.5, 6); lily(c, 210, 27, 8);
      c.fillStyle = 'rgba(234,247,251,.65)'; c.fillRect(6, 16, 3, 138); c.fillRect(291, 16, 3, 138);
      c.fillStyle = lin(c, 0, 2, 0, 14, [[0, '#94562a'], [0.4, '#6a3a1a'], [1, '#43230e']]); c.fillRect(2, 2, 296, 12); c.fillStyle = '#c07c3e'; c.fillRect(2, 2, 296, 1);
      c.fillStyle = '#fff4c4'; c.fillRect(14, 13, 272, 1.6);
      woodBar(c, 2, 13.5, 298, 17); woodBar(c, 2, 150, 298, 157);
    },
    front: [[0.16, (c) => { c.fillStyle = '#fff4c4'; [[30, 20], [96, 30], [170, 18], [226, 26]].forEach(([x, w]) => { c.beginPath(); c.moveTo(x, 17); c.lineTo(x + w, 17); c.lineTo(x + w + 34, 150); c.lineTo(x + 34, 150); c.closePath(); c.fill(); }); }],
      [0.5, (c) => { glare(c, 12, 20, 34, 8); glare(c, 30, 20, 18, 3); c.fillStyle = '#fff'; c.fillRect(286, 36, 1.6, 74); }]] },
];


// ---------- growth-stage sprites ----------
// Fry and young are painted flat, then mapped to two simple tones plus the outline:
// fry are plain bronze with a pale belly and fin tips; young are a soft orange with peach, and a rose hood.
const lum = (p) => (p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11) / 255;
const tones = (dark, mid, light, hood) => (p) => { const l = lum(p); if (l < 0.22) return dark; if (hood && p[0] > 110 && p[1] / p[0] < 0.4) return hood; return l < 0.8 ? mid : light; };
const fryTone = tones([74, 52, 24], [168, 134, 78], [226, 207, 160]);
const youngTone = tones([58, 18, 6], [242, 146, 70], [255, 226, 192], [232, 104, 80]);
const deadTone = (p) => { const l = p[0] * 0.3 + p[1] * 0.59 + p[2] * 0.11; return [l * 0.7 + 60, l * 0.7 + 62, l * 0.7 + 66]; };
const STAGE = { adult: 0.5, young: 0.4, fry: 0.3 };
const LOOK = {};
function look(breed, stage, size) {
  const key = breed + stage + (size || ''); if (LOOK[key]) return LOOK[key];
  const fs = size || STAGE[stage], w = Math.round(100 * fs), h = Math.round(80 * fs);
  NOWEN = stage === 'fry'; TAILS = stage === 'fry' ? 0.7 : 1; FLAT = stage !== 'adult';
  const frames = [1, 0.88, 0.76, 0.88].map((wg) => {
    WAG = wg;
    let px = pixG((c) => { c.scale(fs, fs); FISH[breed](c); }, w, h, { pal: PALETTE, red: true, out: OUT, k: Math.round(6 / fs), dither: 4 }).px;
    if (stage === 'fry') px = px.map((p) => p && fryTone(p));
    if (stage === 'young') px = px.map((p) => p && youngTone(p));
    return { day: toCv(px, w, h), night: toCv(px.map((p) => p && nightFish(p)), w, h), dead: toCv(px.map((p) => p && deadTone(p)), w, h), deadNight: toCv(px.map((p) => p && nightFish(deadTone(p))), w, h) };
  });
  WAG = 1; TAILS = 1; NOWEN = false; FLAT = false;
  return (LOOK[key] = { frames, w, h });
}


// ---------- personalities ----------
// Which lines each trait reaches for when idle, and how chatty it is. Lines come from the app,
// already filtered to words you've been taught, so a key with no line simply stays quiet.
const IDLE = { Brave: ['look', 'fine', 'swim'], Chatty: ['hello', 'fine', 'thanks', 'water'], Sleepy: ['sleepy'], Shy: ['hello'], Playful: ['play', 'swim'], Hungry: ['food'] };
const TALK = { Chatty: 0.004, Playful: 0.002, Brave: 0.0015, Hungry: 0.0015, Sleepy: 0.001, Shy: 0.0005 };
const SPEED = { ryukin: 0.9, oranda: 0.6, ranchu: 0.32 };
export const BREEDS = { ryukin: 'Ryukin', oranda: 'Oranda', ranchu: 'Ranchu' };
export const TRAITS = ['Hungry', 'Shy', 'Playful', 'Sleepy', 'Chatty', 'Brave'];
// Fish are drawn smaller in bigger homes, and smaller again while young.
const GROW = { adult: 1, young: 0.8, fry: 0.4 };
export const fishSize = (t, stage) => +(t.fs * GROW[stage]).toFixed(3);

// The bowl's water is round: this box keeps every fish fully inside it.
const SWIM = { bowl: [26, 42, 114, 106] };
export const tankById = (id) => {
  const t = TANKS.find((x) => x.id === id) || TANKS[0];
  return SWIM[t.id] ? { ...t, swim: SWIM[t.id] } : t;
};

// Painting a home takes a moment, so each is painted once per visit to the app.
const BACKS = {};
function scenery(t) {
  return (BACKS[t.id] ||= {
    backs: [-1, 0, 1].map((sw) => pixG((c) => t.back(c, sw), t.w, t.h, { out: t.out })),
    fronts: t.front.map(([a, d]) => [a, pixG(d, t.w, t.h)]),
    stand: t.stand ? pixG(t.stand, t.w, t.h, { out: '#2a160a' }) : null,
  });
}

// A still picture of a home, for the Homes grid.
export function homeThumb(t, canvas) {
  const s = scenery(t);
  canvas.width = t.w; canvas.height = t.h;
  const c = canvas.getContext('2d');
  if (s.stand) c.drawImage(s.stand, 0, 0);
  c.drawImage(s.backs[1], 0, 0);
}

// A fish's portrait: its first frame, centred, belly-up if it died.
export function portrait(canvas, f, dead = false) {
  const lk = look(f.breed, f.stage, f.fs), c = canvas.getContext('2d');
  c.clearRect(0, 0, canvas.width, canvas.height);
  const img = dead ? lk.frames[0].dead : lk.frames[0].day, x = Math.round((canvas.width - lk.w) / 2), y = Math.round((canvas.height - lk.h) / 2);
  if (dead) { c.save(); c.translate(0, canvas.height); c.scale(1, -1); c.drawImage(img, x, y); c.restore(); } else c.drawImage(img, x, y);
}

// ---------- the live tank ----------
// opts: lights (the saved switch), hunger ('fed' | 'one' | 'dead'), lines ({ key: [jp, en] }, taught
// words only), onSay(fish, jp) to remember last words, tapGlass to let fish react to a tap.
// The loop stops by itself once its canvas leaves the page.
export function lifeTank(t, canvas, bubbleLayer, cast, opts = {}) {
  const { backs, fronts, stand } = scenery(t);
  const [X0, Y0, X1, Y1] = t.swim, SURF = t.surf;
  const lines = opts.lines || {};
  const r = rng(7), off = document.createElement('canvas'); off.width = t.w; off.height = t.h; const o = off.getContext('2d');
  canvas.width = t.w; canvas.height = t.h; const ctx = canvas.getContext('2d');
  const S = { lights: opts.lights ?? true, hunger: opts.hunger || 'fed', tick: 0, flakes: [], tap: null, ripple: null, bubbles: [], speech: [] };
  NIGHT = !S.lights;
  const place = (c, i, n) => {
    const lk = look(c.breed, c.stage, c.fs);
    const f = { ...c, lk, w: lk.w, h: lk.h, x: X0 + ((i + 0.5) / n) * (X1 - X0 - lk.w), y: Y0 + 10 + ((i * 0.618) % 1) * Math.max(0, Y1 - Y0 - lk.h - 20), d: i % 2 ? -1 : 1, p: r() * 10, mode: 'swim', timer: 0, wig: 0, zs: [] };
    f.tx = f.x; f.ty = f.y; return f;
  };
  const fish = cast.map((c, i) => place(c, i, cast.length));
  const lim = (f) => [X0, Y0, X1 - f.w, Y1 - f.h];
  const mouth = (f) => [f.d > 0 ? f.x + f.w * 0.95 : f.x + f.w * 0.05, f.y + f.h * 0.58];
  const alive = () => S.hunger !== 'dead';
  const talker = () => fish.find((f) => f.trait === 'Chatty') || fish[0];

  // Speech bubbles are HTML so the Japanese stays crisp. A tap shows the English and says the line.
  // Talk stays rare: idle chatter waits ~20s after any bubble and never repeats a line within ~1 minute.
  // Reactions (tap, feeding, eating) can come sooner but still never repeat the line just said.
  const heard = {}; let lastSay = -999;
  function say(f, key, event = true) {
    if (!f || !lines[key] || !S.lights || !alive() || S.speech.length) return;
    const since = S.tick - lastSay, ago = S.tick - (heard[key] ?? -9999);
    if (event ? since < 25 || ago < 150 : since < 220 || ago < 650) return;
    lastSay = S.tick; heard[key] = S.tick;
    const [jp, en] = lines[key], el = document.createElement('button');
    el.className = 'fbub'; el.textContent = jp; el.dataset.say = jp; el.lang = 'ja';
    const s = { f, jp, en, el, t: 40, en_: false };
    el.addEventListener('click', () => { s.en_ = !s.en_; el.textContent = s.en_ ? en : jp; el.lang = s.en_ ? 'en' : 'ja'; s.t = Math.max(s.t, 40); });
    bubbleLayer.appendChild(el); S.speech.push(s);
    opts.onSay?.(f, jp);
  }
  function placeBubbles() {
    S.speech = S.speech.filter((s) => { if (--s.t > 0 && S.lights && alive()) return true; s.el.remove(); return false; });
    S.speech.forEach((s) => { const f = s.f, hx = f.d > 0 ? f.x + f.w * 0.8 : f.x + f.w * 0.2; s.el.style.left = `${(hx / t.w) * 100}%`; s.el.style.top = `${((f.y + f.h * 0.05) / t.h) * 100}%`; });
  }

  // ---------- choosing where each fish wants to go ----------
  function wander(f) {
    const [a, b, c, d] = lim(f);
    if (f.breed === 'ryukin') { f.tx = f.x < (a + c) / 2 ? c - r() * 20 : a + r() * 20; f.ty = b + r() * (d - b); }
    else if (f.breed === 'ranchu') { f.tx = a + r() * (c - a); f.ty = b + (0.55 + r() * 0.45) * (d - b); }
    else { f.tx = a + (0.15 + r() * 0.7) * (c - a); f.ty = b + (0.2 + r() * 0.6) * (d - b); }
  }
  function think(f) {
    const [a, b, c, d] = lim(f);
    if (!S.lights) { f.mode = 'sleep'; f.ty = d - 1; f.tx = f.x; return; }
    if (S.flakes.some((k) => !k.gone)) {
      const [mx, my] = mouth(f); let best = null, bd = 1e9;
      S.flakes.forEach((k) => { if (k.gone) return; const dd = (k.x - mx) ** 2 + (k.y - my) ** 2 + (k.by && k.by !== f ? 4000 : 0); if (dd < bd) { bd = dd; best = k; } }); if (best) best.by = f;
      if (best) { f.mode = 'food'; f.d = best.x > f.x + f.w / 2 ? 1 : -1; f.tx = best.x - (f.d > 0 ? f.w * 0.95 : f.w * 0.05); f.ty = best.y - f.h * 0.58; return; }
    }
    if (f.timer > 0) { f.timer--; return; }
    if (S.hunger === 'one') { f.mode = 'beg'; f.ty = b + r() * 6; f.tx = f.x + (r() - 0.5) * 40; f.timer = 60; return; }
    if (f.trait === 'Sleepy' && r() < 0.25) { f.mode = 'nap'; f.tx = f.x; f.ty = d - 1; f.timer = 90; return; }
    if (f.trait === 'Shy' && r() < 0.3) { f.mode = 'hide'; f.tx = a + 8 + r() * 14; f.ty = b + (0.5 + r() * 0.4) * (d - b); f.timer = 70; return; }
    if (f.trait === 'Playful' && r() < 0.4) { const g = fish[(r() * fish.length) | 0]; if (g !== f) { f.mode = 'chase'; f.chase = g; f.timer = 70; return; } }
    f.mode = 'swim'; wander(f); f.timer = 25 + ((r() * 40) | 0);
  }

  // ---------- one step of life ----------
  function step() {
    S.tick++;
    S.flakes.forEach((k) => { if (k.gone) return; if (k.y < Y1 - 1) { k.y += k.y < SURF + 16 ? 0.5 : 0.22; k.x += Math.sin(k.y * 0.25 + k.ph) * 0.15; } else if (++k.rest > 120) k.gone = true; });
    S.flakes = S.flakes.filter((k) => !k.gone);
    fish.forEach((f) => {
      if (!alive()) { f.x += Math.sin(S.tick * 0.02 + f.p) * 0.05; return; }
      if (f.mode === 'swim' && r() < 0.06 && fish.some((g) => g !== f && Math.abs(g.x - f.x) < f.w * 0.6 && Math.abs(g.y - f.y) < f.h * 0.5)) { wander(f); f.timer = 30; }
      if (f.mode === 'chase' && f.chase) { f.tx = f.chase.x - f.chase.d * 14; f.ty = f.chase.y + 2; }
      const arrived = Math.hypot(f.tx - f.x, f.ty - f.y) < 1.5;
      if (arrived || f.mode === 'swim' || f.mode === 'beg' || f.mode === 'chase') { if (arrived || f.timer <= 0) think(f); else if (f.mode !== 'food') f.timer--; }
      if (S.flakes.length && S.lights) think(f);
      if (!S.lights && f.mode !== 'sleep') think(f);
      if (f.mode === 'come' && S.tap) { f.tx = S.tap.x - f.w / 2; f.ty = S.tap.y - f.h / 2; }
      let sp = SPEED[f.breed] * (f.stage === 'fry' ? 0.9 : 1);
      if (S.hunger === 'one') sp *= 0.6;
      if (f.mode === 'food') sp *= 1.5; if (f.mode === 'come') sp *= 1.4; if (f.mode === 'sleep' || f.mode === 'nap') sp = 0.3;
      if (f.mode === 'hide' && f.trait === 'Shy' && S.tap) sp *= 1.6;
      const [a, b, c, d] = lim(f); f.tx = Math.max(a, Math.min(c, f.tx)); f.ty = Math.max(b, Math.min(d, f.ty));
      const dx = f.tx - f.x, dy = f.ty - f.y, dist = Math.hypot(dx, dy);
      if (dist > 0.3) { const s = Math.min(sp, dist); f.x += (dx / dist) * s; f.y += (dy / dist) * s * 0.75; if (Math.abs(dx) > 2 && f.mode !== 'food') f.d = Math.sign(dx); }
      f.moving = dist > 1;
      if (f.mode === 'food') { const [mx, my] = mouth(f); S.flakes.forEach((k) => { if (!k.gone && Math.abs(k.x - mx) < 3 && Math.abs(k.y - my) < 3) { k.gone = true; f.wig = Math.max(f.wig, 6); if (r() < 0.35) say(f, 'yum'); } }); }
      if (f.mode === 'come' && !f.moving && S.tap) f.d = S.tap.x > f.x + f.w / 2 ? 1 : -1;
      if (S.lights && r() < (TALK[f.trait] || 0.001)) { const idle = IDLE[f.trait] || ['hello']; say(f, S.hunger === 'one' ? (r() < 0.5 ? 'hungry' : 'food') : idle[(r() * idle.length) | 0], false); }
      if ((f.mode === 'sleep' || f.mode === 'nap') && S.tick % 22 === ((f.p * 3) | 0) % 22) f.zs.push({ x: f.d > 0 ? f.x + f.w * 0.75 : f.x + f.w * 0.25, y: f.y + 2, t: 0 });
      f.zs.forEach((z) => { z.t++; z.y -= 0.25; z.x += 0.1; }); f.zs = f.zs.filter((z) => z.t < 40);
      if (f.wig > 0) f.wig--;
    });
    if (S.tap && --S.tap.t <= 0) { S.tap = null; fish.forEach((f) => { if (f.mode === 'come') { f.mode = 'swim'; f.timer = 0; } }); }
    if (S.tick % 9 === 0) t.bubbles.forEach(([bx, by]) => { if (r() < 0.7) S.bubbles.push({ x: bx + (r() - 0.5) * 3, y: by, s: 1 + ((r() * 2.4) | 0), ph: r() * 6 }); });
    S.bubbles.forEach((q) => (q.y -= 0.45 + q.s * 0.12)); S.bubbles = S.bubbles.filter((q) => q.y > SURF + 2);
  }

  // ---------- draw ----------
  function draw() {
    NIGHT = !S.lights;
    const N = !S.lights;
    o.clearRect(0, 0, t.w, t.h);
    if (stand) o.drawImage(pick(stand), 0, 0);
    o.drawImage(pick(backs[S.lights ? [0, 1, 2, 1][Math.floor(S.tick / 7) % 4] : 1]), 0, 0);
    S.bubbles.forEach((q) => { const bx = Math.round(q.x + Math.sin(q.y * 0.2 + q.ph)), by = Math.round(q.y); o.fillStyle = N ? '#2f4a6e' : '#cdebf4'; if (q.s === 1) o.fillRect(bx, by, 1, 1); else { o.fillRect(bx - 1, by, q.s + 1, q.s - 1); o.fillRect(bx, by - 1, q.s - 1, q.s + 1); o.fillStyle = N ? '#4a6890' : '#fff'; o.fillRect(bx, by, 1, 1); } });
    S.flakes.forEach((k) => { o.fillStyle = N ? '#6a4a3a' : k.c; o.fillRect(Math.round(k.x), Math.round(k.y), 2, 1); });
    fish.forEach((f) => {
      const dead = !alive(), sleeping = f.mode === 'sleep' || f.mode === 'nap';
      const fr = dead || sleeping ? 0 : Math.floor(S.tick / (f.moving ? 2 : 4) + f.p) % 4;
      const set = f.lk.frames[fr], img = dead ? (N ? set.deadNight : set.dead) : N ? set.night : set.day;
      const bob = dead ? Math.sin(S.tick * 0.05 + f.p) * 0.6 : Math.sin(S.tick * (sleeping ? 0.05 : 0.12) + f.p) * (sleeping ? 0.6 : 1.2);
      const fx = Math.round(f.x + (f.wig > 0 ? (f.wig % 2 ? 1 : -1) : 0)), fy = Math.round((dead ? SURF - 3 : f.y) + bob);
      o.save(); o.translate(fx + (f.d < 0 ? f.w : 0), fy + (dead ? f.h : 0)); o.scale(f.d < 0 ? -1 : 1, dead ? -1 : 1); o.drawImage(img, 0, 0); o.restore();
      f.zs.forEach((z) => { const a = 1 - z.t / 40; if (a < 0.2) return; const zx = Math.round(z.x), zy = Math.round(z.y); o.fillStyle = N ? '#8fa6c8' : '#ffffff'; o.fillRect(zx, zy, 3, 1); o.fillRect(zx + 1, zy + 1, 1, 1); o.fillRect(zx, zy + 2, 3, 1); });
    });
    if (S.ripple) { const q = S.ripple, rr = q.t * 1.2; o.strokeStyle = N ? '#4a6890' : '#ffffff'; o.lineWidth = 1; o.globalAlpha = 1 - q.t / 8; o.beginPath(); o.arc(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5, rr, 0, 7); o.stroke(); o.globalAlpha = 1; if (++q.t > 8) S.ripple = null; }
    fronts.forEach(([a, cv]) => { o.globalAlpha = N ? a * 0.35 : a; o.drawImage(pick(cv), 0, 0); }); o.globalAlpha = 1;
    ctx.clearRect(0, 0, t.w, t.h); ctx.drawImage(off, 0, 0);
    placeBubbles();
  }
  draw();
  const timer = setInterval(() => {
    if (!canvas.isConnected) { clearInterval(timer); return; }
    step(); draw();
  }, 90);

  // A tap on the glass: brave fish come to look, shy ones hide. Nothing to look after.
  if (opts.tapGlass) {
    canvas.addEventListener('click', (e) => {
      if (!S.lights || !alive()) return;
      const b = canvas.getBoundingClientRect(), x = ((e.clientX - b.left) / b.width) * t.w, y = ((e.clientY - b.top) / b.height) * t.h;
      if (y < SURF || y > Y1) return;
      S.tap = { x, y, t: 70 }; S.ripple = { x, y, t: 0 };
      fish.forEach((f) => {
        if (f.trait === 'Shy') { f.mode = 'hide'; f.tx = X0 + 6 + r() * 10; f.ty = f.y + 8; f.timer = 80; say(f, 'scary'); }
        else if (f.trait === 'Sleepy' && f.mode === 'nap') { /* keeps napping */ }
        else if (f.trait === 'Brave' || f.trait === 'Playful' || f.trait === 'Chatty' || r() < 0.5) { f.mode = 'come'; f.timer = 70; if (f.trait === 'Brave') say(f, 'look'); }
      });
    });
  }
  return {
    // Food arrives after study: a wiggle, then flakes race down.
    feed() {
      if (!alive()) return; if (!S.lights) this.lights(true);
      S.hunger = 'fed'; fish.forEach((f) => { f.wig = 14; f.timer = 0; });
      say(talker(), 'yay');
      for (let i = 0; i < 9; i++) S.flakes.push({ x: X0 + 30 + r() * Math.max(10, X1 - X0 - 60), y: SURF + 1 - i * 1.5, ph: r() * 6, rest: 0, c: r() < 0.5 ? '#d9776a' : '#f0b84a' });
    },
    lights(on) {
      S.lights = on; NIGHT = !on; fish.forEach((f) => { f.timer = 0; f.mode = 'swim'; if (on) f.zs = []; });
      if (on && alive()) setTimeout(() => say(talker(), 'morning'), 300);
      if (!on) S.speech.forEach((s) => (s.t = 0));
      return on;
    },
    // A new fry drops in at the surface and swims down.
    add(c) {
      const lk = look(c.breed, c.stage, c.fs), f = { ...c, lk, w: lk.w, h: lk.h, x: (X0 + X1 - lk.w) / 2, y: Y0, d: r() < 0.5 ? 1 : -1, p: r() * 10, mode: 'swim', timer: 0, wig: 14, zs: [] };
      f.tx = f.x + (r() - 0.5) * 40; f.ty = Y0 + (Y1 - Y0 - lk.h) * 0.5; fish.push(f);
      setTimeout(() => say(f, 'hello'), 900); return f;
    },
    stop() { clearInterval(timer); },
    get lightsOn() { return S.lights; }, fish, S,
  };
}

export { TANKS, look };
