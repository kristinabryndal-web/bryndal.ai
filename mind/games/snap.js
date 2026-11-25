// Snap: a timed same-or-different (n-back) game for Contest of the Mind.
import { sfx as commonSfx } from '../common.js?v=4';

const SHAPES = ['circle', 'square', 'triangle', 'star', 'diamond', 'hexagon'];
const COLORS = ['--c1', '--c2', '--c3', '--c4'];

const poly = (n, r, rot = -90, r2 = null) => {
  const pts = [];
  const count = r2 ? n * 2 : n;
  for (let i = 0; i < count; i++) {
    const a = ((rot + (360 / count) * i) * Math.PI) / 180;
    const rr = r2 && i % 2 ? r2 : r;
    pts.push(`${(50 + rr * Math.cos(a)).toFixed(1)},${(50 + rr * Math.sin(a)).toFixed(1)}`);
  }
  return pts.join(' ');
};

function shapeMarkup(shape, color) {
  const st = `style="fill:var(${color})"`;
  switch (shape) {
    case 'circle': return `<circle cx="50" cy="50" r="34" ${st}/>`;
    case 'square': return `<rect x="19" y="19" width="62" height="62" rx="8" ${st}/>`;
    case 'triangle': return `<polygon points="${poly(3, 40, -90)}" transform="translate(0 6)" stroke-linejoin="round" ${st}/>`;
    case 'star': return `<polygon points="${poly(5, 40, -90, 17)}" ${st}/>`;
    case 'diamond': return `<polygon points="50,10 86,50 50,90 14,50" ${st}/>`;
    case 'hexagon': return `<polygon points="${poly(6, 38, 0)}" ${st}/>`;
  }
  return '';
}
const symbolSvg = (c) =>
  `<svg class="snap-sym" viewBox="0 0 100 100" aria-hidden="true">${shapeMarkup(c.shape, c.color)}</svg>`;

const pick = (a) => a[Math.floor(Math.random() * a.length)];
const same = (a, b) => a.shape === b.shape && a.color === b.color;

// Build the next card given the full history so far.
function nextCard(seq, back) {
  if (seq.length < back) return { shape: pick(SHAPES), color: pick(COLORS) };
  const target = seq[seq.length - back];
  const r = Math.random();
  if (r < 0.4) return { ...target }; // deliberate match
  let card;
  if (r < 0.62) card = { shape: target.shape, color: pick(COLORS.filter((c) => c !== target.color)) };
  else if (r < 0.84) card = { shape: pick(SHAPES.filter((s) => s !== target.shape)), color: target.color };
  else {
    do card = { shape: pick(SHAPES), color: pick(COLORS) };
    while (same(card, target));
  }
  return card;
}

