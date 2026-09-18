(() => {
  'use strict';
  const { DEFAULTS, MAX_SHIFT, colorForShift } = globalThis.LAC;
  const enabled = document.getElementById('enabled');
  const opacity = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacityValue');
  const colorInputs = Array.from(document.querySelectorAll('input[type=color]'));
  const mode = document.getElementById('mode');
  const normalize = document.getElementById('normalize');
  const normalizeHelp = document.getElementById('normalizeHelp');

  const HELP = {
    on: "The best move is green and the weakest arrow on the board is red, whatever the gap between them. Small differences stay green when every move is about equally good.",
    off: "Colour shows the size of the mistake on a fixed scale, so an arrow only turns red when the line is clearly worse than the best one.",
  };
  const rankColors = document.getElementById('rankColors');
  const evalHelp = document.getElementById('evalHelp');

  document.getElementById('gradient').style.background = `linear-gradient(to right, ${Array.from(
    { length: 11 },
    (_, i) => colorForShift((i / 10) * MAX_SHIFT),
  ).join(', ')})`;

  function render(s) {
    enabled.checked = s.enabled;
    mode.value = s.mode;
    normalize.checked = s.normalize;
    normalizeHelp.textContent = s.normalize ? HELP.on : HELP.off;
    rankColors.hidden = s.mode !== 'rank';
    evalHelp.hidden = s.mode !== 'eval';
    opacity.value = s.opacity;
    opacityValue.value = Number(s.opacity).toFixed(2);
    colorInputs.forEach(input => (input.value = s.colors[Number(input.dataset.rank)] || DEFAULTS.colors[Number(input.dataset.rank)]));
  }

  function save() {
    const s = {
      enabled: enabled.checked,
      mode: mode.value,
      normalize: normalize.checked,
      opacity: Number(opacity.value),
      colors: colorInputs.map(i => i.value),
    };
    opacityValue.value = s.opacity.toFixed(2);
    rankColors.hidden = s.mode !== 'rank';
    evalHelp.hidden = s.mode !== 'eval';
    normalizeHelp.textContent = s.normalize ? HELP.on : HELP.off;
    chrome.storage.sync.set(s);
  }

  chrome.storage.sync.get(DEFAULTS, stored => render({ ...DEFAULTS, ...stored }));
  [enabled, mode, normalize, opacity, ...colorInputs].forEach(el => el.addEventListener('input', save));
  document.getElementById('reset').addEventListener('click', () => {
    chrome.storage.sync.set({ ...DEFAULTS, colors: [...DEFAULTS.colors] });
    render(DEFAULTS);
  });
})();
