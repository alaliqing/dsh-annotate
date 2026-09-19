const tabs = [...document.querySelectorAll('[role=tab]')];
const views = [...document.querySelectorAll('.view')];

tabs.forEach((tab) => {
  tab.addEventListener('click', () => {
    tabs.forEach((other) => other.setAttribute('aria-selected', String(other === tab)));
    views.forEach((view) => {
      view.hidden = view.dataset.view !== tab.dataset.view;
    });
  });
});

document.querySelector('#ask')?.addEventListener('submit', (event) => {
  event.preventDefault();
  const value = document.querySelector('#question').value.trim();
  console.log('asked:', value.slice(0, 80));
  document.querySelector('#question').value = '';
});

// Streaming + POST through the bridge: if these two work, the bridge is honest.
const base = location.pathname.replace(/[^/]*$/, '');
document.querySelector('#ping')?.addEventListener('click', async () => {
  const res = await fetch(`${base}api/echo`, { method: 'POST', body: JSON.stringify({ hello: 'bridge' }) });
  console.log('echo:', await res.json());
});

const stream = new EventSource(`${base}api/stream`);
let ticks = 0;
stream.onmessage = () => {
  ticks += 1;
  const badge = document.querySelector('.badge');
  if (badge) badge.textContent = `v${ticks}`;
};

// Contrast readout: reacts to the colour inputs, so the overlay has something
// live to annotate in the settings view.
const lum = (hex) => {
  const [r, g, b] = [1, 3, 5].map((i) => parseInt(hex.slice(i, i + 2), 16) / 255)
    .map((v) => (v <= 0.04045 ? v / 12.92 : ((v + 0.055) / 1.055) ** 2.4));
  return 0.2126 * r + 0.7152 * g + 0.0722 * b;
};
const ratio = (a, b) => {
  const [hi, lo] = [lum(a), lum(b)].sort((x, y) => y - x);
  return (hi + 0.05) / (lo + 0.05);
};
const inputs = [...document.querySelectorAll('.token input')];
const readout = document.querySelector('#contrast');
const update = () => {
  if (inputs.length < 2 || !readout) return;
  const value = ratio(inputs[0].value, inputs[1].value);
  const pass = value >= 4.5;
  readout.innerHTML = `Text contrast <strong style="color:${pass ? 'var(--ok)' : '#c0392b'}">${value.toFixed(1)}:1</strong> · ${pass ? 'AA pass' : 'Needs adjustment'}`;
};
inputs.forEach((input) => input.addEventListener('input', update));
update();
