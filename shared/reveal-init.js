// Shared reveal.js bootstrap used by every week's main.js.
// Keeps the base css imports, theme, and default config in one place.
import Reveal from 'reveal.js';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import './theme.css';
import { createVoronoiBackground } from './voronoi-bg.js';

// Bottom bar's progress-fill color, cycled by movement number (1-indexed).
// Deliberately just the 4 accent colors — grey would read as "no
// progress" if it ever landed on the fill.
const MOVEMENT_COLORS = ['#fff269', '#57c4fa', '#00e58e', '#56b5d3'];

// Voronoi background palette — yellow/blue/green/teal/pink (see
// shared/theme.css --accent-*), independent of the bar's cycle above.
// No grey here — it read as a dead/washed-out cell against the others.
const VORONOI_COLORS = ['#fff269', '#57c4fa', '#00e58e', '#56b5d3', '#f6b5d3'];

function colorForMovement(n) {
  return MOVEMENT_COLORS[(n - 1) % MOVEMENT_COLORS.length];
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

  // Animated Voronoi background, shown only behind divider slides.
  const bg = createVoronoiBackground(VORONOI_COLORS);
  document.body.appendChild(bg.canvas);

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

    // Voronoi background only behind the title slide + movement dividers.
    bg.setVisible(current.closest('.divider') !== null);
  }

  deck.on('slidechanged', updateStatus);
  deck.initialize().then(updateStatus);

  return deck;
}
