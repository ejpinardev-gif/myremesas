const { logger } = require("firebase-functions");
const { onRequest } = require("firebase-functions/v2/https");
const { initializeApp } = require("firebase-admin/app");
const { getAuth } = require("firebase-admin/auth");
const { FieldValue, getFirestore } = require("firebase-admin/firestore");

initializeApp();

const db = getFirestore();
const adminAuth = getAuth();
const APP_ID = "1:775892034675:web:98ed2724bcaff2ed427606";
const RATES_URL = "https://myremesas-prod-deploy.vercel.app/api/rates";
const ALLOWED_ORIGINS = new Set([
  "https://myremesas-prod-deploy.vercel.app",
  "https://myremesas-prod-deploy-ejpinardev-gifs-projects.vercel.app",
  "http://localhost:3000",
  "http://localhost:5001",
]);
const ALLOWED_CURRENCIES = new Set(["CLP", "VES", "USDT", "WLD"]);
const USDT_NETWORKS = new Set(["TRC20", "BEP20", "ERC20", "Polygon", "Arbitrum One", "Otro"]);

function setHeaders(req, res) {
  const origin = req.get("origin");
  res.set("Content-Type", "application/json");
  res.set("Cache-Control", "no-store");
  res.set("X-Content-Type-Options", "nosniff");
  res.set("Vary", "Origin");
  if (origin && ALLOWED_ORIGINS.has(origin)) {
    res.set("Access-Control-Allow-Origin", origin);
    res.set("Access-Control-Allow-Methods", "POST, OPTIONS");
    res.set("Access-Control-Allow-Headers", "Authorization, Content-Type");
  }
}

function getBearerToken(req) {
  const authorization = req.get("authorization") || "";
  return authorization.startsWith("Bearer ") ? authorization.slice(7).trim() : null;
}

function readString(value, maxLength, { required = true } = {}) {
  if (typeof value !== "string") {
    if (!required && (value === undefined || value === null)) return "";
    throw new Error("Datos de la orden inválidos.");
  }
  const normalized = value.trim();
  if (required && !normalized) throw new Error("Faltan datos obligatorios de la orden.");
  if (normalized.length > maxLength) throw new Error("Uno de los datos de la orden es demasiado largo.");
  return normalized;
}

function readAmount(value) {
  const amount = Number(value);
  if (!Number.isFinite(amount) || amount <= 0 || amount > 1_000_000_000_000) {
    throw new Error("El monto de la orden no es válido.");
  }
  return amount;
}

function normalizeDestination(value, type) {
  if (value === undefined || value === null) return null;
  if (typeof value !== "object" || Array.isArray(value)) throw new Error("Destino inválido.");

  if (type === "USDT") {
    const wallet = readString(value.wallet, 256);
    const network = readString(value.network, 80);
    if (!USDT_NETWORKS.has(network)) throw new Error("La red USDT no es válida.");
    return {
      wallet,
      network,
      notes: readString(value.notes, 500, { required: false }),
    };
  }

  if (type === "VES") {
    return {
      beneficiary: readString(value.beneficiary, 160),
      idNumber: readString(value.idNumber, 64),
      bank: readString(value.bank, 120),
      accountType: readString(value.accountType, 80),
      accountNumber: readString(value.accountNumber, 128),
      notes: readString(value.notes, 500, { required: false }),
    };
  }

  return null;
}

function normalizeMarginConfig(data = {}) {
  const normalize = (value, fallback) => {
    const number = Number(value);
    return Number.isFinite(number) && number >= 0 && number <= 1 ? number : fallback;
  };
  return {
    discountWldClp: normalize(data.discountWldClp, 0.14),
    discountClpVes: normalize(data.discountClpVes, 0.06),
    marginUsdtClp: normalize(data.marginUsdtClp, 0.004),
  };
}

