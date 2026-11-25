# Casual N4 course: plan

A second course that runs alongside the N5 course. It teaches the grammar of everyday spoken
Japanese (roughly JLPT N4), built one verb form at a time.

The topic order follows the 72-point grammar list from Miku Real Japanese. Every note, example,
drill and dialogue is written new for this app. Nothing is copied from her lessons.

## Goals

- Understand casual speech: 行っちゃった, 食べてる, 言ってた, んだけど.
- Build N4 grammar on each verb form: learn the form first, then the patterns that use it.
- Study it in tandem with N5. Neither course has to be finished before the other.
- Keep every existing rule: nothing quizzed before it's taught, no mic, audio only on tap,
  one calm theme, XP only in the home ring.

## How it fits next to N5

### Two tracks, one set of what you know

- The Course screen gets a two-way switch: **N5 · Casual**. Each track has its own units,
  unlock chain, next step and progress. Unit ids start with `c` (`c01`), lessons `c01a`.
- **What you've been taught is shared across both.** A word, kanji or grammar point learned in
  either track counts as known in both. Today `isTaught` checks one lesson order
  (`firstLessonIndex` over `data.units`). It changes to: known if it's an item already, or if
  the lesson that teaches it is done in **either** track. Each track keeps its own order for
  "taught earlier in this track".
- **Words the other track hasn't reached yet are taught right there.** The engine already
  does this for N5 (`wordsNeededEarly`: 医者 taught in 1.1 though it belongs in 1.3). A Casual
  lesson that needs an N5 word you haven't met teaches it first. When N5 reaches that word
  later, you already have it, so that step is skipped.
- **Overlapping grammar is taught once.** About 15 of the 72 points are already in N5
  (て form, ている, てもいい, ない, ないで, たい, より/ほう…). Each lesson gets a grammar id
  (`g:te-iru`). Whichever track reaches it second shows a short **refresher** card (casual
  form, two drills) instead of the full lesson.

### Start gate

The Casual course opens once **N5 unit 8 is passed** (or tested out): ます, past tense, the
core particles and invitations. Turning polite into casual needs ます forms to start from.
Everything after that point runs in tandem.

### Kanji

Casual teaches **no new kanji cards**; kanji stay in the N5 track. A kanji you haven't been
taught gets kana above it, as Trip signs already do. Once N5 teaches it, the kana goes away.
**Every kanji in Casual is tappable**, taught or not, everywhere it appears (notes, examples,
drills, chats). Tapping one opens the small kanji card with its meaning and the reading used
in that word, like lesson notes already do.

**Kanji N5 hasn't taught yet are marked**, quietly:
- Kana above it, and a dotted underline in the accent color (`--act`). No red, which means
  "wrong" in this app, and no stickers.
- Its tap card adds one line: **Coming in N5 · unit 12** for an N5 kanji not reached yet, or
  **Beyond N5** for one the N5 course never teaches. A Beyond N5 kanji keeps its kana for good.
- When N5 teaches it, the underline and kana go away in Casual. Lessons get cleaner as N5
  progresses.
- Taught kanji are plain but still tappable.

### Daily rhythm

The home "next up" offers one lesson from each track. A day might be one N5 lesson and one
Casual lesson. The home ring counts both. Neither track nags you when it's behind.

## Daily load: switch freely, stay manageable

You can study either course at any time. What keeps two courses manageable is a shared limit
on new material, not separate limits per course.

- **One daily goal for both.** The home XP ring (`DAILY_GOAL`) stays the one daily goal. Lessons
  and reviews from either course fill it. Below the ring, one line shows the day:
  **New lessons 1 / 2 · Reviews 12 left**.
- **New lessons: 2 a day in total**, from either course. After two, Home stops suggesting new
  lessons and offers reviews or practice instead. You can still start a third from the Course
  screen. It's a guide, not a lock.
- **Reviews come first when they pile up.** When more than ~40 are due, Home's "next up"
  leads with reviews, and new lessons show "after reviews". One review queue holds both
  courses' cards.
- **Casual lessons are light on borrowed words.** Casual mostly uses words N5 has already taught.
  Each lesson teaches at most 3 N5 words early, and the data check enforces it.
- **No nagging.** Neither course complains when it's behind, and nothing counts days you
  skipped one course. The week view and the gentle streak stay as they are.

The numbers (2 lessons, 40 reviews) are starting values in one place in `store.js`, tuned
after the pilot.

## Unit shape

Same as N5, so the screens and tests carry over:

