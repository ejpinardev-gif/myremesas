import test from "node:test";
import assert from "node:assert/strict";
import balanceModule from "../api/binance-balance.js";

const {
  createHandler,
  normalizeBalance,
} = balanceModule;

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

test("balance endpoint requires authentication", async () => {
  const handler = createHandler({
    verifyIdToken: async () => {
      throw new Error("verify should not run");
    },
  });
  const res = createRes();

  await handler({ method: "GET", headers: {}, query: {} }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.body.success, false);
});

test("balance endpoint rejects authenticated non-admin users", async () => {
  const handler = createHandler({
    verifyIdToken: async () => ({ uid: "regular-user" }),
    adminCheck: () => false,
  });
  const res = createRes();

  await handler({
    method: "GET",
    headers: { authorization: "Bearer valid-token" },
    query: { asset: "USDT" },
  }, res);

  assert.equal(res.statusCode, 403);
  assert.equal(res.body.message, "No autorizado.");
});

test("balance endpoint allows only the USDT asset used by the admin panel", async () => {
  const handler = createHandler({
    verifyIdToken: async () => ({ uid: "admin-user" }),
    adminCheck: () => true,
  });
  const res = createRes();

  await handler({
    method: "GET",
    headers: { authorization: "Bearer valid-token" },
    query: { asset: "BTC" },
  }, res);

  assert.equal(res.statusCode, 400);
  assert.equal(res.body.message, "Activo no permitido.");
});

test("balance endpoint rejects non-GET methods", async () => {
  const handler = createHandler();
  const res = createRes();

  await handler({ method: "POST", headers: {}, query: {} }, res);

  assert.equal(res.statusCode, 405);
});

test("CORS is not wildcarded for untrusted origins", async () => {
  const handler = createHandler();
  const res = createRes();

  await handler({
    method: "GET",
    headers: { origin: "https://attacker.example" },
    query: {},
  }, res);

  assert.equal(res.statusCode, 401);
  assert.equal(res.headers["access-control-allow-origin"], undefined);
  assert.equal(res.headers["cache-control"], "no-store");
});

test("normalizeBalance accepts flat and nested proxy payloads", () => {
  assert.deepEqual(
    normalizeBalance({ asset: "USDT", free: "10", locked: "2", withdrawing: "1" }, "USDT"),
    {
      success: true,
      asset: "USDT",
      balance: { free: 10, locked: 2, withdrawing: 1, total: 13 },
    },
  );

  assert.deepEqual(
    normalizeBalance({ asset: "USDT", balance: { free: 4, locked: 0, withdrawing: 0, total: 4 } }, "USDT"),
    {
      success: true,
      asset: "USDT",
      balance: { free: 4, locked: 0, withdrawing: 0, total: 4 },
    },
  );

  assert.deepEqual(
    normalizeBalance({ asset: "USDT", balance: null }, "USDT"),
    { success: true, asset: "USDT", balance: null },
  );
});
