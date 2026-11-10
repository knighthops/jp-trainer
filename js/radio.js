// Radio: hands-free listening for a bus ride. Each item plays in Japanese, then after a
// pause in English (or Japanese only), and the channel loops in a fresh order.
import { speakStep, cancel, NORMAL, SLOW } from './tts.js';
import { shuffled } from './drills.js';
import { icons } from './icons.js';
import { clipPlayer, clipUrl, hasClips, itemClips, silenceId } from './clips.js';

const THINK_MS = 1600; // time to understand before the English
const GAP_MS = 1100; // between items

const unique = (items) => {
  const seen = new Set();
  return items.filter((x) => x.t && !seen.has(x.t) && seen.add(x.t));
};

// Everything a finished lesson says: its examples and its drill sentences.
function lessonItems(lesson, data) {
  return [
    ...(lesson.examples || []).map((e) => ({ t: e.t, en: e.en })),
    ...data.sentences.filter((s) => s.lesson === lesson.id).map((s) => ({ t: s.blocks.map((b) => b.t).join(' '), en: s.en })),
  ];
}

// The channels open to this learner, in order. Each has { id, jp, title, sub, items: [{ t, en }] }.
export function radioChannels(state, data) {
  const done = (data.units || []).flatMap((unit) => unit.lessons.filter((l) => state.course.done[l.id]).map((lesson) => ({ unit, lesson })));
  const latest = done.at(-1)?.unit;
  // Story chapters join once you have read them.
  const stories = (data.stories || []).filter((s) => state.course.stories?.[s.unit]);
  // Trip scenes are always on air: what you'll say, then what you'll hear back.
  const scenes = data.trip || [];
  const tripLines = (s) => [...s.say, ...s.hear].map((l) => ({ t: l.t, en: l.en }));
  const channels = [
    scenes.length > 1 && { id: 'trip', jp: '旅', title: 'All trip scenes', sub: 'Every scene, mixed', items: scenes.flatMap(tripLines), trip: true },
    ...scenes.map((s) => ({ id: `trip-${s.id}`, jp: s.jp, title: s.title, sub: 'Say and hear', items: tripLines(s), trip: true })),
    { id: 'course', jp: '講座', title: 'Your course', sub: 'Every finished lesson', items: done.flatMap(({ lesson }) => lessonItems(lesson, data)) },
    latest && { id: 'unit', jp: '今', title: `Unit ${latest.n}: ${latest.title}`, sub: 'The unit you\'re on', items: done.filter((d) => d.unit === latest).flatMap(({ lesson }) => lessonItems(lesson, data)) },
    { id: 'stories', jp: '物語', title: 'Stories', sub: 'Chapters you\'ve read', items: stories.flatMap((s) => s.lines.map((l) => ({ t: l.t, en: l.en }))), ordered: true },
  ];
  return channels.filter(Boolean).map((c) => ({ ...c, items: unique(c.items) })).filter((c) => c.items.length);
}

