import { getName, setName, isMuted, toggleMute, sfx } from './common.js';

const GAME_IDS = ['match', 'path', 'chain', 'snap', 'flash'];
const V = 1; // bump to bust the cache on game modules

// Score API: same origin on the worker; absolute URL when served from bryndal.ai.
const API = /bryndal\.ai$|github\.io$/.test(location.hostname)
  ? 'https://mind-contest.kristina-bryndal.workers.dev/api/scores'
  : '/api/scores';

const app = document.getElementById('app');
const modal = document.getElementById('modal');
const modalBody = document.getElementById('modal-body');
const esc = (s) => String(s).replace(/[&<>"']/g, (c) => `&#${c.charCodeAt(0)};`);
const POINTS = [10, 8, 6, 5, 4, 3, 2, 1];

let games = [];
let cleanup = null;

// ---------- data ----------
const defaults = (g) => Object.fromEntries(g.options.map((o) => [o.key, o.default]));
const boardKey = (g, opts) => [g.id, ...g.options.map((o) => `${o.key}=${opts[o.key]}`)].join(':');
const optsLabel = (g, opts) =>
  g.options.map((o) => {
    const v = opts[o.key];
    const unit = o.unit ?? (typeof v === 'number' ? o.label.toLowerCase() : '');
    return unit ? `${v} ${unit}` : v;
  }).join(' · ');

async function fetchAll() {
  try {
    const r = await fetch(API);
    return (await r.json()).boards || {};
  } catch { return {}; }
}
async function fetchBoard(key) {
  try {
    const r = await fetch(`${API}?board=${encodeURIComponent(key)}`);
    return (await r.json()).entries || [];
  } catch { return null; }
}
async function submit(g, opts, result) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board: boardKey(g, opts), order: g.score.order, name: getName(), score: result.score, detail: result.detail }),
  });
  if (!r.ok) throw new Error('save failed');
  return r.json();
}

// ---------- header ----------
const chip = document.getElementById('player-chip');
const muteBtn = document.getElementById('mute-btn');
const paintHeader = () => {
  chip.textContent = getName() ? `👤 ${getName()}` : 'Set your name';
  muteBtn.textContent = isMuted() ? '🔇' : '🔊';
};
chip.onclick = () => askName().then(() => route());
muteBtn.onclick = () => { toggleMute(); paintHeader(); };

function openModal(html) {
  modalBody.innerHTML = html;
  modal.hidden = false;
}
const closeModal = () => { modal.hidden = true; modalBody.innerHTML = ''; };

function askName(required = false) {
  return new Promise((resolve) => {
    openModal(`
      <h2>Who's playing?</h2>
      <p class="muted">Your name goes on the leaderboard. Use the same name every time so your scores add up.</p>
      <form id="name-form" class="name-form">
        <input id="name-input" maxlength="24" autocomplete="nickname" placeholder="Your name" value="${esc(getName())}" required />
        <div class="row">
          ${required ? '' : '<button type="button" class="btn ghost" id="name-cancel">Cancel</button>'}
          <button class="btn">Let's go</button>
        </div>
      </form>`);
    const input = document.getElementById('name-input');
    input.focus();
    input.select();
    document.getElementById('name-form').onsubmit = (e) => {
      e.preventDefault();
      if (!input.value.trim()) return;
      setName(input.value);
      paintHeader();
      closeModal();
      resolve(true);
    };
    const cancel = document.getElementById('name-cancel');
    if (cancel) cancel.onclick = () => { closeModal(); resolve(false); };
  });
}

// ---------- leaderboard table ----------
function boardHtml(g, entries, highlight) {
  if (entries === null) return '<p class="muted small">Scores are offline right now.</p>';
  if (!entries.length) return '<p class="muted small">No scores yet. Be the first!</p>';
  return `<ol class="board">${entries.slice(0, 10).map((e, i) => `
    <li class="${highlight && e.name.toLowerCase() === highlight.toLowerCase() ? 'me' : ''}">
      <span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
      <span class="who">${esc(e.name)}<small>${esc(e.detail || '')}</small></span>
      <b>${esc(g.score.format(e.score))}</b>
    </li>`).join('')}</ol>`;
}

