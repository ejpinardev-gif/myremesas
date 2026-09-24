import {
    getReceiptFileValidationError,
    getTransactionDestinationValidationError,
    sanitizeReceiptFileName,
} from './order-validation.mjs';

import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";

import { getAuth, onAuthStateChanged, createUserWithEmailAndPassword, signInWithEmailAndPassword, signOut, sendPasswordResetEmail } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";

import { getFirestore, doc, onSnapshot, collection, query, orderBy, limit, startAfter, serverTimestamp, setLogLevel, deleteDoc, setDoc, updateDoc, collectionGroup, getDoc, getDocs } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

import { getStorage, ref as storageRef, uploadBytes, getDownloadURL } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-storage.js";

import { deleteToken, getMessaging, getToken, isSupported, onMessage } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-messaging.js";

// Evita ruido excesivo y costos de diagnóstico confusos en producción
setLogLevel('error');

// --- CONFIGURACIN DE SEGURIDAD ---
// Lista de User IDs de administradores autorizados para ver el panel.
const ADMIN_UIDS = [
    'R3QU4xRLmSQFiArCWWRwGBMEOhc2',
    '71YiNOk9MOc6mNjxnnKBLST1Clh2',
];

const PASSWORD_RESET_URL = 'https://myremesas-prod-deploy.vercel.app/';
const CREATE_ORDER_API_URL = 'https://us-central1-studio-7601782447-44d81.cloudfunctions.net/createOrder';
const FCM_SERVICE_WORKER_PATH = '/firebase-messaging-sw.js';
const FCM_VAPID_KEY = document.querySelector('meta[name="fcm-vapid-key"]')?.content?.trim() || '';

// Variables Globales de Firebase (provistas por el entorno)
const appId = "1:775892034675:web:98ed2724bcaff2ed427606";
const firebaseConfig = {"apiKey":"AIzaSyCnXU8XU7ZzA_12CDaYaY9W2rWBmkGLB-g","authDomain":"studio-7601782447-44d81.firebaseapp.com","projectId":"studio-7601782447-44d81","storageBucket":"studio-7601782447-44d81.firebasestorage.app","messagingSenderId":"775892034675","appId":"1:775892034675:web:98ed2724bcaff2ed427606"};

let db;
let auth;
let storage;
let firebaseApp;
let messaging;
let messagingUnsubscribe;
let pushRegistration;
let currentPushToken;
let userId = null;
let isAuthReady = false;

// Tasas de cambio en vivo / referenciales
let liveRates = {
    WLD_to_USDT: 2.80,
    USDT_to_CLP: 950.00,
    USDT_to_VES: 36.50
};

// Cuentas de destino del administrador
let adminAccounts = [];

// Configuracin de mrgenes
const DEFAULT_MARGIN_CONFIG = {
    discountWldClp: 0.14,
    discountClpVes: 0.06,
    marginUsdtClp: 0.004,
};
const MARGIN_CONFIG_COLLECTION = 'config';
const MARGIN_CONFIG_DOC_ID = 'pricing';
let marginConfig = { ...DEFAULT_MARGIN_CONFIG };
let marginConfigUnsubscribe = null;

// --- DECLARACIN DE VARIABLES DEL DOM ---
let userIdDisplay, userIdContainer, authStatus, amountSendInput, currencySendSelect, currencyReceiveSelect, swapButton, amountReceiveDisplay, rateDisplay, suggestedRateDisplay, paymentButton, errorMessage, historyContainer, loadingHistory, adminPanel, rateFetchStatus, rateLastUpdated, ticketLiveStatus, savedAccountsList, accountCount, wldUsdtDisplay, usdtClpP2pWldDisplay, clpUsdtP2pDisplay, vesUsdtP2pDisplay, usdtClpMarginDisplay, adminBankNameInput, adminAccountHolderInput, adminAccountNumberInput, adminRutInput, adminAccountTypeInput, adminEmailInput, saveAccountsButton, accountStatus, paymentModal, closeModalButton, modalAmountSend, modalAmountReceive, noAccountsMessage, modalCryptoWarning, modalTransferCurrency, adminToggleContainer, marginWldClpInput, marginClpVesInput, marginUsdtClpInput, saveMarginsButton, marginStatus, marginWldClpLabel, marginClpVesLabel, marginUsdtClpLabel, receiptUploadInput, uploadReceiptButton, receiptUploadStatus, adminTransactionsSection, adminPendingTransactionsList, adminCompletedTransactionsList, adminOrdersStatus, adminLoadMoreButton, usdtDestinationForm, usdtWalletInput, usdtNetworkSelect, usdtNotesInput, vesDestinationForm, vesBeneficiaryInput, vesIdInput, vesBankInput, vesAccountTypeInput, vesAccountNumberInput, vesNotesInput, imageViewerModal, closeImageViewerButton, imageViewerImg, imageViewerTitle, orderCreationSection, adminAccountSelect, selectedAdminAccountDetails, binanceBalanceCard, usdtBalanceDisplay, refreshUsdtBalanceButton, usdtBalanceStatus, menuToggleButton, appNavMenu, menuBackdrop, menuCloseButton, menuUserEmail, menuLogoutButton, historySection, amountLoadingIndicator, historyLoadMoreButton;

let currentTransactionId = null;
let currentTransactionPath = null;
let currentTransactionRef = null;
let currentTransactionDraft = null;
let isCurrentUserAdmin = false;
let adminTransactionsUnsubscribe = null;
let transactionListenerUnsubscribe = null;
let adminAccountsUnsubscribe = null;
let authContainer, appContainer, authFormsSection, registerForm, loginForm, resetPasswordForm, logoutButton, showRegisterButton, showLoginButton, showResetPasswordButton, showLoginFromResetButton;
let pushNotificationControl, pushNotificationStatus, enablePushNotificationsButton, disablePushNotificationsButton;
let adminHistoryCallout;
let registerStatus, loginStatus, resetPasswordStatus;
let usdtDestinationSaveTimeout = null;
let vesDestinationSaveTimeout = null;
let ratesFetchDebounceTimeout = null;
let isFetchingDynamicRates = false;
let activeView = null;
let hasLoadedUserHistory = false;
let hasLoadedAdminOrders = false;
let hasLoadedAdminConfigRealtime = false;
let adminTransactionsCursor = null;
let adminTransactionsHasMore = false;
let userTransactionsCursor = null;
let userTransactionsHasMore = false;
let userTransactionsCache = [];
const ADMIN_TRANSACTIONS_PAGE_SIZE = 20;
const USER_TRANSACTIONS_PAGE_SIZE = 20;
const LIVE_RATES_CACHE_KEY = 'myremesas-live-rates-cache';
const CLIENT_RATES_MIN_REFRESH_MS = 30_000;
let lastLiveRatesAt = null;
let lastLiveRatesWereFallback = true;
let lastFocusedElement = null;
/**
 * Redondea un número con el número especificado de decimales (redondeo matemático estándar)
 * @param {number} value - Valor a redondear
 * @param {number} decimals - Número de decimales (default: 2)
 * @returns {number} Valor redondeado
 */
function isPositiveFiniteNumber(value) {
    const parsed = Number(value);
    return Number.isFinite(parsed) && parsed > 0;
}

function roundToDecimals(value, decimals = 2) {
    const multiplier = Math.pow(10, decimals);
    return Math.round(value * multiplier) / multiplier;
}

/**
 * Formatea un número con redondeo estándar y lo convierte a string con decimales fijos
 * @param {number} value - Valor a formatear
 * @param {number} decimals - Número de decimales (default: 2)
 * @returns {string} Valor formateado
 */
function formatRounded(value, decimals = 2) {
    return roundToDecimals(value, decimals).toFixed(decimals);
}

function renderRateDisplays({ wldSource = 'Referencia', clpSource = 'Referencia', vesSource = 'Referencia', suffix = '' } = {}) {
    if (wldUsdtDisplay) {
        wldUsdtDisplay.textContent = `WLD/USDT (${wldSource}): ${formatRounded(liveRates.WLD_to_USDT, 4)}${suffix}`;
    }
    if (clpUsdtP2pDisplay) {
        clpUsdtP2pDisplay.textContent = `USDT/CLP (${clpSource}): 1 USDT = ${formatRounded(liveRates.USDT_to_CLP, 2)} CLP${suffix}`;
    }
    if (usdtClpP2pWldDisplay) {
        usdtClpP2pWldDisplay.textContent = `USDT/CLP (${clpSource}): ${formatRounded(liveRates.USDT_to_CLP, 2)} CLP / USDT${suffix}`;
    }
    if (vesUsdtP2pDisplay) {
        vesUsdtP2pDisplay.textContent = `USDT/VES (${vesSource}): 1 USDT = ${formatRounded(liveRates.USDT_to_VES, 2)} VES${suffix}`;
    }
}


function initializeDOM() {
    userIdDisplay = document.getElementById('user-id');
    userIdContainer = document.getElementById('user-id-display');
    authStatus = document.getElementById('auth-status');
    amountSendInput = document.getElementById('amount-send');
    currencySendSelect = document.getElementById('currency-send');
    currencyReceiveSelect = document.getElementById('currency-receive');
    swapButton = document.getElementById('swap-button');
    amountReceiveDisplay = document.getElementById('amount-receive-display');
    rateDisplay = document.getElementById('rate-display');
    suggestedRateDisplay = document.getElementById('suggested-rate-display');
    paymentButton = document.getElementById('payment-button');
    errorMessage = document.getElementById('error-message');
    historyContainer = document.getElementById('transaction-history');
    loadingHistory = document.getElementById('loading-history');
    adminPanel = document.getElementById('admin-panel');
    adminToggleContainer = document.getElementById('admin-toggle-container');
    rateFetchStatus = document.getElementById('rate-fetch-status');
    rateLastUpdated = document.getElementById('rate-last-updated');
    ticketLiveStatus = document.getElementById('ticket-live-status');
    savedAccountsList = document.getElementById('saved-accounts-list');
    accountCount = document.getElementById('account-count');
    wldUsdtDisplay = document.getElementById('wld-usdt-display');
    usdtClpP2pWldDisplay = document.getElementById('usdt-clp-p2p-wld-display');
    clpUsdtP2pDisplay = document.getElementById('clp-usdt-p2p-display');
    vesUsdtP2pDisplay = document.getElementById('ves-usdt-p2p-display');
    usdtClpMarginDisplay = document.getElementById('usdt-clp-margin-display');
    adminBankNameInput = document.getElementById('admin-bank-name');
    adminAccountHolderInput = document.getElementById('admin-account-holder');
    adminAccountNumberInput = document.getElementById('admin-account-number');
    adminRutInput = document.getElementById('admin-rut');
    adminAccountTypeInput = document.getElementById('admin-account-type');
    adminEmailInput = document.getElementById('admin-email');
    saveAccountsButton = document.getElementById('save-accounts-button');
    accountStatus = document.getElementById('account-status');
    paymentModal = document.getElementById('payment-details-modal');
    closeModalButton = document.getElementById('close-modal-button');
    modalAmountSend = document.getElementById('modal-amount-send');
    modalAmountReceive = document.getElementById('modal-amount-receive');
    noAccountsMessage = document.getElementById('no-accounts-message');
    modalCryptoWarning = document.getElementById('modal-crypto-warning');
    modalTransferCurrency = document.getElementById('modal-transfer-currency');
    marginWldClpInput = document.getElementById('margin-wld-clp');
    marginClpVesInput = document.getElementById('margin-clp-ves');
    marginUsdtClpInput = document.getElementById('margin-usdt-clp');
    saveMarginsButton = document.getElementById('save-margins-button');
    marginStatus = document.getElementById('margin-status');
    marginWldClpLabel = document.getElementById('margin-wld-clp-label');
    marginClpVesLabel = document.getElementById('margin-clp-ves-label');
    marginUsdtClpLabel = document.getElementById('margin-usdt-clp-label');
    receiptUploadInput = document.getElementById('receipt-upload');
    uploadReceiptButton = document.getElementById('upload-receipt-button');
    receiptUploadStatus = document.getElementById('receipt-upload-status');
    adminTransactionsSection = document.getElementById('admin-transactions-section');
    adminPendingTransactionsList = document.getElementById('admin-pending-transactions');
    adminCompletedTransactionsList = document.getElementById('admin-completed-transactions');
    adminOrdersStatus = document.getElementById('admin-orders-status');
    adminLoadMoreButton = document.getElementById('admin-load-more-button');
    usdtDestinationForm = document.getElementById('usdt-destination-form');
    usdtWalletInput = document.getElementById('usdt-wallet-input');
    usdtNetworkSelect = document.getElementById('usdt-network-select');
    usdtNotesInput = document.getElementById('usdt-notes-input');
    vesDestinationForm = document.getElementById('ves-destination-form');
    vesBeneficiaryInput = document.getElementById('ves-beneficiary-input');
    vesIdInput = document.getElementById('ves-id-input');
    vesBankInput = document.getElementById('ves-bank-input');
    vesAccountTypeInput = document.getElementById('ves-account-type-input');
    vesAccountNumberInput = document.getElementById('ves-account-number-input');
    vesNotesInput = document.getElementById('ves-notes-input');
    adminAccountSelect = document.getElementById('admin-account-select');
    selectedAdminAccountDetails = document.getElementById('selected-admin-account-details');
    binanceBalanceCard = document.getElementById('binance-balance-card');
    usdtBalanceDisplay = document.getElementById('usdt-balance-display');
    refreshUsdtBalanceButton = document.getElementById('refresh-usdt-balance');
    usdtBalanceStatus = document.getElementById('usdt-balance-status');
    if (paymentButton) paymentButton.type = 'button';
    applyMarginConfigToUI();
    authContainer = document.getElementById('auth-container');
    appContainer = document.getElementById('app');
    authFormsSection = document.getElementById('auth-forms');
    registerForm = document.getElementById('register-form');
    loginForm = document.getElementById('login-form');
    resetPasswordForm = document.getElementById('reset-password-form');
    logoutButton = document.getElementById('logout-button');
    registerStatus = document.getElementById('register-status');
    loginStatus = document.getElementById('login-status');
    resetPasswordStatus = document.getElementById('reset-password-status');
    showRegisterButton = document.getElementById('show-register-form');
    showLoginButton = document.getElementById('show-login-form');
    showResetPasswordButton = document.getElementById('show-reset-password-form');
    showLoginFromResetButton = document.getElementById('show-login-from-reset');
    imageViewerModal = document.getElementById('image-viewer-modal');
    closeImageViewerButton = document.getElementById('close-image-viewer-button');
    imageViewerImg = document.getElementById('image-viewer-img');
    imageViewerTitle = document.getElementById('image-viewer-title');
    orderCreationSection = document.getElementById('order-creation-section');
    menuToggleButton = document.getElementById('menu-toggle-button');
    appNavMenu = document.getElementById('app-nav-menu');
    menuBackdrop = document.getElementById('menu-backdrop');
    menuCloseButton = document.getElementById('menu-close-button');
    menuUserEmail = document.getElementById('menu-user-email');
    menuLogoutButton = document.getElementById('menu-logout-button');
    historySection = document.getElementById('history-section');
    adminHistoryCallout = document.getElementById('admin-history-callout');
    amountLoadingIndicator = document.getElementById('amount-loading-indicator');
    historyLoadMoreButton = document.getElementById('history-load-more-button');
    pushNotificationControl = document.getElementById('push-notification-control');
    pushNotificationStatus = document.getElementById('push-notification-status');
    enablePushNotificationsButton = document.getElementById('enable-push-notifications');
    disablePushNotificationsButton = document.getElementById('disable-push-notifications');
}

