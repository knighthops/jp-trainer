// The goldfish tank: a pet that lives only while you study. Any study day feeds it; one day
// missed and it's hungry, two and it dies. Progress stays on this device, like the rest of the app.
import { dayKey, studiedOn } from './store.js';

const DAY_MS = 864e5;
export const HOMES = [
  { id: 'bowl', en: 'Fishbowl', cap: 1, goal: '' },
  { id: 'small', en: 'Small tank', cap: 3, goal: 'Raise an adult' },
  { id: 'planted', en: 'Planted tank', cap: 5, goal: 'Finish N5' },
  { id: 'grand', en: 'Grand aquarium', cap: 8, goal: 'Finish Casual' },
];
// Study days a fish needs to grow: fry, then young from day 5, adult from day 14.
export const YOUNG_AT = 5;
export const ADULT_AT = 14;
const NAMES = ['Kin', 'Momo', 'Sora', 'Hana', 'Maru', 'Mochi', 'Ume', 'Kuro', 'Yuki', 'Taro', 'Pochi', 'Kumo', 'Nori', 'Sumi', 'Kiku'];
const BREED_IDS = ['ryukin', 'oranda', 'ranchu'];
const TRAIT_IDS = ['Hungry', 'Shy', 'Playful', 'Sleepy', 'Chatty', 'Brave'];

export const defaultTank = () => ({ fish: [], album: [], home: 'bowl', lights: true, died: null, opened: ['bowl'], fedSeen: null, n: 0 });

// The tank in saved state, filled in for anyone who saved before it existed.
export function tankOf(state) {
  // Filled in place, so every caller holds the same object.
  state.tank ||= {};
  for (const [k, v] of Object.entries(defaultTank())) if (state.tank[k] === undefined) state.tank[k] = v;
  return state.tank;
}

const keyAt = (key, days) => {
  const [y, m, d] = key.split('-').map(Number);
  return dayKey(new Date(y, m - 1, d + days).getTime());
};
const daysBetween = (a, b) => {
  const [ya, ma, da] = a.split('-').map(Number);
  const [yb, mb, db] = b.split('-').map(Number);
  return Math.round((Date.UTC(yb, mb - 1, db) - Date.UTC(ya, ma - 1, da)) / DAY_MS);
};

// Study days from `from` through `to`, both included.
function studyDays(state, from, to) {
  let n = 0;
  for (const k of Object.keys(state.days)) if (k >= from && k <= to && studiedOn(state, k)) n++;
  return n;
}

// The last day the fish were fed: the latest study day, or the day the newest fish arrived.
function lastFed(state, tank, today) {
  let last = tank.fish.reduce((m, f) => (f.born > m ? f.born : m), '');
  for (const k of Object.keys(state.days)) if (k <= today && k > last && studiedOn(state, k)) last = k;
  return last || today;
}

export const stageOf = (days) => (days >= ADULT_AT ? 'adult' : days >= YOUNG_AT ? 'young' : 'fry');

// Each living fish with how many study days it has lived and the stage that gives.
export function fishNow(state, tank, now = Date.now()) {
  const today = dayKey(now);
  const end = tank.died ? keyAt(tank.died, -1) : today;
  return tank.fish.map((f) => {
    const days = studyDays(state, f.born, end);
    return { ...f, days, stage: stageOf(days) };
  });
}

// Moves the tank forward to today: two missed days and every fish dies, into the Album.
// Returns the hunger: 'empty', 'fed' (studied today), 'due' (not yet today), 'one' (a day missed), 'dead'.
export function tankTick(state, now = Date.now()) {
  const tank = tankOf(state);
  const today = dayKey(now);
  if (tank.died) return 'dead';
  if (!tank.fish.length) return 'empty';
  // Counted from before today, so studying late on the day they'd die can't bring them back.
  const last = lastFed(state, tank, keyAt(today, -1));
  const missed = daysBetween(last, today) - 1;
  if (missed < 2) return studiedOn(state, today) ? 'fed' : missed < 1 ? 'due' : 'one';
  // They died at the start of the second missed day.
  tank.died = keyAt(last, 3);
  const living = fishNow(state, tank, now);
  for (const f of living) tank.album.push({ name: f.name, breed: f.breed, trait: f.trait, stage: f.stage, days: f.days, last: f.last || '', died: tank.died });
  return 'dead';
}

