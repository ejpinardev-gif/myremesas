const MAX_TOKENS_PER_BATCH = 500;
const CANONICAL_APP_URL = "https://myremesas-prod-deploy.vercel.app";
const NOTIFIABLE_STATUSES = new Set(["Pendiente", "Completado", "Cancelada"]);
const INVALID_TOKEN_CODES = new Set([
  "messaging/invalid-registration-token",
  "messaging/registration-token-not-registered",
]);

function shortTransactionId(transactionId) {
  const normalized = String(transactionId || "").trim();
  return normalized ? normalized.slice(0, 8).toUpperCase() : "SIN ID";
}

function getOrderUrl(transactionId) {
  return `${CANONICAL_APP_URL}/?view=history&order=${encodeURIComponent(transactionId || "")}`;
}

function shouldNotifyOrderStatus(before, after) {
  if (!after) return false;
  if (!before) return true;
  return before.status !== after.status && NOTIFIABLE_STATUSES.has(after.status);
}

function buildOrderNotification({ transactionId, before, after }) {
  if (!shouldNotifyOrderStatus(before, after)) return null;

  const shortId = shortTransactionId(transactionId);
  let title;
  let body;

  if (!before) {
    title = "Orden registrada";
    body = `Tu orden ${shortId} está lista para continuar.`;
  } else if (after.status === "Pendiente") {
    title = "Comprobante recibido";
    body = `Tu orden ${shortId} quedó pendiente de revisión.`;
  } else if (after.status === "Completado") {
    title = "Orden completada";
    body = `Tu orden ${shortId} fue completada.`;
  } else if (after.status === "Cancelada") {
    title = "Orden cancelada";
    body = `Tu orden ${shortId} fue cancelada.`;
  } else {
    title = "Orden actualizada";
    body = `Tu orden ${shortId} cambió de estado.`;
  }

  return {
    title,
    body,
    url: getOrderUrl(transactionId),
    transactionId: String(transactionId || ""),
    status: String(after.status || ""),
  };
}

function isInvalidTokenError(error) {
  return Boolean(error && INVALID_TOKEN_CODES.has(error.code));
}

async function removeInvalidTokenDocuments(db, collectionPath, entries, indexes) {
  const removals = indexes.map((index) => db.collection(collectionPath).doc(entries[index].id).delete());
  const results = await Promise.allSettled(removals);
  return results.filter((result) => result.status === "fulfilled").length;
}

async function sendOrderNotifications({ db, messaging, userId, transactionId, before, after }) {
  const notification = buildOrderNotification({ transactionId, before, after });
  if (!notification) return { sent: 0, removed: 0, skipped: true };

  const collectionPath = `artifacts/1:775892034675:web:98ed2724bcaff2ed427606/users/${userId}/notificationTokens`;
  const tokenSnapshot = await db.collection(collectionPath)
    .where("enabled", "==", true)
    .limit(MAX_TOKENS_PER_BATCH)
    .get();
  const entries = tokenSnapshot.docs
    .map((document) => ({ id: document.id, token: document.data().token }))
    .filter(({ token }) => typeof token === "string" && token.length > 0 && token.length <= 4096);

  if (!entries.length) return { sent: 0, removed: 0, skipped: true };

  let sent = 0;
  let removed = 0;
  for (let offset = 0; offset < entries.length; offset += MAX_TOKENS_PER_BATCH) {
    const batch = entries.slice(offset, offset + MAX_TOKENS_PER_BATCH);
    const response = await messaging.sendEachForMulticast({
      tokens: batch.map(({ token }) => token),
      data: {
        title: notification.title,
        body: notification.body,
        url: notification.url,
        transactionId: notification.transactionId,
        status: notification.status,
      },
      webpush: {
        fcmOptions: {
          link: notification.url,
        },
      },
    });

    response.responses.forEach((result, index) => {
      if (result.success) {
        sent += 1;
        return;
      }
      if (isInvalidTokenError(result.error)) {
        result.invalidToken = true;
      }
    });

    const invalidIndexes = response.responses
      .map((result, index) => (result.success || !isInvalidTokenError(result.error) ? -1 : index))
      .filter((index) => index >= 0);
    if (invalidIndexes.length) {
      removed += await removeInvalidTokenDocuments(db, collectionPath, batch, invalidIndexes);
    }
  }

  return { sent, removed, skipped: false };
}

module.exports = {
  buildOrderNotification,
  getOrderUrl,
  isInvalidTokenError,
  sendOrderNotifications,
  shouldNotifyOrderStatus,
};
