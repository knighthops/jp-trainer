# N5 course audit (2026-11-11)

Checked the 24 units in `data/course/` against a standard JLPT N5 grammar list and the
N5 word list from [open-anki-jlpt-decks](https://github.com/jamsinclair/open-anki-jlpt-decks)
(based on Jonathan Waller's lists, about 710 words).

## Grammar

| Point | Before | Now |
|---|---|---|
| です, ではありません, か, の, これ/この | Taught (u01–u02) | Same |
| も (also), や (and so on) | Used, never explained | **u02c** |
| Numbers, いくら, ください | Taught (u03) | Same |
| 時, から/まで | Taught (u04) | Same |
| ごろ, ね, よ | Used, never explained | **u04c** |
| ます, ません, ました, を, に (time) | Taught (u05–u06) | Same |
| に/へ, で, と | Taught (u07–u08) | Same |
| ませんか, ましょう | Taught (u08b) | Same |
| ましょうか (offering) | Missing | **u08c** |
| あります/います, position words | Taught (u09) | Same |
| い and な adjectives, past and negative | Taught (u10–u12) | Same |
| くなる / になる, く / に adverbs | Missing | **u12c** |
| 分かる, できる, から (because), が (but) | Taught (u13) | Same |
| Family words, counting people | Taught (u14) | Same |
| あげる, もらう, くれる | Missing | **u14c** |
| Counters, X は Y が Z | Taught (u15) | Same |
| だけ, しか〜ない, how often (一日に三回) | だけ in a note only | **u15c** |
| Verb groups (る verbs and う verbs) | Missing, and the て form note got it wrong | **u16v**, before the て form |
| て form, てください, ている | Taught (u16–u17) | Same |
| てもいい, てはいけない | Taught (u18) | Same |
| ない form, ないでください | Taught (u19) | Same |
| なければなりません, なくてもいいです | Missing | **u19c** |
| Dictionary form, た form, 前に, あとで | Taught (u20) | Same |
| たり〜たり | In examples only | **u20c** |
| Casual speech: だ, じゃない, plain questions | Partly (one dialogue) | **u20d** |
| ほしい, たい, に行く, つもり | Taught (u21) | Same |
| でしょう | Missing | **u21c** |
| より, ほう, いちばん | Taught (u22) | Same |
| ほうがいい | Missing | **u22c** |
| て to join, adjective て | Taught (u23a) | Same |
| てから, ながら | Missing | **u23c** |
| とき, そして, それから, でも | Taught (u23b) | Same |
| もう, まだ, 何か/何も, ぐらい | Taught (u24a) | Same |

## Errors found and fixed

- **u16a**: the て form note said verbs with an え or い sound before ます just drop ます.
  Every う verb has an い sound there too (書きます, 帰ります), so the rule gave 帰りて.
  Verb groups now have their own lesson, and the note follows it.
- **u07a, u24a**: どこも行きません should be どこにも行きません (likewise どこへも).
- **u18b**: テストの中で for "during the test" is unnatural. Now テストのとき.
- **u19a**: four drills used the frame "___ です" for plain negatives (食べないです).
  They are now full sentences.
- **u23b**: 昼ご飯を食べました。それから、散歩します mixed tenses. Now 散歩しました.
- **u09 dialogue**: "いいですね" as a reply to "it's by the window" was odd. Now "あ、よかった".
- **u05, u08, u16**: ten taught words (食べ物, 飲み物, 話, 毎月, 高校, 小学校, 中学校, 入る, 立つ, 休む)
  had no meaning anywhere, so tapping them showed nothing. They now have one.

## Vocabulary

Before: the course taught 152 words (they go into reviews and unit tests). 129 of
them are on the N5 list. Another 190 or so N5 words appeared in lessons only as words
to tap, and about 375 never appeared.

Now: every unit ends with a themed **Words** lesson, and the course teaches the N5 list
except words that are dated (tape recorder, record, ashtray, matches, film for cameras)
or duplicates of another spelling. Words are checked against JMdict by
`tools/dict-check.html` like the rest.

## Unit shape

Each unit now has: grammar lessons, a Words lesson, its kanji, a short **reading**
passage with questions (in the Words lesson), the dialogue (listening), and the unit test.
The unit screen lists these sections, and **Course → Syllabus** shows every N5 grammar
point with where it is taught.
