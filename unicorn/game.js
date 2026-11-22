import { N, DIRS, PARTS, EYE, NOSTRIL, makeMaze, route } from './maze.js?v=13';

const $ = (id) => document.getElementById(id);
const canvas = $('c'), ctx = canvas.getContext('2d');

// ---------- save (just your best time) ----------
let save = { best: 0, solved: 0 };
try { Object.assign(save, JSON.parse(localStorage.getItem('unicorn-maze-2') || '{}')); } catch {}
const persist = () => { try { localStorage.setItem('unicorn-maze-2', JSON.stringify(save)); } catch {} };

// ---------- state ----------
const G = { state: 'menu', L: null, time: 0, seed: 1 };
const P = { cell: 0, px: 0, py: 0 };   // px/py: where the light is drawn (eases toward its cell)
let trail = [];                        // cells walked, start first; backtracking pops
let queue = [];                        // cells still to walk for the current drag/tap
let view = { W: 0, H: 0, dpr: 1, S: 0, ox: 0, oy: 0, cell: 1 };
let board = null, sky = null, stars = [], motes = [];
const xy = (c) => [c % N, (c / N) | 0];

// ---------- the unicorn's coat ----------
// Each cell is shaded as if the limb it sits on were round and lit by the moon
// from the upper left: bright along the lit side, falling to blue-grey in shadow.
function cellColour(L, c) {
  const region = L.region[c], e = Math.min(1, L.edge[c]);
  const lit = -(L.nx[c] * 0.55 + L.ny[c] * 0.83);            // -1 (away from the moon) .. 1 (facing it)
  const grain = (((c * 2654435761) >>> 0) % 9 - 4) / 4;      // faint mottling
  if (region === 'hoof') return `hsl(232, 16%, ${24 + lit * 7 + grain}%)`;
  if (region === 'horn') { const [x, y] = xy(c); return `hsl(${42 + grain * 3}, 58%, ${(x + y * 2) % 3 ? 76 : 62}%)`; }
  if (region === 'mane' || region === 'tail') return `hsl(${40 + grain * 4}, ${26 + grain * 4}%, ${82 - e * e * 13 + lit * 6 + grain * 2.5}%)`;
  return `hsl(${226 + grain * 2}, ${14 + e * 14}%, ${Math.min(97.5, 88 - e * e * 17 + lit * 9 + grain * 0.8)}%)`;
}

// ---------- layout, sky, and the pre-drawn unicorn ----------
function layout() {
  const dpr = Math.min(devicePixelRatio || 1, 2), W = innerWidth, H = innerHeight;
  canvas.width = W * dpr; canvas.height = H * dpr;
  const top = 66, pad = Math.max(6, Math.min(W, H) * 0.012);
  const S = Math.max(50, Math.min(W - pad * 2, H - top - pad));
  view = { W, H, dpr, S, ox: (W - S) / 2, oy: top + (H - top - pad - S) / 2, cell: S / N };
  // night sky with a low moon, painted once
  sky = document.createElement('canvas'); sky.width = W * dpr; sky.height = H * dpr;
  const s = sky.getContext('2d'); s.scale(dpr, dpr);
  let g = s.createLinearGradient(0, 0, 0, H);
  g.addColorStop(0, '#070b1e'); g.addColorStop(0.55, '#141a3f'); g.addColorStop(1, '#2b2350');
  s.fillStyle = g; s.fillRect(0, 0, W, H);
  const mx = view.ox + S * 0.2, my = view.oy + S * 0.2, mr = S * 0.11;
  g = s.createRadialGradient(mx, my, mr * 0.2, mx, my, mr * 5.5);
  g.addColorStop(0, 'rgba(190,205,255,.42)'); g.addColorStop(0.25, 'rgba(120,140,230,.16)'); g.addColorStop(1, 'rgba(120,140,230,0)');
  s.fillStyle = g; s.fillRect(0, 0, W, H);
  g = s.createRadialGradient(mx - mr * 0.3, my - mr * 0.3, mr * 0.1, mx, my, mr);
  g.addColorStop(0, '#fdfcf2'); g.addColorStop(0.8, '#dfe3f3'); g.addColorStop(1, '#c2c9e6');
  s.fillStyle = g; s.beginPath(); s.arc(mx, my, mr, 0, 6.3); s.fill();
  s.fillStyle = 'rgba(150,160,200,.22)';
  for (const [a, b, q] of [[-0.3, 0.2, 0.2], [0.25, -0.25, 0.14], [0.2, 0.4, 0.1], [-0.45, -0.3, 0.09]]) { s.beginPath(); s.arc(mx + a * mr, my + b * mr, q * mr, 0, 6.3); s.fill(); }
  // mist along the ground
  g = s.createLinearGradient(0, H * 0.72, 0, H);
  g.addColorStop(0, 'rgba(140,150,220,0)'); g.addColorStop(1, 'rgba(140,150,220,.2)');
  s.fillStyle = g; s.fillRect(0, H * 0.72, W, H * 0.28);
  stars = Array.from({ length: 150 }, () => ({ x: Math.random() * W, y: Math.random() * H * 0.9, r: 0.4 + Math.random() * 1.3, p: Math.random() * 6.28, s: 0.6 + Math.random() * 2 }));
  motes = Array.from({ length: 26 }, () => ({ x: Math.random() * W, y: Math.random() * H, r: 1 + Math.random() * 2, v: 5 + Math.random() * 12, w: Math.random() * 6.28 }));
  if (G.L) drawBoard();
}

