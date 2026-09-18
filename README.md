# Lichess Arrow Colors

A small Chrome extension (Manifest V3) that colour-codes the engine suggestion
arrows on [lichess.org](https://lichess.org) by rank, so you can tell the best
line from the alternatives at a glance.

| Rank | Default colour |
|------|----------------|
| 1 (best line) | green `#22c55e` |
| 2 | yellow `#eab308` |
| 3 | orange `#f97316` |
| 4 | red `#ef4444` |
| 5 and below | grey `#9ca3af` |

Lichess draws the best line in pale blue and every other multi-PV line in the
same pale grey, so with 3 to 5 lines enabled you cannot tell which grey arrow
is second best. This extension fixes that. Arrow widths are left alone, since
lichess already thins arrows for lines that are much worse than the best one.

## Install

1. Clone or download this folder.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. Open any lichess analysis board, turn the engine on, and set
   **Multiple lines** to 2 or more in the engine settings (gear icon).

Colours and opacity can be changed from the extension's options page
(right-click the extension icon, then **Options**). Changes apply live.

## How it works

- Lichess's board library (chessground) tags every arrow group with a
  `cgHash` attribute containing origin square, destination square and brush
  name. The engine's best line uses the `paleBlue` brush, the other lines use
  `paleGrey`.
- The engine panel lists lines in rank order, each row carrying its first move
  in `data-uci`.
- The content script matches each arrow's move to a row, picks the colour for
  that rank, and swaps the arrow's stroke and arrowhead marker. A
  `MutationObserver` re-runs this whenever the board or the engine panel
  changes.
- Threat-mode arrows (red), hand-drawn arrows and variation arrows are not
  touched.

## Development

```bash
npm test          # unit tests for the pure ranking logic (node --test)
npm run icons     # regenerate icons/*.png
```

`src/logic.js` is dependency-free and runs both in the browser and under Node.
`src/content.js` holds the DOM glue. Nothing needs building.
