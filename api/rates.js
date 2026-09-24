const axios = require("axios");

console.log("Executing api/rates.js with Final Hybrid API (CriptoYa + CoinGecko)");

// URLs de las APIs
const CRIPTOYA_API_BASE_URL = "https://criptoya.com/api";
const COINGECKO_API_URL = "https://api.coingecko.com/api/v3/simple/price";
const BINANCE_SPOT_PRICE_URL = "https://api.binance.com/api/v3/ticker/price";
const BINANCE_P2P_SEARCH_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";
const BYBIT_TICKER_URL = "https://api.bybit.com/v5/market/tickers";
const GATE_TICKER_URL = "https://api.gateio.ws/api/v4/spot/tickers";

// Tasas de Referencia Fijas (Fallback)
const FALLBACK_RATES = {
  WLD_to_USDT: 1.19,
  USDT_to_CLP_P2P: 963.00,
  VES_to_USDT_P2P: 36.00,
};

const RATES_CACHE_TTL_MS = 60_000;
let ratesCache = null;

const toNumber = (value) => {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
};

const sleep = (ms) => new Promise((resolve) => setTimeout(resolve, ms));

function getBinanceProxyConfig() {
  const url = process.env.BINANCE_PROXY_URL;
  const token = process.env.VPS_AUTH_TOKEN;
  if (url && !token) {
    console.warn("BINANCE_PROXY_URL está configurado sin VPS_AUTH_TOKEN; se usará la API directa.");
    return null;
  }
  return url ? { url: url.replace(/\/$/, ""), token } : null;
}

function getPositiveRate(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) && parsed > 0 ? parsed : null;
}

// Bancos venezolanos y métodos de transferencia bancaria más comunes en Binance P2P VES
const PAYMENT_METHOD_BANK_TRANSFER_REGEX = /(bank|banc|transfer|transferencia|mercantil|banesco|provincial|venezuela|bnc|bangente|fondo|bicentenario|sofitasa|activo|tesoro|exterior|plaza|agricola|agrícola|caribe|occidental|mibanco|mi\s*banco|100\s*%)/i;
const VES_SELL_TARGET_AMOUNT = "50000";
const VES_SELL_PAY_TYPES = ["BANK"];
const VES_SELL_CRYPTOYA_ADJUSTMENT = 0.008;

const hasBankTransferMethod = (row) => {
  const methods = Array.isArray(row?.adv?.tradeMethods) ? row.adv.tradeMethods : [];
  return methods.some((method) => {
    const name = `${method?.tradeMethodName || ""} ${method?.identifier || ""}`;
    return PAYMENT_METHOD_BANK_TRANSFER_REGEX.test(name);
  });
};

const canCoverTargetAmount = (row, targetAmount) => {
  const min = toNumber(row?.adv?.minSingleTransAmount);
  const max = toNumber(row?.adv?.dynamicMaxSingleTransAmount || row?.adv?.maxSingleTransAmount);
  if (targetAmount <= 0) return true;
  if (min > 0 && targetAmount < min) return false;
  if (max > 0 && targetAmount > max) return false;
  return true;
};

const pickBestMatchingOffer = (rows, { targetAmount, requireBankLikeMethod = false }) => {
  const filteredRows = rows.filter((row) => {
    if (!canCoverTargetAmount(row, targetAmount)) return false;
    if (requireBankLikeMethod && !hasBankTransferMethod(row)) return false;
    return true;
  });

  return filteredRows[0] || null;
};

async function getBinanceP2POffers({ fiat, tradeType, rows = 20, payTypes = [], transAmount = "" }) {
  try {
    const payload = {
      page: 1,
      rows,
      payTypes,
      countries: [],
      publisherType: null,
      asset: "USDT",
      fiat,
      tradeType,
      transAmount,
    };

    const proxy = getBinanceProxyConfig();
    const url = proxy
      ? `${proxy.url}/api/proxy/p2p`
      : BINANCE_P2P_SEARCH_URL;

    const headers = {
        "Content-Type": "application/json",
        "User-Agent": "Mozilla/5.0",
    };
    if (proxy) headers["x-vps-token"] = proxy.token;

    const response = await axios.post(url, payload, {
      timeout: 10000,
      headers
    });

    return Array.isArray(response.data?.data) ? response.data.data : [];
  } catch (error) {
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : "";
    console.error(`Error Binance P2P ${tradeType} ${fiat}: ${error.message}${suffix}`);
    return [];
  }
}

