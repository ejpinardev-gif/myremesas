import test from "node:test";
import assert from "node:assert/strict";
import {
  MAX_RECEIPT_SIZE_BYTES,
  getReceiptFileValidationError,
  getTransactionDestinationValidationError,
  sanitizeReceiptFileName,
} from "../public/order-validation.mjs";

test("receipt validation accepts images and PDFs", () => {
  assert.equal(getReceiptFileValidationError({ type: "image/png", size: 1024 }), null);
  assert.equal(getReceiptFileValidationError({ type: "application/pdf", size: 1024 }), null);
  assert.match(getReceiptFileValidationError({ type: "text/plain", size: 10 }), /imagen o un archivo PDF/);
  assert.match(getReceiptFileValidationError({ type: "image/png", size: MAX_RECEIPT_SIZE_BYTES + 1 }), /8 MB/);
  assert.match(getReceiptFileValidationError({ type: "image/png", size: 0 }), /vacío/);
});

test("receipt filenames remove path separators and unsafe characters", () => {
  assert.equal(sanitizeReceiptFileName('../../my receipt (1).PNG'), 'my-receipt-1.png');
  assert.equal(sanitizeReceiptFileName('证明.pdf'), 'comprobante.pdf');
  assert.equal(sanitizeReceiptFileName(''), 'comprobante');
});

test("CLP orders require an admin destination account", () => {
  assert.match(
    getTransactionDestinationValidationError({
      amountSend: 1000,
      currencySend: "CLP",
      currencyReceive: "VES",
      hasAdminDestination: false,
    }),
    /Selecciona la cuenta/,
  );
});

test("USDT orders require wallet and network", () => {
  assert.match(
    getTransactionDestinationValidationError({
      amountSend: 10,
      currencySend: "CLP",
      currencyReceive: "USDT",
      hasAdminDestination: true,
      usdtDestination: { wallet: "", network: "TRC20" },
    }),
    /wallet/,
  );
  assert.match(
    getTransactionDestinationValidationError({
      amountSend: 10,
      currencySend: "CLP",
      currencyReceive: "USDT",
      hasAdminDestination: true,
      usdtDestination: { wallet: "wallet", network: "" },
    }),
    /red USDT/,
  );
});

test("VES orders require every beneficiary field", () => {
  const baseDestination = {
    beneficiary: "Maria Perez",
    idNumber: "V-123",
    bank: "Banco de Venezuela",
    accountType: "Ahorro",
    accountNumber: "0102",
  };
  assert.equal(
    getTransactionDestinationValidationError({
      amountSend: 1000,
      currencySend: "CLP",
      currencyReceive: "VES",
      hasAdminDestination: true,
      vesDestination: baseDestination,
    }),
    null,
  );
  assert.match(
    getTransactionDestinationValidationError({
      amountSend: 1000,
      currencySend: "CLP",
      currencyReceive: "VES",
      hasAdminDestination: true,
      vesDestination: { ...baseDestination, accountNumber: "" },
    }),
    /número de cuenta/,
  );
});