// ---------- lobby ----------
async function lobby() {
  app.innerHTML = `
    <section class="hero">
      <h1>Contest of the <em>Mind</em></h1>
      <p>Five memory games. One leaderboard. Pick a game, beat your best, and climb the standings.</p>
    </section>
    <div class="lobby">
      <div class="tiles">${games.map((g) => `
        <a class="tile panel" href="#/play/${g.id}">
          <div class="tile-icon">${g.icon}</div>
          <div class="tile-text">
            <h3>${esc(g.title)}</h3>
            <p>${esc(g.blurb)}</p>
            <span class="tile-best" data-best="${g.id}"></span>
          </div>
          <span class="arrow">›</span>
        </a>`).join('')}
      </div>
      <aside class="panel standings">
        <div class="label">Overall standings</div>
        <div id="standings"><p class="muted small">Loading…</p></div>
        <p class="muted tiny">Points from each game's top 8 on standard settings: 10, 8, 6, 5, 4, 3, 2, 1.</p>
      </aside>
    </div>
    <section class="panel boards-panel">
      <div class="boards-head">
        <div class="label">Leaderboards · standard settings</div>
        <div class="tabs" id="board-tabs">${games.map((g, i) => `<button data-g="${g.id}" class="${i ? '' : 'on'}">${esc(g.title)}</button>`).join('')}</div>
      </div>
      <div id="board-view"></div>
    </section>`;

  const boards = await fetchAll();
  if (!document.getElementById('standings')) return; // navigated away

  // overall standings
  const totals = {};
  for (const g of games) {
    (boards[boardKey(g, defaults(g))] || []).slice(0, 8).forEach((e, i) => {
      const t = (totals[e.name.toLowerCase()] ??= { name: e.name, pts: 0, golds: 0, played: 0 });
      t.pts += POINTS[i];
      t.played++;
      if (i === 0) t.golds++;
    });
  }
  const rows = Object.values(totals).sort((a, b) => b.pts - a.pts || b.golds - a.golds);
  document.getElementById('standings').innerHTML = rows.length
    ? `<ol class="board">${rows.slice(0, 10).map((t, i) => `
        <li class="${t.name.toLowerCase() === getName().toLowerCase() ? 'me' : ''}">
          <span class="rank">${['🥇', '🥈', '🥉'][i] || i + 1}</span>
          <span class="who">${esc(t.name)}<small>${t.played} game${t.played === 1 ? '' : 's'}${t.golds ? ` · ${t.golds} gold` : ''}</small></span>
          <b>${t.pts}</b>
        </li>`).join('')}</ol>`
    : '<p class="muted small">No scores yet. Play any game to get on the board.</p>';

  // your best per game (standard settings)
  for (const g of games) {
    const me = (boards[boardKey(g, defaults(g))] || []).findIndex((e) => e.name.toLowerCase() === getName().toLowerCase());
    const el = document.querySelector(`[data-best="${g.id}"]`);
    if (me >= 0 && el) {
      const e = boards[boardKey(g, defaults(g))][me];
      el.textContent = `Your best: ${g.score.format(e.score)} · #${me + 1}`;
    }
  }

  const show = (id) => {
    const g = games.find((x) => x.id === id);
    document.querySelectorAll('#board-tabs button').forEach((b) => b.classList.toggle('on', b.dataset.g === id));
    document.getElementById('board-view').innerHTML = boardHtml(g, boards[boardKey(g, defaults(g))] || [], getName());
  };
  document.getElementById('board-tabs').onclick = (e) => e.target.dataset.g && show(e.target.dataset.g);
  if (games.length) show(games[0].id);
}

// ---------- setup + play ----------
function savedOpts(g) {
  try {
    const s = JSON.parse(localStorage.getItem(`mind-contest:opts:${g.id}`)) || {};
    const o = defaults(g);
    for (const opt of g.options) if (opt.choices.includes(s[opt.key])) o[opt.key] = s[opt.key];
    return o;
  } catch { return defaults(g); }
}

