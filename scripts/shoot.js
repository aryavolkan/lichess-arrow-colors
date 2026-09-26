#!/usr/bin/env node
// Take Chrome Web Store screenshots of the extension running on a real
// lichess board. Launches Chrome, drives it over the DevTools protocol, and
// writes PNGs into store/screenshots/.
//
//   node scripts/shoot.js [--width 1280] [--height 800] [--board olive] [--pieces caliente]
//
// The board and pieces are lichess's olive and caliente rather than its
// default brown and cburnett, to match the screenshots taken on a live board.
// They are set through the same preference endpoints lichess's own settings
// menu posts to, and the script stops if a page comes up without them.
//
// Chrome 153 refuses --load-extension even with the guard feature switched
// off, so the script checks whether the packaged extension injected and, if it
// did not, runs src/logic.js and src/content.js in the page instead, with
// src/content.css added as a stylesheet. That is the same code the extension
// ships, with the same default settings, so the picture matches what an
// installed copy draws. The script says which path it took.

const { spawn } = require('node:child_process');
const fs = require('node:fs');
const path = require('node:path');
const os = require('node:os');

const CHROME = '/Applications/Google Chrome.app/Contents/MacOS/Google Chrome';
const ROOT = path.join(__dirname, '..');
const OUT = path.join(ROOT, 'store', 'screenshots');
const PORT = 9333;

const arg = (name, fallback) => {
  const i = process.argv.indexOf(`--${name}`);
  return i > -1 ? process.argv[i + 1] : fallback;
};
const WIDTH = Number(arg('width', 1280));
const HEIGHT = Number(arg('height', 800));
const BOARD = arg('board', 'olive');
const PIECES = arg('pieces', 'caliente');

const LINES = 5;

const SPREAD = 'r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4';

// A shot is a position, given as a FEN or as a game with the ply to stop at,
// and optionally keys to press once the extension has coloured the board and
// a selector that must then match before the picture is taken.
const SHOTS = [
  {
    name: 'arrows-spread',
    fen: SPREAD,
    note: 'moves differ a lot, so the colours spread green to red',
  },
  {
    name: 'arrows-equal',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    note: 'every move about equal, so nothing turns red',
  },
  {
    name: 'played-move',
    // The spread position again, reached as a game with the engine's choice
    // as a side line, so the tree branches after 4.Ng5 and 4...Nxe4, one of
    // the engine's weaker lines, is the move that was played.
    pgn: '1. e4 e5 2. Nf3 Nc6 3. Bc4 Nf6 4. Ng5 Nxe4 (4... d5)',
    ply: 7,
    expect: 'g[data-lac-played]',
    note: 'the move played, ...Nxe4, as a solid black arrow in place of its engine arrow',
  },
  {
    name: 'picked-line',
    fen: SPREAD,
    keys: ['3'],
    expect: '.pv_box .pv[data-lac-picked]',
    note: 'line 3 picked with its key, alone on the board in its own colour',
  },
];

const shotUrl = shot => shot.pgn
  ? `https://lichess.org/analysis/pgn/${encodeURIComponent(shot.pgn)}#${shot.ply}`
  : 'https://lichess.org/analysis/standard/' + shot.fen.replace(/ /g, '_');

const sleep = ms => new Promise(r => setTimeout(r, ms));

async function cdp(ws, method, params = {}, sessionId) {
  const id = cdp.next = (cdp.next || 0) + 1;
  const msg = JSON.stringify({ id, method, params, ...(sessionId ? { sessionId } : {}) });
  return new Promise((resolve, reject) => {
    const onMessage = ev => {
      const data = JSON.parse(ev.data);
      if (data.id !== id) return;
      ws.removeEventListener('message', onMessage);
      data.error ? reject(new Error(method + ': ' + data.error.message)) : resolve(data.result);
    };
    ws.addEventListener('message', onMessage);
    ws.send(msg);
  });
}

const evaluate = (ws, session, expression) =>
  cdp(ws, 'Runtime.evaluate', { expression, awaitPromise: true, returnByValue: true }, session)
    .then(r => (r.exceptionDetails ? Promise.reject(new Error(r.exceptionDetails.text)) : r.result.value));

// A key pressed as a keyboard would, so it reaches the page's own listeners.
async function press(ws, key) {
  const code = /^\d$/.test(key) ? `Digit${key}` : key;
  const vk = key.length === 1 ? key.toUpperCase().charCodeAt(0) : 0;
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyDown', key, code, text: key, windowsVirtualKeyCode: vk });
  await cdp(ws, 'Input.dispatchKeyEvent', { type: 'keyUp', key, code, windowsVirtualKeyCode: vk });
}