async function getBinanceP2POffersWithRetry(options, attempts = 2, delayMs = 250) {
  for (let attempt = 1; attempt <= attempts; attempt += 1) {
    const rows = await getBinanceP2POffers(options);
    if (rows.length > 0) {
      return rows;
    }

    if (attempt < attempts) {
      await sleep(delayMs);
    }
  }

  return [];
}

async function getBinanceVesSellRate() {
  const targetAmount = toNumber(VES_SELL_TARGET_AMOUNT);

  // 1. Intentar primero con Banco de Venezuela, tomando el 5to vendedor (índice 4)
  const bdvRows = await getBinanceP2POffersWithRetry({
    fiat: "VES",
    tradeType: "SELL",
    rows: 50,
    payTypes: ["BancoDeVenezuela"],
    transAmount: VES_SELL_TARGET_AMOUNT,
  });
  
  const filteredBdvRows = bdvRows.filter((row) => canCoverTargetAmount(row, targetAmount));
  if (filteredBdvRows.length >= 5) {
    return {
      rate: toNumber(filteredBdvRows[4].adv?.price),
      source: `Binance P2P SELL (BDV 5th, ${VES_SELL_TARGET_AMOUNT} VES)`,
    };
  }

  // 2. Si no hay 5to vendedor de BDV, pasamos a Transferencia Bancaria (BANK)
  const exactBankRows = await getBinanceP2POffersWithRetry({
    fiat: "VES",
    tradeType: "SELL",
    rows: 50,
    payTypes: VES_SELL_PAY_TYPES,
    transAmount: VES_SELL_TARGET_AMOUNT,
  });
  const exactBankMatch = pickBestMatchingOffer(exactBankRows, { targetAmount });
  if (exactBankMatch) {
    return {
      rate: toNumber(exactBankMatch.adv?.price),
      source: `Binance P2P SELL (Bank Transfer, ${VES_SELL_TARGET_AMOUNT} VES)`,
    };
  }

  const broadRows = await getBinanceP2POffersWithRetry({
    fiat: "VES",
    tradeType: "SELL",
    rows: 50,
    transAmount: VES_SELL_TARGET_AMOUNT,
  });
  const broadBankMatch = pickBestMatchingOffer(broadRows, { targetAmount, requireBankLikeMethod: true });
  if (broadBankMatch) {
    return {
      rate: toNumber(broadBankMatch.adv?.price),
      source: `Binance P2P SELL (Bank-like fallback, ${VES_SELL_TARGET_AMOUNT} VES)`,
    };
  }

  // Ultimo intento: sin transAmount en la request, pero validando localmente que la oferta cubra 50000 VES.
  const unboundedBankRows = await getBinanceP2POffersWithRetry({
    fiat: "VES",
    tradeType: "SELL",
    rows: 50,
    payTypes: VES_SELL_PAY_TYPES,
  });
  const unboundedBankMatch = pickBestMatchingOffer(unboundedBankRows, { targetAmount });
  if (unboundedBankMatch) {
    return {
      rate: toNumber(unboundedBankMatch.adv?.price),
      source: `Binance P2P SELL (Bank Transfer fallback, covers ${VES_SELL_TARGET_AMOUNT} VES)`,
    };
  }

  const unboundedRows = await getBinanceP2POffersWithRetry({
    fiat: "VES",
    tradeType: "SELL",
    rows: 50,
  });
  const unboundedBankLikeMatch = pickBestMatchingOffer(unboundedRows, { targetAmount, requireBankLikeMethod: true });
  if (unboundedBankLikeMatch) {
    return {
      rate: toNumber(unboundedBankLikeMatch.adv?.price),
      source: `Binance P2P SELL (Bank-like unbounded fallback, covers ${VES_SELL_TARGET_AMOUNT} VES)`,
    };
  }

  const unboundedAnyMatch = pickBestMatchingOffer(unboundedRows, { targetAmount });
  if (unboundedAnyMatch) {
    return {
      rate: toNumber(unboundedAnyMatch.adv?.price),
      source: `Binance P2P SELL (Unbounded fallback, covers ${VES_SELL_TARGET_AMOUNT} VES)`,
    };
  }

  console.warn(`VES SELL: Binance no devolvió ofertas utilizables para ${VES_SELL_TARGET_AMOUNT} VES.`);
  return {
    rate: 0,
    source: null,
  };
}

