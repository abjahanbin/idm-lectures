// Animated Voronoi/Worley-noise background, rendered with a small WebGL
// fragment shader (no external library). One canvas is created and reused
// for the whole deck; reveal-init.js toggles it on/off per slide via
// setVisible() and only shows it behind the title slide + movement
// dividers (see .divider-bg / .divider in theme.css and week01/index.html).

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

vec2 hash2(vec2 p) {
  p = vec2(dot(p, vec2(127.1, 311.7)), dot(p, vec2(269.5, 183.3)));
  return fract(sin(p) * 43758.5453123);
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float aspect = uResolution.x / uResolution.y;

  // Slow overall drift so the whole field flows in one direction, on top
  // of each cell's own independent wobble below — reads more like a
  // current than a static grid breathing in place.
  vec2 drift = vec2(uTime * 0.025, uTime * 0.015);
  vec2 st = vec2(uv.x * aspect, uv.y) * 9.0 + drift;

  vec2 i_st = floor(st);
  vec2 f_st = fract(st);

  float minDist = 10.0;
  float minDist2 = 10.0; // distance to the second-nearest seed point
  float cellId = 0.0;

  for (int y = -1; y <= 1; y++) {
    for (int x = -1; x <= 1; x++) {
      vec2 neighbor = vec2(float(x), float(y));
      vec2 cell = i_st + neighbor;
      vec2 h = hash2(cell);

      // Per-cell frequency and independent x/y phases (instead of one
      // shared frequency for every cell) so seed points trace small
      // elliptical loops out of sync with each other, rather than the
      // whole field pulsing in lockstep.
      float freq = 0.10 + 0.14 * h.x;
      vec2 phase = 6.2831853 * h;
      vec2 offset = vec2(
        0.5 + 0.5 * sin(uTime * freq + phase.x),
        0.5 + 0.5 * cos(uTime * freq * 1.3 + phase.y)
      );

      vec2 point = neighbor + offset - f_st;
      float dist = length(point);
      if (dist < minDist) {
        minDist2 = minDist;
        minDist = dist;
        cellId = h.x;
      } else if (dist < minDist2) {
        minDist2 = dist;
      }
    }
  }

  vec3 color = uColor0;
  if (cellId > 0.2 && cellId <= 0.4) color = uColor1;
  else if (cellId > 0.4 && cellId <= 0.6) color = uColor2;
  else if (cellId > 0.6 && cellId <= 0.8) color = uColor3;
  else if (cellId > 0.8) color = uColor4;

  // A true cell boundary is where the nearest and second-nearest seed
  // points are roughly equidistant — not wherever minDist itself is
  // small (that's the seed point's own location, which produced a
  // small dark dot at each cell's center instead of an edge line).
  float edge = smoothstep(0.0, 0.04, minDist2 - minDist);
  color *= mix(0.92, 1.0, edge);

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Creates a fixed, fullscreen animated Voronoi-noise canvas.
 * @param {string[]} colors exactly 5 hex colors used for the cells — the
 *   shader's cellId bucketing (uColor0..uColor4) is fixed at 5 slots.
 * @returns {{canvas: HTMLCanvasElement, setVisible: (v: boolean) => void, setColors: (c: string[]) => void}}
 */
export function createVoronoiBackground(colors) {
  const canvas = document.createElement('canvas');
  canvas.className = 'divider-bg';

  const noop = { canvas, setVisible() {}, setColors() {} };

  const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
  if (!gl) return noop; // No WebGL — degrade silently, canvas just stays hidden.

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
