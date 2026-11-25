// Card Sharp: watch a deck deal out, keep count in your head, answer the dealer's questions.
import { sfx as commonSfx, shuffle, sleep } from '../common.js?v=5';

const SUITS = [
  { s: '♠', name: 'spades', red: false },
  { s: '♥', name: 'hearts', red: true },
  { s: '♦', name: 'diamonds', red: true },
  { s: '♣', name: 'clubs', red: false },
];
const RANKS = ['A', '2', '3', '4', '5', '6', '7', '8', '9', '10', 'J', 'Q', 'K'];
const RANK_NAMES = { A: 'Ace', J: 'Jack', Q: 'Queen', K: 'King' };
const rankName = (r) => RANK_NAMES[r] || r;
const cardName = (c) => `${rankName(c.r)} of ${c.suit.name[0].toUpperCase()}${c.suit.name.slice(1)}`;
const hiLo = (c) => (['2', '3', '4', '5', '6'].includes(c.r) ? 1 : ['7', '8', '9'].includes(c.r) ? 0 : -1);
const same = (a, b) => a.r === b.r && a.suit === b.suit;
const pick = (a) => a[Math.floor(Math.random() * a.length)];
const ANSWER_SECS = 10;

const cardHtml = (c, cls = '') => `
  <div class="sharp-card ${c.suit.red ? 'red' : ''} ${cls}">
    <span class="sharp-corner">${c.r}<br>${c.suit.s}</span>
    <span class="sharp-pip">${c.suit.s}</span>
    <span class="sharp-corner br">${c.r}<br>${c.suit.s}</span>
  </div>`;
const mini = (c) => `<span class="sharp-mini ${c.suit.red ? 'red' : ''}">${c.r}${c.suit.s}</span>`;

const CSS = `
.sharp-wrap { max-width: 520px; margin: 0 auto; display: flex; flex-direction: column; align-items: center; user-select: none; -webkit-user-select: none; }
.sharp-mult.pop { animation: sharp-pop .5s ease-out; color: var(--accent); }
@keyframes sharp-pop { 40% { transform: scale(1.6) rotate(-6deg); } }
.sharp-table { position: relative; width: 100%; height: min(250px, 38svh); display: flex; align-items: center; justify-content: center; gap: 28px;
  background: radial-gradient(ellipse at center, rgba(74,222,128,.10), rgba(74,222,128,.02) 70%); border: 1px solid var(--line); border-radius: 18px; }
.sharp-stack { position: relative; width: min(110px, 22vw); aspect-ratio: 5/7; }
.sharp-back { position: absolute; inset: 0; border-radius: 10px; border: 2px solid rgba(255,255,255,.12);
  background: repeating-linear-gradient(45deg, #4c3a8c 0 6px, #5b47a3 6px 12px); box-shadow: 0 2px 6px rgba(0,0,0,.4); }
.sharp-stack-label { position: absolute; bottom: -22px; left: 0; right: 0; text-align: center; font-size: 11px; color: var(--muted); letter-spacing: .1em; text-transform: uppercase; }
.sharp-slot { width: min(140px, 30vw); aspect-ratio: 5/7; position: relative; }
.sharp-card { position: absolute; inset: 0; background: #f7f5ef; color: #1d1b26; border-radius: 12px; box-shadow: 0 8px 22px rgba(0,0,0,.45);
  display: grid; place-items: center; font-family: Georgia, 'Times New Roman', serif; }
.sharp-card.red { color: #d6304a; }
.sharp-card.in { animation: sharp-in .28s ease-out; }
@keyframes sharp-in { from { transform: translateX(-120px) rotate(-12deg); opacity: 0; } }
.sharp-pip { font-size: min(64px, 13vw); line-height: 1; }
.sharp-corner { position: absolute; top: 8px; left: 10px; font-size: min(20px, 4.4vw); font-weight: 800; line-height: 1.05; text-align: center; }
.sharp-corner.br { top: auto; left: auto; bottom: 8px; right: 10px; transform: rotate(180deg); }
.sharp-empty { position: absolute; inset: 0; border: 2px dashed var(--line); border-radius: 12px; display: grid; place-items: center; color: var(--dim); font-size: 13px; }
.sharp-legend { font-size: 12px; color: var(--muted); margin: 14px 0 0; text-align: center; }
.sharp-legend b { color: var(--text); font-weight: 600; }
.sharp-q { width: 100%; margin-top: 16px; min-height: 170px; }
.sharp-q-text { font-family: var(--display); font-size: 21px; text-align: center; margin-bottom: 6px; letter-spacing: -.02em; }
.sharp-timer { height: 4px; background: var(--panel-2); border-radius: 4px; overflow: hidden; margin: 10px 0 14px; }
.sharp-timer i { display: block; height: 100%; background: var(--accent); transform-origin: left; }
.sharp-opts { display: grid; grid-template-columns: repeat(2, 1fr); gap: 8px; }
.sharp-opts.many { grid-template-columns: repeat(auto-fill, minmax(52px, 1fr)); }
.sharp-opt { background: var(--panel-2); border: 1px solid var(--line); border-radius: 12px; padding: 13px 8px; font-size: 17px; font-weight: 600; transition: background .15s, border-color .15s; }
.sharp-opt:hover { border-color: var(--accent); }
.sharp-opt .k { display: block; font-size: 10px; color: var(--dim); font-weight: 400; margin-top: 2px; }
.sharp-opt.red { color: #f2687e; }
.sharp-opt.right { background: rgba(74,222,128,.2); border-color: var(--good); }
.sharp-opt.wrong { background: rgba(248,113,113,.2); border-color: var(--bad); }
.sharp-feedback { text-align: center; margin-top: 12px; min-height: 22px; font-weight: 500; }
.sharp-feedback.good { color: var(--good); }
.sharp-feedback.bad { color: var(--bad); }
.sharp-mini { font-family: Georgia, 'Times New Roman', serif; font-weight: 700; }
.sharp-mini.red { color: #f2687e; }
.sharp-start { text-align: center; margin-top: 18px; }
.sharp-start p { color: var(--muted); margin-bottom: 14px; }
`;

