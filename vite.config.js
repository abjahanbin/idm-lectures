import { defineConfig } from 'vite';
import { resolve, dirname } from 'node:path';
import { fileURLToPath } from 'node:url';

const __dirname = dirname(fileURLToPath(import.meta.url));
const WEEK_COUNT = 15;
const weeks = Array.from({ length: WEEK_COUNT }, (_, i) => String(i + 1).padStart(2, '0'));

// Multi-page build: the landing page plus one entry per week's index.html.
// Vite's dev server serves any of these directly without this list; it's
// only needed so `vite build` knows to emit all of them.
export default defineConfig({
  // Relative asset paths so the built site works when served from a GitHub
  // Pages project subpath (e.g. /idm-lectures/) without hardcoding the repo
  // name here — renaming the repo later needs no config change.
  base: './',
  build: {
    rollupOptions: {
      input: {
        main: resolve(__dirname, 'index.html'),
        ...Object.fromEntries(
          weeks.map((w) => [`week${w}`, resolve(__dirname, `week${w}/index.html`)])
        ),
      },
    },
  },
});
