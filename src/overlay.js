// DOM layer over the canvas: story lines, HUD (counter, equations), projected
// labels, the golden-angle diagram, and the logo that writes in and docks.
// Every value is a pure function of s.
import { CHAPTERS, HEADLINE, CTA, VARIABLES, T, win, range } from './story.config.js';
import { LOGO, WORDMARK_PATH } from './logo.geometry.js';
import { surfacePoint, PEAK_UV, DECOY_UV, LATTICE_HALF, SURFACE, TREE_LEVELS, HEAD } from './formations.js';

const $ = (sel, root = document) => root.querySelector(sel);
const h = (tag, attrs = {}, html = '') => {
  const el = document.createElement(tag);
  for (const [k, v] of Object.entries(attrs)) el.setAttribute(k, v);
  el.innerHTML = html;
  return el;
};
const smooth = (t) => t * t * (3 - 2 * t);
const fmt = (n) => Math.round(n).toLocaleString('en-US');
const SUP = '⁰¹²³⁴⁵⁶⁷⁸⁹';
const sup = (n) => String(n).split('').map((d) => SUP[+d]).join('');

// window [a, b] → opacity with 15% fades at each end
function windowOpacity(s, a, b, { first = false, last = false } = {}) {
  const f = (b - a) * 0.15;
  const i = first ? 1 : range(s, a, a + f);
  const o = last ? 1 : 1 - range(s, b - f, b);
  return Math.min(i, o);
}

export function logoSVG() {
  const [, , W, H] = LOGO.viewBox, wm = LOGO.wordmark;
  const rects = LOGO.squares.map((q, i) => {
    const s = q.size / 2;
    return `<rect class="sq sq${i}" x="${q.cx - s}" y="${q.cy - s}" width="${q.size}" height="${q.size}" rx="${q.rx}"
      fill="${q.color}" transform="rotate(${q.angleDeg} ${q.cx} ${q.cy})"/>`;
  }).join('');
  return `<svg viewBox="0 0 ${W} ${H}" xmlns="http://www.w3.org/2000/svg" role="img" aria-label="Trellis">
    <defs>
      <linearGradient id="wmGrad" gradientUnits="userSpaceOnUse" x1="${wm.x - 120}" x2="${wm.x}" y1="0" y2="0">
        <stop offset="0" stop-color="#fff"/><stop offset="1" stop-color="#000"/>
      </linearGradient>
      <mask id="wmMask" maskUnits="userSpaceOnUse" x="0" y="0" width="${W}" height="${H}">
        <rect width="${W}" height="${H}" fill="url(#wmGrad)"/>
      </mask>
    </defs>
    <path class="wordmark" mask="url(#wmMask)" fill="currentColor" fill-rule="evenodd" d="${WORDMARK_PATH}"/>
    <g class="squares">${rects}</g>
  </svg>`;
}