export default {
  id: 'sharp',
  title: 'Card Sharp',
  blurb: 'Watch the deck deal out, keep count in your head, then answer the dealer.',
  rules:
    'Cards deal one at a time, getting faster. Every few cards the dealer stops and quizzes you: how many hearts so far, has a card come out, what’s the running count, which suit is most likely next. Answer fast for bonus points; a streak builds a multiplier. One card is never dealt — name it at the end for a big bonus.',
  icon: `<svg viewBox="0 0 48 48" xmlns="http://www.w3.org/2000/svg">
    <rect x="9" y="10" width="20" height="28" rx="3" transform="rotate(-12 19 24)" fill="#5b47a3" stroke="#a78bfa" stroke-width="1.5"/>
    <rect x="19" y="9" width="20" height="28" rx="3" transform="rotate(8 29 23)" fill="#f7f5ef"/>
    <text x="29.5" y="28" transform="rotate(8 29 23)" text-anchor="middle" font-size="13" fill="#d6304a" font-family="sans-serif">♥</text>
    <circle cx="37" cy="37" r="7" fill="#a78bfa"/><text x="37" y="40.5" text-anchor="middle" font-size="9" font-weight="700" fill="#15121f" font-family="sans-serif">+1</text>
  </svg>`,
  options: [
    { key: 'deck', label: 'Deck', choices: ['Half deck', 'Full deck'], default: 'Full deck' },
    { key: 'speed', label: 'Speed', choices: ['Steady', 'Fast'], default: 'Steady' },
  ],
  score: { label: 'Points', order: 'desc', format: (v) => `${v}` },

  mount(el, { options, finish, sfx = commonSfx }) {
    if (!document.getElementById('sharp-style')) {
      const st = document.createElement('style');
      st.id = 'sharp-style';
      st.textContent = CSS;
      document.head.appendChild(st);
    }
    let stopped = false;
    const timers = new Set();
    const later = (fn, ms) => { const t = setTimeout(() => { timers.delete(t); fn(); }, ms); timers.add(t); return t; };
    const wait = (ms) => new Promise((r) => later(r, ms));
    let keyHandler = null;
    const onKey = (e) => keyHandler?.(e);
    document.addEventListener('keydown', onKey);

    // the deck: half deck = two random suits
    const suits = options.deck === 'Half deck' ? shuffle(SUITS).slice(0, 2) : SUITS;
    const all = suits.flatMap((suit) => RANKS.map((r) => ({ r, suit })));
    const order = shuffle(all);
    const missing = order.pop(); // never dealt
    const dealt = [];
    const fast = options.speed === 'Fast';
    const startMs = fast ? 950 : 1500;
    const endMs = fast ? 520 : 850;
    const qEvery = options.deck === 'Half deck' ? 5 : 6;

    let points = 0, streak = 0, mult = 1, right = 0, asked = 0, finaleHit = '';

    el.innerHTML = `
      <div class="sharp-wrap">
        <div class="hud">
          <div class="stat"><span>Points</span><b data-k="pts">0</b></div>
          <div class="stat"><span>Multiplier</span><b class="sharp-mult" data-k="mult">x1</b></div>
          <div class="stat"><span>Dealt</span><b data-k="dealt">0/${order.length}</b></div>
        </div>
        <div class="sharp-table">
          <div class="sharp-stack" data-k="deck"><div class="sharp-back"></div><span class="sharp-stack-label">Deck</span></div>
          <div class="sharp-slot" data-k="slot"><div class="sharp-empty">Dealer</div></div>
        </div>
        <p class="sharp-legend">Running count: <b>2–6 = +1</b> · <b>7–9 = 0</b> · <b>10–A = −1</b></p>
        <div class="sharp-q" data-k="q">
          <div class="sharp-start">
            <p>${options.deck === 'Half deck' ? `This deck is only <b>${suits.map((s) => s.name).join(' and ')}</b> — 26 cards.` : 'A full 52-card deck.'} Watch closely.</p>
            <button class="btn big" data-k="go">Deal</button>
          </div>
        </div>
      </div>`;
    const $ = (k) => el.querySelector(`[data-k="${k}"]`);
    const paint = () => {
      $('pts').textContent = points;
      $('mult').textContent = `x${mult}`;
      $('dealt').textContent = `${dealt.length}/${order.length}`;
      $('deck').style.visibility = dealt.length >= order.length ? 'hidden' : '';
    };

    function score(ok, secsLeft) {
      asked++;
      if (ok) {
        right++;
        streak++;
        const gain = (10 + Math.ceil(secsLeft)) * mult;
        points += gain;
        const newMult = Math.min(5, 1 + Math.floor(streak / 3));
        if (newMult > mult) {
          const m = $('mult');
          m.classList.remove('pop'); void m.offsetWidth; m.classList.add('pop');
        }
        mult = newMult;
        sfx.good();
        paint();
        return gain;
      }
      streak = 0;
      mult = 1;
      sfx.bad();
      paint();
      return 0;
    }

    // Ask one question. choices: [{label, value, cls}], correct: value or array of values
    function ask(text, choices, correct, explain, many = false) {
      return new Promise((resolve) => {
        const ok = (v) => (Array.isArray(correct) ? correct.includes(v) : v === correct);
        $('q').innerHTML = `
          <div class="sharp-q-text">${text}</div>
          <div class="sharp-timer"><i style="transition: transform ${ANSWER_SECS}s linear"></i></div>
          <div class="sharp-opts ${many ? 'many' : ''}">${choices.map((c, i) => `
            <button class="sharp-opt ${c.cls || ''}" data-i="${i}">${c.label}${!many && choices.length <= 4 ? `<span class="k">${i + 1}</span>` : ''}</button>`).join('')}</div>
          <div class="sharp-feedback"></div>`;
        const bar = $('q').querySelector('.sharp-timer i');
        requestAnimationFrame(() => requestAnimationFrame(() => (bar.style.transform = 'scaleX(0)')));
        const t0 = performance.now();
        let done = false;
        const answer = (i) => {
          if (done || stopped) return;
          done = true;
          keyHandler = null;
          const left = Math.max(0, ANSWER_SECS - (performance.now() - t0) / 1000);
          const pickd = i == null ? null : choices[i];
          const good = pickd != null && ok(pickd.value);
          const btns = [...$('q').querySelectorAll('.sharp-opt')];
          btns.forEach((b, j) => { if (ok(choices[j].value)) b.classList.add('right'); });
          if (i != null && !good) btns[i].classList.add('wrong');
          bar.style.transition = 'none';
          const gain = score(good, left);
          const fb = $('q').querySelector('.sharp-feedback');
          fb.className = `sharp-feedback ${good ? 'good' : 'bad'}`;
          fb.innerHTML = good ? `Right! +${gain}` : `${i == null ? 'Time’s up. ' : ''}${explain}`;
          later(() => resolve(good), good ? 900 : 2000);
        };
        $('q').querySelector('.sharp-opts').onclick = (e) => {
          const b = e.target.closest('[data-i]');
          if (b) answer(+b.dataset.i);
        };
        keyHandler = (e) => {
          const n = parseInt(e.key, 10);
          if (n >= 1 && n <= Math.min(4, choices.length) && !many) answer(n - 1);
        };
        later(() => answer(null), ANSWER_SECS * 1000);
      });
    }

    const numberChoices = (correct, lo = -Infinity) => {
      const set = new Set([correct]);
      for (const d of shuffle([-2, -1, 1, 2, 3, -3])) {
        if (set.size >= 4) break;
        if (correct + d >= lo) set.add(correct + d);
      }
      return [...set].sort((a, b) => a - b).map((v) => ({ label: v > 0 && lo < 0 ? `+${v}` : `${v}`, value: v }));
    };
    const remaining = () => all.filter((c) => !dealt.some((d) => same(d, c)));

    // question makers, chosen at random (with some variety)
    const makers = {
      suitCount() {
        const suit = pick(suits);
        const n = dealt.filter((c) => c.suit === suit).length;
        return ask(`How many <span class="sharp-mini ${suit.red ? 'red' : ''}">${suit.s}</span> ${suit.name} have been dealt?`,
          numberChoices(n, 0), n, `It was ${n}.`);
      },
      seen() {
        const wasDealt = Math.random() < 0.5 && dealt.length;
        const c = wasDealt ? pick(dealt) : pick(remaining());
        return ask(`Has the ${mini(c)} been dealt yet?`,
          [{ label: 'Yes', value: true }, { label: 'No', value: false }], !!wasDealt,
          wasDealt ? 'Yes, it came out earlier.' : 'No, it hasn’t come out.');
      },
      count() {
        const n = dealt.reduce((s, c) => s + hiLo(c), 0);
        return ask('What’s the running count?', numberChoices(n), n, `The count is ${n > 0 ? '+' : ''}${n}.`);
      },
      likely() {
        const rem = remaining();
        const counts = suits.map((s) => rem.filter((c) => c.suit === s).length);
        const max = Math.max(...counts);
        if (counts.filter((n) => n === max).length === suits.length) return null; // all tied: skip
        const best = suits.filter((_, i) => counts[i] === max);
        return ask('Which suit is most likely to come next?',
          suits.map((s) => ({ label: s.s, value: s, cls: s.red ? 'red' : '' })), best,
          `${best.map((s) => s.name).join(' / ')} — ${max} left.`);
      },
      back() {
        if (dealt.length < 4) return null;
        const k = pick([2, 3]);
        const target = dealt[dealt.length - 1 - k];
        const pool = shuffle(dealt.slice(-8).filter((c) => !same(c, target))).slice(0, 3);
        const choices = shuffle([target, ...pool]).map((c) => ({ label: mini(c), value: c }));
        return ask(`Which card came ${k} cards before the last one?`, choices, target, `It was the ${cardName(target)}.`);
      },
    };
    let lastKind = '';
    async function quiz() {
      const kinds = shuffle(Object.keys(makers)).filter((k) => k !== lastKind);
      for (const k of kinds) {
        const p = makers[k]();
        if (p) { lastKind = k; await p; return; }
      }
    }

    async function finale() {
      $('slot').innerHTML = `<div class="sharp-empty">?</div>`;
      $('q').innerHTML = `
        <div class="sharp-q-text">One card never came out. Which was it?</div>
        <p class="sharp-legend" style="margin:0 0 12px">Pick the suit, then the rank. Exact = +100 · suit or rank only = +25</p>
        <div class="sharp-opts" data-k="fsuit">${suits.map((s, i) => `<button class="sharp-opt ${s.red ? 'red' : ''}" data-i="${i}">${s.s}</button>`).join('')}</div>
        <div class="sharp-opts many" data-k="frank" style="margin-top:8px;opacity:.35;pointer-events:none">${RANKS.map((r) => `<button class="sharp-opt" data-r="${r}">${r}</button>`).join('')}</div>
        <div class="sharp-feedback"></div>`;
      const suit = await new Promise((res) => {
        $('fsuit').onclick = (e) => {
          const b = e.target.closest('[data-i]');
          if (!b) return;
          $('fsuit').querySelectorAll('.sharp-opt').forEach((x) => x.classList.toggle('right', x === b));
          sfx.click();
          res(suits[+b.dataset.i]);
        };
      });
      const fr = $('frank');
      fr.style.opacity = '';
      fr.style.pointerEvents = '';
      const rank = await new Promise((res) => {
        fr.onclick = (e) => { const b = e.target.closest('[data-r]'); if (b) res(b.dataset.r); };
      });
      if (stopped) return;
      fr.style.pointerEvents = 'none';
      $('fsuit').style.pointerEvents = 'none';
      const exact = suit === missing.suit && rank === missing.r;
      const partial = suit === missing.suit || rank === missing.r;
      const gain = exact ? 100 : partial ? 25 : 0;
      points += gain;
      finaleHit = exact ? 'named the missing card' : partial ? 'half-named the missing card' : 'missed the hidden card';
      $('slot').innerHTML = cardHtml(missing, 'in');
      const fb = $('q').querySelector('.sharp-feedback');
      fb.className = `sharp-feedback ${exact ? 'good' : partial ? '' : 'bad'}`;
      fb.innerHTML = exact ? `Spot on! +100` : `It was the ${cardName(missing)}.${gain ? ` +${gain}` : ''}`;
      exact ? sfx.win() : partial ? sfx.good() : sfx.bad();
      paint();
      await wait(2200);
    }

    async function run() {
      for (let i = 0; i < order.length; i++) {
        if (stopped) return;
        const c = order[i];
        dealt.push(c);
        $('slot').innerHTML = cardHtml(c, 'in');
        sfx.click();
        paint();
        const pace = startMs - (startMs - endMs) * (i / order.length);
        await wait(pace);
        if (stopped) return;
        const last = i === order.length - 1;
        if (!last && (i + 1) % qEvery === 0) {
          $('slot').innerHTML = `<div class="sharp-back"></div>`;
          await quiz();
          if (stopped) return;
          $('q').innerHTML = '';
        }
      }
      if (stopped) return;
      await finale();
      if (stopped) return;
      finish({ score: points, detail: `${right}/${asked} right · ${finaleHit}` });
    }

    $('go').onclick = () => { $('q').innerHTML = ''; run(); };
    keyHandler = (e) => { if (e.key === 'Enter' || e.key === ' ') { e.preventDefault(); $('go')?.click(); } };

    return () => {
      stopped = true;
      timers.forEach(clearTimeout);
      timers.clear();
      document.removeEventListener('keydown', onKey);
    };
  },
};
