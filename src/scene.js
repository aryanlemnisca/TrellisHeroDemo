import * as THREE from 'three';
import { COLORS, LEAF_COLORS, PETAL_COLORS, T, win, range } from './story.config.js';
import {
  GOLDEN_ANGLE, LATTICE_HALF, SURFACE, TRELLIS, HEAD, TREE_LEVELS, valueAt, surfacePoint, PEAK_UV,
} from './formations.js';
import { LOGO } from './logo.geometry.js';

// Work in plain sRGB end to end so every hex renders exactly as in CSS,
// and the cream canvas meets the cream page without a seam.
THREE.ColorManagement.enabled = false;
const col = (hex) => new THREE.Color(hex);
const lerp = (a, b, t) => a + (b - a) * t;
const smooth = (t) => t * t * (3 - 2 * t);

const GLSL_COMMON = /* glsl */ `
  #define PI 3.14159265
  float ease(float t){ t = clamp(t, 0.0, 1.0); return t < 0.5 ? 4.0*t*t*t : 1.0 - pow(-2.0*t + 2.0, 3.0) / 2.0; }
  float stag(float t, float k, float spread){ return clamp((t - k*spread) / (1.0 - spread), 0.0, 1.0); }
  vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
  uniform vec3 uO1, uO2, uO3, uO4, uGreyC;
  vec3 ramp(float v){
    vec3 c = mix(uGreyC, uO4, smoothstep(0.12, 0.42, v));
    c = mix(c, uO3, smoothstep(0.42, 0.62, v));
    c = mix(c, uO2, smoothstep(0.62, 0.8, v));
    return mix(c, uO1, smoothstep(0.8, 0.96, v));
  }
`;

const paletteUniforms = () => ({
  uO1: { value: col(COLORS.o1) }, uO2: { value: col(COLORS.o2) },
  uO3: { value: col(COLORS.o3) }, uO4: { value: col(COLORS.o4) },
  uGreyC: { value: col('#8C8A86') },
});

// ───────────────────────────────────────────────────────── particles
const PARTICLE_VS = /* glsl */ `
  ${GLSL_COMMON}
  attribute vec3 aParent, aCloud, aLattice, aTrellis, aSpiral;
  attribute vec2 aLogo;
  attribute vec4 aMisc;  // seed, level, value, square
  attribute vec3 aFlags; // run, arm, rank
  uniform float uTime, uGrow, uTremor, uBreak, uRuns, uLattice, uRise, uValueColor, uTrellis;
  uniform float uSpiral, uSpiralRot, uArms, uLogo, uTile, uPartFade, uSize, uSizeMul, uPR;
  uniform vec3 uHead, uLogoOrigin;
  uniform float uHeadR, uLogoScale, uLogoPx;
  uniform vec2 uLogoCenter;
  uniform vec4 uSqAngle;
  uniform vec3 uSq0, uSq1, uSq2, uSq3;
  varying vec3 vColor; varying float vAlpha; varying float vTile; varying float vAngle;

  void main(){
    float seed = aMisc.x, level = aMisc.y, value = aMisc.z, sq = aMisc.w;
    float run = aFlags.x, arm = aFlags.y, rank = aFlags.z;
    bool isRoot = abs(level) < 0.5;
    bool inTree = level > -0.5;

    // 1–2 · the tree grows ring by ring, each node sliding out of its parent
    vec3 p = position;
    float alpha = 0.0;
    if (inTree) {
      float g = isRoot ? 1.0 : ease(uGrow * 6.0 - (level - 1.0));
      p = mix(aParent, position, g);
      alpha = isRoot ? 1.0 : smoothstep(0.0, 0.25, g);
      p += uTremor * (0.004 + 0.022 * level / 6.0) *
        vec3(sin(uTime*21.0 + seed*91.0), cos(uTime*17.0 + seed*57.0), sin(uTime*13.0 + seed*33.0));
    }

    // 3 · it breaks: the space bursts into a cloud; new particles are born
    float b = ease(stag(uBreak, seed, 0.55));
    vec3 outward = normalize(aCloud + vec3(1e-4));
    p = mix(p, aCloud, b) + outward * sin(b * PI) * 0.22;
    alpha = inTree ? max(alpha, b) : smoothstep(0.0, 0.3, b);
    p += vec3(sin(uTime*0.21 + seed*40.0), cos(uTime*0.17 + seed*23.0), sin(uTime*0.19 + seed*11.0)) * 0.012 * b * (1.0 - uLattice);

    // 4–5 · Trellis: onto a lattice, which rises into the predicted landscape
    float l = ease(stag(uLattice, seed, 0.45));
    vec3 lat = vec3(aLattice.x, aLattice.y * uRise + ${SURFACE.base.toFixed(3)}, aLattice.z);
    p = mix(p, lat, l) + vec3(0.0, sin(l * PI) * 0.3 * (seed - 0.35), 0.0);

    // 7 · the landscape folds upright into a garden trellis, front row first
    float row = clamp(aLattice.z / ${(2 * LATTICE_HALF).toFixed(3)} + 0.5, 0.0, 1.0);
    float tr = ease(stag(uTrellis, 1.0 - row, 0.5));
    p = mix(p, aTrellis, tr) + vec3(0.0, 0.0, sin(tr * PI) * 0.3);

    // 8 · golden angle: everything swirls into a seed head at the vine's tip
    float sp = ease(stag(uSpiral, rank, 0.5));
    vec3 sPos = uHead + vec3(rot2(aSpiral.xy, uSpiralRot) * uHeadR, aSpiral.z * uHeadR);
    vec3 d = p - uHead;
    d.xy = rot2(d.xy, sin(sp * PI) * 1.8);
    p = mix(uHead + d, sPos, sp);

    // 9 · the logo: squares assemble smallest first along the arc
    float lk = sq < -0.5 ? 0.0 : ease((uLogo - sq * 0.14) / 0.58);
    vec3 lPos = uLogoOrigin + vec3((aLogo.x - uLogoCenter.x) * uLogoScale, -(aLogo.y - uLogoCenter.y) * uLogoScale, 0.0);
    p = mix(p, lPos, lk) + vec3(0.0, sin(lk * PI) * 0.1, sin(lk * PI) * 0.12);
    float gone = sq < -0.5 ? smoothstep(0.0, 0.45, uLogo - seed * 0.4) : 0.0;
    p += (p - uHead) * gone * 0.7;
    alpha *= (1.0 - gone) * (1.0 - uPartFade);

    // colour: grey/white is the untested unknown, orange is what Trellis knows
    vec3 c = isRoot ? uO4 : vec3(0.84, 0.83, 0.8);
    float a2 = 1.0;
    c = mix(c, uO1, uRuns * run * (1.0 - uValueColor));
    a2 *= mix(1.0, 0.3, uRuns * (1.0 - run) * (1.0 - l));
    c = mix(c, ramp(value), uValueColor);
    c = mix(c, mix(vec3(0.86, 0.82, 0.74), uO4, 0.25 + 0.5 * value), tr);
    c = mix(c, ramp(1.0 - rank * 1.35), sp);
    c = mix(c, uO1, uArms * arm * (1.0 - lk));
    a2 *= mix(1.0, 0.55, uArms * (1.0 - arm) * (1.0 - lk));
    vec3 sqc = sq < 0.5 ? uSq0 : sq < 1.5 ? uSq1 : sq < 2.5 ? uSq2 : uSq3;
    c = mix(c, sqc, lk);

    float size = uSize * uSizeMul;
    if (isRoot) size *= mix(3.4, 1.0, b);
    size *= mix(1.0, 2.6, uRuns * run * (1.0 - l));
    size *= mix(1.0, 1.6, uArms * arm * (1.0 - lk));

    vec4 mv = modelViewMatrix * vec4(p, 1.0);
    gl_Position = projectionMatrix * mv;
    float ps = size * uPR / -mv.z;
    float tile = lk * uTile;
    gl_PointSize = mix(ps, uLogoPx * uPR * 1.45, tile);

    vColor = c; vAlpha = alpha * a2; vTile = tile;
    vAngle = sq < 0.5 ? uSqAngle.x : sq < 1.5 ? uSqAngle.y : sq < 2.5 ? uSqAngle.z : uSqAngle.w;
  }
`;

