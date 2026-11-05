# JP Trainer: Japanese Learning App Plan

## Goal

A personal, daily Japanese study app that runs in Safari on iPhone. It focuses on:

1. Reading kanji (recall, tracing, breakdown)
2. Building sentences and understanding particles
3. Speaking and pronunciation (listen and shadow)

The user is a returning learner. They passed JLPT N4 about 15 years ago, read hiragana and katakana well, know basic vocabulary, and have forgotten much of their kanji. They are a visual learner and want audio.

## Platform and architecture

- **Type:** Static web app. Plain HTML, CSS, and JavaScript. No backend, no build step for the MVP.
- **Hosting:** GitHub Pages, served over HTTPS from the repo.
- **Install on iPhone:** Open the site in Safari, then Share → Add to Home Screen.
- **Storage:** localStorage for progress in the MVP. Add a JSON export and import early, because Safari can clear site data.
- **Audio:** Web Speech API (`speechSynthesis`) with a `ja-JP` voice for the MVP. Human recordings can be added later as small MP3s.
- **Tracing:** HTML canvas. Stroke data from KanjiVG (SVG). Added after the MVP.

Suggested repo layout:

```
jp-trainer/
  index.html        app shell and screens
  css/style.css
  js/
    app.js          routing and screen logic
    srs.js          spaced repetition (SM-2 variant)
    store.js        localStorage load, save, export, import
    drills.js       tap-to-assemble and particle drills
    tts.js          speechSynthesis wrapper
  data/
    kanji-n5.json
    kanji-n4.json
    vocab-n5.json
    sentences.json
    particles.json
  assets/
    kanjivg/        stroke SVGs (added in phase 2)
  README.md
  PLAN.md
```

## Data sources

Use bundled JSON, not runtime scraping. Check each license and credit the sources in the app's About screen.

| Data | Source | Used for |
|---|---|---|
| Kanji readings, meanings, stroke counts, JLPT and grade | KANJIDIC2 | Kanji cards |
| Stroke order SVGs | KanjiVG | Tracing and animation |
| Vocabulary | JMdict | Word cards |
| Example sentences | Tatoeba | Sentence drills |

For the MVP, start with a small hand-curated set (about 100 N5 kanji and 150 words) so the app works before the full datasets are imported. Import the full KANJIDIC2 and JMdict datasets later.

## Learning mechanics

1. **Spaced repetition:** Every kanji, word, and sentence has an SRS record. Use an SM-2-style algorithm for the MVP. FSRS can replace it later.
2. **Daily session (about 15 minutes):**
   - Review due items (5 min)
   - Learn 3–5 new kanji with breakdown (3 min)
   - Sentence drills, tap-to-assemble plus one particle drill (4 min)
   - Listen and shadow one clip (3 min)
3. **Active recall:** The user produces the answer. Don't just show it and ask for recognition.
4. **Specific feedback:** Show why an answer was wrong (for example, which particle was expected and why).
5. **Streaks:** Gentle. A missed day doesn't reset progress. The next session starts from the due queue.

## Feature specs

### 1. Kanji cards

- Front: kanji, large.
- Back: on-yomi and kun-yomi, meanings, stroke count, JLPT level, example words.
- Breakdown: the kanji split into components, each with a short mnemonic. Visual mnemonics are preferred (the user is a visual learner).
- Rating buttons: Again, Hard, Good, Easy. These feed the SRS.

### 2. Kanji tracing (phase 2)

- Render the KanjiVG SVG on a canvas with a faint guide.
- The user traces each stroke. Score stroke order and direction.
- Start with the guide fully visible. Fade it out over successive reviews.
- Offer an animated stroke-order playback as a hint.

### 3. Sentence drills (tap-to-assemble)

- Show an English sentence.
- Show Japanese word blocks in shuffled order.
- The user taps blocks in the correct order.
- Block colors by role: topic, subject, object, verb, particle, other.
- Feedback on the first wrong tap, not only at the end.

### 4. Particle drills

- A dedicated track: は, が, を, に, で, へ, の, も, と.
- Show one noun in several sentences. Ask which particle fits.
- Each particle has a short function card with a visual example.
- Explain why the wrong answer was wrong.

### 5. Listen and shadow

- Play a clip (TTS for the MVP). Then the user repeats it.
- Record the user (MediaRecorder) and play it back next to the model.
- Speech-recognition scoring is a later stretch goal. iOS Safari's support for Japanese is limited.

### 6. Reading

- Short passages with furigana that can be toggled.
- Tap any word for its meaning and reading.
- Later: sentence mining (save sentences from the real world into the SRS).

## Course progression

Targets are approximate JLPT counts (cumulative kanji): N5 about 100, N4 about 300, N3 about 650, N2 about 1,000.

| Phase | Duration | Focus | Exit criteria |
|---|---|---|---|
| 0. Calibration | Week 1 | Placement test, kana speed check, N5 SRS deck | Know the starting level |
| 1. Kanji and vocab reactivation | 6–8 weeks | N5 then N4 kanji and vocab, with breakdown and tracing | Read N5 kanji in sentences without furigana; pass a reading test on N4 kanji |
| 2. Grammar and sentences | Runs alongside Phase 1 | Core particles, verb forms, adjectives, conditionals | Tap-to-assemble drills at 80%+ accuracy |
| 3. Reading and listening | After N4 is solid, 2–3 months | Graded passages, shadowing, sentence mining | Read short N4 passages; shadow clips at normal speed |
| 4. N3 and N2 | 6–12 months | Kanji to 650 then 1,000; N3/N2 grammar; speaking practice | Track JLPT mock tests |

## MVP scope (build first)

- Hand-curated N5 kanji (about 100) and vocab (about 150).
- Kanji cards with SRS and self-rating.
- Daily session screen that runs the four blocks above.
- Tap-to-assemble sentence drill (about 50 sentences).
- Particle drill for the core particles.
- Listen (TTS) with a repeat button.
- localStorage progress, with export and import.
- Installable via Safari Add to Home Screen.

Out of scope for the MVP: tracing, full datasets, speech scoring, pitch accent, accounts or cloud sync.

## Milestones

1. **M1:** Repo scaffolded, app shell renders on iPhone Safari, data loads.
2. **M2:** Kanji cards with SRS and the daily session working end to end.
3. **M3:** Tap-to-assemble and particle drills working with the MVP sentence set.
4. **M4:** Listen and shadow with TTS; export and import working.
5. **M5:** KANJIDIC2 and JMdict imported; KanjiVG tracing added.

## Open questions

- Should the app be private only, or shared later? (Affects licensing and storage.)
- Does the user want human-recorded audio, or is TTS enough for now?
- Preferred visual style for the component mnemonics (the user does graphic design).

## Notes for the builder

- Test on iPhone Safari early and often. Check touch targets, safe-area insets, and that the home-screen install runs full-screen.
- Keep the total bundle small. Load the full datasets lazily, per level.
- Don't commit third-party data without its license and attribution.
