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
  // Starter-template posts, the essays and puns were removed; keep old links working.
  redirects: {
    '/blog/first-post': '/blog',
    '/blog/second-post': '/blog',
    '/blog/third-post': '/blog',
    '/blog/markdown-style-guide': '/blog',
    '/blog/using-mdx': '/blog',
    '/blog/quantum-computing-revolution': '/blog',
    '/blog/ai-neural-networks': '/blog',
    '/blog/cybersecurity-warfare': '/blog',
    '/politics': '/blog',
    '/politics/essays': '/blog',
    '/politics/essays/democracy-in-crisis': '/blog',
    '/puns': '/blog',
  },
  vite: {
    plugins: [tailwindcss()],
    optimizeDeps: { exclude: ['@mlc-ai/web-llm', '@huggingface/transformers'] },
    worker: { format: 'es' },
  },
});