async function initializeFirebase() {
    try {
        if (!firebaseConfig) {
            authStatus.textContent = "Error: Configuración de Firebase no disponible.";
            return;
        }
        const app = initializeApp(firebaseConfig);
        firebaseApp = app;
        db = getFirestore(app);
        auth = getAuth(app);
        storage = getStorage(app);
        setupAuthEventListeners();
        onAuthStateChanged(auth, async (user) => {
            if (user && !user.isAnonymous) {
                authContainer.classList.add('hidden');
                appContainer.classList.remove('hidden');
                userId = user.uid;
                if (user.email) {
                    userIdDisplay.textContent = user.email;
                    if (menuUserEmail) menuUserEmail.textContent = user.email;
                    if (authFormsSection) authFormsSection.classList.add('hidden');
                    logoutButton.classList.remove('hidden');
                } else {
                    userIdDisplay.textContent = `Anónimo (${userId.substring(0, 8)}...)`;
                    if (menuUserEmail) menuUserEmail.textContent = `Anónimo (${userId.substring(0, 8)}...)`;
                    if (authFormsSection) authFormsSection.classList.remove('hidden');
                    logoutButton.classList.add('hidden');
                }
                userIdContainer.classList.remove('hidden');
                authStatus.textContent = "Autenticado. Listo para usar.";
                if (pushNotificationControl) pushNotificationControl.classList.remove('hidden');
                setupPushNotifications(user).catch((error) => {
                    console.warn('No se pudo inicializar las notificaciones push:', error);
                });
                isAuthReady = true;
                clearRealtimeListeners();
                const isAdminUser = ADMIN_UIDS.includes(userId);
                isCurrentUserAdmin = isAdminUser;
                if (adminHistoryCallout) adminHistoryCallout.classList.toggle('hidden', !isAdminUser);
                if (isAdminUser) {
                    await loadMarginConfigOnce();
                    await loadAdminAccountsOnce();
                    if (adminToggleContainer) adminToggleContainer.classList.remove('hidden');
                    toggleBinanceBalanceCard(false);
                } else {
                    await loadMarginConfigOnce();
                    toggleBinanceBalanceCard(false);
                    setUsdtBalanceStatus('', false);
                    if (usdtBalanceDisplay) usdtBalanceDisplay.textContent = '--';
                    if (adminTransactionsSection) {
                        adminTransactionsSection.classList.add('hidden');
                        if (adminPendingTransactionsList) adminPendingTransactionsList.innerHTML = '';
                        if (adminCompletedTransactionsList) adminCompletedTransactionsList.innerHTML = '';
                    }
                }
                hasLoadedUserHistory = false;
                hasLoadedAdminOrders = false;
                hasLoadedAdminConfigRealtime = false;
                adminTransactionsCursor = null;
                adminTransactionsHasMore = false;
                await activateView(getInitialView());
            } else {
                if (user && user.isAnonymous) {
                    await signOut(auth);
                }
                clearRealtimeListeners();
                clearAuthFormStatuses();
                userId = null;
                isCurrentUserAdmin = false;
                if (menuUserEmail) menuUserEmail.textContent = 'No autenticado';
                if(authStatus) authStatus.textContent = "Por favor, inicie sesión o regístrese.";
                if(userIdContainer) userIdContainer.classList.add('hidden');
                if (authFormsSection) authFormsSection.classList.remove('hidden');
                if (pushNotificationControl) pushNotificationControl.classList.add('hidden');
                if (adminHistoryCallout) adminHistoryCallout.classList.add('hidden');
                if (loginForm) loginForm.classList.remove('hidden');
                if (registerForm) registerForm.classList.add('hidden');
                if (resetPasswordForm) resetPasswordForm.classList.add('hidden');
                if(logoutButton) logoutButton.classList.add('hidden');
                if (adminPanel) adminPanel.classList.add('hidden');
                if (adminToggleContainer) adminToggleContainer.classList.add('hidden');
                if (historyContainer) historyContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Inicie sesión para ver su historial.</p>';
                if (adminTransactionsSection) adminTransactionsSection.classList.add('hidden');
                authContainer.classList.remove('hidden');
                appContainer.classList.add('hidden');
                marginConfig = { ...DEFAULT_MARGIN_CONFIG };
                applyMarginConfigToUI();
                toggleBinanceBalanceCard(false);
                setUsdtBalanceStatus('', false);
                if (usdtBalanceDisplay) usdtBalanceDisplay.textContent = '--';
                currentTransactionId = null;
                currentTransactionPath = null;
                currentTransactionRef = null;
                currentTransactionDraft = null;
                hasLoadedUserHistory = false;
                hasLoadedAdminOrders = false;
                hasLoadedAdminConfigRealtime = false;
                adminTransactionsCursor = null;
                adminTransactionsHasMore = false;
                activeView = null;
                closeAppMenu();
                updateMenuVisibility();
            }
        });
    } catch (error) {
        console.error("Error al inicializar o autenticar Firebase:", error);
        authStatus.textContent = `Error de Firebase: ${error.message}`;
    }
}

const AUTH_ERROR_MESSAGES = Object.freeze({
    'auth/email-already-in-use': 'Ya existe una cuenta con ese correo.',
    'auth/invalid-credential': 'El correo o la contraseña son incorrectos.',
    'auth/invalid-email': 'Ingresa un correo electrónico válido.',
    'auth/missing-password': 'Ingresa tu contraseña.',
    'auth/operation-not-allowed': 'El acceso con correo y contraseña no está habilitado en Firebase.',
    'auth/too-many-requests': 'Demasiados intentos. Espera unos minutos e intenta nuevamente.',
    'auth/user-disabled': 'Esta cuenta está deshabilitada.',
    'auth/user-not-found': 'El correo o la contraseña son incorrectos.',
    'auth/weak-password': 'La contraseña debe tener al menos 6 caracteres.',
});

function getAuthErrorMessage(error) {
    return AUTH_ERROR_MESSAGES[error?.code] || 'No se pudo completar la operación. Intenta nuevamente.';
}

function clearAuthFormStatuses() {
    [loginStatus, registerStatus, resetPasswordStatus].forEach((status) => {
        if (!status) return;
        status.textContent = '';
        status.classList.add('hidden');
    });
}

function setPushNotificationStatus(message, tone = 'neutral') {
    if (!pushNotificationStatus) return;
    pushNotificationStatus.textContent = message;
    pushNotificationStatus.classList.remove('text-slate-500', 'text-emerald-600', 'text-amber-600', 'text-red-600');
    const toneClass = {
        success: 'text-emerald-600',
        warning: 'text-amber-600',
        error: 'text-red-600',
        neutral: 'text-slate-500',
    }[tone] || 'text-slate-500';
    pushNotificationStatus.classList.add(toneClass);
}

async function getPushTokenDocumentId(token) {
    if (!globalThis.crypto?.subtle) {
        throw new Error('Este navegador no permite registrar notificaciones push.');
    }
    const bytes = new TextEncoder().encode(token);
    const digest = await globalThis.crypto.subtle.digest('SHA-256', bytes);
    return Array.from(new Uint8Array(digest), (byte) => byte.toString(16).padStart(2, '0')).join('');
}

async function ensurePushMessaging() {
    if (!firebaseApp) throw new Error('Firebase no está listo para registrar notificaciones.');
    if (!('serviceWorker' in navigator)) {
        throw new Error('Este navegador no soporta notificaciones push.');
    }
    const supported = await isSupported();
    if (!supported) throw new Error('Este navegador no soporta Firebase Cloud Messaging.');

    if (!pushRegistration) {
        pushRegistration = await navigator.serviceWorker.register(FCM_SERVICE_WORKER_PATH, { scope: '/' });
    }
    if (!messaging) {
        messaging = getMessaging(firebaseApp);
        messagingUnsubscribe = onMessage(messaging, (payload) => {
            const message = payload?.data?.body || payload?.notification?.body;
            if (message) showToast(message, 'info');
        });
    }
    return messaging;
}

async function syncPushNotificationToken(user) {
    const messagingInstance = await ensurePushMessaging();
    const tokenOptions = { serviceWorkerRegistration: pushRegistration };
    if (FCM_VAPID_KEY) tokenOptions.vapidKey = FCM_VAPID_KEY;
    const token = await getToken(messagingInstance, tokenOptions);
    if (!token) throw new Error('El navegador no devolvió un token de notificaciones.');

    const tokenId = await getPushTokenDocumentId(token);
    const tokenRef = doc(db, 'artifacts', appId, 'users', user.uid, 'notificationTokens', tokenId);
    await setDoc(tokenRef, {
        token,
        platform: 'web',
        userAgent: navigator.userAgent.slice(0, 256),
        enabled: true,
        userId: user.uid,
        updatedAt: serverTimestamp(),
    }, { merge: true });
    currentPushToken = token;
    return token;
}

async function setupPushNotifications(user) {
    if (!pushNotificationControl) return;
    pushNotificationControl.classList.remove('hidden');
    if (!('Notification' in window) || !('serviceWorker' in navigator)) {
        setPushNotificationStatus('Notificaciones no disponibles en este navegador.', 'warning');
        if (enablePushNotificationsButton) enablePushNotificationsButton.classList.add('hidden');
        if (disablePushNotificationsButton) disablePushNotificationsButton.classList.add('hidden');
        return;
    }

    const permission = Notification.permission;
    if (permission === 'denied') {
        setPushNotificationStatus('Notificaciones bloqueadas por el navegador.', 'warning');
        if (enablePushNotificationsButton) enablePushNotificationsButton.classList.add('hidden');
        if (disablePushNotificationsButton) disablePushNotificationsButton.classList.add('hidden');
        return;
    }

    if (permission === 'granted') {
        try {
            await syncPushNotificationToken(user);
            setPushNotificationStatus('Notificaciones activadas para este dispositivo.', 'success');
            if (enablePushNotificationsButton) enablePushNotificationsButton.classList.add('hidden');
            if (disablePushNotificationsButton) disablePushNotificationsButton.classList.remove('hidden');
        } catch (error) {
            console.warn('No se pudo sincronizar el token push:', error);
            setPushNotificationStatus('Activa las notificaciones para recibir cambios de tus órdenes.', 'warning');
            if (enablePushNotificationsButton) enablePushNotificationsButton.classList.remove('hidden');
            if (disablePushNotificationsButton) disablePushNotificationsButton.classList.add('hidden');
        }
        return;
    }

    setPushNotificationStatus('Recebe cambios de tus órdenes aunque cierres la app.', 'neutral');
    if (enablePushNotificationsButton) enablePushNotificationsButton.classList.remove('hidden');
    if (disablePushNotificationsButton) disablePushNotificationsButton.classList.add('hidden');
}

async function requestPushNotifications() {
    if (!auth?.currentUser) return;
    if (enablePushNotificationsButton) enablePushNotificationsButton.disabled = true;
    setPushNotificationStatus('Solicitando permiso...', 'neutral');
    try {
        const permission = await Notification.requestPermission();
        if (permission !== 'granted') {
            throw new Error('El permiso de notificaciones no fue concedido.');
        }
        await syncPushNotificationToken(auth.currentUser);
        setPushNotificationStatus('Notificaciones activadas para este dispositivo.', 'success');
        if (enablePushNotificationsButton) enablePushNotificationsButton.classList.add('hidden');
        if (disablePushNotificationsButton) disablePushNotificationsButton.classList.remove('hidden');
        showToast('Notificaciones de órdenes activadas.', 'success');
    } catch (error) {
        console.warn('No se pudieron activar las notificaciones push:', error);
        setPushNotificationStatus('No se pudieron activar las notificaciones.', 'error');
        showToast(error?.message || 'No se pudieron activar las notificaciones.', 'error');
    } finally {
        if (enablePushNotificationsButton) enablePushNotificationsButton.disabled = false;
    }
}

async function clearStoredPushTokens(uid) {
    if (!db || !uid) return;
    const tokenCollection = collection(db, 'artifacts', appId, 'users', uid, 'notificationTokens');
    const snapshot = await getDocs(tokenCollection);
    await Promise.allSettled(snapshot.docs.map((tokenDocument) => deleteDoc(tokenDocument.ref)));
}

async function disablePushNotifications({ silent = false, uid = userId } = {}) {
    try {
        if (messaging) await deleteToken(messaging);
        await clearStoredPushTokens(uid);
        currentPushToken = null;
        setPushNotificationStatus('Notificaciones desactivadas para este dispositivo.', 'neutral');
        if (enablePushNotificationsButton) enablePushNotificationsButton.classList.remove('hidden');
        if (disablePushNotificationsButton) disablePushNotificationsButton.classList.add('hidden');
        if (!silent) showToast('Notificaciones desactivadas.', 'success');
    } catch (error) {
        console.warn('No se pudieron desactivar las notificaciones push:', error);
        if (!silent) {
            setPushNotificationStatus('No se pudieron desactivar las notificaciones.', 'error');
            showToast('No se pudieron desactivar las notificaciones.', 'error');
        }
    }
}

async function logoutCurrentUser() {
    await disablePushNotifications({ silent: true });
    try {
        await signOut(auth);
    } catch (error) {
        console.error('Error al cerrar sesión:', error);
        showToast('No se pudo cerrar la sesión. Intenta nuevamente.', 'error');
    }
}

function getInitialView() {
    const requestedView = new URLSearchParams(window.location.search).get('view');
    return requestedView === 'history' ? 'history' : 'calculator';
}

function setAuthFormBusy(form, isBusy, busyLabel = 'Procesando...') {
    const submitButton = form?.querySelector('button[type="submit"]');
    if (!submitButton) return;
    if (isBusy) {
        submitButton.dataset.originalLabel = submitButton.textContent;
        submitButton.textContent = busyLabel;
    } else {
        submitButton.textContent = submitButton.dataset.originalLabel || submitButton.textContent;
    }
    submitButton.disabled = isBusy;
}

function setupAuthEventListeners() {
    const loginFormElement = loginForm?.querySelector('form');
    if (loginFormElement) {
        loginFormElement.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('login-email').value.trim();
            const password = document.getElementById('login-password').value;
            try {
                loginStatus.classList.add('hidden');
                setAuthFormBusy(loginFormElement, true, 'Entrando...');
                await signInWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error('Error de inicio de sesión:', error);
                loginStatus.textContent = getAuthErrorMessage(error);
                loginStatus.classList.remove('hidden');
            } finally {
                setAuthFormBusy(loginFormElement, false);
            }
        });
    }

    const registerFormElement = registerForm?.querySelector('form');
    if (registerFormElement) {
        registerFormElement.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('register-email').value.trim();
            const password = document.getElementById('register-password').value;
            const confirmPassword = document.getElementById('register-password-confirm').value;
            if (password !== confirmPassword) {
                registerStatus.textContent = 'Las contraseñas no coinciden.';
                registerStatus.classList.remove('hidden');
                return;
            }
            try {
                registerStatus.classList.add('hidden');
                setAuthFormBusy(registerFormElement, true, 'Creando cuenta...');
                await createUserWithEmailAndPassword(auth, email, password);
            } catch (error) {
                console.error('Error de registro:', error);
                registerStatus.textContent = getAuthErrorMessage(error);
                registerStatus.classList.remove('hidden');
            } finally {
                setAuthFormBusy(registerFormElement, false);
            }
        });
    }

    const resetFormElement = resetPasswordForm?.querySelector('form');
    if (resetFormElement) {
        resetFormElement.addEventListener('submit', async (event) => {
            event.preventDefault();
            const email = document.getElementById('reset-password-email').value.trim();
            try {
                resetPasswordStatus.textContent = '';
                resetPasswordStatus.className = 'auth-status-error text-slate-300 hidden';
                setAuthFormBusy(resetFormElement, true, 'Enviando...');
                await sendPasswordResetEmail(auth, email, {
                    url: PASSWORD_RESET_URL,
                    handleCodeInApp: false,
                });
                resetPasswordStatus.textContent = 'Si el correo existe, recibirás un enlace para restablecer tu contraseña.';
                resetPasswordStatus.className = 'auth-status-error text-emerald-300';
            } catch (error) {
                console.error('Error al restablecer contraseña:', error);
                resetPasswordStatus.textContent = getAuthErrorMessage(error);
                resetPasswordStatus.className = 'auth-status-error text-red-400';
            } finally {
                setAuthFormBusy(resetFormElement, false);
            }
        });
    }

    showRegisterButton?.addEventListener('click', () => {
        clearAuthFormStatuses();
        loginForm?.classList.add('hidden');
        resetPasswordForm?.classList.add('hidden');
        registerForm?.classList.remove('hidden');
    });

    const showLogin = () => {
        clearAuthFormStatuses();
        registerForm?.classList.add('hidden');
        resetPasswordForm?.classList.add('hidden');
        loginForm?.classList.remove('hidden');
    };
    showLoginButton?.addEventListener('click', showLogin);
    showLoginFromResetButton?.addEventListener('click', showLogin);
    showResetPasswordButton?.addEventListener('click', () => {
        clearAuthFormStatuses();
        loginForm?.classList.add('hidden');
        registerForm?.classList.add('hidden');
        resetPasswordForm?.classList.remove('hidden');
        document.getElementById('reset-password-email')?.focus();
    });

    logoutButton?.addEventListener('click', async () => {
        await logoutCurrentUser();
    });
}

