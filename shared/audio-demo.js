// Reusable "play audio + watch it in realtime" demos, built on the native
// Web Audio API. No library (Tone.js etc.) needed for this — OscillatorNode
// already supports the four classic waveforms directly (osc.type:
// sine/square/sawtooth/triangle), and AnalyserNode gives a live time-domain
// buffer to draw for either a synthesized tone or a decoded audio file,
// which covers everything the early synthesis demos need (shape,
// amplitude, tone/timbre).
//
// One AudioContext, created lazily on first play rather than at module
// load — browsers block AudioContext creation/resume before a user
// gesture (a click), so building it up front would just sit suspended.

let sharedCtx = null;
function getContext() {
  if (!sharedCtx) {
    sharedCtx = new (window.AudioContext || window.webkitAudioContext)();
  }
  return sharedCtx;
}

// Plain geometric play/stop glyphs — currentColor so CSS controls the
// fill via .play-button's own color.
const PLAY_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><polygon points="7,4 20,12 7,20"/></svg>';
const STOP_ICON = '<svg viewBox="0 0 24 24" fill="currentColor" aria-hidden="true"><rect x="6" y="6" width="12" height="12"/></svg>';

// Waveform-shape icons for the waveform-select buttons — plain line
// traces of each shape (stroke, not fill) so they read as "little
// oscilloscope trace" rather than a filled logo. currentColor so CSS
// controls stroke color via each button's own .is-selected state.
const WAVEFORM_ICON_TAG_OPEN = '<svg viewBox="0 0 24 24" fill="none" stroke="currentColor" stroke-width="2" stroke-linecap="round" stroke-linejoin="round" aria-hidden="true">';
const WAVEFORM_ICONS = {
  sine: `${WAVEFORM_ICON_TAG_OPEN}<path d="M2,12 C5,4 9,4 12,12 C15,20 19,20 22,12"/></svg>`,
  square: `${WAVEFORM_ICON_TAG_OPEN}<path d="M2,6 H8 V18 H14 V6 H20 V18"/></svg>`,
  sawtooth: `${WAVEFORM_ICON_TAG_OPEN}<path d="M2,18 L8,6 L8,18 L14,6 L14,18 L20,6"/></svg>`,
  triangle: `${WAVEFORM_ICON_TAG_OPEN}<path d="M2,12 L6,4 L10,20 L14,4 L18,20 L22,12"/></svg>`,
};

// Standard Fourier sine-series coefficients for each classic waveform —
// used to build a genuinely in-between *shape* (week06 slide 9), not
// just a crossfade between two audio signals (which would just play
// both waveforms at once, not morph the actual waveform). All four are
// odd functions, so only the sine ("imaginary") terms are ever nonzero;
// n=0 (DC) and every real/cosine term stays 0.
const NUM_HARMONICS = 32;
const HARMONIC_SHAPES = ['sine', 'square', 'sawtooth', 'triangle'];

function harmonicCoefficients(type) {
  const imag = new Float32Array(NUM_HARMONICS);
  for (let n = 1; n < NUM_HARMONICS; n++) {
    if (type === 'sine') {
      imag[n] = n === 1 ? 1 : 0;
    } else if (type === 'square') {
      // Odd harmonics only, amplitude falling off as 1/n.
      imag[n] = n % 2 === 1 ? 4 / (n * Math.PI) : 0;
    } else if (type === 'sawtooth') {
      // Every harmonic, alternating sign, falling off as 1/n.
      imag[n] = (2 * (n % 2 === 1 ? 1 : -1)) / (n * Math.PI);
    } else if (type === 'triangle') {
      // Odd harmonics only, like square, but falling off much faster
      // (1/n^2) — same "which bars light up" pattern as square, quieter
      // past the first couple.
      if (n % 2 === 1) {
        const sign = ((n - 1) / 2) % 2 === 0 ? 1 : -1;
        imag[n] = (8 / (Math.PI * Math.PI * n * n)) * sign;
      }
    }
  }
  return imag;
}

const HARMONIC_SHAPE_COEFFICIENTS = HARMONIC_SHAPES.map(harmonicCoefficients);

// value spans [0, HARMONIC_SHAPES.length - 1] — e.g. 0 = pure sine,
// 1 = pure square, 1.5 = halfway between square and sawtooth, etc.
function blendedHarmonics(value) {
  const clamped = Math.max(0, Math.min(HARMONIC_SHAPES.length - 1, value));
  const index = Math.floor(clamped);
  const t = clamped - index;
  const a = HARMONIC_SHAPE_COEFFICIENTS[index];
  const b = HARMONIC_SHAPE_COEFFICIENTS[Math.min(index + 1, HARMONIC_SHAPES.length - 1)];
  const imag = new Float32Array(NUM_HARMONICS);
  for (let n = 0; n < NUM_HARMONICS; n++) {
    imag[n] = a[n] * (1 - t) + b[n] * t;
  }
  return imag;
}

// Analyser buffer size — large relative to how many samples actually get
// drawn (see VISIBLE_SAMPLES below), so there's plenty of room left after
// finding a trigger point near the start of the buffer. Bumped from 2048
// for the frequency-sweep demo: the visible window is a FIXED span of
// time, so a low frequency (near 20Hz) only shows a fraction of one
// cycle unless that window is wide enough to begin with — 4096 gives
// ~1 full cycle at 20Hz, which is what actually makes "the waves squeeze
// together as pitch rises" readable at the low end, not just the high
// end. (There's an inherent tradeoff here across a 100x frequency range:
// wide enough to show a cycle at 20Hz is also dense/near-blurred by
// 2000Hz — same limitation a real oscilloscope has with one fixed
// timebase setting.)
const FFT_SIZE = 4096;
const VISIBLE_SAMPLES = FFT_SIZE / 2;
const MID = 128; // getByteTimeDomainData's silence/center value

// Harmonic-aligned spectrum bars — not a raw/dense FFT strip, which
// would need hundreds of bins to look like anything, but one bar per
// harmonic multiple of the fundamental (bar 1 = fundamental, bar 2 = 2nd
// harmonic, etc). Real Fourier-series facts about these waveforms come
// through in genuinely-read FFT data with no per-waveform special-casing
// needed: a sine has energy only in bar 1; a square only in the odd
// bars (1st, 3rd, 5th...), each roughly half the amplitude of the one
// before; a sawtooth has energy in every bar. A triangle is also
// odd-only, but falls off much faster than a square's — same shape of
// bars lit, quieter past the first couple.
const SPECTRUM_BARS = 12;

