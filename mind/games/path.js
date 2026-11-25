// Firefly Path — watch a firefly hop between glowing stones, then retrace its route.
import { sfx as commonSfx } from '../common.js';

const CSS = `
.path-wrap { display: flex; flex-direction: column; align-items: center; width: 100%; user-select: none; -webkit-user-select: none; }
.path-lives { display: flex; gap: 7px; height: 26px; align-items: center; }
.path-life { width: 10px; height: 10px; border-radius: 50%; background: #e8f77a; box-shadow: 0 0 8px 2px rgba(232, 247, 122, 0.55); transition: background 0.3s, box-shadow 0.3s; }
.path-life.path-gone { background: var(--dim); box-shadow: none; }
.path-field {
  position: relative; width: min(100%, 440px, 60vh); aspect-ratio: 1; border-radius: 18px;
  background:
    radial-gradient(ellipse at 30% 20%, rgba(167, 139, 250, 0.10), transparent 60%),
    radial-gradient(ellipse at 75% 85%, rgba(74, 222, 128, 0.06), transparent 55%),
    #0d0d14;
  border: 1px solid var(--line); overflow: hidden; touch-action: manipulation;
}
.path-field.path-busy .path-spot { cursor: default; }
.path-spot {
  position: absolute; transform: translate(-50%, -50%); border-radius: 50%; border: 0; padding: 0;
  width: var(--path-d); height: var(--path-d);
  background: radial-gradient(circle at 40% 35%, #2a2840, #15141f 70%);
  box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.18), 0 0 0 0 rgba(232, 247, 122, 0);
  transition: background 0.25s, box-shadow 0.25s, transform 0.15s; cursor: pointer; touch-action: manipulation;
}
.path-spot::after { content: ''; position: absolute; inset: 38%; border-radius: 50%; background: rgba(167, 139, 250, 0.22); transition: background 0.25s; }
.path-field:not(.path-busy) .path-spot:hover { box-shadow: inset 0 0 0 1px rgba(167, 139, 250, 0.45); }
.path-spot.path-lit {
  background: radial-gradient(circle at 45% 40%, #fbffd0, #d9ec5c 45%, #6f7d1c 100%);
  box-shadow: 0 0 22px 6px rgba(232, 247, 122, 0.45); transform: translate(-50%, -50%) scale(1.06);
}
.path-spot.path-lit::after { background: rgba(255, 255, 255, 0.6); }
.path-spot.path-wrong { background: radial-gradient(circle, #ffb4b4, var(--bad) 60%, #5a1d1d); box-shadow: 0 0 20px 5px rgba(248, 113, 113, 0.45); }
.path-spot.path-hint { animation: path-hint 0.45s ease-in-out 3; }
@keyframes path-hint {
  0%, 100% { box-shadow: inset 0 0 0 2px rgba(232, 247, 122, 0.3); }
  50% { box-shadow: inset 0 0 0 3px #e8f77a, 0 0 24px 6px rgba(232, 247, 122, 0.5); }
}
.path-fly {
  position: absolute; left: 50%; top: 108%; width: 0; height: 0; pointer-events: none; opacity: 0;
  transition-property: left, top, opacity; transition-timing-function: cubic-bezier(0.45, 0, 0.3, 1);
}
.path-fly i { position: absolute; border-radius: 50%; transform: translate(-50%, -50%); }
.path-fly.path-head i {
  width: 16px; height: 16px; background: radial-gradient(circle, #ffffff, #f0ff9a 40%, #c8e03a 75%);
  box-shadow: 0 0 14px 6px rgba(232, 247, 122, 0.55), 0 0 40px 14px rgba(232, 247, 122, 0.2);
  animation: path-flicker 0.9s ease-in-out infinite alternate;
}
.path-fly.path-tail i { background: #e8f77a; box-shadow: 0 0 8px 2px rgba(232, 247, 122, 0.35); }
@keyframes path-flicker { from { filter: brightness(0.9); } to { filter: brightness(1.25); } }
.path-progress { display: flex; gap: 4px; justify-content: center; flex-wrap: wrap; min-height: 8px; margin-top: 14px; max-width: 440px; }
.path-progress span { width: 8px; height: 8px; border-radius: 50%; background: var(--panel-2); border: 1px solid var(--line); transition: background 0.2s; }
.path-progress span.path-done { background: #e8f77a; border-color: transparent; box-shadow: 0 0 6px rgba(232, 247, 122, 0.6); }
`;

function injectStyle() {
  if (document.getElementById('path-style')) return;
  const s = document.createElement('style');
  s.id = 'path-style';
  s.textContent = CSS;
  document.head.appendChild(s);
}