function formatCurrency(value, currencyCode) {
    // Aplicar redondeo estándar antes de formatear
    if (currencyCode === 'WLD') {
        const rounded = roundToDecimals(value, 4);
        return `${rounded.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 4 })} WLD`;
    }
    if (currencyCode === 'USDT') {
        const rounded = roundToDecimals(value, 2);
        return `${rounded.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} USDT`;
    }
    if (currencyCode === 'VES') {
        const rounded = roundToDecimals(value, 2);
        return rounded.toLocaleString('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (currencyCode === 'CLP') {
        const rounded = Math.round(value); // CLP no usa decimales
        return rounded.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    const rounded = roundToDecimals(value, 2);
    return rounded.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

function copyToClipboard(text, element) {
    const textArea = document.createElement('textarea');
    textArea.value = text;
    document.body.appendChild(textArea);
    textArea.select();
    try {
        document.execCommand('copy');
        const feedback = element.querySelector('.copy-feedback');
        if (feedback) {
            feedback.style.opacity = '1';
            feedback.style.transform = 'translateX(-50%) translateY(-5px)';
            setTimeout(() => {
                feedback.style.opacity = '0';
                feedback.style.transform = 'translateX(-50%)';
            }, 1500);
        }
    } catch (err) {
        console.error('Error al copiar texto: ', err);
    }
    document.body.removeChild(textArea);
}

function buildAccountDetailsMarkup(account) {
    const details = [
        { label: 'Banco', value: account.bankName },
        { label: 'Titular', value: account.accountHolder },
        { label: 'RUT', value: account.rut },
        { label: 'Tipo', value: account.accountType },
        { label: 'Numero', value: account.accountNumber },
    ];
    if (account.email && account.email !== 'N/A') {
        details.push({ label: 'Email', value: account.email });
    }
    const sanitizedCopyText = sanitizeCopyText(details);
    const detailsHtml = details.map(d =>
        `<p class="leading-tight"><span class="font-semibold text-slate-500">${escapeHtml(d.label)}:</span> <span class="font-semibold text-slate-900">${escapeHtml(d.value)}</span></p>`
    ).join('');
    return `
        <div class="relative">
            <div class="text-xs md:text-sm text-slate-700 space-y-1">
                ${detailsHtml}
            </div>
            <button class="copy-btn absolute top-0 right-0 p-1.5 text-amber-700 hover:bg-amber-50 rounded-lg text-xs font-semibold" data-copy="${sanitizedCopyText}">
                Copiar
            </button>
            <div class="copy-feedback absolute top-0 right-12 -translate-y-1/2 bg-slate-900 text-white text-xs px-2 py-1 rounded opacity-0 transition-all duration-200 pointer-events-none">
                Copiado!
            </div>
        </div>
    `;
}

function sanitizeCopyText(details) {
    const joined = details.map(d => `${d.label}: ${d.value}`).join('\n');
    return escapeHtml(joined).replace(/\n/g, '&#10;');
}

function buildDetailsSection(title, details, { enableCopy = false } = {}) {
    const cleanDetails = details
        .filter(detail => detail && detail.label && detail.value && String(detail.value).trim() !== '')
        .map(detail => ({
            label: detail.label,
            value: String(detail.value).trim()
        }));
    if (!cleanDetails.length) return '';
    const listItems = cleanDetails.map(detail => `
        <div class="flex items-start justify-between gap-2">
            <span class="text-slate-500">${escapeHtml(detail.label)}:</span>
            <span class="font-semibold text-slate-900 text-right break-words break-all max-w-full">${escapeHtml(detail.value)}</span>
        </div>
    `).join('');
    const sanitizedCopyText = enableCopy ? sanitizeCopyText(cleanDetails) : null;
    const copyMarkup = enableCopy ? `
        <span class="relative inline-flex">
            <button class="copy-btn relative inline-flex items-center gap-1 px-2 py-1 text-xs font-semibold text-amber-700 border border-amber-200 rounded-md bg-white hover:bg-amber-50 transition focus:outline-none focus:ring-2 focus:ring-amber-300" data-copy="${sanitizedCopyText}">
                Copiar datos
                <span class="copy-feedback opacity-0 absolute inset-x-0 -top-6 mx-auto text-xs text-white bg-slate-900 px-2 py-1 rounded transition-all duration-200 pointer-events-none">Copiado!</span>
            </button>
        </span>
    ` : '';
    return `
        <div class="destination-details-block bg-white border border-slate-200 rounded-xl p-3 space-y-2">
            <div class="flex items-start justify-between gap-2">
                <span class="text-xs font-semibold text-slate-700 uppercase tracking-wide sm:text-sm">${escapeHtml(title)}</span>
                ${copyMarkup}
            </div>
            <div class="space-y-1 text-xs sm:text-sm">
                ${listItems}
            </div>
        </div>
    `;
}

function buildDestinationDetailsMarkup(tx, { enableCopy = false } = {}) {
    if (!tx) return '';
    const blocks = [];
    if (tx.adminDestinationAccount) {
        const account = tx.adminDestinationAccount;
        const accountDetails = [
            { label: 'Banco', value: account.bankName },
            { label: 'Titular', value: account.accountHolder },
            { label: 'RUT', value: account.rut },
            { label: 'Tipo', value: account.accountType },
            { label: 'Numero', value: account.accountNumber },
            { label: 'Email', value: account.email },
        ];
        blocks.push(buildDetailsSection('Cuenta para depositar al administrador', accountDetails, { enableCopy }));
    }
    if (tx.userVesDestination) {
        const dest = tx.userVesDestination;
        const destDetails = [
            { label: 'Beneficiario', value: dest.beneficiary },
            { label: 'Documento', value: dest.idNumber },
            { label: 'Banco', value: dest.bank },
            { label: 'Tipo de cuenta', value: dest.accountType },
            { label: 'Numero de cuenta', value: dest.accountNumber },
            { label: 'Notas', value: dest.notes },
        ];
        blocks.push(buildDetailsSection('Cuenta destino (VES)', destDetails, { enableCopy }));
    }
    if (tx.userUsdtDestination) {
        const dest = tx.userUsdtDestination;
        const usdtDetails = [
            { label: 'Wallet', value: dest.wallet },
            { label: 'Red', value: dest.network },
            { label: 'Notas', value: dest.notes },
        ];
        blocks.push(buildDetailsSection('Wallet destino (USDT)', usdtDetails, { enableCopy }));
    }
    return blocks.filter(Boolean).join('');
}

const IMAGE_FILE_REGEX = /\.(png|jpe?g|gif|bmp|webp|svg)$/i;

function isImageLikeUrl(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return IMAGE_FILE_REGEX.test(parsed.pathname.toLowerCase());
    } catch (error) {
        console.warn('No se pudo analizar la URL del comprobante:', error);
        return false;
    }
}

const FOCUSABLE_SELECTOR = [
    'button:not([disabled])',
    '[href]',
    'input:not([disabled])',
    'select:not([disabled])',
    'textarea:not([disabled])',
    '[tabindex]:not([tabindex="-1"])',
].join(',');

function getFocusableElements(container) {
    return [...(container?.querySelectorAll(FOCUSABLE_SELECTOR) || [])]
        .filter(element => element.offsetParent !== null);
}

function openModalElement(modal, initialFocusElement = null) {
    if (!modal) return;
    lastFocusedElement = document.activeElement instanceof HTMLElement
        ? document.activeElement
        : null;
    modal.classList.remove('hidden');
    modal.setAttribute('aria-hidden', 'false');
    requestAnimationFrame(() => {
        const focusTarget = initialFocusElement || getFocusableElements(modal)[0];
        focusTarget?.focus();
    });
}

function closeModalElement(modal) {
    if (!modal) return;
    modal.classList.add('hidden');
    modal.setAttribute('aria-hidden', 'true');
    lastFocusedElement?.focus?.();
}

function keepFocusInsideModal(event, modal) {
    if (event.key !== 'Tab' || !modal || modal.classList.contains('hidden')) return;
    const focusable = getFocusableElements(modal);
    if (!focusable.length) {
        event.preventDefault();
        modal.focus();
        return;
    }
    const first = focusable[0];
    const last = focusable[focusable.length - 1];
    if (event.shiftKey && document.activeElement === first) {
        event.preventDefault();
        last.focus();
    } else if (!event.shiftKey && document.activeElement === last) {
        event.preventDefault();
        first.focus();
    }
}

function isTrustedReceiptUrl(url) {
    try {
        const parsed = new URL(url, window.location.href);
        return parsed.protocol === 'https:' && parsed.hostname === 'firebasestorage.googleapis.com';
    } catch (error) {
        return false;
    }
}

function openReceiptViewer(url, title = 'Comprobante') {
    if (!url) return;
    if (!isTrustedReceiptUrl(url)) {
        showToast('El enlace del comprobante no es válido.', 'error');
        return;
    }
    if (isImageLikeUrl(url) && imageViewerModal && imageViewerImg && imageViewerTitle) {
        imageViewerImg.src = url;
        imageViewerTitle.textContent = title;
        openModalElement(imageViewerModal, closeImageViewerButton);
    } else {
        window.open(url, '_blank', 'noopener,noreferrer');
    }
}

function closeReceiptViewer() {
    if (!imageViewerModal) return;
    closeModalElement(imageViewerModal);
    if (imageViewerImg) imageViewerImg.src = '';
}

function handleViewReceiptButton(button) {
    if (!button) return;
    const url = button.getAttribute('data-url');
    if (!url) {
        showToast('El comprobante no está disponible.', 'error');
        return;
    }
    const title = button.getAttribute('data-title') || 'Comprobante';
    openReceiptViewer(url, title);
}

function getMarginValue(key) {
    const value = Number(marginConfig[key]);
    return Number.isFinite(value) && value >= 0 && value <= 1
        ? value
        : DEFAULT_MARGIN_CONFIG[key];
}

function normalizeMarginConfig(data = {}) {
    const normalize = (value, fallback) => {
        const numeric = Number(value);
        return Number.isFinite(numeric) && numeric >= 0 && numeric <= 1
            ? numeric
            : fallback;
    };
    return {
        discountWldClp: normalize(data.discountWldClp, DEFAULT_MARGIN_CONFIG.discountWldClp),
        discountClpVes: normalize(data.discountClpVes, DEFAULT_MARGIN_CONFIG.discountClpVes),
        marginUsdtClp: normalize(data.marginUsdtClp, DEFAULT_MARGIN_CONFIG.marginUsdtClp),
    };
}

function formatPercent(value) {
    const percent = value * 100;
    if (!Number.isFinite(percent)) return '0';
    return percent.toFixed(2).replace(/\.?0+$/, '');
}

function hideMarginStatus() {
    if (marginStatus) marginStatus.classList.add('hidden');
}

function showMarginStatus(message, isError = false) {
    if (!marginStatus) return;
    marginStatus.textContent = message;
    marginStatus.classList.remove('hidden');
    marginStatus.classList.toggle('text-red-600', isError);
    marginStatus.classList.toggle('text-yellow-800', !isError);
}

function applyMarginConfigToUI() {
    const discountWldClp = getMarginValue('discountWldClp');
    const discountClpVes = getMarginValue('discountClpVes');
    const marginUsdtClp = getMarginValue('marginUsdtClp');
    if (marginWldClpLabel) marginWldClpLabel.textContent = formatPercent(discountWldClp);
    if (marginClpVesLabel) marginClpVesLabel.textContent = formatPercent(discountClpVes);
    if (marginUsdtClpLabel) marginUsdtClpLabel.textContent = formatPercent(marginUsdtClp);
    if (marginWldClpInput && document.activeElement !== marginWldClpInput) marginWldClpInput.value = formatPercent(discountWldClp);
    if (marginClpVesInput && document.activeElement !== marginClpVesInput) marginClpVesInput.value = formatPercent(discountClpVes);
    if (marginUsdtClpInput && document.activeElement !== marginUsdtClpInput) marginUsdtClpInput.value = formatPercent(marginUsdtClp);
    hideMarginStatus();
}

function clearRealtimeListeners() {
    if (marginConfigUnsubscribe) {
        marginConfigUnsubscribe();
        marginConfigUnsubscribe = null;
    }
    if (transactionListenerUnsubscribe) {
        transactionListenerUnsubscribe();
        transactionListenerUnsubscribe = null;
    }
    if (adminAccountsUnsubscribe) {
        adminAccountsUnsubscribe();
        adminAccountsUnsubscribe = null;
    }
    if (adminTransactionsUnsubscribe) {
        adminTransactionsUnsubscribe();
        adminTransactionsUnsubscribe = null;
    }
    adminTransactionsCursor = null;
    adminTransactionsHasMore = false;
    userTransactionsCursor = null;
    userTransactionsHasMore = false;
    userTransactionsCache = [];
    if (historyLoadMoreButton) historyLoadMoreButton.classList.add('hidden');
}

function setAmountLoadingState(isLoading) {
    if (!amountLoadingIndicator) return;
    amountLoadingIndicator.classList.toggle('hidden', !isLoading);
}

function closeAppMenu() {
    const focusedInsideMenu = appNavMenu?.contains(document.activeElement);
    if (focusedInsideMenu && menuToggleButton) {
        menuToggleButton.focus();
    }
    if (appNavMenu) {
        appNavMenu.classList.remove('menu-enter');
        appNavMenu.classList.add('menu-exit');
        appNavMenu.setAttribute('aria-hidden', 'true');
        appNavMenu.inert = true;
        window.setTimeout(() => {
            if (!appNavMenu.classList.contains('menu-enter')) {
                appNavMenu.classList.add('hidden');
            }
        }, 260);
    }
    if (menuBackdrop) menuBackdrop.classList.add('hidden');
    if (menuToggleButton) menuToggleButton.setAttribute('aria-expanded', 'false');
}

function openAppMenu() {
    if (appNavMenu) {
        appNavMenu.classList.remove('hidden');
        appNavMenu.classList.remove('menu-exit');
        appNavMenu.classList.add('menu-enter');
        appNavMenu.setAttribute('aria-hidden', 'false');
        appNavMenu.inert = false;
    }
    if (menuBackdrop) menuBackdrop.classList.remove('hidden');
    if (menuToggleButton) menuToggleButton.setAttribute('aria-expanded', 'true');
}

function docRefFromAbsolutePath(path) {
    if (!db || !path || typeof path !== 'string') return null;
    const normalized = path.split('/').filter(Boolean);
    if (normalized.length % 2 !== 0) return null;
    return doc(db, ...normalized);
}

function closeDataListenersForInactiveViews() {
    if (activeView !== 'history' && transactionListenerUnsubscribe) {
        transactionListenerUnsubscribe();
        transactionListenerUnsubscribe = null;
    }
    if (activeView !== 'history' && historyLoadMoreButton) historyLoadMoreButton.classList.add('hidden');
    if (activeView !== 'admin-orders' && adminTransactionsUnsubscribe) {
        adminTransactionsUnsubscribe();
        adminTransactionsUnsubscribe = null;
    }
    if (activeView !== 'admin-config') {
        if (marginConfigUnsubscribe) {
            marginConfigUnsubscribe();
            marginConfigUnsubscribe = null;
        }
        if (adminAccountsUnsubscribe) {
            adminAccountsUnsubscribe();
            adminAccountsUnsubscribe = null;
        }
        hasLoadedAdminConfigRealtime = false;
    }
}

function formatLiveRatesTimestamp(timestamp) {
    if (!timestamp) return 'Aún no hay una consulta viva registrada.';
    const date = new Date(timestamp);
    if (Number.isNaN(date.getTime())) return 'Aún no hay una consulta viva registrada.';
    return `Última consulta viva: ${date.toLocaleDateString('es-CL')} ${date.toLocaleTimeString('es-CL', { hour: '2-digit', minute: '2-digit' })}`;
}

function updateLiveRatesTimestampLabel() {
    if (!rateLastUpdated) return;
    rateLastUpdated.textContent = formatLiveRatesTimestamp(lastLiveRatesAt);
}

function setTicketLiveStatus(message) {
    if (!ticketLiveStatus) return;
    ticketLiveStatus.textContent = message;
}

function saveLiveRatesCache() {
    try {
        localStorage.setItem(LIVE_RATES_CACHE_KEY, JSON.stringify({
            liveRates,
            lastLiveRatesAt,
            lastLiveRatesWereFallback,
        }));
    } catch (error) {
        console.warn('No se pudo guardar la caché local de tasas:', error);
    }
}

function loadLiveRatesCache() {
    try {
        const raw = localStorage.getItem(LIVE_RATES_CACHE_KEY);
        if (!raw) return;
        const parsed = JSON.parse(raw);
        if (parsed?.liveRates) {
            if (isPositiveFiniteNumber(parsed.liveRates.WLD_to_USDT)) liveRates.WLD_to_USDT = Number(parsed.liveRates.WLD_to_USDT);
            if (isPositiveFiniteNumber(parsed.liveRates.USDT_to_CLP)) liveRates.USDT_to_CLP = Number(parsed.liveRates.USDT_to_CLP);
            if (isPositiveFiniteNumber(parsed.liveRates.USDT_to_VES)) liveRates.USDT_to_VES = Number(parsed.liveRates.USDT_to_VES);
        }
        if (parsed?.lastLiveRatesAt) {
            lastLiveRatesAt = parsed.lastLiveRatesAt;
        }
        if (typeof parsed?.lastLiveRatesWereFallback === 'boolean') {
            lastLiveRatesWereFallback = parsed.lastLiveRatesWereFallback;
        }
    } catch (error) {
        console.warn('No se pudo leer la caché local de tasas:', error);
    }
}

function updateMenuVisibility() {
    const menuButtons = document.querySelectorAll('[data-view]');
    menuButtons.forEach((button) => {
        const isAdminOnly = button.getAttribute('data-admin-only') === 'true';
        button.classList.toggle('hidden', isAdminOnly && !isCurrentUserAdmin);
        button.classList.toggle('active', button.getAttribute('data-view') === activeView);
    });
}

function setAdminOrdersStatus(message, isError = false) {
    if (!adminOrdersStatus) return;
    adminOrdersStatus.textContent = message;
    adminOrdersStatus.classList.toggle('text-red-600', isError);
    adminOrdersStatus.classList.toggle('text-slate-500', !isError);
}

function updateAdminLoadMoreButton() {
    if (!adminLoadMoreButton) return;
    adminLoadMoreButton.classList.toggle('hidden', !adminTransactionsHasMore || activeView !== 'admin-orders');
}

async function activateView(viewName) {
    if (!viewName) return;

    activeView = viewName;
    document.querySelectorAll('[data-view-panel]').forEach((panel) => {
        panel.classList.toggle('hidden', panel.getAttribute('data-view-panel') !== viewName);
    });
    updateMenuVisibility();
    closeDataListenersForInactiveViews();

    if (viewName === 'history') {
        hasLoadedUserHistory = true;
        if (loadingHistory) loadingHistory.textContent = 'Cargando historial...';
        setupTransactionListener();
    } else if (loadingHistory) {
        loadingHistory.textContent = 'Abre esta vista para cargar el historial.';
    }

    if (viewName === 'admin-orders' && isCurrentUserAdmin) {
        hasLoadedAdminOrders = true;
        await setupAdminTransactionsListener();
    }

    if (viewName === 'admin-config' && isCurrentUserAdmin) {
        if (!hasLoadedAdminConfigRealtime) {
            hasLoadedAdminConfigRealtime = true;
            setupMarginConfigListener();
            setupAdminAccountsListener();
        }
        if (rateFetchStatus) {
            rateFetchStatus.textContent = 'Usa "Actualizar tasas" o ingresa un monto en la calculadora para consultar referencias P2P en vivo.';
        }
        refreshBinanceBalance().catch(error => console.error('Error al obtener saldo Binance:', error));
    }

    if (appNavMenu) {
        closeAppMenu();
    }
}

async function loadMarginConfigOnce() {
    if (!db) return;
    try {
        const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);
        const snapshot = await getDoc(configDocRef);
        if (snapshot.exists()) {
            marginConfig = normalizeMarginConfig(snapshot.data());
        } else {
            marginConfig = { ...DEFAULT_MARGIN_CONFIG };
        }
    } catch (error) {
        console.error('Error al cargar márgenes:', error);
        marginConfig = { ...DEFAULT_MARGIN_CONFIG };
    }
    applyMarginConfigToUI();
    calculateExchange();
}

function applyAdminAccountsSnapshot(snapshot) {
    adminAccounts = snapshot.docs.map(doc => ({ id: doc.id, ...doc.data() }));
    adminAccounts.sort((a, b) => String(a.bankName || '').localeCompare(String(b.bankName || '')));
    renderAdminAccountsList();
    if (accountCount) accountCount.textContent = adminAccounts.length;
}

async function loadAdminAccountsOnce() {
    if (!isAuthReady || !db) return;
    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
    try {
        const q = query(collection(db, collectionPath));
        const snapshot = await getDocs(q);
        applyAdminAccountsSnapshot(snapshot);
    } catch (error) {
        console.error('Error al cargar cuentas:', error);
        if (accountStatus) accountStatus.textContent = 'Error al cargar cuentas.';
    }
}

function buildAdminDestinationAccountPayload(selectedAccount, { includeTimestamp = false } = {}) {
    if (!selectedAccount) return null;
    const payload = {
        id: selectedAccount.id || '',
        bankName: selectedAccount.bankName || '',
        accountHolder: selectedAccount.accountHolder || '',
        rut: selectedAccount.rut || '',
        accountType: selectedAccount.accountType || '',
        accountNumber: selectedAccount.accountNumber || '',
        email: selectedAccount.email || '',
    };
    if (includeTimestamp) payload.savedAt = serverTimestamp();
    return payload;
}

function getDraftUsdtDestination() {
    const payload = {
        wallet: usdtWalletInput?.value.trim() || '',
        network: usdtNetworkSelect?.value || '',
        notes: usdtNotesInput?.value.trim() || '',
    };
    return Object.values(payload).some(Boolean) ? payload : null;
}

function getDraftVesDestination() {
    const payload = {
        beneficiary: vesBeneficiaryInput?.value.trim() || '',
        idNumber: vesIdInput?.value.trim() || '',
        bank: vesBankInput?.value.trim() || '',
        accountType: vesAccountTypeInput?.value || '',
        accountNumber: vesAccountNumberInput?.value.trim() || '',
        notes: vesNotesInput?.value.trim() || '',
    };
    return Object.values(payload).some(Boolean) ? payload : null;
}

function getCurrentTransactionValidationError() {
    if (!currentTransactionDraft) return 'Primero prepara una orden.';
    return getTransactionDestinationValidationError({
        amountSend: currentTransactionDraft.amountSend,
        currencySend: currentTransactionDraft.currencySend,
        currencyReceive: currentTransactionDraft.currencyReceive,
        hasAdminDestination: Boolean(adminAccountSelect?.value),
        usdtDestination: getDraftUsdtDestination(),
        vesDestination: getDraftVesDestination(),
    });
}

function syncCurrentTransactionDraftFromUI() {
    if (!currentTransactionDraft) return;

    const selectedAccount = currentTransactionDraft.currencySend === 'CLP'
        ? adminAccounts.find(acc => acc.id === adminAccountSelect?.value)
        : null;
    if (selectedAccount) {
        currentTransactionDraft.adminDestinationAccount = buildAdminDestinationAccountPayload(selectedAccount);
    } else {
        delete currentTransactionDraft.adminDestinationAccount;
    }

    const usdtDestination = currentTransactionDraft.currencyReceive === 'USDT' ? getDraftUsdtDestination() : null;
    if (usdtDestination) {
        currentTransactionDraft.userUsdtDestination = usdtDestination;
    } else {
        delete currentTransactionDraft.userUsdtDestination;
    }

    const vesDestination = currentTransactionDraft.currencyReceive === 'VES' ? getDraftVesDestination() : null;
    if (vesDestination) {
        currentTransactionDraft.userVesDestination = vesDestination;
    } else {
        delete currentTransactionDraft.userVesDestination;
    }
}

function buildTransactionExtraDataFromDraft() {
    if (!currentTransactionDraft) return {};

    const extraData = { ...(currentTransactionDraft.extraMetadata || {}) };
    if (currentTransactionDraft.adminDestinationAccount) {
        extraData.adminDestinationAccount = {
            ...currentTransactionDraft.adminDestinationAccount,
            savedAt: serverTimestamp(),
        };
    }
    if (currentTransactionDraft.userUsdtDestination) {
        extraData.userUsdtDestination = currentTransactionDraft.userUsdtDestination;
    }
    if (currentTransactionDraft.userVesDestination) {
        extraData.userVesDestination = currentTransactionDraft.userVesDestination;
    }

    return extraData;
}

function setupMarginConfigListener() {
    if (!db || marginConfigUnsubscribe) return;
    const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);
    marginConfigUnsubscribe = onSnapshot(configDocRef, (snapshot) => {
        if (snapshot.exists()) {
            marginConfig = normalizeMarginConfig(snapshot.data());
        } else {
            marginConfig = { ...DEFAULT_MARGIN_CONFIG };
        }
        applyMarginConfigToUI();
        calculateExchange();
    }, (error) => {
        console.error('Error al escuchar márgenes:', error);
        marginConfig = { ...DEFAULT_MARGIN_CONFIG };
        applyMarginConfigToUI();
        calculateExchange();
    });
}

