import test from "node:test";
import assert from "node:assert/strict";
import { createRequire } from "node:module";

const require = createRequire(import.meta.url);
const {
  buildOrderNotification,
  sendOrderNotifications,
  shouldNotifyOrderStatus,
} = require("../functions/order-notifications.js");

test("order notifications only target creation and meaningful status changes", () => {
  assert.equal(shouldNotifyOrderStatus(null, { status: "Sin comprobante" }), true);
  assert.equal(shouldNotifyOrderStatus({ status: "Sin comprobante" }, { status: "Pendiente" }), true);
  assert.equal(shouldNotifyOrderStatus({ status: "Pendiente" }, { status: "Completado" }), true);
  assert.equal(shouldNotifyOrderStatus({ status: "Pendiente" }, { status: "Pendiente" }), false);
  assert.equal(shouldNotifyOrderStatus({ status: "Pendiente" }, { status: "Sin comprobante" }), false);
  assert.equal(shouldNotifyOrderStatus({ status: "Completado" }, null), false);
});

test("order notification content does not expose transfer amounts", () => {
  const notification = buildOrderNotification({
    transactionId: "abc12345def",
    before: { status: "Sin comprobante" },
    after: { status: "Pendiente" },
  });

  assert.equal(notification.title, "Comprobante recibido");
  assert.match(notification.body, /ABC12345/);
  assert.doesNotMatch(notification.body, /100000|CLP|USDT/);
  assert.match(notification.url, /view=history/);
});

test("notification sender stores valid tokens and removes invalid registrations", async () => {
  const deleted = [];
  const sent = [];
  const docs = [
    { id: "good", data: () => ({ token: "good-token", enabled: true }) },
    { id: "invalid", data: () => ({ token: "invalid-token", enabled: true }) },
  ];
  const collection = {
    where() { return this; },
    limit() { return this; },
    async get() { return { docs }; },
    doc(id) { return { delete: async () => deleted.push(id) }; },
  };
  const db = { collection: () => collection };
  const messaging = {
    async sendEachForMulticast(message) {
      sent.push(message);
      return {
        responses: [
          { success: true },
          { success: false, error: { code: "messaging/registration-token-not-registered" } },
        ],
      };
    },
  };

  const result = await sendOrderNotifications({
    db,
    messaging,
    userId: "user-1",
    transactionId: "order-1",
    before: { status: "Sin comprobante" },
    after: { status: "Pendiente" },
  });

  assert.deepEqual(result, { sent: 1, removed: 1, skipped: false });
  assert.deepEqual(deleted, ["invalid"]);
  assert.equal(sent.length, 1);
  assert.equal(sent[0].tokens.length, 2);
  assert.equal(sent[0].data.status, "Pendiente");
  assert.match(sent[0].webpush.fcmOptions.link, /view=history/);
});