async function setup(g) {
  const opts = savedOpts(g);
  const isStd = () => boardKey(g, opts) === boardKey(g, defaults(g));
  app.innerHTML = `
    <a class="back" href="#/">‹ All games</a>
    <div class="setup">
      <div class="panel setup-main">
        <div class="setup-title"><div class="tile-icon">${g.icon}</div><h1>${esc(g.title)}</h1></div>
        <p class="rules">${esc(g.rules)}</p>
        ${g.options.map((o) => `
          <div class="opt">
            <div class="label">${esc(o.label)}</div>
            <div class="seg" data-key="${o.key}">${o.choices.map((c) => `<button data-v="${esc(c)}" class="${c === opts[o.key] ? 'on' : ''}">${esc(c)}</button>`).join('')}</div>
          </div>`).join('')}
        <p class="muted small" id="std-note"></p>
        <button class="btn big" id="start">Start game</button>
      </div>
      <aside class="panel">
        <div class="label">Top scores · <span id="board-label"></span></div>
        <div id="board-view"><p class="muted small">Loading…</p></div>
      </aside>
    </div>`;

  const refresh = async () => {
    document.getElementById('board-label').textContent = optsLabel(g, opts) || 'standard';
    document.getElementById('std-note').textContent = isStd()
      ? '★ Standard settings — these scores count toward the overall standings.'
      : 'Custom settings have their own leaderboard and don’t count toward overall standings.';
    const key = boardKey(g, opts);
    const entries = await fetchBoard(key);
    if (boardKey(g, opts) === key && document.getElementById('board-view'))
      document.getElementById('board-view').innerHTML = boardHtml(g, entries, getName());
  };
  app.querySelectorAll('.seg').forEach((seg) => {
    seg.onclick = (e) => {
      const b = e.target.closest('button');
      if (!b) return;
      const opt = g.options.find((o) => o.key === seg.dataset.key);
      opts[opt.key] = opt.choices.find((c) => String(c) === b.dataset.v);
      seg.querySelectorAll('button').forEach((x) => x.classList.toggle('on', x === b));
      localStorage.setItem(`mind-contest:opts:${g.id}`, JSON.stringify(opts));
      sfx.click();
      refresh();
    };
  });
  document.getElementById('start').onclick = async () => {
    if (!getName() && !(await askName(true))) return;
    play(g, { ...opts });
  };
  refresh();
}

function play(g, opts) {
  app.innerHTML = `
    <div class="play-bar">
      <a class="back" href="#/play/${g.id}">‹ ${esc(g.title)}</a>
      <span class="muted small">${esc(optsLabel(g, opts))}</span>
      <button class="btn ghost small" id="restart">Restart</button>
    </div>
    <div class="play-area" id="play-area"></div>`;
  const start = () => {
    cleanup?.();
    const el = document.getElementById('play-area');
    el.innerHTML = '';
    let done = false;
    cleanup = g.mount(el, {
      options: opts,
      sfx,
      finish: (result) => {
        if (done) return;
        done = true;
        setTimeout(() => results(g, opts, result, start), 600);
      },
    }) || null;
  };
  document.getElementById('restart').onclick = start;
  start();
}

async function results(g, opts, result, again) {
  openModal(`
    <div class="label">${esc(g.title)} · ${esc(optsLabel(g, opts))}</div>
    <div class="big-score">${esc(g.score.format(result.score))}</div>
    <p class="muted">${esc(result.detail || '')}</p>
    <p class="save-msg" id="save-msg">Saving your score…</p>
    <div id="board-view"></div>
    <div class="row">
      <button class="btn ghost" id="to-lobby">All games</button>
      <button class="btn" id="again">Play again</button>
    </div>`);
  document.getElementById('again').onclick = () => { closeModal(); again(); };
  document.getElementById('to-lobby').onclick = () => { closeModal(); location.hash = '#/'; };
  if (g.score.order === 'desc' && !(result.score > 0)) {
    document.getElementById('save-msg').textContent = 'No score this time. Give it another go!';
    return;
  }
  try {
    const r = await submit(g, opts, result);
    const msg = document.getElementById('save-msg');
    if (!msg) return;
    if (r.improved && r.rank === 1) { msg.textContent = '🏆 New #1! You lead this board.'; sfx.win(); }
    else if (r.improved) msg.textContent = `New personal best — you're #${r.rank}.`;
    else msg.textContent = `Saved. Your best is still higher — you're #${r.rank}.`;
    document.getElementById('board-view').innerHTML = boardHtml(g, r.entries, getName());
  } catch {
    const msg = document.getElementById('save-msg');
    if (msg) msg.textContent = 'Couldn’t reach the leaderboard, so this score wasn’t saved.';
  }
}

// ---------- routing ----------
function route() {
  cleanup?.();
  cleanup = null;
  closeModal();
  paintHeader();
  const m = location.hash.match(/^#\/play\/(\w+)/);
  const g = m && games.find((x) => x.id === m[1]);
  if (g) setup(g);
  else lobby();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

const loaded = await Promise.allSettled(GAME_IDS.map((id) => import(`./games/${id}.js?v=${V}`)));
games = loaded.filter((r) => r.status === 'fulfilled').map((r) => r.value.default);
loaded.forEach((r, i) => r.status === 'rejected' && console.warn(`game ${GAME_IDS[i]} failed to load`, r.reason));
paintHeader();
route();
