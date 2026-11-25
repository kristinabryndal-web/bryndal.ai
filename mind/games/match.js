// Card Match — classic concentration with optional bombs.
import { sfx, shuffle, fmtTime } from '../common.js?v=5';

const THEMES = {
  space: ['🚀', '🪐', '🌙', '⭐', '☄️', '🛸', '👽', '🌍', '🔭', '🌞', '🛰️', '🌌'],
  ocean: ['🐙', '🐠', '🐳', '🦀', '🐚', '🦈', '🐢', '🪼', '🦑', '🐬', '⚓', '🦞'],
  food: ['🍕', '🍩', '🍓', '🌮', '🍉', '🧁', '🍔', '🥑', '🍪', '🍒', '🥨', '🍋'],
  animals: ['🦊', '🐼', '🦁', '🐸', '🦉', '🐨', '🦒', '🐧', '🦔', '🐯', '🦓', '🐰'],
  garden: ['🌻', '🍄', '🌵', '🌷', '🐝', '🦋', '🌿', '🍁', '🐞', '🌸', '🪴', '🐌'],
};

const CSS = `
.match-wrap { display: flex; flex-direction: column; align-items: center; width: 100%; }
.match-stage { position: relative; width: 100%; display: flex; justify-content: center; }
.match-board {
  display: grid;
  grid-template-columns: repeat(var(--cols), 1fr);
  gap: clamp(5px, 1.4vw, 10px);
  width: min(100%, 720px, max(260px, calc((100svh - 250px) / var(--rows) * 0.75 * var(--cols))));
  touch-action: manipulation;
  user-select: none;
  -webkit-user-select: none;
}
.match-card {
  position: relative;
  aspect-ratio: 3 / 4;
  border: 0;
  padding: 0;
  background: none;
  perspective: 700px;
  container-type: inline-size;
  -webkit-tap-highlight-color: transparent;
}
.match-card:focus-visible { outline: 2px solid var(--accent); outline-offset: 3px; border-radius: 10px; }
.match-inner {
  position: absolute; inset: 0;
  transform-style: preserve-3d;
  transition: transform 0.42s cubic-bezier(.3,.7,.3,1.15);
}
.match-card.match-up .match-inner { transform: rotateY(180deg); }
.match-face {
  position: absolute; inset: 0;
  border-radius: min(10px, 9cqi);
  backface-visibility: hidden;
  -webkit-backface-visibility: hidden;
  display: flex; align-items: center; justify-content: center;
}
.match-back {
  background:
    radial-gradient(circle at 50% 50%, rgba(255,255,255,0.18) 0 7%, transparent 8%),
    repeating-linear-gradient(45deg, rgba(255,255,255,0.06) 0 4px, transparent 4px 10px),
    repeating-linear-gradient(-45deg, rgba(255,255,255,0.05) 0 4px, transparent 4px 10px),
    linear-gradient(155deg, #7c5ce0, #4b2f9c);
  border: 1px solid rgba(196, 176, 255, 0.35);
  box-shadow: 0 4px 14px rgba(0,0,0,0.35), inset 0 0 0 4cqi rgba(11,11,14,0.18);
  transition: filter 0.15s, transform 0.15s;
}
.match-back::after {
  content: ''; position: absolute; inset: 9cqi;
  border: 1px solid rgba(255,255,255,0.16);
  border-radius: min(6px, 5cqi);
}
@media (hover: hover) {
  .match-card:not(.match-up):hover .match-back { filter: brightness(1.15); }
}
.match-front {
  transform: rotateY(180deg);
  background: linear-gradient(160deg, #1d1b29, #15141d);
  border: 1px solid var(--line);
  font-size: 52cqi;
  line-height: 1;
}
.match-card.match-found .match-front {
  border-color: rgba(74, 222, 128, 0.55);
  box-shadow: 0 0 0 1px rgba(74, 222, 128, 0.25), 0 0 18px rgba(74, 222, 128, 0.15);
  animation: match-pop 0.35s ease-out;
}
.match-card.match-miss .match-front { border-color: rgba(248, 113, 113, 0.6); }
.match-card.match-bomb .match-front {
  background: radial-gradient(circle, rgba(251,191,36,0.35), rgba(248,113,113,0.25) 55%, #1a1218 80%);
  border-color: rgba(248, 113, 113, 0.6);
}
.match-card.match-spent { cursor: default; }
.match-card.match-spent .match-front { opacity: 0.38; filter: grayscale(0.6); transition: opacity 0.6s 0.5s, filter 0.6s 0.5s; }
.match-card.match-found, .match-card.match-up { cursor: default; }
@keyframes match-pop { 0% { transform: rotateY(180deg) scale(1); } 50% { transform: rotateY(180deg) scale(1.08); } 100% { transform: rotateY(180deg) scale(1); } }
.match-flash {
  position: absolute; left: 50%; top: 40%;
  transform: translate(-50%, 0);
  font-family: var(--display); font-weight: 800; font-size: 40px;
  color: var(--bad); text-shadow: 0 2px 16px rgba(0,0,0,0.7);
  pointer-events: none;
  animation: match-rise 1s ease-out forwards;
}
@keyframes match-rise {
  0% { opacity: 0; transform: translate(-50%, 10px) scale(0.8); }
  20% { opacity: 1; transform: translate(-50%, 0) scale(1.1); }
  100% { opacity: 0; transform: translate(-50%, -50px) scale(1); }
}
.match-penalty { color: var(--bad); }
`;