async function getBinanceP2PSixthRates() {
  const [clpBuyRows, vesSell] = await Promise.all([
    getBinanceP2POffersWithRetry({ fiat: "CLP", tradeType: "BUY" }),
    getBinanceVesSellRate(),
  ]);

  return {
    clpBuy6: getPositiveRate(clpBuyRows[5]?.adv?.price),
    vesSell6Bank: getPositiveRate(vesSell.rate),
    vesSellSource: vesSell.rate > 0 ? vesSell.source : null,
  };
}

/**
 * Obtiene la tasa P2P de Binance a través de la API de CriptoYa.
 */
const adjustVesCriptoYaRate = (rate) => {
  if (!rate) return null;
  return rate * (1 - VES_SELL_CRYPTOYA_ADJUSTMENT);
};

async function getCriptoYaP2PRate(fiat, volume = 1) {
  try {
    // URL CORRECTA: /api/binancep2p/{coin_to_buy}/{fiat_to_pay_with}/{volume}
    const url = `${CRIPTOYA_API_BASE_URL}/binancep2p/usdt/${fiat.toLowerCase()}/${volume}`;
    const response = await axios.get(url, { timeout: 7000 });
    // CriptoYa devuelve el precio de COMPRA (ask) para el usuario.
    if (response.data && response.data.ask) {
      return getPositiveRate(response.data.ask);
    }
    console.warn(`Respuesta inesperada de CriptoYa para ${fiat}:`, response.data);
    return null;
  } catch (error) {
    console.error(`Error al obtener tasa de CriptoYa para ${fiat}:`, error.message);
    return null;
  }
}

/**
 * Obtiene el precio spot WLD/USDT desde Binance.
 */
async function getBinanceSpotRate(symbol) {
  try {
    const proxy = getBinanceProxyConfig();
    const url = proxy
      ? `${proxy.url}/api/proxy/spot`
      : BINANCE_SPOT_PRICE_URL;

    const headers = proxy ? { "x-vps-token": proxy.token } : {};

    const response = await axios.get(url, {
      params: { symbol },
      timeout: 7000,
      headers
    });

    if (response.data?.price) {
      return getPositiveRate(response.data.price);
    }

    console.warn(`Respuesta inesperada de Binance para ${symbol}:`, response.data);
    return null;
  } catch (error) {
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : "";
    console.error(`Error al obtener tasa spot de Binance para ${symbol}: ${error.message}${suffix}`);
    if (status === 451) {
      console.warn("Binance rechaza la solicitud por restricciones geográficas. Intentando otra fuente.");
    }
    return null;
  }
}

/**
 * Obtiene el precio spot WLD/USDT desde Bybit.
 */
async function getBybitSpotRate(symbol) {
  try {
    const response = await axios.get(BYBIT_TICKER_URL, {
      params: { category: "spot", symbol },
      timeout: 7000,
    });

    const ticker = response.data?.result?.list?.[0];
    if (ticker?.lastPrice) {
      return getPositiveRate(ticker.lastPrice);
    }

    console.warn(`Respuesta inesperada de Bybit para ${symbol}:`, response.data);
    return null;
  } catch (error) {
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : "";
    console.error(`Error al obtener tasa spot de Bybit para ${symbol}: ${error.message}${suffix}`);
    return null;
  }
}

/**
 * Obtiene el precio spot WLD/USDT desde Gate.io.
 */
