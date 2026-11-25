# 24 November 2026 — one page

A single 1024 × 1024 PNG that sets out what happened on Tuesday 24 November
2026: **thirty dispatches from six inhabited continents**, twelve of them
illustrated cards with a drawn scene and a headline, the other eighteen in a
compact list of briefs. Every dispatch carries a numbered mark on the world map.

Everything in the image is drawn by `main.ts` with arithmetic — a stroke alphabet
for the lettering, flat polygons for the pictures, a coarse land table for the
map, and a hand-written PNG encoder. No font files, no images, no network, no
randomness.

## What is on the page

- **The date band**: a full-width ink bar under the masthead that sets
  `TUESDAY 24 NOVEMBER 2026` at 26 pixels — the largest type on the sheet, so
  the day still reads when the image is looked at three hundred pixels across.
- **The map**: a ribbon of land one latitude band deep, 72°N to 48°S, drawn as a
  halftone of one dot per degree. Each dispatch is an eleven-pixel square in its
  region's colour — AMERICAS, EUROPE, AFRICA, MIDDLE EAST, ASIA, OCEANIA, keyed
  in the masthead — carrying the same number the card or brief shows.
- **Twelve cards**, four to a row: the Strait of Hormuz, Riyadh, Villavicencio,
  Washington, Tennessee, Brasilia, Wolfsburg, Ituri, Khan Younis, Baghdad,
  Jiuquan and Canberra. Each has a thin band in its beat's colour (conflict,
  politics, economy, health and science, climate and energy, keyed beside the
  section heading), the number it wears on the map, its place, its keyword, a
  drawn scene tied to that event — tankers alight, a tower cut open, a ballot and
  a seat count, a chamber and a tally, a factory gate, a ward tent, a drone over
  tents, derricks and a flare, a rocket on its pad, a pipe into the seabed — a
  headline set at 24 pixels, and a deck of one or two lines.
- **Also today**: eighteen briefs, six to a row. Each opens with its number and
  its own pictogram, then a keyword at 16 pixels and the sentence at 11. No two
  of the eighteen pictograms are the same drawing.
- **The footer**: the sources for the edition and a pointer to `stories.json`,
  which carries the page, publisher and stated date behind every dispatch.

## Layout checks

The build measures before it draws, and stops if the page does not fit.

- Cards: every headline is set at 24 pixels with no shrinking, and the build
  fails if one needs a third line or a line wider than its card. Every deck is
  held to two lines — except the Jiuquan deck, which is the wording the editor
  dictated and is therefore allowed four rather than cut — and every card's
  content must end above its own bottom edge.
- Briefs: each sentence is set at 11 pixels and each keyword at 16, with the
  keyword's box required to clear the number and pictogram beside it. The briefs
  are typeset first and the cards take the room that is left, so the list cannot
  push the cards off the page or run into the footer.
- Everything: every word registers its own bounding box, and the build fails if
  two boxes overlap or a box crosses the page margin. The pictograms register
  boxes of their own and are rendered into a 13 × 11 ink grid — the build stops
  if two of them produce the same grid, so a repeated drawing cannot reach the
  page. Missing glyphs fail the build rather than printing a blank.

## Sourcing rule

Every dispatch was read on a page dated 24 November 2026, and the copy keeps the
wording and figures of that page. Claims that are disputed or one-sided are
attributed in the text ("the Guard navy said", "the SIHA Network said", "Jordan
News:") rather than asserted, and a figure is credited to whoever gave it rather
than to a body that merely repeated it. Card decks are shorter than the pages
they come from, so a deck keeps the attribution and the figure that carry the
story; where it drops a qualifier — "at least" before a casualty toll, "the UN
agency said" — `stories.json` records the page's fuller wording beside it.
`stories.json` lists, for each printed dispatch, the page headline, the exact
page read, its publisher and the date that page states.

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
1024 × 1024, 8-bit RGB, and under 110 kB — well inside the 1 MiB cap.

## Licence

MIT, see `LICENSE`.