1. **Words**: new vocabulary for the unit.
2. **Grammar lesson ×2**: note, polite⇄casual example pairs, drills.
3. **Chat**: a short casual text conversation between friends that closes the unit (in place
   of N5's polite scene dialogues).
4. **Unit test**: as in N5, and you can test out.

A chapter that opens with a new verb form starts with a **Form gym** lesson (see New
exercise types).

## Outline: 12 chapters, 29 units

Numbers in brackets are her list numbers. *Refresher* marks points the N5 course already
teaches. A few points move to sit with a related one; those are marked ↔.

**1. て form, casual**
- c01: Form gym: て form; ている → てる [1, 2]. Refresher on てる / てない; まだ〜てない [3]; てもいい？ [4]

**2. た form**
- c02: Form gym: た form (refresher); たことがある [5, 9]
- c03: たほうがいい [6]; たら: if and when [7, 8]

**3. ない form**
- c04: Form gym: ない form (refresher); ない？ (why don't we) [10, 11]
- c05: ないで (without doing); ないほうがいい [12, 13]
- c06: ないといけない [14]; なくてもいい [15]
- c07: すぎる [16]; casual たい and 〜に行く (refresher) [17, 18]
- c08: XはYが adjective (refresher); くて / で [19, 20]; BよりAのほうが, casual (refresher) [21]

**4. Dictionary form**
- c09: Form gym: dictionary form (refresher); のが好き, こと [22, 23]; 前に (refresher) [24]
- c10: くなる / になる [25]; てから [26]
- c11: てほしい [27]; て for reasons [28]
- c12: たり、たり [29]; し、し [30]
- c13: やすい / にくい [31, 32]; くする / にする [33]

**5. Potential**
- c14: Form gym: potential [34]; ようになる [35]; できるように [36]

**6. Plain form: real casual speech**
- c15: Form gym: plain form, casual だ [37]; と思う [38]
- c16: って言ってた / って言った [39, 40]; らしい [41]
- c17: かも [42]; ながら [43]; そう [44]

**7. Volitional: plans**
- c18: Form gym: volitional [45]; ようと思ってる / 思ってた [46, 47]
- c19: ようとした [48]; てみる [51 ↔]

**8. Slips and feelings**
- c20: ちゃだめ [49]; ちゃった [50]
- c21: ても [52]; のに [57 ↔]

**9. Favors and asking**
- c22: てくれる [53]; てもらう / てあげる [54]
- c23: Can you…? [55]; かどうか [56]

**10. Thinking out loud**
- c24: かな [58, 59]; みたい [63 ↔]
- c25: Noun modification [60]; ておく [61]

**11. If and because**
- c26: から / ので [62]; たら, part 3 [64]
- c27: なら [65]; と (if) [66]
- c28: Form gym: ば form [67]; ば [68]

**12. Real talk and the passive**
- c29: んですか / の？ [69]; んだけど [70]; Form gym: passive [71]; passive voice [72].
  Ends with a longer final chat.

About 55 new grammar lessons and 15 refreshers. Her list has 32/33 printed twice; that's
treated as a typo.

## New exercise types

1. **Form gym**: a verb and a target form; you build the form from kana tiles. Verbs come
   by group (る, う, irregular), then mixed. A wrong answer shows the rule, such as
   書く → 書いて: く becomes いて.
2. **Say it casually**: a polite sentence; you build the casual version from tiles
   (行きましたか → 行った？). It also runs in reverse.
3. **Which one?**: confusable sets with a one-line reason: かも / らしい / みたい / そう,
   たら / なら / と / ば, から / ので, てくれる / てもらう.
4. **Reply pick**: in a chat, a friend's casual line; you choose the natural reply. The
   wrong options sound off for a clear reason (too polite, wrong tense, wrong person).
5. **Verb form card**: tap any verb to see the forms you've learned so far, and only those.

All of these follow the hard rule: every option and every word in them is already taught.

## Data and code

- **Files:** `data/course/casual-01-04.json` … in the N5 unit format, plus fields
  `g` (grammar id), `refresh` (true for refreshers), `style` per example (`casual`/`polite`),
  and `chat` per unit.
- **course.js:** `JLPT_LEVELS` becomes a list of tracks, each with its own units and unlock
  chain. `isTaught`, `firstLessonIndex` and `taughtAtIndex` look across tracks as described
  above. `nextUp`, `isUnlocked` and `courseSteps` already take a `units` list and work per
  track unchanged.
- **exercises.js / drills.js:** the four new exercise types.
- **Audio:** new lines go through `tools/make-audio.ps1` like the N5 lines, so tapped audio
  works in silent mode.
- **Checks:** a data test confirms that every word in a Casual drill or chat is in that
  lesson's `lex`, an earlier Casual lesson's, or the N5 data (where it would be taught early).
  Particle options only use particles taught by the Casual start gate.
- **Tests:** `tests/logic.test.js` gets cases for tandem progress: an N5 word met first in
  Casual, a refresher in either order, and the start gate.

## Build phases

1. **Engine for two tracks**: track switch, shared taught set, start gate, kana over untaught
   kanji in Casual, refresher handling. Tests first.
2. **Pilot: chapter 2 (c02–c03, た form)**: content, Form gym, Say it casually, chat, audio.
   Tester agent runs it at iPhone size. Adjust before writing more.
3. **Rest of the exercise types**: Which one? and Reply pick, as the chapters that need them
   arrive (chapter 6 onward).
4. **Content in batches of four units**: c01, then c04–c07, c08–c11, and so on. Each batch
   passes the data check and a tester run before the next.
5. **Polish**: chapter review sets, the final chat.
6. **Last, nice to have: a short video per lesson.** Collected once while writing, stored in
   the lesson file (title, channel, length): a Short if one exists, at most ~3 minutes, none
   if nothing fits. Opens YouTube on tap. A link checker in `tools/` flags deleted videos.

## Decisions

- Daily load (after the 2026-11-25 test): a short Casual lesson counts ½ toward the 2-a-day guide, a refresher 0. When the guide is met, end screens still offer the next lesson as a second button.

- **Name:** "Casual". The switch reads **N5 · Casual**.
- **Start gate:** opens once N5 unit 8 is passed. As of 2026-11-25 you're about to take the
  unit 7 test, so Casual opens about one unit from now. Phase 1 and the pilot can be built
  before then.
- **Kanji:** every kanji in Casual is tappable for its meaning and reading.
- **Ranks:** Casual units don't count toward the N5 rank titles, and Casual gets none of its
  own, which keeps extra rewards out of the app.