function positive(value, label) {
  const number = Number(value);
  if (!Number.isFinite(number) || number <= 0) throw new Error(`No se pudo obtener una tasa válida para ${label}.`);
  return number;
}

function calculateRate({ send, receive, rates, margins }) {
  if (send === receive) return 1;

  const wldToUsdt = positive(rates.WLD_to_USDT, "WLD/USDT");
  const usdtToClp = positive(rates.USDT_to_CLP_P2P, "USDT/CLP");
  const usdtToVes = positive(rates.USDT_to_VES_P2P, "USDT/VES");

  if (send === "WLD" && receive === "CLP") return wldToUsdt * usdtToClp * (1 - margins.discountWldClp);
  if (send === "CLP" && receive === "WLD") return 1 / (wldToUsdt * usdtToClp * (1 - margins.discountWldClp));
  if (send === "USDT" && receive === "CLP") return usdtToClp * (1 + margins.marginUsdtClp);
  if (send === "CLP" && receive === "USDT") return 1 / (usdtToClp * (1 + margins.marginUsdtClp));
  if (send === "CLP" && receive === "VES") return (usdtToVes / usdtToClp) * (1 - margins.discountClpVes);
  if (send === "VES" && receive === "CLP") return 1 / ((usdtToVes / usdtToClp) * (1 - margins.discountClpVes));
  if (send === "USDT" && receive === "VES") return usdtToVes;
  if (send === "VES" && receive === "USDT") return 1 / usdtToVes;
  if (send === "WLD" && receive === "USDT") return wldToUsdt;
  if (send === "USDT" && receive === "WLD") return 1 / wldToUsdt;
  if (send === "WLD" && receive === "VES") return (wldToUsdt * usdtToVes) / usdtToClp * (1 - margins.discountWldClp);
  if (send === "VES" && receive === "WLD") return 1 / ((wldToUsdt * usdtToVes) / usdtToClp * (1 - margins.discountWldClp));

  throw new Error("El par de monedas no está disponible.");
}

let trustedRatesCache = null;
const TRUSTED_RATES_TTL_MS = 60_000;

async function getTrustedRates() {
  if (trustedRatesCache && Date.now() - trustedRatesCache.cachedAt < TRUSTED_RATES_TTL_MS) {
    return trustedRatesCache.payload;
  }

  const controller = new AbortController();
  const timeout = setTimeout(() => controller.abort(), 20_000);
  try {
    const response = await fetch(RATES_URL, { signal: controller.signal });
    if (!response.ok) throw new Error(`Rates service returned ${response.status}.`);
    const rates = await response.json();
    if (!rates?.success) throw new Error("Rates service returned an invalid response.");
    trustedRatesCache = { payload: rates, cachedAt: Date.now() };
    return rates;
  } finally {
    clearTimeout(timeout);
  }
}

async function getTrustedAdminAccount(accountId) {
  const normalizedId = readString(accountId, 128);
  if (!/^[A-Za-z0-9_-]+$/.test(normalizedId)) throw new Error("Cuenta de transferencia inválida.");
  const snapshot = await db.collection(`artifacts/${APP_ID}/public/data/admin_accounts`).doc(normalizedId).get();
  if (!snapshot.exists) throw new Error("La cuenta de transferencia ya no está disponible.");
  const account = snapshot.data();
  return {
    id: snapshot.id,
    bankName: readString(account.bankName, 120),
    accountHolder: readString(account.accountHolder, 160),
    rut: readString(account.rut, 64),
    accountType: readString(account.accountType, 80),
    accountNumber: readString(account.accountNumber, 128),
    email: readString(account.email || "N/A", 320),
  };
}

async function getTrustedMargins() {
  const snapshot = await db.doc("config/pricing").get();
  return normalizeMarginConfig(snapshot.exists ? snapshot.data() : {});
}

function getRateSource(rates, send, receive) {
  const source = rates.meta || {};
  if (send === "WLD" || receive === "WLD") return source.wld_source || "API";
  if (send === "CLP" || receive === "CLP") return source.clp_source || "API";
  return source.ves_source || "API";
}