async function saveMarginConfig(event) {
    if (event) event.preventDefault();
    if (!isAuthReady || !db || !ADMIN_UIDS.includes(userId)) {
        showMarginStatus('No autorizado para actualizar márgenes.', true);
        return;
    }
    try {
        const newConfig = {
            discountWldClp: readPercentInput(marginWldClpInput, 'Descuento WLD -> CLP', marginConfig.discountWldClp),
            discountClpVes: readPercentInput(marginClpVesInput, 'Descuento CLP -> VES', marginConfig.discountClpVes),
            marginUsdtClp: readPercentInput(marginUsdtClpInput, 'Margen USDT -> CLP', marginConfig.marginUsdtClp),
        };
        showMarginStatus('Guardando márgenes...');
        if (saveMarginsButton) {
            saveMarginsButton.disabled = true;
            saveMarginsButton.textContent = 'Guardando...';
        }
        const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);
        await setDoc(configDocRef, { ...newConfig, updatedAt: serverTimestamp(), updatedBy: userId }, { merge: true });
        marginConfig = newConfig;
        applyMarginConfigToUI();
        calculateExchange();
        showMarginStatus('Márgenes guardados correctamente.');
        setTimeout(hideMarginStatus, 3000);
    } catch (validationError) {
        showMarginStatus(validationError.message, true);
    } finally {
        if (saveMarginsButton) {
            saveMarginsButton.disabled = false;
            saveMarginsButton.textContent = 'Guardar Márgenes';
        }
    }
}

function readPercentInput(inputElement, label, fallbackDecimal) {
    if (!inputElement) return fallbackDecimal;
    const raw = (inputElement.value ??  '').toString().replace(',', '.').trim();
    if (raw === '') return fallbackDecimal;
    const numeric = parseFloat(raw);
    if (!Number.isFinite(numeric) || numeric < 0 || numeric > 100) {
        throw new Error(`${label} debe ser un número entre 0 y 100.`);
    }
    return numeric / 100;
}

async function saveAdminAccounts() {
    if (!isAuthReady || !db) {
        accountStatus.textContent = "Error: Conexión no lista.";
        return;
    }
    const accountData = {
        bankName: adminBankNameInput.value,
        accountHolder: adminAccountHolderInput.value.trim(),
        accountNumber: adminAccountNumberInput.value.trim(),
        rut: adminRutInput.value.trim(),
        accountType: adminAccountTypeInput.value,
        email: adminEmailInput.value.trim() || 'N/A',
    };
    if (!accountData.bankName || !accountData.accountHolder || !accountData.accountNumber || !accountData.rut || !accountData.accountType) {
        accountStatus.textContent = "Error: Complete todos los campos requeridos.";
        return;
    }
    saveAccountsButton.disabled = true;
    saveAccountsButton.textContent = 'Guardando...';
    try {
        const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
        await addDoc(collection(db, collectionPath), { ...accountData, updatedBy: userId, timestamp: serverTimestamp() });
        adminBankNameInput.value = '';
        adminAccountHolderInput.value = 'Ender Javier Piña Rojas';
        adminAccountNumberInput.value = '';
        adminRutInput.value = '26728535-7';
        adminAccountTypeInput.value = '';
        adminEmailInput.value = '';
        accountStatus.textContent = "Cuenta guardada correctamente!";
    } catch (error) {
        console.error("Error al guardar cuentas:", error);
        accountStatus.textContent = "Error al guardar cuentas: " + error.message;
    } finally {
        saveAccountsButton.disabled = false;
        saveAccountsButton.textContent = 'Guardar Nueva Cuenta';
    }
}

async function deleteAdminAccount(docId, accountName) {
    if (!isAuthReady || !db) {
        accountStatus.textContent = "Error: Conexión no lista.";
        return;
    }
    try {
        const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
        await deleteDoc(doc(db, collectionPath, docId));
        accountStatus.textContent = `Cuenta ${accountName} eliminada correctamente.`;
    } catch (error) {
        console.error("Error al eliminar cuenta:", error);
        accountStatus.textContent = "Error al eliminar: " + error.message;
    }
}

function setupAdminAccountsListener() {
    if (!isAuthReady || !db) return;
    if (adminAccountsUnsubscribe) adminAccountsUnsubscribe();
    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
    const q = query(collection(db, collectionPath));
    adminAccountsUnsubscribe = onSnapshot(q, (snapshot) => {
        applyAdminAccountsSnapshot(snapshot);
    }, (error) => {
        console.error("Error al escuchar cuentas:", error);
        accountStatus.textContent = "Error al cargar cuentas.";
    });
}

function renderAdminAccountsList() {
    if (!savedAccountsList) return;
    savedAccountsList.innerHTML = '';
    if (adminAccounts.length === 0) {
        savedAccountsList.innerHTML = '<p class="text-sm text-gray-500 p-2">No hay cuentas configuradas.</p>';
        return;
    }
    adminAccounts.forEach((account) => {
        const item = document.createElement('div');
        item.className = 'list-card p-4 space-y-3 text-sm text-left';
        item.innerHTML = `
            <div class="flex flex-col sm:flex-row sm:items-start sm:justify-between gap-1">
                <div>
                    <p class="text-sm font-semibold text-gray-800">${account.bankName}</p>
                    <p class="text-xs text-gray-500">${account.accountType}</p>
                </div>
                <button data-account-id="${account.id}" data-account-name="${account.bankName} (${account.accountType})" class="delete-account-btn btn btn-danger btn-sm">Eliminar</button>
            </div>
            <div class="space-y-2">${buildAccountDetailsMarkup(account)}</div>
        `;
        savedAccountsList.appendChild(item);
    });
}

async function fetchDynamicRates() {
    if (isFetchingDynamicRates) return;
    isFetchingDynamicRates = true;
    setAmountLoadingState(true);
    setTicketLiveStatus('Consultando mercado');
    if (rateFetchStatus) rateFetchStatus.textContent = 'Conectando con API...';
    const abortController = new AbortController();
    const timeoutId = window.setTimeout(() => abortController.abort(), 20_000);
    try {
        const response = await fetch('/api/rates', {
            signal: abortController.signal,
        });
        if (!response.ok) throw new Error(`Respuesta de la API no fue exitosa: ${response.status}`);
        const data = await response.json();

        if (!data?.success) {
            throw new Error(data?.message || 'Respuesta de la API con formato inesperado.');
        }

        if (isPositiveFiniteNumber(data.USDT_to_CLP_P2P)) liveRates.USDT_to_CLP = Number(data.USDT_to_CLP_P2P);
        if (isPositiveFiniteNumber(data.VES_to_USDT_P2P)) liveRates.USDT_to_VES = Number(data.VES_to_USDT_P2P);
        if (isPositiveFiniteNumber(data.WLD_to_USDT)) liveRates.WLD_to_USDT = Number(data.WLD_to_USDT);

        lastLiveRatesAt = new Date().toISOString();
        lastLiveRatesWereFallback = Boolean(data.degraded);
        saveLiveRatesCache();
        updateLiveRatesTimestampLabel();

        renderRateDisplays({
            wldSource: data.meta?.wld_source || 'API',
            clpSource: data.meta?.clp_source || 'API',
            vesSource: data.meta?.ves_source || 'API',
            suffix: data.degraded ? ' (Referencia)' : '',
        });
        setTicketLiveStatus(data.degraded ? 'Usando referencia de respaldo' : 'Mercado actualizado');
        if (rateFetchStatus) {
            rateFetchStatus.textContent = data.degraded
                ? 'Mercado con respaldo: algunas tasas usan valores de referencia.'
                : 'Tasas actualizadas.';
        }
    } catch (error) {
        console.warn('Fallo en la conexión con la API. Usando tasas de referencia fijas.', error);
        lastLiveRatesWereFallback = true;
        renderRateDisplays({ suffix: ' (Fijo)' });
        setTicketLiveStatus('Usando referencia fija');
        if (rateFetchStatus) rateFetchStatus.textContent = 'No se pudo actualizar el mercado. Se conserva la última referencia disponible.';
    } finally {
        window.clearTimeout(timeoutId);
        isFetchingDynamicRates = false;
        setAmountLoadingState(false);
        calculateExchange();
    }
}

