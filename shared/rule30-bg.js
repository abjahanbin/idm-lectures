// Animated Rule 30 elementary-cellular-automaton background. Unlike the
// other shaders here (voronoi/perlin/truchet), this one isn't a pure
// formula of (position, time) — Rule 30 has no closed form, each row
// genuinely depends on simulating every row above it. So the CA is
// precomputed once on the CPU into a lookup texture, and the shader just
// scrolls through it. This still keeps the "no per-frame simulation state
// to settle/freeze" property that matters here (see the reaction-diffusion
// background's rejection note in reveal-init.js): the whole texture is
// static, computed once, and motion comes from continuously scrolling
// through it — nothing ever converges to a fixed point.
//
// The grid is a ring (wraparound neighbors), not an infinite line, so a
// single seed cell's light cone eventually wraps around and interacts
// with itself — which is exactly what keeps Rule 30 chaotic indefinitely
// rather than the wave just spreading out and thinning into stillness.
//
// (A two-layer version of this — two independently-drifting CA rings
// combined into a third color where they disagree, same trick as
// perlin-noise-bg.js's two FBM layers — was tried and worked, but read
// as too busy/"trippy" for a title slide. Single layer, drift direction
// randomized per page load so it's not a fixed diagonal every visit.)
//
// GRID_HEIGHT rows are precomputed and the scroll wraps via gl.REPEAT —
// the buffer isn't temporally periodic, so wrapping does produce a
// one-frame seam, but at GRID_HEIGHT rows and a slow scroll that's on
// the order of ~20 minutes between seams, i.e. not something a lecture
// slide will ever sit on long enough to hit.

import {
  hexToRgb01,
  linkProgram,
  createFullscreenQuad,
  bindFullscreenQuad,
  createDataTexture,
} from './webgl-utils.js';

// Both powers of two — required for gl.REPEAT wrapping in WebGL1.
const GRID_WIDTH = 256;
const GRID_HEIGHT = 4096;

// Real Rule 30: next(x) = left XOR (center OR right). Seeded with a
// single live cell so the classic chaotic triangle grows from a point,
// same as the standard "Rule 30 from one cell" imagery.
function computeRule30Texture(width, height, seedColumn) {
  const data = new Uint8Array(width * height);
  let row = new Uint8Array(width);
  row[seedColumn] = 1;

  for (let y = 0; y < height; y++) {
    for (let x = 0; x < width; x++) {
      data[y * width + x] = row[x] ? 255 : 0;
    }
    const next = new Uint8Array(width);
    for (let x = 0; x < width; x++) {
      const left = row[(x - 1 + width) % width];
      const center = row[x];
      const right = row[(x + 1) % width];
      next[x] = (left ^ (center | right)) & 1;
    }
    row = next;
  }
  return data;
}

const VERT_SRC = `
attribute vec2 aPosition;
void main() {
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const FRAG_SRC = `
precision mediump float;
uniform vec2 uResolution;
uniform float uTime;
uniform sampler2D uGrid;
uniform vec3 uColor0;
uniform vec3 uColor1;

// Randomized once per page load in JS (see createRule30Background) rather
// than hardcoded here — a fixed diagonal always looks the same on every
// visit, which reads as mechanical.
uniform vec2 uDrift;
uniform float uStartRow;

const float GRID_WIDTH = ${GRID_WIDTH.toFixed(1)};
const float GRID_HEIGHT = ${GRID_HEIGHT.toFixed(1)};
const float CELLS_ACROSS = 48.0;

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float aspect = uResolution.x / uResolution.y;
  vec2 st = vec2(uv.x * aspect, uv.y) * CELLS_ACROSS;

  // Continuous drift through the precomputed row history — motion never
  // depends on any state that could settle. The seed cell sits at one
  // column of the ring, so early rows (near the top of the precomputed
  // buffer) are still a thin, mostly-empty triangle near that column —
  // uStartRow pushes the view deep enough into the buffer that the wave
  // has already wrapped around the ring at least once, so it's dense
  // from the start regardless of which columns are in view (past that
  // point the whole width is chaotically filled — see the file header).
  vec2 driven = st + uDrift * uTime;
  driven.y += uStartRow;

  vec2 gridUv = vec2(driven.x / GRID_WIDTH, driven.y / GRID_HEIGHT);
  float cell = texture2D(uGrid, gridUv).r;

  vec3 color = mix(uColor0, uColor1, cell);
  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Creates a fixed, fullscreen animated Rule 30 canvas.
 * @param {string[]} colors exactly 5 hex colors — only the first two
 *   (uColor0/uColor1) are sampled, but all 5 are accepted/uploaded for a
 *   consistent setColors(...) contract with the other backgrounds, so
 *   reveal-init.js's rotatePalette(...) call works unchanged regardless
 *   of which background is active.
 * @returns {{canvas: HTMLCanvasElement, setVisible: (v: boolean) => void, setColors: (c: string[]) => void}}
 */
