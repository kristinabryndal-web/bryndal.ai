// A maze in the shape of a rearing unicorn, seen in profile and facing right.
// The silhouette is built from "tapered capsules" (a thick line that can be
// fatter at one end): torso, neck, head, horn, legs, mane, tail. A grid cell
// belongs to the maze if its centre falls inside any capsule. Passages are
// carved with randomised Prim's. No DOM in here, so it can be checked with node.
// Each cell holds a bitmask of the ways OUT of it: 1 = west, 2 = east, 4 = north, 8 = south.

export const N = 55;          // cells across and down
export const U = 100 / N;     // the picture is 100 x 100 units; one cell is U units
export const DIRS = [
  { bit: 1, dx: -1, dy: 0, opp: 2 }, { bit: 2, dx: 1, dy: 0, opp: 1 },
  { bit: 4, dx: 0, dy: -1, opp: 8 }, { bit: 8, dx: 0, dy: 1, opp: 4 },
];

function rng(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

// [x1, y1, r1, x2, y2, r2, region] in a rough 100 x 100 sketch (y grows downward).
const SKETCH = [
  // tail, flowing down and back
  [25, 58, 3.5, 18, 66, 5, 'tail'], [18, 66, 5, 13, 76, 4.6, 'tail'], [13, 76, 4.6, 8.5, 85, 2, 'tail'],
  // far hind leg, stretched back
  [32, 64, 7.5, 28, 73, 4.6, 'body'], [28, 73, 4.6, 21, 79, 2.9, 'body'], [21, 79, 2.7, 18, 89, 2.3, 'body'], [18, 89, 2.5, 16.5, 92.5, 2.7, 'hoof'],
  // near hind leg, planted
  [36, 62, 8, 38, 74, 5, 'body'], [38, 74, 5, 36, 83, 3.1, 'body'], [36, 83, 2.9, 42, 91, 2.4, 'body'], [42, 91, 2.6, 45, 93.5, 2.8, 'hoof'],
  // barrel, chest and hindquarters
  [57, 44, 11, 36, 58, 11.5, 'body'], [58, 42, 10, 55, 48, 10, 'body'], [34, 58, 12, 31, 62, 10, 'body'],
  // forelegs, tucked up
  [58, 50, 5, 68, 56, 3.3, 'body'], [68, 56, 2.9, 66, 67, 2.3, 'body'], [66, 67, 2.5, 65, 70.5, 2.7, 'hoof'],
  [59, 46, 5, 72, 50, 3.3, 'body'], [72, 50, 2.9, 74, 62, 2.3, 'body'], [74, 62, 2.5, 74.5, 65.5, 2.7, 'hoof'],
  // neck, head, ear
  [56, 38, 9, 65, 21, 5.6, 'body'], [65, 19, 5.3, 73, 25, 3.5, 'body'], [73, 25, 3.5, 75.5, 28, 2.9, 'body'], [64, 15, 1.7, 66, 10, 0.7, 'body'],
  // mane down the crest of the neck
  [63, 13, 2.6, 57, 22, 4.6, 'mane'], [57, 22, 4.6, 50, 33, 4.6, 'mane'], [50, 33, 4.6, 46, 43, 2.6, 'mane'],
  // the horn
  [67.5, 13.5, 1.6, 82, 3, 0.5, 'horn'],
];
// nudge the sketch to sit centred and fill the square
const tx = (x) => (x - 45.5) * 1.04 + 50, ty = (y) => (y - 48.5) * 1.04 + 50;
export const PARTS = SKETCH.map(([x1, y1, r1, x2, y2, r2, region]) => ({ x1: tx(x1), y1: ty(y1), r1: r1 * 1.04, x2: tx(x2), y2: ty(y2), r2: r2 * 1.04, region }));
export const EYE = { x: tx(68.2), y: ty(19.6), r: 0.95 };
export const NOSTRIL = { x: tx(75.4), y: ty(27.2), r: 0.55 };
const HOOF = PARTS[6], HORN = PARTS[PARTS.length - 1];

export const cellXY = (c) => [((c % N) + 0.5) * U, (((c / N) | 0) + 0.5) * U];
const cellAt = (x, y) => Math.floor(x / U) + Math.floor(y / U) * N;

function flood(L, from, maxLen = Infinity) {
  const dist = new Int32Array(N * N).fill(-1), par = new Int32Array(N * N).fill(-1), q = [from];
  dist[from] = 0;
  for (let i = 0; i < q.length; i++) {
    const c = q[i];
    if (dist[c] >= maxLen) continue;
    for (const d of DIRS) if (L.open[c] & d.bit) { const t = c + d.dx + d.dy * N; if (dist[t] < 0) { dist[t] = dist[c] + 1; par[t] = c; q.push(t); } }
  }
  return { dist, par };
}
// Shortest route between two cells, as a list of cells (or null if none within maxLen).
export function route(L, from, to, maxLen) {
  const { dist, par } = flood(L, from, maxLen);
  if (dist[to] < 0) return null;
  const p = []; for (let t = to; t >= 0; t = par[t]) p.push(t);
  return p.reverse();
}

export function makeMaze(seed) {
  const r = rng(seed), open = new Uint8Array(N * N), inMaze = new Uint8Array(N * N), region = new Array(N * N).fill(null);
  // For shading: how near the edge of its limb each cell is (0 centre .. 1 edge), and which way the surface faces.
  const edge = new Float32Array(N * N).fill(2), nx = new Float32Array(N * N), ny = new Float32Array(N * N);
  for (let c = 0; c < N * N; c++) {
    const [px, py] = cellXY(c);
    for (const p of PARTS) {
      const dx = p.x2 - p.x1, dy = p.y2 - p.y1;
      const t = Math.max(0, Math.min(1, ((px - p.x1) * dx + (py - p.y1) * dy) / (dx * dx + dy * dy)));
      const cx = p.x1 + dx * t, cy = p.y1 + dy * t, rad = p.r1 + (p.r2 - p.r1) * t, e = Math.hypot(px - cx, py - cy) / rad;
      if (e < 1 && e < edge[c]) { edge[c] = e; region[c] = p.region; nx[c] = (px - cx) / rad; ny[c] = (py - cy) / rad; }
    }
  }
  // Thin parts (horn tip, fetlocks) could slip between cell centres, so every limb's centre line is always included.
  for (const p of PARTS) {
    const steps = Math.ceil(Math.hypot(p.x2 - p.x1, p.y2 - p.y1) / (U * 0.25));
    for (let i = 0; i <= steps; i++) {
      const c = cellAt(p.x1 + ((p.x2 - p.x1) * i) / steps, p.y1 + ((p.y2 - p.y1) * i) / steps);
      if (!region[c]) { region[c] = p.region; edge[c] = 0.85; }
    }
  }
  const L = { N, open, inMaze, region, edge, nx, ny, seed };
  L.start = cellAt(HOOF.x2, HOOF.y2);   // the far hind hoof
  L.end = cellAt(HORN.x2, HORN.y2);     // the very point of the horn

  const frontier = [];
  const addWalls = (c) => {
    const x = c % N, y = (c / N) | 0;
    for (const d of DIRS) {
      const ax = x + d.dx, ay = y + d.dy;
      if (ax >= 0 && ay >= 0 && ax < N && ay < N && region[ax + ay * N] && !inMaze[ax + ay * N]) frontier.push([c, ax + ay * N, d]);
    }
  };
  inMaze[L.start] = 1; addWalls(L.start);
  while (frontier.length) {
    const i = Math.floor(r() * frontier.length), [a, b, d] = frontier[i];
    frontier[i] = frontier[frontier.length - 1]; frontier.pop();
    if (inMaze[b]) continue;
    open[a] |= d.bit; open[b] |= d.opp; inMaze[b] = 1; addWalls(b);
  }
  L.cells = inMaze.reduce((a, b) => a + b, 0);
  const path = route(L, L.start, L.end);
  L.sol = path ? { len: path.length - 1, path } : null;
  return L;
}
