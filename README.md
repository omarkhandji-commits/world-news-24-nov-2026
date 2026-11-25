# 24 November 2026 — one page

A single 1024 × 1024 PNG that sets out what happened on Tuesday 24 November
2026: **twenty-four dispatches from six inhabited continents**, twelve of them
illustrated cards with a drawn scene and a headline, the other twelve in two
columns of one-sentence briefs. Every dispatch carries a numbered square on the
world map, and the numbers run 1 to 24 without a gap.

Everything in the image is drawn by `main.ts` with arithmetic — a stroke alphabet
for the lettering, flat polygons for the pictures, a coarse land table for the
map, and a hand-written PNG encoder. No font files, no images, no network, no
randomness.

## What is on the page

- **The date band**: a full-width ink bar under the masthead that sets
  `TUESDAY 24 NOVEMBER 2026` at 26 pixels — the largest type on the sheet, so
  the day still reads when the image is looked at three hundred pixels across.
- **The map**: 560 by 130 pixels, at close to the true proportions of a world
  map, land drawn as one square per degree. Each dispatch is a thirteen-pixel
  numbered square in its region's colour, joined to its place by a hairline when
  it has moved off it. Beside the map, a legend names the six regions in reading
  type and counts the dispatches in each; the counts add up to the twenty-four in
  the masthead and the build checks that they do.
- **Twelve cards**, four to a row: the Strait of Hormuz, Riyadh, Villavicencio,
  Washington, Tennessee, Brasilia, Wolfsburg, Ituri, Khan Younis, Baghdad,
  Jiuquan and Canberra. Each has a thin band in its beat's colour carrying its
  number, place and keyword, a drawn scene taking roughly a third of the card's
  height, and a headline set at 24 pixels. Each scene is four or five big shapes
  — tankers and a flame, a tower cut open under a drone, a burst between two
  blocks, a falling line, a ballot and four seats, a vote as two bars, a factory
  gate, a ward tent, tents and a burst, derricks and a flare, a rocket on its
  pad, a pipe into the seabed.
- **Also today**: twelve briefs in two columns of six. Each is a bold keyword and
  one sentence at 15 pixels, dark on the paper, never more than two lines long.
  The eighteen-item list of pictograms that stood here before is gone: at
  thumbnail size it could not be read.
- **The footer**: the publishers behind the edition and a pointer to
  `stories.json`, which carries the page, publisher and stated date behind every
  dispatch.

## Layout checks

The build measures before it draws, and stops if the page does not fit.

- Cards: every headline is set at 24 pixels with no shrinking, no word wider than
  the card, and no more than three lines; a sub-line, where one prints, is at
  least 13 pixels and one line, and only under a two-line headline. Every card's
  content must end above its own bottom edge.
- Briefs: measured first, from the foot of the page up, so the cards take the room
  that is left. Every sentence is set at 15 pixels, in at most two lines, with the
  keyword's box required to clear the sentence that follows it. The build fails if
  the list is not twelve items, if the cards are not twelve, or if the sheet is not
  twenty-four.
- Everything: every word registers its own bounding box — a headline registers
  one box for the block, since its lines are one piece of type — and the build
  fails if two boxes overlap or a box crosses the page margin. Missing glyphs fail
  the build rather than printing a blank.

## Sourcing rule

Every dispatch was read on a page dated 24 November 2026, and the copy keeps the
wording and figures of that page. Claims that are disputed or one-sided are
attributed in the text ("the Guard navy said", "Jordan News:", "the SIHA
Network said") rather than asserted, and a figure is credited to whoever gave it
rather than to a body that merely repeated it. A card at 24 pixels holds about
thirty characters across three lines, so a card prints the actor and the fact and
drops what will not fit; `stories.json` records, for each card, the figure or the
attribution the page carries and the card cannot. `stories.json` also lists, for
each printed dispatch, the page headline, the exact page read, its publisher and
the date that page states.

Six dispatches printed in an earlier draft — Toronto (Ontario's mining bill),
Riga (Latvia's president on the war's turning point), West Africa (gold refining
capacity), Seoul (Russian aircraft in the air-defence zone), Dhaka (Hasina's
return plan) and Suva (Pacific elders on COP31) — are no longer on the page.
Cutting the brief column from eighteen to twelve to reach a readable size is what
removed them; their pages are still cited under `held_back` in `stories.json`, so
nothing that was read has been lost from the record.

Every page was reopened and checked sentence by sentence against the copy, and
eight sources have been replaced or swapped since the first draft, each with its
reason: London (The Standard's page is dated 25 November, now Anadolu), Suva
(Post Courier returned HTTP 403, now The Fiji Sun), Moscow (the TRT page shows no
date, now Anadolu), Beijing (the CBS page is stamped 25 November, now Space.com,
which published on 24 November), Lagos (replacing Alamata, whose page said
Amnesty's findings were "published late on Monday", 23 November), Manila
(replacing a Taipei market report from an auto-generated site), Mexico City (the
Reporte Indigo page answers a plain request with 403, now Ontario's newsroom) and
Canberra (the Solomon Islands treaty was signed on Wednesday 25 November, so the
slot now carries the Singapore–Australia leaders' meeting held in Canberra on the
24th, from Singapore's foreign ministry).

A dispatch stands only if the event happened on 24 November 2026 in some time
zone. That is why the Jiuquan entry survives a page that carries a 25 November
"updated" line: the launch went up at 7:18 p.m. on 24 November in New York, which
is already the 25th in Beijing, and the page was published on the 24th. It is
also why the Canberra entry is a leaders' meeting held there on the 24th rather
than a treaty signed there on the 25th.

## Sources

CNBC, Reuters and Yahoo News Canada, the Associated Press (via The Globe and
Mail), The Guardian (via AOL), Valor International, Anadolu, UN News, Space.com,
USNI News, AFP (via EWN), The News, Daily Times, Dabanga Sudan, Jordan News,
Outlook India, AsiaOne, Aerospace Global News and The Star, with Singapore's
Ministry of Foreign Affairs.
Full URLs are in `stories.json`.

## Run it

```sh
node main.ts            # writes /output/entry.png
MAKEFUN_OUTPUT_DIR=out node main.ts   # or somewhere writable
```

Node 22, standard library only. Two runs write byte-identical files. The image is
1024 × 1024, 8-bit RGB, and under 90 kB — well inside the 1 MiB cap.

## Licence

MIT, see `LICENSE`.
