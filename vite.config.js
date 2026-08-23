import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  // The repository is published at https://high244.github.io/Crypto/.
  base: '/Crypto/',
  plugins: [react()],
  build: {
    // GitHub Pages publishes the committed /docs folder from main.
    outDir: 'docs',
  },
  server: {
    proxy: {
      '/binance-api': {
        target: 'https://api.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-api/, ''),
        secure: true,
      },
      '/coingecko-api': {
        target: 'https://api.coingecko.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/coingecko-api/, ''),
        secure: true,
      },
      '/binance-futures-api': {
        target: 'https://fapi.binance.com',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/binance-futures-api/, ''),
        secure: true,
      },
      '/hyperliquid-api': {
        target: 'https://api.hyperliquid.xyz',
        changeOrigin: true,
        rewrite: (path) => path.replace(/^\/hyperliquid-api/, ''),
        secure: true,
      },
    },
  },
})
