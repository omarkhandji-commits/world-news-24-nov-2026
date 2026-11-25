# 24 November 2026 — one page

A single 1024 × 1024 PNG that sets out what happened on Tuesday 24 November
2026: **thirty-three dispatches from six inhabited continents**, each pinned on a
world map by number, three of them led with their own drawn picture, the other
thirty in a compact three-column list.

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
- **Also today**: thirty more, from Washington to Honiara, in three columns.
- **The footer**: the sources read for the edition and a note that contested
  figures are credited to whoever gave them.

## Sourcing rule

Every dispatch was read on a page dated 24 November 2026, and the copy keeps the
wording and figures of that page. Claims that are disputed or one-sided are
attributed in the text ("the Guard navy said", "police said", "Amnesty said")
rather than asserted. Items that could not be dated to 24 November — and figures
that turned out to belong to other dates — were cut rather than carried over.

## Sources

AP, Reuters, Anadolu, CNBC, Bloomberg, Just Security, UN News, METI Singapore,
Focus Taiwan, Saudi Press Agency, The Sydney Morning Herald, PACNEWS, Sudan
Tribune, La Jornada, The Guardian.

## Run it

```sh
node main.ts            # writes /output/entry.png
MAKEFUN_OUTPUT_DIR=out node main.ts   # or somewhere writable
```

Node 22, standard library only. Two runs write byte-identical files. The image is
1024 × 1024, 8-bit RGB, and well under the 1 MiB cap.

## Licence

MIT, see `LICENSE`.
