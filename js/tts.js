// Japanese speech through the device's speechSynthesis voices.
import { icons } from './icons.js';

export const NORMAL = 0.95;
export const SLOW = 0.6;

export const supported = () => typeof window !== 'undefined'
  && 'speechSynthesis' in window && 'SpeechSynthesisUtterance' in window;

const japaneseVoice = () => window.speechSynthesis.getVoices().find((v) => /^ja[-_]/i.test(v.lang)) || null;

// Voices can load late, so wait briefly before deciding there isn't one.
export function hasJapaneseVoice() {
  if (!supported()) return Promise.resolve(false);
  if (japaneseVoice()) return Promise.resolve(true);
  return new Promise((resolve) => {
    const done = () => resolve(Boolean(japaneseVoice()));
    window.speechSynthesis.addEventListener('voiceschanged', done, { once: true });
    setTimeout(done, 1200);
  });
}

/* ---------- Kanji to kana before speaking ---------- */

// Device voices guess kanji readings and sometimes guess wrong (行って read as おこなって),
// so words with kanji are spoken from their stored kana. Particles stay as written,
// so the voice still reads a topic は as "wa".
const HAS_KANJI = /[一-龯々]/;
let readings = {};
export function setReadings(glossary) { readings = glossary || {}; }

export function speechText(text, glossary = readings) {
  return speechParts(text, glossary).map(([, spoken]) => spoken).join('');
}

// Each word as [written, spoken]. Recorded clips use this to pin every kanji word to
// its checked reading while the voice still sees the written word.
export function speechParts(text, glossary = readings) {
  const say = (w) => (HAS_KANJI.test(w) && glossary[w]?.y) || null;
  const respell = (chunk) => {
    let out = '';
    let i = 0;
    while (i < chunk.length) {
      let hit = null;
      for (let len = Math.min(10, chunk.length - i); len >= 1 && !hit; len--) {
        const y = say(chunk.slice(i, i + len));
        if (y) hit = [y, len];
      }
      if (hit) { out += hit[0]; i += hit[1]; } else { out += chunk[i]; i++; }
    }
    return HAS_KANJI.test(out) ? chunk : out;
  };
  const tokens = String(text).split(/\s+/).filter(Boolean);
  return tokens.map((w, i) => {
    // 何 is なん before d, t and n sounds (何 です, 何 の), and なに elsewhere.
    if (w === '何' && /^[でだどとのなね]/.test(tokens[i + 1] || '')) return [w, 'なん'];
    return [w, say(w) || (HAS_KANJI.test(w) ? respell(w) : w)];
  });
}

// Any new playback ends a running dialogue.
let playback = 0;

const englishVoice = () => window.speechSynthesis.getVoices().find((v) => /^en[-_]/i.test(v.lang)) || null;

// Stops anything already speaking. iPhone Safari can drop an utterance queued
// straight after cancel() on an idle voice, so only cancel when there is something to stop.
function hush() {
  const synth = window.speechSynthesis;
  if (synth.speaking || synth.pending) synth.cancel();
}

function utterance(text, { rate = NORMAL, pitch = 1, english = false } = {}) {
  const u = new SpeechSynthesisUtterance(english ? text : speechText(text));
  u.lang = english ? 'en-US' : 'ja-JP';
  u.rate = english ? 1 : rate;
  u.pitch = pitch;
  const voice = english ? englishVoice() : japaneseVoice();
  if (voice) u.voice = voice;
  return u;
}

function utter(text, { onend, ...options } = {}) {
  hush();
  const u = utterance(text, options);
  if (onend) { u.onend = onend; u.onerror = onend; }
  window.speechSynthesis.speak(u);
}

export function speak(text, options) {
  if (!supported()) return false;
  playback++;
  utter(text, options);
  return true;
}

export const linePitch = (s) => (['B', 'M'].includes(s) ? 0.8 : 1.15);

// Plays lines in turn: [{ s: 'A' | 'B' | 'F' | 'M', t }]. There is only one device
// voice, so a lower pitch tells the second speaker apart. Every line is queued at once:
// starting each line from the last one's end let iPhone drop lines.
// onLine(i) runs as each line starts, so the text can follow along.
export function speakLines(lines, { rate = NORMAL, onend, onLine } = {}) {
  if (!supported()) return false;
  const id = ++playback;
  hush();
  lines.forEach((line, i) => {
    // Spaces mark word edges in the data; speechText uses them and drops them.
    const u = utterance(line.t, { rate, pitch: linePitch(line.s) });
    u.onstart = () => { if (id === playback) onLine?.(i); };
    if (i === lines.length - 1) {
      const done = () => { if (id === playback) { onLine?.(-1); onend?.(); } };
      u.onend = done;
      u.onerror = done;
    }
    window.speechSynthesis.speak(u);
  });
  return true;
}

// One utterance in a longer sequence (Radio). Returns a token: if any other playback
// starts, onend is not called, so the sequence stops by itself.
export function speakStep(text, { rate = NORMAL, pitch = 1, english = false, onend } = {}) {
  if (!supported()) return false;
  const id = ++playback;
  utter(text, { rate, pitch, english, onend: () => { if (id === playback) onend?.(); } });
  return true;
}

// iPhone only lets a page speak after speech has started inside a tap. A silent
// utterance on the first tap unlocks it, so Radio can start from a route change.
let unlocked = false;
export function unlockSpeech() {
  if (unlocked || !supported()) return;
  unlocked = true;
  const u = new SpeechSynthesisUtterance(' ');
  u.volume = 0;
  window.speechSynthesis.speak(u);
}

export function cancel() {
  playback++;
  if (supported()) window.speechSynthesis.cancel();
}

// A listen button. A document-level handler in app.js speaks any [data-say].
export const sayBtn = (text) => `<button class="say" data-say="${text}" aria-label="Listen">${icons.speaker}</button>`;
