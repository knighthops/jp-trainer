// Unit tests and mock exams share this runner. The pure functions at the top build
// and grade a test; startExam runs it on screen. In the data, the first option of a
// question is the right one. Options are shuffled here, with a fixed order per exam
// so a mock exam can be resumed.
import { words, PASS_SHARE } from './course.js';
import { shuffled, romajiLine, bindGloss, glossHtml } from './drills.js';
import { speakLines, cancel, SLOW, NORMAL } from './tts.js';
import { icons } from './icons.js';

function seeded(text) {
  let h = 2166136261;
  for (const c of text) h = Math.imul(h ^ c.charCodeAt(0), 16777619);
  return () => {
    h = Math.imul(h ^ (h >>> 15), 2246822519) + 0x6d2b79f5;
    return ((h ^ (h >>> 13)) >>> 0) / 4294967296;
  };
}

function prepared(q, rng) {
  const o = shuffled(q.o, rng);
  return { ...q, o, a: o.indexOf(q.o[0]) };
}

export function mockExam(paper) {
  const rng = seeded(paper.id);
  return {
    key: paper.id,
    title: paper.title,
    scoring: 'jlpt',
    sections: paper.sections.map((s) => ({
      title: s.title,
      minutes: s.minutes,
      score: s.score,
      questions: s.parts.flatMap((part) => part.questions.map((q, i) => prepared({
        ...q, id: `${part.id}-${i}`, part: part.title, instr: part.instr, p: q.p || part.p,
      }, rng))),
    })),
  };
}

const MIN_QUESTIONS = 10;

// The written questions of a unit, plus word questions drawn from what it teaches.
export function unitTest(unit, data, rng = Math.random) {
  const taught = unit.lessons.flatMap((l) => l.words || [])
    .map((w) => data.vocab.find((v) => v.w === w)).filter(Boolean);
  const others = (field, right) => shuffled(data.vocab.filter((v) => v[field] && v[field] !== right), rng).slice(0, 3).map((v) => v[field]);
  const chosen = shuffled(taught, rng).slice(0, 6);
  const wordQs = chosen.map((v, i) => (i % 2 === 0 && v.w !== v.y
    ? { id: `${unit.id}-r${i}`, q: `[${v.w}]`, ask: 'How is this read?', o: [v.y, ...others('y', v.y)], w: `${v.w} is read ${v.y}: ${v.m}.`, word: v.w }
    : { id: `${unit.id}-m${i}`, q: `[${v.w}]`, ask: 'What does this mean?', o: [v.m, ...others('m', v.m)], w: `${v.w} means ${v.m}.`, word: v.w }));
  const written = (unit.quiz || []).map((q, i) => ({ ...q, id: `${unit.id}-q${i}` }));
  // Units that teach few words borrow fill-the-blank drills, so no test is too short to be fair.
  const blanks = unit.lessons.flatMap((l) => l.drills).filter((d) => d.c)
    .map((d, i) => ({
      id: `${unit.id}-c${i}`, q: d.c, ask: d.en ? `You want to say: “${d.en}”` : 'Which fits the blank?',
      o: [d.a, ...Object.keys(d.w)].slice(0, 4), w: d.note || '',
    }));
  const room = Math.max(0, MIN_QUESTIONS - wordQs.length - written.length);
  written.push(...shuffled(blanks, rng).slice(0, room));
  return {
    key: unit.id,
    title: `Unit ${unit.n} test`,
    scoring: 'unit',
    sections: [{ title: `Unit ${unit.n} test`, minutes: null, questions: shuffled([...wordQs, ...written], rng).map((q) => prepared(q, rng)) }],
  };
}

export function grade(exam, answers) {
  const sections = exam.sections.map((s) => {
    const right = s.questions.filter((q) => answers[q.id] === q.a).length;
    return { title: s.title, score: s.score, right, total: s.questions.length };
  });
  const share = (list) => {
    const total = list.reduce((n, s) => n + s.total, 0);
    return total ? list.reduce((n, s) => n + s.right, 0) / total : 0;
  };
  if (exam.scoring === 'unit') {
    const pct = share(sections);
    return { scoring: 'unit', sections, share: pct, pass: pct >= PASS_SHARE };
  }
  // Real JLPT scores are scaled statistically, so this is only an estimate.
  const language = Math.round(share(sections.filter((s) => s.score === 'language')) * 120);
  const listening = Math.round(share(sections.filter((s) => s.score === 'listening')) * 60);
  const total = language + listening;
  return {
    scoring: 'jlpt', sections, language, listening, total, share: total / 180,
    pass: total >= 80 && language >= 38 && listening >= 19,
  };
}

