# Lichess Arrow Colors

A small Chrome extension (Manifest V3) that colour-codes the engine suggestion
arrows on [lichess.org](https://lichess.org), so you can tell the best line
from the alternatives at a glance.

Lichess draws the best line in pale blue and every other multi-PV line in the
same pale grey, so with 3 to 5 lines enabled you cannot tell which grey arrow
is second best. This extension fixes that. Arrow widths are left alone, since
lichess already thins arrows for lines that are much worse than the best one.

## Two colouring modes

**By how good the move is (default).** Each arrow is shaded on a green to red
gradient by how much its line gives up against the engine's best line. The
measure is lichess's own winning-chances curve, taken from the mover's point of
view, so the same eval gap shades the same way for both colours and mate scores
rank above any centipawn score.

By default the gradient is stretched across the moves on the board, so the best
move is green and the weakest arrow shown is red whatever the gap between them.
This is what makes a forced mate stand out from a merely winning alternative,
since both sit near the flat end of the winning-chances curve. To stop a
position where every move is equal from being blown up into a full green to red
spread, the stretch has a floor: differences smaller than 0.05 winning chances
leave every arrow green.

Turning the stretch off puts colour on a fixed scale instead, where an arrow
only reddens when the line is clearly worse than the best one.

**By engine line rank.** The older fixed palette, one colour per multi-PV slot:

| Rank | Default colour |
|------|----------------|
| 1 (best line) | green `#22c55e` |
| 2 | yellow `#eab308` |
| 3 | orange `#f97316` |
| 4 | red `#ef4444` |
| 5 and below | grey `#9ca3af` |

Pick a mode on the options page. Rank colours are editable there; the gradient
is fixed.

## Outlines

Arrows are outlined in black by default, which keeps them legible over pieces
and over both light and dark squares. The outline follows the arrowhead as well
as the shaft, and its colour and thickness are adjustable. Turn it off on the
options page if you prefer lichess's plain arrows.

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
  `cgHash` attribute containing origin square, destination square, brush name
  and line width. The engine's best line uses the `paleBlue` brush, the other
  lines use `paleGrey`.
- The engine panel lists lines in rank order, each row carrying its first move
  in `data-uci` and its evaluation in a `strong` element. Evaluations are shown
  from white's point of view, so they are flipped when black is to move.
- The content script matches each arrow's move to a row, works out the colour
  for that line, and swaps the arrow's stroke and arrowhead marker. A
  `MutationObserver` re-runs this whenever the board or the engine panel
  changes.
- When a row's evaluation is not shown (lichess hides it with a single engine
  line), the arrow's line width is used instead, since lichess derives that
  width from the same quantity.
- The outline is a wider copy of the arrow drawn underneath it. Arrowhead
  markers scale with stroke width, so the wider copy gets a bigger head for
  free; its anchor point is shifted so the outline is as thick past the tip as
  it is along the sides.
- Arrows are faded through their group rather than per line. Fading each line
  on its own would let the outline show through the arrow body and muddy the
  colour.
- Threat-mode arrows (red), hand-drawn arrows and variation arrows are not
  touched.

## Development

```bash
npm test          # unit tests for the pure ranking logic (node --test)
npm run icons     # regenerate icons/*.png
```

`src/logic.js` is dependency-free and runs both in the browser and under Node.
`src/content.js` holds the DOM glue. Nothing needs building.
