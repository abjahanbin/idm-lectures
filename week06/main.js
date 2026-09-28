import { initReveal } from '../shared/reveal-init.js';
import { initOscillatorDemo, initAudioFileDemo, initFrequencyDemo, initHarmonicsDemo, initNoiseDemo, initFilterDemo, initEnvelopeDemo, initLfoDemo } from '../shared/audio-demo.js';

const deck = initReveal();

// --- Student work clips --------------------------------------------------
// Local .mp4s, muted and looping, shown at their own proportions — same
// full-viewport-layer approach as week04's clip-layer (see #clip-layer in
// theme.css for why). The YouTube slide doesn't use this layer at all —
// reveal's own data-background-iframe handles that directly — but it still
// needs the top-left name tag, so clipNames is built from every
// data-clip-name section, not just the ones that also have a local file.

const clipLayer = document.createElement('video');
clipLayer.id = 'clip-layer';
clipLayer.muted = true; // required for autoplay to actually work, and "no audio" was the ask anyway
clipLayer.loop = true;
clipLayer.playsInline = true;
document.body.appendChild(clipLayer);

const clipCaption = document.createElement('div');
clipCaption.id = 'clip-caption';
document.body.appendChild(clipCaption);

const clipUrls = new Map();
document.querySelectorAll('section[data-clip-file]').forEach((section) => {
  const file = section.dataset.clipFile;
  const url = new URL(`./assets/studentwork/${file}`, import.meta.url).href;
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

// Every init*Demo() call returns { stop }. Collected here so ANY demo
// still playing gets stopped the instant reveal navigates away from its
// slide — without this, clicking Play then moving on leaves it running
// in the background (and stacking with whatever gets played next).
const demos = [];

// --- Slide 3: sound demo (recorded file, not a synthesized tone) ----------

demos.push(initAudioFileDemo(document.getElementById('sound-demo-1'), {
  src: new URL('./assets/Opening/74825__robinhood76__01099-tweeting-bird-1.wav', import.meta.url).href,
}));

// --- Slide 4: noise demo (independently-random samples, not a tone) -------

demos.push(initNoiseDemo(document.getElementById('noise-demo-1'), {
  gain: 0.15, // noise reads louder than a tone at the same gain
  visualGain: 6, // scope trace only — makes it read bold/clear without raising actual loudness
}));

// --- Slide 5: oscillator demo ---------------------------------------------

demos.push(initOscillatorDemo(document.getElementById('osc-demo-1'), {
  type: 'sine',
  freq: 440,
}));

// --- Slide 6: frequency demo -----------------------------------------------

demos.push(initFrequencyDemo(document.getElementById('freq-demo-1'), {
  type: 'sine',
  minFreq: 20,
  maxFreq: 2000,
  initialFreq: 440,
}));

// --- Slide 7: amplitude demo (same as above, plus the volume fader) -------

demos.push(initFrequencyDemo(document.getElementById('amp-demo-1'), {
  type: 'sine',
  minFreq: 20,
  maxFreq: 2000,
  initialFreq: 440,
  gain: 0.25,
  maxGain: 0.5, // capped well below full scale (1.0) — see audio-demo.js
}));

// --- Slide 8: waveform demo (same as above, plus the shape buttons) -------
// Lower ceiling than the Amplitude slide's 0.5 — square/sawtooth carry a
// lot more harmonic energy than a sine at the same gain value, so they
// read as noticeably louder even at an identical number; capping lower
// here is what actually keeps the top end comfortable across all four
// shapes, not just sine.

demos.push(initFrequencyDemo(document.getElementById('waveform-demo-1'), {
  type: 'sine',
  minFreq: 20,
  maxFreq: 2000,
  initialFreq: 440,
  gain: 0.12,
  maxGain: 0.22,
}));

// --- Slide 9: spectrum demo (same as above, plus the bar-graph view) ------

demos.push(initFrequencyDemo(document.getElementById('spectrum-demo-1'), {
  type: 'sine',
  minFreq: 20,
  maxFreq: 2000,
  initialFreq: 440,
  gain: 0.12,
  maxGain: 0.22,
}));

// --- Slide 10: harmonics demo (continuous waveform morph slider) ----------

demos.push(initHarmonicsDemo(document.getElementById('harmonics-demo-1'), {
  minFreq: 20,
  maxFreq: 2000,
  initialFreq: 440,
  initialShape: 0, // starts at pure sine
  gain: 0.12,
  maxGain: 0.22,
}));

// --- Slide 11: filter demo (XY pad: X = cutoff, Y = resonance) ------------

demos.push(initFilterDemo(document.getElementById('filter-demo-1'), {
  freq: 110,
  gain: 0.15,
  minCutoff: 100,
  maxCutoff: 10000,
  initialCutoff: 1000,
  initialQ: 1,
}));

// --- Slide 12: envelope demo (drag the ADSR curve's own handles) ----------

demos.push(initEnvelopeDemo(document.getElementById('envelope-demo-1'), {
  type: 'sawtooth',
  freq: 220,
  gain: 0.25,
}));

// --- Slide 13: LFO demo (modulates pitch, amplitude, or filter cutoff) ----

demos.push(initLfoDemo(document.getElementById('lfo-demo-1'), {
  carrierType: 'sawtooth',
  carrierFreq: 220,
  gain: 0.2,
  minRate: 0.1,
  maxRate: 20,
  initialRate: 4,
  initialDepth: 0.5,
  initialTarget: 'pitch',
}));

// Stopping a demo that's already stopped is a harmless no-op (each
// stop() only touches its oscillator/source if one is currently set),
// so calling every demo's stop() on every navigation — rather than
// tracking which slide owns which demo — is simplest and always correct.
deck.on('slidechanged', () => {
  demos.forEach((demo) => demo && demo.stop());
});

// --- MetaSounds screenshots -------------------------------------------
// Same full-viewport #screenshot-layer approach as week02/week04's
// initScreenshots() — a single element appended to <body>, outside
// reveal's scaled canvas, so each image shows at its real proportions
// rather than being bound by the deck's 960x700 shape.

const screenshotLayer = document.createElement('div');
screenshotLayer.id = 'screenshot-layer';
document.body.appendChild(screenshotLayer);

const screenshotUrls = new Map();
document.querySelectorAll('section[data-screenshot-file]').forEach((section) => {
  const file = section.dataset.screenshotFile;
  const url = new URL(`./assets/screenshots/${file}`, import.meta.url).href;
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
