// The goldfish on screen: the fish card on Home and the Tank tab.
// ctx: { state, save, view, setTop, icons, knows(word), goals: { n5Done, casualDone }, study() }
import { dayKey } from './store.js';
import {
  HOMES, tankOf, tankTick, fishNow, homesOpen, settleHome, homeOf, canAddFry, newFry, moveHome, canMove, taughtLines,
} from './tank.js';
import { lifeTank, tankById, fishSize, homeThumb, portrait, BREEDS } from './fish.js';

const STATUS = {
  fed: ['ok', 'Fed today'],
  due: ['due', 'Not fed yet'],
  one: ['warn', 'Hungry'],
  dead: ['dead', 'Died'],
  empty: ['due', 'Empty'],
};
const AGE = { adult: 'Adult', young: 'Young', fry: 'Fry' };
const esc = (s) => String(s).replace(/[&<>"]/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;' }[c]));
// The portrait size a stage is drawn at, the same as in the Small tank.
const PORTRAIT = { adult: 0.47, young: 0.38, fry: 0.28 };

// Brings the tank up to today and opens any home just earned. Saves if anything changed.
function update(ctx, now = Date.now()) {
  const { state } = ctx;
  const before = JSON.stringify(state.tank || null);
  const hunger = tankTick(state, now);
  const open = homesOpen(state, ctx.goals, now);
  settleHome(state, open);
  if (JSON.stringify(state.tank) !== before) ctx.save(state);
  return { tank: tankOf(state), hunger, open };
}

// Starts the live tank in a wrapper holding a canvas and a bubble layer.
function startTank(ctx, wrap, { tank, hunger }, tapGlass) {
  const t = tankById(tank.home);
  const cast = fishNow(ctx.state, tank).map((f) => ({ ...f, fs: fishSize(t, f.stage) }));
  const life = lifeTank(t, wrap.querySelector('canvas'), wrap.querySelector('.fh-bubbles'), cast, {
    lights: tank.lights,
    hunger: hunger === 'one' ? 'one' : hunger === 'dead' ? 'dead' : 'fed',
    lines: taughtLines(ctx.knows),
    tapGlass,
    onSay(f, jp) {
      const saved = tank.fish.find((g) => g.id === f.id);
      if (saved) { saved.last = jp; ctx.save(ctx.state); }
    },
  });
  // The first look after studying today: food drops in and they race for it.
  const today = dayKey();
  if (hunger === 'fed' && tank.fedSeen !== today) {
    tank.fedSeen = today;
    ctx.save(ctx.state);
    setTimeout(() => life.feed(), 600);
  }
  return { life, t };
}

const nameOf = (tank, home) => (tank.fish.length === 1 ? tank.fish[0].name : tank.fish.length ? `${tank.fish.length} fish` : home.en);
const pill = (hunger, id = '') => `<span class="fh-st ${STATUS[hunger][0]}" ${id ? `id="${id}"` : ''}>${STATUS[hunger][1]}</span>`;

/* ---------- Home: the fish card ---------- */

export function fishHomeHtml() {
  return '<section class="card fishhome" id="fishhome"></section>';
}

export function mountFishHome(root, ctx) {
  if (!root) return;
  const now = update(ctx);
  const { tank, hunger } = now;
  const home = homeOf(tank);
  const t = tankById(tank.home);
  const feedLabel = `Feed ${tank.fish.length === 1 ? tank.fish[0].name : 'them'}`;
  const [label, cls] = hunger === 'fed' ? ['See tank', 'btn ghost'] : hunger === 'due' || hunger === 'one' ? [feedLabel, 'btn'] : ['New fry', 'btn ghost'];
  root.innerHTML = `
    <div class="fh-tank ${t.id === 'bowl' ? 'bowl' : 'wide'}" style="aspect-ratio:${t.w}/${t.h}" role="button" aria-label="Open tank"><canvas></canvas><div class="fh-bubbles"></div></div>
    <div class="fh-info"><strong>${esc(nameOf(tank, home))}</strong>${pill(hunger)}<button class="${cls}" id="fhGo">${label}</button></div>`;
  startTank(ctx, root.querySelector('.fh-tank'), now, false);
  root.querySelector('.fh-tank').addEventListener('click', (e) => {
    if (!e.target.closest('.fbub')) location.hash = '#/tank';
  });
  root.querySelector('#fhGo').onclick = () => {
    if (hunger === 'fed') location.hash = '#/tank';
    else if (hunger === 'due' || hunger === 'one') ctx.study();
    else { newFry(ctx.state); ctx.save(ctx.state); mountFishHome(root, ctx); }
  };
}

/* ---------- The Tank tab ---------- */

export function screenTank(ctx) {
  const { view, icons } = ctx;
  ctx.setTop('Tank');
  const now = update(ctx);
  const { tank, hunger, open } = now;
  const home = homeOf(tank);
  const dead = hunger === 'dead';
  const cta = hunger === 'due' || hunger === 'one' ? ['btn', 'Feed them'] : dead || hunger === 'empty' ? ['btn ghost', 'New fry'] : null;
  view.innerHTML = `
    <div class="tankpin"><section class="card tankcard">
      <div class="tk-wrap ${tank.home === 'bowl' ? 'bowl' : ''}" style="aspect-ratio:${tankById(tank.home).w}/${tankById(tank.home).h}"><canvas></canvas><div class="fh-bubbles"></div></div>
      <div class="tk-row">
        <span class="grow">${pill(hunger)}</span>
        ${dead || hunger === 'empty' ? '' : `<button class="iconbtn ${tank.lights ? '' : 'off'}" id="light" aria-label="${tank.lights ? 'Lights off' : 'Lights on'}">${icons.bulb}</button>`}
        ${cta ? `<button class="${cta[0]}" id="cta">${cta[1]}</button>` : ''}
      </div>
    </section></div>
    <span class="caps tk-sec" id="fishhead"></span>
    <div class="fishgrid" id="fishgrid"></div>
    <span class="caps tk-sec">Homes</span>
    <div class="homegrid" id="homegrid"></div>
    ${tank.album.length ? '<span class="caps tk-sec">Album</span><div class="albumrow" id="album"></div>' : ''}
    <div class="scrim" id="scrim" hidden></div>
    <div class="fishsheet" id="fishsheet" hidden role="dialog" aria-modal="true"><div class="grab"></div>
      <div class="fs-big"><canvas width="50" height="40"></canvas></div>
      <h2 id="fsName"></h2>
      <dl><dt>Breed</dt><dd id="fsBreed"></dd><dt>Age</dt><dd id="fsAge"></dd><dt>Trait</dt><dd id="fsTrait"></dd><dt>Last said</dt><dd id="fsSay"></dd></dl>
      <button class="btn ghost" id="fsClose">Done</button>
    </div>`;
  const { life } = startTank(ctx, view.querySelector('.tk-wrap'), now, true);

  // ---------- fish ----------
  const grid = view.querySelector('#fishgrid');
  const drawFish = () => {
    const list = fishNow(ctx.state, tank);
    grid.innerHTML = '';
    list.forEach((f) => {
      const b = document.createElement('button');
      b.className = 'fishcard';
      const cv = document.createElement('canvas');
      cv.width = 50; cv.height = 40;
      portrait(cv, { ...f, fs: PORTRAIT[f.stage] }, dead);
      b.append(cv);
      b.insertAdjacentHTML('beforeend', `<strong>${esc(f.name)}</strong><span>${dead ? 'Died' : f.days ? f.trait : 'New'}</span>`);
      b.onclick = () => openSheet(f, dead);
      grid.append(b);
    });
    if (canAddFry(ctx.state)) {
      const s = document.createElement('button');
      s.className = 'fishcard newfry';
      s.innerHTML = '<b>+</b><strong>New fry</strong>';
      s.onclick = addFry;
      grid.append(s);
    }
    view.querySelector('#fishhead').textContent = `Fish · ${list.length} of ${home.cap}`;
  };
  function addFry() {
    const f = newFry(ctx.state);
    if (!f) return;
    ctx.save(ctx.state);
    const t = tankById(tank.home);
    if (dead || hunger === 'empty') { screenTank(ctx); return; }
    life.add({ ...f, days: 0, stage: 'fry', fs: fishSize(t, 'fry') });
    drawFish();
  }

  // ---------- details sheet ----------
  const sheet = view.querySelector('#fishsheet');
  const scrim = view.querySelector('#scrim');
  function openSheet(f, gone) {
    portrait(sheet.querySelector('canvas'), { ...f, fs: PORTRAIT[f.stage] }, gone);
    sheet.querySelector('#fsName').textContent = f.name;
    sheet.querySelector('#fsBreed').textContent = BREEDS[f.breed];
    sheet.querySelector('#fsAge').textContent = f.days ? `${AGE[f.stage]} · ${f.days} ${f.days === 1 ? 'day' : 'days'}` : `${AGE[f.stage]} · new`;
    sheet.querySelector('#fsTrait').textContent = f.trait;
    const say = sheet.querySelector('#fsSay');
    say.innerHTML = f.last ? `<button class="fs-say jp" data-say="${esc(f.last)}">${esc(f.last)}</button>` : '—';
    sheet.hidden = scrim.hidden = false;
  }
  const closeSheet = () => { sheet.hidden = scrim.hidden = true; };
  sheet.querySelector('#fsClose').onclick = closeSheet;
  scrim.onclick = closeSheet;

  // ---------- status row ----------
  view.querySelector('#cta')?.addEventListener('click', () => {
    if (hunger === 'due' || hunger === 'one') ctx.study();
    else addFry();
  });
  const light = view.querySelector('#light');
  if (light) {
    light.onclick = () => {
      tank.lights = life.lights(!life.lightsOn);
      ctx.save(ctx.state);
      light.classList.toggle('off', !tank.lights);
      light.setAttribute('aria-label', tank.lights ? 'Lights off' : 'Lights on');
    };
  }

  // ---------- homes ----------
  const homes = view.querySelector('#homegrid');
  HOMES.forEach((h) => {
    const state_ = h.id === tank.home ? 'now' : open[h.id] ? 'open' : 'locked';
    const movable = canMove(ctx.state, h.id, open);
    const d = document.createElement(movable ? 'button' : 'div');
    d.className = `hcard ${state_}`;
    const th = document.createElement('div');
    th.className = 'thumb';
    const cv = document.createElement('canvas');
    homeThumb(tankById(h.id), cv);
    th.append(cv);
    d.append(th);
    const status = state_ === 'now' ? 'Home now' : state_ === 'open' ? (movable ? 'Move here' : 'Unlocked') : h.goal;
    d.insertAdjacentHTML('beforeend', `<strong>${h.en}</strong><span>${state_ === 'locked' ? icons.lock : ''}${status}</span>`);
    if (movable) d.onclick = () => { if (moveHome(ctx.state, h.id, open)) { ctx.save(ctx.state); screenTank(ctx); } };
    homes.append(d);
  });

  // ---------- album ----------
  const album = view.querySelector('#album');
  tank.album.slice().reverse().forEach((f) => {
    const d = document.createElement('button');
    d.className = 'pol';
    const cv = document.createElement('canvas');
    cv.width = 50; cv.height = 40;
    portrait(cv, { ...f, fs: PORTRAIT[f.stage] });
    d.append(cv);
    d.insertAdjacentHTML('beforeend', `<b>${esc(f.name)}</b><span>${f.days} ${f.days === 1 ? 'day' : 'days'}</span>`);
    d.onclick = () => openSheet(f, true);
    album?.append(d);
  });

  drawFish();
}
