// Flash Grid: a pattern of tiles glows for a moment; tap the ones that were lit.
import { shuffle } from '../common.js';

const CSS = `
.flash-wrap { display: flex; flex-direction: column; align-items: center; }
.flash-lives { display: flex; gap: 6px; height: 22px; align-items: center; }
.flash-dot { width: 11px; height: 11px; border-radius: 50%; background: var(--accent); box-shadow: 0 0 8px rgba(167,139,250,.6); transition: background .3s, box-shadow .3s; }
.flash-dot.flash-gone { background: var(--dim); box-shadow: none; }
.flash-board { width: min(92vw, 480px, 62svh); aspect-ratio: 1; display: grid; gap: clamp(5px, 1.6vw, 10px);
  padding: clamp(8px, 2vw, 14px); background: var(--panel); border: 1px solid var(--line); border-radius: 18px; touch-action: manipulation; }
.flash-tile { position: relative; border: 1px solid var(--line); background: var(--panel-2); border-radius: 22%;
  transition: background .18s, box-shadow .18s, border-color .18s, transform .12s; padding: 0; }
.flash-board.flash-live .flash-tile:not(.flash-on):not(.flash-x):hover { border-color: rgba(167,139,250,.45); }
.flash-tile:active { transform: scale(.94); }
.flash-tile.flash-on { background: var(--accent); border-color: transparent;
  box-shadow: 0 0 18px rgba(167,139,250,.65), inset 0 0 0 2px rgba(255,255,255,.18); animation: flash-pop .32s cubic-bezier(.3,1.6,.5,1); }
.flash-tile.flash-miss { background: var(--accent-soft); border: 2px dashed var(--accent); animation: flash-pop .32s ease-out; }
.flash-tile.flash-x { background: rgba(248,113,113,.14); border-color: var(--bad); animation: flash-pop .28s ease-out; }
.flash-tile.flash-x::before, .flash-tile.flash-x::after { content: ''; position: absolute; left: 50%; top: 50%; width: 46%; height: 9%;
  min-height: 3px; background: var(--bad); border-radius: 3px; }
.flash-tile.flash-x::before { transform: translate(-50%,-50%) rotate(45deg); }
.flash-tile.flash-x::after { transform: translate(-50%,-50%) rotate(-45deg); }
.flash-board.flash-enter .flash-tile { animation: flash-in .34s ease-out backwards; }
@keyframes flash-pop { 0% { transform: scale(.7) } 60% { transform: scale(1.09) } 100% { transform: scale(1) } }
@keyframes flash-in { from { transform: scale(.4); opacity: 0 } to { transform: scale(1); opacity: 1 } }
.flash-start { margin-top: 18px; }
`;

