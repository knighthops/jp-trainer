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

// Any new playback ends a running dialogue.
let playback = 0;

function utter(text, { rate = NORMAL, pitch = 1, onend } = {}) {
  const synth = window.speechSynthesis;
  synth.cancel();
  const u = new SpeechSynthesisUtterance(text);
  u.lang = 'ja-JP';
  u.rate = rate;
  u.pitch = pitch;
  const voice = japaneseVoice();
  if (voice) u.voice = voice;
  if (onend) { u.onend = onend; u.onerror = onend; }
  synth.speak(u);
}

export function speak(text, options) {
  if (!supported()) return false;
  playback++;
  utter(text, options);
  return true;
}

// Plays lines in turn: [{ s: 'A' | 'B' | 'F' | 'M', t }]. There is only one device
// voice, so a lower pitch tells the second speaker apart.
export function speakLines(lines, { rate = NORMAL, onend } = {}) {
  if (!supported()) return false;
  const id = ++playback;
  let i = 0;
  const next = () => {
    if (id !== playback) return;
    if (i >= lines.length) { onend?.(); return; }
    const line = lines[i++];
    utter(line.t.replace(/\s+/g, ''), { rate, pitch: ['B', 'M'].includes(line.s) ? 0.8 : 1.15, onend: next });
  };
  next();
  return true;
}

export function cancel() {
  playback++;
  if (supported()) window.speechSynthesis.cancel();
}

// A listen button. A document-level handler in app.js speaks any [data-say].
export const sayBtn = (text) => `<button class="say" data-say="${text}" aria-label="Listen">${icons.speaker}</button>`;
