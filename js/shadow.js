// Listen and shadow: hear the model, record yourself, compare the two.
import { speak, cancel, NORMAL, SLOW, hasJapaneseVoice } from './tts.js';
import { bindGloss, glossHtml, romajiLine } from './drills.js';
import { icons } from './icons.js';

const MAX_MS = 20000;

export const canRecord = () => Boolean(navigator.mediaDevices?.getUserMedia && window.MediaRecorder);

const pickMime = () => ['audio/mp4', 'audio/webm;codecs=opus', 'audio/webm']
  .find((m) => MediaRecorder.isTypeSupported?.(m));

// Returns a cleanup function that releases the microphone and stops audio.
export function renderShadow(root, sentence, { glossary, onDone }) {
  const words = sentence.blocks.map((b) => b.t);
  const text = words.join('');
  let rate = NORMAL;
  let recorder = null;
  let stream = null;
  let url = null;
  let timer = null;
  let player = null;

  root.innerHTML = `
    <div class="card gloss-zone">
      <span class="caps">Listen and shadow</span>
      <p class="en">${sentence.en}</p>
      <div class="pline">${words.map((w) => `<button class="word" data-word="${w}">${w}</button>`).join('')}</div>
      <p class="romaji center">${romajiLine(words, glossary)}</p>
      ${glossHtml()}
    </div>
    <div class="card shadow">
      <div class="srow"><span class="snum">1</span><span class="grow"><strong>Listen</strong><br><span class="small muted">Follow the rhythm.</span></span>
        <div class="seg mini" id="speed"><button class="on" data-r="${NORMAL}">Normal</button><button data-r="${SLOW}">Slow</button></div></div>
      <button class="btn ghost" id="model">${icons.speaker}<span>Play model</span></button>
      <div class="srow"><span class="snum">2</span><span class="grow"><strong>Say it with the model</strong><br><span class="small muted">Record your own attempt.</span></span></div>
      <div id="reczone">${canRecord()
        ? `<button class="btn ghost" id="rec">${icons.mic}<span>Record</span></button>`
        : '<p class="small muted">Recording isn\'t available in this browser. Repeat the sentence out loud instead.</p>'}</div>
      <div class="compare" id="compare" hidden>
        <div class="srow"><span class="snum">3</span><span class="grow"><strong>Compare</strong></span></div>
        <div class="pair">
          <button class="btn ghost" id="model2">${icons.speaker}<span>Model</span></button>
          <button class="btn ghost" id="mine">${icons.play}<span>You</span></button>
        </div>
      </div>
    </div>
    <div class="fb" id="fb" role="status"></div>
    <div class="dock"><button class="btn" id="cont">Continue</button></div>`;

  bindGloss(root.querySelector('.gloss-zone'), glossary);
  const fb = root.querySelector('#fb');
  const note = (msg) => { fb.className = 'fb info'; fb.textContent = msg; };

  hasJapaneseVoice().then((ok) => {
    if (!ok && root.contains(fb)) note('This device has no Japanese voice, so the model may not play or may sound wrong. You can add one in its accessibility or speech settings.');
  });

  const stopPlayback = () => {
    cancel();
    if (player) { player.pause(); player = null; }
  };
  const playModel = () => { stopPlayback(); speak(text, { rate }); };
  root.querySelector('#model').onclick = playModel;
  root.querySelector('#model2').onclick = playModel;
  root.querySelector('#speed').onclick = (e) => {
    const b = e.target.closest('[data-r]');
    if (!b) return;
    rate = Number(b.dataset.r);
    root.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
  };
  root.querySelector('#mine').onclick = () => {
    if (!url) return;
    stopPlayback();
    player = new Audio(url);
    player.play().catch(() => note('Your recording couldn\'t play. Try recording again.'));
  };

  const releaseMic = () => {
    stream?.getTracks().forEach((t) => t.stop());
    stream = null;
  };
  const stopRecording = () => {
    clearTimeout(timer);
    if (recorder?.state === 'recording') recorder.stop();
  };
  const setRecButton = (isRecording) => {
    const btn = root.querySelector('#rec');
    if (!btn) return;
    btn.classList.toggle('recording', isRecording);
    btn.innerHTML = isRecording
      ? `${icons.stop}<span>Stop</span>`
      : `${icons.mic}<span>${url ? 'Record again' : 'Record'}</span>`;
  };

  async function startRecording() {
    stopPlayback();
    fb.textContent = '';
    fb.className = 'fb';
    try {
      stream = await navigator.mediaDevices.getUserMedia({ audio: true });
    } catch (err) {
      note(err.name === 'NotAllowedError'
        ? 'The microphone is blocked. Allow it in your settings, or repeat the sentence out loud.'
        : 'The microphone couldn\'t start. You can still repeat the sentence out loud.');
      return;
    }
    const chunks = [];
    const mime = pickMime();
    recorder = new MediaRecorder(stream, mime ? { mimeType: mime } : {});
    recorder.ondataavailable = (e) => { if (e.data.size) chunks.push(e.data); };
    recorder.onstop = () => {
      releaseMic();
      if (url) URL.revokeObjectURL(url);
      url = chunks.length ? URL.createObjectURL(new Blob(chunks, { type: recorder.mimeType || mime })) : null;
      setRecButton(false);
      const compare = root.querySelector('#compare');
      if (compare) compare.hidden = !url;
    };
    recorder.start();
    setRecButton(true);
    timer = setTimeout(stopRecording, MAX_MS);
  }

  const recBtn = root.querySelector('#rec');
  if (recBtn) {
    recBtn.onclick = () => {
      if (recorder?.state === 'recording') stopRecording();
      else startRecording();
    };
  }
  root.querySelector('#cont').onclick = onDone;

  return () => {
    clearTimeout(timer);
    stopPlayback();
    if (recorder?.state === 'recording') {
      recorder.onstop = null;
      recorder.stop();
    }
    releaseMic();
    if (url) URL.revokeObjectURL(url);
    url = null;
  };
}