// Shared button+canvas wiring for every audio demo on this page — the
// only thing that differs between a synthesized tone and a played-back
// file is what creates/destroys the actual audio source; the visualizer
// and button state are identical either way, so that logic lives here
// once rather than being duplicated per source type.
//
// `root` must contain one `[data-role="play"]` button and one
// `[data-role="wave"]` canvas (see week06 slides 3/4's markup). A
// `[data-role="spectrum"]` canvas is picked up automatically if present
// (see week06 slide 8) — `getFundamentalFreq()` supplies the current
// fundamental so the harmonic bars line up with whatever pitch is
// actually playing. `visualGain` (default 1) scales only the drawn
// trace's height, entirely separate from the actual GainNode driving
// what's audible — see initNoiseDemo, which needs a much bigger-looking
// scope trace than its (deliberately quiet) audio gain would draw on
// its own.
function createDemoUI(root, { getFundamentalFreq, visualGain = 1 } = {}) {
  const button = root.querySelector('[data-role="play"]');
  const canvas = root.querySelector('[data-role="wave"]');
  if (!button || !canvas) return null;

  const spectrumCanvas = root.querySelector('[data-role="spectrum"]'); // optional
  const ctx2d = canvas.getContext('2d');
  const spectrumCtx = spectrumCanvas ? spectrumCanvas.getContext('2d') : null;
  let analyser = null;
  let raf = null;

  // Real backing-store pixels, not just CSS size — same reasoning as the
  // WebGL canvases elsewhere in this deck (crisp on high-DPI screens,
  // and the draw loop below reads canvas.width/height directly).
  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    if (spectrumCanvas) {
      const sRect = spectrumCanvas.getBoundingClientRect();
      spectrumCanvas.width = Math.round(sRect.width * dpr);
      spectrumCanvas.height = Math.round(sRect.height * dpr);
    }
    if (analyser) {
      drawFrame();
      drawSpectrumFrame();
    } else {
      drawFlatLine();
      drawFlatSpectrum();
    }
  }

  function strokeStyle() {
    return getComputedStyle(root).getPropertyValue('--divider-color') || '#57c4fa';
  }

  function beginStroke() {
    const { width } = canvas;
    ctx2d.clearRect(0, 0, canvas.width, canvas.height);
    ctx2d.lineWidth = Math.max(2, width / 480);
    ctx2d.strokeStyle = strokeStyle();
    ctx2d.beginPath();
  }

  // Silent/idle state — a flat line instead of a blank canvas, so it
  // reads as "zero signal" rather than "nothing's here yet".
  function drawFlatLine() {
    const { width, height } = canvas;
    beginStroke();
    ctx2d.moveTo(0, height / 2);
    ctx2d.lineTo(width, height / 2);
    ctx2d.stroke();
  }

  function drawFlatSpectrum() {
    if (!spectrumCanvas) return;
    spectrumCtx.clearRect(0, 0, spectrumCanvas.width, spectrumCanvas.height);
  }

  function drawFrame() {
    const data = new Uint8Array(FFT_SIZE);
    analyser.getByteTimeDomainData(data);

    // Oscilloscope-style trigger: a raw analyser buffer's start point
    // isn't phase-locked to the waveform's own cycle, so drawing from
    // index 0 every frame makes an otherwise steady signal visibly
    // jitter side to side. Locking the draw to always start at the same
    // point in the cycle — the first rising edge through the midline —
    // is what a real oscilloscope's trigger does, and it fixes the
    // stutter here the same way. (On real-world/noisy material this
    // trigger is less exact than on a clean synthesized tone, but it
    // still reads far steadier than no triggering at all.)
    let triggerIndex = 0;
    for (let i = 1; i < FFT_SIZE - 1; i++) {
      if (data[i - 1] < MID && data[i] >= MID) {
        triggerIndex = i;
        break;
      }
    }

    const { width, height } = canvas;
    beginStroke();
    const sliceWidth = width / VISIBLE_SAMPLES;
    let x = 0;
    for (let i = 0; i < VISIBLE_SAMPLES; i++) {
      const sample = data[triggerIndex + i] ?? MID;
      // Deviation from the centerline (0 = silence), scaled by
      // visualGain independent of the actual audio gain, then clamped
      // back into the canvas — a visually-amplified signal can otherwise
      // draw past the top/bottom edge on its bigger excursions.
      const deviation = sample / MID - 1;
      const y = Math.max(0, Math.min(height, height / 2 + deviation * visualGain * (height / 2)));
      if (i === 0) ctx2d.moveTo(x, y);
      else ctx2d.lineTo(x, y);
      x += sliceWidth;
    }
    ctx2d.stroke();
  }

  function drawSpectrumFrame() {
    if (!spectrumCanvas) return;

    const freqData = new Uint8Array(analyser.frequencyBinCount);
    analyser.getByteFrequencyData(freqData);

    const fundamental = getFundamentalFreq ? getFundamentalFreq() : 440;
    const binHz = analyser.context.sampleRate / FFT_SIZE;

    const { width, height } = spectrumCanvas;
    spectrumCtx.clearRect(0, 0, width, height);
    spectrumCtx.fillStyle = strokeStyle();

    const barSlot = width / SPECTRUM_BARS;
    const barWidth = barSlot * 0.7;
    for (let n = 1; n <= SPECTRUM_BARS; n++) {
      const binIndex = Math.min(analyser.frequencyBinCount - 1, Math.round((fundamental * n) / binHz));
      const magnitude = freqData[binIndex] / 255;
      const barHeight = magnitude * height;
      const x = (n - 1) * barSlot + (barSlot - barWidth) / 2;
      spectrumCtx.fillRect(x, height - barHeight, barWidth, barHeight);
    }
  }

  function loop() {
    drawFrame();
    drawSpectrumFrame();
    raf = requestAnimationFrame(loop);
  }

  function setButtonState(playing) {
    button.innerHTML = playing ? STOP_ICON : PLAY_ICON;
    button.classList.toggle('is-playing', playing);
    button.setAttribute('aria-label', playing ? 'Stop' : 'Play');
  }

  function startVisualizing(analyserNode) {
    analyser = analyserNode;
    setButtonState(true);
    loop();
  }

  function stopVisualizing() {
    analyser = null;
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    setButtonState(false);
    drawFlatLine();
    drawFlatSpectrum();
  }

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  setButtonState(false);

  return { button, startVisualizing, stopVisualizing };
}

/**
 * Wires up a play/stop button + canvas inside `root` into a working
 * oscillator demo. Barebones on purpose — later slides layer on more
 * controls (amplitude, other waveform shapes, etc.) by calling this
 * again with different roots/options, not by extending this function.
 *
 * @param {HTMLElement} root
 * @param {{ type?: OscillatorType, freq?: number, gain?: number }} [opts]
 */
export function initOscillatorDemo(root, opts = {}) {
  const ui = createDemoUI(root);
  if (!ui) return;

  const { type = 'sine', freq = 440, gain = 0.25 } = opts;
  let oscillator = null;

  function stop() {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    ui.stopVisualizing();
  }

  function play() {
    const audioCtx = getContext();

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = gain;

    oscillator = audioCtx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    oscillator.connect(gainNode).connect(analyser).connect(audioCtx.destination);
    oscillator.start();

    ui.startVisualizing(analyser);
  }

  ui.button.addEventListener('click', () => {
    if (oscillator) stop();
    else play();
  });

  return { stop };
}

/**
 * Same barebones structure as initOscillatorDemo (one play/stop button,
 * one scope, no other controls), but the source is genuine white noise
 * rather than a periodic tone — a buffer of independently-random samples
 * (Math.random() per sample, not a formula with any repeating shape),
 * looped. There's no waveform to speak of, which is the point: the
 * oscilloscope trace should look like a dense, structureless scribble
 * with no repeating cycle for the trigger to lock onto, in contrast to
 * every other demo on this slide's neighbors.
 *
 * `visualGain` scales only the drawn trace — the actual audio `gain`
 * stays low for loudness safety, but that also makes the raw trace read
 * as a thin, hard-to-see band hugging the centerline; visualGain lets
 * the *picture* be bold and clear without the sound getting any louder.
 *
 * @param {HTMLElement} root
 * @param {{ gain?: number, visualGain?: number }} [opts]
 */
