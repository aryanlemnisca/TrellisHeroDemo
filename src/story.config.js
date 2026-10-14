// Single source of truth for the scroll story: chapter ranges, copy and the
// timing of every transition. Everything on screen is a pure function of the
// smoothed scroll progress s (0 → 1), so retiming only ever touches this file.

export const COLORS = {
  black: '#000000',
  cream: '#F7F3E8',
  white: '#FFFFFF',
  o1: '#FF9933', // strongest signal: true peak, path, large square, CTA
  o2: '#FEA64B',
  o3: '#FCB66C',
  o4: '#FAC485', // lowest predicted value, the i's dot
  grey: '#6B6B6B',
  grey2: '#9A9A9A',
};

// Bottom → top of the vine: wild greens ripen into the four Trellis oranges.
export const LEAF_COLORS = [
  '#1F4D43', '#2D6450', '#3F7A5A', '#5E9663', '#86AC62',
  '#B3B65C', '#D9BC68', '#FAC485', '#FCB66C', '#FEA64B', '#FF9933',
];
export const PETAL_COLORS = ['#FAC485', '#FCB66C', '#FEA64B', '#FF9933', '#F28C28'];

export const TRACK = { desktop: 1750, mobile: 1350 }; // vh

export const CHAPTERS = [
  { id: 'seed',      from: 0.000, to: 0.060, label: 'One experiment',
    lines: ['Every process starts with one experiment.'] },
  { id: 'branch',    from: 0.060, to: 0.160, label: 'Variables',
    lines: ['Each variable you add multiplies what you could test.'] },
  { id: 'break',     from: 0.160, to: 0.270, label: 'Combinatorial explosion',
    lines: ['Real processes have dozens of variables.', 'You can test a few dozen. The rest is hope.'] },
  { id: 'lattice',   from: 0.270, to: 0.350, label: 'Structure',
    lines: ['Trellis gives the chaos a structure.'] },
  { id: 'landscape', from: 0.350, to: 0.450, label: 'Model',
    lines: ['Trellis models your process, biology and math together.'] },
  { id: 'path',      from: 0.450, to: 0.550, label: 'Next experiment',
    lines: ['It tells you if your next experiment is right, before you run it.'] },
  { id: 'grow',      from: 0.550, to: 0.680, label: 'Growth',
    lines: ['Give biology a structure, and it grows the right way.'] },
  { id: 'golden',    from: 0.680, to: 0.790, label: 'Golden angle',
    lines: ['Biology follows rules. Trellis learns them.'] },
  { id: 'logo',      from: 0.790, to: 1.000, label: 'Trellis', lines: [] },
];

export const HEADLINE = '“I hope this works” is the most expensive sentence in your lab.';
export const CTA = { label: 'Book a demo', href: '#demo' };

export const VARIABLES = ['pH', 'temperature', 'dissolved O₂', 'feed rate', 'media', 'induction'];

// Transition windows [from, to] in s. Scene and overlay both read these.
export const T = {
  halo:       [0.040, 0.080],
  grow:       [0.065, 0.150],
  tremor:     [0.158, 0.188],
  snap:       [0.174, 0.204],
  burst:      [0.184, 0.228],
  explode:    [0.190, 0.262], // counter 6 → 20 variables
  runs:       [0.226, 0.244],
  lattice:    [0.272, 0.322],
  mesh:       [0.306, 0.336],
  rise:       [0.352, 0.402],
  valueColor: [0.358, 0.404],
  path:       [0.462, 0.528],
  peak:       [0.522, 0.540],
  meshOut:    [0.550, 0.566],
  fold:       [0.552, 0.594],
  slats:      [0.578, 0.600],
  vine:       [0.594, 0.674],
  spiral:     [0.684, 0.734],
  slatsOut:   [0.688, 0.712],
  plantOut:   [0.716, 0.748],
  petals:     [0.722, 0.762],
  arms:       [0.738, 0.760],
  logo:       [0.796, 0.872],
  petalsOut:  [0.790, 0.816],
  bg:         [0.806, 0.862],
  tile:       [0.852, 0.880],
  wordmark:   [0.882, 0.928],
  svg:        [0.886, 0.910],
  partFade:   [0.898, 0.918],
  headline:   [0.922, 0.944],
  dock:       [0.962, 0.992],
};

export const range = (s, a, b) => Math.min(1, Math.max(0, (s - a) / (b - a)));
export const win = (s, key) => range(s, T[key][0], T[key][1]);