const CSS = `
.snap-wrap { display:flex; flex-direction:column; align-items:center; max-width:460px; margin:0 auto; padding:0 4px; user-select:none; -webkit-user-select:none; }
.snap-hud .stat b { transition: color .2s; }
.snap-mult { display:inline-block; }
.snap-mult.snap-pop { animation: snap-pop .5s ease-out; color: var(--accent); }
@keyframes snap-pop { 0%{transform:scale(1)} 35%{transform:scale(1.7) rotate(-6deg); text-shadow:0 0 18px var(--accent)} 100%{transform:scale(1)} }
.snap-time.snap-low { color: var(--warn); }
.snap-hint { font-size:13px; color:var(--muted); text-align:center; margin:-4px 0 14px; min-height:18px; }
.snap-hint b { color: var(--accent); font-weight:600; }
.snap-stage { position:relative; width:min(62vw, 230px); aspect-ratio: 3 / 4; margin: 6px 0 4px; }
.snap-card { position:absolute; inset:0; border-radius:18px; background:linear-gradient(160deg,#1c1a28,#13121b); border:1px solid var(--line);
  box-shadow:0 10px 30px rgba(0,0,0,.45); display:flex; align-items:center; justify-content:center; transition: transform .28s ease, opacity .28s ease, filter .28s; }
.snap-card::after { content:''; position:absolute; inset:8px; border-radius:12px; border:1px dashed rgba(255,255,255,.06); pointer-events:none; }
.snap-card.snap-in { animation: snap-in .26s cubic-bezier(.2,.8,.3,1.1); }
@keyframes snap-in { from { transform: translateX(70%) rotate(8deg); opacity:0 } to { transform:none; opacity:1 } }
.snap-card.snap-under { transform: translate(-10px, 8px) rotate(-5deg) scale(.95); filter: brightness(.45); }
.snap-card.snap-blank { background: var(--panel); border-style:dashed; box-shadow:none; }
.snap-sym { width:62%; height:auto; filter: drop-shadow(0 4px 10px rgba(0,0,0,.35)); }
.snap-flash { position:absolute; inset:-6px; border-radius:22px; pointer-events:none; opacity:0; z-index:5; }
.snap-flash.snap-ok { animation: snap-flash .38s ease-out; box-shadow: 0 0 0 3px var(--good), 0 0 30px var(--good); }
.snap-flash.snap-no { animation: snap-flash .45s ease-out; box-shadow: 0 0 0 3px var(--bad), 0 0 30px var(--bad); background: rgba(248,113,113,.12); }
@keyframes snap-flash { 0%{opacity:1} 100%{opacity:0} }
.snap-tag { font-size:10px; letter-spacing:.18em; text-transform:uppercase; color:var(--accent); min-height:14px; margin-top:10px; }
.snap-controls { display:flex; gap:12px; width:100%; margin-top:14px; }
.snap-controls .btn { flex:1; padding:18px 10px; font-size:17px; border-radius:14px; touch-action: manipulation; }
.snap-controls .snap-diff { background: var(--panel-2); color: var(--text); border:1px solid var(--line); }
.snap-controls .snap-same { background: var(--accent); }
.snap-controls .btn small { display:block; font-size:11px; font-weight:500; opacity:.6; margin-top:2px; }
.snap-controls .snap-wide { flex:1; }
.snap-pts-float { position:absolute; top:-6px; left:50%; transform:translateX(-50%); font-family:var(--display); font-weight:800; color:var(--good);
  pointer-events:none; animation: snap-float .7s ease-out forwards; z-index:6; font-size:18px; }
@keyframes snap-float { from{opacity:1; transform:translate(-50%,0)} to{opacity:0; transform:translate(-50%,-34px)} }
@media (hover:none) { .snap-controls .btn small { display:none; } }
`;

