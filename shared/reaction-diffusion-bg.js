// Animated Gray-Scott reaction-diffusion background. Unlike voronoi-bg.js
// (a closed-form formula evaluated fresh each pixel each frame), this is
// an actual simulation: two chemical concentrations (U, V) diffuse and
// react across a grid every step, which is what produces the organic,
// slowly-growing coral/spot patterns. That needs a ping-pong pair of
// off-screen framebuffers (read the last step's state, write the next
// one, swap) — there's no way to do this in a single pass.

import { hexToRgb01, linkProgram, createFullscreenQuad, bindFullscreenQuad } from './webgl-utils.js';

// Simulation runs at a fixed, modest resolution independent of the
// display canvas — the patterns are inherently coarse/blob-shaped, so
// there's nothing to gain from simulating at full display resolution,
// and every extra pixel costs one more Laplacian sample per step.
const SIM_SIZE = 220;
const STEPS_PER_FRAME = 14;

// Classic Gray-Scott "coral growth" preset.
const DIFFUSION_U = 0.2097;
const DIFFUSION_V = 0.105;
const FEED_RATE = 0.0545;
const KILL_RATE = 0.062;

const VERT_SRC = `
attribute vec2 aPosition;
varying vec2 vUv;
void main() {
  vUv = aPosition * 0.5 + 0.5;
  gl_Position = vec4(aPosition, 0.0, 1.0);
}
`;

const SIM_FRAG_SRC = `
precision highp float;
uniform sampler2D uState;
uniform vec2 uTexel;
uniform float uDu;
uniform float uDv;
uniform float uFeed;
uniform float uKill;
varying vec2 vUv;

void main() {
  vec2 uv = texture2D(uState, vUv).rg;

  // 9-point Laplacian (orthogonal neighbors weighted 1, diagonals 0.5,
  // center -6) — a standard stencil for smoother, less axis-aligned
  // diffusion than a plain 4-neighbor cross.
  vec2 lap = vec2(0.0);
  lap += texture2D(uState, vUv + vec2(-uTexel.x, 0.0)).rg;
  lap += texture2D(uState, vUv + vec2( uTexel.x, 0.0)).rg;
  lap += texture2D(uState, vUv + vec2(0.0, -uTexel.y)).rg;
  lap += texture2D(uState, vUv + vec2(0.0,  uTexel.y)).rg;
  lap += texture2D(uState, vUv + vec2(-uTexel.x, -uTexel.y)).rg * 0.5;
  lap += texture2D(uState, vUv + vec2( uTexel.x, -uTexel.y)).rg * 0.5;
  lap += texture2D(uState, vUv + vec2(-uTexel.x,  uTexel.y)).rg * 0.5;
  lap += texture2D(uState, vUv + vec2( uTexel.x,  uTexel.y)).rg * 0.5;
  lap -= uv * 6.0;

  float u = uv.x;
  float v = uv.y;
  float reaction = u * v * v;

  float du = uDu * lap.x - reaction + uFeed * (1.0 - u);
  float dv = uDv * lap.y + reaction - (uFeed + uKill) * v;

  gl_FragColor = vec4(clamp(uv + vec2(du, dv), 0.0, 1.0), 0.0, 1.0);
}
`;

// Maps the V concentration to the 5-color palette across 4 blended
// bands, rather than a hard cutoff — reads as one continuous gradient
// following the pattern's growth, not flat regions.
const DISPLAY_FRAG_SRC = `
precision highp float;
uniform sampler2D uState;
uniform vec3 uColor0;
uniform vec3 uColor1;
uniform vec3 uColor2;
uniform vec3 uColor3;
uniform vec3 uColor4;
varying vec2 vUv;

void main() {
  float v = texture2D(uState, vUv).g;
  vec3 color;
  if (v < 0.12) {
    color = uColor0;
  } else if (v < 0.24) {
    color = mix(uColor0, uColor1, (v - 0.12) / 0.12);
  } else if (v < 0.36) {
    color = mix(uColor1, uColor2, (v - 0.24) / 0.12);
  } else if (v < 0.48) {
    color = mix(uColor2, uColor3, (v - 0.36) / 0.12);
  } else {
    color = mix(uColor3, uColor4, clamp((v - 0.48) / 0.2, 0.0, 1.0));
  }
  gl_FragColor = vec4(color, 1.0);
}
`;

function createSimTexture(gl, size, initialData) {
  const texture = gl.createTexture();
  gl.bindTexture(gl.TEXTURE_2D, texture);
  gl.texImage2D(gl.TEXTURE_2D, 0, gl.RGBA, size, size, 0, gl.RGBA, gl.UNSIGNED_BYTE, initialData);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_S, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_WRAP_T, gl.CLAMP_TO_EDGE);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MIN_FILTER, gl.LINEAR);
  gl.texParameteri(gl.TEXTURE_2D, gl.TEXTURE_MAG_FILTER, gl.LINEAR);
  return texture;
}

function createFramebuffer(gl, texture) {
  const fbo = gl.createFramebuffer();
  gl.bindFramebuffer(gl.FRAMEBUFFER, fbo);
  gl.framebufferTexture2D(gl.FRAMEBUFFER, gl.COLOR_ATTACHMENT0, gl.TEXTURE_2D, texture, 0);
  gl.bindFramebuffer(gl.FRAMEBUFFER, null);
  return fbo;
}

