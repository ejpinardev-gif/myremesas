const functions = require("firebase-functions");
const cors = require("cors")({origin: true});
const axios = require("axios");

// URLs de la API de Binance
const BINANCE_SPOT_URL = "https://api.binance.com/api/v3/ticker/price?symbol=WLDUSDT";
const BINANCE_P2P_URL = "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

// Tasas de Referencia Fijas (Fallback)
const FALLBACK_RATES = {
  WLD_to_USDT: 1.19,
  USDT_to_CLP_P2P: 963.00,
  VES_to_USDT_P2P: 36.00,
};

/**
 * Obtiene la tasa P2P de Binance para una moneda fiduciaria.
 * @param {string} fiat - Código de moneda fiduciaria (CLP o VES).
 * @returns {Promise<number|null>} La tasa P2P o null si falla.
 */
async function getP2PRate(fiat) {
  const payload = {
    page: 1,
    rows: 1,
    asset: "USDT",
    fiat: fiat,
    tradeType: "BUY",
  };

  try {
    const response = await axios.post(BINANCE_P2P_URL, payload, {
      headers: {
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": "https://p2p.binance.com",
        "Referer": `https://p2p.binance.com/en/trade/all-payments/USDT?fiat=${fiat}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
      },
      timeout: 5000,
    });

    if (response.data && response.data.data && response.data.data.length > 0) {
      return parseFloat(response.data.data[0].adv.price);
    }
    console.warn(`No se encontraron ofertas P2P para ${fiat}.`);
    return null;
  } catch (error) {
    console.error(`Error al obtener tasa P2P para ${fiat}:`,
        error.response ? `${error.response.status} - ${JSON.stringify(error.response.data)}` : error.message);
    return null;
  }
}

/**
 * Obtiene el precio de WLD/USDT desde la API Spot de Binance.
 * @returns {Promise<number|null>} El precio WLD/USDT o null si falla.
 */
async function getSpotRate() {
  try {
    const response = await axios.get(BINANCE_SPOT_URL, {
      headers: {
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
      },
      timeout: 5000,
    });
    if (response.data && response.data.price) {
      return parseFloat(response.data.price);
    }
    console.warn("La respuesta de la API Spot no contenía un precio.");
    return null;
  } catch (error) {
    console.error("Error al obtener WLD/USDT spot rate:", error.message);
    return null;
  }
}

/**
 * Función HTTP para obtener todas las tasas de cambio de forma segura.
 */
exports.getRates = functions.https.onRequest((req, res) => {
  cors(req, res, async () => {
    try {
      // Llamadas concurrentes para obtener todas las tasas
      const [spotPrice, clpRate, vesRate] = await Promise.all([
        getSpotRate(),
        getP2PRate("CLP"),
        getP2PRate("VES"),
      ]);

      // Usar tasas reales si se obtuvieron, sino mantener el fallback
      const finalRates = {
        success: true,
        WLD_to_USDT: spotPrice || FALLBACK_RATES.WLD_to_USDT,
        USDT_to_CLP_P2P: clpRate || FALLBACK_RATES.USDT_to_CLP_P2P,
        VES_to_USDT_P2P: vesRate || FALLBACK_RATES.VES_to_USDT_P2P,
      };

      res.status(200).json(finalRates);
    } catch (error) {
      console.error("Error general en la función getRates:", error.message);
      // Retornar fallback en caso de error grave
      res.status(500).json({
        success: false,
        message: "Error al procesar tasas, usando valores de referencia.",
        ...FALLBACK_RATES,
      });
    }
  });
});