export function initNoiseDemo(root, opts = {}) {
  const { gain = 0.15, visualGain = 6 } = opts; // noise reads louder than a tone at the same gain — same reason as the square/sawtooth ceiling elsewhere
  const ui = createDemoUI(root, { visualGain });
  if (!ui) return;

  let source = null;

  function stop() {
    if (source) {
      source.stop();
      source.disconnect();
      source = null;
    }
    ui.stopVisualizing();
  }

  function play() {
    const audioCtx = getContext();

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;

    const gainNode = audioCtx.createGain();
    gainNode.gain.value = gain;

    // A couple of seconds of independently-random samples, looped —
    // long enough that the loop point is inaudible as a "click" or
    // repeating pattern, short enough to stay a small buffer.
    const duration = 2;
    const buffer = audioCtx.createBuffer(1, audioCtx.sampleRate * duration, audioCtx.sampleRate);
    const data = buffer.getChannelData(0);
    for (let i = 0; i < data.length; i++) {
      data[i] = Math.random() * 2 - 1;
    }

    source = audioCtx.createBufferSource();
    source.buffer = buffer;
    source.loop = true;
    source.connect(gainNode).connect(analyser).connect(audioCtx.destination);
    source.start();

    ui.startVisualizing(analyser);
  }

  ui.button.addEventListener('click', () => {
    if (source) stop();
    else play();
  });

  return { stop };
}

/**
 * Wires up a play/stop button + canvas inside `root` into a demo that
 * plays back a recorded audio file, visualizing its actual decoded
 * output (not a canned/precomputed waveform) through the same
 * trigger-drawn AnalyserNode as initOscillatorDemo.
 *
 * @param {HTMLElement} root
 * @param {{ src: string }} opts — src should already be resolved via
 *   new URL(..., import.meta.url) in the caller, same as this deck's
 *   other local media (images/video).
 */
export function initAudioFileDemo(root, opts = {}) {
  const ui = createDemoUI(root);
  if (!ui) return;

  const { src } = opts;
  if (!src) return;

  const audioEl = new Audio(src);
  audioEl.preload = 'auto';

  // createMediaElementSource can only be called once per <audio> element
  // — build the graph lazily on first play, then just reuse it.
  let analyser = null;

  audioEl.addEventListener('ended', () => ui.stopVisualizing());

  function play() {
    const audioCtx = getContext();
    if (!analyser) {
      const source = audioCtx.createMediaElementSource(audioEl);
      analyser = audioCtx.createAnalyser();
      analyser.fftSize = FFT_SIZE;
      source.connect(analyser).connect(audioCtx.destination);
    }
    audioEl.currentTime = 0;
    audioEl.play();
    ui.startVisualizing(analyser);
  }

  function stop() {
    audioEl.pause();
    audioEl.currentTime = 0;
    ui.stopVisualizing();
  }

  ui.button.addEventListener('click', () => {
    if (audioEl.paused) play();
    else stop();
  });

  return { stop };
}

/**
 * Same oscillator demo as initOscillatorDemo, plus a logarithmic
 * frequency slider (with a live Hz readout) so pitch can be swept
 * smoothly across a wide range while playing. `root` additionally needs
 * one `[data-role="freq-slider"]` range input and one
 * `[data-role="freq-value"]` element.
 *
 * Linear would waste most of the slider's travel on the top end of the
 * range (e.g. half the slider would cover 20-1010Hz, the other half
 * 1010-2000Hz) — a log mapping spends equal slider distance per
 * *doubling* of frequency instead, which is what actually feels even,
 * since pitch perception itself is roughly logarithmic.
 *
 * A `[data-role="volume-slider"]` is picked up automatically if `root`
 * has one (see week06 slide 6) — linear 0-100% of `maxGain`, since gain
 * doesn't have the same "most of the range is useless" problem frequency
 * does. Gain is applied before the AnalyserNode in the signal chain, so
 * moving it scales the drawn wave's height directly — same shape,
 * taller/shorter — with no special-casing needed in the draw loop
 * itself. `maxGain` is capped well below 1.0 (full scale) by default —
 * a synthesized tone at full gain through classroom speakers is a real
 * hearing/equipment risk, not just "loud".
 *
 * `[data-role="waveform-button"]` elements (each with a
 * `data-waveform="sine"|"square"|"sawtooth"|"triangle"`) are picked up
 * automatically too (see week06 slide 7) — clicking one switches
 * oscillator.type live if currently playing (a plain property set, no
 * need to recreate the oscillator), and toggles which button shows as
 * selected.
 *
 * @param {HTMLElement} root
 * @param {{ type?: OscillatorType, gain?: number, maxGain?: number, minFreq?: number, maxFreq?: number, initialFreq?: number }} [opts]
 */