function injectStyle() {
  if (document.getElementById('match-style')) return;
  const s = document.createElement('style');
  s.id = 'match-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const icon = `<svg width="48" height="48" viewBox="0 0 48 48" fill="none" xmlns="http://www.w3.org/2000/svg">
  <defs>
    <linearGradient id="match-ic-back" x1="0" y1="0" x2="1" y2="1">
      <stop offset="0" stop-color="#8b6cf0"/><stop offset="1" stop-color="#4b2f9c"/>
    </linearGradient>
    <pattern id="match-ic-pat" width="4" height="4" patternUnits="userSpaceOnUse" patternTransform="rotate(45)">
      <rect width="2" height="4" fill="rgba(255,255,255,0.12)"/>
    </pattern>
  </defs>
  <g transform="rotate(-12 17 26)">
    <rect x="6" y="11" width="21" height="29" rx="4" fill="url(#match-ic-back)"/>
    <rect x="6" y="11" width="21" height="29" rx="4" fill="url(#match-ic-pat)"/>
    <rect x="9.5" y="14.5" width="14" height="22" rx="2.5" stroke="rgba(255,255,255,0.3)"/>
  </g>
  <g transform="rotate(10 31 23)">
    <rect x="20" y="8" width="21" height="29" rx="4" fill="#1d1b29" stroke="#a78bfa" stroke-width="1.5"/>
    <path d="M30.5 15.5l2.2 4.6 5 .6-3.7 3.4 1 5-4.5-2.5-4.5 2.5 1-5-3.7-3.4 5-.6z" fill="#facc15"/>
  </g>
</svg>`;

export default {
  id: 'match',
  title: 'Card Match',
  blurb: 'Flip cards two at a time and pair them all up — mind the bombs.',
  rules: 'Flip two cards per turn; matching pairs stay face up. Find every pair as fast as you can. Bombs hidden in the grid add 5 seconds and flip your half-turn back down.',
  icon,
  options: [
    { key: 'cards', label: 'Cards', choices: [12, 16, 20, 24], default: 16 },
    { key: 'bombs', label: 'Bombs', choices: [0, 2, 4, 6], default: 4 },
  ],
  score: { label: 'Time', order: 'asc', format: fmtTime },

  mount(el, { options = {}, finish }) {
    injectStyle();
    const nCards = Number(options.cards ?? 16);
    const nBombs = Number(options.bombs ?? 4);
    const pairs = Math.floor(nCards / 2);
    const total = pairs * 2 + nBombs;
    const cols = Math.ceil(Math.sqrt(total));
    const rows = Math.ceil(total / cols);

    const themeNames = Object.keys(THEMES);
    const themeName = themeNames[Math.floor(Math.random() * themeNames.length)];
    const symbols = shuffle(THEMES[themeName]).slice(0, pairs);
    const deck = shuffle([
      ...symbols.flatMap((s, k) => [{ sym: s, pair: k }, { sym: s, pair: k }]),
      ...Array.from({ length: nBombs }, () => ({ bomb: true, sym: '💥' })),
    ]);

    // ---- DOM ----
    el.innerHTML = '';
    const wrap = document.createElement('div');
    wrap.className = 'match-wrap';
    wrap.innerHTML = `
      <div class="hud">
        <div class="stat"><span>Time</span><b data-k="time">${fmtTime(0)}</b></div>
        <div class="stat"><span>Accuracy</span><b data-k="acc">—</b></div>
        ${nBombs ? `<div class="stat"><span>Bombs hit</span><b data-k="bombs">0/${nBombs}</b></div>` : ''}
      </div>
      <div class="match-stage"><div class="match-board"></div></div>
      <div class="game-msg">Find all ${pairs} pairs${nBombs ? ` — ${nBombs} bombs are hiding` : ''}.</div>`;
    el.appendChild(wrap);
    const $ = (k) => wrap.querySelector(`[data-k="${k}"]`);
    const timeEl = $('time'), accEl = $('acc'), bombsEl = $('bombs');
    const stage = wrap.querySelector('.match-stage');
    const board = wrap.querySelector('.match-board');
    const msg = wrap.querySelector('.game-msg');
    board.style.setProperty('--cols', cols);
    board.style.setProperty('--rows', rows);

    const cards = deck.map((c, i) => {
      const b = document.createElement('button');
      b.type = 'button';
      b.className = 'match-card';
      b.setAttribute('aria-label', 'Hidden card');
      b.innerHTML = `<div class="match-inner"><div class="match-face match-back"></div><div class="match-face match-front">${c.sym}</div></div>`;
      b.addEventListener('click', () => flip(i));
      board.appendChild(b);
      return { ...c, el: b, up: false, done: false };
    });

    // ---- state ----
    let first = null;
    let lock = false;
    let over = false;
    let matches = 0;
    let attempts = 0;
    let bombsHit = 0;
    let penalty = 0;
    let start = null;
    let timer = null;
    const timeouts = new Set();
    const later = (fn, ms) => {
      const t = setTimeout(() => { timeouts.delete(t); fn(); }, ms);
      timeouts.add(t);
    };

    const elapsed = () => (start === null ? 0 : performance.now() - start) + penalty;
    const accPct = () => (attempts ? Math.round((matches / attempts) * 100) : null);
    const renderHud = () => {
      timeEl.textContent = fmtTime(elapsed());
      const a = accPct();
      accEl.textContent = a === null ? '—' : `${a}%`;
      if (bombsEl) bombsEl.textContent = `${bombsHit}/${nBombs}`;
    };

    const show = (c) => { c.up = true; c.el.classList.add('match-up'); c.el.setAttribute('aria-label', c.bomb ? 'Bomb' : c.sym); };
    const hide = (c) => { c.up = false; c.el.classList.remove('match-up', 'match-miss'); c.el.setAttribute('aria-label', 'Hidden card'); };

    function shakeBoard() {
      board.classList.remove('shake');
      void board.offsetWidth;
      board.classList.add('shake');
      later(() => board.classList.remove('shake'), 600);
    }
    function flashPenalty() {
      const f = document.createElement('div');
      f.className = 'match-flash';
      f.textContent = '+5s';
      stage.appendChild(f);
      later(() => f.remove(), 1000);
    }

    function flip(i) {
      const c = cards[i];
      if (over || lock || c.up || c.done) return;
      if (start === null) {
        start = performance.now();
        timer = setInterval(renderHud, 100);
      }
      show(c);

      if (c.bomb) {
        c.done = true;
        c.el.classList.add('match-bomb', 'match-spent');
        bombsHit++;
        penalty += 5000;
        sfx.boom();
        shakeBoard();
        flashPenalty();
        msg.textContent = 'Boom! +5 seconds.';
        if (first !== null) {
          const f = cards[first];
          first = null;
          lock = true;
          later(() => { hide(f); lock = false; }, 450);
        }
        renderHud();
        return;
      }

      if (first === null) {
        sfx.click();
        first = i;
        return;
      }

      const a = cards[first];
      first = null;
      attempts++;
      if (a.pair === c.pair) {
        a.done = c.done = true;
        a.el.classList.add('match-found');
        c.el.classList.add('match-found');
        matches++;
        sfx.good();
        msg.textContent = `${matches} of ${pairs} pairs found.`;
        renderHud();
        if (matches === pairs) win();
      } else {
        sfx.click();
        lock = true;
        a.el.classList.add('match-miss');
        c.el.classList.add('match-miss');
        renderHud();
        later(() => { hide(a); hide(c); lock = false; }, 700);
      }
    }

    function win() {
      over = true;
      clearInterval(timer);
      timer = null;
      const totalMs = Math.round(elapsed());
      timeEl.textContent = fmtTime(totalMs);
      const acc = accPct() ?? 100;
      msg.textContent = 'All pairs found!';
      sfx.win();
      later(() => finish({
        score: totalMs,
        detail: `${acc}% accuracy · ${bombsHit} bomb${bombsHit === 1 ? '' : 's'}`,
      }), 900);
    }

    return () => {
      over = true;
      if (timer) clearInterval(timer);
      timeouts.forEach(clearTimeout);
      timeouts.clear();
    };
  },
};