function capsule(c, p, k, grow) { // one tapered limb, scaled by k and fattened by grow
  const a = Math.atan2(p.y2 - p.y1, p.x2 - p.x1), r1 = p.r1 * k + grow, r2 = p.r2 * k + grow;
  c.beginPath();
  c.arc(p.x1 * k, p.y1 * k, r1, a + Math.PI / 2, a - Math.PI / 2);
  c.arc(p.x2 * k, p.y2 * k, r2, a - Math.PI / 2, a + Math.PI / 2);
  c.closePath(); c.fill();
}

function drawBoard() {
  const L = G.L, { S, dpr } = view, u = S / N, k = S / 100;
  board = document.createElement('canvas');
  board.width = Math.ceil(S * dpr); board.height = Math.ceil(S * dpr);
  const c = board.getContext('2d');
  c.scale(dpr, dpr);
  // a soft, smooth body under the grid so the outline reads as an animal rather than as blocks
  c.fillStyle = 'rgba(226,232,255,.5)';
  for (const p of PARTS) capsule(c, p, k, u * 0.45);
  // the coat, one shaded cell at a time (a hair oversize so no seams show)
  for (let i = 0; i < N * N; i++) if (L.inMaze[i]) { c.fillStyle = cellColour(L, i); c.fillRect((i % N) * u - 0.5, ((i / N) | 0) * u - 0.5, u + 1, u + 1); }
  // long strands in the mane and tail
  c.lineCap = 'round';
  for (const p of PARTS) if (p.region === 'mane' || p.region === 'tail') {
    for (let s = -2; s <= 2; s++) {
      const a = Math.atan2(p.y2 - p.y1, p.x2 - p.x1) + Math.PI / 2, o1 = s * p.r1 * 0.36, o2 = s * p.r2 * 0.36;
      c.strokeStyle = s % 2 ? 'rgba(255,250,235,.5)' : 'rgba(120,105,80,.22)'; c.lineWidth = u * 0.14;
      c.beginPath(); c.moveTo((p.x1 + Math.cos(a) * o1) * k, (p.y1 + Math.sin(a) * o1) * k); c.lineTo((p.x2 + Math.cos(a) * o2) * k, (p.y2 + Math.sin(a) * o2) * k); c.stroke();
    }
  }
  // walls: fine, cool-grey lines wherever a maze cell has no way through on a side
  const path = new Path2D();
  const seg = (x1, y1, x2, y2) => { path.moveTo(x1 * u, y1 * u); path.lineTo(x2 * u, y2 * u); };
  for (let i = 0; i < N * N; i++) if (L.inMaze[i]) {
    const x = i % N, y = (i / N) | 0, o = L.open[i];
    if (!(o & 4)) seg(x, y, x + 1, y);
    if (!(o & 1)) seg(x, y, x, y + 1);
    if (!(o & 8) && !(y + 1 < N && L.inMaze[i + N])) seg(x, y + 1, x + 1, y + 1);
    if (!(o & 2) && !(x + 1 < N && L.inMaze[i + 1])) seg(x + 1, y, x + 1, y + 1);
  }
  c.lineJoin = 'round';
  c.save(); c.translate(u * 0.05, u * 0.08); c.strokeStyle = 'rgba(30,36,80,.22)'; c.lineWidth = u * 0.2; c.stroke(path); c.restore();
  c.strokeStyle = '#4a5286'; c.lineWidth = u * 0.15; c.stroke(path);
  // eye and nostril
  c.fillStyle = '#11132a'; c.beginPath(); c.ellipse(EYE.x * k, EYE.y * k, EYE.r * k * 1.25, EYE.r * k * 0.9, 0.5, 0, 6.3); c.fill();
  c.fillStyle = 'rgba(255,255,255,.85)'; c.beginPath(); c.arc(EYE.x * k - EYE.r * k * 0.35, EYE.y * k - EYE.r * k * 0.3, EYE.r * k * 0.28, 0, 6.3); c.fill();
  c.fillStyle = 'rgba(40,40,70,.75)'; c.beginPath(); c.ellipse(NOSTRIL.x * k, NOSTRIL.y * k, NOSTRIL.r * k * 1.2, NOSTRIL.r * k * 0.8, 0.9, 0, 6.3); c.fill();
}

