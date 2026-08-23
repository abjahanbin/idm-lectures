// Shared reveal.js bootstrap used by every week's main.js.
// Keeps the base css imports, theme, and default config in one place.
import Reveal from 'reveal.js';
import 'reveal.js/reveal.css';
import 'reveal.js/theme/black.css';
import './theme.css';

/**
 * @param {import('reveal.js').Options} [config] per-week overrides
 */
export function initReveal(config = {}) {
  const deck = new Reveal({
    hash: true,
    controls: true,
    progress: true,
    center: false,
    ...config,
  });
  deck.initialize();
  return deck;
}
