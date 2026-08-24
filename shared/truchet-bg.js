// Animated Truchet-tile background, rendered with a small WebGL fragment
// shader. Same single-pass, time-drives-everything approach as
// perlin-noise-bg.js (motion comes from continuously drifting the sampled
// grid, not from any simulation state that could settle and read as
// "frozen" — see the note on reaction-diffusion-bg.js for why that
// mattered).

import { hexToRgb01, linkProgram, createFullscreenQuad, bindFullscreenQuad } from './webgl-utils.js';

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
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;

float hash(vec2 p) {
  return fract(sin(dot(p, vec2(127.1, 311.7))) * 43758.5453123);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float aspect = uResolution.x / uResolution.y;
  vec2 st = vec2(uv.x * aspect, uv.y) * 9.0;

  // Continuous diagonal drift, so the weave is always visibly moving
  // rather than depending on any per-cell state change over time.
  st += vec2(uTime * 0.4, uTime * 0.25);

  vec2 cell = floor(st);
  vec2 local = fract(st);

  // Each cell independently picks one of the two diagonal quarter-circle
  // orientations — the classic two-tile Truchet set — via a per-cell
  // hash, so neighboring tiles connect into a continuous flowing weave
  // instead of one diagonal pattern repeating identically every tile.
  float orient = hash(cell);
  vec2 cA = orient < 0.5 ? vec2(0.0, 0.0) : vec2(0.0, 1.0);
  vec2 cB = orient < 0.5 ? vec2(1.0, 1.0) : vec2(1.0, 0.0);

  float dA = distance(local, cA);
  float dB = distance(local, cB);
  float radius = 0.5;
  float edge = 0.05;

  // Two quarter-circle arcs per tile (one from each of the two opposite
  // corners for this cell's orientation) — filling the "arc" color
  // wherever a point falls inside either, and the "field" color
  // everywhere else, no third/background color needed since the two
  // regions fully tile the cell with no gaps.
  float arc = max(
    1.0 - smoothstep(radius - edge, radius + edge, dA),
    1.0 - smoothstep(radius - edge, radius + edge, dB)
  );

  // Deliberately just two colors (not all 5) — a coherent two-tone
  // weave reads far more clearly as "Truchet tiles" than a multi-color
  // jumble would. data-bg-rotate (see reveal-init.js) still gives each
  // breakout slide a visually distinct pair, since it rotates which two
  // colors land in uColor0/uColor1.
  vec3 color = mix(uColor1, uColor0, arc);

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Creates a fixed, fullscreen animated Truchet-tile canvas.
 * @param {string[]} colors exactly 5 hex colors — only the first two
 *   (uColor0/uColor1) are actually sampled by the shader, but all 5 are
 *   accepted/uploaded for a consistent setColors(...) contract with the
 *   other backgrounds, so reveal-init.js's rotatePalette(...) call works
 *   unchanged regardless of which background is active.
 * @returns {{canvas: HTMLCanvasElement, setVisible: (v: boolean) => void, setColors: (c: string[]) => void}}
 */
export function createTruchetBackground(colors) {
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
