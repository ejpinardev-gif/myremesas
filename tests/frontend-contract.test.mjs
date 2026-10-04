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
  for (const id of ["payment-details-modal", "image-viewer-modal", "confirm-modal", "admin-user-detail-modal"]) {
    assert.match(html, new RegExp(`id="${id}"[^>]*aria-modal="true"`));
  }
  assert.match(html, /id="payment-modal-title"/);
  assert.match(html, /id="image-viewer-title"/);
  assert.match(html, /id="admin-user-detail-title"/);
});

test("the authenticated panel distinguishes personal and global admin history", () => {
  assert.match(html, /id="admin-history-callout"/);
  assert.match(html, /data-view="admin-orders"/);
  assert.match(html, /id="admin-cancelled-transactions"/);
  assert.match(html, /id="admin-pending-count"/);
  assert.match(html, /id="admin-completed-count"/);
  assert.match(html, /id="admin-cancelled-count"/);
  assert.match(main, /adminHistoryCallout/);
  assert.match(main, /adminCancelledTransactionsList/);
});

test("the frontend exposes opt-in push notification controls", () => {
  assert.match(html, /id="push-notification-control"/);
  assert.match(html, /name="fcm-vapid-key" content="[A-Za-z0-9_-]+"/);
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

test("the checkout walks the user through three labelled steps", () => {
  assert.match(html, /id="payment-stepper"/);
  for (const step of ["1", "2", "3"]) {
    assert.match(html, new RegExp(`data-payment-step="${step}"[^>]*aria-label=`));
    assert.match(html, new RegExp(`data-payment-marker="${step}"`));
  }
  assert.match(html, /id="payment-next-button"/);
  assert.match(html, /id="payment-back-button"/);
  assert.match(html, /id="payment-step-hint"/);
  assert.match(main, /function renderPaymentStep\(step\)/);
  assert.match(main, /PAYMENT_STEP_HINTS/);
});

test("the checkout locks the quote and blocks confirmation once it expires", () => {
  assert.match(html, /id="payment-rate-lock"/);
  assert.match(html, /id="payment-rate-timer"/);
  assert.match(html, /id="refresh-payment-rate"/);
  assert.match(main, /const PAYMENT_RATE_VALIDITY_MS = 600_000;/);
  assert.match(main, /function capturePaymentRateQuote\(\)/);
  assert.match(main, /function isPaymentRateExpired\(\)/);
  assert.match(main, /La cotización expiró\. Actualiza la tasa antes de confirmar\./);
  assert.match(main, /clearInterval\(paymentRateTimerId\)/);
});

test("the app is installable as a PWA with its own icon", () => {
  assert.match(html, /<link rel="manifest" href="\/site\.webmanifest">/);
  assert.match(html, /<link rel="apple-touch-icon" href="\/icons\/apple-touch-icon\.png">/);
  assert.match(html, /<meta name="apple-mobile-web-app-title" content="MyRemesas">/);
  assert.match(html, /<meta name="theme-color" content="#0b0f1a">/);

  const manifest = JSON.parse(fs.readFileSync("public/site.webmanifest", "utf8"));
  assert.equal(manifest.short_name, "MyRemesas");
  assert.equal(manifest.display, "standalone");
  assert.equal(manifest.start_url, "/");
  assert.equal(manifest.theme_color, manifest.background_color);

  // Chrome exige un icono de 192 y uno de 512 para ofrecer la instalacion.
  const sizes = manifest.icons.map(icon => `${icon.sizes} ${icon.purpose}`);
  assert.ok(sizes.includes("192x192 any"), "falta icono any de 192");
  assert.ok(sizes.includes("512x512 any"), "falta icono any de 512");
  assert.ok(sizes.includes("512x512 maskable"), "falta icono maskable de 512");

  for (const icon of manifest.icons) {
    const file = `public${icon.src}`;
    assert.equal(fs.existsSync(file), true, `falta el asset ${icon.src}`);
    const header = fs.readFileSync(file).subarray(0, 24);
    assert.equal(header.toString("hex", 0, 8), "89504e470d0a1a0a", `${icon.src} no es un PNG valido`);
    const width = header.readUInt32BE(16);
    const height = header.readUInt32BE(20);
    const [expected] = icon.sizes.split("x").map(Number);
    assert.equal(width, expected, `ancho incorrecto en ${icon.src}`);
    assert.equal(height, expected, `alto incorrecto en ${icon.src}`);
  }
  assert.equal(fs.existsSync("public/icons/apple-touch-icon.png"), true);
  assert.equal(fs.existsSync("public/icons/icon-source.svg"), true);
});

test("order cards show the lifecycle stepper with a next-step hint", () => {
  assert.match(html, /\.order-stepper \{/);
  assert.match(html, /\.order-step\.is-active \{/);
  assert.match(main, /function buildOrderStepperMarkup\(status\)/);
  assert.match(main, /function getOrderLifecycleIndex\(status\)/);
  assert.match(main, /order-stepper/);
  assert.match(main, /ORDER_STATUS_HINTS/);
});

test("the admin panel provides customer registry and user order history", () => {
  assert.match(html, /data-view="admin-users"/);
  assert.match(html, /id="admin-users-section"/);
  assert.match(html, /data-view-panel="admin-users"/);
  assert.match(html, /id="admin-users-status"/);
  assert.match(html, /id="admin-refresh-users-btn"/);
  assert.match(html, /id="admin-total-users-count"/);
  assert.match(html, /id="admin-users-with-orders-count"/);
  assert.match(html, /id="admin-users-total-orders-count"/);
  assert.match(html, /id="admin-users-search-input"/);
  assert.match(html, /id="admin-users-filter-select"/);
  assert.match(html, /id="admin-users-list"/);
  assert.match(html, /id="admin-user-detail-modal"/);
  assert.match(html, /id="admin-user-detail-title"/);
  assert.match(html, /id="admin-user-detail-email"/);
  assert.match(html, /id="admin-user-detail-close"/);
  assert.match(html, /id="admin-user-orders-content"/);
  assert.match(html, /id="admin-users-pagination"/);
  assert.match(html, /id="admin-users-page-size-select"/);
  assert.match(html, /id="admin-users-pagination-info"/);
  assert.match(html, /id="admin-users-prev-page-btn"/);
  assert.match(html, /id="admin-users-next-page-btn"/);
  assert.match(html, /id="admin-users-page-current"/);

  assert.match(main, /GET_ADMIN_USERS_API_URL/);
  assert.match(main, /cloudfunctions\.net\/getAdminUsers/);
  assert.match(main, /adminUsersCache/);
  assert.match(main, /adminUsersCurrentPage/);
  assert.match(main, /adminUsersPageSize/);
  assert.match(main, /function loadAdminUsers\b/);
  assert.match(main, /function renderAdminUsersMetrics\b/);
  assert.match(main, /function renderAdminUsersList\b/);
  assert.match(main, /function openAdminUserDetail\b/);
  assert.match(main, /function closeAdminUserDetail\b/);
});

