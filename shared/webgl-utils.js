// Small shared helpers for the hand-written WebGL backgrounds
// (voronoi-bg.js, reaction-diffusion-bg.js).

export function hexToRgb01(hex) {
  const n = parseInt(hex.replace('#', ''), 16);
  return [((n >> 16) & 255) / 255, ((n >> 8) & 255) / 255, (n & 255) / 255];
}

export function compileShader(gl, type, source) {
  const shader = gl.createShader(type);
  gl.shaderSource(shader, source);
  gl.compileShader(shader);
  if (!gl.getShaderParameter(shader, gl.COMPILE_STATUS)) {
    console.warn('webgl-utils: shader compile error', gl.getShaderInfoLog(shader));
    gl.deleteShader(shader);
    return null;
  }
  return shader;
}

export function linkProgram(gl, vertSrc, fragSrc) {
  const vertShader = compileShader(gl, gl.VERTEX_SHADER, vertSrc);
  const fragShader = compileShader(gl, gl.FRAGMENT_SHADER, fragSrc);
  if (!vertShader || !fragShader) return null;

  const program = gl.createProgram();
  gl.attachShader(program, vertShader);
  gl.attachShader(program, fragShader);
  gl.linkProgram(program);
  if (!gl.getProgramParameter(program, gl.LINK_STATUS)) {
    console.warn('webgl-utils: program link error', gl.getProgramInfoLog(program));
    return null;
  }
  return program;
}

// Fullscreen quad (two triangles), shared by every background — bind once,
// draw with gl.drawArrays(gl.TRIANGLES, 0, 6) after gl.useProgram(...).
export function createFullscreenQuad(gl) {
  const quad = new Float32Array([-1, -1, 1, -1, -1, 1, -1, 1, 1, -1, 1, 1]);
  const buffer = gl.createBuffer();
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  gl.bufferData(gl.ARRAY_BUFFER, quad, gl.STATIC_DRAW);
  return buffer;
}

export function bindFullscreenQuad(gl, program, buffer, attribName = 'aPosition') {
  gl.bindBuffer(gl.ARRAY_BUFFER, buffer);
  const loc = gl.getAttribLocation(program, attribName);
  gl.enableVertexAttribArray(loc);
  gl.vertexAttribPointer(loc, 2, gl.FLOAT, false, 0, 0);
}
