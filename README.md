# JP Trainer

A personal daily Japanese study app for Safari on iPhone. It's a static site with no backend and no build step. See [PLAN.md](PLAN.md) for the full plan.

## Status

| Milestone | State |
|---|---|
| M1: app shell, data loading | Built |
| M2: kanji cards, SRS, daily session | Built |
| M3: tap-to-assemble and particle drills | Built |
| M4: listen and shadow, export and import | Not started |
| Full MVP content | Not started |
| M5: full datasets, KanjiVG tracing | Not started |

The app currently has sample content: 20 kanji, 21 words, 10 sentences, and 12 particle items covering all 9 particles. The MVP target is about 100 kanji, 150 words, and 50 sentences.

Progress isn't backed up until export and import arrive in M4.

## Run locally

The site needs a local server because it loads JSON files. This one needs only Windows PowerShell:

```bash
powershell -ExecutionPolicy Bypass -File tools/serve.ps1
```

Then open http://localhost:8123/.

## Tests

The tests cover scheduling, drill logic, session building, and data integrity. They need Node:

```bash
npm test
```

## Editing content

Everything is in `data/`:

- `kanji-n5.json`: each component in `parts` has an `img` field, `null` for now, ready for artwork.
- `sentences.json`: `blocks` holds the main word order. `alts` lists other natural orders as block indexes, so they aren't marked wrong.
- `particles.json`: every wrong option in `options` needs an explanation in `why`.
