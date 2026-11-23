import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

export default defineConfig({
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      injectRegister: 'auto',
      includeAssets: ['favicon.svg', 'icons/apple-touch-icon.png'],
      manifest: {
        name: 'FrameIt',
        short_name: 'FrameIt',
        description: 'Answer it. Frame someone. Don’t crack.',
        display: 'standalone',
        orientation: 'portrait',
        start_url: '/',
        background_color: '#0F1330',
        theme_color: '#0F1330',
        icons: [
          { src: '/icons/icon-192.png', sizes: '192x192', type: 'image/png' },
          { src: '/icons/icon-512.png', sizes: '512x512', type: 'image/png' },
        ],
      },
      workbox: {
        // Cache only the app shell. The game's WebSocket route is always network-only.
        navigateFallbackDenylist: [/^\/parties\//],
        globPatterns: ['**/*.{js,css,html,svg,png}'],
      },
    }),
  ],
  server: {
    // In dev, Vite serves the app and forwards the game socket to `wrangler dev`.
    proxy: {
      '/parties': { target: 'http://localhost:8787', ws: true },
    },
  },
});