export function initFrequencyDemo(root, opts = {}) {
  const slider = root.querySelector('[data-role="freq-slider"]');
  const readout = root.querySelector('[data-role="freq-value"]');
  if (!slider || !readout) return;

  const { minFreq = 20, maxFreq = 2000 } = opts;
  const ratio = maxFreq / minFreq;
  const SLIDER_STEPS = 1000;

  // t (0..1) <-> Hz: freq = minFreq * ratio^t. The slider's own value
  // stays a plain 0..SLIDER_STEPS integer — t is just value/SLIDER_STEPS
  // — so the log curve lives entirely in these two conversions rather
  // than in the input element itself.
  function freqFromSlider(value) {
    const t = value / SLIDER_STEPS;
    return minFreq * Math.pow(ratio, t);
  }

  // Declared before createDemoUI so the spectrum's getFundamentalFreq
  // closure can reference `slider` — it just reads slider.value live at
  // draw time, so the order here only matters for the closure to compile
  // against a real binding, not for slider to already hold a value yet.
  const ui = createDemoUI(root, { getFundamentalFreq: () => freqFromSlider(Number(slider.value)) });
  if (!ui) return;

  const volumeSlider = root.querySelector('[data-role="volume-slider"]'); // optional
  const waveformButtons = root.querySelectorAll('[data-role="waveform-button"]'); // optional

  const { type: initialType = 'sine', gain: initialGain = 0.25, maxGain = 0.5, initialFreq = 440 } = opts;
  let currentType = initialType;

  if (waveformButtons.length) {
    waveformButtons.forEach((btn) => {
      if (WAVEFORM_ICONS[btn.dataset.waveform]) {
        btn.innerHTML = WAVEFORM_ICONS[btn.dataset.waveform];
      }
      btn.addEventListener('click', () => {
        currentType = btn.dataset.waveform;
        waveformButtons.forEach((b) => b.classList.toggle('is-selected', b === btn));
        // Live while playing — osc.type is a plain property, so this
        // takes effect immediately with no need to stop/restart.
        if (oscillator) oscillator.type = currentType;
      });
      btn.classList.toggle('is-selected', btn.dataset.waveform === currentType);
    });
  }

  function sliderFromFreq(freq) {
    return Math.round((Math.log(freq / minFreq) / Math.log(ratio)) * SLIDER_STEPS);
  }

  slider.min = '0';
  slider.max = String(SLIDER_STEPS);
  slider.step = '1';
  slider.value = String(sliderFromFreq(initialFreq));

  function updateReadout(freq) {
    readout.textContent = `${Math.round(freq)} Hz`;
  }
  updateReadout(initialFreq);

  let oscillator = null;
  let gainNode = null;
  let currentGain = initialGain;

  if (volumeSlider) {
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.step = '1';
    // Slider is a plain 0-100 "percent of maxGain", not percent of full
    // scale — e.g. maxGain=0.5 means the slider's own top end is gain
    // 0.5, never 1.0.
    volumeSlider.value = String(Math.round((initialGain / maxGain) * 100));
    volumeSlider.addEventListener('input', () => {
      currentGain = (Number(volumeSlider.value) / 100) * maxGain;
      // Live while playing — the wave visibly grows/shrinks without
      // changing shape, since this scales the signal ahead of the
      // analyser rather than altering the oscillator's own waveform.
      if (gainNode) gainNode.gain.value = currentGain;
    });
  }

  slider.addEventListener('input', () => {
    const freq = freqFromSlider(Number(slider.value));
    updateReadout(freq);
    // Live while playing — this is the actual "squeeze together as
    // pitch rises" effect, not just a pre-play setting.
    if (oscillator) oscillator.frequency.value = freq;
  });

  function stop() {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    ui.stopVisualizing();
  }

  function play() {
    const audioCtx = getContext();

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = currentGain;

    oscillator = audioCtx.createOscillator();
    oscillator.type = currentType;
    oscillator.frequency.value = freqFromSlider(Number(slider.value));
    oscillator.connect(gainNode).connect(analyser).connect(audioCtx.destination);
    oscillator.start();

    ui.startVisualizing(analyser);
  }

  ui.button.addEventListener('click', () => {
    if (oscillator) stop();
    else play();
  });

  return { stop };
}

/**
 * Same frequency slider, volume fader, and scope+spectrum visualizer as
 * initFrequencyDemo, but the waveform shape comes from a single
 * continuous slider instead of four discrete buttons — sine, square,
 * sawtooth, and triangle sit at fixed points along it, and every value
 * between them is a genuinely-computed in-between *shape*, not a
 * crossfade of two signals playing at once. See blendedHarmonics() above
 * for how: each classic waveform's real Fourier-series coefficients are
 * linearly interpolated, then rebuilt into a custom PeriodicWave via
 * oscillator.setPeriodicWave() — the actual harmonic content (and so
 * what the spectrum bars show) genuinely blends, it isn't faked.
 *
 * `root` needs one `[data-role="harmonics-slider"]` range input in place
 * of waveform buttons; everything else matches initFrequencyDemo's
 * expected markup (freq-slider/freq-value, optional volume-slider,
 * optional spectrum canvas).
 *
 * @param {HTMLElement} root
 * @param {{ gain?: number, maxGain?: number, minFreq?: number, maxFreq?: number, initialFreq?: number, initialShape?: number }} [opts]
 */
export function initHarmonicsDemo(root, opts = {}) {
  const slider = root.querySelector('[data-role="freq-slider"]');
  const readout = root.querySelector('[data-role="freq-value"]');
  const harmonicsSlider = root.querySelector('[data-role="harmonics-slider"]');
  if (!slider || !readout || !harmonicsSlider) return;

  const { minFreq = 20, maxFreq = 2000 } = opts;
  const ratio = maxFreq / minFreq;
  const SLIDER_STEPS = 1000;

  function freqFromSlider(value) {
    const t = value / SLIDER_STEPS;
    return minFreq * Math.pow(ratio, t);
  }

  const ui = createDemoUI(root, { getFundamentalFreq: () => freqFromSlider(Number(slider.value)) });
  if (!ui) return;

  const volumeSlider = root.querySelector('[data-role="volume-slider"]'); // optional

  const { gain: initialGain = 0.25, maxGain = 0.5, initialFreq = 440, initialShape = 0 } = opts;

  function sliderFromFreq(freq) {
    return Math.round((Math.log(freq / minFreq) / Math.log(ratio)) * SLIDER_STEPS);
  }

  slider.min = '0';
  slider.max = String(SLIDER_STEPS);
  slider.step = '1';
  slider.value = String(sliderFromFreq(initialFreq));

  function updateReadout(freq) {
    readout.textContent = `${Math.round(freq)} Hz`;
  }
  updateReadout(initialFreq);

  // Harmonics/shape slider — plain 0..1000, mapped to the 0..3 range
  // blendedHarmonics() expects (sine..square..sawtooth..triangle).
  const HARMONICS_STEPS = 1000;
  const HARMONICS_MAX_VALUE = HARMONIC_SHAPES.length - 1;
  harmonicsSlider.min = '0';
  harmonicsSlider.max = String(HARMONICS_STEPS);
  harmonicsSlider.step = '1';
  harmonicsSlider.value = String(Math.round((initialShape / HARMONICS_MAX_VALUE) * HARMONICS_STEPS));

  function currentShapeValue() {
    return (Number(harmonicsSlider.value) / HARMONICS_STEPS) * HARMONICS_MAX_VALUE;
  }

  let oscillator = null;
  let gainNode = null;
  let currentGain = initialGain;

  function applyShape() {
    if (!oscillator) return;
    const audioCtx = getContext();
    const real = new Float32Array(NUM_HARMONICS);
    const wave = audioCtx.createPeriodicWave(real, blendedHarmonics(currentShapeValue()));
    oscillator.setPeriodicWave(wave);
  }

  harmonicsSlider.addEventListener('input', () => {
    // Live while playing — setPeriodicWave takes effect immediately,
    // same as changing osc.type does for the discrete waveforms.
    applyShape();
  });

  if (volumeSlider) {
    volumeSlider.min = '0';
    volumeSlider.max = '100';
    volumeSlider.step = '1';
    volumeSlider.value = String(Math.round((initialGain / maxGain) * 100));
    volumeSlider.addEventListener('input', () => {
      currentGain = (Number(volumeSlider.value) / 100) * maxGain;
      if (gainNode) gainNode.gain.value = currentGain;
    });
  }

  slider.addEventListener('input', () => {
    const freq = freqFromSlider(Number(slider.value));
    updateReadout(freq);
    if (oscillator) oscillator.frequency.value = freq;
  });

  function stop() {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    ui.stopVisualizing();
  }

  function play() {
    const audioCtx = getContext();

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = currentGain;

    oscillator = audioCtx.createOscillator();
    oscillator.frequency.value = freqFromSlider(Number(slider.value));
    oscillator.connect(gainNode).connect(analyser).connect(audioCtx.destination);
    applyShape();
    oscillator.start();

    ui.startVisualizing(analyser);
  }

  ui.button.addEventListener('click', () => {
    if (oscillator) stop();
    else play();
  });

  return { stop };
}

