import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, addDoc, onSnapshot, collection, query, serverTimestamp, setLogLevel, deleteDoc, setDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Establecer nivel de log para depuraciÃ³n de Firestore
setLogLevel('Debug');

// --- CONFIGURACIÃ“N DE SEGURIDAD ---
// Lista de User IDs de administradores autorizados para ver el panel.
// Se obtiene de las variables de entorno de Vercel para mayor seguridad y flexibilidad.
const ADMIN_UIDS_PLACEHOLDER = "VERCEL_INJECTED_ADMIN_UIDS";
const ADMIN_UIDS = ADMIN_UIDS_PLACEHOLDER.split(',').filter(uid => uid.trim() !== '');

// Variables Globales de Firebase (provistas por el entorno)
const appId = "VERCEL_INJECTED_APP_ID";
const firebaseConfig = "VERCEL_INJECTED_FIREBASE_CONFIG";
const initialAuthToken = null; // No estamos usando este mÃ©todo por ahora.

let db;
let auth;
let userId = null;
let isAuthReady = false; // Esta variable debe ser global o pasada como argumento si se usa fuera de initializeFirebase


// Tasas de cambio en vivo / referenciales
let liveRates = {
    // Valores de Referencia Fijos (Fallback)
    WLD_to_USDT: 2.80,
    USDT_to_CLP: 950.00, // Tasa de Referencia (1 USDT = X CLP)
    USDT_to_VES: 36.50   // Tasa de Referencia (1 USDT = X VES)
};

// Cuentas de destino del administrador
let adminAccounts = []; 

// ConfiguraciÃ³n de mÃ¡rgenes (se puede sobrescribir desde Firestore)
const DEFAULT_MARGIN_CONFIG = {
    discountWldClp: 0.14,
    discountClpVes: 0.06,
    marginUsdtClp: 0.004,
};
const MARGIN_CONFIG_COLLECTION = 'config';
const MARGIN_CONFIG_DOC_ID = 'pricing';
let marginConfig = { ...DEFAULT_MARGIN_CONFIG };
let marginConfigUnsubscribe = null;

// --- DECLARACIÃ“N DE VARIABLES DEL DOM (INICIALIZACIÃ“N MOVIDA A initializeDOM) ---
let userIdDisplay, userIdContainer, authStatus, amountSendInput, currencySendSelect, currencyReceiveSelect, swapButton, amountReceiveDisplay, rateDisplay, paymentButton, errorMessage, historyContainer, loadingHistory, adminPanel, toggleAdminButton, rateFetchStatus, savedAccountsList, accountCount, wldUsdtDisplay, usdtClpP2pWldDisplay, clpUsdtP2pDisplay, vesUsdtP2pDisplay, usdtClpMarginDisplay, adminBankNameInput, adminAccountHolderInput, adminAccountNumberInput, adminRutInput, adminAccountTypeInput, adminEmailInput, saveAccountsButton, accountStatus, paymentModal, closeModalButton, modalAmountSend, modalAmountReceive, adminAccountDetailsContainer, noAccountsMessage, modalCryptoWarning, modalTransferCurrency, adminToggleContainer, marginWldClpInput, marginClpVesInput, marginUsdtClpInput, saveMarginsButton, marginStatus, marginWldClpLabel, marginClpVesLabel, marginUsdtClpLabel;

/**
 * Inicializa todas las referencias a los elementos del DOM.
 */
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
    paymentButton = document.getElementById('payment-button'); 
    errorMessage = document.getElementById('error-message');
    historyContainer = document.getElementById('transaction-history');
    loadingHistory = document.getElementById('loading-history');
    adminPanel = document.getElementById('admin-panel');
    toggleAdminButton = document.getElementById('toggle-admin-button');
    adminToggleContainer = document.getElementById('admin-toggle-container');
    rateFetchStatus = document.getElementById('rate-fetch-status');
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
    adminAccountDetailsContainer = document.getElementById('admin-account-details-container');
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

    // **CORRECCIÃ“N**: Evita que el botÃ³n de pago envÃ­e el formulario por defecto.
    if (paymentButton) paymentButton.type = 'button';

    applyMarginConfigToUI();
}

// --- Funciones de Utilidad y Firebase ---

