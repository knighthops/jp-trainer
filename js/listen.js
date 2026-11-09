// Listening: hear a sentence before seeing it, choose what it means, then read it.
import { speak, NORMAL, SLOW, hasJapaneseVoice } from './tts.js';
import { bindGloss, glossHtml, romajiLine, shuffled } from './drills.js';
import { icons } from './icons.js';

export function renderListen(root, sentence, { glossary, others = [], review = false, onDone }) {
  const words = sentence.blocks.map((b) => b.t);
  const text = words.join(' ');
  let rate = NORMAL;
  const options = shuffled([sentence.en, ...shuffled(others.filter((en) => en !== sentence.en)).slice(0, 2)]);

  root.innerHTML = `
    <div class="card shadow">
      <span class="caps">Listen</span>
      <p class="en">What does it mean?</p>
      <button class="btn ghost" id="play">${icons.speaker}<span>Play</span></button>
      <div class="seg mini" id="speed"><button class="on" data-r="${NORMAL}">Normal</button><button data-r="${SLOW}">Slow</button></div>
    </div>
    <div class="choices" id="opts">${options.map((o) => `<button class="choice" data-o="${o}">${o}</button>`).join('')}</div>
    <div class="card gloss-zone" id="reveal" hidden>
      <div class="pline">${words.map((w) => `<button class="word" data-word="${w}">${w}</button>`).join('')}</div>
      <p class="romaji center">${romajiLine(words, glossary)}</p>
      <p class="center small muted">${sentence.en}</p>
      ${glossHtml()}
    </div>
    <div class="fb" id="fb" role="status"></div>
    <div class="dock" id="after"></div>`;

  bindGloss(root.querySelector('.gloss-zone'), glossary);
  const fb = root.querySelector('#fb');
  hasJapaneseVoice().then((ok) => {
    if (!ok && root.contains(fb)) {
      fb.className = 'fb info';
      fb.textContent = 'This device has no Japanese voice, so audio may not play or may sound wrong. You can add one in its accessibility or speech settings.';
    }
  });

  const play = () => speak(text, { rate });
  root.querySelector('#play').onclick = play;
  root.querySelector('#speed').onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rate = Number(b.dataset.r);
    root.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
    play();
  };

  // onDone learns whether the first choice was right, so reviews can be graded.
  let right = true;
  const finish = () => {
    root.querySelector('#reveal').hidden = false;
    root.querySelectorAll('.choice').forEach((b) => {
      b.disabled = true;
      if (b.dataset.o === sentence.en) b.classList.add('right');
    });
    root.querySelector('#after').innerHTML = '<button class="btn" id="cont">Continue</button>';
    root.querySelector('#cont').onclick = () => onDone(right);
  };
  root.querySelector('#opts').onclick = (e) => {
    const b = e.target.closest('.choice');
    if (!b || b.disabled) return;
    if (b.dataset.o !== sentence.en) { b.classList.add('wrong'); right = false; }
    finish();
  };
  if (review) finish();
}
