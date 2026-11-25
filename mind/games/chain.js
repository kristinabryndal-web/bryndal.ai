// Color Chain — watch a growing chain of coloured pads, then repeat it.
import { tone } from '../common.js';

const COLORS = ['--c1', '--c2', '--c3', '--c4'];
const HEX = ['#f472b6', '#38bdf8', '#facc15', '#4ade80'];
const NOTES = [330, 392, 494, 587];
const NAMES = ['top', 'right', 'bottom', 'left'];

// Annular sector path, angles in degrees (0 = +x, clockwise because SVG y points down).
function sector(cx, cy, R, r, a0, a1) {
  const p = (rad, a) => {
    const t = (a * Math.PI) / 180;
    return `${(cx + rad * Math.cos(t)).toFixed(2)} ${(cy + rad * Math.sin(t)).toFixed(2)}`;
  };
  return `M${p(R, a0)} A${R} ${R} 0 0 1 ${p(R, a1)} L${p(r, a1)} A${r} ${r} 0 0 0 ${p(r, a0)} Z`;
}
// Pads centred on top, right, bottom, left (matches arrow keys and 1-4).
const CENTERS = [-90, 0, 90, 180];
const padPath = (i, R = 96, r = 50, gap = 5) =>
  sector(100, 100, R, r, CENTERS[i] - 45 + gap, CENTERS[i] + 45 - gap);

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 200 200">${
  [0, 1, 2, 3].map((i) => `<path d="${padPath(i, 92, 50, 6)}" style="fill:var(${COLORS[i]},${HEX[i]})" stroke="var(${COLORS[i]},${HEX[i]})" stroke-width="6" stroke-linejoin="round"/>`).join('')
}<circle cx="100" cy="100" r="34" fill="#16161d" stroke="rgba(255,255,255,0.15)" stroke-width="4"/><circle cx="100" cy="100" r="9" style="fill:var(--accent,#a78bfa)"/></svg>`;

const CSS = `
.chain-wrap { display:flex; flex-direction:column; align-items:center; user-select:none; -webkit-user-select:none; }
.chain-ring { width:min(340px, 86vw); height:auto; aspect-ratio:1; display:block; touch-action:none; overflow:visible; }
.chain-pad { fill:currentColor; fill-opacity:0.26; stroke:currentColor; stroke-opacity:0.5; stroke-width:6; stroke-linejoin:round;
  cursor:pointer; transition:fill-opacity .12s, stroke-opacity .12s, filter .12s; outline:none; }