async function main() {
  fs.mkdirSync(OUT, { recursive: true });
  const profile = fs.mkdtempSync(path.join(os.tmpdir(), 'lac-chrome-'));

  const chrome = spawn(CHROME, [
    '--headless=new',
    `--remote-debugging-port=${PORT}`,
    `--user-data-dir=${profile}`,
    `--load-extension=${ROOT}`,
    `--disable-extensions-except=${ROOT}`,
    `--window-size=${WIDTH},${HEIGHT}`,
    '--hide-scrollbars',
    '--no-first-run',
    // Recent Chrome ignores --load-extension unless this guard is switched off.
    '--disable-features=Translate,DisableLoadExtensionCommandLineSwitch',
    'about:blank',
  ], { stdio: ['ignore', 'pipe', 'pipe'] });
  chrome.stderr.on('data', d => process.env.VERBOSE && process.stderr.write(d));

  let target;
  for (let i = 0; i < 60 && !target; i++) {
    await sleep(500);
    try {
      const list = await fetch(`http://127.0.0.1:${PORT}/json/list`).then(r => r.json());
      target = list.find(t => t.type === 'page');
    } catch {}
  }
  if (!target) throw new Error('Chrome did not come up');

  const ws = new WebSocket(target.webSocketDebuggerUrl);
  await new Promise((res, rej) => { ws.onopen = res; ws.onerror = () => rej(new Error('ws failed')); });

  await cdp(ws, 'Page.enable');
  await cdp(ws, 'Runtime.enable');
  await cdp(ws, 'Emulation.setDeviceMetricsOverride', {
    width: WIDTH, height: HEIGHT, deviceScaleFactor: 1, mobile: false,
  });

  // A fresh profile shows one engine line with the engine off. Set lichess's
  // own preferences before its scripts run.
  await cdp(ws, 'Page.addScriptToEvaluateOnNewDocument', {
    source: `try {
      localStorage.setItem('engine.enabled', 'true');
      localStorage.setItem('analyse.show-engine', 'true');
      localStorage.setItem('ceval.multipv', '${LINES}');
    } catch (e) {}`,
  });

  const version = await cdp(ws, 'Browser.getVersion');
  console.log('chrome:', version.product);

  // Board and pieces are account preferences, which lichess keeps in the
  // session cookie when nobody is signed in. Post them the way its settings
  // menu does, from a lichess page so the cookie is set.
  await cdp(ws, 'Page.navigate', { url: 'https://lichess.org/analysis' });
  await sleep(3000);
  const prefs = await evaluate(ws, undefined, `(async () => {
    const post = (url, body) => fetch(url, {
      method: 'POST',
      body: new URLSearchParams(body),
      headers: { 'X-Requested-With': 'XMLHttpRequest' },
    }).then(r => r.status);
    return [await post('/pref/theme', { theme: ${JSON.stringify(BOARD)} }),
      await post('/pref/pieceSet', { pieceSet: ${JSON.stringify(PIECES)} })];
  })()`);
  if (prefs.some(s => s !== 200)) throw new Error(`lichess refused the board or pieces (${prefs.join(', ')})`);
  console.log(`board: ${BOARD}, pieces: ${PIECES}`);

  const written = [];
  for (const shot of SHOTS) {
    await cdp(ws, 'Page.navigate', { url: shotUrl(shot) });
    await sleep(6000);

    const look = await evaluate(ws, undefined, `[document.body.dataset.board, document.body.dataset.pieceSet]`);
    if (look[0] !== BOARD || look[1] !== PIECES) {
      throw new Error(`${shot.name} came up with ${look.join(' and ')}, not ${BOARD} and ${PIECES}`);
    }

    // Turn the engine on if the stored preference did not do it.
    await evaluate(ws, undefined, `(() => {
      const cb = document.querySelector('#cmn-tg-analyse-toggle-ceval');
      if (cb && !cb.checked) document.querySelector('label[for="cmn-tg-analyse-toggle-ceval"]').click();
      return !!cb;
    })()`);

    // Wait for the engine to produce lines.
    let arrows = 0;
    for (let i = 0; i < 40 && arrows < 2; i++) {
      await sleep(1000);
      arrows = await evaluate(ws, undefined,
        `document.querySelectorAll('.main-board svg.cg-shapes g[cgHash]').length`);
    }

    // Did the packaged extension colour them? Content scripts live in their own
    // world, so ask the page for the marks the extension leaves on the DOM.
    let coloured = await evaluate(ws, undefined,
      `document.querySelectorAll('.main-board svg.cg-shapes g[cgHash][data-lac]').length`);

    if (!coloured) {
      // Chrome did not run the packaged extension. Run the very same source
      // files in the page instead, so the screenshot still shows real output.
      if (!main.warned) {
        console.warn('! packaged extension did not inject; running src/ directly');
        main.warned = true;
      }
      const css = fs.readFileSync(path.join(ROOT, 'src/content.css'), 'utf8');
      await evaluate(ws, undefined, `(() => {
        const style = document.createElement('style');
        style.textContent = ${JSON.stringify(css)};
        document.head.appendChild(style);
      })()`);
      for (const f of ['src/logic.js', 'src/content.js']) {
        await evaluate(ws, undefined, fs.readFileSync(path.join(ROOT, f), 'utf8'));
      }
      await sleep(1200);
      coloured = await evaluate(ws, undefined,
        `document.querySelectorAll('.main-board svg.cg-shapes g[cgHash][data-lac]').length`);
    }
    if (!coloured) throw new Error(`no coloured arrows for ${shot.name} (${arrows} arrows drawn)`);
    await sleep(1200);

    for (const key of shot.keys || []) await press(ws, key);
    if (shot.expect) {
      let found = false;
      for (let i = 0; i < 20 && !found; i++) {
        found = await evaluate(ws, undefined, `!!document.querySelector(${JSON.stringify(shot.expect)})`);
        if (!found) await sleep(250);
      }
      if (!found) throw new Error(`${shot.name}: nothing matched ${shot.expect}`);
      await sleep(800);
    }

    const { data } = await cdp(ws, 'Page.captureScreenshot', { format: 'png', captureBeyondViewport: false });
    const file = path.join(OUT, `${shot.name}-${WIDTH}x${HEIGHT}.png`);
    fs.writeFileSync(file, Buffer.from(data, 'base64'));
    written.push({ file, coloured, note: shot.note });
    console.log(`wrote ${file}  (${coloured} coloured arrows)`);
  }

  ws.close();
  chrome.kill();
  await sleep(500);
  try { fs.rmSync(profile, { recursive: true, force: true, maxRetries: 5, retryDelay: 200 }); } catch {}
  return written;
}

main().catch(err => { console.error('FAILED:', err.message); process.exit(1); });
