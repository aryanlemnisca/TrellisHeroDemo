import { buildFormations } from './formations.js';
import { createScene } from './scene.js';
import { createOverlay } from './overlay.js';
import { renderFallback } from './fallback.js';
import { LOGO } from './logo.geometry.js';
import { TRACK, CHAPTERS } from './story.config.js';

const params = new URLSearchParams(location.search);
const stage = document.querySelector('.stage');
const track = document.querySelector('#story');
const canvas = document.querySelector('#gl');

const reduced = matchMedia('(prefers-reduced-motion: reduce)').matches && !params.has('motion');
const hasWebGL = (() => {
  try { return !!document.createElement('canvas').getContext('webgl2'); } catch { return false; }
})();

if (reduced || !hasWebGL || params.has('static')) {
  renderFallback();
} else {
  start();
}

function start() {
  const mobile = Math.min(innerWidth, innerHeight) < 600 || innerWidth < 760;
  document.documentElement.style.setProperty('--track', `${mobile ? TRACK.mobile : TRACK.desktop}vh`);

  const F = buildFormations({ count: mobile ? 2304 : 4096, seed: 7, logo: LOGO });
  const scene = createScene(canvas, F, { mobile });
  const overlay = createOverlay({ stage, scene, mobile, count: F.count });

  let W = 0, H = 0, logoRect;
  function resize() {
    W = stage.clientWidth; H = stage.clientHeight;
    scene.resize(W, H);
    logoRect = overlay.layout(W, H);
  }
  resize();
  addEventListener('resize', resize);

  const rawProgress = () => {
    const top = track.getBoundingClientRect().top + scrollY;
    const len = track.offsetHeight - innerHeight;
    return Math.min(1, Math.max(0, (scrollY - top) / len));
  };
  const scrollToProgress = (p) => {
    const top = track.getBoundingClientRect().top + scrollY;
    scrollTo({ top: top + p * (track.offsetHeight - innerHeight), behavior: 'instant' });
  };

  // Skip the story: straight to the docked logo at the top of the site
  document.querySelectorAll('[data-skip]').forEach((a) => a.addEventListener('click', (e) => {
    e.preventDefault();
    scrollToProgress(1);
    s = 1;
    document.querySelector('#site').focus({ preventScroll: true });
  }));

  const pointer = { x: 0, y: 0 };
  addEventListener('pointermove', (e) => { pointer.x = (e.clientX / innerWidth) * 2 - 1; pointer.y = (e.clientY / innerHeight) * 2 - 1; });

  let s = 0;
  if (params.has('p')) { const p = +params.get('p'); scrollToProgress(p); s = p; }
  else s = rawProgress();

  const debug = params.has('debug') ? Object.assign(document.createElement('pre'), { className: 'debug' }) : null;
  if (debug) document.body.appendChild(debug);

  let last = performance.now(), fps = 60, lastRendered = -1;
  function frame(now) {
    const dt = Math.min(0.1, (now - last) / 1000);
    last = now;
    const raw = rawProgress();
    s += (raw - s) * (1 - Math.exp(-dt * 6));
    if (Math.abs(raw - s) < 1e-5) s = raw;

    // stop rendering once the stage has scrolled off and the story is settled
    const offscreen = track.getBoundingClientRect().bottom < 0 && s === raw;
    if (!offscreen || lastRendered !== s) {
      scene.update(s, now / 1000, { pointer, logoRect });
      overlay.update(s);
      lastRendered = s;
    }
    if (debug) {
      fps += (1 / Math.max(dt, 1e-3) - fps) * 0.05;
      const ci = CHAPTERS.findIndex((c) => s >= c.from && s < c.to);
      debug.textContent = `s ${s.toFixed(4)}  raw ${raw.toFixed(4)}\nchapter ${ci + 1} ${CHAPTERS[ci]?.id ?? 'end'}\nfps ${fps.toFixed(0)}`;
    }
    requestAnimationFrame(frame);
  }
  requestAnimationFrame(frame);
  document.documentElement.classList.add('ready');
}
