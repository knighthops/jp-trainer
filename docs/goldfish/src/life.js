// Fish life demo: personalities, reactions, feeding, hunger, sleep, growth and speech.
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

// ---------- what they say (N5, taught words only in the real app) ----------
const LINES = {
  hello: ['こんにちは！', 'Hello!'], fine: ['げんき です。', "I'm doing well."], thanks: ['ありがとう！', 'Thank you!'], yum: ['おいしい！', 'Tasty!'],
  yay: ['やった！', 'Yay!'], hungry: ['おなか が すきました。', "I'm hungry."], food: ['ごはん は？', 'Food?'], sleepy: ['ねむい です。', "I'm sleepy."],
  night: ['おやすみなさい。', 'Good night.'], morning: ['おはよう！', 'Good morning!'], look: ['みて！', 'Look!'], scary: ['こわい…', 'Scary…'], play: ['あそびましょう！', "Let's play!"],
};
const IDLE = { Brave: ['look', 'fine'], Chatty: ['hello', 'fine', 'thanks', 'look'], Sleepy: ['sleepy'], Shy: ['hello'], Playful: ['play', 'look'], Hungry: ['food'] };
const TALK = { Chatty: 0.004, Playful: 0.002, Brave: 0.0015, Hungry: 0.0015, Sleepy: 0.001, Shy: 0.0005 };
const SPEED = { ryukin: 0.9, oranda: 0.6, ranchu: 0.32 };

