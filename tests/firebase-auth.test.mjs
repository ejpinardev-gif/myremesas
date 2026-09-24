import test from "node:test";
import assert from "node:assert/strict";
import {
  SignJWT,
  createLocalJWKSet,
  exportJWK,
  generateKeyPair,
} from "jose";
import authModule from "../api/firebase-auth.js";

const {
  extractBearerToken,
  isAdminUid,
  verifyFirebaseIdToken,
} = authModule;

const PROJECT_ID = "demo-myremesas-rules";
const UID = "user-123";

function createRes() {
  return {
    statusCode: 200,
    headers: {},
    body: undefined,
    setHeader(name, value) {
      this.headers[name.toLowerCase()] = value;
    },
    status(code) {
      this.statusCode = code;
      return this;
    },
    json(payload) {
      this.body = payload;
      return this;
    },
    end() {
      return this;
    },
  };
}

test("extractBearerToken accepts only a non-empty Bearer token", () => {
  assert.equal(extractBearerToken({ headers: { authorization: "Bearer abc" } }), "abc");
  assert.equal(extractBearerToken({ headers: { authorization: "Basic abc" } }), null);
  assert.equal(extractBearerToken({ headers: {} }), null);
});

test("admin allowlist contains only configured UIDs", () => {
  assert.equal(isAdminUid("R3QU4xRLmSQFiArCWWRwGBMEOhc2"), true);
  assert.equal(isAdminUid("71YiNOk9MOc6mNjxnnKBLST1Clh2"), true);
  assert.equal(isAdminUid(`${UID}`), false);
  assert.equal(isAdminUid(null), false);
});

test("verifyFirebaseIdToken validates signature, issuer, audience and subject", async () => {
  const { privateKey, publicKey } = await generateKeyPair("RS256");
  const publicJwk = await exportJWK(publicKey);
  Object.assign(publicJwk, { kid: "test-key", alg: "RS256", use: "sig" });
  const jwks = createLocalJWKSet({ keys: [publicJwk] });
  const token = await new SignJWT({ user_id: UID })
    .setProtectedHeader({ alg: "RS256", kid: "test-key" })
    .setIssuer(`https://securetoken.google.com/${PROJECT_ID}`)
    .setAudience(PROJECT_ID)
    .setSubject(UID)
    .setIssuedAt()
    .setExpirationTime("5m")
    .sign(privateKey);

  const payload = await verifyFirebaseIdToken(token, { projectId: PROJECT_ID, jwks });
  assert.equal(payload.uid, UID);
  assert.equal(payload.sub, UID);

  await assert.rejects(
    verifyFirebaseIdToken(`${token}tampered`, { projectId: PROJECT_ID, jwks }),
    /inválido o vencido/,
  );
});

test("mock response supports handler assertions", () => {
  const res = createRes();
  res.status(418).json({ ok: true });
  assert.equal(res.statusCode, 418);
  assert.deepEqual(res.body, { ok: true });
});
