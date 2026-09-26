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
see where the best line is going and not just how it starts.

Every move of the line is numbered, lichess's own arrow included: it is move
1, the one after it 2, then 3, and so on. Numbering the first move as well is
what makes the rest read as a line rather than as a set of extras starting at
2, and its numeral is drawn in its own brighter colour, so the number says
which move it belongs to as plainly as the arrow does. It appears only once
there is a move after it to number; on a board where the line is not drawn
past its first move, a lone 1 would say nothing.

The number is a small disc set beside the arrow, just behind its head and
always on the same side of the way it points. Beside rather than on it keeps
the arrow itself clear, and behind the head rather than on the destination
square keeps two moves arriving at the same square from different directions
from stacking their numbers on top of each other.

The arrows are as wide as any other, outline and arrowhead included, and drawn
at four fifths of a regular arrow's opacity, which keeps the move you actually
have to play the strongest thing on the board without making the rest of the
line something you have to look for. The stripes and the darker shade already
say whose arrows these are, so there is nothing a thinner line would add.

How strongly they are drawn has its own slider on the options page, from a
tenth of a regular arrow up to the full strength of one. The numbers themselves are drawn solid, and
over every arrow and every piece on the board, since a number you cannot read
is not worth drawing: a faded one takes on whatever it happens to lie over,
and one buried under a crossing arrow or a piece is not there at all.

Both sides' moves are drawn, since a line only makes sense with the replies in
it. Four moves past the first are drawn by default, numbered 2 to 5; the
slider on the options page goes up to eight, and zero turns the whole thing
off.

Point at any line in the engine panel and the board follows it. Lichess
already clears the other arrows and draws the line you are pointing at on its
own; the moves after it are drawn and numbered the same way, so you can read
a line off the panel and see it on the board without playing it out. The line
keeps its own colour while you do, so a losing line is still red as you walk
through it. Move the pointer away and the board goes back to all five.

These arrows are finely striped, since they are the one thing on the board
lichess did not put there: a solid arrow is always a move an engine line
starts with, and a striped one is always a move further down the best line.
The stripes are cut on the diagonal, which reads as deliberate at a glance
where a square cut looks like an arrow that failed to draw. The arrowhead is
striped on the same rhythm and the same lean, so the whole arrow reads as cut
from one striped material, and it stays square to the arrow so the direction
still reads.

A move whose arrow is already on the board is not drawn twice. So a line that
shuffles a piece back and forth keeps only its first, brightest arrow, and a
continuation that happens to also be another line's first move is left in that
line's own colour rather than being drawn over. It still carries its number,
though, beside the arrow that is there: the numbers run 1, 2, 3 without a hole
in them whether or not the extension had to draw the arrow itself, and a move
the line plays twice is numbered twice, the second numeral sitting a disc
further back along the shaft.

## Keyboard shortcuts

Pointing at a line needs the mouse. The keys **1** to **5** do the same thing
from the keyboard: press the number of an engine line and the board shows that
line on its own, exactly as it does under the pointer, first move solid and
the moves after it striped and numbered, in the line's own colour. The row is
marked in the panel. Press the same number again, or **Escape**, to let it go,
and the board goes back to all its arrows.

**Space** plays the picked line's first move, through the same code lichess
runs when a line is clicked, so the move lands in the game exactly as a click
would put it. With no line picked, Space is left to lichess, where it plays
the best move as it always has. A line lichess draws no arrow for, because it
is much worse than the best, gets its arrow drawn when picked, so any line the
panel lists can be seen and played.

Moving the pointer onto the panel hands the board back to lichess's own hover,
and stepping to another position lets the pick go. Keys typed into a field, or
pressed with a modifier held, are not touched. The shortcuts can be turned off
on the options page.

## The played move

Where the game branches, at a mistake in a game with computer analysis or
where you have tried another move yourself, lichess marks the move that was
actually played with a faint white arrow under the pieces, and a one-square
move all but disappears under the piece making it.

Where the engine prefers another move, the extension draws the played move
solid instead: a white arrow for White's move and a black one for Black's,
over every engine arrow, and outlined in the other colour
so a black arrow still shows on a dark square. Lichess's faint arrow goes. If
the played move is one of the engine's other lines, its engine arrow gives way
to the played one too, so a white or black arrow always means the move that
was played; how good it was is still in the panel.

