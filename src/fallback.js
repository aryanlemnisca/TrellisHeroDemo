// Reduced motion or no WebGL: no pinning, the story as stacked panels that end on the logo.
import { CHAPTERS, HEADLINE, CTA } from './story.config.js';
import { logoSVG } from './overlay.js';

export function renderFallback() {
  document.documentElement.classList.add('static');
  const story = document.querySelector('#story');
  const panels = CHAPTERS.filter((c) => c.lines.length).map((c, i) => `
    <section class="panel-static">
      <div class="tag"><span class="idx">${String(i + 1).padStart(2, '0')}</span><span class="lab">${c.label}</span></div>
      ${c.lines.map((l) => `<p>${l}</p>`).join('')}
    </section>`).join('');
  story.innerHTML = `${panels}
    <section class="panel-static panel-logo">
      <div class="logo-static">${logoSVG()}</div>
      <h1>${HEADLINE}</h1>
      <a class="btn cta" href="${CTA.href}">${CTA.label}</a>
    </section>`;
  // the static logo shows fully written
  story.querySelector('#wmGrad')?.setAttribute('x1', '2000');
  story.querySelector('#wmGrad')?.setAttribute('x2', '2100');
}
