# 24 November 2026 — one page

A single 1024 × 1024 PNG that sets out what happened on Tuesday 24 November
2026: **thirty dispatches from six inhabited continents**, each pinned on a
world map by number, three of them led with their own drawn picture, the other
twenty-seven in a three-column list.

Everything in the image is drawn by `main.ts` with arithmetic — a stroke alphabet
for the lettering, flat polygons for the pictures, a coarse land table for the
map, and a hand-written PNG encoder. No font files, no images, no network, no
randomness.

## What is on the page

- **The day**: the date as a masthead, the standfirst, and four figures — three
  tankers mined in Hormuz, 259 House seats won by the Democrats, 23 people hurt
  by the Villavicencio car bomb, 6.1% growth in Singapore.
- **The map**: land drawn from latitude bands, 72°N to 56°S, with a numbered
  vermilion pin and a leader line for each dispatch.
- **Three leads**: mines in the Strait of Hormuz, a Houthi strike on a Riyadh
  tower, a car bomb in Villavicencio — each with a small drawn picture.
- **Also today**: twenty-seven more, from Washington to Kuala Lumpur, nine to a
  column.
- **The footer**: the sources for the edition and a pointer to `stories.json`,
  which carries the page, publisher and stated date behind every dispatch.

## Layout checks

The build measures before it draws. Each list block is set at one size, and the
program fails if a block turns out taller than its row or wider than its column;
separately, every word drawn registers its own bounding box and the build fails
if any two of them overlap or run past the page margin. Missing glyphs fail the
build too, rather than printing a blank. A block that wants a third line is
therefore a build error, not a smudge — the copy gets cut to fit.

## Sourcing rule

Every dispatch was read on a page dated 24 November 2026, and the copy keeps the
wording and figures of that page. Claims that are disputed or one-sided are
attributed in the text ("the Guard navy said", "Amnesty said", "the SIHA Network
said") rather than asserted, and a figure is credited to whoever gave it rather
than to a body that merely repeated it. `stories.json` lists, for each printed
dispatch, the headline, the exact page read, its publisher and the date that page
states.

Every page was reopened and checked sentence by sentence against the copy, and
five sources have been replaced or swapped since the first draft, each with its
reason: London (The Standard's page is dated 25 November, now Anadolu), Suva
(Post Courier returned HTTP 403, now The Fiji Sun), Moscow (the TRT page shows no
date, now Anadolu), Beijing (the CBS page is stamped 25 November, now Space.com,
which published on 24 November), Lagos (replacing Alamata, whose page said
Amnesty's findings were "published late on Monday", 23 November) and Manila
(replacing a Taipei market report from an auto-generated site).

A dispatch stands only if the event happened, or was first reported, on 24
November 2026 in some time zone. That is why the Beijing and Honiara entries
survive pages that carry a 25 November "updated" line: the launch and the treaty
signing both happened on 25 November in Beijing and Canberra, which is still 24
November in New York, and both pages were first published then.

Three dispatches from an earlier draft were dropped because no page dated 24
November 2026 could be cited for them — Paris (Le Havre port authority inquiry),
Jakarta (treason charge against a former police chief) and Kanton (the Kiribati
evacuation, published 23 November) — so the edition carries thirty.

## Sources

CNBC, Reuters and AP (via Yahoo News Canada, The Globe and Mail and The Spec),
The Guardian (via AOL), Anadolu, Ukrinform, UN News, Space.com, USNI News,
AFP (via EWN), AsiaOne, The Star, Outlook India, Daily Times, Yeni Safak,
Dabanga Sudan, Benin Web TV, The Fiji Sun, Jordan News, The News, Reporte
Indigo, Valor International, Connected To India and Aerospace Global News.
Full URLs are in `stories.json`.

## Run it

```sh
node main.ts            # writes /output/entry.png
MAKEFUN_OUTPUT_DIR=out node main.ts   # or somewhere writable
```

Node 22, standard library only. Two runs write byte-identical files. The image is
1024 × 1024, 8-bit RGB, and well under the 1 MiB cap.

## Licence

MIT, see `LICENSE`.