.chain-ring.chain-locked .chain-pad { cursor:default; }
.chain-ring:not(.chain-locked) .chain-pad:hover { fill-opacity:0.38; }
.chain-pad.chain-lit { fill-opacity:1; stroke-opacity:1; filter:drop-shadow(0 0 10px currentColor) drop-shadow(0 0 22px currentColor); transition:none; }
.chain-hub { fill:#121218; stroke:rgba(255,255,255,0.08); stroke-width:2; }
.chain-num { fill:var(--text); font-family:var(--display); font-weight:800; font-size:34px; text-anchor:middle; dominant-baseline:central; }
.chain-sub { fill:var(--muted); font-size:9px; letter-spacing:0.18em; text-transform:uppercase; text-anchor:middle; }
.chain-ring.chain-over .chain-hub { stroke:var(--bad); }
.chain-controls { min-height:44px; display:flex; justify-content:center; }
`;

let sessionBest = 0;

export default {
  id: 'chain',
  title: 'Color Chain',
  blurb: 'Watch the coloured ring light up, then repeat the chain as it grows.',
  rules:
    'The ring plays a chain of coloured pads with notes. Tap the pads (or press 1-4 / arrow keys) to repeat it. Each time you get it right the chain grows by one; one wrong pad ends the game. In Reverse mode, repeat the chain backwards.',
  icon: ICON,
  options: [
    { key: 'speed', label: 'Speed', choices: ['Steady', 'Speeding up'], default: 'Speeding up' },
    { key: 'mode', label: 'Mode', choices: ['Classic', 'Reverse'], default: 'Classic' },
  ],
  score: { label: 'Longest chain', order: 'desc', format: (v) => `${v}` },

  mount(el, { options = {}, finish, sfx }) {
    const speed = options.speed ?? 'Speeding up';
    const mode = options.mode ?? 'Classic';

    if (!document.getElementById('chain-style')) {
      const st = document.createElement('style');
      st.id = 'chain-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }

    el.innerHTML = `
      <div class="chain-wrap">
        <div class="hud">
          <div class="stat"><span>Chain</span><b class="chain-len">0</b></div>
          <div class="stat"><span>Best this session</span><b class="chain-best">${sessionBest}</b></div>
        </div>
        <svg class="chain-ring chain-locked" viewBox="-14 -14 228 228" role="group" aria-label="Color Chain pads">
          ${[0, 1, 2, 3].map((i) => `<path class="chain-pad" data-pad="${i}" d="${padPath(i)}" style="color:var(${COLORS[i]},${HEX[i]})" role="button" aria-label="${NAMES[i]} pad (key ${i + 1})"/>`).join('')}
          <circle class="chain-hub" cx="100" cy="100" r="40"/>
          <text class="chain-num" x="100" y="96">0</text>
          <text class="chain-sub" x="100" y="124">chain</text>
        </svg>
        <div class="game-msg">${mode === 'Reverse' ? 'Repeat each chain backwards.' : 'Repeat each chain in order.'}</div>
        <div class="chain-controls"><button class="btn chain-start">Start</button></div>
      </div>`;

    const ring = el.querySelector('.chain-ring');
    const pads = [...el.querySelectorAll('.chain-pad')];
    const lenEl = el.querySelector('.chain-len');
    const bestEl = el.querySelector('.chain-best');
    const numEl = el.querySelector('.chain-num');
    const msgEl = el.querySelector('.game-msg');
    const controls = el.querySelector('.chain-controls');

    let stopped = false;
    let phase = 'idle'; // idle | play | input | over
    let chain = [];
    let idx = 0;
    let longest = 0;
    const timers = new Set();

    const later = (fn, ms) => {
      const t = setTimeout(() => { timers.delete(t); if (!stopped) fn(); }, ms);
      timers.add(t);
    };
    const wait = (ms) => new Promise((res) => later(res, ms));

    const rand = () => Math.floor(Math.random() * 4);
    const interval = () =>
      speed === 'Steady' ? 600 : Math.max(300, Math.round(600 - (chain.length - 1) * 30));

    function setLen(n) {
      lenEl.textContent = n;
      numEl.textContent = n;
    }
    function setLocked(locked) {
      ring.classList.toggle('chain-locked', locked);
    }

    function flash(i, ms) {
      const p = pads[i];
      p.classList.add('chain-lit');
      tone(NOTES[i], Math.max(140, ms), i % 2 ? 'triangle' : 'sine', 0.14);
      later(() => p.classList.remove('chain-lit'), ms);
    }

    async function playChain() {
      phase = 'play';
      setLocked(true);
      msgEl.textContent = 'Watch…';
      setLen(chain.length);
      await wait(550);
      const step = interval();
      for (const p of chain) {
        if (stopped) return;
        flash(p, Math.round(step * 0.62));
        await wait(step);
      }
      if (stopped) return;
      phase = 'input';
      idx = 0;
      setLocked(false);
      msgEl.textContent = mode === 'Reverse' ? 'Your turn — backwards' : 'Your turn';
    }

    async function press(i) {
      if (phase !== 'input' || stopped) return;
      const expected = mode === 'Reverse' ? chain[chain.length - 1 - idx] : chain[idx];
      if (i !== expected) return gameOver(i);
      flash(i, 220);
      idx++;
      if (idx < chain.length) return;
      // whole chain repeated
      phase = 'play';
      setLocked(true);
      longest = chain.length;
      if (longest > sessionBest) { sessionBest = longest; bestEl.textContent = sessionBest; }
      msgEl.textContent = 'Nice!';
      await wait(260);
      sfx?.good?.();
      chain.push(rand());
      await wait(650);
      if (!stopped) playChain();
    }

    function gameOver(i) {
      phase = 'over';
      setLocked(true);
      pads[i].classList.add('chain-lit');
      later(() => pads[i].classList.remove('chain-lit'), 400);
      sfx?.bad?.();
      ring.classList.remove('shake');
      void ring.getBoundingClientRect();
      ring.classList.add('shake', 'chain-over');
      // show which pad was expected
      const expected = mode === 'Reverse' ? chain[chain.length - 1 - idx] : chain[idx];
      later(() => flashSilent(expected, 500), 520);
      msgEl.textContent = longest
        ? `Missed — longest chain repeated: ${longest}`
        : 'Missed on the first chain';
      later(() => {
        finish({ score: longest, detail: mode === 'Reverse' ? 'reverse mode' : `${speed.toLowerCase()}` });
      }, 1500);
    }

    function flashSilent(i, ms) {
      pads[i].classList.add('chain-lit');
      later(() => pads[i].classList.remove('chain-lit'), ms);
    }

    function start() {
      if (phase !== 'idle') return;
      sfx?.click?.();
      controls.innerHTML = '';
      chain = [rand()];
      playChain();
    }

    // --- input ---
    const onPointer = (e) => {
      const p = e.target.closest?.('.chain-pad');
      if (!p) return;
      e.preventDefault();
      press(Number(p.dataset.pad));
    };
    ring.addEventListener('pointerdown', onPointer);

    const KEYMAP = { '1': 0, '2': 1, '3': 2, '4': 3, ArrowUp: 0, ArrowRight: 1, ArrowDown: 2, ArrowLeft: 3 };
    const onKey = (e) => {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (e.key in KEYMAP) {
        if (e.key.startsWith('Arrow') && phase !== 'idle') e.preventDefault();
        press(KEYMAP[e.key]);
      } else if ((e.key === 'Enter' || e.key === ' ') && phase === 'idle' && document.activeElement?.tagName !== 'BUTTON') {
        e.preventDefault();
        start();
      }
    };
    window.addEventListener('keydown', onKey);
    el.querySelector('.chain-start').addEventListener('click', start);

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      timers.clear();
      window.removeEventListener('keydown', onKey);
      ring.removeEventListener('pointerdown', onPointer);
    };
  },
};
