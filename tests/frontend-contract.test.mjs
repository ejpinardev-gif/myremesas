import test from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";

const html = fs.readFileSync("public/index.html", "utf8");
const main = fs.readFileSync("public/main.js", "utf8");

function collectIds(source) {
  return [...source.matchAll(/\bid=["']([^"']+)["']/g)].map((match) => match[1]);
}

test("HTML has no duplicate element IDs", () => {
  const ids = collectIds(html);
  const duplicates = ids.filter((id, index) => ids.indexOf(id) !== index);
  assert.deepEqual([...new Set(duplicates)], []);
});

test("static DOM references used by main.js exist in the page", () => {
  const ids = new Set(collectIds(html));
  const referencedIds = [...main.matchAll(/getElementById\(['"]([^'"]+)['"]\)/g)].map((match) => match[1]);
  const missing = [...new Set(referencedIds.filter((id) => !ids.has(id)))];
  assert.deepEqual(missing, []);
});

test("the page includes the recovery flow and canonical reset URL", () => {
  assert.match(html, /id="reset-password-form"/);
  assert.match(html, /id="show-reset-password-form"/);
  assert.match(main, /sendPasswordResetEmail/);
  assert.match(main, /myremesas-prod-deploy\.vercel\.app/);
});

test("the page exposes one main landmark", () => {
  assert.equal((html.match(/<main\b/g) || []).length, 1);
  assert.match(html, /<main id="main-content">/);
});

test("modal markup exposes accessible dialog semantics", () => {
  for (const id of ["payment-details-modal", "image-viewer-modal", "confirm-modal"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-modal="true"`));
  }
  assert.match(html, /id="payment-modal-title"/);
  assert.match(html, /id="image-viewer-title"/);
});

test("the frontend exposes opt-in push notification controls", () => {
  assert.match(html, /id="push-notification-control"/);
  assert.match(html, /id="enable-push-notifications"/);
  assert.match(html, /id="disable-push-notifications"/);
  assert.match(main, /firebase-messaging-sw\.js/);
  assert.match(main, /getToken/);
  assert.equal(fs.existsSync("public/firebase-messaging-sw.js"), true);
});

test("the frontend requests the protected balance endpoint with a bearer token", () => {
  assert.match(main, /Authorization: `Bearer \$\{idToken\}`/);
  assert.match(main, /getIdToken\(\)/);
  assert.doesNotMatch(main, /\/api\/binance-balance\?asset=USDT&_v=\$\{Date\.now\(\)\}`\);/);
});

test("orders are created through the trusted function, not directly from the client", () => {
  assert.match(main, /CREATE_ORDER_API_URL/);
  assert.match(main, /cloudfunctions\.net\/createOrder/);
  assert.doesNotMatch(main, /addDoc\(userTransactionsRef/);
});
