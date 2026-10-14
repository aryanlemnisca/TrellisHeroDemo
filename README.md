# Trellis — scroll story hero

A full-screen Three.js scroll story: one experiment → combinatorial explosion →
Trellis structure → predicted landscape → the next experiment → a vine grows up
a trellis → golden-angle seed head → the Trellis logo → the site.

## Run

ES modules need a local server (double-clicking index.html won't work):

    python3 -m http.server 8765
    open http://localhost:8765

Handy URL flags: `?debug=1` (progress, chapter, fps) · `?p=0.42` (jump to a
moment) · `?static` (reduced-motion / no-WebGL fallback).

## Where things live

| File | What |
| --- | --- |
| `src/story.config.js` | All copy, chapter ranges, transition timing, colours. Retime here only. |
| `src/formations.js` | The math: tree, cloud, lattice, response landscape, trellis, phyllotaxis spiral, logo fill, path. |
| `src/scene.js` | Three.js: particle shader, branches, landscape + contours, path, trellis, vine/tendrils/leaves/petals, camera rig. |
| `src/overlay.js` | DOM: story lines, counter, equations, projected labels, golden-angle diagram, logo write-in + nav dock. |
| `src/logo.geometry.js`, `assets/trellis-logo.svg` | Logo measured and traced from the reference screenshot. Swap in the designer's SVG when available. |
| `src/fallback.js` | Reduced motion / no WebGL: stacked panels ending on the logo. |
