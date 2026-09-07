import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import { VitePWA } from 'vite-plugin-pwa';

// VITE_BASE=/repo-name/ for GitHub Pages; default './' works for APK + any static host
export default defineConfig({
  base: process.env.VITE_BASE || './',
  plugins: [
    react(),
    VitePWA({
      registerType: 'autoUpdate',
      includeAssets: ['icon.svg'],
      manifest: {
        name: 'AREESE Marks',
        short_name: 'AREESE Marks',
        description: 'Marks management for JEE / NEET / Class 9-12',
        theme_color: '#14213D',
        background_color: '#F6F7F4',
        display: 'standalone',
        start_url: './',
        icons: [{ src: 'icon.svg', sizes: 'any', type: 'image/svg+xml', purpose: 'any' }]
      },
      workbox: { globPatterns: ['**/*.{js,css,html,svg,png,woff2}'] }
    })
  ],
  build: { chunkSizeWarningLimit: 1500 }
});
