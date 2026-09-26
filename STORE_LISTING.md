# Chrome Web Store listing

Everything the submission form asks for. The package to upload is
`dist/lichess-arrow-colors-1.11.0.zip`, also attached to the GitHub release.

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

- Draws the rest of the engine's best line, which lichess leaves off the board
  entirely: lichess draws only the first move of each line. The extra moves are
  drawn at the same width and outlined the same way as lichess's own, in a
  darker shade of the same green and finely striped on the diagonal, head and
  all, so you can always tell them apart from the arrows lichess itself
  draws. Every move of the line is numbered with its place in it, the move
  lichess draws being 1, and a move that is already on the board is numbered
  where it stands rather than drawn over. They are drawn at four fifths of a
  regular arrow's opacity, so the move you actually have to play stays the
  strongest thing on the board; that is adjustable, from a tenth of a regular
  arrow up to the full strength of one. Four moves deep by default, adjustable
  up to eight, or off.
- Follows the line you point at. Hover any line in the engine panel and its
  moves are the ones drawn and numbered on the board, in that line's own
  colour, so you can read a line off the panel and see it played out without
  clicking through it.
- Keyboard shortcuts. The keys 1 to 5 put that engine line on the board on
  its own, just as pointing at it does, and Space plays the picked line's
  first move exactly as a click on the line would. Press the same number
  again, or Escape, to let it go. They can be turned off on the options page.
- Draws every arrow at the same width. Lichess thins the weaker ones, but the
  colour already says that, so the widths only added noise.
- Outlines the arrows so they stay readable over pieces and over light and dark
  squares.

Everything is adjustable on the options page: the colours, the outline, the
arrow width, the opacity, how much of the best line is drawn and how strongly,
whether the keyboard shortcuts are on, and whether the scale stretches per
position. There is also a second mode that colours arrows by their rank in the
engine list instead, with a fixed palette you can edit.

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

Required. The Web Store rejected 1.5.0 (violation "Purple Nickel", User Data
Privacy) because the privacy policy field pointed at the repository, and
Google does not accept an owner site, README, or repo front page as a policy.
The link has to open a page that is a privacy policy and nothing else.

Paste exactly this URL into the **Privacy policy** field on the Privacy tab
of the developer dashboard:

```
https://github.com/aryavolkan/lichess-arrow-colors/blob/main/PRIVACY.md
```

It leads straight to `PRIVACY.md`, a standalone policy stating that the
extension collects nothing, stores only its settings via `chrome.storage.sync`,
and makes no network requests. Keep the "I do not collect or use user data"
answer and the three certification boxes as they are; the policy backs them
up rather than contradicting them.

## Screenshots

Ready to upload, in `store/screenshots/`:

| File | Size | Shows |
|------|------|-------|
| `arrows-spread-640x400.png` | 640x400 | Moves of clearly different quality, so the arrows run green to red |
| `arrows-equal-640x400.png` | 640x400 | A position where every move is about equal, so nothing turns red |
| `arrows-spread-1280x800.png` | 1280x800 | The same spread, with more of the page |
| `arrows-equal-1280x800.png` | 1280x800 | The same equal position, with more of the page |

The 640x400 pair is better framed; the board fills the picture. Upload one pair
or the other, not a mix of sizes.

Regenerate them with:

```bash
node scripts/shoot.js                      # 1280x800
node scripts/shoot.js --width 640 --height 400
```

That script launches Chrome, opens a real lichess analysis board, waits for the
engine, and captures the page. Chrome 153 refuses to load an unpacked extension
from the command line, so the script runs `src/logic.js` and `src/content.js` in
the page instead. It is the same code the extension ships, with the same default
settings, so the picture matches what an installed copy draws. The script prints
which path it took.