// ---------- HUD / overlays ----------
let toastTimer = 0;
function toast(msg, ms = 2600) { const t = $('toast'); t.textContent = msg; t.classList.add('on'); clearTimeout(toastTimer); toastTimer = setTimeout(() => t.classList.remove('on'), ms); }
const fmt = (s) => `${Math.floor(s / 60)}:${String(Math.floor(s % 60)).padStart(2, '0')}`;
function updateHud() { $('title').textContent = 'The Unicorn'; $('status').innerHTML = `<span id="clock">${fmt(G.time)}</span>${save.best ? `<span>best ${fmt(save.best)}</span>` : ''}`; }

function showMenu() {
  G.state = 'menu'; $('hud').classList.remove('on'); $('overlay').classList.remove('off');
  $('sheet').innerHTML = `<div class="win">
    <h1>The <em>Unicorn</em></h1>
    <p>A wisp of light wakes at the hind hoof. Carry it through the unicorn, up the long neck, to the very point of the horn.</p>
    <div class="row"><button class="primary" id="mPlay">${G.L ? 'Keep going' : 'Begin'}</button><button id="mNew">New maze</button></div>
    <div class="how" style="text-align:left;margin-top:26px">
      <div><b>iPad</b> — put a finger on the light and draw it through the passages. It follows wherever there is a way.</div>
      <div><b>Controller</b> — left stick or D-pad moves · A = begin · Y = new maze</div>
      <div><b>Mouse &amp; keys</b> — move the mouse along the passages, or use the arrow keys / WASD</div>
      <div>The light leaves a trail, which fades when you double back.</div>
    </div>
    <p style="margin-top:22px;font:13px system-ui,sans-serif"><a href="https://bryndal.ai" style="color:#e9c46a;text-decoration:none">← bryndal.ai</a></p></div>`;
  $('mPlay').onclick = () => (G.L ? resume() : newMaze());
  $('mNew').onclick = newMaze;
}
function showWin() {
  G.state = 'won';
  const t = Math.round(G.time), record = !save.best || t < save.best;
  if (record) save.best = t;
  save.solved++; persist();
  $('overlay').classList.remove('off');
  $('sheet').innerHTML = `<div class="win"><h1>The horn is <em>alight</em></h1>
    <p>Time ${fmt(G.time)}${record ? ' — a new best.' : ` · best ${fmt(save.best)}`}</p>
    <p>You walked ${trail.length - 1} steps; the true path is ${G.L.sol.len}. Unicorns lit so far: ${save.solved}.</p>
    <div class="row"><button class="primary" id="wNew">New maze</button></div></div>`;
  $('wNew').onclick = newMaze;
}
function resume() { $('overlay').classList.add('off'); $('hud').classList.add('on'); G.state = 'play'; }
function reset() { // back to the start of the same maze
  const L = G.L; G.time = 0; trail = [L.start]; queue = [];
  P.cell = L.start; [P.px, P.py] = xy(L.start);
  updateHud(); resume();
}
function newMaze(seed) {
  G.seed = Number.isFinite(seed) ? seed : (Math.random() * 2 ** 31) | 0;
  G.L = makeMaze(G.seed);
  layout(); reset();
  toast('From the hind hoof to the point of the horn.');
}
$('bMenu').onclick = showMenu;
$('bRestart').onclick = () => G.L && reset();
addEventListener('resize', layout);