function injectCss() {
  if (document.getElementById('flash-style')) return;
  const s = document.createElement('style');
  s.id = 'flash-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

// lit tiles = level + 2; grid grows with level and keeps lit under ~45%
function sizeFor(level) {
  const lit = level + 2;
  let n = level >= 12 ? 6 : level >= 8 ? 5 : level >= 4 ? 4 : 3;
  while (lit > 0.45 * n * n && n < 8) n++;
  return { n, lit };
}

const icon = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48" fill="none">
<rect x="1" y="1" width="46" height="46" rx="11" fill="#a78bfa" fill-opacity=".08" stroke="#a78bfa" stroke-opacity=".3"/>
<g fill="#ffffff" fill-opacity=".1">
<rect x="7" y="7" width="10" height="10" rx="3"/><rect x="31" y="7" width="10" height="10" rx="3"/>
<rect x="7" y="19" width="10" height="10" rx="3"/><rect x="19" y="19" width="10" height="10" rx="3"/>
<rect x="19" y="31" width="10" height="10" rx="3"/><rect x="31" y="31" width="10" height="10" rx="3"/></g>
<g fill="#a78bfa"><rect x="19" y="7" width="10" height="10" rx="3"/><rect x="31" y="19" width="10" height="10" rx="3"/>
<rect x="7" y="31" width="10" height="10" rx="3"/></g>
<g fill="#a78bfa" opacity=".35"><rect x="17.5" y="5.5" width="13" height="13" rx="4" fill="none" stroke="#a78bfa"/>
<rect x="29.5" y="17.5" width="13" height="13" rx="4" fill="none" stroke="#a78bfa"/><rect x="5.5" y="29.5" width="13" height="13" rx="4" fill="none" stroke="#a78bfa"/></g>
</svg>`;

export default {
  id: 'flash',
  title: 'Flash Grid',
  blurb: 'Tiles glow for a blink. Tap every one you saw.',
  rules: 'A few tiles light up for a moment, then go dark. Tap all the tiles that were lit, in any order. Three wrong taps costs a life and a fresh pattern; you have three lives, and each level adds another tile.',
  icon,
  options: [{ key: 'flash', label: 'Flash', choices: ['1 second', 'Half second'], default: '1 second' }],
  score: { label: 'Level', order: 'desc', format: (v) => `Level ${v}` },

  mount(el, { options, finish, sfx }) {
    injectCss();
    const showMs = options?.flash === 'Half second' ? 500 : 1000;
    let stopped = false;
    const timers = new Set();
    const sleep = (ms) => new Promise((r) => { const id = setTimeout(() => { timers.delete(id); r(); }, ms); timers.add(id); });
    let level = 1, lives = 3, cleared = 0, tilesFound = 0;
    let lit = new Set(), found = new Set(), wrong = 0, accepting = false, n = 3, done = false;

    el.innerHTML = `
      <div class="flash-wrap">
        <div class="hud">
          <div class="stat"><span>Level</span><b class="flash-level">1</b></div>
          <div class="stat"><span>Lives</span><b class="flash-lives"></b></div>
          <div class="stat"><span>Tiles left</span><b class="flash-left">–</b></div>
        </div>
        <div class="game-msg flash-msg">Watch the grid, then tap the tiles that glowed.</div>
        <div class="flash-board"></div>
        <button class="btn flash-start">Start</button>
      </div>`;
    const $ = (s) => el.querySelector(s);
    const board = $('.flash-board'), msg = $('.flash-msg'), startBtn = $('.flash-start');
    let tiles = [];

    const hud = () => {
      $('.flash-level').textContent = level;
      $('.flash-lives').innerHTML = [0, 1, 2].map((i) => `<i class="flash-dot${i < lives ? '' : ' flash-gone'}"></i>`).join('');
      $('.flash-left').textContent = lit.size ? lit.size - found.size : '–';
    };

    const build = (size) => {
      n = size;
      board.style.gridTemplateColumns = `repeat(${n}, 1fr)`;
      board.innerHTML = '';
      tiles = [];
      for (let i = 0; i < n * n; i++) {
        const t = document.createElement('button');
        t.className = 'flash-tile';
        t.dataset.i = i;
        t.setAttribute('aria-label', `Tile ${i + 1}`);
        t.style.animationDelay = `${((i % n) + Math.floor(i / n)) * 28}ms`;
        board.appendChild(t);
        tiles.push(t);
      }
      board.classList.remove('flash-enter');
      void board.offsetWidth;
      board.classList.add('flash-enter');
    };
    build(3);
    hud();

    async function playLevel() {
      const { n: size, lit: count } = sizeFor(level);
      if (size !== n || tiles.some((t) => t.className !== 'flash-tile')) build(size);
      lit = new Set(shuffle([...Array(size * size).keys()]).slice(0, count));
      found = new Set();
      wrong = 0;
      accepting = false;
      board.classList.remove('flash-live');
      hud();
      msg.textContent = 'Memorise…';
      await sleep(550);
      if (stopped) return;
      lit.forEach((i) => tiles[i].classList.add('flash-on'));
      await sleep(showMs);
      if (stopped) return;
      lit.forEach((i) => tiles[i].classList.remove('flash-on'));
      await sleep(250);
      if (stopped) return;
      msg.textContent = 'Your turn';
      accepting = true;
      board.classList.add('flash-live');
    }

    async function onTap(e) {
      const t = e.target.closest('.flash-tile');
      if (!t || !accepting || stopped || done) return;
      const i = +t.dataset.i;
      if (found.has(i) || t.classList.contains('flash-x')) return;
      if (lit.has(i)) {
        found.add(i);
        tilesFound++;
        t.classList.add('flash-on');
        sfx.tone(440 * Math.pow(2, (found.size - 1) * 2 / 12), 140, 'sine', 0.1);
        hud();
        if (found.size === lit.size) {
          accepting = false;
          board.classList.remove('flash-live');
          cleared = level;
          msg.textContent = 'Got them all!';
          await sleep(160);
          if (stopped) return;
          sfx.good();
          await sleep(750);
          if (stopped) return;
          level++;
          for (const tile of tiles) tile.className = 'flash-tile';
          playLevel();
        }
      } else {
        wrong++;
        t.classList.add('flash-x');
        sfx.bad();
        if (wrong >= 3) {
          accepting = false;
          board.classList.remove('flash-live');
          lives--;
          hud();
          board.classList.add('shake');
          lit.forEach((j) => { if (!found.has(j)) tiles[j].classList.add('flash-miss'); });
          msg.textContent = lives > 0 ? 'Missed — here’s where they were' : 'Out of lives';
          await sleep(1500);
          if (stopped) return;
          board.classList.remove('shake');
          if (lives <= 0) {
            done = true;
            finish({ score: cleared, detail: `${tilesFound} tiles remembered` });
            return;
          }
          for (const tile of tiles) tile.className = 'flash-tile';
          playLevel();
        } else {
          msg.textContent = `Your turn · ${3 - wrong} miss${3 - wrong === 1 ? '' : 'es'} left`;
        }
      }
    }

    board.addEventListener('pointerdown', onTap);
    startBtn.addEventListener('click', () => {
      sfx.click();
      startBtn.remove();
      playLevel();
    });

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      timers.clear();
      accepting = false;
      board.removeEventListener('pointerdown', onTap);
    };
  },
};