/**
 * A single oscillator through a lowpass BiquadFilterNode, controlled by
 * one XY touchpad instead of two separate sliders — the X axis sweeps
 * cutoff frequency (log scale, same feel as the other frequency
 * sliders elsewhere in this deck), the Y axis sweeps resonance (the
 * filter's Q — how much the signal peaks right at the cutoff), with
 * "up = more" matching the vertical volume fader's own convention.
 * Dragging corner to corner sweeps both parameters at once, which reads
 * as a much more direct, "playable" control than two independent
 * sliders.
 *
 * `root` needs a `[data-role="xy-pad"]` element containing one
 * `[data-role="xy-handle"]` child (the draggable dot); optional
 * `[data-role="filter-hz"]` / `[data-role="filter-q"]` elements get a
 * live numeric readout if present (each is a fixed-width slot in the
 * markup so the surrounding text doesn't shift as digits change — see
 * .xy-readout-hz/-q in shared/theme.css). `[data-role="waveform-button"]`
 * elements (same markup as initFrequencyDemo's) are picked up
 * automatically too — switching the source waveform is what makes the
 * filter's effect actually vary: a sawtooth has energy in every
 * harmonic for the filter to carve into, a sine has none for the
 * cutoff to remove until it's below the fundamental itself.
 *
 * @param {HTMLElement} root
 * @param {{ type?: OscillatorType, freq?: number, gain?: number, minCutoff?: number, maxCutoff?: number, minQ?: number, maxQ?: number, initialCutoff?: number, initialQ?: number }} [opts]
 */