function scheduleDynamicRatesFetch() {
    if (!amountSendInput) return;
    const amountSend = parseFloat(amountSendInput.value);

    if (ratesFetchDebounceTimeout) {
        clearTimeout(ratesFetchDebounceTimeout);
        ratesFetchDebounceTimeout = null;
    }

    if (isNaN(amountSend) || amountSend <= 0) {
        setAmountLoadingState(false);
        setTicketLiveStatus('Esperando monto');
        if (rateFetchStatus) {
            rateFetchStatus.textContent = 'Ingresa un monto para consultar tasas en vivo.';
        }
        return;
    }

    const lastRatesTimestamp = Date.parse(lastLiveRatesAt || '');
    const hasRecentLiveRates = !lastLiveRatesWereFallback
        && Number.isFinite(lastRatesTimestamp)
        && (Date.now() - lastRatesTimestamp) < CLIENT_RATES_MIN_REFRESH_MS;
    if (hasRecentLiveRates) {
        setAmountLoadingState(false);
        setTicketLiveStatus('Mercado actualizado recientemente');
        if (rateFetchStatus) rateFetchStatus.textContent = 'Tasas recientes reutilizadas; se actualizarán automáticamente en menos de 30 segundos.';
        return;
    }

    setAmountLoadingState(true);
    if (rateFetchStatus) {
        rateFetchStatus.textContent = 'Consultando tasas en vivo...';
    }

    ratesFetchDebounceTimeout = setTimeout(() => {
        fetchDynamicRates().catch(err => console.error('Error al obtener tasas:', err));
    }, 500);
}

function calculateFullRatesInternal() {
    const fullRates = {};
    const { WLD_to_USDT, USDT_to_CLP, USDT_to_VES } = liveRates;
    const { discountWldClp, discountClpVes, marginUsdtClp } = marginConfig;
    if (WLD_to_USDT && USDT_to_CLP) {
        const baseWldToClp = WLD_to_USDT * USDT_to_CLP;
        const adjustedWldToClp = baseWldToClp * (1 - discountWldClp);
        if (adjustedWldToClp > 0) {
            fullRates['WLD_to_CLP'] = adjustedWldToClp;
            fullRates['CLP_to_WLD'] = 1 / adjustedWldToClp;
        }
    }
    if (USDT_to_CLP && USDT_to_VES) {
        const baseClpToVesRate = USDT_to_VES / USDT_to_CLP;
        const adjustedClpToVesRate = baseClpToVesRate * (1 - discountClpVes);
        if (adjustedClpToVesRate > 0) {
            fullRates['CLP_to_VES'] = adjustedClpToVesRate;
            fullRates['VES_to_CLP'] = 1 / adjustedClpToVesRate;
        }
    }
    if (USDT_to_CLP) {
        const finalUsdtToClp = USDT_to_CLP * (1 + marginUsdtClp);
        fullRates['USDT_to_CLP'] = finalUsdtToClp;
        fullRates['CLP_to_USDT'] = 1 / finalUsdtToClp;
        if (usdtClpMarginDisplay) {
            usdtClpMarginDisplay.textContent = `1 USDT = ${formatRounded(finalUsdtToClp, 2)} CLP (Margen +${formatPercent(marginUsdtClp)}%)`;
        }
    }
    fullRates['USDT_to_VES'] = USDT_to_VES;
    fullRates['VES_to_USDT'] = 1 / USDT_to_VES;
    ['CLP', 'VES', 'WLD', 'USDT'].forEach(c => fullRates[`${c}_to_${c}`] = 1);
    return fullRates;
}

function fitAmountDisplay() {
    if (!amountReceiveDisplay) return;
    amountReceiveDisplay.style.whiteSpace = 'nowrap';
    amountReceiveDisplay.style.fontSize = '';
    const baseSize = parseFloat(window.getComputedStyle(amountReceiveDisplay).fontSize);
    let currentSize = baseSize;
    amountReceiveDisplay.style.fontSize = currentSize + 'px';
    let guard = 0;
    while (amountReceiveDisplay.scrollWidth > amountReceiveDisplay.clientWidth && currentSize > 18 && guard < 12) {
        currentSize -= 2;
        amountReceiveDisplay.style.fontSize = currentSize + 'px';
        guard++;
    }
}

function calculateExchange(enablePaymentButton = true) {
    const amountSend = parseFloat(amountSendInput.value);
    const currencySend = currencySendSelect.value;
    const currencyReceive = currencyReceiveSelect.value;
    const rates = calculateFullRatesInternal();
    if (isNaN(amountSend) || amountSend <= 0) {
        amountReceiveDisplay.textContent = formatCurrency(0, currencyReceive);
        fitAmountDisplay();
        rateDisplay.textContent = "Ingrese un monto válido.";
        if (suggestedRateDisplay) suggestedRateDisplay.textContent = '';
        paymentButton.disabled = true;
        errorMessage.classList.add('hidden');
        return;
    }
    const rateKey = `${currencySend}_to_${currencyReceive}`;
    const rate = rates[rateKey];
    if (rate == null) {
        amountReceiveDisplay.textContent = "N/A";
        fitAmountDisplay();
        rateDisplay.textContent = `Intercambio ${currencySend} a ${currencyReceive} no disponible.`;
        if (suggestedRateDisplay) suggestedRateDisplay.textContent = '';
        paymentButton.disabled = true;
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = `Error: El intercambio de ${currencySend} a ${currencyReceive} no es una ruta vélida.`;
        return;
    }
    if (enablePaymentButton) paymentButton.disabled = false;
    errorMessage.classList.add('hidden');
    const amountReceive = amountSend * rate;
    let rateText = `Tasa: 1 ${currencySend} = ${formatRounded(rate, currencyReceive === 'WLD' ? 8 : 4)} ${currencyReceive}`;
    const suggestedRate = rate * 1.05;
    let suggestedRateText = `Tasa Manzano App sugerida: 1 ${currencySend} = ${formatRounded(suggestedRate, currencyReceive === 'WLD' ? 8 : 4)} ${currencyReceive}`;
    if (currencySend === currencyReceive) {
        rateText = 'Intercambio 1:1';
        suggestedRateText = 'Tasa Manzano App sugerida: Intercambio 1:1';
    } else if (currencySend === 'CLP' && currencyReceive === 'USDT') {
        rateText = `Tasa: 1 USDT = ${formatRounded(1 / rate, 2)} CLP`;
        suggestedRateText = `Tasa Manzano App sugerida: 1 USDT = ${formatRounded(1 / suggestedRate, 2)} CLP`;
    }
    amountReceiveDisplay.textContent = formatCurrency(amountReceive, currencyReceive);
    fitAmountDisplay();
    rateDisplay.textContent = rateText;
    if (suggestedRateDisplay) suggestedRateDisplay.textContent = suggestedRateText;
}

function swapCurrencies() {
    const sendVal = currencySendSelect.value;
    currencySendSelect.value = currencyReceiveSelect.value;
    currencyReceiveSelect.value = sendVal;
    calculateExchange();
}

async function recordTransaction(amountSend, currencySend, amountReceive, currencyReceive, extraData = {}) {
    if (!isAuthReady || !db || !userId || !auth?.currentUser) {
        throw new Error('Firebase no está listo para crear la orden.');
    }

    const idToken = await auth.currentUser.getIdToken();
    const payload = {
        amountSend,
        currencySend,
        currencyReceive,
    };
    if (extraData.adminDestinationAccount?.id) {
        payload.adminDestinationAccountId = extraData.adminDestinationAccount.id;
    }
    if (extraData.userUsdtDestination) payload.userUsdtDestination = extraData.userUsdtDestination;
    if (extraData.userVesDestination) payload.userVesDestination = extraData.userVesDestination;

    const controller = new AbortController();
    const timeoutId = window.setTimeout(() => controller.abort(), 30_000);
    let response;
    try {
        response = await fetch(CREATE_ORDER_API_URL, {
            method: 'POST',
            headers: {
                Authorization: `Bearer ${idToken}`,
                'Content-Type': 'application/json',
            },
            body: JSON.stringify(payload),
            signal: controller.signal,
        });
    } catch (error) {
        if (error?.name === 'AbortError') throw new Error('La validación de la tasa tardó demasiado. Intenta nuevamente.');
        throw error;
    } finally {
        window.clearTimeout(timeoutId);
    }
    const result = await response.json().catch(() => ({}));
    if (!response.ok || !result.success || !result.id || !result.path) {
        if (response.status === 503) throw new Error('No se pudo validar la tasa en este momento. Intenta nuevamente.');
        throw new Error(result.message || 'No se pudo crear la orden.');
    }

    const pathSegments = result.path.split('/').filter(Boolean);
    if (pathSegments.length !== 6) throw new Error('La orden creada tiene una ruta inválida.');
    const transactionRef = doc(db, ...pathSegments);
    return {
        id: result.id,
        path: result.path,
        ref: transactionRef,
        segments: pathSegments,
        amountReceive: result.amountReceive,
        rateApplied: result.rateApplied,
        rateSource: result.rateSource,
        ratesDegraded: result.ratesDegraded,
    };
}

function sortTransactions(transactions) {
    return [...transactions].sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
}

function mergeUserTransactions(existing, incoming) {
    const byId = new Map();
    [...existing, ...incoming].forEach((transaction) => byId.set(transaction.id, transaction));
    return sortTransactions([...byId.values()]);
}

function updateHistoryLoadMoreButton() {
    if (!historyLoadMoreButton) return;
    historyLoadMoreButton.classList.toggle('hidden', !userTransactionsHasMore || !userTransactionsCursor);
    historyLoadMoreButton.disabled = false;
}

function setupTransactionListener() {
    if (!isAuthReady || !db || !userId) return;
    if (transactionListenerUnsubscribe) transactionListenerUnsubscribe();
    if (!userTransactionsCache.length) {
        if (loadingHistory) loadingHistory.textContent = 'Cargando historial...';
        renderSkeletonList(historyContainer, 3);
    }
    const userTransactionsRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
    const q = query(userTransactionsRef, orderBy('timestamp', 'desc'), limit(USER_TRANSACTIONS_PAGE_SIZE));
    transactionListenerUnsubscribe = onSnapshot(q, (snapshot) => {
        const firstPage = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        userTransactionsCache = userTransactionsCache.length
            ? mergeUserTransactions(userTransactionsCache, firstPage)
            : sortTransactions(firstPage);
        if (!userTransactionsCursor) {
            userTransactionsCursor = snapshot.docs[snapshot.docs.length - 1] || null;
            userTransactionsHasMore = snapshot.size === USER_TRANSACTIONS_PAGE_SIZE;
        }
        renderTransactionHistory(userTransactionsCache);
        updateHistoryLoadMoreButton();
    }, (error) => {
        console.error('Error al escuchar transacciones:', error);
        if (historyContainer) historyContainer.innerHTML = '<p class="text-sm text-red-600 p-2">Error al cargar el historial.</p>';
    });
}

async function loadMoreUserTransactions() {
    if (!db || !userId || !userTransactionsCursor || !userTransactionsHasMore) return;
    if (historyLoadMoreButton) historyLoadMoreButton.disabled = true;
    try {
        const userTransactionsRef = collection(db, 'artifacts', appId, 'users', userId, 'transactions');
        const snapshot = await getDocs(query(
            userTransactionsRef,
            orderBy('timestamp', 'desc'),
            startAfter(userTransactionsCursor),
            limit(USER_TRANSACTIONS_PAGE_SIZE),
        ));
        const nextPage = snapshot.docs.map(document => ({ id: document.id, ...document.data() }));
        userTransactionsCache = mergeUserTransactions(userTransactionsCache, nextPage);
        userTransactionsCursor = snapshot.docs[snapshot.docs.length - 1] || userTransactionsCursor;
        userTransactionsHasMore = snapshot.size === USER_TRANSACTIONS_PAGE_SIZE;
        renderTransactionHistory(userTransactionsCache);
    } catch (error) {
        console.error('Error al cargar más transacciones:', error);
        showToast('No se pudieron cargar las órdenes anteriores.', 'error');
    } finally {
        if (historyLoadMoreButton) historyLoadMoreButton.disabled = false;
        updateHistoryLoadMoreButton();
    }
}

function getStatusBadgeClasses(status) {
    switch (status) {
        case 'Pendiente':
            return 'bg-amber-100 text-amber-800';
        case 'Completado':
            return 'bg-emerald-100 text-emerald-800';
        case 'Cancelada':
            return 'bg-slate-200 text-slate-600';
        case 'Sin comprobante':
            return 'bg-sky-100 text-sky-800';
        default:
            return 'bg-slate-100 text-slate-600';
    }
}

function canCancelTransaction(status) {
    return status === 'Sin comprobante' || status === 'Pendiente';
}

function renderTransactionHistory(transactions) {
    historyContainer.innerHTML = '';
    if (transactions.length === 0) {
        historyContainer.innerHTML = '<p class="text-gray-500 text-xs sm:text-sm p-2">Aún no hay transacciones.</p>';
        return;
    }
    transactions.forEach(tx => {
        const date = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleDateString() : 'Cargando...';
        const time = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleTimeString() : '';
        const item = document.createElement('div');
        item.className = 'm3-transaction-card p-4 text-xs sm:text-sm space-y-3';
        item.setAttribute('data-transaction-id', tx.id || '');
        const badgeClasses = getStatusBadgeClasses(tx.status);
        const cancelButtonMarkup = canCancelTransaction(tx.status)
            ? `<button class="cancel-transaction-btn btn btn-danger btn-sm" data-transaction-id="${escapeHtml(tx.id || '')}">Cancelar orden</button>`
            : '';
        const destinationDetailsMarkup = buildDestinationDetailsMarkup(tx, { enableCopy: false });
        const receiptActionsMarkup = tx.userReceiptUrl
            ? `<div class="flex flex-wrap items-center gap-2 pt-2 border-t border-dashed border-gray-200">
                <span class="text-xs text-gray-600">Comprobante cliente:</span>
                <button class="view-receipt-btn btn btn-outline btn-sm" data-url="${escapeHtml(tx.userReceiptUrl)}" data-title="Comprobante cliente ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}">
                    Ver
                </button>
                <button class="copy-btn btn btn-ghost btn-sm relative" data-copy="${escapeHtml(tx.userReceiptUrl)}">
                    Copiar enlace
                    <span class="copy-feedback opacity-0 absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded transition-all duration-200 pointer-events-none">Copiado!</span>
                </button>
            </div>`
            : '';
        const userUploadMarkup = (!tx.userReceiptUrl && tx.status !== 'Cancelada' && tx.status !== 'Completado')
            ? `<div class="history-upload-section pt-3 border-t border-dashed border-gray-200 space-y-2">
                <p class="text-xs text-gray-600">Sube tu comprobante para completar esta orden.</p>
                <div class="flex flex-col sm:flex-row sm:items-center gap-2">
                    <input type="file" class="history-receipt-input field-control field-control-sm flex-1 text-xs sm:text-sm" accept="image/*,.pdf" data-transaction-id="${escapeHtml(tx.id || '')}">
                    <button class="history-upload-btn btn btn-primary btn-sm shrink-0" data-transaction-id="${escapeHtml(tx.id || '')}">Subir comprobante</button>
                </div>
                <p class="history-upload-status text-xs text-gray-500 hidden"></p>
            </div>`
            : '';
        item.innerHTML = `
            <p class="m3-money-line text-sm sm:text-base">${formatCurrency(tx.amountSend, tx.currencySend)} → ${formatCurrency(tx.amountReceive, tx.currencyReceive)}</p>
            <div class="flex items-center justify-between gap-2">
                <p class="text-xs text-slate-400">${date} ${time}</p>
                <span class="inline-flex items-center flex-shrink-0 whitespace-nowrap px-2 py-0.5 text-xs font-semibold rounded-full ${badgeClasses}">${escapeHtml(tx.status || 'N/A')}</span>
            </div>
            <p class="m3-muted-chip">Tasa ${tx.rateApplied ? formatRounded(tx.rateApplied, 4) : 'N/A'}</p>
            ${destinationDetailsMarkup ? `<div class="pt-2 border-t border-gray-200 space-y-2">${destinationDetailsMarkup}</div>` : ''}
            ${receiptActionsMarkup}
            ${userUploadMarkup}
            <div class="flex flex-wrap items-center gap-2">
                ${cancelButtonMarkup}
            </div>
        `;
        historyContainer.appendChild(item);
    });
}
async function cancelUserTransaction(transactionId) {
    if (!transactionId || !db || !userId) throw new Error('Transacción no disponible.');
    const transactionRef = doc(db, 'artifacts', appId, 'users', userId, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
        throw new Error('La orden no existe.');
    }
    const data = transactionSnap.data();
    if (data.status === 'Completado') {
        throw new Error('La orden ya fue completada.');
    }
    if (data.status === 'Cancelada') {
        return;
    }
    await updateDoc(transactionRef, {
        status: 'Cancelada',
        cancelledAt: serverTimestamp(),
    });
}

