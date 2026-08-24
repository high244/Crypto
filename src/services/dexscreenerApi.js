const BASE_URL = import.meta.env?.DEV
  ? '/dexscreener-api/latest/dex'
  : 'https://api.dexscreener.com/latest/dex';

/**
 * Search on-chain token pairs across all DEXes (Solana, Base, Ethereum, HyperEVM, etc.).
 * Returns rapid price and liquidity data with ~1 min or sub-minute freshness.
 */
export async function searchDexScreener(query, { signal } = {}) {
  const trimmed = String(query || '').trim();
  if (!trimmed || trimmed.length < 2) return [];

  try {
    const response = await fetch(`${BASE_URL}/search?q=${encodeURIComponent(trimmed)}`, { signal });
    if (!response.ok) return [];
    const data = await response.json();
    const pairs = Array.isArray(data?.pairs) ? data.pairs : [];

    return pairs
      .filter((pair) => pair?.baseToken?.symbol && pair?.priceUsd)
      .map((pair) => ({
        id: `dex_${pair.chainId}_${pair.pairAddress}`,
        pairAddress: pair.pairAddress,
        chainId: pair.chainId,
        dexId: pair.dexId,
        symbol: `${pair.baseToken.symbol.toUpperCase()}USD`,
        baseAsset: pair.baseToken.symbol.toUpperCase(),
        quoteAsset: pair.quoteToken?.symbol?.toUpperCase() || 'USD',
        name: pair.baseToken.name || pair.baseToken.symbol,
        priceUsd: Number(pair.priceUsd) || 0,
        change24h: Number(pair.priceChange?.h24) || 0,
        volume24h: Number(pair.volume?.h24) || 0,
        liquidityUsd: Number(pair.liquidity?.usd) || 0,
        url: pair.url,
        source: 'dexscreener',
      }))
      .slice(0, 30);
  } catch (error) {
    if (error?.name === 'AbortError') return [];
    console.warn('DexScreener search error:', error);
    return [];
  }
}

/**
 * Fetch detailed pair data by chain and pair address.
 */
export async function fetchDexPair(chainId, pairAddress, { signal } = {}) {
  const response = await fetch(`${BASE_URL}/pairs/${chainId}/${pairAddress}`, { signal });
  if (!response.ok) throw new Error(`DexScreener HTTP ${response.status}`);
  const data = await response.json();
  const pair = data?.pairs?.[0] || data?.pair;
  if (!pair) throw new Error('DexScreener: Pair tidak ditemukan.');

  return {
    symbol: `${pair.baseToken?.symbol?.toUpperCase()}USD`,
    baseAsset: pair.baseToken?.symbol?.toUpperCase(),
    quoteAsset: pair.quoteToken?.symbol?.toUpperCase(),
    name: pair.baseToken?.name || pair.baseToken?.symbol,
    priceUsd: Number(pair.priceUsd) || 0,
    open: (Number(pair.priceUsd) || 0) / (1 + (Number(pair.priceChange?.h24) || 0) / 100),
    close: Number(pair.priceUsd) || 0,
    change: (Number(pair.priceUsd) || 0) - ((Number(pair.priceUsd) || 0) / (1 + (Number(pair.priceChange?.h24) || 0) / 100)),
    changePct: Number(pair.priceChange?.h24) || 0,
    volume: Number(pair.volume?.h24) || 0,
    quoteVolume: Number(pair.volume?.h24) || 0,
    liquidityUsd: Number(pair.liquidity?.usd) || 0,
    url: pair.url,
    chainId: pair.chainId,
    dexId: pair.dexId,
  };
}
