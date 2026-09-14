import { initReveal } from '../shared/reveal-init.js';

const deck = initReveal();

// --- Good-examples clips ---------------------------------------------------
// Local .mp4s, silent and looping, shown at their own ~16:9 proportions —
// same full-viewport-layer approach as week02's initScreenshots() (see
// #clip-layer in theme.css for why), adapted for <video>: one shared
// element whose src is swapped and played/paused based on the current
// slide, rather than 7 simultaneously-decoding <video> elements.

const clipLayer = document.createElement('video');
clipLayer.id = 'clip-layer';
clipLayer.muted = true; // required for autoplay to actually work, and "no audio" was the ask anyway
clipLayer.loop = true;
clipLayer.playsInline = true;
document.body.appendChild(clipLayer);

// Top-left student-name tag, shown/updated alongside the clip itself.
const clipCaption = document.createElement('div');
clipCaption.id = 'clip-caption';
document.body.appendChild(clipCaption);

// Template literal inside new URL(..., import.meta.url) — same dynamic-
// path pattern used for the week02 screenshots — is what lets Vite
// statically detect and bundle every matching file.
const clipUrls = new Map();
const clipNames = new Map();
document.querySelectorAll('section[data-clip-file]').forEach((section) => {
  const file = section.dataset.clipFile;
  const url = new URL(`./assets/02_GoodExamples/${file}`, import.meta.url).href;
  clipUrls.set(section, url);
  clipNames.set(section, section.dataset.clipName || '');
});

function updateClipLayer() {
  const current = deck.getCurrentSlide();
  const url = current && clipUrls.get(current);
  if (url) {
    if (clipLayer.src !== url) {
      clipLayer.src = url;
    }
    clipLayer.currentTime = 0;
    clipLayer.play().catch(() => {}); // ignore — autoplay can still be blocked pre-interaction
    clipLayer.classList.add('is-visible');
    clipCaption.textContent = clipNames.get(current);
    clipCaption.classList.add('is-visible');
  } else {
    clipLayer.pause();
    clipLayer.classList.remove('is-visible');
    clipCaption.classList.remove('is-visible');
  }
}

deck.on('ready', updateClipLayer);
deck.on('slidechanged', updateClipLayer);

// --- Tutorial Part 1 screenshots ---------------------------------------
// Same full-viewport #screenshot-layer approach as week02's
// initScreenshots() — a single element appended to <body>, outside
// reveal's scaled canvas, so each 1920x1080 image shows at its real
// proportions rather than being bound by the deck's 960x700 shape.

const screenshotLayer = document.createElement('div');
screenshotLayer.id = 'screenshot-layer';
document.body.appendChild(screenshotLayer);

// Two source folders (Tutorial Part 1 and Part 2) — data-screenshot-dir
// picks which one per section (defaults to Part 1, the original set).
// Each new URL() call keeps its directory a static string literal (only
// the filename varies) since that's the dynamic-path shape Vite reliably
// detects and bundles; a fully-dynamic directory segment isn't the same
// well-supported pattern.
const screenshotUrls = new Map();
document.querySelectorAll('section[data-screenshot-file]').forEach((section) => {
  const file = section.dataset.screenshotFile;
  const dir = section.dataset.screenshotDir || '03_TutorialPart1';
  const url = dir === '04_TutorialPart2'
    ? new URL(`./assets/04_TutorialPart2/${file}`, import.meta.url).href
    : new URL(`./assets/03_TutorialPart1/${file}`, import.meta.url).href;
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