export function createOverlay({ stage, scene, mobile, count }) {
  // ── copy
  const copy = $('.copy', stage);
  const lineEls = [];
  CHAPTERS.forEach((c, ci) => {
    c.lines.forEach((text, li) => {
      const span = (c.to - c.from) / c.lines.length;
      const a = c.from + li * span, b = a + span;
      const el = h('div', { class: 'line' },
        `<div class="tag"><span class="idx">${String(ci + 1).padStart(2, '0')}</span><span class="lab">${c.label}</span></div>
         <p>${text}</p>`);
      copy.appendChild(el);
      lineEls.push({ el, a, b, first: ci === 0 && li === 0 });
    });
  });

  // ── chapter rail
  const rail = $('.rail', stage);
  const railItems = CHAPTERS.map((c, i) => {
    const li = h('li', {}, `<span class="n">${String(i + 1).padStart(2, '0')}</span><span class="t">${c.label}</span>`);
    rail.appendChild(li);
    return li;
  });
  const bar = $('.progress i', stage);

  // ── HUD panels
  const hud = $('.hud', stage);
  const panel = (cls, html, a, b) => {
    const el = h('div', { class: `panel ${cls}` }, html);
    hud.appendChild(el);
    return { el, a, b };
  };
  const counter = panel('counter',
    `<div class="formula"><span class="f">3¹</span><span class="eq">=</span></div>
     <div class="num">3</div><div class="cap">possible experiments</div>
     <div class="sub">At one run a second, that’s <b class="yrs">110 years</b>.</div>
     <div class="sub2"><b>24</b> tested &middot; <span class="unk">3,486,784,377</span> unknown</div>`,
    T.grow[0] - 0.004, 0.268);
  const monod = panel('eq monod',
    `<div class="cap">Monod kinetics, inside the model</div>
     <div class="math">μ = μ<sub>max</sub> &middot; <span class="frac"><span>S</span><span>K<sub>s</sub> + S</span></span></div>
     <div class="cap dim">${fmt(count)} conditions predicted &middot; 0 run</div>`, 0.372, 0.452);
  const runs = panel('counter runs',
    `<div class="num">6</div><div class="cap">runs to the true optimum</div>
     <div class="sub">Not 3,486,784,401.</div>`, 0.488, 0.552);
  const logistic = panel('eq logistic',
    `<div class="cap">Logistic growth</div>
     <div class="math">dX/dt = μX (1 − X/K)</div>
     <svg viewBox="0 0 220 90" class="curve"><path class="axis" d="M6 84 H214 M6 84 V6"/>
       <path class="k" d="M6 14 H214"/><text x="200" y="11">K</text>
       <path class="lc" d="M6 82 C 70 82, 90 16, 214 14"/><circle class="dot" r="3.2" cx="6" cy="82"/></svg>`, 0.598, 0.682);
  const golden = panel('eq golden',
    `<div class="math">137.5° = 360° / φ²</div>
     <div class="cap">φ = 1.6180339…</div>
     <div class="fib">1 &nbsp;1 &nbsp;2 &nbsp;3 &nbsp;5 &nbsp;8 &nbsp;13 &nbsp;<b>21</b> &nbsp;<b>34</b></div>`, 0.71, 0.792);
  const panels = [counter, monod, runs, logistic, golden];
  const lcPath = $('.lc', logistic.el), lcDot = $('.dot', logistic.el);
  const lcLen = lcPath.getTotalLength();
  lcPath.style.strokeDasharray = `${lcLen}`;

  // ── projected labels
  const labelsRoot = $('.labels', stage);
  const label = (text, cls = '') => {
    const el = h('div', { class: `label ${cls}` }, `<i></i><span>${text}</span>`);
    labelsRoot.appendChild(el);
    return el;
  };
  const ringLabels = VARIABLES.map((v, k) => {
    const r = Math.pow((k + 1) / TREE_LEVELS, 0.8);
    const a = (152 - k * 6) * (Math.PI / 180);
    return { el: label(`${v} <em>× 3</em>`), pos: [r * Math.cos(a), r * Math.sin(a), 0], k };
  });
  const peakP = surfacePoint(PEAK_UV[0], PEAK_UV[1], 0.06);
  const decoyP = surfacePoint(DECOY_UV[0], DECOY_UV[1], 0.06);
  const landLabels = [
    { el: label('true optimum', 'hot'), pos: peakP, a: 0.505, b: 0.552 },
    { el: label('local optimum'), pos: decoyP, a: 0.49, b: 0.552 },
    { el: label('pH'), pos: [0, SURFACE.base, LATTICE_HALF + 0.12], a: 0.33, b: 0.455 },
    { el: label('feed rate'), pos: [LATTICE_HALF + 0.12, SURFACE.base, 0], a: 0.33, b: 0.455 },
    { el: label('predicted titre'), pos: [-LATTICE_HALF, 0.62, -LATTICE_HALF], a: 0.385, b: 0.455 },
    { el: label('today'), pos: surfacePoint(-0.86, 0.86, 0.05), a: 0.468, b: 0.552 },
  ];
  const phyllo = { el: label('each leaf 137.5° from the last'), pos: [0.34, -0.12, 0.05], a: 0.632, b: 0.69 };

  // ── golden-angle diagram, centred on the seed head
  const gsvg = $('.golden-diagram', stage);
  const arc = $('.arc', gsvg);

  // ── logo + headline
  const fly = $('#logo-fly');
  fly.innerHTML = logoSVG();
  const wordmark = $('.wordmark', fly), squares = $('.squares', fly), grad = $('#wmGrad', fly);
  const end = $('.hero-end', stage);
  $('h1', end).textContent = HEADLINE;
  const cta = $('.cta', end);
  cta.textContent = CTA.label; cta.href = CTA.href;
  const navSlot = $('.nav-logo');
  const nav = $('.nav');
  const cue = $('.cue', stage);
  const vignette = $('.vignette', stage);
  let logoRect = { x: 0, y: 0, w: 1, h: 1 }, navRect = logoRect;

  function layout(W, H) {
    const w = mobile || W < 760 ? W * 0.86 : Math.min(W * 0.6, 880);
    const hh = (w * LOGO.viewBox[3]) / LOGO.viewBox[2];
    logoRect = { x: (W - w) / 2, y: H * 0.42 - hh / 2, w, h: hh };
    fly.style.width = `${w}px`;
    end.style.top = `${logoRect.y + hh + Math.max(18, H * 0.035)}px`;
    const r = navSlot.getBoundingClientRect();
    navRect = { x: r.left, y: r.top, w: r.width, h: r.height };
    // diagram size tracks the projected seed head
    return logoRect;
  }

  const setO = (el, o, y = 0) => {
    el.style.opacity = o.toFixed(3);
    el.style.visibility = o > 0.001 ? 'visible' : 'hidden';
    if (y) el.style.transform = `translate3d(0, ${y.toFixed(1)}px, 0)`;
  };
  const place = (el, x, y) => {
    x = Math.min(x, stage.clientWidth - el.offsetWidth - 8);
    el.style.transform = `translate3d(${x.toFixed(1)}px, ${y.toFixed(1)}px, 0)`;
  };

  function update(s) {
    // story lines
    for (const L of lineEls) {
      const o = windowOpacity(s, L.a, L.b, { first: L.first });
      const y = (1 - smooth(Math.min(1, range(s, L.a, L.a + (L.b - L.a) * 0.15) + (L.first ? 1 : 0)))) * 14
        - smooth(range(s, L.b - (L.b - L.a) * 0.15, L.b)) * 10;
      setO(L.el, o, y || 0.01);
    }
    // rail
    const ci = CHAPTERS.findIndex((c) => s >= c.from && s < c.to);
    railItems.forEach((li, i) => li.classList.toggle('on', i === (ci < 0 ? CHAPTERS.length - 1 : ci)));
    bar.style.transform = `scaleX(${s.toFixed(4)})`;
    rail.style.opacity = (1 - range(s, 0.79, 0.82)).toFixed(3);

    // HUD
    for (const p of panels) setO(p.el, windowOpacity(s, p.a, p.b), 0.01);
    const grow = win(s, 'grow'), ex = smooth(win(s, 'explode'));
    let n = Math.max(1, Math.min(6, Math.floor(grow * 6 + 0.35)));
    if (ex > 0) n = Math.round(6 + ex * 14);
    $('.f', counter.el).textContent = `3${sup(n)}`;
    $('.num', counter.el).textContent = fmt(3 ** n);
    $('.sub', counter.el).style.opacity = range(s, 0.24, 0.25);
    $('.sub2', counter.el).style.opacity = range(s, 0.228, 0.24);
    counter.el.classList.toggle('big', n >= 12);
    const lg = win(s, 'vine');
    lcPath.style.strokeDashoffset = `${lcLen * (1 - lg)}`;
    const pt = lcPath.getPointAtLength(lcLen * lg);
    lcDot.setAttribute('cx', pt.x); lcDot.setAttribute('cy', pt.y);

    // labels
    const g = win(s, 'grow');
    for (const R of ringLabels) {
      const appear = range(g * 6, R.k + 0.4, R.k + 1);
      const o = appear * (1 - win(s, 'tremor'));
      setO(R.el, o);
      if (o > 0) { const p = scene.project(...R.pos); place(R.el, p.x, p.y); }
    }
    for (const L of [...landLabels, phyllo]) {
      const o = windowOpacity(s, L.a, L.b);
      setO(L.el, o);
      if (o > 0) { const p = scene.project(...L.pos); place(L.el, p.x, p.y); }
    }

    // golden-angle diagram
    const go = windowOpacity(s, 0.722, 0.792);
    setO(gsvg, go * 0.9);
    if (go > 0) {
      const c = scene.project(HEAD.x, HEAD.y, HEAD.z), e = scene.project(HEAD.x + HEAD.r * 1.55, HEAD.y, HEAD.z);
      const r = Math.hypot(e.x - c.x, e.y - c.y);
      gsvg.style.transform = `translate3d(${c.x - r}px, ${c.y - r}px, 0)`;
      gsvg.style.width = gsvg.style.height = `${2 * r}px`;
      arc.style.strokeDashoffset = `${100 * (1 - smooth(range(s, 0.73, 0.756)))}`;
    }

    // background-dependent chrome
    const bg = smooth(win(s, 'bg'));
    document.documentElement.style.setProperty('--bgmix', bg.toFixed(3));
    nav.classList.toggle('light', bg > 0.5);
    setO(vignette, Math.max(0, 1 - bg * 2.2));
    setO(cue, 1 - range(s, 0.004, 0.02));

    // logo: squares crossfade from particles, the wordmark writes in, then docks
    const svgO = win(s, 'svg'), wmP = smooth(win(s, 'wordmark'));
    squares.style.opacity = svgO;
    const wm = LOGO.wordmark, F = 120;
    const x1 = wm.x - F + wmP * (wm.width + F + 10);
    grad.setAttribute('x1', x1); grad.setAttribute('x2', x1 + F);
    wordmark.style.opacity = wmP > 0 ? 1 : 0;
    const visible = s >= T.wordmark[0] - 0.002 || s >= T.svg[0];
    fly.style.visibility = visible ? 'visible' : 'hidden';
    const d = smooth(win(s, 'dock'));
    const tw = logoRect.w + (navRect.w - logoRect.w) * d;
    const tx = logoRect.x + (navRect.x - logoRect.x) * d;
    const ty = logoRect.y + (navRect.y - logoRect.y) * d;
    fly.style.transform = `translate3d(${tx.toFixed(2)}px, ${ty.toFixed(2)}px, 0) scale(${(tw / logoRect.w).toFixed(5)})`;
    document.documentElement.classList.toggle('docked', d >= 1);
    nav.style.setProperty('--dock', d.toFixed(3));

    const eo = win(s, 'headline');
    setO(end, eo, (1 - smooth(eo)) * 12);
    end.style.pointerEvents = eo > 0.5 ? 'auto' : 'none';
  }

  return { update, layout, getLogoRect: () => logoRect };
}