async function getGateSpotRate(currencyPair) {
  try {
    const response = await axios.get(GATE_TICKER_URL, {
      params: { currency_pair: currencyPair },
      timeout: 7000,
    });

    const ticker = Array.isArray(response.data) ? response.data[0] : null;
    if (ticker?.last) {
      return getPositiveRate(ticker.last);
    }

    console.warn(`Respuesta inesperada de Gate.io para ${currencyPair}:`, response.data);
    return null;
  } catch (error) {
    const status = error.response?.status;
    const suffix = status ? ` (HTTP ${status})` : "";
    console.error(`Error al obtener tasa spot de Gate.io para ${currencyPair}: ${error.message}${suffix}`);
    return null;
  }
}

/**
 * Obtiene las tasas de mercado desde la API de CoinGecko como respaldo.
 */
async function getCoinGeckoBackupRates() {
  try {
    const params = { ids: 'worldcoin,tether', vs_currencies: 'usdt,clp,ves' };
    const response = await axios.get(COINGECKO_API_URL, { params, timeout: 7000 });
    const data = response.data;
    if (!data) {
      console.warn("CoinGecko devolvió una respuesta vacía.");
      return null;
    }

    let wldUsdt = data.worldcoin?.usdt ?? null;
    const usdtClp = data.tether?.clp ?? null;
    const usdtVes = data.tether?.ves ?? null;

    // Si CoinGecko no entrega WLD/USDT directo, intenta derivarlo desde CLP.
    if (!wldUsdt && data.worldcoin?.clp && usdtClp) {
      wldUsdt = data.worldcoin.clp / usdtClp;
    }

    if (!wldUsdt && !usdtClp && !usdtVes) {
      console.warn("CoinGecko no entregó suficientes datos para tasas de respaldo:", data);
      return null;
    }

    return {
      wld_usdt: wldUsdt,
      usdt_clp: usdtClp,
      usdt_ves: usdtVes,
    };
  } catch (error) {
    console.error("Error al obtener tasas de CoinGecko:", error.message);
    return null;
  }
}

async function buildRatesSnapshot() {
  const [
    p2pBinance,
    clpRateCriptoYa,
    vesRateCriptoYa,
    wldRateBinance,
    wldRateBybit,
    wldRateGate,
    backupRatesCoinGecko,
  ] = await Promise.all([
    getBinanceP2PSixthRates(),
    getCriptoYaP2PRate("clp"),
    getCriptoYaP2PRate("ves", VES_SELL_TARGET_AMOUNT),
    getBinanceSpotRate("WLDUSDT"),
    getBybitSpotRate("WLDUSDT"),
    getGateSpotRate("WLD_USDT"),
    getCoinGeckoBackupRates(),
  ]);

  const usdtToClpFromBinance6 = p2pBinance.clpBuy6;
  const adjustedVesRateCriptoYa = adjustVesCriptoYaRate(vesRateCriptoYa);
  const usdtToVesFromBinance6BankSell = p2pBinance.vesSell6Bank
    || adjustedVesRateCriptoYa
    || null;
  const vesFromDirectBinance = Boolean(p2pBinance.vesSell6Bank);

  const backupWld = getPositiveRate(backupRatesCoinGecko?.wld_usdt);
  const backupClp = getPositiveRate(backupRatesCoinGecko?.usdt_clp);
  const backupVes = getPositiveRate(backupRatesCoinGecko?.usdt_ves);
  const wldToUsdt = wldRateBinance || wldRateBybit || wldRateGate || backupWld || FALLBACK_RATES.WLD_to_USDT;
  const usdtToClp = usdtToClpFromBinance6 || clpRateCriptoYa || backupClp || FALLBACK_RATES.USDT_to_CLP_P2P;
  const usdtToVes = usdtToVesFromBinance6BankSell || vesRateCriptoYa || backupVes || FALLBACK_RATES.VES_to_USDT_P2P;

  const wldSource = wldRateBinance
    ? 'Binance Spot'
    : (wldRateBybit ? 'Bybit Spot' : (wldRateGate ? 'Gate.io Spot' : (backupWld ? 'CoinGecko' : 'Fallback')));
  const clpSource = usdtToClpFromBinance6
    ? 'Binance P2P BUY #6'
    : (clpRateCriptoYa ? 'CriptoYa' : (backupClp ? 'CoinGecko' : 'Fallback'));
  const vesSource = p2pBinance.vesSell6Bank
    ? (p2pBinance.vesSellSource || `Binance P2P SELL (${VES_SELL_TARGET_AMOUNT} VES)`)
    : (usdtToVesFromBinance6BankSell
      ? 'Binance P2P via CriptoYa'
      : (vesRateCriptoYa ? 'CriptoYa' : (backupVes ? 'CoinGecko' : 'Fallback')));

  console.log(`Rates Summary: CLP P2P=${usdtToClp}, VES P2P=${usdtToVes} (Direct VES: ${vesFromDirectBinance})`);

  return {
    success: true,
    WLD_to_USDT: wldToUsdt,
    USDT_to_CLP_P2P: usdtToClp,
    USDT_to_CLP_P2P_BUY_6TH: usdtToClpFromBinance6,
    USDT_CLP_BUY_6TH: usdtToClpFromBinance6,
    USDT_to_VES_P2P_SELL_6TH_BANK_TRANSFER: usdtToVesFromBinance6BankSell,
    USDT_VES_SELL_6TH_BANK_TRANSFER: usdtToVesFromBinance6BankSell,
    USDT_to_VES_P2P: usdtToVes,
    VES_to_USDT_P2P: usdtToVes,
    degraded: wldSource === 'Fallback' || clpSource === 'Fallback' || vesSource === 'Fallback',
    meta: {
      wld_source: wldSource,
      clp_source: clpSource,
      ves_source: vesSource,
      generated_at: new Date().toISOString(),
      debug: {
        proxy_active: Boolean(getBinanceProxyConfig()),
        binance_p2p_clp: Boolean(usdtToClpFromBinance6),
        binance_p2p_ves: Boolean(p2pBinance.vesSell6Bank),
      },
    },
  };
}

