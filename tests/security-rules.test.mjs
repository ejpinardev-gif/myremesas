import test, { after, before, beforeEach } from "node:test";
import assert from "node:assert/strict";
import fs from "node:fs";
import {
  assertFails,
  assertSucceeds,
  initializeTestEnvironment,
} from "@firebase/rules-unit-testing";
import {
  deleteDoc,
  doc,
  getDoc,
  serverTimestamp,
  setDoc,
  updateDoc,
} from "firebase/firestore";
import {
  deleteObject,
  getDownloadURL,
  ref,
  uploadBytes,
} from "firebase/storage";

const PROJECT_ID = "demo-myremesas-rules";
const APP_ID = "1:775892034675:web:98ed2724bcaff2ed427606";
const OWNER_UID = "user-owner";
const OTHER_UID = "user-other";
const ADMIN_UID = "R3QU4xRLmSQFiArCWWRwGBMEOhc2";
const RECEIPT_URL = `https://firebasestorage.googleapis.com/v0/b/demo/o/artifacts%2F${APP_ID}%2Fusers%2F${OWNER_UID}%2Ftransactions%2Forder-1%2Freceipts%2Fuser%2Freceipt.png?alt=media&token=test`;

let testEnv;

before(async () => {
  testEnv = await initializeTestEnvironment({
    projectId: PROJECT_ID,
    firestore: {
      host: "127.0.0.1",
      port: 8080,
      rules: fs.readFileSync("firestore.rules", "utf8"),
    },
    storage: {
      host: "127.0.0.1",
      port: 9199,
      rules: fs.readFileSync("storage.rules", "utf8"),
    },
  });
});

after(async () => {
  await testEnv?.cleanup();
});

beforeEach(async () => {
  await testEnv.clearFirestore();
});

function userContext(uid) {
  return testEnv.authenticatedContext(uid, { email: `${uid}@example.com` });
}

function userDb(uid) {
  return userContext(uid).firestore();
}

function transactionRef(uid = OWNER_UID, transactionId = "order-1") {
  return doc(
    userContext(uid).firestore(),
    "artifacts",
    APP_ID,
    "users",
    uid,
    "transactions",
    transactionId,
  );
}

async function seedTransaction(uid = OWNER_UID, transactionId = "order-1", data = validTransaction(uid)) {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(
      doc(context.firestore(), "artifacts", APP_ID, "users", uid, "transactions", transactionId),
      data,
    );
  });
}

function validTransaction(uid = OWNER_UID) {
  return {
    amountSend: 100000,
    currencySend: "CLP",
    amountReceive: 28500,
    currencyReceive: "VES",
    rateApplied: 0.285,
    timestamp: serverTimestamp(),
    userId: uid,
    status: "Sin comprobante",
    userReceiptUrl: null,
    adminReceiptUrl: null,
    userEmail: `${uid}@example.com`,
  };
}

test("unauthenticated users cannot read a user transaction", async () => {
  const db = testEnv.unauthenticatedContext().firestore();
  const ref = doc(db, "artifacts", APP_ID, "users", OWNER_UID, "transactions", "order-1");

  await assertFails(getDoc(ref));
});

test("clients cannot create transactions directly; the trusted function owns creation", async () => {
  await assertFails(setDoc(transactionRef(), validTransaction()));
});

test("destination metadata is written by the trusted path, not by clients", async () => {
  const db = userDb(OWNER_UID);
  const clpRef = doc(db, "artifacts", APP_ID, "users", OWNER_UID, "transactions", "clp-order");
  await assertFails(setDoc(clpRef, {
    ...validTransaction(),
    adminDestinationAccount: {
      id: "account-1",
      bankName: "Banco Estado",
      accountHolder: "Account Holder",
      rut: "12345678-9",
      accountType: "Cuenta Corriente",
      accountNumber: "123456789",
      email: "N/A",
      savedAt: serverTimestamp(),
    },
  }));

  await seedTransaction(OWNER_UID, "trusted-order", {
    ...validTransaction(),
    userUsdtDestination: {
      wallet: "wallet",
      network: "TRC20",
      notes: "",
    },
  });
  await assertSucceeds(getDoc(transactionRef(OWNER_UID, "trusted-order")));
});

test("a user cannot create a transaction for another uid or with a forged status", async () => {
  const db = userDb(OWNER_UID);
  const ownRef = doc(db, "artifacts", APP_ID, "users", OWNER_UID, "transactions", "forged-user");
  const statusRef = doc(db, "artifacts", APP_ID, "users", OWNER_UID, "transactions", "forged-status");

  await assertFails(setDoc(ownRef, validTransaction(OTHER_UID)));
  await assertFails(setDoc(statusRef, {
    ...validTransaction(),
    status: "Completado",
    adminReceiptUrl: RECEIPT_URL,
  }));
});

