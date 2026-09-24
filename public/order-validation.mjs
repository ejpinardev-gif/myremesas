export const MAX_RECEIPT_SIZE_BYTES = 8 * 1024 * 1024;

export function getReceiptFileValidationError(file) {
    if (!file) return 'Selecciona un archivo.';
    const allowedType = file.type?.startsWith('image/') || file.type === 'application/pdf';
    if (!allowedType) return 'Selecciona una imagen o un archivo PDF.';
    if (file.size > MAX_RECEIPT_SIZE_BYTES) return 'El archivo supera los 8 MB.';
    if (file.size === 0) return 'El archivo está vacío.';
    return null;
}

export function sanitizeReceiptFileName(fileName) {
    const extensionMatch = String(fileName || '').toLowerCase().match(/\.([a-z0-9]{1,5})$/);
    const extension = extensionMatch ? `.${extensionMatch[1]}` : '';
    const baseName = String(fileName || 'comprobante')
        .replace(/\.[^.]+$/, '')
        .normalize('NFKD')
        .replace(/[^a-zA-Z0-9_-]+/g, '-')
        .replace(/-+/g, '-')
        .replace(/^[-_]+|[-_]+$/g, '')
        .slice(0, 100);
    return `${baseName || 'comprobante'}${extension}`;
}

export function getTransactionDestinationValidationError({
    amountSend,
    currencySend,
    currencyReceive,
    hasAdminDestination,
    usdtDestination,
    vesDestination,
}) {
    if (!Number.isFinite(Number(amountSend)) || Number(amountSend) <= 0) {
        return 'Ingresa un monto válido.';
    }
    if (currencySend === 'CLP' && !hasAdminDestination) {
        return 'Selecciona la cuenta donde realizarás la transferencia.';
    }
    if (currencyReceive === 'USDT') {
        if (!usdtDestination?.wallet?.trim()) return 'Ingresa tu wallet o Binance ID.';
        if (!usdtDestination?.network) return 'Selecciona la red USDT.';
    }
    if (currencyReceive === 'VES') {
        const requiredFields = [
            ['beneficiario', vesDestination?.beneficiary],
            ['documento', vesDestination?.idNumber],
            ['banco', vesDestination?.bank],
            ['tipo de cuenta', vesDestination?.accountType],
            ['número de cuenta', vesDestination?.accountNumber],
        ];
        const missingField = requiredFields.find(([, value]) => !String(value || '').trim());
        if (missingField) return `Completa el ${missingField[0]} de la cuenta VES.`;
    }
    return null;
}