export function initFilterDemo(root, opts = {}) {
  const pad = root.querySelector('[data-role="xy-pad"]');
  const handle = root.querySelector('[data-role="xy-handle"]');
  if (!pad || !handle) return;

  const ui = createDemoUI(root);
  if (!ui) return;

  const hzReadout = root.querySelector('[data-role="filter-hz"]'); // optional
  const qReadout = root.querySelector('[data-role="filter-q"]'); // optional
  const waveformButtons = root.querySelectorAll('[data-role="waveform-button"]'); // optional

  const {
    type: initialType = 'sawtooth',
    freq = 110,
    gain = 0.15,
    minCutoff = 100,
    maxCutoff = 10000,
    minQ = 0.1,
    maxQ = 20,
    initialCutoff = 1000,
    initialQ = 1,
  } = opts;

  let currentType = initialType;

  if (waveformButtons.length) {
    waveformButtons.forEach((btn) => {
      if (WAVEFORM_ICONS[btn.dataset.waveform]) {
        btn.innerHTML = WAVEFORM_ICONS[btn.dataset.waveform];
      }
      btn.addEventListener('click', () => {
        currentType = btn.dataset.waveform;
        waveformButtons.forEach((b) => b.classList.toggle('is-selected', b === btn));
        // Live while playing — osc.type is a plain property, so this
        // takes effect immediately with no need to stop/restart.
        if (oscillator) oscillator.type = currentType;
      });
      btn.classList.toggle('is-selected', btn.dataset.waveform === currentType);
    });
  }

  const cutoffRatio = maxCutoff / minCutoff;

  // Log mapping for cutoff (X axis) — same reasoning as the frequency
  // sliders elsewhere: equal pad distance per doubling of frequency,
  // not per fixed Hz step.
  function cutoffFromT(t) {
    return minCutoff * Math.pow(cutoffRatio, t);
  }
  function tFromCutoff(cutoff) {
    return Math.log(cutoff / minCutoff) / Math.log(cutoffRatio);
  }

  // Linear mapping for resonance (Y axis) — Q doesn't have the same
  // "most of the range is useless" skew frequency does.
  function qFromT(t) {
    return minQ + t * (maxQ - minQ);
  }
  function tFromQ(q) {
    return (q - minQ) / (maxQ - minQ);
  }

  let currentCutoff = initialCutoff;
  let currentQ = initialQ;
  let oscillator = null;
  let filterNode = null;
  let gainNode = null;

  function updateReadouts() {
    if (hzReadout) hzReadout.textContent = String(Math.round(currentCutoff));
    if (qReadout) qReadout.textContent = currentQ.toFixed(1);
  }

  // Handle position as a % of the pad rather than measured pixels, so
  // it stays correct across resizes with no re-measuring needed.
  function updateHandlePosition() {
    const xPct = tFromCutoff(currentCutoff) * 100;
    const yPct = (1 - tFromQ(currentQ)) * 100; // inverted — up = more resonance
    handle.style.left = `${xPct}%`;
    handle.style.top = `${yPct}%`;
  }

  function setFromPointer(clientX, clientY) {
    const rect = pad.getBoundingClientRect();
    const xT = Math.max(0, Math.min(1, (clientX - rect.left) / rect.width));
    const yT = Math.max(0, Math.min(1, (clientY - rect.top) / rect.height));
    currentCutoff = cutoffFromT(xT);
    currentQ = qFromT(1 - yT);
    updateReadouts();
    updateHandlePosition();
    // Live while playing — a plain property set on an already-running
    // filter, same as the frequency slider does for oscillator.frequency.
    if (filterNode) {
      filterNode.frequency.value = currentCutoff;
      filterNode.Q.value = currentQ;
    }
  }

  let dragging = false;
  pad.addEventListener('pointerdown', (e) => {
    dragging = true;
    pad.setPointerCapture(e.pointerId);
    setFromPointer(e.clientX, e.clientY);
  });
  pad.addEventListener('pointermove', (e) => {
    if (!dragging) return;
    setFromPointer(e.clientX, e.clientY);
  });
  pad.addEventListener('pointerup', (e) => {
    dragging = false;
    pad.releasePointerCapture(e.pointerId);
  });

  updateReadouts();
  updateHandlePosition();

  function stop() {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (filterNode) {
      filterNode.disconnect();
      filterNode = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    ui.stopVisualizing();
  }

  function play() {
    const audioCtx = getContext();

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = gain;

    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = currentCutoff;
    filterNode.Q.value = currentQ;

    oscillator = audioCtx.createOscillator();
    oscillator.type = currentType;
    oscillator.frequency.value = freq;
    oscillator.connect(filterNode).connect(gainNode).connect(analyser).connect(audioCtx.destination);
    oscillator.start();

    ui.startVisualizing(analyser);
  }

  ui.button.addEventListener('click', () => {
    if (oscillator) stop();
    else play();
  });

  return { stop };
}

/**
 * ADSR (Attack/Decay/Sustain/Release) envelope demo -- a single
 * oscillator whose GainNode is driven entirely by AudioParam automation
 * (linearRampToValueAtTime), not a live AnalyserNode. The shape being
 * taught here unfolds over a couple of seconds, far longer than the
 * ~90ms instantaneous window the oscilloscope elsewhere in this deck
 * can show, so the canvas draws the envelope's own computed shape
 * directly (with a moving playhead synced to real playback time)
 * rather than sampling live audio.
 *
 * No sliders -- the four parameters are set by dragging three handles
 * directly on the curve itself:
 *   - the attack peak: horizontal drag only (its height is always full
 *     gain by definition, only its timing varies) -- sets attack time.
 *   - the decay/sustain corner: drags freely -- X sets decay time, Y
 *     sets the sustain level, one handle for two parameters (same
 *     "one drag, two parameters" idea as the Filter slide's XY pad).
 *   - the release end: horizontal drag only (always ends at silence) --
 *     sets release time.
 * Each handle is confined to its own reserved horizontal band of the
 * canvas (see the *_FRAC constants below), with a fixed-width sustain
 * plateau in between standing in for "however long the note is
 * actually held" -- that duration depends on how long Play is left
 * running before Stop is clicked, not a parameter with its own control.
 *
 * Dragging is only active while idle -- once a note is triggered its
 * envelope is already committed to the Web Audio graph via scheduled
 * automation, so reshaping the curve mid-playback would desync the
 * drawing from what's actually scheduled to play; new drag positions
 * simply apply the next time Play is pressed.
 *
 * Clicking Play starts attack-decay-sustain (holding at the sustain
 * level indefinitely). Clicking Stop while attacking/decaying/
 * sustaining triggers the release ramp from whatever level the
 * envelope is actually at that moment (not just the sustain level)
 * down to silence, matching a real synth's note-off behavior. A second
 * click while already releasing cuts it short immediately rather than
 * starting a new overlapping note -- kept as a single play-release-idle
 * state machine rather than allowing retriggering, which would
 * otherwise leak the still-releasing oscillator once its state got
 * overwritten by a new one.
 *
 * @param {HTMLElement} root
 * @param {{ type?: OscillatorType, freq?: number, gain?: number, minAttack?: number, maxAttack?: number, minDecay?: number, maxDecay?: number, minRelease?: number, maxRelease?: number, initialAttack?: number, initialDecay?: number, initialSustain?: number, initialRelease?: number }} [opts]
 */
export function initEnvelopeDemo(root, opts = {}) {
  const canvas = root.querySelector('[data-role="wave"]');
  const button = root.querySelector('[data-role="play"]');
  if (!canvas || !button) return;

  const ctx2d = canvas.getContext('2d');

  const {
    type = 'sawtooth',
    freq = 220,
    gain: peakGain = 0.25,
    minAttack = 0.01,
    maxAttack = 1.5,
    minDecay = 0.01,
    maxDecay = 1.5,
    minRelease = 0.05,
    maxRelease = 2,
    initialAttack = 0.1,
    initialDecay = 0.3,
    initialSustain = 0.6,
    initialRelease = 0.4,
  } = opts;

  let attackTime = initialAttack;
  let decayTime = initialDecay;
  let sustainLevel = initialSustain;
  let releaseTime = initialRelease;

  // Fixed proportions of the canvas width reserved for each stage -- the
  // sustain plateau's own width is symbolic (a held note's real
  // duration isn't a parameter); the other three scale within their own
  // band between that stage's min/max time.
  const ATTACK_FRAC = 0.3;
  const DECAY_FRAC = 0.3;
  const SUSTAIN_FRAC = 0.15;
  const SUSTAIN_VISUAL_HOLD = 1.2; // seconds the playhead takes to creep across the plateau before parking

  let width = 0;
  let height = 0;

  function margin() {
    return Math.max(10, height * 0.08);
  }
  function topY() {
    return margin();
  }
  function bottomY() {
    return height - margin();
  }
  function handleRadius() {
    return Math.max(6, width / 60);
  }

  function bandX(fracStart, fracEnd) {
    return [width * fracStart, width * fracEnd];
  }
  function attackBandX() {
    return bandX(0, ATTACK_FRAC);
  }
  function decayBandX() {
    return bandX(ATTACK_FRAC, ATTACK_FRAC + DECAY_FRAC);
  }
  function sustainBandX() {
    return bandX(ATTACK_FRAC + DECAY_FRAC, ATTACK_FRAC + DECAY_FRAC + SUSTAIN_FRAC);
  }
  function releaseBandX() {
    return bandX(ATTACK_FRAC + DECAY_FRAC + SUSTAIN_FRAC, 1);
  }

  function attackHandlePos() {
    const [x0, x1] = attackBandX();
    const t = (attackTime - minAttack) / (maxAttack - minAttack);
    return { x: x0 + t * (x1 - x0), y: topY() };
  }
  function decayHandlePos() {
    const [x0, x1] = decayBandX();
    const t = (decayTime - minDecay) / (maxDecay - minDecay);
    return { x: x0 + t * (x1 - x0), y: bottomY() - sustainLevel * (bottomY() - topY()) };
  }
  function releaseHandlePos() {
    const [x0, x1] = releaseBandX();
    const t = (releaseTime - minRelease) / (maxRelease - minRelease);
    return { x: x0 + t * (x1 - x0), y: bottomY() };
  }

  function clamp(v, lo, hi) {
    return Math.max(lo, Math.min(hi, v));
  }

  function setAttackFromX(x) {
    const [x0, x1] = attackBandX();
    const t = clamp((x - x0) / (x1 - x0), 0, 1);
    attackTime = minAttack + t * (maxAttack - minAttack);
  }
  function setDecaySustainFromXY(x, y) {
    const [x0, x1] = decayBandX();
    const t = clamp((x - x0) / (x1 - x0), 0, 1);
    decayTime = minDecay + t * (maxDecay - minDecay);
    sustainLevel = clamp((bottomY() - y) / (bottomY() - topY()), 0, 1);
  }
  function setReleaseFromX(x) {
    const [x0, x1] = releaseBandX();
    const t = clamp((x - x0) / (x1 - x0), 0, 1);
    releaseTime = minRelease + t * (maxRelease - minRelease);
  }

  function cssVar(name, fallback) {
    const value = getComputedStyle(document.documentElement).getPropertyValue(name).trim();
    return value || fallback;
  }
  function strokeStyle() {
    return getComputedStyle(root).getPropertyValue('--divider-color') || '#57c4fa';
  }

  // Playback state for the moving playhead -- null while idle.
  // releaseStartTime stays null until Stop triggers the release ramp.
  let playState = null;

  function playheadPos() {
    if (!playState) return null;
    const now = performance.now() / 1000;
    const a = attackHandlePos();
    const d = decayHandlePos();
    const [, sustainEndX] = sustainBandX();
    const r = releaseHandlePos();

    if (playState.releaseStartTime !== null) {
      const u = clamp((now - playState.releaseStartTime) / releaseTime, 0, 1);
      return { x: sustainEndX + u * (r.x - sustainEndX), y: d.y + u * (r.y - d.y) };
    }

    const elapsed = now - playState.startTime;
    if (elapsed < attackTime) {
      const u = attackTime > 0 ? elapsed / attackTime : 1;
      return { x: u * a.x, y: bottomY() + u * (a.y - bottomY()) };
    }
    if (elapsed < attackTime + decayTime) {
      const u = decayTime > 0 ? (elapsed - attackTime) / decayTime : 1;
      return { x: a.x + u * (d.x - a.x), y: a.y + u * (d.y - a.y) };
    }
    const u = clamp((elapsed - attackTime - decayTime) / SUSTAIN_VISUAL_HOLD, 0, 1);
    return { x: d.x + u * (sustainEndX - d.x), y: d.y };
  }

  function draw() {
    ctx2d.clearRect(0, 0, width, height);

    const a = attackHandlePos();
    const d = decayHandlePos();
    const [, sustainEndX] = sustainBandX();
    const r = releaseHandlePos();

    ctx2d.lineWidth = Math.max(2, width / 480);
    ctx2d.strokeStyle = strokeStyle();
    ctx2d.beginPath();
    ctx2d.moveTo(0, bottomY());
    ctx2d.lineTo(a.x, a.y);
    ctx2d.lineTo(d.x, d.y);
    ctx2d.lineTo(sustainEndX, d.y); // fixed-width plateau at the sustain level
    ctx2d.lineTo(r.x, r.y);
    ctx2d.lineTo(width, r.y); // flat silence after release completes
    ctx2d.stroke();

    ctx2d.fillStyle = strokeStyle();
    [a, d, r].forEach((p) => {
      ctx2d.beginPath();
      ctx2d.arc(p.x, p.y, handleRadius(), 0, Math.PI * 2);
      ctx2d.fill();
    });

    const playhead = playheadPos();
    if (playhead) {
      ctx2d.fillStyle = cssVar('--accent-red', '#ff5c5c');
      ctx2d.beginPath();
      ctx2d.arc(playhead.x, playhead.y, handleRadius() * 0.55, 0, Math.PI * 2);
      ctx2d.fill();
    }
  }

  function resizeCanvas() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const rect = canvas.getBoundingClientRect();
    canvas.width = Math.round(rect.width * dpr);
    canvas.height = Math.round(rect.height * dpr);
    width = canvas.width;
    height = canvas.height;
    draw();
  }

  let oscillator = null;
  let gainNode = null;
  let raf = null;

  function setButtonState(playing) {
    button.innerHTML = playing ? STOP_ICON : PLAY_ICON;
    button.classList.toggle('is-playing', playing);
    button.setAttribute('aria-label', playing ? 'Stop' : 'Play');
  }

  function loop() {
    draw();
    if (playState && playState.releaseStartTime !== null) {
      const now = performance.now() / 1000;
      if (now - playState.releaseStartTime >= releaseTime) {
        finishStop();
        return;
      }
    }
    raf = requestAnimationFrame(loop);
  }

  function finishStop() {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    playState = null;
    if (raf !== null) {
      cancelAnimationFrame(raf);
      raf = null;
    }
    setButtonState(false);
    draw();
  }

  function play() {
    const audioCtx = getContext();
    const now = audioCtx.currentTime;

    gainNode = audioCtx.createGain();
    gainNode.gain.setValueAtTime(0, now);
    gainNode.gain.linearRampToValueAtTime(peakGain, now + attackTime);
    gainNode.gain.linearRampToValueAtTime(peakGain * sustainLevel, now + attackTime + decayTime);

    oscillator = audioCtx.createOscillator();
    oscillator.type = type;
    oscillator.frequency.value = freq;
    oscillator.connect(gainNode).connect(audioCtx.destination);
    oscillator.start();

    playState = { startTime: performance.now() / 1000, releaseStartTime: null };
    setButtonState(true);
    loop();
  }

  function releaseAndStop() {
    const audioCtx = getContext();
    const now = audioCtx.currentTime;
    // Release from whatever level the envelope actually holds right
    // now (not just the sustain level) -- Stop can just as easily land
    // mid-attack or mid-decay, and .value reflects the live automated
    // value at read time.
    const currentLevel = gainNode.gain.value;
    gainNode.gain.cancelScheduledValues(now);
    gainNode.gain.setValueAtTime(currentLevel, now);
    gainNode.gain.linearRampToValueAtTime(0, now + releaseTime);
    playState.releaseStartTime = performance.now() / 1000;
  }

  button.addEventListener('click', () => {
    if (!oscillator) play();
    else if (playState.releaseStartTime === null) releaseAndStop();
    else finishStop(); // already releasing -- a second click cuts it short
  });

  let draggingHandle = null; // 'attack' | 'decay' | 'release' | null

  function nearestHandle(x, y) {
    const candidates = [
      { name: 'attack', pos: attackHandlePos() },
      { name: 'decay', pos: decayHandlePos() },
      { name: 'release', pos: releaseHandlePos() },
    ];
    let best = null;
    let bestDist = Infinity;
    candidates.forEach(({ name, pos }) => {
      const dist = Math.hypot(pos.x - x, pos.y - y);
      if (dist < bestDist) {
        bestDist = dist;
        best = name;
      }
    });
    return bestDist <= handleRadius() * 2.5 ? best : null;
  }

  function canvasPointFromEvent(e) {
    const rect = canvas.getBoundingClientRect();
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    return { x: (e.clientX - rect.left) * dpr, y: (e.clientY - rect.top) * dpr };
  }

  function applyDrag(x, y) {
    if (draggingHandle === 'attack') setAttackFromX(x);
    else if (draggingHandle === 'decay') setDecaySustainFromXY(x, y);
    else if (draggingHandle === 'release') setReleaseFromX(x);
    draw();
  }

  canvas.addEventListener('pointerdown', (e) => {
    if (oscillator) return; // don't reshape a curve already committed to a playing note
    const { x, y } = canvasPointFromEvent(e);
    draggingHandle = nearestHandle(x, y);
    if (draggingHandle) {
      canvas.setPointerCapture(e.pointerId);
      applyDrag(x, y);
    }
  });
  canvas.addEventListener('pointermove', (e) => {
    if (!draggingHandle) return;
    const { x, y } = canvasPointFromEvent(e);
    applyDrag(x, y);
  });
  canvas.addEventListener('pointerup', (e) => {
    draggingHandle = null;
    canvas.releasePointerCapture(e.pointerId);
  });

  window.addEventListener('resize', resizeCanvas);
  resizeCanvas();
  setButtonState(false);

  return { stop: finishStop };
}

