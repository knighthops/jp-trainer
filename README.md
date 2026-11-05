# JP Trainer

A personal daily Japanese study app for Safari on iPhone. It's a static site with no backend and no build step. See [PLAN.md](PLAN.md) for the full plan.

## Status

| Milestone | State |
|---|---|
| M1: app shell, data loading | Built |
| M2: kanji cards, SRS, daily session | Built |
| M3: tap-to-assemble and particle drills | Built |
| M4: listen and shadow, export and import | Built |
| Full MVP content | Built |
| M5: full datasets, KanjiVG tracing | Not started |

Content is hand-written and hasn't been checked by a native speaker: 100 kanji, 150+ words, 50 sentences, and 12 particle items covering all 9 particles. JLPT tags are approximate, because no official kanji list has been published since 2010.

Progress stays on the device, so export a backup from Settings regularly.

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

The tests cover scheduling, drill logic, session building, and data integrity. They need Node:

```bash
npm test
```

## Editing content

Everything is in `data/`:

- `kanji-n5.json`: each component in `parts` can take an optional `img` path for artwork.
- `sentences.json`: `blocks` holds the main word order. `alts` lists other natural orders as block indexes, so they aren't marked wrong.
- `particles.json`: every wrong option in `options` needs an explanation in `why`.
- `glossary.json`: reading, romaji, and meaning for each word in the sentences, particle guides, and drills. Every word used there needs an entry.
