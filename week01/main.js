import { initReveal } from '../shared/reveal-init.js';

initReveal();

// --- Slide 3: rotating bio GIF grid -------------------------------------
// 3x2 grid, each cell on its own timer, swapping to a random not-currently-
// shown gif from week01/assets/bio/. Browsers don't expose any event for
// "this GIF just finished a loop" (that only exists for <video>), so there's
// no way to swap on an exact cycle count — SWAP_INTERVAL_MS is a fixed-time
// stand-in for "after a few cycles". Tune it to match your gifs' actual
// loop lengths if a few seconds off feels wrong once you see it running.

// new URL(..., import.meta.url) — not plain relative-path strings — is
// required here so Vite's production build actually detects, copies, and
// hashes these files. Plain strings built at runtime only happen to work
// in `npm run dev` (which just serves the project directory as-is) and
// would silently 404 once built/deployed.
const BIO_GIF_NAMES = [
  'Egg.gif',
  'Hugs.gif',
  'IRLFriends.gif',
  'LastChill.gif',
  'MindGarden.gif',
  'Nature.gif',
  'Oranges.gif',
  'WalkCycle.gif',
  'bestill.gif',
  'blobrunner.gif',
  'cuppasmall.gif',
  'daydreaming.gif',
  'exportgif.gif',
  'fuzzyppl.gif',
  'fuzzysquig.gif',
  'giraf.gif',
  'horse.gif',
  'hueman.gif',
  'importantdecision.gif',
  'jumptestdummy.gif',
  'longlegs.gif',
  'meh.gif',
  'mobile.gif',
  'newfriends.gif',
  'stayconnected.gif',
];

const BIO_GIFS = BIO_GIF_NAMES.map(
  (name) => new URL(`./assets/bio/${name}`, import.meta.url).href
);

const GRID_SIZE = 6;
const SWAP_INTERVAL_MS = 6000;

function shuffle(list) {
  const result = list.slice();
  for (let i = result.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [result[i], result[j]] = [result[j], result[i]];
  }
  return result;
}

function initBioGifGrid() {
  const grid = document.getElementById('bio-gif-grid');
  if (!grid) return;

  // Cells are plain divs with a background-image (not <img>) — see the
  // .gif-cell comment in theme.css for why.
  const current = shuffle(BIO_GIFS).slice(0, GRID_SIZE);
  const cells = current.map((src) => {
    const cell = document.createElement('div');
    cell.className = 'gif-cell';
    cell.style.backgroundImage = `url("${src}")`; // lazy — only the 6 shown ever fetch
    grid.appendChild(cell);
    return cell;
  });

  function swapCell(i) {
    const showing = new Set(current);
    const pool = BIO_GIFS.filter((g) => !showing.has(g));
    const choices = pool.length ? pool : BIO_GIFS;
    const next = choices[Math.floor(Math.random() * choices.length)];
    current[i] = next;
    cells[i].style.backgroundImage = `url("${next}")`;
  }

  cells.forEach((_, i) => {
    // Stagger each cell's own interval so all 6 don't swap in unison.
    const period = SWAP_INTERVAL_MS + Math.random() * 3000;
    setInterval(() => swapCell(i), period);
  });
}

initBioGifGrid();

// --- Slide 6: gif + image side by side ----------------------------------

function initReframeMediaPair() {
  const gifEl = document.getElementById('reframe-gif');
  const imageEl = document.getElementById('reframe-image');
  if (!gifEl || !imageEl) return;

  const gifUrl = new URL('./assets/giphy/GIPHY_SquareTimes01_abj.gif', import.meta.url).href;
  const imageUrl = new URL('./assets/giphy/GIPHY_SquareTimes03_abj.jpg', import.meta.url).href;

  gifEl.style.backgroundImage = `url("${gifUrl}")`;
  imageEl.style.backgroundImage = `url("${imageUrl}")`;
}

initReframeMediaPair();