const LFO_TARGET_LABELS = { pitch: 'Pitch', amplitude: 'Amp', filter: 'Filt' };

/**
 * LFO (Low Frequency Oscillator) demo -- a second, slow oscillator
 * (fixed sine shape, 0.1-20 Hz) modulates one of three targets on an
 * audible carrier oscillator: pitch (vibrato), amplitude (tremolo), or
 * a lowpass filter's cutoff (auto-wah). These are the same three
 * parameters already explored by hand on the Frequency/Amplitude/
 * Filter slides -- this is the same idea, but moved automatically by a
 * second oscillator instead of a hand on a slider or pad.
 *
 * Reuses the existing oscilloscope (via createDemoUI), not a custom
 * drawn graph like the Envelope slide's: an LFO's modulation is slow
 * and cyclic, so it plays out live across many render frames -- the
 * wave's amplitude visibly breathes for tremolo, or its frequency
 * visibly stretches and squeezes for vibrato -- unlike the Envelope's
 * one-shot shape, which needed its own timeline drawing.
 *
 * The carrier oscillator always runs through a BiquadFilterNode (see
 * initFilterDemo), even when the target isn't Filter -- its cutoff is
 * just parked far above anything audible in that case, so the audio
 * graph's topology never has to change on a target switch, only which
 * AudioParam the LFO's own depth-scaled output is connected into.
 *
 * `root` needs `[data-role="rate-slider"]` + `[data-role="rate-value"]`
 * (a log-scale slider, same technique as the frequency sliders
 * elsewhere), an optional `[data-role="depth-slider"]` (linear 0-100%),
 * and optional `[data-role="target-button"]` elements (each with a
 * `data-target="pitch"|"amplitude"|"filter"`).
 *
 * @param {HTMLElement} root
 * @param {{ carrierType?: OscillatorType, carrierFreq?: number, gain?: number, minRate?: number, maxRate?: number, initialRate?: number, initialDepth?: number, initialTarget?: 'pitch'|'amplitude'|'filter', pitchDepthHz?: number, filterBaseCutoff?: number, filterDepthHz?: number }} [opts]
 */