// ---------- moving ----------
function enter(c) { // step into a neighbouring cell (already known to be open)
  if (trail.length > 1 && trail[trail.length - 2] === c) trail.pop(); else trail.push(c);
  P.cell = c;
  if (c === G.L.end) { queue = []; showWin(); }
}
function step(dx, dy) { // one cell in a compass direction, if there is a way
  if (G.state !== 'play') return false;
  const d = DIRS.find((q) => q.dx === dx && q.dy === dy);
  if (!d || !(G.L.open[P.cell] & d.bit)) return false;
  queue = []; enter(P.cell + dx + dy * N);
  return true;
}
// Finger or mouse: head for the cell under the pointer (or the nearest maze
// cell to it, since the limbs are slender) if it is a short walk away.
function follow(clientX, clientY) {
  if (G.state !== 'play') return;
  const fx = (clientX - view.ox) / view.cell, fy = (clientY - view.oy) / view.cell;
  let target = -1, bd = 1.6 * 1.6;
  for (let y = Math.max(0, Math.floor(fy - 1.5)); y <= Math.min(N - 1, Math.floor(fy + 1.5)); y++)
    for (let x = Math.max(0, Math.floor(fx - 1.5)); x <= Math.min(N - 1, Math.floor(fx + 1.5)); x++) {
      if (!G.L.inMaze[x + y * N]) continue;
      const d = (x + 0.5 - fx) ** 2 + (y + 0.5 - fy) ** 2;
      if (d < bd) { bd = d; target = x + y * N; }
    }
  if (target < 0) return;
  if (target === P.cell) { queue = []; return; }
  const p = route(G.L, P.cell, target, 14);
  if (p) queue = p.slice(1);
}

// ---------- input ----------
canvas.addEventListener('pointerdown', (e) => follow(e.clientX, e.clientY));
canvas.addEventListener('pointermove', (e) => follow(e.clientX, e.clientY));
addEventListener('gesturestart', (e) => e.preventDefault());
canvas.addEventListener('contextmenu', (e) => e.preventDefault());

const KEYDIR = { ArrowLeft: [-1, 0], KeyA: [-1, 0], ArrowRight: [1, 0], KeyD: [1, 0], ArrowUp: [0, -1], KeyW: [0, -1], ArrowDown: [0, 1], KeyS: [0, 1] };
const held = new Set();
let repeatT = 0;
addEventListener('keydown', (e) => {
  if (G.state === 'play') {
    if (KEYDIR[e.code]) { if (!e.repeat) { step(...KEYDIR[e.code]); repeatT = 0.22; } held.add(e.code); e.preventDefault(); }
    if (e.code === 'Escape') showMenu();
  } else if (e.code === 'Enter') { G.state === 'menu' && G.L ? resume() : newMaze(); }
});
addEventListener('keyup', (e) => held.delete(e.code));
addEventListener('blur', () => held.clear());

let padPrev = [], padLast = '';
function pollPad() { // returns the direction the stick / D-pad is held in, if any
  const gp = [...(navigator.getGamepads ? navigator.getGamepads() : [])].find((g) => g && g.connected);
  if (!gp) return null;
  const b = (i) => !!(gp.buttons[i] && gp.buttons[i].pressed), hit = (i) => b(i) && !padPrev[i];
  const ax = (gp.axes[0] || 0) + (b(15) ? 1 : 0) - (b(14) ? 1 : 0), ay = (gp.axes[1] || 0) + (b(13) ? 1 : 0) - (b(12) ? 1 : 0);
  let dir = null;
  if (Math.hypot(ax, ay) > 0.5) dir = Math.abs(ax) > Math.abs(ay) ? [Math.sign(ax), 0] : [0, Math.sign(ay)];
  if (G.state === 'play') { if (hit(9)) showMenu(); if (hit(8)) reset(); if (hit(3)) newMaze(); }
  else if (hit(0)) { G.state === 'menu' && G.L ? resume() : newMaze(); }
  else if (hit(3)) newMaze();
  padPrev = gp.buttons.map((x) => x.pressed);
  return G.state === 'play' ? dir : null;
}

// ---------- drawing ----------
function glint(x, y, R, w) { // a four-pointed star of light
  ctx.beginPath();
  for (let i = 0; i < 8; i++) { const a = (i * Math.PI) / 4, q = i % 2 ? R * w : R; ctx.lineTo(x + Math.sin(a) * q, y - Math.cos(a) * q); }
  ctx.closePath(); ctx.fill();
}
function glow(x, y, r, inner, outer) {
  const g = ctx.createRadialGradient(x, y, 0, x, y, r);
  g.addColorStop(0, inner); g.addColorStop(1, outer);
  ctx.fillStyle = g; ctx.beginPath(); ctx.arc(x, y, r, 0, 6.3); ctx.fill();
}