async function createOrder(req, res) {
  setHeaders(req, res);
  if (req.method === "OPTIONS") return res.status(204).send("");
  if (req.method !== "POST") return res.status(405).json({ success: false, message: "Método no permitido." });

  const token = getBearerToken(req);
  if (!token) return res.status(401).json({ success: false, message: "Debes iniciar sesión." });

  try {
    const decoded = await adminAuth.verifyIdToken(token);
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const amountSend = readAmount(body.amountSend);
    const currencySend = readString(body.currencySend, 8);
    const currencyReceive = readString(body.currencyReceive, 8);
    if (!ALLOWED_CURRENCIES.has(currencySend) || !ALLOWED_CURRENCIES.has(currencyReceive)) {
      throw new Error("El par de monedas no está disponible.");
    }

    const usdtDestination = currencyReceive === "USDT"
      ? normalizeDestination(body.userUsdtDestination, "USDT")
      : null;
    const vesDestination = currencyReceive === "VES"
      ? normalizeDestination(body.userVesDestination, "VES")
      : null;
    if (currencyReceive === "USDT" && !usdtDestination) throw new Error("Faltan los datos de la wallet USDT.");
    if (currencyReceive === "VES" && !vesDestination) throw new Error("Faltan los datos de la cuenta VES.");
    const adminDestinationAccount = currencySend === "CLP"
      ? await getTrustedAdminAccount(body.adminDestinationAccountId)
      : null;

    const [rates, margins] = await Promise.all([getTrustedRates(), getTrustedMargins()]);
    const rate = calculateRate({ send: currencySend, receive: currencyReceive, rates, margins });
    if (!Number.isFinite(rate) || rate <= 0) throw new Error("No se pudo calcular una tasa válida.");

    const amountReceive = Number((amountSend * rate).toFixed(8));
    const transactionData = {
      amountSend,
      currencySend,
      amountReceive,
      currencyReceive,
      rateApplied: amountReceive / amountSend,
      timestamp: FieldValue.serverTimestamp(),
      userId: decoded.uid,
      userEmail: decoded.email || null,
      userDisplayName: decoded.name || null,
      status: "Sin comprobante",
      userReceiptUrl: null,
      adminReceiptUrl: null,
      rateSource: getRateSource(rates, currencySend, currencyReceive),
      rateGeneratedAt: rates.meta?.generated_at || null,
      ratesDegraded: Boolean(rates.degraded),
      ...(adminDestinationAccount
        ? { adminDestinationAccount: { ...adminDestinationAccount, savedAt: FieldValue.serverTimestamp() } }
        : {}),
      ...(usdtDestination ? { userUsdtDestination: usdtDestination } : {}),
      ...(vesDestination ? { userVesDestination: vesDestination } : {}),
    };

    const transactionRef = db.collection(`artifacts/${APP_ID}/users/${decoded.uid}/transactions`).doc();
    await transactionRef.create(transactionData);
    const path = transactionRef.path;
    logger.info("Created trusted remittance order", { uid: decoded.uid, transactionId: transactionRef.id });
    return res.status(201).json({
      success: true,
      id: transactionRef.id,
      path,
      amountSend,
      amountReceive,
      rateApplied: transactionData.rateApplied,
      rateSource: transactionData.rateSource,
      ratesDegraded: transactionData.ratesDegraded,
    });
  } catch (error) {
    logger.warn("Rejected remittance order", { code: error?.code, message: error?.message });
    const status = error?.code === "auth/invalid-id-token"
      ? 401
      : (error?.name === "AbortError" || /rates service/i.test(error?.message || "") ? 503 : 400);
    return res.status(status).json({ success: false, message: error?.message || "No se pudo crear la orden." });
  }
}

exports.createOrder = onRequest({ region: "us-central1", timeoutSeconds: 30 }, createOrder);
