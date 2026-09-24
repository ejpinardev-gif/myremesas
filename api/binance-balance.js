const axios = require("axios");
const crypto = require("crypto");
const {
  extractBearerToken,
  isAdminUid,
  verifyFirebaseIdToken,
} = require("./firebase-auth");

const ALLOWED_ORIGINS = new Set([
  "https://myremesas-prod-deploy.vercel.app",
  "https://myremesas-prod-deploy-ejpinardev-gifs-projects.vercel.app",
  "http://localhost:3000",
]);
const ALLOWED_ASSETS = new Set(["USDT"]);

function setResponseHeaders(req, res) {
  const origin = req?.headers?.origin || req?.headers?.Origin;
  res.setHeader("Content-Type", "application/json");
  res.setHeader("Cache-Control", "no-store");
  res.setHeader("X-Content-Type-Options", "nosniff");
  res.setHeader("Vary", "Origin");

  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.setHeader("Access-Control-Allow-Origin", origin);
    res.setHeader("Access-Control-Allow-Methods", "GET, OPTIONS");
    res.setHeader("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
}

function toFiniteNumber(value) {
  const parsed = Number(value);
  return Number.isFinite(parsed) ? parsed : 0;
}

function normalizeBalance(responseData, requestedAsset) {
  if (responseData?.success === false) {
    throw new Error(responseData?.message || "El proxy rechazó la consulta.");
  }

  if (responseData?.balance === null) {
    return { success: true, asset: responseData.asset || requestedAsset, balance: null };
  }

  const source = responseData?.balance && typeof responseData.balance === "object"
    ? responseData.balance
    : responseData;

  if (!source || (!Object.prototype.hasOwnProperty.call(source, "free") && !Object.prototype.hasOwnProperty.call(source, "total"))) {
    throw new Error("El proxy devolvió una respuesta de balance no reconocida.");
  }

  const free = toFiniteNumber(source.free);
  const locked = toFiniteNumber(source.locked);
  const withdrawing = toFiniteNumber(source.withdrawing);
  const total = source.total != null ? toFiniteNumber(source.total) : free + locked + withdrawing;

  return {
    success: true,
    asset: responseData?.asset || requestedAsset,
    balance: { free, locked, withdrawing, total },
  };
}

async function fetchDirectBinanceBalance(asset) {
  const apiKey = process.env.BINANCE_API_KEY;
  const apiSecret = process.env.BINANCE_API_SECRET;

  if (!apiKey || !apiSecret) {
    const error = new Error("Credenciales de Binance no configuradas.");
    error.statusCode = 500;
    throw error;
  }

  const params = { timestamp: Date.now(), recvWindow: 5000 };
  const queryString = new URLSearchParams(params).toString();
  const signature = crypto
    .createHmac("sha256", apiSecret)
    .update(queryString)
    .digest("hex");

  const { data } = await axios.get("https://api1.binance.com/sapi/v1/capital/config/getall", {
    params: { ...params, signature },
    headers: { "X-MBX-APIKEY": apiKey },
    timeout: 8000,
  });

  if (!Array.isArray(data)) {
    throw new Error("Binance devolvió una respuesta inesperada.");
  }

  const assetInfo = data.find((item) => item.coin === asset);
  if (!assetInfo) return { success: true, asset, balance: null };
  return normalizeBalance(assetInfo, asset);
}

async function fetchProxyBinanceBalance(asset) {
  const proxyUrl = process.env.BINANCE_PROXY_URL;
  const proxyToken = process.env.VPS_AUTH_TOKEN;

  if (!proxyUrl || !proxyToken) {
    const error = new Error("El proxy de Binance no está configurado correctamente.");
    error.statusCode = 500;
    throw error;
  }

  const { data } = await axios.get(`${proxyUrl.replace(/\/$/, "")}/api/balance`, {
    params: { asset },
    timeout: 8000,
    headers: { "x-vps-token": proxyToken },
  });

  return normalizeBalance(data, asset);
}

function createHandler({
  verifyIdToken = verifyFirebaseIdToken,
  adminCheck = isAdminUid,
} = {}) {
  return async function binanceBalanceHandler(req, res) {
    setResponseHeaders(req, res);

    if (req.method === "OPTIONS") {
      return res.status(204).end();
    }

    if (req.method !== "GET") {
      return res.status(405).json({ success: false, message: "Método no permitido." });
    }

    const token = extractBearerToken(req);
    if (!token) {
      return res.status(401).json({ success: false, message: "Debes iniciar sesión." });
    }

    try {
      const decodedToken = await verifyIdToken(token);
      if (!adminCheck(decodedToken.uid)) {
        return res.status(403).json({ success: false, message: "No autorizado." });
      }

      const asset = String(req.query?.asset || "USDT").trim().toUpperCase();
      if (!ALLOWED_ASSETS.has(asset)) {
        return res.status(400).json({ success: false, message: "Activo no permitido." });
      }

      const result = process.env.BINANCE_PROXY_URL
        ? await fetchProxyBinanceBalance(asset)
        : await fetchDirectBinanceBalance(asset);

      return res.status(200).json(result);
    } catch (error) {
      const statusCode = Number(error?.statusCode) || 500;
      console.error("Error en api/binance-balance.js:", error?.message || error);
      return res.status(statusCode).json({
        success: false,
        message: statusCode === 500
          ? "No se pudo consultar el saldo en este momento."
          : "No se pudo validar la solicitud.",
      });
    }
  };
}

const handler = createHandler();
module.exports = handler;
module.exports.createHandler = createHandler;
module.exports.normalizeBalance = normalizeBalance;