// Which homes are open, from the goals: an adult raised, N5 finished, Casual finished.
export function homesOpen(state, { n5Done = false, casualDone = false } = {}, now = Date.now()) {
  const tank = tankOf(state);
  const raised = tank.album.some((f) => f.stage === 'adult') || fishNow(state, tank, now).some((f) => f.stage === 'adult');
  // A home once opened stays open.
  const was = (id) => tank.opened.includes(id);
  return { bowl: true, small: raised || was('small'), planted: n5Done || was('planted'), grand: casualDone || was('grand') };
}

// A home that has just opened becomes the fish's home once, if they all fit.
export function settleHome(state, open) {
  const tank = tankOf(state);
  let moved = false;
  for (const h of HOMES) {
    if (!open[h.id] || tank.opened.includes(h.id)) continue;
    tank.opened.push(h.id);
    if (HOMES.findIndex((x) => x.id === h.id) > HOMES.findIndex((x) => x.id === tank.home)) { tank.home = h.id; moved = true; }
  }
  return moved;
}

export const homeOf = (tank) => HOMES.find((h) => h.id === tank.home) || HOMES[0];

export function canMove(state, id, open) {
  const tank = tankOf(state);
  const h = HOMES.find((x) => x.id === id);
  return Boolean(h && open[id] && id !== tank.home && (tank.died ? 0 : tank.fish.length) <= h.cap);
}

export function moveHome(state, id, open) {
  if (!canMove(state, id, open)) return false;
  tankOf(state).home = id;
  return true;
}

// Room for one more: the home isn't full and the fish aren't dead.
export const canAddFry = (state) => {
  const tank = tankOf(state);
  return !tank.died && tank.fish.length < homeOf(tank).cap;
};

// A new fry, with a random breed and trait. After a death it clears the tank first.
export function newFry(state, now = Date.now(), rand = Math.random) {
  const tank = tankOf(state);
  if (tank.died) { tank.fish = []; tank.died = null; }
  if (tank.fish.length >= homeOf(tank).cap) return null;
  const used = new Set([...tank.fish, ...tank.album].map((f) => f.name));
  const free = NAMES.filter((n) => !used.has(n));
  const name = free.length ? free[(rand() * free.length) | 0] : `${NAMES[tank.n % NAMES.length]} ${Math.floor(tank.n / NAMES.length) + 2}`;
  tank.n++;
  const fish = { id: `f${Date.now().toString(36)}${tank.n}`, name, breed: BREED_IDS[(rand() * 3) | 0], trait: TRAIT_IDS[(rand() * TRAIT_IDS.length) | 0], born: dayKey(now), last: '' };
  tank.fish.push(fish);
  return fish;
}

// What fish can say. Each line names the course words it uses; it's said only once every one is taught.
export const LINES = {
  hello: ['はじめまして！', 'Nice to meet you!', ['はじめまして']],
  morning: ['おはようございます！', 'Good morning!', ['おはようございます']],
  thanks: ['ありがとうございます！', 'Thank you!', ['ありがとうございます']],
  yay: ['ありがとうございます！', 'Thank you!', ['ありがとうございます']],
  fine: ['元気です。', "I'm doing well.", ['元気']],
  yum: ['おいしい！', 'Tasty!', ['おいしい']],
  food: ['ご飯は？', 'Food?', ['ご飯']],
  hungry: ['ご飯、ご飯！', 'Food, food!', ['ご飯']],
  sleepy: ['寝ます。', "I'm going to sleep.", ['寝る']],
  look: ['大きい魚です！', "I'm a big fish!", ['大きい', '魚']],
  scary: ['すみません…', 'Sorry…', ['すみません']],
  play: ['楽しい！', 'This is fun!', ['楽しい']],
  swim: ['泳ぎます！', "I'm swimming!", ['泳ぐ']],
  water: ['水が好きです。', 'I like water.', ['水', '好き']],
};
export const taughtLines = (knows) => Object.fromEntries(Object.entries(LINES)
  .filter(([, [, , needs]]) => needs.every(knows)).map(([k, [jp, en]]) => [k, [jp, en]]));