export function initLfoDemo(root, opts = {}) {
  const rateSlider = root.querySelector('[data-role="rate-slider"]');
  const rateReadout = root.querySelector('[data-role="rate-value"]');
  if (!rateSlider || !rateReadout) return;

  const {
    carrierType = 'sawtooth',
    carrierFreq = 220,
    gain: baseGain = 0.2,
    minRate = 0.1,
    maxRate = 20,
    initialRate = 4,
    initialDepth = 0.5,
    initialTarget = 'pitch',
    pitchDepthHz = 50,
    filterBaseCutoff = 1000,
    filterDepthHz = 800,
  } = opts;

  const rateRatio = maxRate / minRate;
  const RATE_STEPS = 1000;

  function rateFromSlider(value) {
    const t = value / RATE_STEPS;
    return minRate * Math.pow(rateRatio, t);
  }
  function sliderFromRate(rate) {
    return Math.round((Math.log(rate / minRate) / Math.log(rateRatio)) * RATE_STEPS);
  }

  const ui = createDemoUI(root);
  if (!ui) return;

  const depthSlider = root.querySelector('[data-role="depth-slider"]'); // optional
  const targetButtons = root.querySelectorAll('[data-role="target-button"]'); // optional

  let currentTarget = initialTarget;
  let currentDepth = initialDepth;

  // How a depth of 1.0 (100%) translates into each target's own units --
  // frequency deviation in Hz for pitch, a fraction of the base gain for
  // amplitude (so it never swings negative at depth<=1), and a cutoff
  // deviation in Hz for filter (kept below filterBaseCutoff so the
  // cutoff never goes negative either).
  function targetScale(target) {
    if (target === 'pitch') return pitchDepthHz;
    if (target === 'filter') return filterDepthHz;
    return baseGain;
  }

  rateSlider.min = '0';
  rateSlider.max = String(RATE_STEPS);
  rateSlider.step = '1';
  rateSlider.value = String(sliderFromRate(initialRate));

  function updateRateReadout(rate) {
    rateReadout.textContent = `${rate.toFixed(1)} Hz`;
  }
  updateRateReadout(initialRate);

  if (depthSlider) {
    depthSlider.min = '0';
    depthSlider.max = '100';
    depthSlider.step = '1';
    depthSlider.value = String(Math.round(initialDepth * 100));
  }

  let oscillator = null; // the audible carrier
  let gainNode = null;
  let filterNode = null;
  let lfo = null;
  let depthGain = null;

  function currentTargetParam() {
    if (!oscillator || !gainNode || !filterNode) return null;
    if (currentTarget === 'pitch') return oscillator.frequency;
    if (currentTarget === 'filter') return filterNode.frequency;
    return gainNode.gain;
  }

  function applyDepth() {
    if (!depthGain) return;
    depthGain.gain.value = currentDepth * targetScale(currentTarget);
  }

  function setTarget(target) {
    const previousParam = currentTargetParam();
    currentTarget = target;
    if (targetButtons.length) {
      targetButtons.forEach((b) => b.classList.toggle('is-selected', b.dataset.target === target));
    }
    if (depthGain && previousParam) {
      depthGain.disconnect(previousParam);
    }
    if (filterNode) {
      // Park the filter's cutoff far above anything audible unless it's
      // actually the thing being modulated -- otherwise it would quietly
      // darken the pitch/amplitude demos' tone too.
      filterNode.frequency.value = currentTarget === 'filter' ? filterBaseCutoff : 18000;
    }
    if (depthGain) {
      const newParam = currentTargetParam();
      if (newParam) depthGain.connect(newParam);
    }
    applyDepth();
  }

  if (targetButtons.length) {
    targetButtons.forEach((btn) => {
      if (LFO_TARGET_LABELS[btn.dataset.target]) {
        // A span, not textContent directly on the button — the button's
        // own width/height are set in em (2.4em, from .waveform-button),
        // which resolves against ITS OWN font-size; putting the smaller
        // font-size on the button itself would shrink the button's box
        // right along with the text.
        btn.innerHTML = `<span class="target-button-label">${LFO_TARGET_LABELS[btn.dataset.target]}</span>`;
      }
      btn.addEventListener('click', () => setTarget(btn.dataset.target));
      btn.classList.toggle('is-selected', btn.dataset.target === currentTarget);
    });
  }

  rateSlider.addEventListener('input', () => {
    const rate = rateFromSlider(Number(rateSlider.value));
    updateRateReadout(rate);
    // Live while playing — a plain property set on the already-running
    // LFO, same as the carrier's own frequency slider elsewhere.
    if (lfo) lfo.frequency.value = rate;
  });

  if (depthSlider) {
    depthSlider.addEventListener('input', () => {
      currentDepth = Number(depthSlider.value) / 100;
      applyDepth();
    });
  }

  function stop() {
    if (oscillator) {
      oscillator.stop();
      oscillator.disconnect();
      oscillator = null;
    }
    if (lfo) {
      lfo.stop();
      lfo.disconnect();
      lfo = null;
    }
    if (depthGain) {
      depthGain.disconnect();
      depthGain = null;
    }
    if (filterNode) {
      filterNode.disconnect();
      filterNode = null;
    }
    if (gainNode) {
      gainNode.disconnect();
      gainNode = null;
    }
    ui.stopVisualizing();
  }

  function play() {
    const audioCtx = getContext();

    const analyser = audioCtx.createAnalyser();
    analyser.fftSize = FFT_SIZE;

    gainNode = audioCtx.createGain();
    gainNode.gain.value = baseGain;

    filterNode = audioCtx.createBiquadFilter();
    filterNode.type = 'lowpass';
    filterNode.frequency.value = currentTarget === 'filter' ? filterBaseCutoff : 18000;
    filterNode.Q.value = 1;

    oscillator = audioCtx.createOscillator();
    oscillator.type = carrierType;
    oscillator.frequency.value = carrierFreq;
    oscillator.connect(filterNode).connect(gainNode).connect(analyser).connect(audioCtx.destination);
    oscillator.start();

    lfo = audioCtx.createOscillator();
    lfo.type = 'sine';
    lfo.frequency.value = rateFromSlider(Number(rateSlider.value));

    depthGain = audioCtx.createGain();
    depthGain.gain.value = currentDepth * targetScale(currentTarget);
    lfo.connect(depthGain).connect(currentTargetParam());
    lfo.start();

    ui.startVisualizing(analyser);
  }

  ui.button.addEventListener('click', () => {
    if (oscillator) stop();
    else play();
  });

  return { stop };
}