const display = (text) => (/[A-Za-z]/.test(text) ? text : text.replace(/ +/g, '')).replace(/\[/g, '<u>').replace(/\]/g, '</u>').replace(/\n/g, '<br>');
const plain = (text) => words(text.replace(/[[\]]/g, '').replace(/\*/g, ''));
const clock = (ms) => {
  const s = Math.max(0, Math.ceil(ms / 1000));
  return `${Math.floor(s / 60)}:${String(s % 60).padStart(2, '0')}`;
};
const audioLines = (q) => [
  ...q.play.map(([s, t]) => ({ s, t })),
  ...(q.ao ? q.o.map((o, i) => ({ s: 'F', t: `${['いち', 'に', 'さん', 'よん'][i]}、${o}` })) : []),
];

// ctx: { view, setTop, glossary, persist(current|null), onFinish(result, exam, answers) }
export function startExam(ctx, exam, { mode = 'exam', resume = null } = {}) {
  const { view, setTop, glossary } = ctx;
  const timed = mode === 'exam' && exam.scoring === 'jlpt';
  const help = mode === 'practice' || exam.scoring === 'unit';
  const once = mode === 'exam' && exam.scoring === 'jlpt';
  const st = resume || { key: exam.key, mode, sec: 0, i: 0, answers: {}, plays: {}, endAt: null, started: false };
  let tick = null;

  const save = () => { if (exam.scoring === 'jlpt') ctx.persist(st); };
  const stop = () => { clearInterval(tick); tick = null; cancel(); };
  const section = () => exam.sections[st.sec];
  const leave = () => { stop(); ctx.onExit(); };

  const header = () => {
    const q = section().questions;
    setTop(section().title, {
      close: true,
      onClose: leave,
      count: timed && st.endAt ? clock(st.endAt - Date.now()) : `${st.i + 1} / ${q.length}`,
      progress: (st.i / q.length) * 100,
    });
    if (timed && st.endAt && !tick) {
      tick = setInterval(() => {
        const left = st.endAt - Date.now();
        const el = document.querySelector('.count');
        if (el) el.textContent = clock(left);
        if (left <= 0) nextSection();
      }, 500);
    }
  };

  function intro() {
    const s = section();
    setTop(s.title, { close: true, onClose: leave });
    const rules = timed
      ? [`You have ${s.minutes} minutes for this section. The clock keeps running if you leave the app.`,
        'There is no romaji, and words can\'t be tapped.',
        s.score === 'listening' ? 'Each recording plays once, and you can\'t pause it. Use headphones.' : 'You can move back and change answers until the section ends.',
        'Once a section ends, you can\'t go back to it.']
      : exam.scoring === 'jlpt'
        ? ['There is no clock. Romaji and tappable words are available, and audio can be replayed.', 'This is good for learning, but it won\'t tell you how you\'d do on the day.']
        : [`Score ${Math.round(PASS_SHARE * 100)}% to pass. You can go back and change answers before you finish, and you can retake it.`];
    view.innerHTML = `<section class="card">
        <span class="caps">${exam.title}</span>
        <h3>${s.title}</h3>
        <p class="small muted">${s.questions.length} questions${timed ? ` · ${s.minutes} minutes` : ''}</p>
        ${rules.map((r) => `<p class="small">${r}</p>`).join('')}
      </section>
      <div class="dock"><button class="btn" id="begin">Begin</button></div>`;
    view.querySelector('#begin').onclick = () => {
      if (timed) st.endAt = Date.now() + s.minutes * 60000;
      st.i = 0;
      st.started = true;
      save();
      question();
    };
  }

  function question() {
    window.scrollTo(0, 0);
    const list = section().questions;
    const q = list[st.i];
    header();
    // The underlined word is what's being tested, so help never gives it away.
    const secret = (w) => w.startsWith('[');
    const tokens = (q.q || '').split(/ +/).filter(Boolean);
    const romajiOf = () => {
      if (!help || tokens.every(secret)) return '';
      return `<p class="romaji">${romajiLine(tokens.map((w) => (secret(w) ? null : plain(w)[0])), glossary, '')}</p>`;
    };
    const tappable = help && !q.ao;
    const stem = q.q ? (tappable
      ? `<div class="stem jp">${tokens.map((w) => (secret(w) ? display(w)
        : glossary[w] ? `<button class="word" data-word="${w}">${w}</button>` : `<span>${w}</span>`)).join('')}</div>`
      : `<div class="stem flow jp">${display(q.q)}</div>`) : '';
    const hideOptions = q.ao && !help;
    view.innerHTML = `
      <div class="card ${tappable ? 'gloss-zone' : ''}">
        <span class="caps">${q.part || section().title}</span>
        ${q.instr ? `<p class="small muted">${q.instr}</p>` : ''}
        ${q.p ? `<div class="passage jp">${display(q.p)}</div>` : ''}
        ${q.play ? `<button class="btn ghost" id="play">${icons.speaker}<span>Play</span></button>
          ${help ? `<div class="seg mini" id="speed"><button class="on" data-r="${NORMAL}">Normal</button><button data-r="${SLOW}">Slow</button></div>` : ''}` : ''}
        ${q.ask ? `<p class="small muted">${q.ask}</p>` : ''}
        ${stem}
        ${romajiOf()}
        ${tappable ? glossHtml() : ''}
      </div>
      <div class="choices" id="opts">${q.o.map((o, i) => `<button class="choice jp ${st.answers[q.id] === i ? 'picked' : ''}" data-i="${i}">
        <span class="cnum">${i + 1}</span><span class="grow">${hideOptions ? '' : display(o)}${!hideOptions && help && /[ぁ-ヶ一-龯]/.test(o) ? `<small class="ro">${romajiLine(plain(o), glossary, '')}</small>` : ''}</span></button>`).join('')}</div>
      <div class="dock"><div class="pair">
        <button class="btn ghost" id="prev" ${st.i === 0 ? 'disabled' : ''}>Previous</button>
        <button class="btn" id="next">${st.i === list.length - 1 ? 'Review' : 'Next'}</button>
      </div><button class="link" id="map">All questions</button></div>`;
    if (tappable) bindGloss(view.querySelector('.gloss-zone'), glossary);

    let rate = NORMAL;
    const play = view.querySelector('#play');
    if (play) {
      const lockPlay = () => {
        play.disabled = true;
        play.querySelector('span').textContent = 'Played';
      };
      if (once && st.plays[q.id]) lockPlay();
      play.onclick = () => {
        if (once) {
          if (st.plays[q.id]) return;
          st.plays[q.id] = true;
          save();
          lockPlay();
          play.querySelector('span').textContent = 'Playing…';
          speakLines(audioLines(q), { rate, onend: lockPlay });
        } else {
          speakLines(audioLines(q), { rate });
        }
      };
    }
    view.querySelector('#speed')?.addEventListener('click', (e) => {
      const b = e.target.closest('[data-r]');
      if (!b) return;
      rate = Number(b.dataset.r);
      view.querySelectorAll('#speed button').forEach((x) => x.classList.toggle('on', x === b));
    });
    view.querySelector('#opts').onclick = (e) => {
      const b = e.target.closest('.choice');
      if (!b) return;
      st.answers[q.id] = Number(b.dataset.i);
      save();
      view.querySelectorAll('.choice').forEach((x) => x.classList.toggle('picked', x === b));
    };
    view.querySelector('#prev').onclick = () => { cancel(); st.i--; save(); question(); };
    view.querySelector('#next').onclick = () => {
      cancel();
      if (st.i === list.length - 1) overview();
      else { st.i++; save(); question(); }
    };
    view.querySelector('#map').onclick = overview;
  }

  function overview() {
    cancel();
    window.scrollTo(0, 0);
    const list = section().questions;
    const blank = list.filter((q) => st.answers[q.id] === undefined).length;
    header();
    const lastSection = st.sec === exam.sections.length - 1;
    view.innerHTML = `<section class="card">
        <span class="caps">All questions</span>
        <p class="small muted">${blank ? `${blank} not answered. Tap a number to go to it.` : 'Everything is answered. Tap a number to check it.'}</p>
        <div class="qmap">${list.map((q, i) => `<button class="${st.answers[q.id] === undefined ? '' : 'on'}" data-i="${i}">${i + 1}</button>`).join('')}</div>
      </section>
      <div class="dock"><button class="btn" id="finish">${lastSection ? 'Finish and see results' : 'Finish this section'}</button></div>`;
    view.querySelector('.qmap').onclick = (e) => {
      const b = e.target.closest('[data-i]');
      if (!b) return;
      st.i = Number(b.dataset.i);
      save();
      question();
    };
    view.querySelector('#finish').onclick = () => {
      // Ending a section can't be undone, so check first when answers are missing.
      if (blank && !window.confirm(`${blank} ${blank === 1 ? 'question is' : 'questions are'} not answered. ${lastSection ? 'Finish' : 'End this section'} anyway?`)) return;
      nextSection();
    };
  }

  function nextSection() {
    stop();
    if (st.sec < exam.sections.length - 1) {
      st.sec++;
      st.i = 0;
      st.endAt = null;
      st.started = false;
      save();
      intro();
    } else {
      ctx.persist(null);
      results();
    }
  }

  function results() {
    window.scrollTo(0, 0);
    const r = grade(exam, st.answers);
    // A unit test can add a note (a new rank) and its own buttons (next unit, drill the misses).
    const extra = ctx.onResult?.(r, exam, st.answers, mode) || {};
    const actions = extra.actions || [{ label: 'Finish', run: null }];
    setTop(exam.title, { close: true, onClose: () => ctx.onExit() });
    const headline = exam.scoring === 'jlpt' ? `${r.total}<small> / 180</small>` : `${Math.round(r.share * 100)}%`;
    const rows = exam.scoring === 'jlpt'
      ? `<div class="row"><span class="grow">Vocabulary, grammar and reading<br><span class="small muted">Needs at least 38</span></span><span class="num">${r.language} / 120</span></div>
         <div class="row"><span class="grow">Listening<br><span class="small muted">Needs at least 19</span></span><span class="num">${r.listening} / 60</span></div>`
      : '';
    const missed = exam.sections.flatMap((s) => s.questions).filter((q) => st.answers[q.id] !== q.a);
    view.innerHTML = `<section class="card hero done-hero">
        <div class="score">${headline}</div>
        <h2>${r.pass ? 'Passed' : 'Not yet'}</h2>
        <p class="sub">${exam.scoring === 'jlpt'
          ? `${r.pass ? 'Above' : 'Below'} the N5 pass mark of 80. This is an estimate: real scores are scaled, and this isn't an official result.`
          : extra.note || (r.pass ? 'Unit cleared.' : `You need ${Math.round(PASS_SHARE * 100)}%. Go over the answers below, then try again.`)}</p>
        ${extra.badge || ''}
      </section>
      ${rows || r.sections.length > 1 ? `<section class="card list">${rows}${r.sections.map((s) => `<div class="row"><span class="grow small">${s.title}</span><span class="num small">${s.right} / ${s.total}</span></div>`).join('')}</section>` : ''}
      ${missed.length ? `<div class="caps sect"><span>Answers to go over</span></div>
        ${missed.map((q) => `<section class="card">
          ${q.p ? `<div class="passage jp">${display(q.p)}</div>` : ''}
          ${q.play ? `<div class="passage jp">${q.play.map(([s, t]) => `${s}: ${display(t)}`).join('<br>')}</div>` : ''}
          ${q.q ? `<div class="stem flow jp">${display(q.q)}</div>` : ''}
          ${st.answers[q.id] === undefined ? '<p class="small muted">Not answered</p>' : `<p class="small bad-text jp">Your answer: ${display(q.o[st.answers[q.id]])}</p>`}
          <p class="small good-text jp">Answer: ${display(q.o[q.a])}</p>
          ${q.w ? `<p class="small">${q.w}</p>` : ''}
          ${q.en ? `<p class="small muted">${q.en}</p>` : ''}
        </section>`).join('')}` : ''}
      <div class="dock stack">${actions.map((a, i) => `<button class="btn ${i ? 'ghost' : ''}" data-act="${i}">${a.label}</button>`).join('')}</div>`;
    view.querySelector('.dock').onclick = (e) => {
      const b = e.target.closest('[data-act]');
      if (!b) return;
      ctx.onExit();
      actions[Number(b.dataset.act)].run?.();
    };
  }

  if (st.started) {
    if (timed && st.endAt && st.endAt <= Date.now()) nextSection();
    else question();
  } else intro();
}
