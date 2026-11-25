// Shared helpers for every game in Contest of the Mind.
//
// GAME MODULE CONTRACT — each file in games/ default-exports:
// {
//   id: 'match',                       // url + leaderboard key
//   title: 'Card Match',
//   blurb: 'One line shown on the lobby tile.',
//   rules: 'Two or three sentences shown on the setup screen.',
//   icon: '<svg …>',                   // 48x48 inline SVG for the tile
//   options: [                         // setup-screen choices (may be [])
//     { key: 'bombs', label: 'Bombs', choices: [0, 2, 4, 6], default: 4 },
//   ],
//   score: { label: 'Time', order: 'asc' | 'desc', format: v => '0:21.4' },
//   mount(el, { options, finish, sfx }) {
//     // draw the game into `el` (an empty div that fills the play area)
//     // call finish({ score: Number, detail: 'short text, e.g. 92% accuracy' })
//     //   exactly once when the round ends; the shell then shows results.
//     // return a cleanup function (clear timers, remove key listeners).
//   },
// }
// Every option is part of the leaderboard key, so scores are only compared
// between players who used the same settings.

const NAME_KEY = 'mind-contest:name';
export const getName = () => localStorage.getItem(NAME_KEY) || '';
export const setName = (n) => localStorage.setItem(NAME_KEY, n.trim().slice(0, 24));

// ---- sound (Web Audio, no files) ----
let ctx;
let muted = localStorage.getItem('mind-contest:muted') === '1';
export const isMuted = () => muted;
export const toggleMute = () => {
  muted = !muted;
  localStorage.setItem('mind-contest:muted', muted ? '1' : '0');
  return muted;
};
export function tone(freq, ms = 160, type = 'sine', gain = 0.12) {
  if (muted) return;
  ctx ??= new (window.AudioContext || window.webkitAudioContext)();
  const o = ctx.createOscillator();
  const g = ctx.createGain();
  o.type = type;
  o.frequency.value = freq;
  g.gain.setValueAtTime(gain, ctx.currentTime);
  g.gain.exponentialRampToValueAtTime(0.0001, ctx.currentTime + ms / 1000);
  o.connect(g).connect(ctx.destination);
  o.start();
  o.stop(ctx.currentTime + ms / 1000 + 0.02);
}
export const sfx = {
  tone,
  click: () => tone(520, 60, 'triangle', 0.08),
  good: () => { tone(660, 90); setTimeout(() => tone(880, 120), 80); },
  bad: () => tone(150, 260, 'sawtooth', 0.09),
  boom: () => { tone(90, 400, 'square', 0.12); tone(60, 500, 'sawtooth', 0.08); },
  win: () => [523, 659, 784, 1047].forEach((f, i) => setTimeout(() => tone(f, 180), i * 110)),
};

// ---- small utils games can use ----
export const shuffle = (a) => {
  a = [...a];
  for (let i = a.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [a[i], a[j]] = [a[j], a[i]];
  }
  return a;
};
export const sleep = (ms) => new Promise((r) => setTimeout(r, ms));
export const fmtTime = (ms) => {
  const s = ms / 1000;
  const m = Math.floor(s / 60);
  return `${m}:${(s % 60).toFixed(1).padStart(4, '0')}`;
};
