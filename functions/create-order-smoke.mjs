import assert from "node:assert/strict";

const projectId = process.env.GCLOUD_PROJECT || "demo-myremesas-rules";
const functionsBase = process.env.FUNCTIONS_EMULATOR_URL || "http://127.0.0.1:5001";
const authHost = process.env.FIREBASE_AUTH_EMULATOR_HOST || "127.0.0.1:9099";
const authBase = `http://${authHost}/identitytoolkit.googleapis.com/v1/accounts`;
const apiKey = "demo-key";

async function post(url, body, headers = {}) {
  const response = await fetch(url, {
    method: "POST",
    headers: { "Content-Type": "application/json", ...headers },
    body: JSON.stringify(body),
  });
  return { response, data: await response.json() };
}

const email = `qa+${Date.now()}@example.com`;
const password = `Qa-${Date.now()}-Aa`;
const signup = await post(`${authBase}:signUp?key=${apiKey}`, {
  email,
  password,
  returnSecureToken: true,
});
assert.equal(signup.response.status, 200, JSON.stringify(signup.data));
const idToken = signup.data.idToken;
const authHeaders = { Authorization: `Bearer ${idToken}` };
const endpoint = `${functionsBase}/${projectId}/us-central1/createOrder`;

const unauthenticated = await post(endpoint, {
  amountSend: 10,
  currencySend: "USDT",
  currencyReceive: "VES",
});
assert.equal(unauthenticated.response.status, 401);

const invalid = await post(endpoint, {
  amountSend: 10,
  currencySend: "USDT",
  currencyReceive: "VES",
  userVesDestination: { beneficiary: "Maria" },
}, authHeaders);
assert.equal(invalid.response.status, 400);

const validBody = {
  amountSend: 10,
  currencySend: "USDT",
  currencyReceive: "VES",
  userVesDestination: {
    beneficiary: "Maria Perez",
    idNumber: "V-12345678",
    bank: "Banco de Venezuela",
    accountType: "Ahorro",
    accountNumber: "01020123456789012345",
    notes: "",
  },
};
const authorized = await post(endpoint, validBody, authHeaders);
assert.equal(authorized.response.status, 201, JSON.stringify(authorized.data));
assert.equal(authorized.data.success, true);
assert.ok(authorized.data.id);
assert.ok(authorized.data.path.includes("/transactions/"));
assert.ok(authorized.data.amountReceive > 0);
assert.ok(authorized.data.rateApplied > 0);

console.log(JSON.stringify({
  signup: signup.response.status,
  unauthenticated: unauthenticated.response.status,
  invalid: invalid.response.status,
  created: authorized.response.status,
  hasTrustedPath: Boolean(authorized.data.path),
}));