export function createRule30Background(colors) {
  const canvas = document.createElement('canvas');
  canvas.className = 'divider-bg';

  const noop = { canvas, setVisible() {}, setColors() {} };

  const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
  if (!gl) return noop;

  const program = linkProgram(gl, VERT_SRC, FRAG_SRC);
  if (!program) return noop;
  gl.useProgram(program);

  const quadBuffer = createFullscreenQuad(gl);
  bindFullscreenQuad(gl, program, quadBuffer);

  // Seed column randomized (not fixed) so the pattern itself, not just
  // its motion, differs from visit to visit.
  const seedColumn = Math.floor(Math.random() * GRID_WIDTH);
  const gridTexture = createDataTexture(gl, GRID_WIDTH, GRID_HEIGHT, computeRule30Texture(GRID_WIDTH, GRID_HEIGHT, seedColumn));
  const uGrid = gl.getUniformLocation(program, 'uGrid');
  gl.activeTexture(gl.TEXTURE0);
  gl.bindTexture(gl.TEXTURE_2D, gridTexture);
  gl.uniform1i(uGrid, 0);

  // Randomized once per page load — see the uDrift comment in FRAG_SRC.
  function randRange(min, max) {
    return min + Math.random() * (max - min);
  }
  const angle = randRange(0, Math.PI * 2);
  const speed = randRange(2.0, 3.5);
  const drift = [Math.cos(angle) * speed, Math.sin(angle) * speed];
  // Just needs to clear the "ring has wrapped at least once" floor (see
  // the FRAG_SRC comment) with room in GRID_HEIGHT left before it wraps.
  const startRow = randRange(200, 1200);

  const uDrift = gl.getUniformLocation(program, 'uDrift');
  const uStartRow = gl.getUniformLocation(program, 'uStartRow');
  gl.uniform2f(uDrift, drift[0], drift[1]);
  gl.uniform1f(uStartRow, startRow);

  const uResolution = gl.getUniformLocation(program, 'uResolution');
  const uTime = gl.getUniformLocation(program, 'uTime');
  const colorUniforms = colors.map((_, i) => gl.getUniformLocation(program, `uColor${i}`));

  function applyColors(hexColors) {
    hexColors.forEach((hex, i) => {
      const [r, g, b] = hexToRgb01(hex);
      gl.uniform3f(colorUniforms[i], r, g, b);
    });
  }
  applyColors(colors);

  function resize() {
    const dpr = Math.min(window.devicePixelRatio || 1, 2);
    const w = Math.floor(window.innerWidth * dpr);
    const h = Math.floor(window.innerHeight * dpr);
    if (canvas.width !== w || canvas.height !== h) {
      canvas.width = w;
      canvas.height = h;
      gl.viewport(0, 0, w, h);
    }
  }
  window.addEventListener('resize', resize);
  resize();

  const start = performance.now();
  let visible = false;
  let raf = null;

  function frame(now) {
    resize();
    gl.uniform2f(uResolution, canvas.width, canvas.height);
    gl.uniform1f(uTime, (now - start) / 1000);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
    if (visible) raf = requestAnimationFrame(frame);
  }

  return {
    canvas,
    setVisible(next) {
      if (next === visible) return;
      visible = next;
      canvas.classList.toggle('is-visible', visible);
      if (visible && raf === null) raf = requestAnimationFrame(frame);
      if (!visible && raf !== null) {
        cancelAnimationFrame(raf);
        raf = null;
      }
    },
    setColors(next) {
      applyColors(next);
    },
  };
}
