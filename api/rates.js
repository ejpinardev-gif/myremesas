const axios = require('axios');

const BINANCE_API_KEY = process.env.BINANCE_API_KEY || '';
const BINANCE_API_SECRET = process.env.BINANCE_API_SECRET || '';

const FALLBACK_RATES = {
    WLD_to_USDT: 2.80,
    USDT_to_CLP_P2P: 950.00,
    VES_per_USDT_SELL: 37.00,
};

const BINANCE_P2P_ENDPOINT = 'https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search';
const BINANCE_TICKER_PRICE_ENDPOINT = 'https://api.binance.com/api/v3/ticker/price';
const BINANCE_AVG_PRICE_ENDPOINT = 'https://api.binance.com/api/v3/avgPrice';
const BINANCE_24H_TICKER_ENDPOINT = 'https://api.binance.com/api/v3/ticker/24hr';

/**
 * Genera headers comunes para las peticiones a Binance.
 * Para las peticiones Spot anexamos la API Key; la API P2P ignora la firma,
 * pero mantener el header ayuda a depurar accesos.
 */
function buildHeaders(extra = {}) {
    const headers = { ...extra };
    if (BINANCE_API_KEY) {
        headers['X-MBX-APIKEY'] = BINANCE_API_KEY;
    }
    return headers;
}

/**
 * Obtiene el precio spot de WLD/USDT usando la API oficial.
 */
async function getSpotRate() {
    const attempts = [
        {
            url: BINANCE_AVG_PRICE_ENDPOINT,
            params: { symbol: 'WLDUSDT' },
            source: 'avgPrice',
            pick: (data) => data?.price,
        },
        {
            url: BINANCE_TICKER_PRICE_ENDPOINT,
            params: { symbol: 'WLDUSDT' },
            source: 'tickerPrice',
            pick: (data) => data?.price,
        },
        {
            url: BINANCE_24H_TICKER_ENDPOINT,
            params: { symbol: 'WLDUSDT' },
            source: 'ticker24h',
            pick: (data) => data?.lastPrice,
        },
    ];

    for (const attempt of attempts) {
        try {
            const { data } = await axios.get(attempt.url, {
                params: attempt.params,
                headers: buildHeaders(),
                timeout: 5000,
            });
            const rawPrice = attempt.pick(data);
            const price = parseFloat(rawPrice);
            if (Number.isFinite(price) && price > 0) {
                return { price, source: attempt.source };
            }
        } catch (error) {
            console.warn(`Fallo consulta spot (${attempt.source}):`, error.message);
        }
    }

    console.error('No se pudo obtener precio spot WLD/USDT desde Binance.');
    return null;
}

/**
 * Realiza una consulta al marketplace P2P de Binance.
 * Binance no expone esta API con firma, por lo que se usa el endpoint público.
 */
async function getP2PRates({ fiat, tradeType, asset = 'USDT', rows = 8, transAmount = null }) {
    const payload = {
        page: 1,
        rows,
        payTypes: [],
        asset,
        tradeType,
        fiat,
        transAmount,
        publisherType: null,
        merchantCheck: false,
        proMerchantAds: false,
        shieldMerchantAds: false,
    };

    try {
        const { data } = await axios.post(
            BINANCE_P2P_ENDPOINT,
            payload,
            {
                headers: {
                    ...buildHeaders({
                        'Content-Type': 'application/json',
                        'clienttype': 'web',
                        'User-Agent': 'Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/118.0.0.0 Safari/537.36',
                        'Origin': 'https://p2p.binance.com',
                        'Referer': 'https://p2p.binance.com/',
                    }),
                },
                timeout: 7000,
            },
        );

        if (!data || !Array.isArray(data.data) || data.data.length === 0) {
            console.warn(`No se recibieron ofertas P2P para ${tradeType} ${asset} ${fiat}`);
            return [];
        }

        return data.data
            .map((entry) => {
                const price = parseFloat(entry?.adv?.price);
                return Number.isFinite(price) ? price : null;
            })
            .filter((price) => price !== null);
    } catch (error) {
        console.error(`Error al obtener tasas P2P ${tradeType} ${asset}/${fiat}:`, error.message);
        return [];
    }
}

/**
 * Selecciona una oferta concreta priorizando estabilidad frente a outliers.
 */
function pickOffer(prices, strategy = { index: 0, average: 0 }) {
    if (!Array.isArray(prices) || prices.length === 0) {
        return null;
    }

    if (strategy.average && prices.length >= strategy.average) {
        const slice = prices.slice(0, strategy.average);
        const sum = slice.reduce((acc, price) => acc + price, 0);
        return sum / slice.length;
    }

    const index = Math.min(strategy.index ?? 0, prices.length - 1);
    return prices[index];
}

module.exports = async (req, res) => {
    res.setHeader('Access-Control-Allow-Origin', '*');
    res.setHeader('Content-Type', 'application/json');
    res.setHeader('Access-Control-Allow-Methods', 'GET, POST, OPTIONS');
    res.setHeader('Access-Control-Allow-Headers', 'Content-Type');

    if (req.method === 'OPTIONS') {
        return res.status(200).end();
    }

    try {
        const [spotResult, clpBuyPrices, vesSellPrices] = await Promise.all([
            getSpotRate(),
            getP2PRates({ fiat: 'CLP', tradeType: 'BUY' }),
            getP2PRates({ fiat: 'VES', tradeType: 'SELL' }),
        ]);

        const spotPrice = spotResult?.price ?? null;
        const spotSource = spotResult?.source ?? 'fallback';
        const clpBuyRate = pickOffer(clpBuyPrices, { average: 3 }) || FALLBACK_RATES.USDT_to_CLP_P2P;
        const vesSellRate = pickOffer(vesSellPrices, { index: 3 }) || FALLBACK_RATES.VES_per_USDT_SELL;
        const wldSpot = spotPrice || FALLBACK_RATES.WLD_to_USDT;

        res.status(200).json({
            success: true,
            WLD_to_USDT: wldSpot,
            USDT_to_CLP_P2P: clpBuyRate,
            VES_per_USDT_SELL: vesSellRate,
            meta: {
                spotSource,
                clpOffers: clpBuyPrices.length,
                vesOffers: vesSellPrices.length,
                apiKeyAttached: Boolean(BINANCE_API_KEY && BINANCE_API_SECRET),
            },
        });
    } catch (error) {
        console.error('Error general al obtener tasas:', error.message);
        res.status(500).json({
            success: false,
            message: 'Error al procesar tasas, usando valores de referencia.',
            ...FALLBACK_RATES,
        });
    }
};
