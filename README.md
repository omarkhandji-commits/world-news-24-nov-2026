# World News, 24 November 2026

An entry for make.fun's `news-image-20261124` bounty: one 1024×1024 image that sums up
Tuesday 24 November 2026.

`main.ts` draws the image from nothing — a small monoline stroke alphabet, flat geometry
and a hand-written PNG encoder — using only the Node 22 standard library. It reads no
files, opens no sockets and uses no randomness, so two runs write identical bytes.

## Run

    mkdir -p out && MAKEFUN_OUTPUT_DIR=out node main.ts

Writes `out/entry.png`: 1024×1024, 8-bit RGB PNG, about 64 KB.

## What the image says

Six dispatches, each with a drawn picture, a headline and the reported numbers:

- **Strait of Hormuz** — Iran's Revolutionary Guard navy said three tankers struck mines
  in the strait it closed in July; Washington widened sanctions on more than two dozen
  Iranian firms.
- **Zaporizhzhia** — a guided bomb hit an apartment block overnight, wounding more than
  40; UNICEF counts 1,144 Ukrainian children killed or injured in 2026.
- **Khartoum** — strikes hit the airport and a UN facility, killing at least four, as the
  army said it downed more drones; the power grid is near collapse.
- **New York** — the S&P 500 fell 0.5% to 7,201.09 and the Nasdaq 1.5% to 23,733.54; the
  Dow added 423 points to 50,018.70.
- **Singapore** — third-quarter growth of 6.1% beat forecasts; the 2026 forecast rose to
  about 6%.
- **Gaza** — Oxfam reported contamination across 99% of the territory; a strike on a
  police post in al-Mawasi killed three, medics said.

The numbers strip adds three more: 3 tankers ablaze (IRGC navy), 1,144 Ukrainian child
casualties (UNICEF), 41 civilians killed in Yemen in a day (Houthi officials), and 6.1%
growth in Singapore.

Every figure comes from reporting dated 24 November 2026: AP, Reuters, Anadolu,
Democracy Now! and CNBC.

## Licence

MIT — see [LICENSE](LICENSE).
