#!/usr/bin/env node
// Take Chrome Web Store screenshots of the extension running on a real
// lichess board. Launches Chrome, drives it over the DevTools protocol, and
// writes PNGs into store/screenshots/.
//
//   node scripts/shoot.js [--width 1280] [--height 800]
//
// Chrome 153 refuses --load-extension even with the guard feature switched
// off, so the script checks whether the packaged extension injected and, if it
// did not, runs src/logic.js and src/content.js in the page instead. That is
// the same code the extension ships, with the same default settings, so the
// picture matches what an installed copy draws. The script says which path it
// took.

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
  return i > -1 ? Number(process.argv[i + 1]) : fallback;
};
const WIDTH = arg('width', 1280);
const HEIGHT = arg('height', 800);

const LINES = 5;

const SHOTS = [
  {
    name: 'arrows-spread',
    fen: 'r1bqkb1r/pppp1ppp/2n2n2/4p1N1/2B1P3/8/PPPP1PPP/RNBQK2R b KQkq - 5 4',
    note: 'moves differ a lot, so the colours spread green to red',
  },
  {
    name: 'arrows-equal',
    fen: 'rnbqkbnr/pppppppp/8/8/8/8/PPPPPPPP/RNBQKBNR w KQkq - 0 1',
    note: 'every move about equal, so nothing turns red',
  },
];

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

  const written = [];
  for (const shot of SHOTS) {
    const url = 'https://lichess.org/analysis/standard/' + shot.fen.replace(/ /g, '_');
    await cdp(ws, 'Page.navigate', { url });
    await sleep(6000);

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
      for (const f of ['src/logic.js', 'src/content.js']) {
        await evaluate(ws, undefined, fs.readFileSync(path.join(ROOT, f), 'utf8'));
      }
      await sleep(1200);
      coloured = await evaluate(ws, undefined,
        `document.querySelectorAll('.main-board svg.cg-shapes g[cgHash][data-lac]').length`);
    }
    if (!coloured) throw new Error(`no coloured arrows for ${shot.name} (${arrows} arrows drawn)`);
    await sleep(1200);

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
