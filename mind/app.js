import { getName, setName, getPlayers, isMuted, toggleMute, sfx } from './common.js?v=4';

const GAME_IDS = ['match', 'path', 'chain', 'snap', 'flash'];
const V = 4; // bump to bust the cache on game modules

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
async function submit(g, opts, result, name = getName()) {
  const r = await fetch(API, {
    method: 'POST',
    headers: { 'Content-Type': 'application/json' },
    body: JSON.stringify({ board: boardKey(g, opts), order: g.score.order, name, score: result.score, detail: result.detail }),
  });
  if (!r.ok) throw new Error('save failed');
  return r.json();
}

// ---------- header ----------
const chip = document.getElementById('player-chip');
const muteBtn = document.getElementById('mute-btn');
const paintHeader = () => {
  chip.textContent = getName() ? `👤 ${getName()} · switch` : 'Set your name';
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
    const recent = getPlayers();
    openModal(`
      <h2>Who's playing?</h2>
      <p class="muted">Scores save under this name. Use the same name every time so your scores add up.</p>
      ${recent.length ? `<div class="who-chips" id="who-chips">${recent.map((p) => `
        <button type="button" class="who-chip ${p === getName() ? 'on' : ''}" data-p="${esc(p)}">${esc(p)}</button>`).join('')}</div>
        <div class="label" style="margin:18px 0 0">Or a new player</div>` : ''}
      <form id="name-form" class="name-form">
        <input id="name-input" maxlength="24" autocomplete="off" placeholder="New player's name" value="${recent.length ? '' : esc(getName())}" ${recent.length ? '' : 'required'} />
        <div class="row">
          ${required ? '' : '<button type="button" class="btn ghost" id="name-cancel">Cancel</button>'}
          <button class="btn">Let's go</button>
        </div>
      </form>`);
    const input = document.getElementById('name-input');
    if (!recent.length) { input.focus(); input.select(); }
    const chips = document.getElementById('who-chips');
    if (chips) chips.onclick = (e) => {
      const b = e.target.closest('[data-p]');
      if (!b) return;
      setName(b.dataset.p);
      paintHeader();
      closeModal();
      resolve(true);
    };
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
      <a class="btn party-btn" href="#/party">👥 Pass &amp; play with friends</a>
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
        <div class="playing-as" id="playing-as"></div>
        <button class="btn big" id="start">Start game</button>
      </div>
      <aside class="panel">
        <div class="label">Top scores · <span id="board-label"></span></div>
        <div id="board-view"><p class="muted small">Loading…</p></div>
      </aside>
    </div>`;

  const drawWho = () => {
    const others = getPlayers().filter((p) => p !== getName()).slice(0, 5);
    document.getElementById('playing-as').innerHTML = getName()
      ? `<span>Playing as <b>${esc(getName())}</b></span>
         ${others.map((p) => `<button class="who-chip" data-p="${esc(p)}">Switch to ${esc(p)}</button>`).join('')}
         <button class="who-chip ghost" data-new>+ New player</button>`
      : `<span class="muted">Who's playing?</span> <button class="who-chip" data-new>Set your name</button>`;
  };
  document.getElementById('playing-as').onclick = async (e) => {
    const b = e.target.closest('button');
    if (!b) return;
    if (b.dataset.p) { setName(b.dataset.p); paintHeader(); sfx.click(); }
    else if (!(await askName())) return;
    drawWho();
    refresh();
  };
  drawWho();
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

