import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  server: {
    proxy: {
      '/binance-api': {
        target: 'https://data-api.binance.vision',
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
    },
  },
})
