const axios = require("axios");

// URL de la API de Binance
const BINANCE_SPOT_URL = 
  "https://api.binance.com/api/v3/ticker/price?symbol=WLDUSDT";
const BINANCE_P2P_URL = 
  "https://p2p.binance.com/bapi/c2c/v2/friendly/c2c/adv/search";

// Tasas de Referencia Fijas (Fallback)
const FIXED_P2P_RATES = {
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
        // Headers actualizados para simular una solicitud de navegador más realista
        "Accept": "application/json",
        "Content-Type": "application/json",
        "Origin": "https://p2p.binance.com",
        "Referer": `https://p2p.binance.com/en/trade/all-payments/USDT?fiat=${fiat}`,
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/108.0.0.0 Safari/537.36",
      },
      timeout: 5000, // Timeout de 5 segundos
    });

    // Verificar si la respuesta fue exitosa y contiene datos
    if (response.data && response.data.data && 
        response.data.data.length > 0) {
      const rate = parseFloat(response.data.data[0].adv.price);
      return rate;
    }

    // Si la llamada es exitosa pero no hay ofertas, retornamos null
    console.warn(`No se encontraron ofertas P2P para ${fiat}.`);
    return null; 
  } catch (error) {
    // Capturar errores de red o HTTP (como 400, 403, 500)
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
        timeout: 5000
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

// Función principal de Vercel Serverless
module.exports = async (req, res) => {
  // Configurar headers para permitir llamadas desde tu frontend (CORS)
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  // Permitir métodos y headers comunes para pre-flight requests
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  // Manejar solicitud OPTIONS (pre-flight)
  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  let wldUsdt = FIXED_P2P_RATES.WLD_to_USDT;
  let usdtToClpP2P = FIXED_P2P_RATES.USDT_to_CLP_P2P;
  let vesToUsdtP2P = FIXED_P2P_RATES.VES_to_USDT_P2P;

  try {
    // Llamadas concurrentes para obtener Spot y P2P
    const [spotPrice, clpRate, vesRate] = await Promise.all([
      getSpotRate(),
      getP2PRate("CLP"),
      getP2PRate("VES"),
    ]);

    // Usar tasas reales si se obtuvieron, sino mantener el fallback
    if (spotPrice) wldUsdt = spotPrice;
    if (clpRate) usdtToClpP2P = clpRate;
    if (vesRate) vesToUsdtP2P = vesRate;

    // Retornar todas las tasas necesarias para el cálculo en el frontend
    res.status(200).json({
      success: true,
      WLD_to_USDT: wldUsdt,
      USDT_to_CLP_P2P: usdtToClpP2P,
      VES_to_USDT_P2P: vesToUsdtP2P,
    });
  } catch (error) {
    console.error("Error general en Vercel Function:", error.message);
    // Retornar fallback en caso de error grave
    res.status(500).json({
      success: false,
      message: "Error al procesar tasas, usando valores de referencia.",
      WLD_to_USDT: FIXED_P2P_RATES.WLD_to_USDT,
      USDT_to_CLP_P2P: FIXED_P2P_RATES.USDT_to_CLP_P2P,
      VES_to_USDT_P2P: FIXED_P2P_RATES.VES_to_USDT_P2P,
    });
  }
};
