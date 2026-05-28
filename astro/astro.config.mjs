// @ts-check
import { defineConfig } from 'astro/config';
import tailwindcss from '@tailwindcss/vite';
import sitemap from '@astrojs/sitemap';

// `site` is the production canonical origin. Sitemap + the SEO
// component use it to build absolute URLs for canonical, og:url,
// og:image, and the generated sitemap-index.xml.
//
// Currently prod is still served at storied-horse-0788cd.netlify.app,
// but no external traffic indexes that subdomain — by setting `site`
// to cytidel.com now, the moment DNS flips, all canonical/OG signals
// already point at the right URL.
export default defineConfig({
  site: 'https://cytidel.com',
  integrations: [sitemap()],
  vite: {
    plugins: [tailwindcss()],
  },
});