const PARTICLE_FS = /* glsl */ `
  uniform float uOpaque;
  varying vec3 vColor; varying float vAlpha; varying float vTile; varying float vAngle;
  vec2 rot2(vec2 p, float a){ float c = cos(a), s = sin(a); return vec2(c*p.x - s*p.y, s*p.x + c*p.y); }
  void main(){
    vec2 c = gl_PointCoord - 0.5;
    float d = length(c);
    float roundA = smoothstep(0.24, 0.1, d) * 0.9 + pow(smoothstep(0.5, 0.0, d), 2.6) * 0.45;
    vec2 r = rot2(c, -vAngle) * 1.45;
    vec2 q = abs(r) - vec2(0.36);
    float sd = length(max(q, 0.0)) - 0.12;
    float tileA = 1.0 - smoothstep(-0.03, 0.03, sd);
    float a = mix(roundA, tileA, vTile) * vAlpha;
    if (a < 0.004) discard;
    gl_FragColor = vec4(vColor * a, a * uOpaque);
  }
`;

// ───────────────────────────────────────────────────────── plant
const PLANT_VS = /* glsl */ `
  attribute vec3 aCenter; attribute float aR; attribute float aGrow;
  uniform float uVine;
  varying vec3 vN; varying float vT; varying float vF;
  void main(){
    float f = sqrt(clamp((uVine - aGrow) / 0.022, 0.0, 1.0));
    vec3 p = aCenter + normal * aR * f;
    vN = normal; vT = aGrow; vF = f;
    gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
  }
`;
const PLANT_FS = /* glsl */ `
  uniform vec3 uC0, uC1; uniform float uAlpha;
  varying vec3 vN; varying float vT; varying float vF;
  void main(){
    if (vF <= 0.0) discard;
    vec3 base = mix(uC0, uC1, clamp(vT, 0.0, 1.0));
    float lit = 0.4 + 0.75 * max(dot(normalize(vN), normalize(vec3(0.4, 0.8, 0.7))), 0.0);
    gl_FragColor = vec4(base * lit, uAlpha);
  }
`;
const LEAF_VS = /* glsl */ `
  attribute vec3 aPos, aDX, aDY, aDZ, aColor; attribute float aBirth;
  uniform float uProg, uDur, uTime;
  varying vec2 vUv; varying vec3 vN; varying vec3 vColor; varying vec3 vView; varying float vG;
  float easeOutBack(float x){ float c1 = 1.70158, c3 = c1 + 1.0; return 1.0 + c3*pow(x - 1.0, 3.0) + c1*pow(x - 1.0, 2.0); }
  void main(){
    float g = clamp((uProg - aBirth) / uDur, 0.0, 1.0);
    float sc = g <= 0.0 ? 0.0 : easeOutBack(g);
    vec3 l = position;
    l.y *= mix(0.15, 1.0, smoothstep(0.0, 0.8, g));
    l.z += sin(uTime * 1.1 + aBirth * 40.0) * 0.035 * l.x;
    vec3 w = aPos + (aDX * l.x + aDY * l.y + aDZ * l.z) * sc;
    vN = normalize(aDX * normal.x + aDY * normal.y + aDZ * normal.z);
    vUv = uv; vColor = aColor; vG = g;
    vec4 mv = modelViewMatrix * vec4(w, 1.0);
    vView = -mv.xyz;
    vN = normalize(mat3(viewMatrix) * vN);
    gl_Position = projectionMatrix * mv;
  }
`;
const LEAF_FS = /* glsl */ `
  uniform float uAlpha;
  varying vec2 vUv; varying vec3 vN; varying vec3 vColor; varying vec3 vView; varying float vG;
  void main(){
    if (vG <= 0.0) discard;
    vec3 n = normalize(vN);
    vec3 L = normalize(vec3(0.35, 0.85, 0.6));
    float diff = abs(dot(n, L));
    float s = vUv.x, a = abs(vUv.y);
    float mid = 1.0 - smoothstep(0.012, 0.045, a);
    float vv = fract(s * 8.0 - a * 1.7);
    float vein = (1.0 - smoothstep(0.0, 0.07, min(vv, 1.0 - vv))) * smoothstep(0.06, 0.2, a)
      * (1.0 - smoothstep(0.72, 0.96, a)) * smoothstep(0.06, 0.2, s);
    vec3 c = vColor;
    c *= mix(0.72, 1.06, smoothstep(0.0, 0.55, s));
    c = mix(c, c * 0.62, smoothstep(0.6, 1.0, a));
    c = mix(c, min(c * 1.35 + 0.06, vec3(1.0)), mid * 0.65 + vein * 0.32);
    float rim = pow(1.0 - abs(dot(n, normalize(vView))), 2.0) * 0.22;
    gl_FragColor = vec4(c * (0.55 + 0.65 * diff) + rim * vColor, uAlpha);
  }
`;

