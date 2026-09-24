const { createRemoteJWKSet, jwtVerify } = require("jose");

const DEFAULT_FIREBASE_PROJECT_ID = "studio-7601782447-44d81";
const FIREBASE_JWKS_URL = "https://www.googleapis.com/service_accounts/v1/jwk/securetoken@system.gserviceaccount.com";
const ADMIN_UIDS = new Set([
  "R3QU4xRLmSQFiArCWWRwGBMEOhc2",
  "71YiNOk9MOc6mNjxnnKBLST1Clh2",
]);

const jwksByProject = new Map();

function getFirebaseProjectId() {
  return process.env.FIREBASE_PROJECT_ID || DEFAULT_FIREBASE_PROJECT_ID;
}

function getJwksForProject(projectId) {
  if (!jwksByProject.has(projectId)) {
    jwksByProject.set(projectId, createRemoteJWKSet(new URL(FIREBASE_JWKS_URL)));
  }
  return jwksByProject.get(projectId);
}

function extractBearerToken(req) {
  const authorization = req?.headers?.authorization || req?.headers?.Authorization || "";
  if (!authorization.startsWith("Bearer ")) return null;
  const token = authorization.slice("Bearer ".length).trim();
  return token || null;
}

async function verifyFirebaseIdToken(idToken, options = {}) {
  const projectId = options.projectId || getFirebaseProjectId();
  if (!idToken || typeof idToken !== "string") {
    throw new Error("Token de autenticación no proporcionado.");
  }

  try {
    const jwks = options.jwks || getJwksForProject(projectId);
    const { payload } = await jwtVerify(idToken, jwks, {
      algorithms: ["RS256"],
      issuer: `https://securetoken.google.com/${projectId}`,
      audience: projectId,
      clockTolerance: 5,
    });

    const uid = payload.uid || payload.sub || payload.user_id;
    if (typeof uid !== "string" || (payload.sub && payload.sub !== uid)) {
      throw new Error("El token no contiene un UID válido.");
    }

    return { ...payload, uid };
  } catch (error) {
    console.warn("Firebase ID token verification failed:", error?.code || error?.message);
    const verificationError = new Error("Token de autenticación inválido o vencido.");
    verificationError.statusCode = 401;
    throw verificationError;
  }
}

function isAdminUid(uid) {
  return typeof uid === "string" && ADMIN_UIDS.has(uid.trim());
}

module.exports = {
  extractBearerToken,
  getFirebaseProjectId,
  isAdminUid,
  verifyFirebaseIdToken,
};
