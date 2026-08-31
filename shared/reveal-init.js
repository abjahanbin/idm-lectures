// Shared reveal.js bootstrap used by every week's main.js.
// Keeps the base css imports, theme, and default config in one place.
import Reveal from 'reveal.js';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import './theme.css';
import { createVoronoiBackground } from './voronoi-bg.js';
import { createPerlinNoiseBackground } from './perlin-noise-bg.js';
import { createTruchetBackground } from './truchet-bg.js';
import { createRule30Background } from './rule30-bg.js';

// Bottom bar's progress-fill color, cycled by movement number (1-indexed).
// Deliberately just the 4 accent colors — grey would read as "no
// progress" if it ever landed on the fill.
const MOVEMENT_COLORS = ['#fff269', '#57c4fa', '#00e58e', '#56b5d3'];

// Divider-background palette — yellow/blue/green/teal/pink (see
// shared/theme.css --accent-*), independent of the bar's cycle above.
// No grey here — it read as a dead/washed-out cell against the others.
const BG_COLORS = ['#fff269', '#57c4fa', '#00e58e', '#56b5d3', '#f6b5d3'];

function colorForMovement(n) {
  return MOVEMENT_COLORS[(n - 1) % MOVEMENT_COLORS.length];
}

// Rotates the palette array by n positions — used so a group of related
// divider slides (e.g. the "what is a computer" breakout responses) can
// share the same background shader but each read as visually distinct,
// via data-bg-rotate="n" on the slide.
function rotatePalette(colors, n) {
  const shift = ((n % colors.length) + colors.length) % colors.length;
  return colors.slice(shift).concat(colors.slice(0, shift));
}

/**
 * @param {import('reveal.js').Options} [config] per-week overrides
 */
export function initReveal(config = {}) {
  // Persistent status bar at the bottom of every slide (see .bottom-bar
  // in theme.css). Injected here so each week's index.html stays plain
  // markup — no repeated boilerplate per week.
  const bar = document.createElement('div');
  bar.className = 'bottom-bar';
  bar.innerHTML = `
    <div class="bottom-bar__fill"></div>
    <div class="bottom-bar__label">
      <span class="bottom-bar__movement"></span>
      <span class="bottom-bar__count"></span>
    </div>
  `;
  document.body.appendChild(bar);
  const fillEl = bar.querySelector('.bottom-bar__fill');
  const movementEl = bar.querySelector('.bottom-bar__movement');
  const countEl = bar.querySelector('.bottom-bar__count');

  // Divider-slide backgrounds. Voronoi is the default for every divider;
  // a slide can opt into a different one via data-bg="name" (see slide
  // 11 in week01/index.html for perlin-noise). Registry keyed by that
  // same string so adding another background later is just one more
  // entry here, no changes to the slide-switching logic below.
  //
  // reaction-diffusion-bg.js (a real Gray-Scott simulation, not a
  // formula) was tried here first and worked, but reads as visually
  // "frozen" once its pattern fills the available space and settles —
  // not obvious from a single test screenshot, only from actually
  // watching it for a while. Left the file in place in case it's worth
  // revisiting with different parameters, just not registered here.
  const backgrounds = {
    voronoi: createVoronoiBackground(BG_COLORS),
    'perlin-noise': createPerlinNoiseBackground(BG_COLORS),
    truchet: createTruchetBackground(BG_COLORS),
    rule30: createRule30Background(BG_COLORS),
  };
  Object.values(backgrounds).forEach((bg) => document.body.appendChild(bg.canvas));

  const deck = new Reveal({
    hash: true,
    controls: true,
    progress: false,
    center: false,
    ...config,
  });

  function updateStatus() {
    const current = deck.getCurrentSlide();
    if (!current) return;

    // Progress fill (0..1 across the whole deck, reveal's own weighting).
    fillEl.style.width = `${Math.round(deck.getProgress() * 100)}%`;

    // Movement number/name live on the top-level <section> — for nested
    // (vertical) slides that's an ancestor, not the current slide itself.
    const movementSection = current.closest('[data-movement]') || current;
    const movementNum = Number(movementSection.dataset.movement) || 1;
    const movementName = movementSection.dataset.movementName || '';
    const color = colorForMovement(movementNum);

    fillEl.style.background = color;
    movementEl.textContent = movementName;

    const past = deck.getSlidePastCount();
    const total = deck.getTotalSlides();
    countEl.textContent = `${String(past + 1).padStart(2, '0')} / ${String(total).padStart(2, '0')}`;

    // Background only behind divider slides — which one depends on that
    // slide's own data-bg attribute (falls back to voronoi if unset),
    // and its palette order on data-bg-rotate (falls back to 0/unrotated).
    const dividerEl = current.closest('.divider');
    const activeName = dividerEl ? dividerEl.dataset.bg || 'voronoi' : null;
    const rotate = dividerEl ? Number(dividerEl.dataset.bgRotate) || 0 : 0;
    Object.entries(backgrounds).forEach(([name, bg]) => {
      const isActive = name === activeName;
      bg.setVisible(isActive);
      if (isActive) bg.setColors(rotatePalette(BG_COLORS, rotate));
    });
  }

  deck.on('slidechanged', updateStatus);
  deck.initialize().then(updateStatus);

  return deck;
}