// U=1, V=0 everywhere except a handful of random seed blobs (V=1 inside
// them) — Gray-Scott needs a perturbation to kick off pattern growth;
// a uniform starting state never spontaneously develops one. Several
// scattered blobs (rather than one center dot) fill the frame with
// visible pattern activity in a presentable amount of time.
function createSeedData(size) {
  const data = new Uint8Array(size * size * 4);
  for (let i = 0; i < size * size; i++) {
    data[i * 4] = 255; // U = 1.0
    data[i * 4 + 1] = 0; // V = 0.0
    data[i * 4 + 2] = 0;
    data[i * 4 + 3] = 255;
  }

  const blobCount = 6;
  for (let b = 0; b < blobCount; b++) {
    const cx = Math.random() * size;
    const cy = Math.random() * size;
    const r = size * (0.04 + Math.random() * 0.03);
    const minX = Math.max(0, Math.floor(cx - r));
    const maxX = Math.min(size - 1, Math.ceil(cx + r));
    const minY = Math.max(0, Math.floor(cy - r));
    const maxY = Math.min(size - 1, Math.ceil(cy + r));
    for (let y = minY; y <= maxY; y++) {
      for (let x = minX; x <= maxX; x++) {
        const dx = x - cx;
        const dy = y - cy;
        if (dx * dx + dy * dy <= r * r) {
          const idx = (y * size + x) * 4;
          data[idx] = 0; // U = 0
          data[idx + 1] = 255; // V = 1.0
        }
      }
    }
  }

  return data;
}

/**
 * Creates a fixed, fullscreen animated reaction-diffusion canvas.
 * @param {string[]} colors exactly 5 hex colors, mapped across the
 *   concentration gradient (uColor0..uColor4).
 * @returns {{canvas: HTMLCanvasElement, setVisible: (v: boolean) => void, setColors: (c: string[]) => void}}
 */
export function createReactionDiffusionBackground(colors) {
  const canvas = document.createElement('canvas');
  canvas.className = 'divider-bg';

  const noop = { canvas, setVisible() {}, setColors() {} };

  const gl = canvas.getContext('webgl', { antialias: true }) || canvas.getContext('experimental-webgl');
  if (!gl) return noop;

  const simProgram = linkProgram(gl, VERT_SRC, SIM_FRAG_SRC);
  const displayProgram = linkProgram(gl, VERT_SRC, DISPLAY_FRAG_SRC);
  if (!simProgram || !displayProgram) return noop;

  const quadBuffer = createFullscreenQuad(gl);

  // Ping-pong pair: each step reads one texture's framebuffer and
  // writes into the other, then they swap roles.
  const seedData = createSeedData(SIM_SIZE);
  let readTex = createSimTexture(gl, SIM_SIZE, seedData);
  let writeTex = createSimTexture(gl, SIM_SIZE, null);
  let readFbo = createFramebuffer(gl, readTex);
  let writeFbo = createFramebuffer(gl, writeTex);

  const simUniforms = {
    uState: gl.getUniformLocation(simProgram, 'uState'),
    uTexel: gl.getUniformLocation(simProgram, 'uTexel'),
    uDu: gl.getUniformLocation(simProgram, 'uDu'),
    uDv: gl.getUniformLocation(simProgram, 'uDv'),
    uFeed: gl.getUniformLocation(simProgram, 'uFeed'),
    uKill: gl.getUniformLocation(simProgram, 'uKill'),
  };

  const displayUniforms = {
    uState: gl.getUniformLocation(displayProgram, 'uState'),
    colors: colors.map((_, i) => gl.getUniformLocation(displayProgram, `uColor${i}`)),
  };

  function applyColors(hexColors) {
    gl.useProgram(displayProgram);
    hexColors.forEach((hex, i) => {
      const [r, g, b] = hexToRgb01(hex);
      gl.uniform3f(displayUniforms.colors[i], r, g, b);
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
    }
  }
  window.addEventListener('resize', resize);
  resize();

  function simStep() {
    gl.useProgram(simProgram);
    bindFullscreenQuad(gl, simProgram, quadBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, writeFbo);
    gl.viewport(0, 0, SIM_SIZE, SIM_SIZE);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform1i(simUniforms.uState, 0);
    gl.uniform2f(simUniforms.uTexel, 1 / SIM_SIZE, 1 / SIM_SIZE);
    gl.uniform1f(simUniforms.uDu, DIFFUSION_U);
    gl.uniform1f(simUniforms.uDv, DIFFUSION_V);
    gl.uniform1f(simUniforms.uFeed, FEED_RATE);
    gl.uniform1f(simUniforms.uKill, KILL_RATE);
    gl.drawArrays(gl.TRIANGLES, 0, 6);

    // Swap read/write roles for the next step.
    [readTex, writeTex] = [writeTex, readTex];
    [readFbo, writeFbo] = [writeFbo, readFbo];
  }

  function drawDisplay() {
    gl.useProgram(displayProgram);
    bindFullscreenQuad(gl, displayProgram, quadBuffer);
    gl.bindFramebuffer(gl.FRAMEBUFFER, null);
    gl.viewport(0, 0, canvas.width, canvas.height);
    gl.activeTexture(gl.TEXTURE0);
    gl.bindTexture(gl.TEXTURE_2D, readTex);
    gl.uniform1i(displayUniforms.uState, 0);
    gl.drawArrays(gl.TRIANGLES, 0, 6);
  }

  let visible = false;
  let raf = null;

  function frame() {
    resize();
    for (let i = 0; i < STEPS_PER_FRAME; i++) simStep();
    drawDisplay();
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