Where the engine agrees with the move that was played, its green arrow already
says so and nothing is added. Positions where the game does not branch, and
the other moves of a branch, are left as lichess draws them. It can be turned
off on the options page.

## Arrows behind the pieces

Lichess draws its arrows over the pieces, which buries the piece an arrow
starts from and any piece it crosses. Every arrow is drawn behind the pieces
instead, the engine's, the extension's and your own hand-drawn ones alike,
still over the squares and their highlights. An arrow shows through wherever a
piece does not cover it. The numbers on the best line stay over the pieces,
where they can be read. Switch it off on the options page to have the arrows
back on top.

## Overlapping arrows

Arrows are drawn longest first, so where two cross, the shorter one lies on
top. A long arrow still reads from the length of shaft either side of the
crossing; a one-square arrow buried under it does not.

## The depth readout

Lichess starts every position's search again from depth 1, even when you have
just played a move from one of the engine's lines and the engine was already
looking down that line. Stockfish keeps what it found in its hash, but with
five lines on, that got the new search to the same depth in only about two
thirds of the time it took from nothing, in a test with Stockfish 19, so for
most of the search the readout sits well below where it was.

The line was searched, though. Every line of a multi-line search is searched
to the depth shown, so the position one move into a line has been looked at
one less deep, two moves in two less, and so on. After a move from a line, the
readout shows that depth instead, until this position's own search gets there,
and then it is lichess's own again. Keep playing the engine's moves and the
depth goes down one a move rather than back to zero.

While it shows a carried depth the readout has a dotted underline, and
hovering it says both depths: how deep the line that led here was searched,
and how far this position's own search has got. The lines in the panel and
the arrows on the board are still this position's own search, so until it
catches up they can change as it goes deeper. Threat mode and cloud evals are
left as lichess shows them. It can be turned off on the options page.

## Install

1. Clone or download this folder.
2. Open `chrome://extensions`, enable **Developer mode**.
3. Click **Load unpacked** and pick this folder.
4. Open any lichess analysis board, turn the engine on, and set
   **Multiple lines** to 2 or more in the engine settings (gear icon).

Colours and opacity can be changed from the extension's options page
(right-click the extension icon, then **Options**). Changes apply live.

The extension collects no data. See [PRIVACY.md](PRIVACY.md).

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
- Lichess draws the line under the pointer as the *best* arrow, clearing the
  others, so which line to follow is readable off the board itself: the row
  whose first move carries the best brush. The extension watches for that
  rather than for the pointer, which means no hover state to keep in sync, no
  listener to tear down, and the right behaviour whenever something else makes
  lichess single a line out. It falls back to the first row when no row owns
  the arrow.
- A line picked with a digit key is not put through lichess's hover. Lichess
  rechecks which row the pointer is really over after every redraw, several
  times a second while the engine runs, and a faked `mouseover` would be
  undone each time and the board would flicker. The extension instead hides
  the other engine arrows itself, draws the picked move when lichess has no
  arrow for it, and numbers the line as it does for the best line. Space plays
  the move by giving the row the `pointerdown` a click would raise, which is
  the event lichess's own click handler listens for.
- Lichess gives every move of a line its own `.pv-san` element carrying
  `fen|uci` for the board it previews on hover, so the whole line is
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
  on that very redraw, in its own callback and so before the browser paints.
  chessground redraws inside an animation frame, so a pass left for the next
  frame would always come one late, and that frame would show lichess's own
  pale arrows with none of the added ones: the arrows would flicker every time
  the engine moved them.
- The arrowhead is a `marker`, so its stripes are drawn in marker units, where
  one unit is the line's stroke width. That is the same measure the shaft's
  stripes are sized in, so a fixed 1.5 units to a stripe and its gap keeps the
  two in step at any width. The stripes run past the head on both sides and are
  clipped to its outline.
- A leaning band travels sideways as it crosses the head -- 25 degrees over a
  head four units tall carries it almost two units along -- so the bands have
  to be generated well outside the head on both sides: one that starts past its
  point still crosses it lower down. Generating only the bands that start
  within the head left its back corner and its point bare, and the head read as
  a chevron rather than an arrow. The phase is kept in whole periods from the
  back edge, so the first gap still falls where the shaft's last stripe ends.
