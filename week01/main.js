import { initReveal } from '../shared/reveal-init.js';

initReveal();

// --- Slide 2: self-portrait gif ------------------------------------------
// Sized in JS to exactly match .bio-roles's rendered height (ANIMATOR's
// top to EDUCATOR's bottom) — a CSS-only version of this (aspect-ratio +
// align-items:stretch) couldn't correctly contribute its width back into
// the ancestor's shrink-to-fit centering calculation, which overflowed
// the portrait off the right edge of the slide. offsetHeight, not
// getBoundingClientRect(), because it's the element's own logical CSS
// pixel size — unaffected by reveal.js's CSS transform:scale() on the
// whole deck, which getBoundingClientRect() would report *after*.

function initBioPortrait() {
  const portraitEl = document.getElementById('bio-portrait');
  const rolesEl = document.querySelector('.bio-roles');
  if (!portraitEl || !rolesEl) return;

  const portraitUrl = new URL('./assets/intro/SelfPortrait_abj.gif', import.meta.url).href;
  portraitEl.style.backgroundImage = `url("${portraitUrl}")`;

  function sizeToMatchRoles() {
    const size = rolesEl.offsetHeight;
    if (size > 0) {
      portraitEl.style.width = `${size}px`;
      portraitEl.style.height = `${size}px`;
    }
  }

  // Wait for the real webfont (not a fallback's metrics) before measuring.
  if (document.fonts && document.fonts.ready) {
    document.fonts.ready.then(sizeToMatchRoles);
  } else {
    sizeToMatchRoles();
  }
  window.addEventListener('resize', sizeToMatchRoles);
}

initBioPortrait();

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

// --- Slide 8: DJ Boring pair, side by side --------------------------------

function initDjBoringPair() {
  const frontEl = document.getElementById('djboring-front');
  const backEl = document.getElementById('djboring-back');
  if (!frontEl || !backEl) return;

  const frontUrl = new URL('./assets/djboring/DJBoring_LikeWaterFront_abj.jpg', import.meta.url).href;
  const backUrl = new URL('./assets/djboring/DJBoring_LikeWaterBack_abj.jpg', import.meta.url).href;

  frontEl.style.backgroundImage = `url("${frontUrl}")`;
  backEl.style.backgroundImage = `url("${backUrl}")`;
}

initDjBoringPair();

// --- Slide 9: riso assets, 2x2 grid ---------------------------------------

const RISO_NAMES = [
  'RENDERWIGGLE-Converted2.gif',
  'Riso_Full01.jpg',
  'coinspinriso.gif',
  'fullsheetTall.jpg',
];

function initRisoGrid() {
  const grid = document.getElementById('riso-grid');
  if (!grid) return;

  const rows = [
    document.createElement('div'),
    document.createElement('div'),
  ];
  rows.forEach((row) => {
    row.className = 'riso-row';
    grid.appendChild(row);
  });

  // 2 per row, in RISO_NAMES order.
  RISO_NAMES.forEach((name, i) => {
    const img = document.createElement('img');
    img.alt = '';
    img.src = new URL(`./assets/riso/${name}`, import.meta.url).href;
    rows[Math.floor(i / 2)].appendChild(img);
  });
}

initRisoGrid();

// --- Slide 10: drawing machine trio, side by side, all square crop -------

const DRAWINGMACHINE_NAMES = [
  'DrawingMachine_Bottle_abj.gif',
  'DrawingMachine_FlowerTriptych_abj.jpeg',
  'DrawingMachine_MakingOf_abj.gif',
];

function initDrawingMachineTrio() {
  const trio = document.getElementById('drawingmachine-trio');
  if (!trio) return;

  DRAWINGMACHINE_NAMES.forEach((name) => {
    const cell = document.createElement('div');
    cell.className = 'media-trio-item';
    cell.style.backgroundImage = `url("${new URL(`./assets/drawingmachine/${name}`, import.meta.url).href}")`;
    trio.appendChild(cell);
  });
}

initDrawingMachineTrio();
