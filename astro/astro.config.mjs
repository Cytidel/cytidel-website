// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';

// Astro config — Tailwind v4 via the Vite plugin (no separate Astro
// integration needed in v4). Static output by default.
export default defineConfig({
  vite: {
    plugins: [tailwindcss()],
  },
});
