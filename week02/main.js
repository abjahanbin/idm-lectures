import { initReveal } from '../shared/reveal-init.js';

initReveal();

// --- Boids algorithm diagram ---------------------------------------------

function initBoidsPhoto() {
  const imageEl = document.getElementById('boids-image');
  if (!imageEl) return;

  // Source file is 651x180 — matches its real ratio exactly, same reason
  // as week01's initOramPhoto/initDawPhoto (background-size:cover never
  // needs to crop).
  imageEl.style.aspectRatio = '651 / 180';
  imageEl.style.backgroundImage = `url("${new URL('./assets/boids/0_GeU10W646CDVrNFv.jpg', import.meta.url).href}")`;
}

initBoidsPhoto();
