// Recorded audio. Device speech stops when iPhone locks or the app goes to the
// background; audio files keep playing. tools/audio-lines.html lists every line Radio
// can play; tools/make-audio.ps1 records each one with the Windows voices, and
// tools/publish-audio.ps1 uploads them to the jp-trainer-audio repo.

import { speechParts } from './tts.js';

export const VOICES = { ja: 'Microsoft Haruka', en: 'Microsoft Zira' };

// The pauses Radio leaves between lines, recorded as silent clips so playback never
// depends on timers, which iPhone stops running while the screen is locked.
export const SILENCE = { think: 1600, gap: 1100, long: 2700 };
export const silenceId = (key) => `sil-${SILENCE[key]}`;

// Notes in brackets, like "(Staff.)", are for reading, not for saying.
export const englishSaid = (en) => en.replace(/\s*\([^)]*\)/g, '').trim();

// A clip's file name comes from its language and text, so the app and the tools agree
// without sharing anything else. Japanese keeps its word spaces: they're part of the data.
export function clipId(lang, text) {
  let h = 2166136261;
  for (const c of `${lang}|${text}`) h = Math.imul(h ^ c.codePointAt(0), 16777619);
  let h2 = 5381;
  for (const c of `${text}|${lang}`) h2 = (Math.imul(h2, 33) ^ c.codePointAt(0)) >>> 0;
  return `${lang}-${(h >>> 0).toString(36)}${h2.toString(36)}`;
}

const xml = (s) => s.replace(/&/g, '&amp;').replace(/</g, '&lt;').replace(/>/g, '&gt;').replace(/"/g, '&quot;');

// What the voice is given. Each kanji word carries its checked reading, so the voice
// can't pick the wrong one (今日 is きょう, not こんにち), but it still sees real words.
export function clipSsml(lang, text, glossary) {
  if (lang === 'en') return xml(englishSaid(text));
  return speechParts(text, glossary).map(([written, spoken]) => (written === spoken
    ? xml(written) : `<sub alias="${xml(spoken)}">${xml(written)}</sub>`)).join('');
}

// Radio items carry { t, en }. An item can play from files only if both its clips exist.
export const itemClips = (item) => ({ ja: clipId('ja', item.t), en: clipId('en', englishSaid(item.en)) });

/* ---------- Playback ---------- */

// Which clips have been recorded (data/audio.json). Until then everything uses device speech.
let recorded = new Set();
export function setRecorded(ids) { recorded = new Set(ids || []); }
export const hasClips = (item) => {
  const c = itemClips(item);
  return recorded.has(c.ja) && recorded.has(c.en);
};
// The clips live in their own repo, published by GitHub Pages, so the app repo stays small.
export const AUDIO_BASE = 'https://knighthops.github.io/jp-trainer-audio/';
export const clipUrl = (id) => `${AUDIO_BASE}${id}.m4a`;

// One audio element for the whole app. iPhone only lets a page start audio from a tap,
// but an element that has played once inside a tap may play again later, even from
// the lock screen, so the first tap anywhere plays a silent clip through it.
let player = null;
export function clipPlayer() {
  if (!player && typeof Audio !== 'undefined') {
    player = new Audio();
    player.preload = 'auto';
  }
  return player;
}
let unlocked = false;
export function unlockAudio() {
  const p = clipPlayer();
  if (unlocked || !p || !recorded.has(silenceId('gap'))) return;
  unlocked = true;
  p.src = clipUrl(silenceId('gap'));
  p.play().then(() => p.pause()).catch(() => { unlocked = false; });
}