async function handleHistoryContainerClick(event) {
    const copyButton = event.target.closest('.copy-btn');
    if (copyButton) {
        event.preventDefault();
        copyToClipboard(copyButton.dataset.copy, copyButton);
        return;
    }
    const viewButton = event.target.closest('.view-receipt-btn');
    if (viewButton) {
        event.preventDefault();
        handleViewReceiptButton(viewButton);
        return;
    }
    const uploadButton = event.target.closest('.history-upload-btn');
    if (uploadButton) {
        event.preventDefault();
        const transactionId = uploadButton.getAttribute('data-transaction-id');
        if (!transactionId) return;
        const section = uploadButton.closest('.history-upload-section');
        const fileInput = section?.querySelector('.history-receipt-input');
        const statusElement = section?.querySelector('.history-upload-status');
        const file = fileInput.files?.[0];
        if (!file) {
            if (statusElement) {
                statusElement.textContent = 'Selecciona un archivo.';
                statusElement.className = 'history-upload-status text-xs text-red-600';
                statusElement.classList.remove('hidden');
            }
            return;
        }
        const fileValidationError = getReceiptFileValidationError(file);
        if (fileValidationError) {
            if (statusElement) {
                statusElement.textContent = fileValidationError;
                statusElement.className = 'history-upload-status text-xs text-red-600';
                statusElement.classList.remove('hidden');
            }
            return;
        }
        if (statusElement) {
            statusElement.textContent = 'Subiendo comprobante...';
            statusElement.className = 'history-upload-status text-xs text-gray-500';
            statusElement.classList.remove('hidden');
        }
        uploadButton.disabled = true;
        uploadReceiptFromHistory(transactionId, file)
            .then(() => {
                if (statusElement) {
                    statusElement.textContent = 'Comprobante subido. Tu orden esta pendiente de revision.';
                    statusElement.className = 'history-upload-status text-xs text-green-600';
                    statusElement.classList.remove('hidden');
                }
                if (fileInput) fileInput.value = '';
            })
            .catch(error => {
                console.error('Error al subir comprobante desde historial:', error);
                if (statusElement) {
                    statusElement.textContent = error.message || 'No se pudo subir el comprobante.';
                    statusElement.className = 'history-upload-status text-xs text-red-600';
                    statusElement.classList.remove('hidden');
                }
            })
            .finally(() => {
                uploadButton.disabled = false;
            });
        return;
    }
    const cancelButton = event.target.closest('.cancel-transaction-btn');
    if (!cancelButton) return;
    const transactionId = cancelButton.dataset.transactionId;
    if (!transactionId) return;
    const confirmed = await showConfirm('¿Deseas cancelar esta orden? Esta acción no se puede deshacer.', { title: 'Cancelar orden', acceptText: 'Sí, cancelar' });
    if (!confirmed) return;
    const originalText = cancelButton.textContent;
    cancelButton.disabled = true;
    cancelButton.textContent = 'Cancelando...';
    const previousOpacity = cancelButton.style.opacity;
    cancelButton.style.opacity = '0.6';
    try {
        await cancelUserTransaction(transactionId);
        cancelButton.textContent = 'Cancelada';
        cancelButton.style.opacity = previousOpacity || '';
        cancelButton.classList.add('bg-gray-100', 'border-gray-200', 'text-gray-500', 'cursor-not-allowed');
    } catch (error) {
        console.error('Error al cancelar la orden:', error);
        showToast(`No se pudo cancelar la orden: ${error.message}`, 'error');
        cancelButton.disabled = false;
        cancelButton.textContent = originalText;
        cancelButton.style.opacity = previousOpacity || '';
    }
}

async function showPaymentModal() {
    const amountSend = parseFloat(amountSendInput.value);
    const currencySend = currencySendSelect.value;
    const currencyReceive = currencyReceiveSelect.value;
    const amountReceiveText = amountReceiveDisplay.textContent;
    if (currencySend === 'CLP') {
        await loadAdminAccountsOnce();
    }
    currentTransactionId = null;
    currentTransactionPath = null;
    currentTransactionRef = null;
    currentTransactionDraft = null;
    if (usdtDestinationForm) {
        usdtDestinationForm.classList.toggle('hidden', currencyReceive !== 'USDT');
    }
    if (vesDestinationForm) {
        vesDestinationForm.classList.toggle('hidden', currencyReceive !== 'VES');
    }
    modalAmountSend.textContent = formatCurrency(amountSend, currencySend);
    modalAmountReceive.textContent = amountReceiveText;
    if (receiptUploadStatus) {
        receiptUploadStatus.textContent = '';
        receiptUploadStatus.classList.add('hidden');
    }
    if (receiptUploadInput) receiptUploadInput.value = '';
    const rates = calculateFullRatesInternal();
    const rate = rates[`${currencySend}_to_${currencyReceive}`] || 0;
    const extraMetadata = {};
    if (auth?.currentUser.email) {
        extraMetadata.userEmail = auth.currentUser.email;
    }
    if (auth?.currentUser.displayName) {
        extraMetadata.userDisplayName = auth.currentUser.displayName;
    }
    currentTransactionDraft = {
        amountSend,
        currencySend,
        amountReceive: amountSend * rate,
        currencyReceive,
        extraMetadata,
    };
    if (currencySend === 'CLP') {
        modalCryptoWarning.classList.add('hidden');
        modalTransferCurrency.textContent = 'CLP';
        adminAccountSelect.innerHTML = '<option value="">-- Selecciona una cuenta --</option>';
        selectedAdminAccountDetails.innerHTML = '';
        selectedAdminAccountDetails.classList.add('hidden');
        const clpAccounts = adminAccounts.filter(acc => acc.accountType?.includes('Cuenta') || acc.bankName === 'Mercado Pago' || acc.bankName === 'Global66');
        if (clpAccounts.length > 0) {
            noAccountsMessage.classList.add('hidden');
            adminAccountSelect.classList.remove('hidden');
            clpAccounts.forEach(account => {
                const option = document.createElement('option');
                option.value = account.id;
                option.textContent = `${account.bankName} - ${account.accountType}`;
                adminAccountSelect.appendChild(option);
            });
        } else {
            noAccountsMessage.classList.remove('hidden');
            adminAccountSelect.classList.add('hidden');
            noAccountsMessage.textContent = 'El administrador no ha configurado cuentas CLP.';
        }
    } else {
        modalCryptoWarning.classList.remove('hidden');
        modalTransferCurrency.textContent = currencySend;
        if (adminAccountSelect) {
            adminAccountSelect.value = '';
            adminAccountSelect.classList.add('hidden');
        }
        if (selectedAdminAccountDetails) selectedAdminAccountDetails.classList.add('hidden');
        noAccountsMessage.classList.remove('hidden');
        noAccountsMessage.innerHTML = '<p class="text-center text-gray-600 p-4">La dirección de la Wallet será proporcionada por el administrador.</p>';
    }
    syncCurrentTransactionDraftFromUI();
    openModalElement(paymentModal, adminAccountSelect?.value ? uploadReceiptButton : adminAccountSelect);
}

function closePaymentModal() {
    closeModalElement(paymentModal);
}

async function handleAdminAccountSelection() {
    const selectedAccountId = adminAccountSelect.value;
    if (!selectedAccountId) {
        selectedAdminAccountDetails.classList.add('hidden');
        selectedAdminAccountDetails.innerHTML = '';
        syncCurrentTransactionDraftFromUI();
        return;
    }
    const selectedAccount = adminAccounts.find(acc => acc.id === selectedAccountId);
    if (selectedAccount) {
        selectedAdminAccountDetails.innerHTML = buildAccountDetailsMarkup(selectedAccount);
        selectedAdminAccountDetails.classList.remove('hidden');
        syncCurrentTransactionDraftFromUI();
    } else {
        selectedAdminAccountDetails.classList.add('hidden');
        selectedAdminAccountDetails.innerHTML = '';
        syncCurrentTransactionDraftFromUI();
    }
}

async function handleUserReceiptUpload(event) {
    event.preventDefault();
    if (!uploadReceiptButton) return;
    if (!currentTransactionDraft) {
        receiptUploadStatus.textContent = 'Primero prepara una orden.';
        receiptUploadStatus.className = 'text-xs text-red-600';
        return;
    }
    syncCurrentTransactionDraftFromUI();
    const transactionValidationError = getCurrentTransactionValidationError();
    if (transactionValidationError) {
        receiptUploadStatus.textContent = transactionValidationError;
        receiptUploadStatus.className = 'text-xs text-red-600';
        return;
    }
    const file = receiptUploadInput.files?.[0];
    if (!file) {
        receiptUploadStatus.textContent = 'Selecciona un archivo.';
        receiptUploadStatus.className = 'text-xs text-red-600';
        return;
    }
    const fileValidationError = getReceiptFileValidationError(file);
    if (fileValidationError) {
        receiptUploadStatus.textContent = fileValidationError;
        receiptUploadStatus.className = 'text-xs text-red-600';
        return;
    }
    try {
        uploadReceiptButton.disabled = true;
        receiptUploadStatus.textContent = 'Subiendo comprobante...';
        receiptUploadStatus.className = 'text-xs text-gray-500';
        syncCurrentTransactionDraftFromUI();
        if (!currentTransactionRef || !currentTransactionPath) {
            const transactionRecord = await recordTransaction(
                currentTransactionDraft.amountSend,
                currentTransactionDraft.currencySend,
                currentTransactionDraft.amountReceive,
                currentTransactionDraft.currencyReceive,
                buildTransactionExtraDataFromDraft(),
            );
            if (!transactionRecord) {
                throw new Error('No se pudo crear la orden.');
            }
            currentTransactionId = transactionRecord.id;
            currentTransactionPath = transactionRecord.path;
            currentTransactionRef = transactionRecord.ref;
            currentTransactionDraft.amountReceive = transactionRecord.amountReceive;
        }
        const storagePath = `${currentTransactionPath}/receipts/user/${Date.now()}-${sanitizeReceiptFileName(file.name)}`;
        const fileRef = storageRef(storage, storagePath);
        await uploadBytes(fileRef, file);
        const downloadUrl = await getDownloadURL(fileRef);
        await updateDoc(currentTransactionRef, {
            userReceiptUrl: downloadUrl,
            status: 'Pendiente',
            userReceiptUploadedAt: serverTimestamp(),
        });
        receiptUploadStatus.textContent = 'Comprobante subido. Tu orden está pendiente de revisión.';
        receiptUploadStatus.className = 'text-xs text-green-600';
    } catch (error) {
        console.error('Error al subir comprobante:', error);
        receiptUploadStatus.textContent = `Error: ${error.message}`;
        receiptUploadStatus.className = 'text-xs text-red-600';
    } finally {
        uploadReceiptButton.disabled = false;
        if (receiptUploadInput) receiptUploadInput.value = '';
    }
}


async function uploadReceiptFromHistory(transactionId, file) {
    if (!transactionId || !file) throw new Error('Datos insuficientes para subir el comprobante.');
    if (!storage || !db || !userId) throw new Error('Firebase no inicializado.');
    const transactionRef = doc(db, 'artifacts', appId, 'users', userId, 'transactions', transactionId);
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
        throw new Error('La orden no existe.');
    }
    const transactionData = transactionSnap.data();
    if (transactionData.status === 'Completado') {
        throw new Error('La orden ya fue completada.');
    }
    if (transactionData.status === 'Cancelada') {
        throw new Error('La orden está cancelada.');
    }
    const storagePath = `artifacts/${appId}/users/${userId}/transactions/${transactionId}/receipts/user/${Date.now()}-${sanitizeReceiptFileName(file.name)}`;
    const fileRef = storageRef(storage, storagePath);
    await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(fileRef);
    await updateDoc(transactionRef, {
        userReceiptUrl: downloadUrl,
        status: 'Pendiente',
        userReceiptUploadedAt: serverTimestamp(),
    });
}

async function setupAdminTransactionsListener({ append = false } = {}) {
    if (!db || !isCurrentUserAdmin || !adminPendingTransactionsList || !adminCompletedTransactionsList) return;

    if (!append) {
        adminTransactionsCursor = null;
        adminTransactionsHasMore = false;
        renderSkeletonList(adminPendingTransactionsList, 2);
        renderSkeletonList(adminCompletedTransactionsList, 2);
        setAdminOrdersStatus('Cargando órdenes recientes...');
    } else {
        setAdminOrdersStatus('Cargando más órdenes...');
    }

    if (adminLoadMoreButton) adminLoadMoreButton.disabled = true;

    try {
        // Read a bounded set without a compound orderBy query, then sort locally.
        // This keeps the admin view functional while Firestore builds indexes.
        const snapshot = await getDocs(query(collectionGroup(db, 'transactions'), limit(120)));
        const relevantDocs = snapshot.docs
            .filter(docSnap => docSnap.ref.path.includes(`artifacts/${appId}/`))
            .sort((left, right) => {
                const leftSeconds = left.data().timestamp?.seconds || 0;
                const rightSeconds = right.data().timestamp?.seconds || 0;
                return rightSeconds - leftSeconds;
            });
        const page = relevantDocs.slice(0, ADMIN_TRANSACTIONS_PAGE_SIZE);
        adminTransactionsCursor = null;
        adminTransactionsHasMore = false;
        renderAdminTransactions(page, { append: false });
        if (!page.length && !append) {
            setAdminOrdersStatus('No hay órdenes para mostrar.');
        } else {
            setAdminOrdersStatus('Mostrando las órdenes más recientes.');
        }
    } catch (error) {
        console.error('Error al cargar transacciones (admin):', error);
        const missingIndex = typeof error?.message === 'string'
            && /COLLECTION_GROUP.*index|requires.*index/i.test(error.message);
        if (missingIndex) {
            try {
                const fallbackTransactions = await loadAdminTransactionsWithoutIndexFallback();
                adminTransactionsHasMore = false;
                renderAdminTransactions(fallbackTransactions, { append: false });
                setAdminOrdersStatus('Vista temporal sin índice desplegado: mostrando órdenes recientes con fallback local. Despliega `firestore:indexes` para ordenar correctamente.', true);
            } catch (fallbackError) {
                console.error('Error en fallback de órdenes admin:', fallbackError);
                const errorMarkup = '<p class="text-sm text-red-600">Error al cargar las ordenes.</p>';
                adminPendingTransactionsList.innerHTML = errorMarkup;
                adminCompletedTransactionsList.innerHTML = errorMarkup;
                setAdminOrdersStatus('Falta desplegar el índice de Firestore para ordenar órdenes por fecha. Ejecuta el deploy de índices y vuelve a intentar.', true);
            }
        } else {
            const errorMarkup = '<p class="text-sm text-red-600">Error al cargar las ordenes.</p>';
            adminPendingTransactionsList.innerHTML = errorMarkup;
            adminCompletedTransactionsList.innerHTML = errorMarkup;
            setAdminOrdersStatus('No se pudieron cargar las órdenes.', true);
        }
        adminTransactionsHasMore = false;
    } finally {
        if (adminLoadMoreButton) adminLoadMoreButton.disabled = false;
        updateAdminLoadMoreButton();
    }
}

async function loadAdminTransactionsWithoutIndexFallback() {
    if (!db || !isCurrentUserAdmin) return [];

    const snapshot = await getDocs(query(collectionGroup(db, 'transactions'), limit(120)));
    const transactions = snapshot.docs
        .filter(docSnap => docSnap.ref.path.includes(`artifacts/${appId}/`))
        .map(docSnap => ({ id: docSnap.id, path: docSnap.ref.path, ...docSnap.data() }));

    transactions.sort((a, b) => (b.timestamp?.seconds || 0) - (a.timestamp?.seconds || 0));
    return transactions.slice(0, ADMIN_TRANSACTIONS_PAGE_SIZE);
}

function renderAdminTransactions(transactions, { append = false } = {}) {
    if (!adminTransactionsSection || !adminPendingTransactionsList || !adminCompletedTransactionsList) return;
    if (!append) {
        adminPendingTransactionsList.innerHTML = '';
        adminCompletedTransactionsList.innerHTML = '';
    }

    const getMillis = (tx) => tx.timestamp?.seconds ? tx.timestamp.seconds * 1000 : 0;
    const pendingTransactions = transactions
        .filter(tx => tx.status !== 'Completado')
        .sort((a, b) => getMillis(a) - getMillis(b));
    const completedTransactions = transactions
        .filter(tx => tx.status === 'Completado')
        .sort((a, b) => getMillis(b) - getMillis(a));

    pendingTransactions.forEach(tx => adminPendingTransactionsList.appendChild(createAdminTransactionCard(tx)));
    completedTransactions.forEach(tx => adminCompletedTransactionsList.appendChild(createAdminTransactionCard(tx)));

    if (!adminPendingTransactionsList.children.length) adminPendingTransactionsList.innerHTML = '<p class="text-sm text-slate-500 p-3">No hay solicitudes pendientes.</p>';
    if (!adminCompletedTransactionsList.children.length) adminCompletedTransactionsList.innerHTML = '<p class="text-sm text-slate-500 p-3">No hay solicitudes completadas.</p>';
    adminTransactionsSection.classList.remove('hidden');
}

