(() => {
  'use strict';
  const { DEFAULTS } = globalThis.LAC;
  const enabled = document.getElementById('enabled');
  const opacity = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacityValue');
  const colorInputs = Array.from(document.querySelectorAll('input[type=color]'));

  function render(s) {
    enabled.checked = s.enabled;
    opacity.value = s.opacity;
    opacityValue.value = Number(s.opacity).toFixed(2);
    colorInputs.forEach(input => (input.value = s.colors[Number(input.dataset.rank)] || DEFAULTS.colors[Number(input.dataset.rank)]));
  }

  function save() {
    const s = {
      enabled: enabled.checked,
      opacity: Number(opacity.value),
      colors: colorInputs.map(i => i.value),
    };
    opacityValue.value = s.opacity.toFixed(2);
    chrome.storage.sync.set(s);
  }

  chrome.storage.sync.get(DEFAULTS, stored => render({ ...DEFAULTS, ...stored }));
  [enabled, opacity, ...colorInputs].forEach(el => el.addEventListener('input', save));
  document.getElementById('reset').addEventListener('click', () => {
    chrome.storage.sync.set({ ...DEFAULTS, colors: [...DEFAULTS.colors] });
    render(DEFAULTS);
  });
})();
