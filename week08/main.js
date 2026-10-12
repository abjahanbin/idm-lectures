import { initReveal } from '../shared/reveal-init.js';

const deck = initReveal();

// --- Student work clips --------------------------------------------------
// Local .mp4s with audio, looping, shown at their own proportions — same
// full-viewport-layer approach as week07's clip-layer (see #clip-layer in
// theme.css for why). Not muted — these are meant to be heard. Browsers
// only allow unmuted autoplay as part of a user gesture, so the very
// first clip (on page load, before any interaction) may start silent/
// paused until you click or press a key — every clip reached by actually
// navigating (arrow key/click) autoplays with sound fine, since that
// navigation is itself the gesture.

const clipLayer = document.createElement('video');
clipLayer.id = 'clip-layer';
clipLayer.loop = true;
clipLayer.playsInline = true;
document.body.appendChild(clipLayer);

const clipCaption = document.createElement('div');
clipCaption.id = 'clip-caption';
document.body.appendChild(clipCaption);

const clipUrls = new Map();
document.querySelectorAll('section[data-clip-file]').forEach((section) => {
  const file = section.dataset.clipFile;
  const url = new URL(`./assets/Week08_GoodExamples/${file}`, import.meta.url).href;
  clipUrls.set(section, url);
});

const clipNames = new Map();
document.querySelectorAll('section[data-clip-name]').forEach((section) => {
  clipNames.set(section, section.dataset.clipName);
});

function updateClipLayer() {
  const current = deck.getCurrentSlide();

  const url = current && clipUrls.get(current);
  if (url) {
    if (clipLayer.src !== url) clipLayer.src = url;
    clipLayer.currentTime = 0;
    clipLayer.play().catch(() => {}); // ignore — autoplay can still be blocked pre-interaction
    clipLayer.classList.add('is-visible');
  } else {
    clipLayer.pause();
    clipLayer.classList.remove('is-visible');
  }

  const name = current && clipNames.get(current);
  if (name) {
    clipCaption.textContent = name;
    clipCaption.classList.add('is-visible');
  } else {
    clipCaption.classList.remove('is-visible');
  }
}

deck.on('ready', updateClipLayer);
deck.on('slidechanged', updateClipLayer);

// --- Procedural Textures screenshots --------------------------------------
// Same full-viewport #screenshot-layer approach as week06/week07's
// initScreenshots() — a single element appended to <body>, outside
// reveal's scaled canvas, so each image shows at its real proportions
// rather than being bound by the deck's 960x700 shape.

const screenshotLayer = document.createElement('div');
screenshotLayer.id = 'screenshot-layer';
document.body.appendChild(screenshotLayer);

const screenshotUrls = new Map();
document.querySelectorAll('section[data-screenshot-file]').forEach((section) => {
  const file = section.dataset.screenshotFile;
  const url = new URL(`./assets/Week08_ScreenShots/${file}`, import.meta.url).href;
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