// ───────────────────────────────────────────────────────── rings (seed halo, peak pulse)
const RING_FS = /* glsl */ `
  uniform float uTime, uAlpha; uniform vec3 uColor;
  varying vec2 vUv;
  void main(){
    float r = length(vUv - 0.5) * 2.0;
    float a = 0.0;
    for (int i = 0; i < 3; i++) {
      float ph = fract(uTime * 0.28 + float(i) / 3.0);
      a += exp(-pow((r - ph) / 0.012, 2.0)) * (1.0 - ph) * 0.55;
    }
    a += exp(-pow((r - 0.42) / 0.004, 2.0)) * 0.22 + exp(-pow((r - 0.74) / 0.004, 2.0)) * 0.12;
    a += exp(-r * 9.0) * 0.35;
    a *= uAlpha * (1.0 - smoothstep(0.9, 1.0, r));
    gl_FragColor = vec4(uColor * a, a);
  }
`;
const UV_VS = /* glsl */ `varying vec2 vUv; void main(){ vUv = uv; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`;

// ───────────────────────────────────────────────────────── geometry helpers
function leafGeometry() {
  const nu = 26, nv = 10, pos = [], uv = [], idx = [];
  for (let i = 0; i <= nu; i++) {
    const s = i / nu;
    const w = 0.5 * Math.pow(Math.sin(Math.PI * Math.pow(s, 0.62)), 0.8) * (1 - 0.1 * s);
    for (let j = 0; j <= nv; j++) {
      const a = (j / nv) * 2 - 1;
      pos.push(s, a * w, 0.09 * a * a * w - 0.12 * s * s);
      uv.push(s, a);
    }
  }
  for (let i = 0; i < nu; i++) for (let j = 0; j < nv; j++) {
    const a = i * (nv + 1) + j, b = a + nv + 1;
    idx.push(a, b, a + 1, b, b + 1, a + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(pos, 3));
  g.setAttribute('uv', new THREE.Float32BufferAttribute(uv, 2));
  g.setIndex(idx);
  g.computeVertexNormals();
  return g;
}

function tubeGeometry(curves, radial = 8) {
  const C = [], N = [], R = [], G = [], idx = [];
  let base = 0;
  for (const { pts, radius, start, dur } of curves) {
    const n = pts.length;
    let prevN = null;
    for (let i = 0; i < n; i++) {
      const a = pts[Math.max(0, i - 1)], b = pts[Math.min(n - 1, i + 1)];
      const t = new THREE.Vector3().subVectors(b, a).normalize();
      let nn = prevN ? prevN.clone() : new THREE.Vector3(0, 0, 1);
      nn.sub(t.clone().multiplyScalar(nn.dot(t))).normalize();
      if (!isFinite(nn.x) || nn.lengthSq() < 0.5) nn = new THREE.Vector3(1, 0, 0);
      prevN = nn;
      const bb = new THREE.Vector3().crossVectors(t, nn);
      const u = i / (n - 1);
      for (let j = 0; j <= radial; j++) {
        const ang = (j / radial) * Math.PI * 2;
        const d = nn.clone().multiplyScalar(Math.cos(ang)).addScaledVector(bb, Math.sin(ang));
        C.push(pts[i].x, pts[i].y, pts[i].z); N.push(d.x, d.y, d.z);
        R.push(radius(u)); G.push(start + u * dur);
      }
    }
    for (let i = 0; i < n - 1; i++) for (let j = 0; j < radial; j++) {
      const a = base + i * (radial + 1) + j, b = a + radial + 1;
      idx.push(a, b, a + 1, b, b + 1, a + 1);
    }
    base += n * (radial + 1);
  }
  const g = new THREE.BufferGeometry();
  g.setAttribute('position', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('aCenter', new THREE.Float32BufferAttribute(C, 3));
  g.setAttribute('normal', new THREE.Float32BufferAttribute(N, 3));
  g.setAttribute('aR', new THREE.Float32BufferAttribute(R, 1));
  g.setAttribute('aGrow', new THREE.Float32BufferAttribute(G, 1));
  g.setIndex(idx);
  return g;
}

// The vine: climbs the trellis, swaying, weaving in front of and behind slats,
// and converges on the centre where the seed head will form.
export function vineAt(t) {
  const conv = 1 - 0.92 * smooth(Math.min(1, Math.max(0, (t - 0.7) / 0.3)));
  return new THREE.Vector3(
    0.3 * Math.sin(t * Math.PI * 2.3 + 0.35) * conv,
    -1.08 + t * (HEAD.y + 1.08),
    0.045 * Math.sin(t * Math.PI * 17) * conv + HEAD.z * smooth(t),
  );
}

// ───────────────────────────────────────────────────────── camera keyframes
const CAM_KEYS = [
  { s: 0.000, p: [0, 0, 0.66], t: [0, 0, 0], f: 36 },
  { s: 0.056, p: [0, 0, 0.47], t: [0, 0, 0], f: 36 },
  { s: 0.160, branchEnd: true },
  { s: 0.205, p: [0.75, -0.35, 3.15], t: [0, 0, 0], f: 40 },
  { s: 0.268, p: [1.55, 0.55, 2.95], t: [0, 0, 0], f: 42 },
  { s: 0.300, p: [0.55, 2.35, 2.45], t: [0, -0.1, 0], f: 40 },
  { s: 0.345, p: [0.0, 2.95, 1.75], t: [0, -0.1, 0.05], f: 38 },
  { s: 0.405, p: [2.3, 1.45, 2.35], t: [0, 0.05, 0], f: 38 },
  { s: 0.452, p: [2.45, 1.25, 1.85], t: [0, 0.05, 0], f: 38 },
  { s: 0.500, p: [1.25, 1.35, 2.35], t: [-0.05, 0.12, 0.15], f: 38 },
  { s: 0.546, p: [1.3, 2.05, 1.45], t: [0.3, 0.38, -0.2], f: 40 },
  { s: 0.596, p: [0.5, -0.05, 3.15], t: [0, -0.02, 0], f: 40 },
  { s: 0.676, p: [0.28, 0.6, 2.35], t: [0, 0.55, 0], f: 40 },
  { s: 0.742, p: [0.0, HEAD.y, HEAD.z + 1.55], t: [0, HEAD.y, HEAD.z], f: 36 },
  { s: 0.790, p: [0.0, HEAD.y, HEAD.z + 1.68], t: [0, HEAD.y, HEAD.z], f: 36 },
  { s: 0.860, p: [0.0, HEAD.y, HEAD.z + 1.8], t: [0, HEAD.y, HEAD.z], f: 35 },
  { s: 1.000, p: [0.0, HEAD.y, HEAD.z + 1.8], t: [0, HEAD.y, HEAD.z], f: 35 },
];
const LOGO_KEY = CAM_KEYS[CAM_KEYS.length - 1];

function branchCam(s) {
  const g = win(s, 'grow');
  const lvl = Math.max(0.55, g * TREE_LEVELS);
  const R = Math.pow(lvl / TREE_LEVELS, 0.8);
  const f = 36 + 2 * g;
  const D = Math.max(0.47, (R / Math.tan((f * Math.PI) / 360)) * 1.12);
  const dir = new THREE.Vector3(0.17 * g, -0.24 * g, 1).normalize();
  return { p: dir.multiplyScalar(D).toArray(), t: [0, 0, 0], f };
}
CAM_KEYS[2] = { s: 0.160, ...branchCam(0.16) };

function cameraAt(s) {
  if (s >= CAM_KEYS[1].s && s <= CAM_KEYS[2].s) {
    // continuous pull-back: the newest ring always sits near the frame edge
    const a = branchCam(Math.max(s, T.grow[0]));
    const k = smooth(range(s, CAM_KEYS[1].s, T.grow[0] + 0.004));
    const k0 = CAM_KEYS[1];
    return {
      p: k0.p.map((v, i) => lerp(v, a.p[i], k)), t: a.t, f: lerp(k0.f, a.f, k),
    };
  }
  let i = 0;
  while (i < CAM_KEYS.length - 2 && s > CAM_KEYS[i + 1].s) i++;
  const A = CAM_KEYS[i], B = CAM_KEYS[i + 1];
  const k = smooth(range(s, A.s, B.s));
  return {
    p: A.p.map((v, j) => lerp(v, B.p[j], k)),
    t: A.t.map((v, j) => lerp(v, B.t[j], k)),
    f: lerp(A.f, B.f, k),
  };
}

// ───────────────────────────────────────────────────────── scene
export function createScene(canvas, F, { mobile }) {
  const renderer = new THREE.WebGLRenderer({ canvas, antialias: true, alpha: false, powerPreference: 'high-performance' });
  const PR = Math.min(window.devicePixelRatio || 1, mobile ? 1.5 : 2);
  renderer.setPixelRatio(PR);
  renderer.outputColorSpace = THREE.LinearSRGBColorSpace;
  renderer.setClearColor(0x000000, 1);
  const scene = new THREE.Scene();
  const camera = new THREE.PerspectiveCamera(36, 1, 0.01, 60);
  const pal = paletteUniforms();
  let viewW = 1, viewH = 1;

  // dust: a faint, far field that gives the black some depth
  {
    const n = mobile ? 350 : 700, p = new Float32Array(n * 3);
    for (let i = 0; i < n; i++) {
      const r = 3 + Math.random() * 7, a = Math.random() * Math.PI * 2, z = Math.random() * 2 - 1;
      p.set([r * Math.sqrt(1 - z * z) * Math.cos(a), r * z, r * Math.sqrt(1 - z * z) * Math.sin(a)], i * 3);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(p, 3));
    var dustMat = new THREE.PointsMaterial({ color: 0x8a8780, size: 1.4, sizeAttenuation: false, transparent: true, opacity: 0.35, depthWrite: false });
    var dust = new THREE.Points(g, dustMat);
    scene.add(dust);
  }

  // ── particles
  const N = F.count;
  const pg = new THREE.BufferGeometry();
  const misc = new Float32Array(N * 4), flags = new Float32Array(N * 3);
  for (let i = 0; i < N; i++) {
    misc.set([F.seed[i], F.level[i], F.value[i], F.square[i] === 255 ? -1 : F.square[i]], i * 4);
    flags.set([F.isRun[i], F.isArm[i], F.rank[i]], i * 3);
  }
  pg.setAttribute('position', new THREE.BufferAttribute(F.tree, 3));
  pg.setAttribute('aParent', new THREE.BufferAttribute(F.parentPos, 3));
  pg.setAttribute('aCloud', new THREE.BufferAttribute(F.cloud, 3));
  pg.setAttribute('aLattice', new THREE.BufferAttribute(F.lattice, 3));
  pg.setAttribute('aTrellis', new THREE.BufferAttribute(F.trellis, 3));
  pg.setAttribute('aSpiral', new THREE.BufferAttribute(F.spiral, 3));
  pg.setAttribute('aLogo', new THREE.BufferAttribute(F.logo, 2));
  pg.setAttribute('aMisc', new THREE.BufferAttribute(misc, 4));
  pg.setAttribute('aFlags', new THREE.BufferAttribute(flags, 3));
  pg.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 100);
  const sq = LOGO.squares;
  const pu = {
    ...pal,
    uTime: { value: 0 }, uGrow: { value: 0 }, uTremor: { value: 0 }, uBreak: { value: 0 }, uRuns: { value: 0 },
    uLattice: { value: 0 }, uRise: { value: 0 }, uValueColor: { value: 0 }, uTrellis: { value: 0 },
    uSpiral: { value: 0 }, uSpiralRot: { value: 0 }, uArms: { value: 0 }, uLogo: { value: 0 }, uTile: { value: 0 },
    uPartFade: { value: 0 }, uSize: { value: mobile ? 9.5 : 10.5 }, uSizeMul: { value: 1 }, uPR: { value: PR },
    uHead: { value: new THREE.Vector3(HEAD.x, HEAD.y, HEAD.z) }, uHeadR: { value: HEAD.r },
    uLogoOrigin: { value: new THREE.Vector3() }, uLogoScale: { value: 0.001 }, uLogoPx: { value: 4 },
    uLogoCenter: { value: new THREE.Vector2(LOGO.viewBox[2] / 2, LOGO.viewBox[3] / 2) },
    uSqAngle: { value: new THREE.Vector4(...sq.map((q) => (q.angleDeg * Math.PI) / 180)) },
    uSq0: { value: col(sq[0].color) }, uSq1: { value: col(sq[1].color) },
    uSq2: { value: col(sq[2].color) }, uSq3: { value: col(sq[3].color) },
    uOpaque: { value: 0 },
  };
  const pMat = new THREE.ShaderMaterial({
    uniforms: pu, vertexShader: PARTICLE_VS, fragmentShader: PARTICLE_FS,
    transparent: true, depthWrite: false,
    blending: THREE.CustomBlending, blendEquation: THREE.AddEquation,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  });
  const points = new THREE.Points(pg, pMat);
  points.renderOrder = 10;
  scene.add(points);

  // ── tree branches
  const treeLines = (() => {
    const segs = F.treeN - 1;
    const pos = new Float32Array(segs * 6), from = new Float32Array(segs * 6);
    const end = new Float32Array(segs * 2), lvl = new Float32Array(segs * 2), sv = new Float32Array(segs * 2);
    const vl = new Float32Array(segs * 2), sg = new Float32Array(segs * 2);
    for (let i = 1; i < F.treeN; i++) {
      const k = i - 1, par = F.parent[i];
      const c = F.tree.subarray(i * 3, i * 3 + 3), pp = F.tree.subarray(par * 3, par * 3 + 3);
      pos.set(pp, k * 6); pos.set(c, k * 6 + 3);
      from.set(pp, k * 6); from.set(pp, k * 6 + 3);
      end.set([0, 1], k * 2); lvl.set([F.level[i], F.level[i]], k * 2);
      sv.set([F.seed[par], F.seed[i]], k * 2); vl.set([F.level[par], F.level[i]], k * 2);
      const snapOrder = Math.min(0.98, F.seed[i] * 0.85 + (1 - F.level[i] / 6) * 0.15);
      sg.set([snapOrder, snapOrder], k * 2);
    }
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.BufferAttribute(pos, 3));
    g.setAttribute('aFrom', new THREE.BufferAttribute(from, 3));
    g.setAttribute('aEnd', new THREE.BufferAttribute(end, 1));
    g.setAttribute('aLevel', new THREE.BufferAttribute(lvl, 1));
    g.setAttribute('aSeedV', new THREE.BufferAttribute(sv, 1));
    g.setAttribute('aVLevel', new THREE.BufferAttribute(vl, 1));
    g.setAttribute('aSeg', new THREE.BufferAttribute(sg, 1));
    g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    const m = new THREE.ShaderMaterial({
      uniforms: { uGrow: pu.uGrow, uTremor: pu.uTremor, uTime: pu.uTime, uSnap: { value: 0 }, uAlpha: { value: 1 } },
      vertexShader: /* glsl */ `
        ${GLSL_COMMON}
        attribute vec3 aFrom; attribute float aEnd, aLevel, aSeedV, aVLevel, aSeg;
        uniform float uGrow, uTremor, uTime, uSnap;
        varying float vA; varying float vFlash;
        void main(){
          float g = ease(uGrow * 6.0 - (aLevel - 1.0));
          vec3 p = aEnd < 0.5 ? aFrom : mix(aFrom, position, g);
          p += uTremor * (0.004 + 0.022 * aVLevel / 6.0) *
            vec3(sin(uTime*21.0 + aSeedV*91.0), cos(uTime*17.0 + aSeedV*57.0), sin(uTime*13.0 + aSeedV*33.0));
          float snap = smoothstep(aSeg - 0.03, aSeg, uSnap);
          vFlash = uSnap > 0.0 ? smoothstep(aSeg - 0.07, aSeg - 0.02, uSnap) * (1.0 - snap) : 0.0;
          vA = smoothstep(0.0, 0.3, g) * (1.0 - snap) * (0.24 + 0.2 * (1.0 - aLevel / 6.0));
          gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0);
        }`,
      fragmentShader: /* glsl */ `
        uniform float uAlpha; varying float vA; varying float vFlash;
        void main(){ vec3 c = mix(vec3(0.62, 0.61, 0.58), vec3(1.0, 0.8, 0.6), vFlash); gl_FragColor = vec4(c * (vA + vFlash * 0.5) * uAlpha, 0.0); }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    });
    const l = new THREE.LineSegments(g, m);
    l.renderOrder = 6;
    scene.add(l);
    return l;
  })();

  // ── the predicted landscape: mesh lines + a translucent surface with contours
  const G = F.gridSize;
  const landscape = (() => {
    const verts = new Float32Array(G * G * 3), vals = new Float32Array(G * G);
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const u = (i / (G - 1)) * 2 - 1, v = (j / (G - 1)) * 2 - 1, k = i * G + j;
      vals[k] = valueAt(u, v);
      verts.set([u * LATTICE_HALF, vals[k] * SURFACE.height, v * LATTICE_HALF], k * 3);
    }
    const lineIdx = [], triIdx = [];
    for (let i = 0; i < G; i++) for (let j = 0; j < G; j++) {
      const k = i * G + j;
      if (i < G - 1) lineIdx.push(k, k + G);
      if (j < G - 1) lineIdx.push(k, k + 1);
      if (i < G - 1 && j < G - 1) triIdx.push(k, k + 1, k + G, k + 1, k + G + 1, k + G);
    }
    const mk = (idx) => {
      const g = new THREE.BufferGeometry();
      g.setAttribute('position', new THREE.BufferAttribute(verts, 3));
      g.setAttribute('aValue', new THREE.BufferAttribute(vals, 1));
      g.setIndex(idx);
      g.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
      return g;
    };
    const vs = /* glsl */ `
      attribute float aValue; uniform float uRise; varying float vV; varying vec3 vW;
      void main(){ vV = aValue; vec3 p = vec3(position.x, position.y * uRise + ${SURFACE.base.toFixed(3)}, position.z);
        vW = p; gl_Position = projectionMatrix * modelViewMatrix * vec4(p, 1.0); }`;
    const uMesh = { value: 0 }, uSurf = { value: 0 };
    const lines = new THREE.LineSegments(mk(lineIdx), new THREE.ShaderMaterial({
      uniforms: { ...pal, uRise: pu.uRise, uAlpha: uMesh, uColorize: pu.uValueColor },
      vertexShader: vs,
      fragmentShader: /* glsl */ `${GLSL_COMMON} uniform float uAlpha, uColorize; varying float vV;
        void main(){ vec3 c = mix(vec3(0.5), ramp(vV), uColorize); float a = uAlpha * mix(0.2, 0.32, vV); gl_FragColor = vec4(c * a, 0.0); }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    lines.renderOrder = 5;
    const surf = new THREE.Mesh(mk(triIdx), new THREE.ShaderMaterial({
      uniforms: { ...pal, uRise: pu.uRise, uAlpha: uSurf },
      vertexShader: vs,
      fragmentShader: /* glsl */ `${GLSL_COMMON} uniform float uAlpha; varying float vV; varying vec3 vW;
        void main(){
          vec3 n = normalize(cross(dFdx(vW), dFdy(vW)));
          float lit = 0.35 + 0.65 * abs(dot(n, normalize(vec3(0.3, 1.0, 0.4))));
          float c = fract(vV * 14.0); float w = fwidth(vV * 14.0);
          float iso = 1.0 - smoothstep(0.0, w * 1.4, min(c, 1.0 - c));
          vec3 col = ramp(vV) * lit;
          float a = uAlpha * (0.16 + 0.22 * vV + iso * 0.55);
          gl_FragColor = vec4(col * a, a * 0.6);
        }`,
      transparent: true, depthWrite: false, side: THREE.DoubleSide, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    surf.renderOrder = 4;
    scene.add(surf, lines);
    return { uMesh, uSurf };
  })();

  // ── the path to the next experiment
  const pathPts = [];
  for (let k = 0; k < F.path.length / 3; k++) pathPts.push(new THREE.Vector3(...F.path.subarray(k * 3, k * 3 + 3)));
  const pathCurve = new THREE.CatmullRomCurve3(pathPts);
  const uPath = { value: 0 }, uPathA = { value: 0 };
  const pathMesh = new THREE.Mesh(new THREE.TubeGeometry(pathCurve, 320, 0.0075, 8), new THREE.ShaderMaterial({
    uniforms: { ...pal, uPath, uAlpha: uPathA },
    vertexShader: UV_VS,
    fragmentShader: /* glsl */ `${GLSL_COMMON} uniform float uPath, uAlpha; varying vec2 vUv;
      void main(){ if (vUv.x > uPath) discard;
        float head = exp(-pow((uPath - vUv.x) / 0.03, 2.0));
        vec3 c = mix(uO2, vec3(1.0, 0.93, 0.8), head * 0.8);
        float a = uAlpha * (0.75 + head * 0.25);
        gl_FragColor = vec4(c * a, a); }`,
    transparent: true, depthWrite: false, blending: THREE.CustomBlending,
    blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
  }));
  pathMesh.renderOrder = 7;
  scene.add(pathMesh);
  const RUN_T = [0.0, 0.2, 0.4, 0.6, 0.8, 1.0];
  const markers = RUN_T.map(() => {
    const m = new THREE.Mesh(new THREE.SphereGeometry(0.021, 20, 14),
      new THREE.MeshBasicMaterial({ color: COLORS.o1, transparent: true, opacity: 0, depthWrite: false }));
    m.renderOrder = 8;
    scene.add(m);
    return m;
  });

  // ── rings: halo around the first experiment, pulse on the true peak
  const ring = (size) => {
    const u = { uTime: pu.uTime, uAlpha: { value: 0 }, uColor: { value: col(COLORS.o4) } };
    const m = new THREE.Mesh(new THREE.PlaneGeometry(size, size), new THREE.ShaderMaterial({
      uniforms: u, vertexShader: UV_VS, fragmentShader: RING_FS, transparent: true, depthWrite: false,
      blending: THREE.CustomBlending, blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    m.renderOrder = 11;
    scene.add(m);
    return { mesh: m, u };
  };
  const halo = ring(0.5);
  const peakRing = ring(0.5);
  peakRing.mesh.rotation.x = -Math.PI / 2;
  peakRing.mesh.position.set(...surfacePoint(PEAK_UV[0], PEAK_UV[1], 0.012));
  peakRing.u.uColor.value = col(COLORS.o1);

  // ── the garden trellis: diagonal slats in a frame
  const uSlats = { value: 0 };
  {
    const { halfW: W, halfH: H, spacing: sp } = TRELLIS, v = [];
    for (let c = -Math.ceil((W + H) / sp) * sp; c <= W + H + 1e-6; c += sp) {
      const x0 = Math.max(-W, c - H), x1 = Math.min(W, c + H);
      if (x1 > x0) v.push(x0, c - x0, 0, x1, c - x1, 0);
      const y0x = Math.max(-W, c - H), y1x = Math.min(W, c + H);
      if (y1x > y0x) v.push(y0x, y0x - c, 0, y1x, y1x - c, 0);
    }
    v.push(-W, -H, 0, W, -H, 0, W, -H, 0, W, H, 0, W, H, 0, -W, H, 0, -W, H, 0, -W, -H, 0);
    const g = new THREE.BufferGeometry();
    g.setAttribute('position', new THREE.Float32BufferAttribute(v, 3));
    const slats = new THREE.LineSegments(g, new THREE.ShaderMaterial({
      uniforms: { uAlpha: uSlats },
      vertexShader: /* glsl */ `varying float vY; void main(){ vY = position.y; gl_Position = projectionMatrix * modelViewMatrix * vec4(position, 1.0); }`,
      fragmentShader: /* glsl */ `uniform float uAlpha; varying float vY;
        void main(){ float a = uAlpha * 0.4; gl_FragColor = vec4(vec3(0.95, 0.82, 0.62) * a, 0.0); }`,
      transparent: true, depthWrite: false, blending: THREE.CustomBlending,
      blendSrc: THREE.OneFactor, blendDst: THREE.OneMinusSrcAlphaFactor,
    }));
    slats.renderOrder = 3;
    scene.add(slats);
  }

  // ── the plant: vine, log-spiral tendrils, golden-angle leaves, petals
  const uVine = { value: 0 }, uPlantA = { value: 1 };
  const rnd = (() => { let a = 99; return () => ((a = (a * 16807) % 2147483647) / 2147483647); })();
  {
    const vinePts = Array.from({ length: 420 }, (_, i) => vineAt(i / 419));
    const curves = [{ pts: vinePts, radius: (u) => 0.017 * (1 - 0.7 * u) + 0.003, start: 0, dur: 1 }];
    [0.14, 0.3, 0.46, 0.6, 0.73, 0.84].forEach((t0, k) => {
      const base = vineAt(t0), tan = vineAt(t0 + 0.004).sub(vineAt(t0 - 0.004)).normalize();
      const side = new THREE.Vector3().crossVectors(tan, new THREE.Vector3(0, 0, 1)).normalize().multiplyScalar(k % 2 ? 1 : -1);
      const R0 = 0.055 + rnd() * 0.025, pts = [];
      for (let i = 0; i <= 70; i++) {
        const th = (i / 70) * Math.PI * 3.6, rho = R0 * Math.exp(-0.2 * th);
        const C = base.clone().addScaledVector(side, R0);
        pts.push(C.addScaledVector(side, rho * Math.cos(th + Math.PI)).addScaledVector(tan, rho * Math.sin(th + Math.PI) * (k % 2 ? -1 : 1) * -1)
          .add(new THREE.Vector3(0, 0, 0.006 * th)));
      }
      curves.push({ pts, radius: (u) => 0.0042 * (1 - 0.65 * u), start: t0 + 0.02, dur: 0.07 });
    });
    const vine = new THREE.Mesh(tubeGeometry(curves), new THREE.ShaderMaterial({
      uniforms: { uVine, uAlpha: uPlantA, uC0: { value: col('#3E5A35') }, uC1: { value: col('#9CC06C') } },
      vertexShader: PLANT_VS, fragmentShader: PLANT_FS, transparent: true,
    }));
    vine.renderOrder = 2;
    scene.add(vine);
  }
  const leafSystem = (items, uProg, uDur, uAlpha) => {
    const geo = new THREE.InstancedBufferGeometry().copy(leafGeometry());
    const n = items.length;
    const attrs = { aPos: 3, aDX: 3, aDY: 3, aDZ: 3, aColor: 3, aBirth: 1 };
    for (const [k, size] of Object.entries(attrs)) {
      const arr = new Float32Array(n * size);
      items.forEach((it, i) => arr.set(Array.isArray(it[k]) ? it[k] : [it[k]], i * size));
      geo.setAttribute(k, new THREE.InstancedBufferAttribute(arr, size));
    }
    geo.instanceCount = n;
    geo.boundingSphere = new THREE.Sphere(new THREE.Vector3(), 10);
    const m = new THREE.Mesh(geo, new THREE.ShaderMaterial({
      uniforms: { uProg, uDur: { value: uDur }, uTime: pu.uTime, uAlpha },
      vertexShader: LEAF_VS, fragmentShader: LEAF_FS, side: THREE.DoubleSide, transparent: true,
    }));
    m.renderOrder = 2;
    scene.add(m);
    return m;
  };
  {
    const leaves = [], Z = new THREE.Vector3(0, 0, 1);
    for (let k = 0; k < 34; k++) {
      const t = 0.055 + (k / 33) * 0.86;
      const p = vineAt(t), tan = vineAt(t + 0.004).sub(vineAt(t - 0.004)).normalize();
      const e1 = new THREE.Vector3().crossVectors(tan, Z).normalize(), e2 = new THREE.Vector3().crossVectors(tan, e1);
      const phi = k * GOLDEN_ANGLE;
      const radial = e1.clone().multiplyScalar(Math.cos(phi)).addScaledVector(e2, Math.sin(phi) * 0.75);
      const dx = radial.multiplyScalar(0.85).addScaledVector(tan, 0.55).normalize();
      const dy = new THREE.Vector3().crossVectors(dx, tan).normalize();
      const dz = new THREE.Vector3().crossVectors(dx, dy);
      const L = (0.17 + rnd() * 0.07) * (1.1 - 0.42 * t);
      const ci = Math.round(Math.min(LEAF_COLORS.length - 1, Math.max(0, t * (LEAF_COLORS.length - 1) + (rnd() - 0.5) * 2.6)));
      leaves.push({
        aPos: p.clone().addScaledVector(dx, 0.008).toArray(),
        aDX: dx.multiplyScalar(L).toArray(), aDY: dy.multiplyScalar(L * 1.15).toArray(), aDZ: dz.multiplyScalar(L).toArray(),
        aColor: col(LEAF_COLORS[ci]).toArray(), aBirth: t + 0.012,
      });
    }
    var leafMesh = leafSystem(leaves, uVine, 0.085, uPlantA);
  }
  const uPetals = { value: 0 }, uPetalA = { value: 1 };
  {
    const petals = [];
    for (let k = 0; k < 34; k++) {
      const phi = k * GOLDEN_ANGLE + 0.3;
      const out = new THREE.Vector3(Math.cos(phi), Math.sin(phi), 0);
      const dx = out.clone().multiplyScalar(0.94).add(new THREE.Vector3(0, 0, k < 21 ? 0.3 : 0.12)).normalize();
      const dz = new THREE.Vector3(0, 0, 1).addScaledVector(out, -0.3).normalize();
      const dy = new THREE.Vector3().crossVectors(dz, dx).normalize();
      const L = (k < 21 ? 0.105 : 0.135) + rnd() * 0.02;
      petals.push({
        aPos: [HEAD.x + out.x * HEAD.r * 0.93, HEAD.y + out.y * HEAD.r * 0.93, HEAD.z - 0.03 - (k < 21 ? 0 : 0.015)],
        aDX: dx.multiplyScalar(L).toArray(), aDY: dy.multiplyScalar(L * 0.7).toArray(), aDZ: dz.multiplyScalar(L).toArray(),
        aColor: col(PETAL_COLORS[Math.floor(rnd() * PETAL_COLORS.length)]).toArray(), aBirth: (k / 34) * 0.55,
      });
    }
    leafSystem(petals, uPetals, 0.42, uPetalA);
  }

  // ── per-frame
  const tmpC = new THREE.Color(), black = col(COLORS.black), cream = col(COLORS.cream), umber = col('#3B2414');
  const ambient = { x: 0, y: 0 };

  function aspectFit() {
    const a = viewW / viewH;
    return a >= 1 ? 1 : Math.min(2.1, 0.9 / a);
  }

  function update(s, time, { pointer = { x: 0, y: 0 }, logoRect } = {}) {
    // camera
    const c = cameraAt(s), fit = aspectFit();
    const target = new THREE.Vector3(...c.t);
    const pos = new THREE.Vector3(...c.p).sub(target).multiplyScalar(fit).add(target);
    const still = 1 - range(s, 0.83, 0.865);
    const dist = pos.distanceTo(target);
    ambient.x += (pointer.x - ambient.x) * 0.04; ambient.y += (pointer.y - ambient.y) * 0.04;
    pos.x += (Math.sin(time * 0.11) * 0.02 + ambient.x * 0.04) * dist * still;
    pos.y += (Math.cos(time * 0.09) * 0.015 - ambient.y * 0.03) * dist * still;
    camera.position.copy(pos);
    camera.fov = c.f;
    camera.lookAt(target);
    camera.updateProjectionMatrix();

    // particles
    pu.uTime.value = time;
    pu.uGrow.value = win(s, 'grow');
    const trem = win(s, 'tremor');
    pu.uTremor.value = trem * (1 - win(s, 'burst'));
    pu.uBreak.value = win(s, 'burst');
    pu.uRuns.value = win(s, 'runs');
    pu.uLattice.value = win(s, 'lattice');
    pu.uRise.value = smooth(win(s, 'rise'));
    pu.uValueColor.value = win(s, 'valueColor');
    pu.uTrellis.value = win(s, 'fold');
    const sp = win(s, 'spiral');
    pu.uSpiral.value = sp;
    pu.uSpiralRot.value = (s - T.spiral[0]) * 2.2;
    pu.uArms.value = win(s, 'arms') * (1 - win(s, 'logo'));
    pu.uLogo.value = win(s, 'logo');
    pu.uTile.value = smooth(win(s, 'tile'));
    pu.uPartFade.value = win(s, 'partFade');
    pu.uSizeMul.value = lerp(1, 0.82, sp) * lerp(1, 1.9, pu.uBreak.value * (1 - pu.uLattice.value));
    const bg = smooth(win(s, 'bg'));
    pu.uOpaque.value = bg;
    // black → warm umber → cream, like a sunrise rather than a grey fade
    if (bg < 0.4) tmpC.copy(black).lerp(umber, bg / 0.4);
    else tmpC.copy(umber).lerp(cream, (bg - 0.4) / 0.6);
    renderer.setClearColor(tmpC, 1);
    dustMat.opacity = 0.35 * (1 - bg);
    dust.rotation.y = time * 0.01;

    // logo mapping: particle squares land exactly where the SVG sits on screen
    if (logoRect) {
      const kd = new THREE.Vector3(...LOGO_KEY.p).distanceTo(new THREE.Vector3(...LOGO_KEY.t)) * fit;
      const wpp = (2 * kd * Math.tan((LOGO_KEY.f * Math.PI) / 360)) / viewH;
      const svgPx = logoRect.w / LOGO.viewBox[2];
      pu.uLogoScale.value = svgPx * wpp;
      pu.uLogoPx.value = F.logoSpacing * svgPx;
      pu.uLogoOrigin.value.set(
        LOGO_KEY.t[0] + (logoRect.x + logoRect.w / 2 - viewW / 2) * wpp,
        LOGO_KEY.t[1] - (logoRect.y + logoRect.h / 2 - viewH / 2) * wpp,
        LOGO_KEY.t[2],
      );
    }

    // lines and surfaces
    treeLines.material.uniforms.uSnap.value = win(s, 'snap');
    treeLines.visible = s < T.burst[1] + 0.01;
    const meshOut = 1 - win(s, 'meshOut');
    landscape.uMesh.value = win(s, 'mesh') * meshOut;
    landscape.uSurf.value = win(s, 'rise') * meshOut;
    uPath.value = win(s, 'path');
    uPathA.value = (uPath.value > 0 ? 1 : 0) * meshOut;
    RUN_T.forEach((t, i) => {
      const g = uPath.value > 0 ? range(uPath.value, t - 0.06, t + 0.02) : 0;
      const p = pathCurve.getPointAt(Math.min(t, 0.999));
      markers[i].position.set(p.x, p.y + 0.012 + (1 - smooth(g)) * 0.35, p.z);
      markers[i].material.opacity = smooth(g) * meshOut;
      markers[i].visible = g > 0 && meshOut > 0;
      markers[i].scale.setScalar(i === RUN_T.length - 1 ? 1.35 + 0.15 * Math.sin(time * 4) : 1);
    });
    halo.u.uAlpha.value = 1 - win(s, 'halo');
    halo.mesh.visible = halo.u.uAlpha.value > 0;
    halo.mesh.quaternion.copy(camera.quaternion);
    peakRing.u.uAlpha.value = win(s, 'peak') * meshOut;
    peakRing.mesh.visible = peakRing.u.uAlpha.value > 0;

    uSlats.value = win(s, 'slats') * (1 - win(s, 'slatsOut'));
    uVine.value = win(s, 'vine');
    uPlantA.value = 1 - win(s, 'plantOut');
    uPetals.value = win(s, 'petals');
    uPetalA.value = 1 - win(s, 'petalsOut');
    leafMesh.visible = uPlantA.value > 0 && uVine.value > 0.01;

    renderer.render(scene, camera);
  }

  function resize(w, h) {
    viewW = w; viewH = h;
    renderer.setSize(w, h, false);
    camera.aspect = w / h;
    camera.updateProjectionMatrix();
  }

  const v3 = new THREE.Vector3();
  function project(x, y, z) {
    v3.set(x, y, z).project(camera);
    return { x: (v3.x * 0.5 + 0.5) * viewW, y: (-v3.y * 0.5 + 0.5) * viewH, behind: v3.z > 1 };
  }

  return { update, resize, project, renderer, camera, pathCurve };
}
