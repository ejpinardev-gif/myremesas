const Binance = require('node-binance-api');

// Inicializa el cliente de Binance con las claves de API desde las variables de entorno
const binance = new Binance().options({
  APIKEY: process.env.BINANCE_API_KEY,
  APISECRET: process.env.BINANCE_API_SECRET,
  // Opcional: para logs de depuración
  verbose: true, 
  log: log => {
    console.log(log); 
  }
});

// Tasas de Referencia Fijas (Fallback en caso de que todo falle)
const FALLBACK_RATES = {
  WLD_to_USDT: 2.80,
  USDT_to_CLP_P2P: 950.00,
  VES_to_USDT_P2P: 37.00,
};

/**
 * Obtiene la tasa P2P de Binance para una moneda fiduciaria usando la API oficial.
 * Este es un método no oficial, ya que la API P2P no es pública.
 * Mantenemos una lógica similar pero usando la librería.
 * @param {string} fiat - Código de moneda fiduciaria (CLP o VES).
 * @returns {Promise<number|null>} La tasa P2P o null si falla.
 */
async function getP2PRate(fiat) {
  try {
    // La librería `node-binance-api` tiene un método interno para esto.
    // Es más robusto que nuestra llamada manual con axios.
    const response = await binance.p2p.buy("USDT", fiat, 1);

    if (response && response.data && response.data.length > 0) {
      const rate = parseFloat(response.data[0].adv.price);
      return rate;
    }

    console.warn(`No se encontraron ofertas P2P para ${fiat}.`);
    return null;
  } catch (error) {
    console.error(`Error al obtener tasa P2P para ${fiat}:`, error.body || error.message);
    return null;
  }
}

/**
 * Obtiene el precio de WLD/USDT desde la API Spot oficial de Binance.
 * @returns {Promise<number|null>} El precio WLD/USDT o null si falla.
 */
async function getSpotRate() {
  try {
    // Usamos el método de la librería para obtener el precio
    const prices = await binance.prices('WLDUSDT');
    if (prices && prices.WLDUSDT) {
      return parseFloat(prices.WLDUSDT);
    }
    console.warn("La respuesta de la API Spot no contenía un precio.");
    return null;
  } catch (error) {
    console.error("Error al obtener WLD/USDT spot rate:", error.body || error.message);
    return null;
  }
}

// Función principal de Vercel Serverless
module.exports = async (req, res) => {
  // Configurar headers CORS
  res.setHeader("Access-Control-Allow-Origin", "*");
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Access-Control-Allow-Methods", "GET, POST, OPTIONS");
  res.setHeader("Access-Control-Allow-Headers", "Content-Type");

  if (req.method === 'OPTIONS') {
    return res.status(200).end();
  }

  try {
    // Llamadas concurrentes para obtener todas las tasas
    const [spotPrice, clpRate, vesRate] = await Promise.all([
      getSpotRate(),
      getP2PRate("CLP"),
      getP2PRate("VES"),
    ]);

    // Construir la respuesta final, usando el valor real si existe, o el de fallback si no.
    res.status(200).json({
      success: true,
      WLD_to_USDT: spotPrice || FALLBACK_RATES.WLD_to_USDT,
      USDT_to_CLP_P2P: clpRate || FALLBACK_RATES.USDT_to_CLP_P2P,
      VES_to_USDT_P2P: vesRate || FALLBACK_RATES.VES_to_USDT_P2P,
    });
  } catch (error) {
    console.error("Error general en Vercel Function:", error.message);
    // Si todo falla, retornar un error y los valores de fallback
    res.status(500).json({
      success: false,
      message: "Error al procesar tasas, usando valores de referencia.",
      ...FALLBACK_RATES,
    });
  }
};