async function initializeFirebase() {
    try {
        if (!firebaseConfig) {
            authStatus.textContent = "Error: ConfiguraciÃ³n de Firebase no disponible.";
            return;
        }

        const app = initializeApp(firebaseConfig);
        db = getFirestore(app);
        auth = getAuth(app);

        onAuthStateChanged(auth, async (user) => {
            if (user) {
                userId = user.uid;
                userIdDisplay.textContent = userId;
                userIdContainer.classList.remove('hidden');
                authStatus.textContent = "Autenticado. Listo para usar.";
                isAuthReady = true;

                const isAdminUser = ADMIN_UIDS.includes(userId);
                if (isAdminUser) {
                    setupMarginConfigListener();
                    adminToggleContainer.classList.remove('hidden');
                } else {
                    marginConfig = { ...DEFAULT_MARGIN_CONFIG };
                    applyMarginConfigToUI();
                }
                
                setupTransactionListener();
                setupAdminAccountsListener(); 
            } else {
                await authenticateUser();
            }
        });

        if (initialAuthToken) {
            await signInWithCustomToken(auth, initialAuthToken);
        } else {
            await signInAnonymously(auth);
        }

    } catch (error) {
        console.error("Error al inicializar o autenticar Firebase:", error);
        authStatus.textContent = `Error de Firebase: ${error.message}`;
    }
}

async function authenticateUser() {
     try {
         if (initialAuthToken) {
             await signInWithCustomToken(auth, initialAuthToken);
         } else {
             await signInAnonymously(auth);
         }
     } catch (error) {
         console.error("Error de autenticaciÃ³n:", error);
         authStatus.textContent = `Error de AutenticaciÃ³n: ${error.message}`;
     }
}

