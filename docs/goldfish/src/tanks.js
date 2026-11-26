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

// ---------- fish sprites at tank size, 4 tail frames each ----------
const SPR = {};
function fishSet(fs) {
  if (SPR[fs]) return SPR[fs];
  const set = {}, w = Math.round(100 * fs), h = Math.round(80 * fs), k = Math.round(6 / fs);
  ['ryukin', 'oranda', 'ranchu'].forEach((n) => {
    set[n] = [1, 0.88, 0.76, 0.88].map((wg) => { WAG = wg; return pixG((c) => { c.scale(fs, fs); FISH[n](c); }, w, h, { pal: PALETTE, red: true, out: OUT, k, dither: 4, tone: nightFish }); });
    // every pixel any frame could cover, facing either way: used to keep the whole fish inside the water
    const pts = [];
    for (let y = 0; y < h; y++) for (let x = 0; x < w; x++) if (set[n].some((cv) => cv.px[y * w + x] || cv.px[y * w + (w - 1 - x)])) pts.push([x, y]);
    set[n].pts = pts;
  });
  WAG = 1; return (SPR[fs] = set);
}

// ---------- live tank ----------
function liveTank(t, canvas) {
  const backs = [-1, 0, 1].map((sw) => pixG((c) => t.back(c, sw), t.w, t.h, { out: t.out }));
  const stand = t.stand ? pixG(t.stand, t.w, t.h, { out: '#2a160a' }) : null;
  const fronts = t.front.map(([a, d]) => [a, pixG(d, t.w, t.h)]);
  const spr = fishSet(t.fs), fw = Math.round(100 * t.fs), fh = Math.round(80 * t.fs);
  const r = rng(t.w), x0 = t.swim[0], y0 = t.swim[1], x1 = t.swim[2] - fw, y1 = t.swim[3] - fh, n = t.fish.length;
  // a spot is fine when the box allows it and, for round bowls, every fish pixel (with bob room) is in the water
  const ok = (b, x, y) => x >= x0 && x <= x1 && y >= y0 && y <= y1 && (!t.inside || spr[b].pts.every(([px, py]) => t.inside(x + px, y + py - 2) && t.inside(x + px, y + py + 2)));
  const fish = t.fish.map((b, i) => {
    let x = x0 + ((i + 0.5) / n) * (x1 - x0), y = y0 + ((i * 0.618 + 0.2) % 1) * (y1 - y0);
    if (!ok(b, x, y)) { let best = null, bd = 1e9; for (let yy = y0; yy <= y1; yy++) for (let xx = x0; xx <= x1; xx++) if (ok(b, xx, yy)) { const d = (xx - x) ** 2 + (yy - y) ** 2; if (d < bd) { bd = d; best = [xx, yy]; } } if (best) [x, y] = best; }
    return { n: b, x, y, ty: y, d: i % 2 ? -1 : 1, v: 0.25 + r() * 0.3, p: r() * 10 };
  });
  const bub = [];
  const off = document.createElement('canvas'); off.width = t.w; off.height = t.h; const o = off.getContext('2d');
  canvas.width = t.w; canvas.height = t.h; const ctx = canvas.getContext('2d');
  let tick = 0;
  setInterval(() => {
    tick++;
    o.clearRect(0, 0, t.w, t.h);
    if (stand) o.drawImage(pick(stand), 0, 0);
    o.drawImage(pick(backs[[0, 1, 2, 1][Math.floor(tick / 7) % 4]]), 0, 0);
    if (tick % 9 === 0) t.bubbles.forEach(([bx, by]) => { if (r() < 0.7) bub.push({ x: bx + (r() - 0.5) * 3, y: by, s: 1 + (r() * 2.4 | 0), ph: r() * 6 }); });
    for (let i = bub.length - 1; i >= 0; i--) {
      const b = bub[i]; b.y -= 0.45 + b.s * 0.12; if (b.y < t.surf + 2) { bub.splice(i, 1); continue; }
      const bx = Math.round(b.x + Math.sin(b.y * 0.2 + b.ph)), by = Math.round(b.y);
      o.fillStyle = NIGHT ? '#2f4a6e' : '#cdebf4'; if (b.s === 1) o.fillRect(bx, by, 1, 1); else { o.fillRect(bx - 1, by, b.s + 1, b.s - 1); o.fillRect(bx, by - 1, b.s - 1, b.s + 1); o.fillStyle = NIGHT ? '#4a6890' : '#fff'; o.fillRect(bx, by, 1, 1); }
    }
    fish.forEach((f) => {
      if (r() < 0.004) f.d *= -1;
      if (r() < 0.01) f.ty = y0 + r() * (y1 - y0);
      // drift apart from a fish swimming right on top of this one
      if (r() < 0.05 && fish.some((g) => g !== f && Math.abs(g.x - f.x) < fw * 0.7 && Math.abs(g.y - f.y) < fh * 0.5)) { f.ty = y0 + r() * (y1 - y0); if (r() < 0.5) f.d *= -1; }
      if (r() < 0.006) f.v = r() < 0.25 ? 0.05 : 0.25 + r() * 0.4;
      const nx = f.x + f.d * f.v; if (ok(f.n, nx, f.y)) f.x = nx; else f.d *= -1;
      const ny = f.y + (f.ty - f.y) * 0.02; if (ok(f.n, f.x, ny)) f.y = ny; else f.ty = f.y;
      const fx = Math.round(f.x), fy = Math.round(f.y + Math.sin(tick * 0.12 + f.p) * 1.2);
      const s = pick(spr[f.n][Math.floor(tick / (f.v < 0.1 ? 5 : 2) + f.p) % 4]);
      if (f.d > 0) o.drawImage(s, fx, fy); else { o.save(); o.translate(fx + fw, fy); o.scale(-1, 1); o.drawImage(s, 0, 0); o.restore(); }
    });
    fronts.forEach(([a, cv]) => { o.globalAlpha = NIGHT ? a * 0.35 : a; o.drawImage(pick(cv), 0, 0); }); o.globalAlpha = 1;
    ctx.clearRect(0, 0, t.w, t.h); ctx.drawImage(off, 0, 0);
  }, 90);
}
