// Every formation the particles pass through, computed once before the first
// frame. Particle i is the same particle in every formation: the story is a
// rearrangement, never a cut. Pure functions, no Three.js.

export const GOLDEN_ANGLE = Math.PI * (3 - Math.sqrt(5)); // 137.508°
export const LATTICE_HALF = 1.15;
export const SURFACE = { height: 0.75, base: -0.2 };
export const TRELLIS = { halfW: 0.86, halfH: 1.0, spacing: 0.34 };
export const HEAD = { x: 0, y: 1.02, z: 0.03, r: 0.26 };
export const TREE_LEVELS = 6;

function mulberry32(a) {
  return () => {
    a |= 0; a = (a + 0x6d2b79f5) | 0;
    let t = Math.imul(a ^ (a >>> 15), 1 | a);
    t = (t + Math.imul(t ^ (t >>> 7), 61 | t)) ^ t;
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}
function gauss(rand) {
  const u = Math.max(1e-9, rand()), v = rand();
  return Math.sqrt(-2 * Math.log(u)) * Math.cos(2 * Math.PI * v);
}

// The predicted response landscape: one true peak, one lower decoy, a ripple.
const PEAK = [0.42, -0.3], DECOY = [-0.46, 0.4];
function rawValue(u, v) {
  const g = (cx, cy, s) => Math.exp(-((u - cx) ** 2 + (v - cy) ** 2) / (2 * s * s));
  return g(PEAK[0], PEAK[1], 0.27) + 0.6 * g(DECOY[0], DECOY[1], 0.22)
    + 0.16 * g(0, 0, 0.75) + 0.035 * Math.sin(5 * u + 1) * Math.cos(4 * v);
}
let vMin = Infinity, vMax = -Infinity;
for (let i = 0; i <= 200; i++) for (let j = 0; j <= 200; j++) {
  const r = rawValue(i / 100 - 1, j / 100 - 1);
  vMin = Math.min(vMin, r); vMax = Math.max(vMax, r);
}
export const valueAt = (u, v) => (rawValue(u, v) - vMin) / (vMax - vMin);
export const surfacePoint = (u, v, lift = 0) =>
  [u * LATTICE_HALF, valueAt(u, v) * SURFACE.height + SURFACE.base + lift, v * LATTICE_HALF];
export const PEAK_UV = PEAK, DECOY_UV = DECOY;

export function buildFormations({ count, seed = 7, logo }) {
  const rand = mulberry32(seed);
  const gridSize = Math.round(Math.sqrt(count));
  const N = gridSize * gridSize;

  const tree = new Float32Array(N * 3), parentPos = new Float32Array(N * 3);
  const cloud = new Float32Array(N * 3), lattice = new Float32Array(N * 3);
  const trellis = new Float32Array(N * 3), spiral = new Float32Array(N * 3);
  const logoPos = new Float32Array(N * 2);
  const seedA = new Float32Array(N), level = new Float32Array(N), value = new Float32Array(N);
  const rank = new Float32Array(N), parent = new Int32Array(N).fill(-1);
  const square = new Uint8Array(N).fill(255), isRun = new Uint8Array(N), isArm = new Uint8Array(N);

  for (let i = 0; i < N; i++) seedA[i] = rand();

  // ── Tree: 6 variables × 3 settings, breadth-first so particle 0 is the root.
  const treeN = (3 ** (TREE_LEVELS + 1) - 1) / 2; // 1093
  const start = (k) => (3 ** k - 1) / 2;
  const angle = new Float32Array(treeN);
  const leaves = 3 ** TREE_LEVELS;
  for (let j = 0; j < leaves; j++) angle[start(TREE_LEVELS) + j] = (2 * Math.PI * (j + 0.5)) / leaves + Math.PI / 2;
  for (let k = TREE_LEVELS - 1; k >= 0; k--) {
    for (let j = 0; j < 3 ** k; j++) {
      const i = start(k) + j, c = 3 * i + 1;
      angle[i] = (angle[c] + angle[c + 1] + angle[c + 2]) / 3;
    }
  }
  for (let k = 0; k <= TREE_LEVELS; k++) {
    const r = Math.pow(k / TREE_LEVELS, 0.8);
    for (let j = 0; j < 3 ** k; j++) {
      const i = start(k) + j;
      const a = angle[i] + (k ? (rand() - 0.5) * 0.012 : 0);
      tree[i * 3] = r * Math.cos(a);
      tree[i * 3 + 1] = r * Math.sin(a);
      tree[i * 3 + 2] = k ? (rand() - 0.5) * 0.09 * (k / TREE_LEVELS) : 0;
      level[i] = k;
      if (i > 0) parent[i] = Math.floor((i - 1) / 3);
    }
  }
  for (let i = 0; i < treeN; i++) {
    const p = parent[i] < 0 ? i : parent[i];
    parentPos.set(tree.subarray(p * 3, p * 3 + 3), i * 3);
  }
  // Particles beyond the tree are born at the explosion from random tree nodes.
  for (let i = treeN; i < N; i++) {
    const host = start(3) + Math.floor(rand() * (treeN - start(3)));
    tree.set(tree.subarray(host * 3, host * 3 + 3), i * 3);
    parentPos.set(tree.subarray(host * 3, host * 3 + 3), i * 3);
    level[i] = -1;
  }

  // ── Cloud: lumpy, outward from where each particle was.
  const blobs = Array.from({ length: 9 }, () => {
    const d = [gauss(rand), gauss(rand), gauss(rand)], l = Math.hypot(...d) || 1, r = 0.35 + rand() * 0.6;
    return { c: d.map((x) => (x / l) * r), s: 0.16 + rand() * 0.2 };
  });
  for (let i = 0; i < N; i++) {
    let x, y, z;
    if (rand() < 0.28) {
      const d = [gauss(rand), gauss(rand), gauss(rand)], l = Math.hypot(...d), r = 1.35 * Math.cbrt(rand());
      [x, y, z] = d.map((q) => (q / l) * r);
    } else {
      const b = blobs[Math.floor(rand() * blobs.length)];
      x = b.c[0] + gauss(rand) * b.s; y = b.c[1] + gauss(rand) * b.s; z = b.c[2] + gauss(rand) * b.s;
    }
    // bias outward from the tree position so the burst reads as an explosion
    x += tree[i * 3] * 0.35; y += tree[i * 3 + 1] * 0.35;
    const l = Math.hypot(x, y, z);
    if (l > 1.5) { x *= 1.5 / l; y *= 1.5 / l; z *= 1.5 / l; }
    cloud[i * 3] = x; cloud[i * 3 + 1] = y; cloud[i * 3 + 2] = z;
  }

  // ── Runs: 24 points a lab can afford, spread through the cloud.
  for (let k = 0; k < 24; k++) isRun[Math.floor(((k + rand() * 0.8) / 24) * (N - 1)) + 1] = 1;

  // ── Lattice: spatial matching from the cloud so particles barely cross.
  const order = Array.from({ length: N }, (_, i) => i).sort((a, b) => cloud[a * 3] - cloud[b * 3]);
  for (let cx = 0; cx < gridSize; cx++) {
    const col = order.slice(cx * gridSize, (cx + 1) * gridSize).sort((a, b) => cloud[a * 3 + 2] - cloud[b * 3 + 2]);
    col.forEach((i, cz) => {
      const u = (cx / (gridSize - 1)) * 2 - 1, v = (cz / (gridSize - 1)) * 2 - 1;
      value[i] = valueAt(u, v);
      lattice[i * 3] = u * LATTICE_HALF;
      lattice[i * 3 + 1] = value[i] * SURFACE.height; // scaled by rise in the shader
      lattice[i * 3 + 2] = v * LATTICE_HALF;

      // ── Trellis: the landscape folds upright and each point snaps to a slat.
      let x = u * TRELLIS.halfW, y = -v * TRELLIS.halfH;
      const sp = TRELLIS.spacing;
      const a = x + y, b = x - y;
      const da = a - Math.round(a / sp) * sp, db = b - Math.round(b / sp) * sp;
      if (Math.abs(u) > 0.97 || Math.abs(v) > 0.97) {
        // the frame
      } else if (Math.abs(da) < Math.abs(db)) { x -= da / 2; y -= da / 2; }
      else { x -= db / 2; y += db / 2; }
      trellis[i * 3] = x; trellis[i * 3 + 1] = y; trellis[i * 3 + 2] = (rand() - 0.5) * 0.012;
    });
  }

  // ── Spiral: rank by value, best at the centre, 137.5° apart.
  const byValue = Array.from({ length: N }, (_, i) => i).sort((a, b) => value[b] - value[a] || a - b);
  byValue.forEach((i, k) => {
    rank[i] = k / (N - 1);
    const r = Math.sqrt((k + 0.5) / N), th = k * GOLDEN_ANGLE;
    spiral[i * 3] = r * Math.cos(th);
    spiral[i * 3 + 1] = r * Math.sin(th);
    spiral[i * 3 + 2] = 0.22 * (1 - r * r); // a gentle dome, like a seed head
    if (k % 21 === 0 || k % 34 === 0) isArm[i] = 1;
  });

  // ── Logo: fill each square evenly at its angle, density shared across squares.
  const target = N >= 4000 ? 1900 : 1050;
  const area = logo.squares.reduce((t, q) => t + q.size * q.size, 0);
  const spacing = Math.sqrt(area / target);
  const slots = logo.squares.map((q, si) => {
    const n = Math.max(3, Math.round(q.size / spacing)), pts = [];
    const th = (q.angleDeg * Math.PI) / 180, c = Math.cos(th), s = Math.sin(th);
    const inner = q.size * (1 - 0.6 / n);
    for (let a = 0; a < n; a++) for (let b = 0; b < n; b++) {
      const lx = ((a + 0.5) / n - 0.5) * inner, ly = ((b + 0.5) / n - 0.5) * inner;
      pts.push({ x: q.cx + c * lx - s * ly, y: q.cy + s * lx + c * ly, d: Math.hypot(lx, ly), si });
    }
    return pts.sort((p, q2) => p.d - q2.d);
  });
  const sq0 = logo.squares[0];
  slots[0][0] = { x: sq0.cx, y: sq0.cy, d: 0, si: 0 }; // the root lands dead centre on the i's dot
  logoPos[0] = sq0.cx; logoPos[1] = sq0.cy; square[0] = 0;
  const queue = [...slots[3], ...slots[2], ...slots[1], ...slots[0].slice(1)];
  let q = 0;
  for (const i of byValue) {
    if (i === 0) continue;
    if (q < queue.length) {
      const p = queue[q++];
      logoPos[i * 2] = p.x; logoPos[i * 2 + 1] = p.y; square[i] = p.si;
    } else {
      logoPos[i * 2] = logo.viewBox[2] / 2; logoPos[i * 2 + 1] = logo.viewBox[3] / 2;
    }
  }

  // ── Path: 101 points from a low corner to the true peak, bending around the decoy.
  const P0 = [-0.86, 0.86], P1 = [-0.05, 0.98], P2 = [-0.12, -0.2], P3 = PEAK;
  const path = new Float32Array(101 * 3);
  for (let k = 0; k <= 100; k++) {
    const t = k / 100, m = 1 - t;
    const u = m ** 3 * P0[0] + 3 * m * m * t * P1[0] + 3 * m * t * t * P2[0] + t ** 3 * P3[0];
    const v = m ** 3 * P0[1] + 3 * m * m * t * P1[1] + 3 * m * t * t * P2[1] + t ** 3 * P3[1];
    path.set(surfacePoint(u, v, 0.022), k * 3);
  }

  return {
    count: N, gridSize, tree, parentPos, cloud, lattice, trellis, spiral, logo: logoPos,
    seed: seedA, level, value, rank, parent, square, isRun, isArm, path, logoSpacing: spacing, treeN,
  };
}
