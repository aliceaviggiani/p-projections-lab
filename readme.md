# Map Projections Lab

An interactive data visualization exploring how map projections distort the shape and area of a real geographic object — Brazil's country boundaries — depending on where that shape sits on the coordinate grid.

**[→ View the live demo](https://aliceaviggiani.github.io/p-projections-lab/)**

![Map projections lab preview](images/preview.png)

## Overview

What starts as a trivial geometrical issue — representing a spherical object on a two-dimensional surface — reveals a more conceptual and political statement. This project addresses the fundamental representation challenge in cartography, while also providing a tool for questioning historical mapping conventions and how a geometrical decision can imply an international imbalance.

Every projection trades off between preserving distance, area, shape, or some combination of them. By letting users drag the same shape — Brazil's boundaries — across four different projections simultaneously, the lab makes these usually abstract distortions tangible and directly comparable.

## Projections

Four major projections were chosen to represent the main distortion models:

| Projection | Type | Trade-off |
|---|---|---|
| **Mercator** | Cylindrical | Preserves shape and angles; severely distorts area, especially near the poles |
| **Gall-Peters** | Cylindrical, equal-area | Preserves accurate area ratios; distorts shape |
| **Albers** | Conic | Balances area, direction, and distance; optimized for mid-latitude regions (calibrated with parallels at -5° and -35° for Brazil's extent) |
| **Winkel Tripel** | Compromise | Minimizes overall distortion across shape, area, and distance |

The Brazil shape is deliberately detached from the rest of the globe, so attention stays on the geometric transformation rather than spatial context. Each projection also renders the globe's outline, so the limits of each projection stay visible while all four maintain identical relative position and scale for direct comparison.

## Interactions

- **Drag to shift coordinates** — grab any shape and move it vertically (latitude) or horizontally (longitude) to see it redraw in real time according to each projection's underlying math. Dynamic latitude/longitude labels follow the cursor to reinforce what's being manipulated.
- **Overlaid outlines with multiply blend mode** — all four projections render in the same frame using an outline style and a multiply blend, so differences in shape and position become visible through color interaction rather than side-by-side panels.

## Built with

- [D3.js](https://d3js.org/) — core rendering and geographic math
- [d3-geo-projection](https://github.com/d3/d3-geo-projection) and [d3-geo-polygon](https://github.com/d3/d3-geo-polygon) — extended projection methods (e.g. Winkel Tripel)
- CSS Grid — 24-column layout system for precise, responsive positioning
- Vanilla JS drag handling — custom coordinate-offset logic (no external drag library)

## Project structure

```
├── index.html          # page markup
├── script-5.js         # projection setup, rendering, and drag logic
├── style-4.css         # layout and visual styling
├── style-fonts.css     # custom font-face declarations
├── data/                # Brazil boundaries (GeoJSON)
├── fonts/               # custom typeface files
└── images/              # cursor asset and reference screenshots
```

## Technical notes

- The dataset is the geometry itself: a `.geojson` file containing Brazil's country boundaries, used both as the shape drawn and as the source of coordinates that get offset on drag.
- A major challenge was managing coordinate transforms in real time — shapes initially appeared to "jump" when dragged because offsets weren't calculated against the original geometry. This was fixed by storing the base coordinates and applying cumulative offsets to them, rather than mutating already-transformed values.
- Combining the drag interaction with a responsive layout was solved by overlaying all four projections in a single shared frame, instead of isolating each in its own block as in an earlier version.
- A custom 64×64px SVG crosshair cursor reinforces the coordinate-based interaction model.

## User research

Two rounds of feedback shaped the design: an earlier, darker version and the current one. A fifth projection — significantly more divergent in shape and behavior than the other four — was dropped after testing showed it disrupted clarity of comparison. Color-coding each projection to match its legend also came directly from user observations, to make the visualization easier to read.

## Next steps

- Additional shapes with distinctive geometries (e.g. Greenland, Chile, China) for further comparison
- A toggle for each projection's coordinate grid, to expose the underlying mathematical logic
- The Dymaxion projection (Buckminster Fuller) as an alternative, flattened take on the globe

## Background

This project was built as the final project for *616 Programming Interactive Viz* (December 2025). The full writeup — including design iterations and challenges — is available in [`alcieviggiani-finalproject-report-1.pdf`](./alcieviggiani-finalproject-report-1.pdf), and the original scope in [`aliceviggiani-finalproject-proposal-1.pdf`](./aliceviggiani-finalproject-proposal-1.pdf).

## Author

**Alice Viggiani**
[Portfolio](https://aliceviggiani.com)
