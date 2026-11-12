// Звуки интерфейса: синтезируются в браузере (Web Audio API), файлы не нужны.
let ctx;
const ac = () => (ctx ||= new (window.AudioContext || window.webkitAudioContext)());

function tone(freq, dur = 0.12, { type = 'sine', vol = 0.12, slide = 0, delay = 0 } = {}) {
  const a = ac();
  if (a.state === 'suspended') a.resume();
  const t = a.currentTime + delay;
  const o = a.createOscillator(), g = a.createGain();
  o.type = type;
  o.frequency.setValueAtTime(freq, t);
  if (slide) o.frequency.exponentialRampToValueAtTime(freq * slide, t + dur);
  g.gain.setValueAtTime(0.0001, t);
  g.gain.exponentialRampToValueAtTime(vol, t + 0.01);
  g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
  o.connect(g).connect(a.destination);
  o.start(t);
  o.stop(t + dur + 0.02);
}

let enabled = localStorage.getItem('sfx') !== 'off';
const on = (f) => () => { if (enabled) f(); };

export const sfx = {
  get on() { return enabled; },
  toggle() { enabled = !enabled; localStorage.setItem('sfx', enabled ? 'on' : 'off'); return enabled; },
  click:   on(() => tone(500, 0.09, { slide: 1.8 })),
  play:    on(() => { tone(523, 0.12); tone(784, 0.16, { delay: 0.07 }); }),
  pause:   on(() => { tone(784, 0.12); tone(523, 0.16, { delay: 0.07 }); }),
  success: on(() => { tone(784, 0.12); tone(1047, 0.2, { delay: 0.08 }); }),
  remove:  on(() => tone(500, 0.14, { slide: 0.5 })),
  error:   on(() => { tone(220, 0.15, { type: 'triangle' }); tone(196, 0.2, { type: 'triangle', delay: 0.12 }); }),
  login:   on(() => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.18, { delay: i * 0.08 }))),
};