function formatCurrency(value, currencyCode) {
    if (currencyCode === 'WLD') {
        return `${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })} WLD`;
    }
    if (currencyCode === 'USDT') {
         return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`;
    }
    if (currencyCode === 'VES') {
         return value.toLocaleString('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (currencyCode === 'CLP') {
         return value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
    return value.toLocaleString('es-ES', { minimumFractionDigits: 2, maximumFractionDigits: 2 });
}

 /**
 * **NUEVA FUNCIÃ“N**: Copia texto al portapapeles y muestra feedback.
 */
function copyToClipboard(text, element) {
    // Usamos document.execCommand para mayor compatibilidad en iframes
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
function getMarginValue(key) {
    const value = marginConfig[key];
    if (typeof value === 'number' && !Number.isNaN(value)) {
        return value;
    }
    return DEFAULT_MARGIN_CONFIG[key];
}

function formatPercent(value) {
    const percent = value * 100;
    if (!Number.isFinite(percent)) return '0';
    return percent.toFixed(2).replace(/\.?0+$/, '');
}

function hideMarginStatus() {
    if (!marginStatus) return;
    marginStatus.classList.add('hidden');
}

function showMarginStatus(message, isError = false) {
    if (!marginStatus) return;
    marginStatus.textContent = message;
    marginStatus.classList.remove('hidden');
    if (isError) {
        marginStatus.classList.add('text-red-600');
        marginStatus.classList.remove('text-yellow-800');
    } else {
        marginStatus.classList.remove('text-red-600');
        marginStatus.classList.add('text-yellow-800');
    }
}

function applyMarginConfigToUI() {
    const discountWldClp = getMarginValue('discountWldClp');
    const discountClpVes = getMarginValue('discountClpVes');
    const marginUsdtClp = getMarginValue('marginUsdtClp');

    const wldPercent = formatPercent(discountWldClp);
    const clpVesPercent = formatPercent(discountClpVes);
    const usdtClpPercent = formatPercent(marginUsdtClp);

    if (marginWldClpLabel) marginWldClpLabel.textContent = wldPercent;
    if (marginClpVesLabel) marginClpVesLabel.textContent = clpVesPercent;
    if (marginUsdtClpLabel) marginUsdtClpLabel.textContent = usdtClpPercent;

    if (marginWldClpInput && document.activeElement !== marginWldClpInput) {
        marginWldClpInput.value = wldPercent;
    }
    if (marginClpVesInput && document.activeElement !== marginClpVesInput) {
        marginClpVesInput.value = clpVesPercent;
    }
    if (marginUsdtClpInput && document.activeElement !== marginUsdtClpInput) {
        marginUsdtClpInput.value = usdtClpPercent;
    }

    hideMarginStatus();
}

function setupMarginConfigListener() {
    if (!db || marginConfigUnsubscribe) return;

    const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);
    marginConfigUnsubscribe = onSnapshot(configDocRef, (snapshot) => {
        if (snapshot.exists()) {
            const data = snapshot.data();
            marginConfig = {
                discountWldClp: typeof data.discountWldClp === 'number' ? data.discountWldClp : DEFAULT_MARGIN_CONFIG.discountWldClp,
                discountClpVes: typeof data.discountClpVes === 'number' ? data.discountClpVes : DEFAULT_MARGIN_CONFIG.discountClpVes,
                marginUsdtClp: typeof data.marginUsdtClp === 'number' ? data.marginUsdtClp : DEFAULT_MARGIN_CONFIG.marginUsdtClp,
            };
        } else {
            marginConfig = { ...DEFAULT_MARGIN_CONFIG };
        }
        applyMarginConfigToUI();
        calculateExchange(false);
    }, (error) => {
        console.error('Error al escuchar m?rgenes:', error);
        if (error?.code === 'permission-denied') {
            console.warn('El usuario no tiene permisos para leer config/pricing. Se usar?n m?rgenes por defecto.');
            marginConfig = { ...DEFAULT_MARGIN_CONFIG };
            applyMarginConfigToUI();
            calculateExchange(false);
        }
    });
}

function readPercentInput(inputElement, label, fallbackDecimal) {
    if (!inputElement) return fallbackDecimal;
    const raw = (inputElement.value ?? '').toString().replace(',', '.').trim();
    if (raw === '') return fallbackDecimal;

    const numeric = parseFloat(raw);
    if (!Number.isFinite(numeric)) {
        throw new Error(`Ingrese un valor numérico válido para ${label}.`);
    }
    if (numeric < 0 || numeric > 100) {
        throw new Error(`${label} debe estar entre 0% y 100%.`);
    }
    return numeric / 100;
}

async function saveMarginConfig(event) {
    if (event) event.preventDefault();
    if (!isAuthReady || !db) {
        showMarginStatus('Error: conexión no lista.', true);
        return;
    }
    if (!ADMIN_UIDS.includes(userId)) {
        showMarginStatus('No autorizado para actualizar márgenes.', true);
        return;
    }

    const currentConfig = {
        discountWldClp: getMarginValue('discountWldClp'),
        discountClpVes: getMarginValue('discountClpVes'),
        marginUsdtClp: getMarginValue('marginUsdtClp'),
    };

    let discountWldClp;
    let discountClpVes;
    let marginUsdtClp;
    try {
        discountWldClp = readPercentInput(marginWldClpInput, 'Descuento WLD -> CLP', currentConfig.discountWldClp);
        discountClpVes = readPercentInput(marginClpVesInput, 'Descuento CLP -> VES', currentConfig.discountClpVes);
        marginUsdtClp = readPercentInput(marginUsdtClpInput, 'Margen USDT -> CLP', currentConfig.marginUsdtClp);
    } catch (validationError) {
        showMarginStatus(validationError.message, true);
        return;
    }

    const configDocRef = doc(db, MARGIN_CONFIG_COLLECTION, MARGIN_CONFIG_DOC_ID);

    try {
        showMarginStatus('Guardando márgenes...');
        if (saveMarginsButton) {
            saveMarginsButton.disabled = true;
            saveMarginsButton.textContent = 'Guardando...';
        }
        await setDoc(configDocRef, {
            discountWldClp,
            discountClpVes,
            marginUsdtClp,
            updatedAt: serverTimestamp(),
            updatedBy: userId,
        }, { merge: true });

        marginConfig = { discountWldClp, discountClpVes, marginUsdtClp };
        applyMarginConfigToUI();
        calculateExchange(false);
        showMarginStatus('Márgenes guardados correctamente.');
        setTimeout(() => hideMarginStatus(), 3000);
    } catch (error) {
        console.error('Error al guardar márgenes:', error);
        showMarginStatus(`Error al guardar márgenes: ${error.message}`, true);
    } finally {
        if (saveMarginsButton) {
            saveMarginsButton.disabled = false;
            saveMarginsButton.textContent = 'Guardar Márgenes';
        }
    }
}
// --- LÃ³gica de AdministraciÃ³n de Cuentas ---

async function saveAdminAccounts() {
    if (!isAuthReady || !db) {
        accountStatus.textContent = "Error: ConexiÃ³n no lista.";
        return;
    }

    const bankName = adminBankNameInput.value;
    const accountHolder = adminAccountHolderInput.value.trim();
    const accountNumber = adminAccountNumberInput.value.trim();
    const rut = adminRutInput.value.trim();
    const accountType = adminAccountTypeInput.value;
    const email = adminEmailInput.value.trim();

    if (!bankName || !accountHolder || !accountNumber || !rut || !accountType) {
        accountStatus.textContent = "Error: Complete todos los campos requeridos (Banco, Titular, NÃºmero, RUT, Tipo).";
        return;
    }
    
    saveAccountsButton.disabled = true;
    saveAccountsButton.textContent = 'Guardando...';

    try {
        const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
        await addDoc(collection(db, collectionPath), {
            bankName,
            accountHolder,
            accountNumber,
            rut,
            accountType,
            email: email || 'N/A',
            updatedBy: userId,
            timestamp: serverTimestamp()
        });
        
        adminBankNameInput.value = '';
        adminAccountHolderInput.value = 'Ender Javier PiÃ±a Rojas';
        adminAccountNumberInput.value = '';
        adminRutInput.value = '26728535-7';
        adminAccountTypeInput.value = '';
        adminEmailInput.value = '';

        accountStatus.textContent = "Â¡Cuenta guardada correctamente!";
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
        console.error("Error: ConexiÃ³n a Firebase no lista.");
        accountStatus.textContent = "Error: ConexiÃ³n no lista.";
        return;
    }
    
     try {
         const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
         const docRef = doc(db, collectionPath, docId);
         await deleteDoc(docRef);
         accountStatus.textContent = `Cuenta ${accountName} eliminada correctamente.`;
         console.log(`Cuenta eliminada: ${accountName}`);
     } catch (error) {
         console.error("Error al eliminar cuenta:", error);
         accountStatus.textContent = "Error al eliminar: " + error.message;
     }
}

function setupAdminAccountsListener() {
    if (!isAuthReady || !db) return;

    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
    const accountsCollectionRef = collection(db, collectionPath);
    const q = query(accountsCollectionRef);

    onSnapshot(q, (snapshot) => {
        adminAccounts = [];
        snapshot.forEach((doc) => {
            adminAccounts.push({ id: doc.id, ...doc.data() });
        });

        adminAccounts.sort((a, b) => a.bankName.localeCompare(b.bankName));

        renderAdminAccountsList();
        accountCount.textContent = adminAccounts.length;
    }, (error) => {
        console.error("Error al escuchar cuentas:", error);
        accountStatus.textContent = "Error al cargar cuentas.";
    });
}

function renderAdminAccountsList() {
    savedAccountsList.innerHTML = '';
    if (adminAccounts.length === 0) {
        savedAccountsList.innerHTML = '<p class="text-sm text-gray-500 p-2">No hay cuentas configuradas.</p>';
        return;
    }
    
    adminAccounts.forEach(account => {
        const item = document.createElement('div');
        item.className = 'p-3 bg-white border border-yellow-300 rounded-lg flex justify-between items-center text-xs';
        item.innerHTML = `
            <div>
                <p class="font-bold text-gray-800">${account.bankName} (${account.accountType})</p>
                <p class="text-gray-600">NÂ° ${account.accountNumber} | RUT: ${account.rut}</p>
            </div>
            <button data-id="${account.id}" data-name="${account.bankName} (${account.accountType})" class="delete-account-btn text-red-500 hover:text-red-700 ml-2 p-1 rounded-full bg-red-100 transition duration-150">
                <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" stroke-width="2">
                  <path stroke-linecap="round" stroke-linejoin="round" d="M19 7l-.867 12.142A2 2 0 0116.138 21H7.862a2 2 0 01-1.995-1.858L5 7m5 4v6m4-6v6m1-10V4a1 1 0 00-1-1h-4a1 1 0 00-1 1v3M4 7h16" />
                </svg>
            </button>
        `;
        savedAccountsList.appendChild(item);
    });
    
    savedAccountsList.querySelectorAll('.delete-account-btn').forEach(button => {
        button.addEventListener('click', (e) => {
            const docId = e.currentTarget.getAttribute('data-id');
            const accountName = e.currentTarget.getAttribute('data-name');
            deleteAdminAccount(docId, accountName);
        });
    });
}

// --- LÃ³gica de Tasas DinÃ¡micas ---

async function fetchDynamicRates() {
    rateFetchStatus.textContent = 'Conectando con API de Vercel...';
    
    try {
        // Llama a tu Serverless Function de Vercel
        const response = await fetch('/api/rates'); 
        if (!response.ok) {
            throw new Error(`Respuesta de la API de Vercel no fue exitosa: ${response.status}`);
        }
        const data = await response.json();
        
        // Ajusta la lÃ³gica para usar la respuesta de tu API de Vercel
        if (data?.success) {
            liveRates.USDT_to_CLP = data.USDT_to_CLP_P2P;
            liveRates.USDT_to_VES = data.VES_per_USDT_SELL; // Usamos la nueva tasa de venta
            liveRates.WLD_to_USDT = data.WLD_to_USDT;
            
            wldUsdtDisplay.textContent = `WLD/USDT: ${liveRates.WLD_to_USDT.toFixed(4)}`;
            clpUsdtP2pDisplay.textContent = `USDT/CLP: 1 USDT = ${liveRates.USDT_to_CLP.toFixed(2)} CLP`;
            usdtClpP2pWldDisplay.textContent = `USDT/CLP: ${liveRates.USDT_to_CLP.toFixed(2)} CLP / USDT`;
            vesUsdtP2pDisplay.textContent = `USDT/VES: 1 USDT = ${liveRates.USDT_to_VES.toFixed(2)} VES`;
            rateFetchStatus.textContent = 'Tasas obtenidas de la API de Vercel.';
        } else {
            throw new Error("Respuesta de la API de Vercel con formato inesperado o error.");
        }
    } catch (error) {
        console.warn("Fallo en la conexiÃ³n con la API de Vercel. Usando tasas de referencia fijas.", error);
        wldUsdtDisplay.textContent = `WLD/USDT: ${liveRates.WLD_to_USDT.toFixed(4)} (Fijo)`;
        clpUsdtP2pDisplay.textContent = `USDT/CLP: 1 USDT = ${liveRates.USDT_to_CLP.toFixed(2)} CLP (Fijo)`;
        usdtClpP2pWldDisplay.textContent = `USDT/CLP: ${liveRates.USDT_to_CLP.toFixed(2)} CLP / USDT (Fijo)`;
        vesUsdtP2pDisplay.textContent = `USDT/VES: 1 USDT = ${liveRates.USDT_to_VES.toFixed(2)} VES (Fijo)`;
        rateFetchStatus.textContent = 'Fallo de conexiÃ³n. Usando tasas de Referencia Fijas.';
    }

    // **CORRECCIÃ“N**: Llama al cÃ¡lculo inicial pero sin habilitar el botÃ³n de pago.
    calculateExchange(false);
}


// --- LÃ³gica de Intercambio (CÃ¡lculo) ---

function calculateFullRatesInternal() {
    const fullRates = {};
    
    const wldToUsdt = liveRates.WLD_to_USDT;
    const usdtToClp = liveRates.USDT_to_CLP;
    const usdtToVes = liveRates.USDT_to_VES;

    const discountWldClp = getMarginValue('discountWldClp');
    const discountClpVes = getMarginValue('discountClpVes');
    const marginUsdtClp = getMarginValue('marginUsdtClp');

    if (wldToUsdt !== null && usdtToClp !== null) {
        const baseWldToClp = wldToUsdt * usdtToClp;
        const finalWldToClp = baseWldToClp * (1 - discountWldClp);
        fullRates['WLD_to_CLP'] = finalWldToClp;
        fullRates['CLP_to_WLD'] = 1 / finalWldToClp;
    } else {
        fullRates['WLD_to_CLP'] = null;
        fullRates['CLP_to_WLD'] = null;
    }

    if (usdtToClp !== null && usdtToVes !== null) {
        const baseClpToVesRate = usdtToVes / usdtToClp;
        const finalClpToVesRate = baseClpToVesRate * (1 - discountClpVes);
        fullRates['CLP_to_VES'] = finalClpToVesRate;
        fullRates['VES_to_CLP'] = 1 / finalClpToVesRate;
    } else {
        fullRates['CLP_to_VES'] = null;
        fullRates['VES_to_CLP'] = null;
    }
    
    if (usdtToClp !== null) {
        const finalUsdtToClp = usdtToClp * (1 + marginUsdtClp);
        const finalClpToUsdt = 1 / finalUsdtToClp;
        fullRates['CLP_to_USDT'] = finalClpToUsdt;
        fullRates['USDT_to_CLP'] = finalUsdtToClp;
        if (usdtClpMarginDisplay) {
            const percentText = formatPercent(marginUsdtClp);
            usdtClpMarginDisplay.textContent = `1 USDT = ${finalUsdtToClp.toFixed(2)} CLP (Margen +${percentText}%)`;
        }
    } else {
        fullRates['CLP_to_USDT'] = null;
        fullRates['USDT_to_CLP'] = null;
    }
    
    if (usdtToVes !== null) {
        fullRates['USDT_to_VES'] = usdtToVes;
        fullRates['VES_to_USDT'] = 1 / usdtToVes;
    } else {
        fullRates['USDT_to_VES'] = null;
        fullRates['VES_to_USDT'] = null;
    }

    fullRates['WLD_to_VES'] = null;
    fullRates['VES_to_WLD'] = null;
    fullRates['CLP_to_CLP'] = 1.0;
    fullRates['VES_to_VES'] = 1.0;
    fullRates['WLD_to_WLD'] = 1.0;
    fullRates['USDT_to_USDT'] = 1.0;
    
    return fullRates;
}

function calculateExchange(enablePaymentButton = true) {
    const amountSend = parseFloat(amountSendInput.value);
    const currencySend = currencySendSelect.value;
    const currencyReceive = currencyReceiveSelect.value;
    const rates = calculateFullRatesInternal();

    const isReady = (rates.CLP_to_VES !== null || rates.VES_to_CLP !== null) &&
                    (rates.USDT_to_CLP !== null || rates.CLP_to_USDT !== null);

    if (!isReady) {
        rateDisplay.textContent = "Cargando tasas de cambio dinámicas...";
        paymentButton.disabled = true;
        return;
    }

    if (isNaN(amountSend) || amountSend <= 0) {
        amountReceiveDisplay.textContent = formatCurrency(0, currencyReceive);
        rateDisplay.textContent = "Ingrese un monto válido.";
        paymentButton.disabled = true;
        errorMessage.classList.add('hidden');
        return;
    }

    const rateKey = `${currencySend}_to_${currencyReceive}`;
    const rate = rates[rateKey];

    if (rate === null || typeof rate === 'undefined') {
        amountReceiveDisplay.textContent = "N/A";
        rateDisplay.textContent = `Intercambio ${currencySend} a ${currencyReceive} no disponible.`;
        paymentButton.disabled = true;
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = `Error: El intercambio de ${currencySend} a ${currencyReceive} no es una ruta de remesa válida.`;
        return;
    }

    if (enablePaymentButton && !isNaN(amountSend) && amountSend > 0) {
        paymentButton.disabled = false;
    }
    errorMessage.classList.add('hidden');

    const amountReceive = amountSend * rate;
    const rateFixed = rate.toFixed(currencyReceive === 'WLD' ? 8 : currencyReceive === 'CLP' ? 2 : 4);
    const discountClpVesPercent = formatPercent(getMarginValue('discountClpVes'));
    const discountWldClpPercent = formatPercent(getMarginValue('discountWldClp'));
    const marginUsdtClpPercent = formatPercent(getMarginValue('marginUsdtClp'));
    let rateText;

    if (currencySend === currencyReceive) {
        rateText = "Intercambio 1:1";
    } else if (currencySend === 'CLP' && currencyReceive === 'VES') {
        rateText = `Tasa de Intercambio CLP/VES (Desc. ${discountClpVesPercent}%): 1 CLP = ${rateFixed} VES`;
    } else if (currencySend === 'WLD' && currencyReceive === 'CLP') {
        rateText = `Tasa de Intercambio WLD/CLP (Desc. ${discountWldClpPercent}%): 1 WLD = ${rateFixed} CLP`;
    } else if (currencySend === 'USDT' && currencyReceive === 'CLP') {
        rateText = `Tasa de Intercambio USDT/CLP (Margen +${marginUsdtClpPercent}%): 1 USDT = ${rateFixed} CLP`;
    } else {
        rateText = `Tasa de Cambio: 1 ${currencySend} = ${rateFixed} ${currencyReceive}`;
    }

    amountReceiveDisplay.textContent = formatCurrency(amountReceive, currencyReceive);
    rateDisplay.textContent = rateText;
}

function swapCurrencies() {
    const sendVal = currencySendSelect.value;
    currencySendSelect.value = currencyReceiveSelect.value;
    currencyReceiveSelect.value = sendVal;
    calculateExchange();
}

// --- LÃ³gica de Transacciones y Modal de Pago ---

async function recordTransaction(amountSend, currencySend, amountReceive, currencyReceive) {
    if (!isAuthReady || !db) {
        console.error("Error: Firebase o autenticaciÃ³n no lista para registrar.");
        return;
    }
    const transactionData = {
        amountSend: amountSend,
        currencySend: currencySend,
        amountReceive: amountReceive,
        currencyReceive: currencyReceive,
        rateApplied: amountReceive / amountSend,
        timestamp: serverTimestamp(),
        userId: userId,
        status: 'Pendiente'
    };
    try {
        const collectionPath = `artifacts/${appId}/users/${userId}/transactions`;
        await addDoc(collection(db, collectionPath), transactionData);
        console.log("TransacciÃ³n registrada con Ã©xito.");
    } catch (error) {
        console.error("Error al registrar transacciÃ³n:", error);
    }
}

function setupTransactionListener() {
    if (!isAuthReady || !db || !userId) return;

    const collectionPath = `artifacts/${appId}/users/${userId}/transactions`;
    const transactionsCollectionRef = collection(db, collectionPath);
    const q = query(transactionsCollectionRef);

    onSnapshot(q, (snapshot) => {
        const transactions = [];
        snapshot.forEach((doc) => {
            transactions.push({ id: doc.id, ...doc.data() });
        });

        transactions.sort((a, b) => b.timestamp?.seconds - a.timestamp?.seconds);

        renderTransactionHistory(transactions);
    }, (error) => {
        console.error("Error al escuchar transacciones:", error);
        loadingHistory.textContent = "Error al cargar el historial.";
    });
}

function renderTransactionHistory(transactions) {
    historyContainer.innerHTML = '';
    if (transactions.length === 0) {
        historyContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">AÃºn no hay transacciones.</p>';
        return;
    }

    transactions.forEach(tx => {
        const date = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleDateString() : 'Cargando fecha...';
        const time = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleTimeString() : '';

        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm';
        item.innerHTML = `
            <p class="font-bold text-gray-800">${formatCurrency(tx.amountSend, tx.currencySend)} â†’ ${formatCurrency(tx.amountReceive, tx.currencyReceive)}</p>
            <p class="text-xs text-gray-500 mt-1">
                Tasa: ${tx.rateApplied ? tx.rateApplied.toFixed(tx.currencySend === 'CLP' ? 8 : 4) : 'N/A'}
                | Fecha: ${date} ${time}
            </p>
            <span class="inline-block mt-2 px-2 py-0.5 text-xs font-semibold rounded-full ${tx.status === 'Pendiente' ? 'bg-orange-100 text-orange-800' : 'bg-green-100 text-green-800'}">${tx.status}</span>
        `;
        historyContainer.appendChild(item);
    });
}

function showPaymentModal() {
    const amountSend = parseFloat(amountSendInput.value);
    const currencySend = currencySendSelect.value;
    const currencyReceive = currencyReceiveSelect.value;
    const amountReceiveText = amountReceiveDisplay.textContent;
    
    modalAmountSend.textContent = formatCurrency(amountSend, currencySend);
    modalAmountReceive.textContent = amountReceiveText;
    
    if (currencySend === 'CLP') {
        modalCryptoWarning.classList.add('hidden');
        modalTransferCurrency.textContent = 'CLP';

        adminAccountDetailsContainer.innerHTML = '';
        const clpAccounts = adminAccounts.filter(acc => acc.accountType.includes('Cuenta') || acc.bankName === 'Mercado Pago' || acc.bankName === 'Global66');

        if (clpAccounts.length > 0) {
            noAccountsMessage.classList.add('hidden');
            clpAccounts.forEach(account => {
                const accountDiv = document.createElement('div');
                accountDiv.className = 'p-3 bg-white border border-cyan-300 rounded-lg shadow-sm';
                // **MEJORA UX**: Se agrega un botÃ³n para copiar el nÃºmero de cuenta
                accountDiv.innerHTML = `
                    <p class="font-bold text-cyan-700">${account.bankName} (${account.accountType})</p>
                    <p class="text-sm text-gray-700">Titular: ${account.accountHolder}</p>
                    <p class="text-sm text-gray-700">RUT: ${account.rut}</p>
                    <div class="flex justify-between items-center mt-1 relative">
                        <p class="text-sm text-gray-700">NÂ° Cuenta: <span class="font-mono">${account.accountNumber}</span></p>
                        <button class="copy-btn p-1 rounded hover:bg-teal-100" data-copy="${account.accountNumber}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            <span class="copy-feedback">Â¡Copiado!</span>
                        </button>
                    </div>
                    ${account.email && account.email !== 'N/A' ? `<p class="text-sm text-gray-700 mt-1">Email: ${account.email}</p>` : ''}
                `;
                adminAccountDetailsContainer.appendChild(accountDiv);
            });
        } else {
            noAccountsMessage.classList.remove('hidden');
            noAccountsMessage.textContent = 'El administrador no ha configurado cuentas CLP para recibir la transferencia.';
        }
    } else if (currencySend === 'WLD' || currencySend === 'USDT') {
        modalCryptoWarning.classList.remove('hidden');
        modalTransferCurrency.textContent = currencySend;
        adminAccountDetailsContainer.innerHTML = '<p class="text-center text-gray-600 p-4">La direcciÃ³n de la Wallet serÃ¡ proporcionada por el administrador una vez que confirme su intenciÃ³n de enviar criptomonedas.</p>';
    } else {
        modalCryptoWarning.classList.remove('hidden');
        modalCryptoWarning.textContent = `Aviso: El mÃ©todo de transferencia para ${currencySend} debe ser coordinado con el administrador.`;
        adminAccountDetailsContainer.innerHTML = '';
    }
    
    const rates = calculateFullRatesInternal();
    const rate = rates[`${currencySend}_to_${currencyReceive}`] || 0;
    recordTransaction(amountSend, currencySend, amountSend * rate, currencyReceive);

    paymentModal.classList.remove('hidden');
}

// --- InicializaciÃ³n y Listeners ---

window.onload = function () {
    initializeDOM();
    initializeFirebase();

    setTimeout(() => {
        fetchDynamicRates();
    }, 500); 

    amountSendInput.addEventListener('input', calculateExchange);
    currencySendSelect.addEventListener('change', calculateExchange);
    currencyReceiveSelect.addEventListener('change', calculateExchange);
    swapButton.addEventListener('click', swapCurrencies);

    toggleAdminButton.addEventListener('click', () => {
        adminPanel.classList.toggle('hidden');
        toggleAdminButton.textContent = adminPanel.classList.contains('hidden') ? 'Mostrar Panel de AdministraciÃ³n' : 'Ocultar Panel de AdministraciÃ³n';
    });
    
    saveAccountsButton.addEventListener('click', saveAdminAccounts);
    if (saveMarginsButton) {
        saveMarginsButton.addEventListener('click', saveMarginConfig);
    }
    
    paymentButton.addEventListener('click', showPaymentModal);
    closeModalButton.addEventListener('click', () => {
        paymentModal.classList.add('hidden');
    });

    // **NUEVO LISTENER**: DelegaciÃ³n de eventos para los botones de copiado
    adminAccountDetailsContainer.addEventListener('click', function(event) {
        const button = event.target.closest('.copy-btn');
        if (button) {
            const textToCopy = button.dataset.copy;
            copyToClipboard(textToCopy, button);
        }
    });
};