function createAdminTransactionCard(tx) {
    const card = document.createElement('div');
    card.className = 'admin-transaction-card m3-transaction-card p-4 space-y-3 text-xs sm:text-sm';
    card.setAttribute('data-transaction-path', tx.path);
    card.setAttribute('data-user-has-receipt', tx.userReceiptUrl ? 'true' : 'false');
    const statusBadgeClass = getStatusBadgeClasses(tx.status);
    const ownerLabel = tx.userEmail || tx.userDisplayName || tx.userId || 'N/A';
    const isCompleted = tx.status === 'Completado';
    const awaitingClientReceipt = !tx.userReceiptUrl && !isCompleted;
    const canAdminCancel = canCancelTransaction(tx.status);
    const completionButtonDisabled = isCompleted || awaitingClientReceipt;
    const completionButtonText = isCompleted
        ? 'Completada'
        : awaitingClientReceipt
            ? 'Esperando comprobante'
            : 'Subir y Completar';
    const cancelButtonMarkup = canAdminCancel
        ? `<button class="admin-cancel-btn btn btn-danger btn-sm" data-transaction-path="${escapeHtml(tx.path)}">Cancelar orden</button>`
        : '';
    const destinationDetailsMarkup = buildDestinationDetailsMarkup(tx, { enableCopy: true });
    const userReceiptSection = tx.userReceiptUrl
        ? `<div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-gray-700">Comprobante cliente:</span>
                <button class="view-receipt-btn btn btn-outline btn-sm" data-url="${escapeHtml(tx.userReceiptUrl)}" data-title="Comprobante cliente ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}">Ver</button>
                <button class="copy-btn btn btn-ghost btn-sm relative" data-copy="${escapeHtml(tx.userReceiptUrl)}">
                    Copiar enlace
                    <span class="copy-feedback opacity-0 absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded transition-all duration-200 pointer-events-none">Copiado!</span>
                </button>
            </div>`
        : '<span class="text-xs text-orange-600">Comprobante cliente pendiente</span>';
    const adminReceiptSection = tx.adminReceiptUrl
        ? `<div class="flex flex-wrap items-center gap-2">
                <span class="font-semibold text-gray-700">Comprobante destino:</span>
                <button class="view-receipt-btn btn btn-outline btn-sm" data-url="${escapeHtml(tx.adminReceiptUrl)}" data-title="Comprobante destino ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}">Ver</button>
                <button class="copy-btn btn btn-ghost btn-sm relative" data-copy="${escapeHtml(tx.adminReceiptUrl)}">
                    Copiar enlace
                    <span class="copy-feedback opacity-0 absolute -top-6 left-1/2 -translate-x-1/2 bg-gray-900 text-white text-xs px-2 py-1 rounded transition-all duration-200 pointer-events-none">Copiado!</span>
                </button>
            </div>`
        : '<span class="text-xs text-gray-500">Comprobante destino no cargado</span>';
    card.innerHTML = `
        <div class="flex items-start justify-between gap-2">
            <div class="min-w-0 space-y-1">
                <p class="text-sm sm:text-base font-bold text-slate-900">Solicitud ${escapeHtml((tx.id || '').slice(0, 8).toUpperCase())}</p>
                <div class="flex flex-wrap items-center gap-2">
                    <span class="inline-flex items-center px-2 py-0.5 font-semibold uppercase tracking-wide bg-amber-100 text-amber-800 rounded-full whitespace-nowrap" style="font-size:0.7rem;">Cliente</span>
                    <span class="text-xs text-slate-500 break-words min-w-0" title="${escapeHtml(ownerLabel)}">${escapeHtml(ownerLabel)}</span>
                </div>
            </div>
            <span class="inline-flex items-center flex-shrink-0 whitespace-nowrap px-2 py-0.5 text-xs font-semibold rounded-full ${statusBadgeClass}">${escapeHtml(tx.status || 'N/A')}</span>
        </div>
        <div class="space-y-2">
            <div class="grid grid-cols-1 sm:grid-cols-2 gap-2">
                <div class="rounded-2xl bg-slate-50 border border-slate-200 p-3"><p class="text-[11px] font-bold uppercase tracking-wide text-slate-500">Enviado</p><p class="m3-money-line mt-1">${formatCurrency(tx.amountSend || 0, tx.currencySend || 'CLP')}</p></div>
                <div class="rounded-2xl bg-amber-50 border border-amber-200/70 p-3"><p class="text-[11px] font-bold uppercase tracking-wide text-amber-700">Destino</p><p class="m3-money-line mt-1">${formatCurrency(tx.amountReceive || 0, tx.currencyReceive || 'CLP')}</p></div>
            </div>
            ${tx.rateApplied ? createCopyRow('Tasa aplicada', formatRounded(tx.rateApplied, 4)) : ''}
        </div>
        ${destinationDetailsMarkup ? `<div class="border-t border-dashed border-slate-200 pt-3 space-y-2">${destinationDetailsMarkup}</div>` : ''}
        <div class="space-y-2 text-xs text-slate-600">
            ${userReceiptSection}
            ${adminReceiptSection}
        </div>
        <div class="mt-2 border-t border-slate-200 pt-3">
            <label class="block text-xs font-semibold text-slate-700 mb-2">Subir comprobante de destino</label>
            <div class="flex flex-col md:flex-row gap-3">
                <input type="file" class="admin-receipt-input field-control field-control-sm flex-1 text-sm" accept="image/*,.pdf" ${completionButtonDisabled ? 'disabled' : ''}>
                <button class="admin-upload-btn btn btn-primary btn-sm" ${completionButtonDisabled ? 'disabled' : ''} style="white-space:normal;">${completionButtonText}</button>
            </div>
            <p class="admin-upload-status text-xs mt-2 hidden"></p>
            ${awaitingClientReceipt ? '<p class="text-xs text-amber-700 mt-2">Esperando comprobante del cliente para habilitar esta acción.</p>' : ''}
        </div>
        ${cancelButtonMarkup ? `<div class="pt-2 border-t border-dashed border-slate-200 space-y-2">
            <p class="text-xs text-slate-600">Acciones administrativas</p>
            <div class="flex flex-wrap gap-2">${cancelButtonMarkup}</div>
        </div>` : ''}
    `;
    return card;
}
async function handleAdminTransactionsListClick(event) {
    if (!isCurrentUserAdmin) return;
    const copyButton = event.target.closest('.copy-btn');
    if (copyButton) {
        copyToClipboard(copyButton.dataset.copy, copyButton);
        return;
    }
    const viewButton = event.target.closest('.view-receipt-btn');
    if (viewButton) {
        event.preventDefault();
        handleViewReceiptButton(viewButton);
        return;
    }
    const cancelButton = event.target.closest('.admin-cancel-btn');
    if (cancelButton) {
        const transactionPath = cancelButton.getAttribute('data-transaction-path');
        if (!transactionPath) return;
        const confirmed = await showConfirm('¿Deseas cancelar esta orden? Esta acción no se puede deshacer.', { title: 'Cancelar orden', acceptText: 'Sí, cancelar' });
        if (!confirmed) return;
        const originalText = cancelButton.textContent;
        cancelButton.disabled = true;
        cancelButton.textContent = 'Cancelando...';
        cancelButton.classList.add('opacity-60');
        cancelTransactionAsAdmin(transactionPath)
            .then(() => {
                cancelButton.textContent = 'Cancelada';
                const statusElement = cancelButton.closest('.admin-transaction-card')?.querySelector('.admin-upload-status');
                if (statusElement) {
                    statusElement.textContent = 'Orden cancelada por el administrador.';
                    statusElement.className = 'admin-upload-status text-xs text-gray-600';
                }
            })
            .catch(error => {
                console.error('Error al cancelar orden (admin):', error);
                showToast(`No se pudo cancelar la orden: ${error.message}`, 'error');
                cancelButton.disabled = false;
                cancelButton.textContent = originalText;
                cancelButton.classList.remove('opacity-60');
            });
        return;
    }
    const uploadButton = event.target.closest('.admin-upload-btn');
    if (!uploadButton) return;
    const card = uploadButton.closest('.admin-transaction-card');
    const fileInput = card?.querySelector('.admin-receipt-input');
    const statusElement = card?.querySelector('.admin-upload-status');
    const hasUserReceipt = card?.getAttribute('data-user-has-receipt') === 'true';
    if (!hasUserReceipt) {
        if (statusElement) {
            statusElement.textContent = 'El cliente aún no ha cargado su comprobante.';
            statusElement.className = 'admin-upload-status text-xs text-red-600';
        }
        return;
    }
    const file = fileInput.files?.[0];
    const transactionPath = card?.getAttribute('data-transaction-path');
    if (!file) {
        if (!statusElement) return;
        statusElement.textContent = 'Selecciona un archivo.';
        statusElement.className = 'admin-upload-status text-xs text-red-600';
        return;
    }
    const fileValidationError = getReceiptFileValidationError(file);
    if (fileValidationError) {
        statusElement.textContent = fileValidationError;
        statusElement.className = 'admin-upload-status text-xs text-red-600';
        return;
    }
    if (!transactionPath) return;
    uploadButton.disabled = true;
    statusElement.textContent = 'Subiendo...';
    statusElement.className = 'admin-upload-status text-xs text-gray-500';
    uploadAdminReceipt(transactionPath, file)
        .then(() => {
            statusElement.textContent = 'Comprobante subido y orden completada.';
            statusElement.className = 'admin-upload-status text-xs text-green-600';
        })
        .catch(error => {
            statusElement.textContent = `Error: ${error.message}`;
            statusElement.className = 'admin-upload-status text-xs text-red-600';
        })
        .finally(() => {
            uploadButton.disabled = false;
            if (fileInput) fileInput.value = '';
        });
}

async function uploadAdminReceipt(transactionPath, file) {
    if (!storage || !db) throw new Error('Firebase no inicializado.');
    const transactionRef = docRefFromAbsolutePath(transactionPath);
    if (!transactionRef) throw new Error('Ruta de transacción inválida.');
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
        throw new Error('La orden no existe.');
    }
    const transactionData = transactionSnap.data();
    if (!transactionData.userReceiptUrl) {
        throw new Error('El cliente aún no ha cargado su comprobante.');
    }
    const storagePath = `${transactionPath}/receipts/admin/${Date.now()}-${sanitizeReceiptFileName(file.name)}`;
    const fileRef = storageRef(storage, storagePath);
    await uploadBytes(fileRef, file);
    const downloadUrl = await getDownloadURL(fileRef);
    await updateDoc(transactionRef, {
        adminReceiptUrl: downloadUrl,
        status: 'Completado',
        completedAt: serverTimestamp(),
    });
}

async function cancelTransactionAsAdmin(transactionPath) {
    if (!db) throw new Error('Firebase no inicializado.');
    const transactionRef = docRefFromAbsolutePath(transactionPath);
    if (!transactionRef) throw new Error('Ruta de transacción inválida.');
    const transactionSnap = await getDoc(transactionRef);
    if (!transactionSnap.exists()) {
        throw new Error('La orden no existe.');
    }
    const data = transactionSnap.data();
    if (data.status === 'Completado') {
        throw new Error('La orden ya fue completada.');
    }
    if (data.status === 'Cancelada') {
        return;
    }
    const updatePayload = {
        status: 'Cancelada',
        cancelledAt: serverTimestamp(),
        cancelledBy: 'admin',
    };
    if (auth?.currentUser.uid) {
        updatePayload.cancelledByUid = auth.currentUser.uid;
    }
    await updateDoc(transactionRef, updatePayload);
}