const ICON = `<svg xmlns="http://www.w3.org/2000/svg" width="48" height="48" viewBox="0 0 48 48">
<defs><radialGradient id="pathIconG" cx="50%" cy="50%" r="50%">
<stop offset="0" stop-color="#fff"/><stop offset=".35" stop-color="#f0ff9a"/><stop offset=".7" stop-color="#c8e03a" stop-opacity=".55"/><stop offset="1" stop-color="#c8e03a" stop-opacity="0"/></radialGradient></defs>
<g fill="#e8f77a"><circle cx="7" cy="39" r="1.6" opacity=".3"/><circle cx="12" cy="33" r="1.9" opacity=".42"/><circle cx="18" cy="29.5" r="2.2" opacity=".55"/><circle cx="24" cy="28" r="2.4" opacity=".7"/></g>
<circle cx="8" cy="12" r="3" fill="none" stroke="#a78bfa" stroke-opacity=".45" stroke-width="1.5"/>
<circle cx="40" cy="40" r="3" fill="none" stroke="#a78bfa" stroke-opacity=".45" stroke-width="1.5"/>
<circle cx="33" cy="20" r="13" fill="url(#pathIconG)"/><circle cx="33" cy="20" r="4.2" fill="#fff"/>
</svg>`;

// pentatonic steps so a rising run always sounds pleasant
const PENTA = [0, 2, 4, 7, 9];
const pitch = (step) => {
  const s = Math.min(step, 14);
  const semis = PENTA[s % 5] + 12 * Math.floor(s / 5);
  return 330 * Math.pow(2, semis / 12);
};

