# CONFLUX

Dashboard analisis crypto React untuk pasar Spot dan Futures/Perpetual.

## Data market

Semua permintaan pasar melewati `useMarketData(symbol, timeframe, market)` dan dinormalisasi ke satu kontrak candle sebelum chart dipakai.

| Mode | Urutan fallback |
| --- | --- |
| Spot | Binance Spot → CoinGecko |
| Futures / Perpetual | Binance Futures → CoinGecko Derivatives → Hyperliquid |

Setiap sumber diberi batas waktu singkat. Badge di toolbar menunjukkan sumber aktif; sumber Binance dan Hyperliquid memakai WebSocket untuk pembaruan live. Saat seluruh sumber tidak tersedia, data CSV manual dan data contoh tetap bisa dipakai dari tab **Analysis → CSV**.

Bybit dan OKX sengaja tidak dipanggil langsung dari browser karena tidak menjadi sumber REST client-side yang andal tanpa backend proxy.

## Menjalankan lokal

```bash
npm install
npm run dev
```

## Build GitHub Pages

```bash
npm run build
```

Vite menulis hasil build ke folder `docs/`, sesuai konfigurasi GitHub Pages repository ini.