- A striped head means its outline marker is drawn unfilled: the outline is
  wanted, but a filled black head underneath would show through the stripes'
  gaps instead of the board. That marker is otherwise identical to the filled
  one lichess's own arrows use, now that both are drawn at the same width, so
  the marker's id carries which of the two it is.
- The numerals are drawn as their own groups rather than inside the arrows',
  because opacity on a group applies to everything in it and both the added
  arrows and lichess's own are deliberately faded, and in an svg of their own
  laid over lichess's arrow layer, so they can sit over the pieces while the
  arrows are behind them and over every arrow either way.
- chessground stacks the pieces at `z-index` 2 and its arrow layer at 2 after
  them, which is what puts lichess's arrows on top, and the layer it draws its
  own under-the-pieces arrows in at 1. Behind the pieces, the arrow layer and
  the played move's drop to 1 by an inline `z-index`, which is all it takes to
  put them back. The numbers' layer sits at 3, over the pieces and under the
  layer lichess puts its annotation badges in, at 4.
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
- An arrow drawn in several pieces paints each piece whole -- its outline, then
  its body -- before starting the next, rather than laying every outline down
  first. It matters where the shaft meets the head: the shear slides the last
  stripe along the arrow by half a width, so it overshoots the head's back edge
  on one side, and with the outlines all underneath, that overshooting stripe
  painted over the head's own outline and bit a notch out of its back corner.
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
- Every move in lichess's move list carries a `p` attribute, its path through
  the move tree: two characters a move, scalachess's `UciCharPair`, one for
  each square counted from a1 and shifted up to `#`, a promotion's second
  character counting on past the 64 squares to name the file and the piece.
  The moves one step on from the current one are where the tree goes next, so
  the list alone says whether it branches here and which move it goes on with,
  which is the first. Castling is king-takes-rook there, as it is in the
  engine panel and on lichess's arrows, so the three compare directly.
- Lichess's stylesheet draws the whole engine-arrow layer at 60% opacity, so
  nothing inside it can come out solid. The played move is drawn in an svg of
  its own, laid exactly over that layer and stacked just above it. chessground
  does not know about it and leaves it alone when it redraws.
- Lichess's arrow for the played move lives in a separate layer under the
  pieces, and is hidden with `visibility`, which chessground never sets.
- Where the tree branches, lichess wraps the lines of the engine arrow for the
  move the branch goes on with in a group of their own. Outlines are put in
  whatever group holds the line, not the arrow's outer one.
- Threat-mode arrows (red), hand-drawn arrows and variation arrows other than
  the played move are not touched.
- Lichess keeps an eval on each node of its move tree and fills in only the
  node being searched, so a move played from a line lands on a node with
  none, and moving to it stops the search and sends Stockfish a new `go`,
  which counts depth from 1. The extension files, for each position the
  panel's lines go through, the depth shown less the moves into the line, and
  keeps the deeper figure when it sees one. Positions are filed by board and
  side to move, which is what a line's `data-board` and the panel's
  `data-fen` both give, so a transposition finds its depth too.
- The readout is the first text in the engine box's `.info`, after the "go
  deeper" button when there is one. Lichess writes it in the page's language,
  so the carried depth is written into lichess's own words for it, and while
  lichess shows "Calculating moves" instead, into the last depth readout it
  showed. Lichess only rewrites the text when its own changes, so its text is
  kept to put back when the carried depth goes.
- The readout ends in a word joiner, which has no width, while it shows a
  carried depth. When lichess's search reaches that depth it writes the very
  words the carried readout says, and without the mark there would be no
  telling the two apart.
- The depth changes as text, which the page-wide observer does not watch:
  text changes all over the site, every clock tick among them. The engine box
  has an observer of its own for its text, which redoes only the readout.
- The panel's rows carry `data-uci` only when they show an eval of this
  position, and the readout says a depth only then too. Without one it says
  something else, such as how many MiB of the engine have loaded, whose
  numbers are not a depth, so it is only replaced there while the engine is
  searching and it has no number in it.

## Development

```bash
npm test          # unit tests for the pure ranking logic (node --test)
npm run icons     # regenerate icons/*.png
```

`src/logic.js` is dependency-free and runs both in the browser and under Node.
`src/content.js` holds the DOM glue. Nothing needs building.