function buildFallbackSnapshot(error) {
  console.error("Error general en la función de tasas:", error?.message || error);
  return {
    success: true,
    WLD_to_USDT: FALLBACK_RATES.WLD_to_USDT,
    USDT_to_CLP_P2P: FALLBACK_RATES.USDT_to_CLP_P2P,
    USDT_to_CLP_P2P_BUY_6TH: null,
    USDT_CLP_BUY_6TH: null,
    USDT_to_VES_P2P_SELL_6TH_BANK_TRANSFER: null,
    USDT_VES_SELL_6TH_BANK_TRANSFER: null,
    USDT_to_VES_P2P: FALLBACK_RATES.VES_to_USDT_P2P,
    VES_to_USDT_P2P: FALLBACK_RATES.VES_to_USDT_P2P,
    degraded: true,
    meta: {
      wld_source: 'Fallback',
      clp_source: 'Fallback',
      ves_source: 'Fallback',
      generated_at: new Date().toISOString(),
    },
  };
}

module.exports = async (req, res) => {
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");
  res.setHeader("Cache-Control", "public, max-age=15, s-maxage=30, stale-while-revalidate=120");
  res.setHeader("X-Content-Type-Options", "nosniff");

  if (req.method === 'OPTIONS') {
    return res.status(204).end();
  }

  if (req.method !== 'GET') {
    return res.status(405).json({ success: false, message: "Método no permitido." });
  }

  const now = Date.now();
  const cacheIsFresh = ratesCache && (now - ratesCache.cachedAt) < RATES_CACHE_TTL_MS;

  if (!cacheIsFresh) {
    try {
      ratesCache = {
        payload: await buildRatesSnapshot(),
        cachedAt: Date.now(),
      };
    } catch (error) {
      ratesCache = {
        payload: buildFallbackSnapshot(error),
        cachedAt: Date.now(),
      };
    }
  }

  const ageSeconds = Math.max(0, Math.round((now - ratesCache.cachedAt) / 1000));
  return res.status(200).json({
    ...ratesCache.payload,
    meta: {
      ...ratesCache.payload.meta,
      cache: cacheIsFresh ? 'hit' : 'miss',
      age_seconds: ageSeconds,
    },
  });
};

module.exports.buildRatesSnapshot = buildRatesSnapshot;
module.exports.buildFallbackSnapshot = buildFallbackSnapshot;