// party: { player, onResult(result) } — pass-and-play turn; no restart, custom bar.
function play(g, opts, party = null) {
  app.innerHTML = `
    <div class="play-bar">
      ${party
        ? `<button class="back linklike" id="quit-party">‹ Quit</button><span class="turn-chip">${esc(party.player)}'s turn · ${esc(g.title)}</span>`
        : `<a class="back" href="#/play/${g.id}">‹ ${esc(g.title)}</a><span class="muted small">${esc(optsLabel(g, opts))}</span>
           <button class="btn ghost small" id="restart">Restart</button>`}
    </div>
    <div class="play-area" id="play-area"></div>`;
  if (party) {
    document.getElementById('quit-party').onclick = () => {
      if (confirm('Quit this pass-and-play game? Scores saved so far stay on the leaderboard.')) location.hash = '#/';
    };
  }
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
        setTimeout(() => (party ? party.onResult(result) : results(g, opts, result, start)), 600);
      },
    }) || null;
  };
  if (!party) document.getElementById('restart').onclick = start;
  start();
}

// ---------- pass and play ----------
const PARTY_KEY = 'mind-contest:party';
const better = (g, a, b) => (g.score.order === 'asc' ? a < b : a > b);

function partySetup() {
  const saved = JSON.parse(localStorage.getItem(PARTY_KEY) || '{}');
  let names = saved.names?.length >= 2 ? saved.names : [getName(), ''];
  let picked = new Set(saved.games?.filter((id) => games.some((g) => g.id === id)) || games.map((g) => g.id));

  app.innerHTML = `
    <a class="back" href="#/">‹ All games</a>
    <div class="panel party-setup">
      <h1>Pass &amp; play</h1>
      <p class="rules">Take turns on this device. Everyone plays the same games on standard settings, one at a time, and the app keeps score. Each game awards points by place, and every score also goes on the leaderboards.</p>
      <div class="label">Players (2–4)</div>
      <div id="names" class="names"></div>
      <button class="btn ghost small" id="add-player">+ Add player</button>
      <div class="label" style="margin-top:24px">Games</div>
      <div class="pick" id="pick">${games.map((g) => `
        <button class="pick-tile ${picked.has(g.id) ? 'on' : ''}" data-g="${g.id}">
          <span class="tile-icon">${g.icon}</span><span>${esc(g.title)}</span>
        </button>`).join('')}</div>
      <p class="muted small" id="party-err"></p>
      <button class="btn big" id="party-start">Start</button>
    </div>`;

  const namesEl = document.getElementById('names');
  const drawNames = () => {
    namesEl.innerHTML = names.map((n, i) => `
      <div class="name-row">
        <span class="seat">${i + 1}</span>
        <input data-i="${i}" maxlength="24" placeholder="Player ${i + 1}" value="${esc(n)}" />
        ${names.length > 2 ? `<button class="icon-btn" data-rm="${i}" title="Remove">✕</button>` : ''}
      </div>`).join('');
    document.getElementById('add-player').hidden = names.length >= 4;
  };
  namesEl.oninput = (e) => { if (e.target.dataset.i) names[+e.target.dataset.i] = e.target.value; };
  namesEl.onclick = (e) => {
    const rm = e.target.closest('[data-rm]');
    if (rm) { names.splice(+rm.dataset.rm, 1); drawNames(); }
  };
  document.getElementById('add-player').onclick = () => { names.push(''); drawNames(); namesEl.querySelector(`[data-i="${names.length - 1}"]`).focus(); };
  document.getElementById('pick').onclick = (e) => {
    const b = e.target.closest('[data-g]');
    if (!b) return;
    picked.has(b.dataset.g) ? picked.delete(b.dataset.g) : picked.add(b.dataset.g);
    b.classList.toggle('on');
    sfx.click();
  };
  drawNames();

  document.getElementById('party-start').onclick = () => {
    const clean = names.map((n) => n.trim()).filter(Boolean);
    const err = document.getElementById('party-err');
    const lower = clean.map((n) => n.toLowerCase());
    if (clean.length < 2) return (err.textContent = 'Add at least two players.');
    if (new Set(lower).size !== lower.length) return (err.textContent = 'Each player needs a different name.');
    if (!picked.size) return (err.textContent = 'Pick at least one game.');
    const list = games.filter((g) => picked.has(g.id));
    localStorage.setItem(PARTY_KEY, JSON.stringify({ names: clean, games: list.map((g) => g.id) }));
    runParty(clean, list);
  };
}

async function runParty(players, list) {
  const totals = Object.fromEntries(players.map((p) => [p, 0]));
  const partyHash = location.hash;
  const alive = () => location.hash === partyHash;

  for (let gi = 0; gi < list.length; gi++) {
    const g = list[gi];
    const opts = defaults(g);
    const scores = {};
    for (let pi = 0; pi < players.length; pi++) {
      const p = players[pi];
      await partyModal(`
        <div class="label">Game ${gi + 1} of ${list.length} · ${esc(g.title)}</div>
        <div class="pass-icon">${g.icon}</div>
        <h2>Pass to <span class="accent">${esc(p)}</span></h2>
        <p class="muted">${esc(g.rules)}</p>
        <div class="row"><button class="btn big" data-ok>I'm ${esc(p)} — go!</button></div>`);
      if (!alive()) return;
      const result = await new Promise((resolve) => play(g, opts, { player: p, onResult: resolve }));
      if (!alive()) return;
      scores[p] = result;
      if (g.score.order === 'asc' || result.score > 0) submit(g, opts, result, p).catch(() => {});
      if (pi < players.length - 1) {
        await partyModal(`
          <div class="label">${esc(p)} · ${esc(g.title)}</div>
          <div class="big-score">${esc(g.score.format(result.score))}</div>
          <p class="muted">${esc(result.detail || '')}</p>
          <div class="row"><button class="btn" data-ok>Next player</button></div>`);
        if (!alive()) return;
      }
    }

    // rank this game; ties share the higher place
    const ranked = [...players].sort((a, b) => (better(g, scores[a].score, scores[b].score) ? -1 : better(g, scores[b].score, scores[a].score) ? 1 : 0));
    const pts = {};
    ranked.forEach((p, i) => {
      const tiedWith = ranked.findIndex((q) => scores[q].score === scores[p].score);
      pts[p] = players.length - tiedWith;
      totals[p] += pts[p];
    });
    const last = gi === list.length - 1;
    await partyModal(`
      <div class="label">${esc(g.title)} · results</div>
      <ol class="board">${ranked.map((p) => `
        <li><span class="rank">${['🥇', '🥈', '🥉'][players.length - pts[p]] || players.length - pts[p] + 1}</span>
        <span class="who">${esc(p)}<small>${esc(scores[p].detail || '')}</small></span>
        <b>${esc(g.score.format(scores[p].score))}</b><span class="pts">+${pts[p]}</span></li>`).join('')}</ol>
      ${list.length > 1 ? standingsHtml(players, totals, 'Running total') : ''}
      <div class="row"><button class="btn" data-ok>${last ? 'Final results' : `Next: ${esc(list[gi + 1].title)}`}</button></div>`);
    if (!alive()) return;
  }

  const order = [...players].sort((a, b) => totals[b] - totals[a]);
  const top = order.filter((p) => totals[p] === totals[order[0]]);
  sfx.win();
  const choice = await partyModal(`
    <div class="crown">👑</div>
    <h2 class="center">${top.length > 1 ? `It's a tie: ${top.map(esc).join(' & ')}!` : `${esc(top[0])} wins!`}</h2>
    ${standingsHtml(players, totals, 'Final standings')}
    <div class="row"><button class="btn ghost" data-ok="lobby">All games</button><button class="btn" data-ok="again">Play again</button></div>`);
  if (!alive()) return;
  if (choice === 'again') runParty(players, list);
  else location.hash = '#/';
}

function standingsHtml(players, totals, title) {
  const order = [...players].sort((a, b) => totals[b] - totals[a]);
  return `<div class="label" style="margin-top:18px">${title}</div>
    <ol class="board">${order.map((p, i) => `<li><span class="rank">${i + 1}</span><span class="who">${esc(p)}</span><b>${totals[p]} pt${totals[p] === 1 ? '' : 's'}</b></li>`).join('')}</ol>`;
}

// Shows a modal; resolves with the clicked [data-ok] value. Resolves null if the user navigates away.
function partyModal(html) {
  return new Promise((resolve) => {
    openModal(html);
    const onHash = () => resolve(null);
    window.addEventListener('hashchange', onHash, { once: true });
    modalBody.querySelectorAll('[data-ok]').forEach((b) => {
      b.onclick = () => {
        window.removeEventListener('hashchange', onHash);
        closeModal();
        resolve(b.dataset.ok || true);
      };
    });
  });
}

async function results(g, opts, result, again) {
  openModal(`
    <div class="label">${esc(g.title)} · ${esc(optsLabel(g, opts))}</div>
    <div class="big-score">${esc(g.score.format(result.score))}</div>
    <p class="muted">${esc(result.detail || '')}</p>
    <p class="save-msg" id="save-msg">Saving…</p>
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
    const who = esc(getName());
    if (r.improved && r.rank === 1) { msg.innerHTML = `✓ Saved for <b>${who}</b> · 🏆 New #1! You lead this board.`; sfx.win(); }
    else if (r.improved) msg.innerHTML = `✓ Saved for <b>${who}</b> · new personal best, #${r.rank}.`;
    else msg.innerHTML = `✓ Saved for <b>${who}</b> · your best is still higher, #${r.rank}.`;
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
  if (location.hash.startsWith('#/party')) partySetup();
  else if (g) setup(g);
  else lobby();
  window.scrollTo(0, 0);
}
window.addEventListener('hashchange', route);

const loaded = await Promise.allSettled(GAME_IDS.map((id) => import(`./games/${id}.js?v=${V}`)));
games = loaded.filter((r) => r.status === 'fulfilled').map((r) => r.value.default);
loaded.forEach((r, i) => r.status === 'rejected' && console.warn(`game ${GAME_IDS[i]} failed to load`, r.reason));
paintHeader();
route();
