/* Top Rung — a 15-rung trivia ladder. Questions come from questions.js (window.QUESTIONS). */
(() => {
  "use strict";

  const LADDER = [100, 200, 300, 500, 1000, 2000, 4000, 8000, 16000, 32000, 64000, 125000, 250000, 500000, 1000000];
  const SAFE = [5, 10]; // rungs that lock in their value
  const RUNG_LEVEL = [1, 1, 1, 2, 2, 2, 3, 3, 3, 4, 4, 4, 4, 5, 5];
  const TIME_FOR = (rung) => (rung <= 5 ? 30 : rung <= 10 ? 45 : 60);
  const KEYS = ["A", "B", "C", "D"];
  const Q = (window.QUESTIONS || []).map((q, i) => ({ ...q, uid: q.uid ?? i }));
  const BY_UID = new Map(Q.map((q) => [q.uid, q]));
  const CATS = [...new Set(Q.map((q) => q.cat))].sort();

  const $app = document.getElementById("app");
  const $modal = document.getElementById("modal");
  const $modalBody = document.getElementById("modal-body");
  const fmt = (n) => n.toLocaleString("en-US");
  const esc = (s) => String(s).replace(/[&<>"']/g, (c) => ({ "&": "&amp;", "<": "&lt;", ">": "&gt;", '"': "&quot;", "'": "&#39;" }[c]));
  const store = {
    get(k, d) { try { return JSON.parse(localStorage.getItem("toprung:" + k)) ?? d; } catch { return d; } },
    set(k, v) { localStorage.setItem("toprung:" + k, JSON.stringify(v)); },
  };

  /* ---------------- random ---------------- */
  function rng(seed) {
    let a = seed >>> 0;
    return () => {
      a |= 0; a = (a + 0x6d2b79f5) | 0;
      let t = Math.imul(a ^ (a >>> 15), 1 | a);
      t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
      return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
    };
  }
  const R = Math.random;
  const shuffle = (arr, r = R) => { const a = arr.slice(); for (let i = a.length - 1; i > 0; i--) { const j = Math.floor(r() * (i + 1)); [a[i], a[j]] = [a[j], a[i]]; } return a; };
  const pick = (arr, r = R) => arr[Math.floor(r() * arr.length)];

  /* ---------------- sound ---------------- */
  let muted = store.get("muted", false);
  let ac;
  const $mute = document.getElementById("mute-btn");
  const paintMute = () => ($mute.textContent = muted ? "🔇" : "🔊");
  paintMute();
  $mute.onclick = () => { muted = !muted; store.set("muted", muted); paintMute(); };
  function tone(freq, dur = 0.15, type = "sine", when = 0, vol = 0.08) {
    if (muted) return;
    ac = ac || new (window.AudioContext || window.webkitAudioContext)();
    const t = ac.currentTime + when;
    const o = ac.createOscillator(), g = ac.createGain();
    o.type = type; o.frequency.value = freq;
    g.gain.setValueAtTime(0, t); g.gain.linearRampToValueAtTime(vol, t + 0.01); g.gain.exponentialRampToValueAtTime(0.0001, t + dur);
    o.connect(g).connect(ac.destination); o.start(t); o.stop(t + dur + 0.05);
  }
  const sfx = {
    lock: () => { tone(220, 0.5, "triangle"); tone(330, 0.5, "triangle", 0.05, 0.04); },
    right: () => [523, 659, 784, 1047].forEach((f, i) => tone(f, 0.35, "triangle", i * 0.09)),
    wrong: () => { tone(140, 0.6, "sawtooth", 0, 0.06); tone(110, 0.7, "sawtooth", 0.12, 0.06); },
    tick: () => tone(880, 0.05, "square", 0, 0.03),
    life: () => [440, 554, 659].forEach((f, i) => tone(f, 0.2, "sine", i * 0.06)),
    win: () => [523, 659, 784, 1047, 1319, 1568].forEach((f, i) => tone(f, 0.5, "triangle", i * 0.12)),
  };

  /* ---------------- question selection ---------------- */
  function poolFor(level, cats) {
    return Q.filter((q) => q.lvl === level && (!cats.length || cats.includes(q.cat)));
  }
  // pick a question at a rung's level, falling back to neighbouring levels if a category filter runs dry
  function drawQuestion(rung, cats, used) {
    const want = RUNG_LEVEL[rung - 1];
    const seen = new Set(store.get("seen", []));
    for (const lvl of [want, want - 1, want + 1, want - 2, want + 2]) {
      if (lvl < 1 || lvl > 5) continue;
      let pool = poolFor(lvl, cats).filter((q) => !used.has(q.uid));
      if (!pool.length) continue;
      const fresh = pool.filter((q) => !seen.has(q.uid));
      if (fresh.length) pool = fresh;
      return pick(pool);
    }
    return pick(Q.filter((q) => !used.has(q.uid)));
  }
  function markSeen(uid) {
    let seen = store.get("seen", []);
    seen.push(uid);
    if (seen.length > Math.floor(Q.length * 0.8)) seen = seen.slice(-Math.floor(Q.length * 0.5));
    store.set("seen", seen);
  }
  function optionsFor(q, r = R) {
    return shuffle([q.a, ...q.w.slice(0, 3)], r);
  }

  /* ---------------- player model ---------------- */
  function newPlayer(name) {
    return { name, rung: 1, banked: 0, status: "playing", lifelines: { fifty: true, crowd: true, phone: true }, history: [] };
  }
  const safeValue = (rung) => { let v = 0; SAFE.forEach((s) => { if (rung > s) v = LADDER[s - 1]; }); return v; };

  /* ---------------- state ---------------- */
  let G = null; // current game
  let timerId = null;

  /* ---------------- routing ---------------- */
  function parseChallenge() {
    const p = new URLSearchParams(location.search);
    if (!p.get("q")) return null;
    const ids = p.get("q").split(".").map((x) => parseInt(x, 36));
    if (ids.length !== 15 || ids.some((id) => !BY_UID.has(id))) return null;
    return { ids, from: (p.get("n") || "A friend").slice(0, 24), score: parseInt(p.get("s") || "0", 10) || 0, rung: parseInt(p.get("r") || "0", 10) || 0 };
  }

  /* ---------------- HOME ---------------- */
  function home() {
    stopTimer();
    G = null;
    const ch = parseChallenge();
    const best = store.get("best", []);
    $app.innerHTML = `
      ${ch ? `
      <div class="card challenge-banner">
        <h2>⚔️ ${esc(ch.from)} challenged you!</h2>
        <p class="muted">They reached rung ${ch.rung} and banked <b style="color:var(--gold)">${fmt(ch.score)}</b> points. Same 15 questions — can you beat them?</p>
        <div style="margin-top:14px"><button class="btn primary big" id="accept">Accept challenge</button></div>
      </div>` : ""}
      <section class="hero">
        <h1>Climb to the <em>Top Rung</em></h1>
        <p>Fifteen questions. Each one harder than the last. Three lifelines. One million points at the top — and one wrong answer sends you tumbling.</p>
      </section>
      <div class="modes">
        <div class="card mode" data-mode="solo"><div class="emoji">🧗</div><h3>Solo climb</h3><p>Just you and the ladder. Safe havens at rungs 5 and 10. Walk away any time with what you've banked.</p></div>
        <div class="card mode" data-mode="party"><div class="emoji">🎉</div><h3>Pass &amp; play</h3><p>2–4 players take turns on one device, each with their own ladder and lifelines. Miss and you're out — biggest bank wins.</p></div>
        <div class="card mode" data-mode="link"><div class="emoji">⚔️</div><h3>Challenge a friend</h3><p>Play a solo climb, then send a link. Your friend gets the exact same 15 questions and sees the score to beat.</p></div>
      </div>
      ${best.length ? `<div class="card records"><h3>Your best climbs</h3><ol>${best.slice(0, 5).map((b) => `<li><b>${fmt(b.score)}</b> — ${esc(b.name)}, rung ${b.rung} <span>· ${new Date(b.at).toLocaleDateString()}</span></li>`).join("")}</ol></div>` : ""}
      <p class="muted" style="text-align:center;margin-top:28px;font-size:13px">${fmt(Q.length)} hand-checked questions across ${CATS.length} categories</p>
    `;
    $app.querySelectorAll(".mode").forEach((el) => (el.onclick = () => setup(el.dataset.mode)));
    if (ch) $app.querySelector("#accept").onclick = () => setup("accept", ch);
  }

  /* ---------------- SETUP ---------------- */
  function setup(mode, ch) {
    const last = store.get("setup", { names: ["", "", "", ""], cats: [], timer: false, count: 2 });
    const party = mode === "party";
    const fixed = mode === "accept"; // challenge questions are fixed, no category choice
    let count = party ? Math.max(2, last.count) : 1;
    let cats = fixed ? [] : last.cats.filter((c) => CATS.includes(c));
    let timer = last.timer;

    const render = () => {
      $app.innerHTML = `
        <div class="card setup">
          <h2>${party ? "Pass & play" : fixed ? `Challenge from ${esc(ch.from)}` : mode === "link" ? "Challenge a friend" : "Solo climb"}</h2>
          <p class="muted">${party ? "Hand the device around. Each player answers one question per turn." : fixed ? `Score to beat: ${fmt(ch.score)} points.` : mode === "link" ? "Play your climb first — when it ends you'll get a link to send." : "Answer 15 in a row to reach the top."}</p>
          <label class="small">${party ? "Players" : "Your name"}</label>
          <div class="players-list">
            ${Array.from({ length: count }, (_, i) => `<div class="p"><input type="text" maxlength="20" data-i="${i}" placeholder="${party ? "Player " + (i + 1) : "Name"}" value="${esc(last.names[i] || "")}" /></div>`).join("")}
          </div>
          ${party ? `<div style="margin-top:8px;display:flex;gap:8px">
            <button class="chip" id="fewer" ${count <= 2 ? "disabled" : ""}>− player</button>
            <button class="chip" id="more" ${count >= 4 ? "disabled" : ""}>+ player</button></div>` : ""}
          ${fixed ? "" : `
          <label class="small">Categories <span style="text-transform:none;letter-spacing:0">(none selected = all)</span></label>
          <div class="chips" id="cats">${CATS.map((c) => `<button class="chip ${cats.includes(c) ? "on" : ""}" data-c="${esc(c)}">${esc(c)}</button>`).join("")}</div>`}
          <label class="toggle"><input type="checkbox" id="timer" ${timer ? "checked" : ""}/> Shot clock (30s / 45s / 60s per question)</label>
          <div class="row">
            <button class="btn" id="back">Back</button>
            <button class="btn primary big" id="go">Let's play</button>
          </div>
        </div>`;
      const names = () => [...$app.querySelectorAll("input[type=text]")].map((i) => i.value.trim());
      const keepNames = () => names().forEach((n, i) => (last.names[i] = n));
      $app.querySelector("#back").onclick = home;
      $app.querySelector("#timer").onchange = (e) => (timer = e.target.checked);
      $app.querySelectorAll("#cats .chip").forEach((b) => (b.onclick = () => {
        const c = b.dataset.c; cats = cats.includes(c) ? cats.filter((x) => x !== c) : [...cats, c]; b.classList.toggle("on");
      }));
      if (party) {
        $app.querySelector("#fewer").onclick = () => { keepNames(); count--; render(); };
        $app.querySelector("#more").onclick = () => { keepNames(); count++; render(); };
      }
      $app.querySelector("#go").onclick = () => {
        keepNames();
        const ns = names().map((n, i) => n || (party ? "Player " + (i + 1) : "You"));
        store.set("setup", { names: last.names, cats: fixed ? last.cats : cats, timer, count: party ? count : last.count });
        start({ mode: party ? "party" : "solo", names: ns, cats, timer, challenge: fixed ? ch : null });
      };
      const first = $app.querySelector("input[type=text]"); if (first && !first.value) first.focus();
    };
    render();
  }

  /* ---------------- GAME ---------------- */
  function start(opts) {
    G = {
      ...opts,
      players: opts.names.map(newPlayer),
      turn: 0,
      used: new Set(),
      fixedIds: opts.challenge ? opts.challenge.ids : null,
      cur: null,
    };
    nextQuestion();
  }

  const active = () => G.players[G.turn];

  function nextQuestion() {
    const p = active();
    let q;
    if (G.fixedIds) q = BY_UID.get(G.fixedIds[p.rung - 1]);
    else q = drawQuestion(p.rung, G.cats, G.used);
    G.used.add(q.uid);
    if (!G.fixedIds) markSeen(q.uid);
    G.cur = { q, opts: optionsFor(q), hidden: new Set(), locked: false, hint: "" };
    if (G.mode === "party" && G.players.filter((x) => x.status === "playing").length > 1) passDevice(p, render);
    else render();
  }

  function passDevice(p, then) {
    showModal(`
      <h2>${esc(p.name)}, you're up</h2>
      <p class="muted">Rung ${p.rung} for ${fmt(LADDER[p.rung - 1])} points${p.banked ? ` · banked ${fmt(p.banked)}` : ""}</p>
      <div class="row"><button class="btn primary big" id="ready">I'm ready</button></div>`);
    $modalBody.querySelector("#ready").onclick = () => { hideModal(); then(); };
  }

  function render() {
    const p = active(), c = G.cur, q = c.q;
    $app.innerHTML = `
      <div class="game">
        <div class="stage">
          ${G.mode === "party" ? `<div class="scorestrip">${G.players.map((pl, i) => `<div class="s ${i === G.turn ? "active" : ""} ${pl.status === "out" ? "out" : ""}">${esc(pl.name)} · ${fmt(pl.banked)}${pl.status === "walked" ? " 🚶" : pl.status === "top" ? " 🏆" : ""}</div>`).join("")}</div>` : ""}
          <div class="topbar">
            <div class="who">${esc(p.name)}<span class="tag">${p.banked ? `banked ${fmt(p.banked)}` : "nothing banked yet"}${G.challenge ? ` · beat ${fmt(G.challenge.score)}` : ""}</span></div>
            <div class="lifelines">
              <button class="life" id="l-fifty" title="50:50 — remove two wrong answers" ${p.lifelines.fifty ? "" : "disabled"}>50:50</button>
              <button class="life" id="l-crowd" title="Ask the crowd" ${p.lifelines.crowd ? "" : "disabled"}>👥</button>
              <button class="life" id="l-phone" title="Phone a friend" ${p.lifelines.phone ? "" : "disabled"}>📞</button>
            </div>
          </div>
          <div class="meta">
            <span class="pill level">Rung ${p.rung} · ${fmt(LADDER[p.rung - 1])}</span>
            <span class="pill">${esc(q.cat)}</span>
            ${G.timer ? `<span class="timer" id="timer"></span>` : ""}
          </div>
          <div class="question">${esc(q.q)}</div>
          <div class="answers">
            ${c.opts.map((o, i) => `<button class="ans ${c.hidden.has(o) ? "gone" : ""}" data-i="${i}"><span class="k">${KEYS[i]}</span><span>${esc(o)}</span></button>`).join("")}
          </div>
          <div class="hint" id="hint">${c.hint}</div>
          <div class="actions">
            <button class="btn" id="walk" ${p.rung === 1 ? "disabled" : ""}>Walk away with ${fmt(p.rung > 1 ? LADDER[p.rung - 2] : 0)}</button>
            <button class="btn" id="quit">Quit game</button>
          </div>
        </div>
        <aside class="ladder">
          ${LADDER.map((v, i) => i + 1).reverse().map((r) => `<div class="rung ${r === p.rung ? "cur" : ""} ${r < p.rung ? "done" : ""} ${SAFE.includes(r) ? "safe" : ""} ${r === 15 ? "top" : ""}"><span class="n">${r}</span><span>${SAFE.includes(r) ? "◆ " : ""}${fmt(LADDER[r - 1])}</span></div>`).join("")}
        </aside>
      </div>`;

    $app.querySelectorAll(".ans").forEach((b) => (b.onclick = () => choose(+b.dataset.i)));
    $app.querySelector("#l-fifty").onclick = fifty;
    $app.querySelector("#l-crowd").onclick = crowd;
    $app.querySelector("#l-phone").onclick = phone;
    $app.querySelector("#walk").onclick = walkAway;
    $app.querySelector("#quit").onclick = () => confirmModal("Quit this game?", "Progress for this game will be lost.", home);
    const cur = $app.querySelector(".rung.cur");
    const lad = $app.querySelector(".ladder");
    if (lad.scrollWidth > lad.clientWidth) lad.scrollLeft = cur.offsetLeft - lad.clientWidth / 2 + cur.clientWidth / 2;
    if (G.timer) startTimer(TIME_FOR(p.rung));
  }

  /* ---------------- timer ---------------- */
  function startTimer(secs) {
    stopTimer();
    let left = secs;
    const paint = () => { const el = document.getElementById("timer"); if (el) { el.textContent = `⏱ ${left}s`; el.classList.toggle("low", left <= 5); } };
    paint();
    timerId = setInterval(() => {
      left--; paint();
      if (left <= 5 && left > 0) sfx.tick();
      if (left <= 0) { stopTimer(); timeUp(); }
    }, 1000);
  }
  function stopTimer() { if (timerId) clearInterval(timerId); timerId = null; }
  function timeUp() {
    if (G.cur.locked) return;
    G.cur.locked = true;
    const correctIdx = G.cur.opts.indexOf(G.cur.q.a);
    disableAll();
    $app.querySelectorAll(".ans")[correctIdx].classList.add("right");
    sfx.wrong();
    setTimeout(() => resolve(false, "Time's up!"), 1600);
  }

  /* ---------------- lifelines ---------------- */
  function useLife(key) { active().lifelines[key] = false; document.getElementById("l-" + key).disabled = true; sfx.life(); }
  function setHint(html) { G.cur.hint = html; document.getElementById("hint").innerHTML = html; }

  function fifty() {
    const c = G.cur; if (c.locked) return;
    useLife("fifty");
    const wrongs = shuffle(c.opts.filter((o) => o !== c.q.a && !c.hidden.has(o)));
    wrongs.slice(0, 2).forEach((o) => c.hidden.add(o));
    $app.querySelectorAll(".ans").forEach((b) => { if (c.hidden.has(c.opts[+b.dataset.i])) b.classList.add("gone"); });
  }

  // simulated audience: accuracy drops as questions get harder, and on the hardest ones it can be wrong
  function crowd() {
    const c = G.cur; if (c.locked) return;
    useLife("crowd");
    const lvl = c.q.lvl;
    const live = c.opts.filter((o) => !c.hidden.has(o));
    const trustCorrect = R() > [0, 0.02, 0.07, 0.15, 0.28, 0.4][lvl];
    const favorite = trustCorrect ? c.q.a : pick(live.filter((o) => o !== c.q.a));
    const weights = {};
    live.forEach((o) => (weights[o] = 0.4 + R() * 0.8));
    const boost = [0, 5, 3, 1.7, 1.1, 0.8][lvl] * live.length * 0.4;
    weights[favorite] += boost + R() * 0.6;
    if (!trustCorrect) weights[c.q.a] += boost * 0.6;
    const total = Object.values(weights).reduce((a, b) => a + b, 0);
    let pct = c.opts.map((o) => (live.includes(o) ? Math.round((weights[o] / total) * 100) : 0));
    const diff = 100 - pct.reduce((a, b) => a + b, 0);
    pct[c.opts.indexOf(favorite)] += diff;
    setHint(`<div class="card"><b>👥 The crowd votes</b><div class="poll">${pct.map((v, i) => `<div class="bar"><span>${v}%</span><div class="fill" data-h="${v}"></div><b style="color:var(--gold)">${KEYS[i]}</b></div>`).join("")}</div></div>`);
    requestAnimationFrame(() => setTimeout(() => document.querySelectorAll(".poll .fill").forEach((f) => (f.style.height = Math.max(2, f.dataset.h * 0.8) + "%")), 30));
    // keep bars filled on re-render
    G.cur.hint = document.getElementById("hint").innerHTML.replace(/class="fill" data-h="(\d+)"/g, (m, h) => `class="fill" data-h="${h}" style="height:${Math.max(2, h * 0.8)}%"`);
  }

  const FRIENDS = ["Aunt Marge", "Your old roommate", "Dr. Patel", "Grandpa Lou", "Coach Rivera", "Your know-it-all cousin", "The librarian down the street"];
  function phone() {
    const c = G.cur; if (c.locked) return;
    useLife("phone");
    const lvl = c.q.lvl;
    const live = c.opts.filter((o) => !c.hidden.has(o));
    const knows = R() < [0, 0.95, 0.85, 0.72, 0.58, 0.45][lvl];
    const guess = knows ? c.q.a : pick(live.filter((o) => o !== c.q.a));
    const L = KEYS[c.opts.indexOf(guess)];
    const sure = knows && R() < 0.75;
    const lines = sure
      ? [`Oh, I know this one. It's <b>${L}: ${esc(guess)}</b>. I'd bet on it.`, `<b>${L}</b> — ${esc(guess)}. I'm pretty confident.`]
      : [`Hmm… I'm torn. If I had to pick, <b>${L}: ${esc(guess)}</b>? Maybe 60/40.`, `I think it's <b>${L}, ${esc(guess)}</b>, but honestly don't hold me to it.`, `Gosh. My gut says <b>${L}</b>. That's all I've got.`];
    setHint(`<div class="card"><b>📞 ${pick(FRIENDS)} says:</b><p class="friend">"${pick(lines)}"</p></div>`);
  }

  /* ---------------- answering ---------------- */
  function disableAll() { $app.querySelectorAll(".ans, .life, #walk").forEach((b) => (b.disabled = true)); }

  function choose(i) {
    const c = G.cur; if (c.locked) return;
    c.locked = true; stopTimer();
    disableAll();
    const btns = $app.querySelectorAll(".ans");
    btns[i].classList.add("locked");
    sfx.lock();
    const correctIdx = c.opts.indexOf(c.q.a);
    const suspense = 900 + active().rung * 120;
    setTimeout(() => {
      btns[i].classList.remove("locked");
      btns[correctIdx].classList.add("right");
      const ok = i === correctIdx;
      if (!ok) btns[i].classList.add("wrong");
      ok ? (active().rung === 15 ? sfx.win() : sfx.right()) : sfx.wrong();
      setTimeout(() => resolve(ok), ok ? 1300 : 2000);
    }, suspense);
  }

  function resolve(ok, reason) {
    const p = active(), q = G.cur.q;
    p.history.push({ uid: q.uid, ok });
    if (ok) {
      p.banked = LADDER[p.rung - 1];
      if (p.rung === 15) { p.status = "top"; return afterTurn(); }
      p.rung++;
      if (SAFE.includes(p.rung - 1)) {
        return showModal(`<h2>◆ Safe haven!</h2><p class="muted">${fmt(p.banked)} points are locked in — they're yours no matter what.</p><div class="row"><button class="btn primary" id="ok">Keep climbing</button></div>`, () => afterTurn());
      }
      return afterTurn();
    }
    p.status = "out";
    const fallTo = safeValue(p.rung);
    p.fell = p.banked;
    p.banked = fallTo;
    p.reason = reason || "Wrong answer";
    p.missed = q;
    afterTurn();
  }

  function walkAway() {
    const p = active();
    confirmModal(`Walk away with ${fmt(LADDER[p.rung - 2])}?`, "You'll keep what you've banked and leave the ladder.", () => {
      stopTimer();
      p.status = "walked";
      p.missed = G.cur.q;
      afterTurn();
    });
  }

  function afterTurn() {
    hideModal();
    const live = G.players.filter((pl) => pl.status === "playing");
    if (G.mode !== "party") {
      const p = G.players[0];
      if (p.status === "playing") return nextQuestion();
      return soloEnd(p);
    }
    const justOut = active();
    if (justOut.status !== "playing") {
      return partyUpdate(justOut, () => {
        if (!live.length) return partyEnd();
        advanceTurn(); nextQuestion();
      });
    }
    advanceTurn(); nextQuestion();
  }
  function advanceTurn() {
    for (let k = 1; k <= G.players.length; k++) {
      const n = (G.turn + k) % G.players.length;
      if (G.players[n].status === "playing") { G.turn = n; return; }
    }
  }

  /* ---------------- end screens ---------------- */
  function recordBest(p) {
    const best = store.get("best", []);
    best.push({ name: p.name, score: p.banked, rung: reachedRung(p), at: Date.now() });
    best.sort((a, b) => b.score - a.score);
    store.set("best", best.slice(0, 10));
  }
  const reachedRung = (p) => (p.status === "top" ? 15 : p.rung - 1);
  function missedBlurb(p) {
    if (!p.missed) return "";
    if (p.status === "walked") return `<div class="reveal">The answer you walked away from: <b>${esc(p.missed.a)}</b></div>`;
    return `<div class="reveal">${esc(p.reason)} — the answer was <b>${esc(p.missed.a)}</b></div>`;
  }
  function headline(p) {
    if (p.status === "top") return ["🏆 Top Rung!", "You answered all fifteen. Legendary."];
    if (p.status === "walked") return ["Smart move", `You walked away from rung ${p.rung}.`];
    return [p.banked ? "Caught by the safety net" : "Down you go", p.fell && p.fell !== p.banked ? `You had ${fmt(p.fell)} — falling back to ${fmt(p.banked)}.` : "Better luck on the next climb."];
  }

  function soloEnd(p) {
    stopTimer();
    recordBest(p);
    const [h, sub] = headline(p);
    const ids = G.fixedIds || G.players[0].history.map((x) => x.uid);
    let vs = "";
    if (G.challenge) {
      const them = G.challenge.score;
      vs = `<p style="font-size:18px;margin-top:6px">${p.banked > them ? `🎉 You beat ${esc(G.challenge.from)} (${fmt(them)})!` : p.banked === them ? `🤝 Dead heat with ${esc(G.challenge.from)}.` : `${esc(G.challenge.from)} wins this one with ${fmt(them)}.`}</p>`;
    }
    // A challenge link needs all 15 questions: fill the rungs this player never reached
    const full = ids.slice();
    const used = new Set(full);
    for (let r = full.length + 1; r <= 15; r++) { const q = drawQuestion(r, G.cats, used); used.add(q.uid); full.push(q.uid); }
    const url = `${location.origin}${location.pathname}?q=${full.map((n) => n.toString(36)).join(".")}&n=${encodeURIComponent(p.name)}&s=${p.banked}&r=${reachedRung(p)}`;
    showModal(`
      <h2>${h}</h2>
      <p class="muted">${sub}</p>
      <div class="amount">${fmt(p.banked)}</div>
      ${vs}
      ${missedBlurb(p)}
      <p class="muted" style="margin-top:18px;font-size:14px">${G.challenge ? "Send it back with a challenge of your own:" : "Challenge a friend to the same 15 questions:"}</p>
      <div class="share-box"><input type="text" readonly value="${esc(url)}" id="share-url"/><button class="btn" id="copy">Copy</button></div>
      <div class="row">
        <button class="btn" id="home">Home</button>
        <button class="btn primary" id="again">Play again</button>
      </div>`);
    $modalBody.querySelector("#copy").onclick = async () => {
      const text = `I banked ${fmt(p.banked)} points on Top Rung. Think you can beat me? ${url}`;
      if (navigator.share && /Mobi/i.test(navigator.userAgent)) { try { await navigator.share({ text }); return; } catch {} }
      try { await navigator.clipboard.writeText(text); } catch { $modalBody.querySelector("#share-url").select(); document.execCommand("copy"); }
      $modalBody.querySelector("#copy").textContent = "Copied!";
    };
    $modalBody.querySelector("#home").onclick = () => { hideModal(); history.replaceState(null, "", location.pathname); home(); };
    $modalBody.querySelector("#again").onclick = () => { hideModal(); history.replaceState(null, "", location.pathname); start({ mode: "solo", names: G.names, cats: G.cats, timer: G.timer, challenge: null }); };
  }

  function partyUpdate(p, then) {
    stopTimer();
    const [h, sub] = headline(p);
    showModal(`<h2>${esc(p.name)}: ${h}</h2><p class="muted">${sub}</p><div class="amount">${fmt(p.banked)}</div>${missedBlurb(p)}<div class="row"><button class="btn primary" id="ok">Continue</button></div>`, then);
  }

  function partyEnd() {
    G.players.forEach(recordBest);
    const ranked = G.players.slice().sort((a, b) => b.banked - a.banked || reachedRung(b) - reachedRung(a));
    const top = ranked.filter((p) => p.banked === ranked[0].banked && reachedRung(p) === reachedRung(ranked[0]));
    showModal(`
      <h2>${top.length > 1 ? "🤝 It's a tie!" : `🏆 ${esc(top[0].name)} wins!`}</h2>
      <table class="results-table">${ranked.map((p, i) => `<tr><td>${i + 1}. ${esc(p.name)} <span class="muted" style="font-size:12px">· rung ${reachedRung(p)}${p.status === "walked" ? " · walked" : ""}</span></td><td>${fmt(p.banked)}</td></tr>`).join("")}</table>
      <div class="row"><button class="btn" id="home">Home</button><button class="btn primary" id="again">Rematch</button></div>`);
    $modalBody.querySelector("#home").onclick = () => { hideModal(); home(); };
    $modalBody.querySelector("#again").onclick = () => { hideModal(); start({ mode: "party", names: G.names, cats: G.cats, timer: G.timer, challenge: null }); };
  }

  /* ---------------- modal helpers ---------------- */
  function showModal(html, onOk) {
    $modalBody.innerHTML = html;
    $modal.hidden = false;
    const ok = $modalBody.querySelector("#ok");
    if (ok) { ok.onclick = () => { hideModal(); onOk && onOk(); }; ok.focus(); }
  }
  function hideModal() { $modal.hidden = true; }
  function confirmModal(title, body, yes) {
    showModal(`<h2 style="font-size:24px">${title}</h2><p class="muted">${body}</p><div class="row"><button class="btn" id="no">Cancel</button><button class="btn primary" id="yes">Yes</button></div>`);
    $modalBody.querySelector("#no").onclick = hideModal;
    $modalBody.querySelector("#yes").onclick = () => { hideModal(); yes(); };
  }

  /* ---------------- keyboard ---------------- */
  document.addEventListener("keydown", (e) => {
    if (!G || !G.cur || G.cur.locked || !$modal.hidden || e.target.tagName === "INPUT") return;
    const i = KEYS.indexOf(e.key.toUpperCase());
    if (i >= 0 && !G.cur.hidden.has(G.cur.opts[i])) choose(i);
  });

  if (!Q.length) { $app.innerHTML = `<div class="card setup"><h2>No questions loaded</h2><p class="muted">questions.js is missing.</p></div>`; return; }
  home();
})();
