# Lichess Arrow Colors

A small Chrome extension (Manifest V3) that colour-codes the engine suggestion
arrows on [lichess.org](https://lichess.org), so you can tell the best line
from the alternatives at a glance.

![Engine arrows shaded green to red by how good each move is](store/screenshots/arrows-spread-1280x800.png)

Black to move. The engine's best move is green, and the arrows shade through
yellow and orange to red as the moves get worse. The striped green arrows are
the rest of the best line, which lichess does not draw at all.

Lichess draws the best line in pale blue and every other multi-PV line in the
same pale grey, so with 3 to 5 lines enabled you cannot tell which grey arrow
is second best. This extension fixes that.

Lichess also draws weaker moves as thinner arrows. Colour already says how good
a move is, so every arrow is drawn at the same width, and thinner than lichess's
own. There is a width slider on the options page, and you can switch the whole
thing off to get lichess's widths back.

When every move is about equally good, nothing turns red:

![Arrows all green in a position where every move is about equal](store/screenshots/arrows-equal-1280x800.png)

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
and over both light and dark squares. The outline is the same thickness the
whole way round, including the arrowhead, and adding it does not change the
size of the arrow itself. Its colour and thickness are adjustable. Turn it off on the
options page if you prefer lichess's plain arrows.

## The rest of the best line

Lichess draws one arrow per engine line, for its first move only. This draws
the moves after it as well, in a darker shade of the same green, so you can
see where the best line is going and not just how it starts. The arrows fade a
little as the line goes on, which keeps the move you actually have to play the
brightest thing on the board, and the deepest arrow lands on the same shade
whether you are showing one move of the line or eight.

Both sides' moves are drawn, since a line only makes sense with the replies in
it. Five moves past the first are drawn by default; the slider on the options
page goes up to eight, and zero turns the whole thing off.

These arrows are finely striped, since they are the one thing on the board
lichess did not put there: a solid arrow is always a move an engine line
starts with, and a striped one is always a move further down the best line.
The stripes are cut on the diagonal, which reads as deliberate at a glance
where a square cut looks like an arrow that failed to draw. The arrowhead
stays solid and square to the arrow, so the direction still reads.

A move whose arrow is already on the board is skipped. So a line that shuffles
a piece back and forth keeps only its first, brightest arrow, and a
continuation that happens to also be another line's first move is left in that
line's own colour rather than being drawn over.

## Overlapping arrows

Arrows are drawn longest first, so where two cross, the shorter one lies on
top. A long arrow still reads from the length of shaft either side of the
crossing; a one-square arrow buried under it does not.

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
- Lichess gives every move of a line its own `.pv-san` element carrying
  `fen|uci` for the board it previews on hover, so the whole best line is
  readable from the engine panel. The moves past the first are arrows the
  extension creates: lichess never draws them.
- Placing a new arrow needs the board's geometry, which the extension measures
  off an arrow lichess has already drawn rather than hardcoding chessground's
  numbers. That arrow's `cgHash` names its squares and its `x1`/`y1` say where
  the first of them sits, which also settles which way round the board is; the
  gap between the arrow's drawn length and the true distance between the two
  squares is the room chessground leaves for the arrowhead.
- chessground removes any shape group whose `cgHash` it does not recognise, so
  the added arrows go whenever it redraws the board. They are put back by the
  same pass that recolours everything else, which the `MutationObserver` runs
  on that very redraw.
- The colour is the best move's own, taken down in lightness: an `hsl()` from
  the gradient loses lightness directly, a hex colour from the rank palette
  has its channels dimmed. Both stay recognisably the same green.
- The added arrows are striped with a `stroke-dasharray` sized so that a whole
  number of stripes spans the shaft: about one stripe per arrow width, then
  stretched to fit exactly. A fixed dash would instead cut a stripe off
  partway wherever the arrowhead happened to fall, which reads as an arrow
  that failed to draw. The outline is cloned from the arrow and picks the
  stripes up with it, which leaves the gaps clear instead of showing a solid
  black bar through them.
- Each arrow is cut in two where the arrowhead's back edge falls, which
  chessground puts `refX` stroke widths back from the line's end. The shaft
  takes the stripes and the shear; the piece the head covers carries the
  marker. Both are cut square at the ends, since a round cap on the head's
  piece bulges out past the arrowhead's outline as a pair of dark ears.
- Dashes always cut square across a line, so the diagonal comes from shearing
  the shaft along its own direction, sliding each point sideways in proportion
  to how far off the arrow's axis it lies. Points on the axis stay put, and so
  does the distance off it, so the arrow keeps its place, its length and its
  width, and only the stripe ends lean over. It is written as a `matrix` and
  not as `rotate`/`skewX`/`rotate`: SVG's `skewX` shears about the origin, and
  composing it with rotations about the arrow's start still shears about a
  point the arrow's own distance away, which slides the whole shaft along
  itself by as much as two thirds of a square.
- Widths come from a per-line modifier in the same `cgHash`. The extension
  reads and stores lichess's original width, then draws every arrow at the
  chosen width. Widths are in chessground's unit, a 64th of a square.
- The outline is a wider copy of the arrow drawn underneath it, which gives the
  shaft an even edge. The arrowhead needs more care: chessground scales the head
  with the line's stroke width, so a wider copy would inflate the head rather
  than outline it, leaving its sides and back several times thicker than the
  shaft's edge. The outline instead draws the head at exactly the arrow's size
  and strokes it, half the stroke falling outside the edge, with round joins so
  even the sharp tip is offset by the same amount. The arrow's own size never
  changes.
- Arrows are faded through their group rather than per line. Fading each line
  on its own would let the outline show through the arrow body and muddy the
  colour.
- An SVG paints in document order, so the arrow lichess lists last covers the
  ones it crosses. The extension reorders the arrow groups longest first,
  leaving short arrows on top. chessground diffs its shapes by `cgHash` rather
  than by position, so moving the groups does not disturb it.
- Threat-mode arrows (red), hand-drawn arrows and variation arrows are not
  touched.

## Development

```bash
npm test          # unit tests for the pure ranking logic (node --test)
npm run icons     # regenerate icons/*.png
```

`src/logic.js` is dependency-free and runs both in the browser and under Node.
`src/content.js` holds the DOM glue. Nothing needs building.