export default {
  id: 'snap',
  title: 'Snap',
  blurb: 'Same or different? Match each card against the one before, against the clock.',
  rules:
    'Cards flip in one after another. Decide whether each card is the Same as the card N back or Different. ' +
    'Watch out: lookalikes share a shape or a colour but not both. Correct streaks build a multiplier up to x5; a miss resets it.',
  icon: `<svg viewBox="0 0 48 48" width="48" height="48" xmlns="http://www.w3.org/2000/svg">
  <rect x="5" y="9" width="22" height="30" rx="4" transform="rotate(-10 16 24)" fill="#1c1a28" stroke="#f472b6" stroke-width="2"/>
  <circle cx="15.5" cy="24" r="5.5" fill="#f472b6" transform="rotate(-10 16 24)"/>
  <rect x="19" y="8" width="22" height="30" rx="4" transform="rotate(8 30 23)" fill="#211d33" stroke="#a78bfa" stroke-width="2"/>
  <circle cx="30" cy="22" r="5.5" fill="#f472b6" transform="rotate(8 30 23)"/>
  <circle cx="37" cy="36" r="8" fill="#4ade80"/>
  <path d="M33.2 36.2l2.6 2.6 4.8-5" fill="none" stroke="#0b0b0e" stroke-width="2.4" stroke-linecap="round" stroke-linejoin="round"/>
</svg>`,
  options: [
    { key: 'back', label: 'Compare with', unit: 'back', choices: [1, 2], default: 1 },
    { key: 'time', label: 'Seconds', unit: 'sec', choices: [30, 45, 60], default: 45 },
  ],
  score: { label: 'Points', order: 'desc', format: (v) => `${v}` },

  mount(el, { options = {}, finish, sfx = commonSfx }) {
    const back = Number(options.back) === 2 ? 2 : 1;
    const totalSec = [30, 45, 60].includes(Number(options.time)) ? Number(options.time) : 45;

    if (!document.getElementById('snap-style')) {
      const s = document.createElement('style');
      s.id = 'snap-style';
      s.textContent = CSS;
      document.head.appendChild(s);
    }

    el.innerHTML = `
      <div class="snap-wrap">
        <div class="hud snap-hud">
          <div class="stat"><span>Time left</span><b class="snap-time">${totalSec}.0</b></div>
          <div class="stat"><span>Points</span><b class="snap-pts">0</b></div>
          <div class="stat"><span>Multiplier</span><b><span class="snap-mult">x1</span></b></div>
        </div>
        <div class="snap-hint">${
          back === 1
            ? 'Is this card the <b>same</b> as the card <b>just before</b> it?'
            : 'Compare with the card <b>two before</b> this one, not the last one.'
        }</div>
        <div class="snap-stage"><div class="snap-card snap-blank"></div><div class="snap-flash"></div></div>
        <div class="snap-tag"></div>
        <div class="game-msg snap-msg">Press Start when you are ready.</div>
        <div class="snap-controls"></div>
      </div>`;

    const $ = (sel) => el.querySelector(sel);
    const timeEl = $('.snap-time'), ptsEl = $('.snap-pts'), multEl = $('.snap-mult');
    const stage = $('.snap-stage'), flash = $('.snap-flash'), tag = $('.snap-tag');
    const msg = $('.snap-msg'), controls = $('.snap-controls');

    const seq = [];
    let phase = 'idle'; // idle | memo | play | done
    let points = 0, correct = 0, answered = 0, streak = 0, mult = 1, maxMult = 1;
    let endAt = 0, tickId = null, autoId = null, locked = false, finished = false;
    const timeouts = new Set();
    const later = (fn, ms) => { const id = setTimeout(() => { timeouts.delete(id); fn(); }, ms); timeouts.add(id); return id; };

    function dealCard() {
      const card = nextCard(seq, back);
      seq.push(card);
      stage.querySelectorAll('.snap-card.snap-under').forEach((n) => n.remove());
      stage.querySelectorAll('.snap-card:not(.snap-under)').forEach((n) => n.classList.add('snap-under'));
      const c = document.createElement('div');
      c.className = 'snap-card snap-in';
      c.innerHTML = symbolSvg(card);
      stage.insertBefore(c, flash);
    }

    function setControls(html) { controls.innerHTML = html; }

    function showStart() {
      setControls(`<button class="btn snap-wide snap-start">Start</button>`);
      controls.querySelector('.snap-start').addEventListener('click', start);
    }

    function start() {
      if (phase !== 'idle') return;
      sfx.click();
      phase = 'memo';
      stage.querySelectorAll('.snap-card').forEach((n) => n.remove());
      memoStep();
    }

    function memoStep() {
      dealCard();
      const left = back - seq.length;
      tag.textContent = 'Remember this';
      msg.textContent = left > 0 ? 'Memorise it. Another card is coming.' : 'Got it? The next card is the first question.';
      setControls(`<button class="btn ghost snap-wide snap-next">Next <small>Space</small></button>`);
      controls.querySelector('.snap-next').addEventListener('click', advanceMemo);
      clearTimeout(autoId);
      autoId = later(advanceMemo, 1000);
    }

    function advanceMemo() {
      if (phase !== 'memo') return;
      clearTimeout(autoId); timeouts.delete(autoId);
      if (seq.length < back) memoStep();
      else beginPlay();
    }

    function beginPlay() {
      phase = 'play';
      dealCard();
      tag.textContent = '';
      msg.textContent = back === 1 ? 'Same as the previous card?' : 'Same as the card two back?';
      setControls(`
        <button class="btn snap-diff">Different <small>← key</small></button>
        <button class="btn snap-same">Same <small>→ key</small></button>`);
      controls.querySelector('.snap-diff').addEventListener('click', () => answer(false));
      controls.querySelector('.snap-same').addEventListener('click', () => answer(true));
      endAt = performance.now() + totalSec * 1000;
      tickId = setInterval(tick, 100);
    }

    function tick() {
      const rem = Math.max(0, endAt - performance.now());
      timeEl.textContent = (rem / 1000).toFixed(1);
      timeEl.classList.toggle('snap-low', rem < 10000);
      if (rem <= 0) end();
    }

    function doFlash(ok) {
      flash.className = 'snap-flash';
      void flash.offsetWidth;
      flash.className = `snap-flash ${ok ? 'snap-ok' : 'snap-no'}`;
    }

    function answer(saidSame) {
      if (phase !== 'play' || locked) return;
      const cur = seq[seq.length - 1];
      const target = seq[seq.length - 1 - back];
      const isSame = same(cur, target);
      answered++;
      if (saidSame === isSame) {
        correct++;
        streak++;
        const gained = 10 * mult;
        points += gained;
        const newMult = Math.min(5, 1 + Math.floor(streak / 4));
        if (newMult > mult) {
          mult = newMult;
          maxMult = Math.max(maxMult, mult);
          multEl.classList.remove('snap-pop'); void multEl.offsetWidth; multEl.classList.add('snap-pop');
          sfx.good();
        } else sfx.click();
        doFlash(true);
        const f = document.createElement('div');
        f.className = 'snap-pts-float';
        f.textContent = `+${gained}`;
        stage.appendChild(f);
        later(() => f.remove(), 700);
        msg.textContent = isSame ? 'Yes, a match.' : 'Right, different.';
      } else {
        sfx.bad();
        doFlash(false);
        streak = 0; mult = 1;
        stage.classList.remove('shake'); void stage.offsetWidth; stage.classList.add('shake');
        msg.textContent = isSame ? 'That one was the same.' : 'That one was different.';
      }
      ptsEl.textContent = points;
      multEl.textContent = `x${mult}`;
      locked = true;
      later(() => { locked = false; if (phase === 'play') dealCard(); }, 140);
    }

    function end() {
      if (finished) return;
      finished = true;
      phase = 'done';
      clearInterval(tickId);
      timeEl.textContent = '0.0';
      setControls('');
      msg.textContent = "Time's up!";
      tag.textContent = '';
      finish({ score: points, detail: `${correct}/${answered} right · best x${maxMult}` });
    }

    function onKey(e) {
      if (e.repeat || e.metaKey || e.ctrlKey || e.altKey) return;
      if (phase === 'play') {
        if (e.key === 'ArrowLeft') { e.preventDefault(); answer(false); }
        else if (e.key === 'ArrowRight') { e.preventDefault(); answer(true); }
      } else if (phase === 'memo') {
        if (e.key === ' ' || e.key === 'Enter' || e.key === 'ArrowRight') { e.preventDefault(); advanceMemo(); }
      } else if (phase === 'idle' && (e.key === 'Enter' || e.key === ' ')) {
        if (document.activeElement && document.activeElement.tagName === 'BUTTON' && !el.contains(document.activeElement)) return;
        e.preventDefault(); start();
      }
    }
    document.addEventListener('keydown', onKey);
    showStart();

    return () => {
      finished = true;
      phase = 'done';
      clearInterval(tickId);
      timeouts.forEach(clearTimeout);
      timeouts.clear();
      document.removeEventListener('keydown', onKey);
    };
  },
};
