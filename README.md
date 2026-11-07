# JP Trainer

A personal daily Japanese study app for Safari on iPhone. It's a static site with no backend and no build step. See [PLAN.md](PLAN.md) for the full plan.

## Status

| Milestone | State |
|---|---|
| M1: app shell, data loading | Built |
| M2: kanji cards, SRS, daily session | Built |
| M3: tap-to-assemble and particle drills | Built |
| M4: listening clips, export and import | Built |
| Full MVP content | Built |
| JLPT N5 course and mock exams | Built |
| M5: full datasets, KanjiVG tracing | Not started |

The app has five tabs: Today, Course, Practice, Kanji and Settings.

- **Course:** 24 units in order, each with lessons, a dialogue and a unit test. Scoring 80% on a unit test opens the next unit, and any open unit's test can be taken early to skip it. Passing every unit opens the mock exams.
- **Mock exams:** two papers in the JLPT N5 layout. Exam mode is timed with no help, and practice mode adds romaji, tappable words and replays.
- **Practice:** sentence levels that open in turn, and unlimited particle drills that bring back what you miss.

Content is hand-written and hasn't been checked by a native speaker. JLPT tags are approximate, because no official kanji list has been published since 2010.

The mock exams are original questions, not real papers, which are copyrighted. Section times and the 180-point pass marks come from [jlpt.jp](https://www.jlpt.jp/e/guideline/testsections.html). The number of questions of each type is approximate because the site doesn't publish current counts. The score is an estimate, because real scores are scaled. Audio uses the device's text-to-speech voice, and questions that use pictures on the real test are written as text here.

Progress stays on the device, so export a backup from Settings regularly.

## Login

The app opens on a login screen and remembers the login on that device until you choose **Log out** in Settings. Logging out doesn't remove progress. `js/lock.js` holds only salted hashes (PBKDF2-SHA256), so the repo has no readable username or password.

The login keeps visitors out of the app, but it doesn't encrypt anything. The code and study content are still readable in this public repo, and a short password could be guessed offline from its hash.

## Run locally

The site needs a local server because it loads JSON files. This one needs only Windows PowerShell:

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open http://localhost:8123/.

## Releases

GitHub Pages lets browsers cache files for 10 minutes. To stop old and new files mixing, `index.html` reads `version.json` first and loads every file tagged with that release. A commit hook updates the file. Enable it once per clone:

```bash
git config core.hooksPath .githooks
```

## Tests

The tests cover scheduling, drill logic, session building, the course and exam flows, and data integrity. They need Node:

```bash
npm test
```

Without Node, start the local server and open http://localhost:8123/tools/test.html to run the same tests in a browser.

## Editing content

Everything is in `data/`:

- `kanji-n5.json`: each component in `parts` can take an optional `img` path for artwork.
- `sentences.json`: `blocks` holds the main word order. `alts` lists other natural orders as block indexes, so they aren't marked wrong.
- `particles.json`: every wrong option in `options` needs an explanation in `why`.
- `glossary.json`: reading, romaji, and meaning for each word in the sentences, particle guides, and drills. Every word used there needs an entry.
- `particle-bank.json`: sentence frames for the unlimited particle drill. `slots` fills in the frames, and each frame's `w` explains its wrong answers.
- `course/units-*.json`: the units. Text is space-separated so each word can be tapped. A unit's `lex` adds words to the glossary as `word: [kana, meaning, optional romaji]`. In `o`, the first option is always the correct one, and the app shuffles them.
- `course/exam-n5-*.json`: the mock papers, in the same format. `[x]` underlines a word, `play` lists the lines to speak, and `ao` means the options are heard, not read, in exam mode.
