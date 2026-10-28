import { defineConfig } from 'astro/config';
import mdx from '@astrojs/mdx';
import sitemap from '@astrojs/sitemap';
import cloudflare from '@astrojs/cloudflare';
import react from '@astrojs/react';
import tailwindcss from '@tailwindcss/vite';
export default defineConfig({
  site: 'https://mihirkarbelkar.com',
  integrations: [mdx(), sitemap(), react()],
  session: { driver: 'memory' },
  adapter: cloudflare({
    imageService: 'passthrough',
    platformProxy: { enabled: true },
  }),
  output: 'server',
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ['@mlc-ai/web-llm', '@huggingface/transformers'] },
    worker: { format: 'es' },
  },
});
