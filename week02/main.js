import { initReveal } from '../shared/reveal-init.js';

const deck = initReveal();

// --- Boids algorithm diagram ---------------------------------------------

function initBoidsPhoto() {
  const imageEl = document.getElementById('boids-image');
  if (!imageEl) return;

  // Source file is 651x180 — matches its real ratio exactly, same reason
  // as week01's initOramPhoto/initDawPhoto (background-size:cover never
  // needs to crop).
  imageEl.style.aspectRatio = '651 / 180';
  imageEl.style.backgroundImage = `url("${new URL('./assets/boids/0_GeU10W646CDVrNFv.jpg', import.meta.url).href}")`;
}

initBoidsPhoto();

// --- Content screenshots ---------------------------------------------------
// These are 1920x1080 (16:9) — wider than the deck's own 960x700 slide
// canvas, so showing them at their real proportions with no cropping and
// no stretching isn't possible *inside* that canvas (see the
// #screenshot-layer comment in theme.css). Instead: one layer appended to
// <body>, outside reveal's transformed .reveal container, sized to the
// real browser viewport via position:fixed — swapped and shown only while
// the current slide is a screenshot slide, via reveal's own 'ready' and
// 'slidechanged' events. Each bare <section data-screenshot-file="..."> is
// just a marker (same convention as the video-embed sections), not a
// container reveal actually renders content into.

const screenshotLayer = document.createElement('div');
screenshotLayer.id = 'screenshot-layer';
document.body.appendChild(screenshotLayer);

// Template literal inside new URL(..., import.meta.url) — same dynamic-
// path pattern week01/main.js uses in initRisoGrid/initDrawingMachineTrio
// — is what lets Vite statically detect and bundle every matching file.
const screenshotUrls = new Map();
document.querySelectorAll('section[data-screenshot-file]').forEach((section) => {
  const file = section.dataset.screenshotFile;
  const url = new URL(`./assets/Week02_Screenshots/${file}`, import.meta.url).href;
  screenshotUrls.set(section, url);
});

function updateScreenshotLayer() {
  const current = deck.getCurrentSlide();
  const url = current && screenshotUrls.get(current);
  if (url) {
    screenshotLayer.style.backgroundImage = `url("${url}")`;
    screenshotLayer.classList.add('is-visible');
  } else {
    screenshotLayer.classList.remove('is-visible');
  }
}

deck.on('ready', updateScreenshotLayer);
deck.on('slidechanged', updateScreenshotLayer);
