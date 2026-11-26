# Goldfish tank — approved mocks

Design mocks for the goldfish accountability feature. Not wired into the app yet.
Open any `.html` file directly in a browser; each one is self-contained.

| File | What it shows |
|---|---|
| `goldfish-homes.html` | The four homes (Fishbowl 1 fish, Small tank 3, Planted tank 5, Grand aquarium 8), day and night |
| `goldfish-life.html` | Personalities and behaviour: feeding, begging, sleeping, dying, speech bubbles |
| `goldfish-home.html` | The fish card on Home: bowl, name, one status, one button |
| `goldfish-tank-tab.html` | The Tank tab (replaces Dojo): pinned tank, Fish grid, Homes, Album |

## Source (`src/`)

- `paint.js` — the locked fish sprites (Ryukin, Oranda, Ranchu). Shapes are painted at k× scale, then pixelated to a fixed palette with a 1px dark outline. `FLAT` gives the plain two-tone fry/young look, `WAG` animates the tail.
- `tanks.js` — the home drawings, the pixelate step `pixG`, the night tones and `TANKS` (size, swim area, fish scale, inside-water test).
- `life.js` — the behaviour engine `lifeTank()`: swimming, feeding, begging, sleeping, death, rare non-repeating speech.

## Decisions to keep

- Looking after the fish is study only. There is no free feeding or other care chore on screen.
- Hunger: 1 day missed → Hungry (begs at the surface); 2 days missed → dies (grey, belly-up at the surface, moved to the Album).
- Night is a manual light switch on the tank, not the phone theme or the time of day.
- Fish stay fully inside the water. Fry and young are flat two-tone, never mottled.
- Speech is rare, never repeats, uses only words already taught, and plays sound only when tapped.
- Dojo's Particles practice and N5 mock exam move elsewhere; they are not removed.

**Still open:** whether any study feeds the fish, or only full reviews.
