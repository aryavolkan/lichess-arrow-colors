(() => {
  'use strict';
  const { DEFAULTS, MAX_SHIFT, colorForShift } = globalThis.LAC;
  const enabled = document.getElementById('enabled');
  const opacity = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacityValue');
  const colorInputs = Array.from(document.querySelectorAll('input[type=color]'));
  const mode = document.getElementById('mode');
  const rankColors = document.getElementById('rankColors');
  const evalHelp = document.getElementById('evalHelp');

  document.getElementById('gradient').style.background = `linear-gradient(to right, ${Array.from(
    { length: 11 },
    (_, i) => colorForShift((i / 10) * MAX_SHIFT),
  ).join(', ')})`;

  function render(s) {
    enabled.checked = s.enabled;
    mode.value = s.mode;
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
      opacity: Number(opacity.value),
      colors: colorInputs.map(i => i.value),
    };
    opacityValue.value = s.opacity.toFixed(2);
    rankColors.hidden = s.mode !== 'rank';
    evalHelp.hidden = s.mode !== 'eval';
    chrome.storage.sync.set(s);
  }

  chrome.storage.sync.get(DEFAULTS, stored => render({ ...DEFAULTS, ...stored }));
  [enabled, mode, opacity, ...colorInputs].forEach(el => el.addEventListener('input', save));
  document.getElementById('reset').addEventListener('click', () => {
    chrome.storage.sync.set({ ...DEFAULTS, colors: [...DEFAULTS.colors] });
    render(DEFAULTS);
  });
})();
