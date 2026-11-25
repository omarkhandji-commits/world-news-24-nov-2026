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
  tankers ablaze, 1,144 children killed or hurt, 19.5 million Sudanese in crisis
  hunger, an 8.99% jump in Taipei's TAIEX.
- **The map**: land drawn from latitude bands, 64°N to 56°S, with a numbered
  vermilion pin and a leader line for each dispatch.
- **Three leads**: mines in the Strait of Hormuz, drone strikes on Khartoum, a car
  bomb in Villavicencio — each with a small drawn picture.
- **Also today**: thirty more, from Washington to Honiara, in three columns.
- **The footer**: the sources read for the edition and a note that disputed
  figures are credited to whoever gave them.

## Sources

All reporting read for this edition is dated 24 November 2026: AP, Reuters,
Anadolu, Democracy Now!, CNBC, Bloomberg, Nikkei Asia, The Japan Times, G1,
Euronews, The Rio Times, Xinhua, allAfrica, Al Jazeera, Taipei Times, Liberty
Times, Dawn, ABC News, RNZ, Amnesty International.

## Run it

```sh
node main.ts            # writes /output/entry.png
MAKEFUN_OUTPUT_DIR=out node main.ts   # or somewhere writable
```

Node 22, standard library only. Two runs write byte-identical files. The image is
1024 × 1024, 8-bit RGB, and well under the 1 MiB cap.

## Licence

MIT, see `LICENSE`.