// ctx: { view, setTop, settings, persist, romajiOf(text), onExit }
export function startRadio(ctx, channel) {
  const { view, setTop, settings } = ctx;
  let order = channel.ordered ? [...channel.items] : shuffled(channel.items);
  let i = 0;
  let on = false;
  let timer = null;
  let wake = null;

  const rate = () => (settings.radioSlow ? SLOW : NORMAL);
  const header = () => setTop(channel.title, { close: true, onClose: stop, count: `${i + 1} / ${order.length}` });

  // Keep the screen awake while playing: iPhone stops speech when it locks.
  const holdScreen = async () => {
    try { wake = await navigator.wakeLock?.request('screen'); } catch { wake = null; }
  };
  const letScreenSleep = () => { wake?.release?.().catch(() => {}); wake = null; };

  const seg = (key, options) => `<div class="seg" data-key="${key}">${options.map(([v, text]) =>
    `<button class="${settings[key] === v ? 'on' : ''}" data-v="${v}">${text}</button>`).join('')}</div>`;

  view.innerHTML = `
    <section class="card radio ${settings.radioText ? '' : 'no-text'}" id="rcard">
      <div class="r-head"><span class="caps"><span class="jp">${channel.jp}</span> Radio</span><span class="r-live" id="rlive"></span></div>
      <div class="r-ear" aria-hidden="true">${icons.ear}</div>
      <div class="r-jp jp" id="rjp"></div>
      <p class="romaji center" id="rro"></p>
      <p class="r-en" id="ren"></p>
    </section>
    <div class="r-controls">
      <button class="r-btn" id="rprev" aria-label="Previous">${icons.prev}</button>
      <button class="r-btn big" id="rplay" aria-label="Play">${icons.play}</button>
      <button class="r-btn" id="rnext" aria-label="Next">${icons.next}</button>
    </div>
    <section class="card r-opts">
      <div class="row"><span class="grow small">After each line</span>${seg('radioEnglish', [[true, 'Say English'], [false, 'Japanese only']])}</div>
      <div class="row"><span class="grow small">Speed</span>${seg('radioSlow', [[false, 'Normal'], [true, 'Slow']])}</div>
      <div class="row"><span class="grow small">Text on screen</span>${seg('radioText', [[true, 'Show'], [false, 'Hide']])}</div>
    </section>
    <p class="small muted center">${channel.items.every(hasClips) ? 'Recorded: keeps playing when you lock the phone or switch apps.' : 'Keep the screen on while listening: iPhone stops speech when it locks.'}</p>`;

  const el = (id) => view.querySelector(`#${id}`);
  const show = (item, english) => {
    el('rjp').textContent = item.t.replace(/ /g, '');
    el('rro').textContent = ctx.romajiOf(item.t);
    el('ren').textContent = english ? item.en : '';
  };
  const live = (text) => { el('rlive').textContent = text; };

  // Recorded clips keep playing with the screen locked; device speech is the fallback.
  // A recorded item plays as one chain of files (the pauses are silent files), so it
  // never waits on a timer, which iPhone stops while locked.
  const audio = clipPlayer();
  const fileRate = () => (settings.radioSlow ? 0.75 : 1);
  function playFiles(parts, done) {
    let k = 0;
    const step = () => {
      if (!on) return;
      if (k >= parts.length) { done(); return; }
      const part = parts[k++];
      part.show?.();
      audio.src = clipUrl(part.id);
      audio.defaultPlaybackRate = fileRate();
      audio.playbackRate = fileRate();
      audio.play().catch(() => { if (on) setPlaying(false); });
    };
    audio.onended = step;
    audio.onerror = step;
    step();
  }

  // The lock screen shows the line and offers play, pause, next and previous.
  const session = typeof navigator !== 'undefined' ? navigator.mediaSession : null;
  function lockScreen(item) {
    if (!session || typeof MediaMetadata === 'undefined') return;
    session.metadata = new MediaMetadata({
      title: item.t.replace(/ /g, ''), artist: item.en, album: `${channel.title} · JP Trainer Radio`,
      artwork: [{ src: 'assets/icon-512.png', sizes: '512x512', type: 'image/png' }],
    });
  }
  const actions = { play: () => setPlaying(true), pause: () => setPlaying(false), nexttrack: () => next(1), previoustrack: () => next(-1) };
  const bindSession = (bind) => {
    if (!session) return;
    for (const [name, fn] of Object.entries(actions)) {
      try { session.setActionHandler(name, bind ? fn : null); } catch { /* not supported here */ }
    }
  };
  bindSession(true);

  function play() {
    clearTimeout(timer);
    const item = order[i];
    header();
    show(item, false);
    lockScreen(item);
    if (audio && hasClips(item)) {
      const c = itemClips(item);
      playFiles([
        { id: c.ja, show: () => live('Japanese') },
        ...(settings.radioEnglish
          ? [{ id: silenceId('think'), show: () => live('Think…') }, { id: c.en, show: () => { show(item, true); live('English'); } },
            { id: silenceId('gap'), show: () => live('') }]
          : [{ id: silenceId('long'), show: () => live('Think…') }]),
      ], () => next());
      return;
    }
    live('Japanese');
    speakStep(item.t, {
      rate: rate(),
      onend: () => {
        if (!on) return;
        live('Think…');
        timer = setTimeout(() => {
          if (!settings.radioEnglish) { next(); return; }
          show(item, true);
          live('English');
          // Notes in brackets, like "(Staff.)", are for reading, not for saying.
          speakStep(item.en.replace(/\s*\([^)]*\)/g, ''), { english: true, onend: () => { if (on) { live(''); timer = setTimeout(next, GAP_MS); } } });
        }, settings.radioEnglish ? THINK_MS : THINK_MS + GAP_MS);
      },
    });
  }

  function next(step = 1) {
    i += step;
    if (i >= order.length) {
      // A new lap in a new order (stories keep their order).
      order = channel.ordered ? order : shuffled(order);
      i = 0;
    }
    if (i < 0) i = order.length - 1;
    if (on) play();
    else { header(); show(order[i], settings.radioEnglish); }
  }

  function setPlaying(value) {
    on = value;
    el('rplay').innerHTML = on ? icons.pause : icons.play;
    el('rplay').setAttribute('aria-label', on ? 'Pause' : 'Play');
    el('rcard').classList.toggle('playing', on);
    if (session) session.playbackState = on ? 'playing' : 'paused';
    if (on) { holdScreen(); play(); } else { clearTimeout(timer); cancel(); audio?.pause(); live('Paused'); letScreenSleep(); }
  }

  // dispose stops quietly (the route changed); stop also leaves the screen.
  function dispose() {
    on = false;
    clearTimeout(timer);
    cancel();
    if (audio) { audio.onended = null; audio.onerror = null; audio.pause(); }
    bindSession(false);
    if (session) { session.metadata = null; session.playbackState = 'none'; }
    letScreenSleep();
  }
  function stop() {
    dispose();
    ctx.onExit();
  }

  el('rplay').onclick = () => setPlaying(!on);
  el('rnext').onclick = () => next(1);
  el('rprev').onclick = () => next(-1);
  view.querySelector('.r-opts').onclick = (e) => {
    const b = e.target.closest('[data-v]');
    if (!b) return;
    const key = b.closest('[data-key]').dataset.key;
    settings[key] = b.dataset.v === 'true';
    b.parentElement.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
    el('rcard').classList.toggle('no-text', !settings.radioText);
    ctx.persist();
  };

  header();
  show(order[0], false);
  setPlaying(true);
  return dispose;
}
