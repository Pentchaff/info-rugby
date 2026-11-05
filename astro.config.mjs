import { defineConfig } from 'astro/config';

export default defineConfig({
  site: 'https://pentchaff.github.io',
  base: '/info-rugby',
  trailingSlash: 'always',
  build: { format: 'directory' },
});
