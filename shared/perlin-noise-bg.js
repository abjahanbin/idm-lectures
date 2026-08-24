// Animated Perlin-style (value-noise FBM) background, rendered with a
// small WebGL fragment shader. Single-pass, like voronoi-bg.js — unlike
// reaction-diffusion-bg.js, there's no simulation state to evolve, so
// motion is guaranteed every frame: uTime directly shifts the sampled
// noise field, rather than depending on a simulation happening to still
// be changing by the time someone's actually looking at the slide
// (which is what made reaction-diffusion read as "frozen" in practice).

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

// Bilinear value noise (a Perlin stand-in — same smooth, organic look,
// simpler to hand-write correctly than true gradient noise).
float valueNoise(vec2 p) {
  vec2 i = floor(p);
  vec2 f = fract(p);
  float a = hash(i);
  float b = hash(i + vec2(1.0, 0.0));
  float c = hash(i + vec2(0.0, 1.0));
  float d = hash(i + vec2(1.0, 1.0));
  vec2 u = f * f * (3.0 - 2.0 * f); // smoothstep interpolation
  return mix(mix(a, b, u.x), mix(c, d, u.x), u.y);
}

// Fractal Brownian Motion — several octaves of the same noise summed at
// increasing frequency/decreasing amplitude, for the classic marbled/
// cloud-like layered look rather than one flat noise field.
float fbm(vec2 p) {
  float value = 0.0;
  float amplitude = 0.5;
  for (int i = 0; i < 5; i++) {
    value += amplitude * valueNoise(p);
    p *= 2.0;
    amplitude *= 0.5;
  }
  return value;
}

void main() {
  vec2 uv = gl_FragCoord.xy / uResolution.xy;
  float aspect = uResolution.x / uResolution.y;
  vec2 st = vec2(uv.x * aspect, uv.y) * 3.0;

  // Two independently-drifting fbm layers (not one field sliding
  // uniformly) so it reads as flowing clouds passing over clouds,
  // rather than a static texture just translating in one direction.
  vec2 drift1 = vec2(uTime * 0.05, uTime * 0.03);
  vec2 drift2 = vec2(-uTime * 0.02, uTime * 0.045);
  float n = fbm(st + drift1) + 0.5 * fbm(st * 1.7 - drift2);
  n /= 1.5;

  // Contrast boost: push values away from the midpoint before mapping
  // to color, so more of the field lands near the flat 0/1 ends of each
  // band below instead of piling up in the middle as a soft blend.
  n = clamp((n - 0.5) * 1.6 + 0.5, 0.0, 1.0);

  // 5 flat color regions with a narrow (not band-wide) soft edge at each
  // boundary — mostly solid color, not a continuous gradient — reads as
  // noticeably higher-contrast than blending linearly across the whole
  // 0.2-wide band the way the first version of this did.
  float edge = 0.03;
  vec3 color = uColor0;
  color = mix(color, uColor1, smoothstep(0.2 - edge, 0.2 + edge, n));
  color = mix(color, uColor2, smoothstep(0.4 - edge, 0.4 + edge, n));
  color = mix(color, uColor3, smoothstep(0.6 - edge, 0.6 + edge, n));
  color = mix(color, uColor4, smoothstep(0.8 - edge, 0.8 + edge, n));

  gl_FragColor = vec4(color, 1.0);
}
`;

/**
 * Creates a fixed, fullscreen animated Perlin/FBM-noise canvas.
 * @param {string[]} colors exactly 5 hex colors, mapped across the noise
 *   gradient (uColor0..uColor4).
 * @returns {{canvas: HTMLCanvasElement, setVisible: (v: boolean) => void, setColors: (c: string[]) => void}}
 */
export function createPerlinNoiseBackground(colors) {
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
