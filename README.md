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
  column. Each one opens with a drawn pictogram and a bold one-word keyword —
  MARKETS, CONGRESS, MINING, EBOLA, DRONE, CARBON and so on — because at
  300 pixels across the sentences turn to texture and only the keyword survives.
  No two of the twenty-seven pictograms are the same drawing, and the sentences
  are set in a darker grey than the captions so they still carry some weight at
  that size without competing with the bold keywords.
- **The footer**: the sources for the edition and a pointer to `stories.json`,
  which carries the page, publisher and stated date behind every dispatch.

## Layout checks

The build measures before it draws. Each list block is set at one size, and the
program fails if a block turns out taller than its row or wider than its column;
separately, every word drawn registers its own bounding box and the build fails
if any two of them overlap or run past the page margin. The 13 × 11 pictogram
registers a box of its own, each keyword must clear its place name by ten
pixels, and the number must clear its pictogram by four — a row with no keyword
or no pictogram fails the build rather than printing an empty slot. The build
also renders every pictogram into a 13 × 11 ink grid and stops if two of them
produce the same grid, so a repeated drawing cannot reach the page. Missing
glyphs fail the
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
zone. That is why the Beijing entry survives a page that carries a 25 November
"updated" line: the launch went up at 7:18 p.m. on 24 November in New York, which
is already the 25th in Beijing, and the page was published on the 24th. It is
also why the Canberra entry is now a leaders' meeting held there on the 24th
rather than a treaty signed there on the 25th.

Three dispatches from an earlier draft were dropped because no page dated 24
November 2026 could be cited for them — Paris (Le Havre port authority inquiry),
Jakarta (treason charge against a former police chief) and Kanton (the Kiribati
evacuation, published 23 November) — so the edition carries thirty.

## Sources

CNBC, Reuters and AP (via Yahoo News Canada and The Globe and Mail), The Guardian
(via AOL), Anadolu, Ukrinform, UN News, Space.com, USNI News, AFP (via EWN),
AsiaOne, The Star, Outlook India, Daily Times, Yeni Safak, Dabanga Sudan, Benin
Web TV, The Fiji Sun, Jordan News, The News, Valor International, Connected To
India, Aerospace Global News, the Government of Ontario's newsroom and
Singapore's Ministry of Foreign Affairs. Full URLs are in `stories.json`.

## Run it

```sh
node main.ts            # writes /output/entry.png
MAKEFUN_OUTPUT_DIR=out node main.ts   # or somewhere writable
```

Node 22, standard library only. Two runs write byte-identical files. The image is
1024 × 1024, 8-bit RGB, and well under the 1 MiB cap.

## Licence

MIT, see `LICENSE`.
