# Privacy Policy for Lichess Arrow Colors

Last updated: 22 September 2026

Lichess Arrow Colors is a browser extension that recolours the engine
suggestion arrows on lichess.org analysis boards. This policy explains what
the extension does with data. In short: it collects nothing.

## Data the extension collects

None. The extension does not collect, record, or transmit any personal
information, browsing history, page content, chess games, or usage data. It
has no analytics, no telemetry, no crash reporting, and no accounts.

## Data the extension stores

The extension stores only its own settings: the arrow colours, arrow width,
outline, opacity, how much of the engine's best line to draw, and the
colouring mode you choose on the options page.

These settings are saved with the browser's extension storage
(`chrome.storage.sync`). They stay on your device. If you are signed in to
Chrome with sync turned on, Chrome may copy these settings to your other
signed-in devices through your Google account, in the same way it syncs your
other extension settings. The extension's author never receives them.

No setting contains personal information. Nothing about who you are, which
games you look at, or what positions you analyse is stored.

## Network activity

The extension makes no network requests of its own. It runs only on pages
under `https://lichess.org/` and works entirely within the page, reading the
arrows lichess has already drawn and changing their colours. It does not
contact the author's servers, lichess's servers, or any third party.

## Permissions

- **storage**: used to save your settings, as described above.
- **Host access to `https://lichess.org/`**: needed to read and restyle the
  engine arrows on lichess analysis pages. The extension does not run on any
  other site.

## Third parties

No data is shared with, sold to, or received from any third party. The
extension contains no third-party code that phones home and loads no remote
code.

## Children

The extension collects no data from anyone, including children.

## Changes to this policy

If the extension ever starts handling data differently, this document will
be updated and the "Last updated" date changed. The current version is always
available at:

https://github.com/aryavolkan/lichess-arrow-colors/blob/main/PRIVACY.md

## Contact

Questions about this policy can be raised by opening an issue at
https://github.com/aryavolkan/lichess-arrow-colors/issues.