test("a user can upload a receipt but cannot alter order amounts", async () => {
  const db = userDb(OWNER_UID);
  const ref = transactionRef();
  await seedTransaction();

  await assertFails(updateDoc(ref, { amountReceive: 999999 }));
  await assertSucceeds(updateDoc(ref, {
    userReceiptUrl: RECEIPT_URL,
    userReceiptUploadedAt: serverTimestamp(),
    status: "Pendiente",
  }));
});

test("a user can cancel only a non-final order", async () => {
  const db = userDb(OWNER_UID);
  const activeRef = transactionRef(OWNER_UID, "active-order");
  const cancelledRef = transactionRef(OWNER_UID, "cancelled-order");
  await seedTransaction(OWNER_UID, "active-order");
  await seedTransaction(OWNER_UID, "cancelled-order");
  await assertSucceeds(updateDoc(activeRef, {
    status: "Cancelada",
    cancelledAt: serverTimestamp(),
  }));
  await assertSucceeds(updateDoc(cancelledRef, {
    status: "Cancelada",
    cancelledAt: serverTimestamp(),
  }));

  await assertFails(updateDoc(cancelledRef, {
    userReceiptUrl: RECEIPT_URL,
    userReceiptUploadedAt: serverTimestamp(),
    status: "Pendiente",
  }));
});

test("another user cannot read the transaction", async () => {
  const db = userDb(OWNER_UID);
  await seedTransaction();
  const otherRef = doc(
    userDb(OTHER_UID),
    "artifacts",
    APP_ID,
    "users",
    OWNER_UID,
    "transactions",
    "order-1",
  );

  await assertFails(getDoc(otherRef));
});

test("an admin can read and complete a user transaction", async () => {
  await seedTransaction();
  const adminDb = userDb(ADMIN_UID);
  const adminRef = doc(
    adminDb,
    "artifacts",
    APP_ID,
    "users",
    OWNER_UID,
    "transactions",
    "order-1",
  );

  await assertSucceeds(getDoc(adminRef));
  await assertSucceeds(updateDoc(adminRef, {
    status: "Completado",
    adminReceiptUrl: RECEIPT_URL,
    completedAt: serverTimestamp(),
  }));
});

test("pricing is publicly readable but only admins can write it", async () => {
  await testEnv.withSecurityRulesDisabled(async (context) => {
    await setDoc(doc(context.firestore(), "config", "pricing"), {
      discountWldClp: 0.14,
      discountClpVes: 0.06,
      marginUsdtClp: 0.004,
      updatedAt: serverTimestamp(),
      updatedBy: ADMIN_UID,
    });
  });

  const publicRef = doc(testEnv.unauthenticatedContext().firestore(), "config", "pricing");
  const userWriteRef = doc(userDb(OWNER_UID), "config", "pricing");
  const adminWriteRef = doc(userDb(ADMIN_UID), "config", "pricing");
  await assertSucceeds(getDoc(publicRef));
  await assertFails(updateDoc(userWriteRef, { marginUsdtClp: 0.5 }));
  await assertSucceeds(updateDoc(adminWriteRef, {
    discountWldClp: 0.14,
    discountClpVes: 0.06,
    marginUsdtClp: 0.004,
    updatedAt: serverTimestamp(),
    updatedBy: ADMIN_UID,
  }));
});

test("storage accepts only owner image or PDF uploads and limits deletion to admins", async () => {
  const ownerStorage = testEnv.authenticatedContext(OWNER_UID).storage();
  const path = `artifacts/${APP_ID}/users/${OWNER_UID}/transactions/order-1/receipts/user/receipt.png`;
  const fileRef = ref(ownerStorage, path);

  await assertSucceeds(uploadBytes(fileRef, new Blob(["fake-png"], { type: "image/png" })));
  await assertFails(deleteObject(fileRef));

  const otherStorage = testEnv.authenticatedContext(OTHER_UID).storage();
  await assertFails(getDownloadURL(ref(otherStorage, path)));

  const adminStorage = testEnv.authenticatedContext(ADMIN_UID).storage();
  await assertSucceeds(deleteObject(ref(adminStorage, path)));
});

test("storage rejects non-image, non-PDF uploads", async () => {
  const ownerStorage = testEnv.authenticatedContext(OWNER_UID).storage();
  const path = `artifacts/${APP_ID}/users/${OWNER_UID}/transactions/order-2/receipts/user/payload.txt`;
  const fileRef = ref(ownerStorage, path);

  await assertFails(uploadBytes(fileRef, new Blob(["not-a-receipt"], { type: "text/plain" })));
});