function escapeHtml(value) {
    return String(value ??  '').replace(/[&<>'"/]/g, s => ({'&':'&amp;','<':'&lt;','>':'&gt;','"':'&quot;',"'":'&#39;','/':'&#x2F;'})[s]);
}

// --- Feedback visual propio (reemplaza alert/confirm nativos) ---

function showToast(message, type = 'info', duration = 3500) {
    const stack = document.getElementById('toast-stack');
    if (!stack || !message) return;
    const safeType = ['success', 'error', 'info'].includes(type) ? type : 'info';
    const toast = document.createElement('div');
    toast.className = `toast toast-${safeType}`;
    toast.textContent = message;
    stack.appendChild(toast);
    requestAnimationFrame(() => toast.classList.add('toast-visible'));
    window.setTimeout(() => {
        toast.classList.remove('toast-visible');
        window.setTimeout(() => toast.remove(), 260);
    }, duration);
}

function showConfirm(message, { title = 'Confirmar acción', acceptText = 'Confirmar' } = {}) {
    return new Promise((resolve) => {
        const modal = document.getElementById('confirm-modal');
        const titleElement = document.getElementById('confirm-title');
        const messageElement = document.getElementById('confirm-message');
        const acceptButton = document.getElementById('confirm-accept-button');
        const cancelButton = document.getElementById('confirm-cancel-button');
        if (!modal || !titleElement || !messageElement || !acceptButton || !cancelButton) {
            console.error('No se pudo abrir el diálogo de confirmación.');
            resolve(false);
            return;
        }
        titleElement.textContent = title;
        messageElement.textContent = message;
        acceptButton.textContent = acceptText;
        let settled = false;
        const finish = (result) => {
            if (settled) return;
            settled = true;
            acceptButton.onclick = null;
            cancelButton.onclick = null;
            closeModalElement(modal);
            resolve(result);
        };
        acceptButton.onclick = () => finish(true);
        cancelButton.onclick = () => finish(false);
        openModalElement(modal, cancelButton);
    });
}

function renderSkeletonList(container, count = 3) {
    if (!container) return;
    container.innerHTML = Array.from({ length: Math.max(1, count) }, () => `
        <div class="skeleton space-y-2" aria-hidden="true">
            <div class="skeleton-line w-2-3"></div>
            <div class="skeleton-line w-1-2"></div>
            <div class="skeleton-line w-1-3"></div>
        </div>
    `).join('');
}

// --- Compartir cotización: imagen con solo el recuadro de resultado ---

async function buildQuoteCanvas() {
    const scale = 2;
    const width = 640;
    const height = 340;
    const canvas = document.createElement('canvas');
    canvas.width = width * scale;
    canvas.height = height * scale;
    const ctx = canvas.getContext('2d');
    ctx.scale(scale, scale);

    // Fondo oscuro con brillo ámbar, espejo del recuadro de la app
    ctx.beginPath();
    ctx.roundRect(0, 0, width, height, 36);
    ctx.clip();
    const bg = ctx.createLinearGradient(0, 0, width, height);
    bg.addColorStop(0, '#101828');
    bg.addColorStop(0.7, '#1c2941');
    bg.addColorStop(1, '#26324b');
    ctx.fillStyle = bg;
    ctx.fillRect(0, 0, width, height);
    const glow = ctx.createRadialGradient(width * 0.94, -40, 20, width * 0.94, -40, 340);
    glow.addColorStop(0, 'rgba(251, 191, 36, 0.30)');
    glow.addColorStop(1, 'rgba(251, 191, 36, 0)');
    ctx.fillStyle = glow;
    ctx.fillRect(0, 0, width, height);
    ctx.strokeStyle = 'rgba(148, 163, 184, 0.28)';
    ctx.lineWidth = 1.5;
    ctx.strokeRect(0.75, 0.75, width - 1.5, height - 1.5);

    // Marca
    ctx.fillStyle = '#f59e0b';
    ctx.beginPath();
    ctx.roundRect(36, 34, 26, 26, 9);
    ctx.fill();
    ctx.fillStyle = '#1c1917';
    ctx.font = '800 17px Outfit, sans-serif';
    ctx.textAlign = 'center';
    ctx.textBaseline = 'middle';
    ctx.fillText('⇅', 49, 48);
    ctx.textAlign = 'left';
    ctx.fillStyle = '#fbbf24';
    if ('letterSpacing' in ctx) ctx.letterSpacing = '3px';
    ctx.font = '700 14px Outfit, sans-serif';
    ctx.fillText('MY REMESAS', 74, 48);
    if ('letterSpacing' in ctx) ctx.letterSpacing = '0px';

    // Fecha a la derecha
    ctx.textAlign = 'right';
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 13px Outfit, sans-serif';
    ctx.fillText(new Date().toLocaleDateString('es-CL', { day: '2-digit', month: 'short', year: 'numeric' }), width - 36, 48);

    // Cantidad enviada
    ctx.textAlign = 'left';
    const sendAmountValue = parseFloat(amountSendInput?.value);
    const sendText = Number.isFinite(sendAmountValue) && sendAmountValue > 0
        ? formatCurrency(sendAmountValue, currencySendSelect?.value || 'CLP')
        : '—';
    ctx.font = '500 15px Outfit, sans-serif';
    ctx.fillStyle = '#94a3b8';
    const sendLabelWidth = ctx.measureText('Envías').width;
    ctx.fillText('Envías', 36, 112);
    ctx.font = '700 18px Outfit, sans-serif';
    ctx.fillStyle = '#e2e8f0';
    ctx.fillText(sendText, 36 + sendLabelWidth + 10, 112);

    // Etiqueta
    ctx.textAlign = 'left';
    ctx.fillStyle = 'rgba(248, 250, 252, 0.9)';
    ctx.font = '600 15px Outfit, sans-serif';
    ctx.fillText('Resultado estimado', 36, 160);

    // Monto con ajuste automático de tamaño
    const amountText = (amountReceiveDisplay?.textContent || '').trim() || '—';
    let amountSize = 58;
    ctx.font = `800 ${amountSize}px Outfit, sans-serif`;
    while (ctx.measureText(amountText).width > width - 72 && amountSize > 24) {
        amountSize -= 2;
        ctx.font = `800 ${amountSize}px Outfit, sans-serif`;
    }
    ctx.fillStyle = '#f8fafc';
    ctx.fillText(amountText, 36, 228);

    // Tasa aplicada (única línea de tasa en la imagen compartida)
    ctx.fillStyle = '#94a3b8';
    ctx.font = '500 15px Outfit, sans-serif';
    const rateText = (rateDisplay?.textContent || '').trim();
    ctx.fillText(rateText, 36, 276);

    // Pie
    ctx.fillStyle = 'rgba(148, 163, 184, 0.65)';
    ctx.font = '500 12px Outfit, sans-serif';
    ctx.fillText('myremesas · tasas referenciales del momento', 36, height - 34);

    return canvas;
}

async function shareQuote() {
    const shareButton = document.getElementById('share-quote-button');
    try {
        if (shareButton) shareButton.disabled = true;
        try {
            await document.fonts.load('800 56px Outfit');
            await document.fonts.load('600 15px Outfit');
        } catch (error) {
            console.warn('Fuentes no disponibles para la imagen, se usa fallback:', error);
        }
        const canvas = await buildQuoteCanvas();
        const blob = await new Promise((resolve) => canvas.toBlob(resolve, 'image/png'));
        if (!blob) throw new Error('No se pudo generar la imagen de la cotización.');
        const file = new File([blob], 'cotizacion-myremesas.png', { type: 'image/png' });
        const currencySend = currencySendSelect?.value || '';
        const currencyReceive = currencyReceiveSelect?.value || '';
        const shareText = `Cotización My Remesas: ${currencySend} → ${currencyReceive}. ${rateDisplay?.textContent || ''}`.trim();
        if (navigator.canShare?.({ files: [file] })) {
            await navigator.share({ files: [file], title: 'Cotización My Remesas', text: shareText });
            return;
        }
        const downloadUrl = URL.createObjectURL(blob);
        const link = document.createElement('a');
        link.href = downloadUrl;
        link.download = 'cotizacion-myremesas.png';
        link.click();
        window.setTimeout(() => URL.revokeObjectURL(downloadUrl), 4000);
        showToast('Imagen de la cotización descargada. Ya puedes compartirla.', 'success');
    } catch (error) {
        if (error?.name === 'AbortError') return;
        console.error('Error al compartir la cotización:', error);
        showToast('No se pudo compartir la cotización.', 'error');
    } finally {
        if (shareButton) shareButton.disabled = false;
    }
}

function createCopyRow(label, value) {
    return `
        <div class="relative py-0.5">
            <p class="text-xs md:text-sm text-gray-600 leading-tight pr-16">${escapeHtml(label)}: <span class="font-semibold text-gray-900">${escapeHtml(value)}</span></p>
            <button class="copy-btn btn btn-ghost btn-sm shrink-0 absolute top-0 right-0" data-copy="${escapeHtml(`${label}: ${value}`)}">Copiar</button>
        </div>
    `;
}

function registerStaticEventListeners() {
    if (amountSendInput) amountSendInput.addEventListener('input', () => {
        calculateExchange();
        scheduleDynamicRatesFetch();
    });
    if (currencySendSelect) currencySendSelect.addEventListener('change', () => calculateExchange());
    if (currencyReceiveSelect) currencyReceiveSelect.addEventListener('change', () => calculateExchange());
    if (swapButton) swapButton.addEventListener('click', () => { swapCurrencies(); calculateExchange(); });
    if (historyContainer) historyContainer.addEventListener('click', handleHistoryContainerClick);
    if (historyLoadMoreButton) {
        historyLoadMoreButton.addEventListener('click', () => {
            loadMoreUserTransactions().catch(error => console.error('Error al cargar más historial:', error));
        });
    }
    if (menuToggleButton) menuToggleButton.addEventListener('click', () => {
        if (!appNavMenu || appNavMenu.classList.contains('hidden')) {
            openAppMenu();
        } else {
            closeAppMenu();
        }
    });
    if (menuCloseButton) menuCloseButton.addEventListener('click', closeAppMenu);
    if (menuBackdrop) menuBackdrop.addEventListener('click', closeAppMenu);
    const bottomNavMenuButton = document.getElementById('bottom-nav-menu-button');
    if (bottomNavMenuButton) bottomNavMenuButton.addEventListener('click', openAppMenu);
    const closeModalXButton = document.getElementById('close-modal-x-button');
    if (closeModalXButton && paymentModal) closeModalXButton.addEventListener('click', closePaymentModal);
    if (paymentModal) {
        paymentModal.addEventListener('click', (event) => {
            if (event.target === paymentModal) closePaymentModal();
        });
    }
    const confirmModal = document.getElementById('confirm-modal');
    if (confirmModal) confirmModal.addEventListener('click', (event) => {
        if (event.target === confirmModal) {
            const confirmCancelButton = document.getElementById('confirm-cancel-button');
            if (confirmCancelButton) confirmCancelButton.click();
        }
    });
    document.addEventListener('click', (event) => {
        if (!appNavMenu || appNavMenu.classList.contains('hidden')) return;
        const target = event.target;
        if (appNavMenu.contains(target) || menuToggleButton?.contains(target) || bottomNavMenuButton?.contains(target)) return;
        closeAppMenu();
    });
    document.querySelectorAll('[data-view]').forEach((button) => {
        button.addEventListener('click', () => {
            activateView(button.getAttribute('data-view')).catch(error => console.error('Error al cambiar de vista:', error));
        });
    });
    if (adminLoadMoreButton) adminLoadMoreButton.addEventListener('click', () => {
        setupAdminTransactionsListener({ append: true }).catch(error => console.error('Error al cargar más órdenes:', error));
    });
    if (saveAccountsButton) saveAccountsButton.addEventListener('click', saveAdminAccounts);
    if (saveMarginsButton) saveMarginsButton.addEventListener('click', saveMarginConfig);
    if (uploadReceiptButton) uploadReceiptButton.addEventListener('click', handleUserReceiptUpload);
    if (savedAccountsList) savedAccountsList.addEventListener('click', handleSavedAccountsListClick);
    if (adminPendingTransactionsList) adminPendingTransactionsList.addEventListener('click', handleAdminTransactionsListClick);
    if (adminCompletedTransactionsList) adminCompletedTransactionsList.addEventListener('click', handleAdminTransactionsListClick);
    if (paymentButton) paymentButton.addEventListener('click', showPaymentModal);
    const shareQuoteButton = document.getElementById('share-quote-button');
    if (shareQuoteButton) shareQuoteButton.addEventListener('click', shareQuote);
    if (closeModalButton) closeModalButton.addEventListener('click', closePaymentModal);
    if (enablePushNotificationsButton) {
        enablePushNotificationsButton.addEventListener('click', () => {
            requestPushNotifications().catch((error) => console.error('Error al activar notificaciones:', error));
        });
    }
    if (disablePushNotificationsButton) {
        disablePushNotificationsButton.addEventListener('click', () => {
            disablePushNotifications().catch((error) => console.error('Error al desactivar notificaciones:', error));
        });
    }
    if (menuLogoutButton) menuLogoutButton.addEventListener('click', async () => {
        await logoutCurrentUser();
    });
    if (adminAccountSelect) adminAccountSelect.addEventListener('change', handleAdminAccountSelection);
    if (selectedAdminAccountDetails) selectedAdminAccountDetails.addEventListener('click', (event) => {
        const button = event.target.closest('.copy-btn');
        if (button) copyToClipboard(button.dataset.copy, button);
    });
    if (refreshUsdtBalanceButton) refreshUsdtBalanceButton.addEventListener('click', () => {
        refreshBinanceBalance().catch(error => console.error('Error al actualizar saldo Binance:', error));
    });
    if (closeImageViewerButton) closeImageViewerButton.addEventListener('click', () => closeReceiptViewer());
    if (imageViewerModal) imageViewerModal.addEventListener('click', (event) => {
        if (event.target === imageViewerModal) closeReceiptViewer();
    });
    if (usdtWalletInput) usdtWalletInput.addEventListener('input', scheduleUsdtDestinationPersist);
    if (usdtNetworkSelect) usdtNetworkSelect.addEventListener('change', scheduleUsdtDestinationPersist);
    if (usdtNotesInput) usdtNotesInput.addEventListener('input', scheduleUsdtDestinationPersist);
    if (vesBeneficiaryInput) vesBeneficiaryInput.addEventListener('input', scheduleVesDestinationPersist);
    if (vesIdInput) vesIdInput.addEventListener('input', scheduleVesDestinationPersist);
    if (vesBankInput) vesBankInput.addEventListener('input', scheduleVesDestinationPersist);
    if (vesAccountTypeInput) vesAccountTypeInput.addEventListener('change', scheduleVesDestinationPersist);
    if (vesAccountNumberInput) vesAccountNumberInput.addEventListener('input', scheduleVesDestinationPersist);
    if (vesNotesInput) vesNotesInput.addEventListener('input', scheduleVesDestinationPersist);
}

function handleSavedAccountsListClick(event) {
    const deleteButton = event.target.closest('.delete-account-btn');
    if (deleteButton) {
        const docId = deleteButton.getAttribute('data-account-id');
        const accountName = deleteButton.getAttribute('data-account-name');
        deleteAdminAccount(docId, accountName);
        return;
    }
    const copyButton = event.target.closest('.copy-btn');
    if (copyButton) {
        copyToClipboard(copyButton.dataset.copy, copyButton);
    }
}

function toggleBinanceBalanceCard(isVisible) {
    if (!binanceBalanceCard) return;
    binanceBalanceCard.classList.toggle('hidden', !isVisible);
}

function setUsdtBalanceStatus(message, isError = false) {
    if (!usdtBalanceStatus) return;
    if (!message) {
        usdtBalanceStatus.textContent = '';
        usdtBalanceStatus.classList.add('hidden');
        usdtBalanceStatus.classList.remove('text-red-600');
        usdtBalanceStatus.classList.add('text-gray-500');
        return;
    }
    usdtBalanceStatus.textContent = message;
    usdtBalanceStatus.classList.remove('hidden');
    if (isError) {
        usdtBalanceStatus.classList.add('text-red-600');
        usdtBalanceStatus.classList.remove('text-gray-500');
    } else {
        usdtBalanceStatus.classList.add('text-gray-500');
        usdtBalanceStatus.classList.remove('text-red-600');
    }
}

async function refreshBinanceBalance() {
    if (!isCurrentUserAdmin || !binanceBalanceCard) return;
    toggleBinanceBalanceCard(true);
    setUsdtBalanceStatus('Consultando saldo...', false);
    if (refreshUsdtBalanceButton) refreshUsdtBalanceButton.disabled = true;
    try {
        const currentUser = auth?.currentUser;
        if (!currentUser) throw new Error('La sesión no está disponible.');
        const idToken = await currentUser.getIdToken();
        const response = await fetch('/api/binance-balance?asset=USDT&_v=' + Date.now(), {
            headers: { Authorization: `Bearer ${idToken}` },
            cache: 'no-store',
        });
        const payload = await response.json().catch(() => ({}));
        if (!response.ok || !payload.success) {
            if (response.status === 401) throw new Error('Tu sesión venció. Vuelve a iniciar sesión.');
            if (response.status === 403) throw new Error('No autorizado para consultar el saldo.');
            throw new Error(payload.message || `HTTP ${response.status}`);
        }
        const balance = payload.balance;
        if (!balance) {
            if (usdtBalanceDisplay) usdtBalanceDisplay.textContent = '--';
            setUsdtBalanceStatus(payload.message || 'Sin balance disponible.', false);
            return;
        }
        const free = Number(balance.free || 0);
        const locked = Number(balance.locked || 0);
        const withdrawing = Number(balance.withdrawing || 0);
        const total = Number(balance.total != null ? balance.total : free + locked + withdrawing);
        if (usdtBalanceDisplay) {
            usdtBalanceDisplay.textContent = `${roundToDecimals(total, 2).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${payload.asset || 'USDT'}`;
        }
        const detailParts = [`Libre: ${roundToDecimals(free, 2).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`];
        if (locked > 0) detailParts.push(`Bloqueado: ${roundToDecimals(locked, 2).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        if (withdrawing > 0) detailParts.push(`En retiro: ${roundToDecimals(withdrawing, 2).toLocaleString('es-CL', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`);
        const detailMessage = detailParts.join('  ');
        if (detailMessage) {
            setUsdtBalanceStatus(detailMessage, false);
        } else {
            setUsdtBalanceStatus('', false);
        }
    } catch (error) {
        console.error('Error al obtener saldo Binance:', error);
        if (usdtBalanceDisplay) usdtBalanceDisplay.textContent = '--';
        const errorMessage = error?.message || '';
        const lowerMessage = errorMessage.toLowerCase();
        if (errorMessage.includes('404')) {
            setUsdtBalanceStatus('Endpoint de Binance no disponible. Verifica la configuración en vercel.json y despliega nuevamente.', true);
        } else if (lowerMessage.includes('restricted location')) {
            setUsdtBalanceStatus('Binance bloque la consulta desde esta ubicación. Debes habilitar IP permitidas o usar una región autorizada.', true);
        } else {
            setUsdtBalanceStatus(errorMessage || 'No se pudo obtener el saldo.', true);
        }
        throw error;
    } finally {
        if (refreshUsdtBalanceButton) refreshUsdtBalanceButton.disabled = false;
    }
}

function scheduleUsdtDestinationPersist() {
    if (!currentTransactionDraft || usdtDestinationForm.classList.contains('hidden')) return;
    if (usdtDestinationSaveTimeout) clearTimeout(usdtDestinationSaveTimeout);
    usdtDestinationSaveTimeout = setTimeout(() => {
        syncCurrentTransactionDraftFromUI();
    }, 400);
}

function scheduleVesDestinationPersist() {
    if (!currentTransactionDraft || vesDestinationForm.classList.contains('hidden')) return;
    if (vesDestinationSaveTimeout) clearTimeout(vesDestinationSaveTimeout);
    vesDestinationSaveTimeout = setTimeout(() => {
        syncCurrentTransactionDraftFromUI();
    }, 400);
}

async function bootstrapApp() {
    try {
        initializeDOM();
        loadLiveRatesCache();
        renderRateDisplays();
        updateLiveRatesTimestampLabel();
        setTicketLiveStatus(lastLiveRatesAt ? 'Usando última referencia viva' : 'Esperando monto');
        if (rateFetchStatus) {
            rateFetchStatus.textContent = 'Ingresa un monto para consultar tasas en vivo.';
        }
        registerStaticEventListeners();
        document.addEventListener('keydown', (event) => {
            const confirmModal = document.getElementById('confirm-modal');
            if (event.key === 'Escape') {
                if (confirmModal && !confirmModal.classList.contains('hidden')) {
                    document.getElementById('confirm-cancel-button')?.click();
                } else if (paymentModal && !paymentModal.classList.contains('hidden')) {
                    closePaymentModal();
                } else {
                    closeReceiptViewer();
                }
            }
            keepFocusInsideModal(event, confirmModal);
            keepFocusInsideModal(event, paymentModal);
            keepFocusInsideModal(event, imageViewerModal);
        });
        calculateExchange();
        await initializeFirebase();
    } catch (error) {
        console.error('Error al iniciar la aplicacion:', error);
    }
}

if (document.readyState === 'loading') {
    document.addEventListener('DOMContentLoaded', bootstrapApp);
} else {
    bootstrapApp();
}