export default {
  id: 'path',
  title: 'Firefly Path',
  blurb: 'Follow the firefly’s flight across the stones, hop for hop.',
  rules: 'A firefly hops between glowing stones. When it lands, tap the same stones in the same order. Each path you finish adds one hop; three slips and the night is over.',
  icon: ICON,
  options: [
    { key: 'grid', label: 'Grid', choices: ['4x4', '5x5'], default: '5x5' },
    { key: 'speed', label: 'Speed', choices: ['Calm', 'Quick'], default: 'Calm' },
  ],
  score: { label: 'Longest path', order: 'desc', format: (v) => `${v} hops` },

  mount(el, { options = {}, finish, sfx = commonSfx }) {
    injectStyle();
    const n = String(options.grid || '5x5').startsWith('4') ? 4 : 5;
    const hop = options.speed === 'Quick' ? 420 : 650;
    const total = n * n;

    let stopped = false;
    let finished = false;
    let accepting = false;
    let onTap = null;
    const timers = new Set();
    const wait = (ms) => new Promise((r) => {
      const t = setTimeout(() => { timers.delete(t); r(); }, ms);
      timers.add(t);
    });

    // ---- DOM ----
    el.innerHTML = `
      <div class="path-wrap">
        <div class="hud">
          <div class="stat"><span>Path length</span><b data-k="len">3</b></div>
          <div class="stat"><span>Best</span><b data-k="best">0</b></div>
          <div class="stat"><span>Lives</span><div class="path-lives" data-k="lives"></div></div>
        </div>
        <div class="game-msg" data-k="msg">&nbsp;</div>
        <div class="path-field path-busy" data-k="field"></div>
        <div class="path-progress" data-k="prog"></div>
      </div>`;
    const q = (k) => el.querySelector(`[data-k="${k}"]`);
    const lenEl = q('len'), bestEl = q('best'), livesEl = q('lives'), msgEl = q('msg'), field = q('field'), prog = q('prog');

    const cell = 100 / n;
    field.style.setProperty('--path-d', `${cell * 0.56}%`);
    const pos = (i) => ({ x: (i % n + 0.5) * cell, y: (Math.floor(i / n) + 0.5) * cell });
    // gentle organic jitter so it feels like a meadow, not a spreadsheet
    const jitter = Array.from({ length: total }, () => ({ x: (Math.random() - 0.5) * cell * 0.22, y: (Math.random() - 0.5) * cell * 0.22 }));
    const at = (i) => ({ x: pos(i).x + jitter[i].x, y: pos(i).y + jitter[i].y });

    const spots = [];
    for (let i = 0; i < total; i++) {
      const b = document.createElement('button');
      b.className = 'path-spot';
      b.type = 'button';
      b.setAttribute('aria-label', `Stone ${i + 1}`);
      const p = at(i);
      b.style.left = `${p.x}%`;
      b.style.top = `${p.y}%`;
      b.addEventListener('pointerdown', (e) => {
        e.preventDefault();
        if (accepting && onTap) onTap(i);
      });
      field.appendChild(b);
      spots.push(b);
    }

    // firefly: one head + a few lagging tail dots (longer transitions => soft trail)
    const TAIL = 5;
    const flies = [];
    for (let k = TAIL; k >= 0; k--) {
      const f = document.createElement('div');
      f.className = 'path-fly ' + (k === 0 ? 'path-head' : 'path-tail');
      const dot = document.createElement('i');
      if (k > 0) {
        const size = 9 - k * 1.2;
        dot.style.width = dot.style.height = `${size}px`;
        dot.style.opacity = String(0.55 - k * 0.08);
      }
      f.appendChild(dot);
      f.dataset.lag = String(k);
      field.appendChild(f);
      flies.push(f);
    }
    const moveFly = (x, y, travel, visible = true) => {
      for (const f of flies) {
        const lag = Number(f.dataset.lag);
        f.style.transitionDuration = `${travel + lag * 55}ms, ${travel + lag * 55}ms, 300ms`;
        f.style.left = `${x}%`;
        f.style.top = `${y}%`;
        f.style.opacity = visible ? '1' : '0';
      }
    };

    // ---- state ----
    let length = 3, best = 0, lives = 3, rounds = 0;
    const renderHud = () => {
      lenEl.textContent = length;
      bestEl.textContent = best;
      livesEl.innerHTML = [0, 1, 2].map((i) => `<span class="path-life${i < lives ? '' : ' path-gone'}"></span>`).join('');
    };
    const renderProg = (done) => {
      prog.innerHTML = Array.from({ length }, (_, i) => `<span class="${i < done ? 'path-done' : ''}"></span>`).join('');
    };
    const say = (t) => { msgEl.textContent = t; };
    const flash = (i, ms, cls = 'path-lit') => {
      spots[i].classList.add(cls);
      const t = setTimeout(() => { timers.delete(t); spots[i].classList.remove(cls); }, ms);
      timers.add(t);
    };

    const makePath = (len) => {
      const p = [];
      for (let k = 0; k < len; k++) {
        let s;
        do { s = Math.floor(Math.random() * total); } while (k > 0 && s === p[k - 1]);
        p.push(s);
      }
      return p;
    };

    async function fly(path) {
      field.classList.add('path-busy');
      // start just below the field, out of sight
      moveFly(50, 108, 0, false);
      await wait(60);
      const travel = Math.round(hop * 0.62);
      for (let k = 0; k < path.length; k++) {
        if (stopped) return;
        const p = at(path[k]);
        moveFly(p.x, p.y, k === 0 ? travel + 150 : travel, true);
        await wait(k === 0 ? travel + 150 : travel);
        if (stopped) return;
        flash(path[k], hop - travel + 120);
        sfx.tone(pitch(k), 130, 'sine', 0.08);
        await wait(hop - travel + 60);
      }
      if (stopped) return;
      await wait(120);
      // drift off and fade
      const last = at(path[path.length - 1]);
      moveFly(last.x, last.y - 8, 400, false);
      await wait(420);
    }

    // resolves true if the whole path is tapped correctly, false on first mistake
    function listen(path) {
      return new Promise((resolve) => {
        let step = 0;
        field.classList.remove('path-busy');
        accepting = true;
        onTap = (i) => {
          if (!accepting) return;
          if (i === path[step]) {
            flash(i, 260);
            sfx.tone(pitch(step), 150, 'sine', 0.1);
            step++;
            renderProg(step);
            if (step === path.length) {
              accepting = false;
              onTap = null;
              resolve({ ok: true });
            }
          } else {
            accepting = false;
            onTap = null;
            resolve({ ok: false, wrong: i, expected: path[step] });
          }
        };
      });
    }

    async function run() {
      renderHud();
      renderProg(0);
      await wait(500);
      while (!stopped && lives > 0) {
        const path = makePath(length);
        renderHud();
        renderProg(0);
        say('Watch the firefly…');
        await fly(path);
        if (stopped) return;
        say('Your turn');
        const res = await listen(path);
        if (stopped) return;
        field.classList.add('path-busy');
        if (res.ok) {
          best = Math.max(best, length);
          rounds++;
          say(`Nice — ${length} hops!`);
          await wait(220);
          if (stopped) return;
          sfx.good();
          length++;
          renderHud();
          await wait(800);
        } else {
          lives--;
          renderHud();
          sfx.bad();
          flash(res.wrong, 700, 'path-wrong');
          spots[res.expected].classList.add('path-hint');
          field.classList.remove('shake');
          void field.offsetWidth;
          field.classList.add('shake');
          say(lives > 0 ? 'Not that one — the glow shows where it went' : 'The firefly slipped away');
          await wait(1400);
          spots[res.expected].classList.remove('path-hint');
          field.classList.remove('shake');
          if (stopped) return;
        }
      }
      if (stopped || finished) return;
      finished = true;
      finish({ score: best, detail: `${rounds} round${rounds === 1 ? '' : 's'} cleared` });
    }

    run();

    return () => {
      stopped = true;
      accepting = false;
      onTap = null;
      for (const t of timers) clearTimeout(t);
      timers.clear();
    };
  },
};
