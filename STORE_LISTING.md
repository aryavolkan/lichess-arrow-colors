# Chrome Web Store listing

Everything the submission form asks for. The package to upload is
`dist/lichess-arrow-colors-1.5.0.zip`, also attached to the GitHub release.

## Name

Lichess Arrow Colors

## Summary (132 characters max)

Shades lichess.org engine arrows green to red by how good each move is.

## Category

Sports (lichess is a chess site), or Productivity if Sports is rejected.

## Language

English (UK)

## Description

Lichess draws the engine's best line in pale blue and every other line in the
same pale grey. With three to five lines turned on, you cannot tell which grey
arrow is the second best move and which is the fifth.

This extension colours each arrow by how good the move is. The best move is
green, and arrows shade through yellow and orange to red as the move gets
worse. You can see the engine's opinion on the board without reading the list.

How the colour is worked out:

- It uses lichess's own winning-chances curve, the same one lichess uses to
  decide how to draw the arrows in the first place.
- It is measured from the point of view of whoever is to move, so the colours
  mean the same thing for white and for black.
- A forced mate ranks above any ordinary score.
- The scale stretches across the moves on the board, so the best move is green
  and the weakest arrow shown is red. When every move is about equally good,
  they all stay green rather than being spread out over differences that do not
  matter.

Other things it does:

- Draws every arrow at the same width. Lichess thins the weaker ones, but the
  colour already says that, so the widths only added noise.
- Outlines the arrows so they stay readable over pieces and over light and dark
  squares.

Everything is adjustable on the options page: the colours, the outline, the
arrow width, the opacity, and whether the scale stretches per position. There
is also a second mode that colours arrows by their rank in the engine list
instead, with a fixed palette you can edit.

Turn the extension off and lichess's own arrows come back exactly as they were.

This is not an official lichess product. It does not give you engine help in
games. It only restyles arrows that lichess already draws for you on the
analysis board.

## Permission justifications

**storage** — Saves your settings: the colours, arrow width, outline and
opacity. Nothing else is stored, and the settings never leave your browser
except through Chrome's own settings sync.

**Host permission, https://lichess.org/** — The extension has to read the
engine arrows lichess has drawn on the page and restyle them. It only runs on
lichess.org and does not touch any other site.

## Are you using remote code?

No. All code is in the package.

## Data usage

This extension does not collect or transmit any user data. Tick "I do not
collect or use user data" and the three certification boxes.

## Privacy policy

Not required, since no data is collected. If the form insists, the repository
README and this file serve as the statement: no data is collected, stored off
device, or shared.

## Screenshots (you need to add these)

The store wants at least one screenshot, either 1280x800 or 640x400. I could
not produce these because the browser pane I test in caps screenshots at 800
pixels wide. To take them:

1. Load the extension (see the README), open a lichess analysis board, and turn
   the engine on with three or more lines.
2. Pick a position where the moves differ in quality, so the colours spread out.
   `r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4` gives a
   clean green through red spread.
3. Capture the window at 1280x800.

Two or three shots work well: the board with arrows, a position where everything
is equal so the arrows stay green, and the options page.