function render(now, dt) {
  const { W, H, dpr, S, ox, oy, cell: u } = view, L = G.L;
  ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
  ctx.drawImage(sky, 0, 0, W, H);
  ctx.fillStyle = '#fff';
  for (const s of stars) { ctx.globalAlpha = 0.35 + 0.55 * (0.5 + 0.5 * Math.sin(now / 1000 * s.s + s.p)); ctx.beginPath(); ctx.arc(s.x, s.y, s.r, 0, 6.3); ctx.fill(); }
  ctx.globalAlpha = 1;
  if (L && board) {
    // the unicorn, with a moonlit aura
    ctx.save(); ctx.shadowColor = 'rgba(170,190,255,.65)'; ctx.shadowBlur = 34;
    ctx.drawImage(board, ox, oy, S, S); ctx.restore();
    const at = (c) => [ox + ((c % N) + 0.5) * u, oy + (((c / N) | 0) + 0.5) * u];
    const hx = ox + (P.px + 0.5) * u, hy = oy + (P.py + 0.5) * u;
    // trail of light
    if (trail.length > 1) {
      ctx.beginPath(); ctx.moveTo(...at(trail[0]));
      for (let i = 1; i < trail.length - 1; i++) ctx.lineTo(...at(trail[i]));
      ctx.lineTo(hx, hy);
      ctx.lineCap = 'round'; ctx.lineJoin = 'round';
      ctx.strokeStyle = 'rgba(255,196,72,.35)'; ctx.lineWidth = u * 0.62; ctx.stroke();
      ctx.strokeStyle = '#f2a81d'; ctx.lineWidth = u * 0.26; ctx.stroke();
      ctx.strokeStyle = '#fff3c4'; ctx.lineWidth = u * 0.09; ctx.stroke();
    }
    // the point of the horn
    const [gx, gy] = at(L.end), pulse = 1 + 0.2 * Math.sin(now / 340);
    glow(gx, gy, u * 3.4 * pulse, 'rgba(255,240,190,.85)', 'rgba(255,220,130,0)');
    ctx.fillStyle = '#fffdf0'; glint(gx, gy, u * 1.5 * pulse, 0.16);
    // where you began
    const [sx, sy] = at(L.start);
    ctx.strokeStyle = 'rgba(255,205,90,.8)'; ctx.lineWidth = Math.max(1.2, u * 0.1); ctx.beginPath(); ctx.arc(sx, sy, u * 0.55, 0, 6.3); ctx.stroke();
    // the wisp you carry
    const flick = 1 + 0.08 * Math.sin(now / 90);
    glow(hx, hy, u * 1.9 * flick, 'rgba(255,190,60,.75)', 'rgba(255,170,40,0)');
    glow(hx, hy, u * 0.5, '#ffffff', '#ffb52e');
    ctx.strokeStyle = '#7a4a00'; ctx.lineWidth = Math.max(1, u * 0.07); ctx.beginPath(); ctx.arc(hx, hy, u * 0.5, 0, 6.3); ctx.stroke();
  }
  // drifting motes of light in front of everything
  for (const m of motes) {
    m.y -= m.v * dt; m.w += dt * 0.8; m.x += Math.sin(m.w) * 8 * dt;
    if (m.y < -6) { m.y = H + 6; m.x = Math.random() * W; }
    glow(m.x, m.y, m.r * 3, 'rgba(200,215,255,.5)', 'rgba(200,215,255,0)');
  }
}

// ---------- loop ----------
let last = performance.now(), clockT = 0, walkT = 0;
function frame(now) {
  const dt = Math.min(0.05, (now - last) / 1000); last = now;
  const padDirNow = pollPad();
  if (G.state === 'play') {
    G.time += dt;
    walkT += dt; // drag / tap: walk the queued cells quickly
    while (queue.length && walkT > 0.028 && G.state === 'play') { walkT -= 0.028; enter(queue.shift()); }
    if (!queue.length) walkT = Math.min(walkT, 0.028);
    let dir = padDirNow; // held key or stick: keep stepping
    for (const k of held) dir = KEYDIR[k] || dir;
    const key = dir ? dir.join() : '';
    if (dir && G.state === 'play') {
      if (key !== padLast && !held.size) { step(dir[0], dir[1]); repeatT = 0.22; }
      else if ((repeatT -= dt) <= 0) { step(dir[0], dir[1]); repeatT = 0.085; }
    }
    padLast = key;
    if ((clockT += dt) > 0.5) { clockT = 0; const c = $('clock'); if (c) c.textContent = fmt(G.time); }
  }
  if (G.L) { const [tx, ty] = xy(P.cell), e = Math.min(1, dt * 26); P.px += (tx - P.px) * e; P.py += (ty - P.py) * e; }
  render(now, dt);
  requestAnimationFrame(frame);
}

window.__maze = { G, P, newMaze, step, follow, save, get view() { return view; }, get trail() { return trail; } }; // for self-tests
layout();
showMenu();
requestAnimationFrame(frame);
