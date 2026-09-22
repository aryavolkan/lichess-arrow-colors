(() => {
  'use strict';
  const { DEFAULTS, MAX_SHIFT, colorForShift } = globalThis.LAC;
  const enabled = document.getElementById('enabled');
  const opacity = document.getElementById('opacity');
  const opacityValue = document.getElementById('opacityValue');
  const colorInputs = Array.from(document.querySelectorAll('input[type=color][data-rank]'));
  const mode = document.getElementById('mode');
  const normalize = document.getElementById('normalize');
  const uniformWidth = document.getElementById('uniformWidth');
  const widthOpts = document.getElementById('widthOpts');
  const width = document.getElementById('width');
  const widthValue = document.getElementById('widthValue');
  const border = document.getElementById('border');
  const borderOpts = document.getElementById('borderOpts');
  const borderColor = document.getElementById('borderColor');
  const borderWidth = document.getElementById('borderWidth');
  const borderWidthValue = document.getElementById('borderWidthValue');
  const normalizeHelp = document.getElementById('normalizeHelp');
  const lineDepth = document.getElementById('lineDepth');
  const lineDepthValue = document.getElementById('lineDepthValue');
  const lineOpts = document.getElementById('lineOpts');
  const lineOpacity = document.getElementById('lineOpacity');
  const lineOpacityValue = document.getElementById('lineOpacityValue');
  const shortcuts = document.getElementById('shortcuts');

  const depthLabel = n => (n > 0 ? String(n) : 'off');
  const percent = n => Math.round(n * 100) + '%';

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
    lineDepth.value = s.lineDepth;
    lineDepthValue.value = depthLabel(s.lineDepth);
    lineOpacity.value = s.lineOpacity;
    lineOpacityValue.value = percent(s.lineOpacity);
    lineOpts.hidden = !s.lineDepth;
    uniformWidth.checked = s.uniformWidth;
    width.value = s.width;
    widthValue.value = Math.round(Number(width.value) * 64);
    widthOpts.hidden = !s.uniformWidth;
    border.checked = s.border;
    borderColor.value = s.borderColor;
    borderWidth.value = s.borderWidth;
    borderWidthValue.value = Number(s.borderWidth).toFixed(3);
    borderOpts.hidden = !s.border;
    normalizeHelp.textContent = s.normalize ? HELP.on : HELP.off;
    rankColors.hidden = s.mode !== 'rank';
    evalHelp.hidden = s.mode !== 'eval';
    opacity.value = s.opacity;
    opacityValue.value = Number(s.opacity).toFixed(2);
    shortcuts.checked = s.shortcuts;
    colorInputs.forEach(input => (input.value = s.colors[Number(input.dataset.rank)] || DEFAULTS.colors[Number(input.dataset.rank)]));
  }

  function save() {
    const s = {
      enabled: enabled.checked,
      mode: mode.value,
      normalize: normalize.checked,
      lineDepth: Number(lineDepth.value),
      lineOpacity: Number(lineOpacity.value),
      uniformWidth: uniformWidth.checked,
      width: Number(width.value),
      border: border.checked,
      borderColor: borderColor.value,
      borderWidth: Number(borderWidth.value),
      opacity: Number(opacity.value),
      shortcuts: shortcuts.checked,
      colors: colorInputs.map(i => i.value),
    };
    opacityValue.value = s.opacity.toFixed(2);
    lineDepthValue.value = depthLabel(s.lineDepth);
    lineOpacityValue.value = percent(s.lineOpacity);
    lineOpts.hidden = !s.lineDepth;
    rankColors.hidden = s.mode !== 'rank';
    evalHelp.hidden = s.mode !== 'eval';
    normalizeHelp.textContent = s.normalize ? HELP.on : HELP.off;
    borderWidthValue.value = s.borderWidth.toFixed(3);
    widthValue.value = Math.round(s.width * 64);
    widthOpts.hidden = !s.uniformWidth;
    borderOpts.hidden = !s.border;
    chrome.storage.sync.set(s);
  }

  chrome.storage.sync.get(DEFAULTS, stored => render({ ...DEFAULTS, ...stored }));
  [enabled, mode, normalize, lineDepth, lineOpacity, opacity, uniformWidth, width, border, borderColor, borderWidth, shortcuts, ...colorInputs].forEach(el => el.addEventListener('input', save));
  document.getElementById('reset').addEventListener('click', () => {
    chrome.storage.sync.set({ ...DEFAULTS, colors: [...DEFAULTS.colors] });
    render(DEFAULTS);
  });
})();