// ---------- the live tank ----------
function lifeTank(t, canvas, bubbleLayer, cast) {
  const backs = [-1, 0, 1].map((sw) => pixG((c) => t.back(c, sw), t.w, t.h, { out: t.out }));
  const fronts = t.front.map(([a, d]) => [a, pixG(d, t.w, t.h)]);
  const [X0, Y0, X1, Y1] = t.swim, SURF = t.surf;
  const r = rng(7), off = document.createElement('canvas'); off.width = t.w; off.height = t.h; const o = off.getContext('2d');
  canvas.width = t.w; canvas.height = t.h; const ctx = canvas.getContext('2d');
  const S = { lights: true, hunger: 'fed', tick: 0, flakes: [], tap: null, ripple: null, bubbles: [], speech: [] };
  const fish = cast.map((c, i) => {
    const lk = look(c.breed, c.stage, c.fs);
    const f = { ...c, lk, w: lk.w, h: lk.h, x: X0 + ((i + 0.5) / cast.length) * (X1 - X0 - lk.w), y: Y0 + 10 + ((i * 0.618) % 1) * (Y1 - Y0 - lk.h - 20), d: i % 2 ? -1 : 1, p: r() * 10, mode: 'swim', timer: 0, wig: 0, zs: [] };
    f.tx = f.x; f.ty = f.y; return f;
  });
  const lim = (f) => [X0, Y0, X1 - f.w, Y1 - f.h];
  const mouth = (f) => [f.d > 0 ? f.x + f.w * 0.95 : f.x + f.w * 0.05, f.y + f.h * 0.58];
  const alive = () => S.hunger !== 'dead';

  // speech bubbles are HTML so the Japanese stays crisp; tap one for English
  // Keep talk rare: idle chatter waits ~20s after any bubble and never repeats a line within ~1 minute.
  // Reactions (tap, lesson, eating) can come sooner but still never repeat the line just said.
  const heard = {}; let lastSay = -999;
  function say(f, key, event = true) {
    if (!S.lights || !alive() || S.speech.length) return;
    const since = S.tick - lastSay, ago = S.tick - (heard[key] ?? -9999);
    if (event ? since < 25 || ago < 150 : since < 220 || ago < 650) return;
    lastSay = S.tick; heard[key] = S.tick;
    const [jp, en] = LINES[key], el = document.createElement('button'); el.className = 'bub'; el.textContent = jp;
    const s = { f, jp, en, el, t: 40, en_: false };
    el.onclick = (e) => { e.stopPropagation(); s.en_ = !s.en_; el.textContent = s.en_ ? en : jp; s.t = Math.max(s.t, 30); };
    bubbleLayer.appendChild(el); S.speech.push(s);
  }
  function placeBubbles() {
    S.speech = S.speech.filter((s) => { if (--s.t > 0 && S.lights && alive()) return true; s.el.remove(); return false; });
    S.speech.forEach((s) => { const f = s.f, hx = f.d > 0 ? f.x + f.w * 0.8 : f.x + f.w * 0.2; s.el.style.left = (hx / t.w) * 100 + '%'; s.el.style.top = ((f.y + f.h * 0.05) / t.h) * 100 + '%'; });
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
    // flakes sink, wobble, and rest on the sand for a while
    S.flakes.forEach((k) => { if (k.gone) return; if (k.y < Y1 - 1) { k.y += k.y < SURF + 16 ? 0.5 : 0.22; k.x += Math.sin(k.y * 0.25 + k.ph) * 0.15; } else if (++k.rest > 120) k.gone = true; });
    S.flakes = S.flakes.filter((k) => !k.gone);
    fish.forEach((f) => {
      if (!alive()) { f.x += Math.sin(S.tick * 0.02 + f.p) * 0.05; return; }
      // swim off somewhere new when stacked right on top of another fish
      if (f.mode === 'swim' && r() < 0.06 && fish.some((g) => g !== f && Math.abs(g.x - f.x) < f.w * 0.6 && Math.abs(g.y - f.y) < f.h * 0.5)) { wander(f); f.timer = 30; }
      if (f.mode === 'chase' && f.chase) { f.tx = f.chase.x - f.chase.d * 14; f.ty = f.chase.y + 2; }
      const arrived = Math.hypot(f.tx - f.x, f.ty - f.y) < 1.5;
      if (arrived || f.mode === 'swim' || f.mode === 'beg' || f.mode === 'chase') { if (arrived || f.timer <= 0) think(f); else if (f.mode !== 'food') f.timer--; }
      if (S.flakes.length && S.lights) think(f); // keep chasing the nearest sinking flake
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
      // eat
      if (f.mode === 'food') { const [mx, my] = mouth(f); S.flakes.forEach((k) => { if (!k.gone && Math.abs(k.x - mx) < 3 && Math.abs(k.y - my) < 3) { k.gone = true; f.wig = Math.max(f.wig, 6); if (r() < 0.35) say(f, 'yum'); } }); }
      if (f.mode === 'come' && !f.moving && S.tap) f.d = S.tap.x > f.x + f.w / 2 ? 1 : -1;
      // idle chatter
      if (S.lights && r() < (TALK[f.trait] || 0.001)) say(f, S.hunger === 'one' ? (r() < 0.5 ? 'hungry' : 'food') : IDLE[f.trait][(r() * IDLE[f.trait].length) | 0], false);
      if ((f.mode === 'sleep' || f.mode === 'nap') && S.tick % 22 === ((f.p * 3) | 0) % 22) f.zs.push({ x: f.d > 0 ? f.x + f.w * 0.75 : f.x + f.w * 0.25, y: f.y + 2, t: 0 });
      f.zs.forEach((z) => { z.t++; z.y -= 0.25; z.x += 0.1; }); f.zs = f.zs.filter((z) => z.t < 40);
      if (f.wig > 0) f.wig--;
    });
    if (S.tap && --S.tap.t <= 0) { S.tap = null; fish.forEach((f) => { if (f.mode === 'come') { f.mode = 'swim'; f.timer = 0; } }); }
    // tank bubbles
    if (S.tick % 9 === 0) t.bubbles.forEach(([bx, by]) => { if (r() < 0.7) S.bubbles.push({ x: bx + (r() - 0.5) * 3, y: by, s: 1 + ((r() * 2.4) | 0), ph: r() * 6 }); });
    S.bubbles.forEach((q) => (q.y -= 0.45 + q.s * 0.12)); S.bubbles = S.bubbles.filter((q) => q.y > SURF + 2);
  }

  // ---------- draw ----------
  function draw() {
    o.clearRect(0, 0, t.w, t.h);
    o.drawImage(pick(backs[S.lights ? [0, 1, 2, 1][Math.floor(S.tick / 7) % 4] : 1]), 0, 0);
    const N = !S.lights;
    S.bubbles.forEach((q) => { const bx = Math.round(q.x + Math.sin(q.y * 0.2 + q.ph)), by = Math.round(q.y); o.fillStyle = N ? '#2f4a6e' : '#cdebf4'; if (q.s === 1) o.fillRect(bx, by, 1, 1); else { o.fillRect(bx - 1, by, q.s + 1, q.s - 1); o.fillRect(bx, by - 1, q.s - 1, q.s + 1); o.fillStyle = N ? '#4a6890' : '#fff'; o.fillRect(bx, by, 1, 1); } });
    S.flakes.forEach((k) => { o.fillStyle = N ? '#6a4a3a' : k.c; o.fillRect(Math.round(k.x), Math.round(k.y), 2, 1); });
    fish.forEach((f) => {
      const dead = !alive(), sleeping = f.mode === 'sleep' || f.mode === 'nap';
      const fr = dead || sleeping ? 0 : Math.floor(S.tick / (f.moving ? 2 : 4) + f.p) % 4;
      const set = f.lk.frames[fr], img = dead ? (N ? set.deadNight : set.dead) : N ? set.night : set.day;
      const bob = dead ? Math.sin(S.tick * 0.05 + f.p) * 0.6 : Math.sin(S.tick * (sleeping ? 0.05 : 0.12) + f.p) * (sleeping ? 0.6 : 1.2);
      let fx = Math.round(f.x + (f.wig > 0 ? (f.wig % 2 ? 1 : -1) : 0)), fy = Math.round((dead ? SURF - 3 : f.y) + bob);
      o.save(); o.translate(fx + (f.d < 0 ? f.w : 0), fy + (dead ? f.h : 0)); o.scale(f.d < 0 ? -1 : 1, dead ? -1 : 1); o.drawImage(img, 0, 0); o.restore();
      f.zs.forEach((z) => { const a = 1 - z.t / 40; if (a < 0.2) return; const zx = Math.round(z.x), zy = Math.round(z.y); o.fillStyle = N ? '#8fa6c8' : '#ffffff'; o.fillRect(zx, zy, 3, 1); o.fillRect(zx + 1, zy + 1, 1, 1); o.fillRect(zx, zy + 2, 3, 1); });
    });
    if (S.ripple) { const q = S.ripple, rr = q.t * 1.2; o.strokeStyle = N ? '#4a6890' : '#ffffff'; o.lineWidth = 1; o.globalAlpha = 1 - q.t / 8; o.beginPath(); o.arc(Math.round(q.x) + 0.5, Math.round(q.y) + 0.5, rr, 0, 7); o.stroke(); o.globalAlpha = 1; if (++q.t > 8) S.ripple = null; }
    fronts.forEach(([a, cv]) => { o.globalAlpha = N ? a * 0.35 : a; o.drawImage(pick(cv), 0, 0); }); o.globalAlpha = 1;
    ctx.clearRect(0, 0, t.w, t.h); ctx.drawImage(off, 0, 0);
    placeBubbles();
  }
  setInterval(() => { step(); draw(); }, 90);

  // ---------- what you can do ----------
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
  return {
    lesson() {
      if (!alive()) return; if (!S.lights) this.lights(true);
      S.hunger = 'fed'; fish.forEach((f) => { f.wig = 14; f.timer = 0; });
      const c = fish.find((f) => f.trait === 'Chatty') || fish[0]; say(c, 'yay');
      for (let i = 0; i < 9; i++) S.flakes.push({ x: X0 + 30 + r() * (X1 - X0 - 60), y: SURF + 1 - i * 1.5, ph: r() * 6, rest: 0, c: r() < 0.5 ? '#d9776a' : '#f0b84a' });
    },
    lights(on) {
      S.lights = on; NIGHT = !on; fish.forEach((f) => { f.timer = 0; f.mode = 'swim'; if (on) f.zs = []; });
      if (on && alive()) { const f = fish.find((g) => g.trait === 'Chatty') || fish[0]; setTimeout(() => say(f, 'morning'), 300); }
      if (!on) S.speech.forEach((s) => (s.t = 0));
      return on;
    },
    hunger(h) {
      S.hunger = h; S.flakes = []; fish.forEach((f) => { f.timer = 0; f.mode = 'swim'; f.zs = []; if (h !== 'dead') { const [a, b, c, d] = lim(f); f.y = Math.max(b, Math.min(d, f.y)); f.tx = f.x; f.ty = f.y; } });
      if (h === 'one') { const f = fish.find((g) => g.trait === 'Chatty') || fish[0]; say(f, 'hungry'); }
    },
    // a new fry drops in at the surface and swims down
    add(c) {
      const lk = look(c.breed, c.stage, c.fs), f = { ...c, lk, w: lk.w, h: lk.h, x: (X0 + X1 - lk.w) / 2, y: Y0, d: r() < 0.5 ? 1 : -1, p: r() * 10, mode: 'swim', timer: 0, wig: 14, zs: [] };
      f.tx = f.x + (r() - 0.5) * 40; f.ty = Y0 + (Y1 - Y0 - lk.h) * 0.5; fish.push(f);
      setTimeout(() => say(f, 'hello'), 900); return f;
    },
    get lightsOn() { return S.lights; }, fish, S,
  };
}
