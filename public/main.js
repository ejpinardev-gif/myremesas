import { initializeApp } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-app.js";
import { getAuth, signInAnonymously, signInWithCustomToken, onAuthStateChanged } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-auth.js";
import { getFirestore, doc, addDoc, onSnapshot, collection, query, serverTimestamp, setLogLevel, deleteDoc } from "https://www.gstatic.com/firebasejs/11.6.1/firebase-firestore.js";

// Establecer nivel de log para depuración de Firestore
setLogLevel('Debug');

// --- CONFIGURACIÓN DE SEGURIDAD ---
// Lista de User IDs de administradores autorizados para ver el panel.
// Se obtiene de las variables de entorno de Vercel para mayor seguridad y flexibilidad.
const ADMIN_UIDS_PLACEHOLDER = "VERCEL_INJECTED_ADMIN_UIDS";
const ADMIN_UIDS = ADMIN_UIDS_PLACEHOLDER.split(',').filter(uid => uid.trim() !== '');

// Variables Globales de Firebase (provistas por el entorno)
const appId = "VERCEL_INJECTED_APP_ID";
const firebaseConfig = "VERCEL_INJECTED_FIREBASE_CONFIG";
const initialAuthToken = null; // No estamos usando este método por ahora.

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

// Descuentos y Margenes
const DISCOUNT_RATE_WLD_CLP = 0.14; // 14% de descuento para WLD/CLP
const DISCOUNT_RATE_CLP_VES = 0.06; // 6% de descuento para CLP/VES (ACTUALIZADO)
const MARGIN_RATE_USDT_CLP = 0.004; // 0.4% de margen de incremento para USDT/CLP

// --- DECLARACIÓN DE VARIABLES DEL DOM (INICIALIZACIÓN MOVIDA A initializeDOM) ---
let userIdDisplay, userIdContainer, authStatus, amountSendInput, currencySendSelect, currencyReceiveSelect, swapButton, amountReceiveDisplay, rateDisplay, paymentButton, errorMessage, historyContainer, loadingHistory, adminPanel, toggleAdminButton, rateFetchStatus, savedAccountsList, accountCount, wldUsdtDisplay, usdtClpP2pWldDisplay, clpUsdtP2pDisplay, vesUsdtP2pDisplay, usdtClpMarginDisplay, adminBankNameInput, adminAccountHolderInput, adminAccountNumberInput, adminRutInput, adminAccountTypeInput, adminEmailInput, saveAccountsButton, accountStatus, paymentModal, closeModalButton, modalAmountSend, modalAmountReceive, adminAccountDetailsContainer, noAccountsMessage, modalCryptoWarning, modalTransferCurrency, adminToggleContainer;

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

    // **CORRECCIÓN**: Evita que el botón de pago envíe el formulario por defecto.
    if (paymentButton) paymentButton.type = 'button';
}

// --- Funciones de Utilidad y Firebase ---

async function initializeFirebase() {
    try {
        if (!firebaseConfig) {
            authStatus.textContent = "Error: Configuración de Firebase no disponible.";
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

                // **MEJORA DE SEGURIDAD**: Mostrar panel de admin solo si el UID coincide
                if (ADMIN_UIDS.includes(userId)) {
                    adminToggleContainer.classList.remove('hidden');
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
         console.error("Error de autenticación:", error);
         authStatus.textContent = `Error de Autenticación: ${error.message}`;
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
 * **NUEVA FUNCIÓN**: Copia texto al portapapeles y muestra feedback.
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

// --- Lógica de Administración de Cuentas ---

async function saveAdminAccounts() {
    if (!isAuthReady || !db) {
        accountStatus.textContent = "Error: Conexión no lista.";
        return;
    }

    const bankName = adminBankNameInput.value;
    const accountHolder = adminAccountHolderInput.value.trim();
    const accountNumber = adminAccountNumberInput.value.trim();
    const rut = adminRutInput.value.trim();
    const accountType = adminAccountTypeInput.value;
    const email = adminEmailInput.value.trim();

    if (!bankName || !accountHolder || !accountNumber || !rut || !accountType) {
        accountStatus.textContent = "Error: Complete todos los campos requeridos (Banco, Titular, Número, RUT, Tipo).";
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
        adminAccountHolderInput.value = 'Ender Javier Piña Rojas';
        adminAccountNumberInput.value = '';
        adminRutInput.value = '26728535-7';
        adminAccountTypeInput.value = '';
        adminEmailInput.value = '';

        accountStatus.textContent = "¡Cuenta guardada correctamente!";
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
        console.error("Error: Conexión a Firebase no lista.");
        accountStatus.textContent = "Error: Conexión no lista.";
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
                <p class="text-gray-600">N° ${account.accountNumber} | RUT: ${account.rut}</p>
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

// --- Lógica de Tasas Dinámicas ---

async function fetchDynamicRates() {
    rateFetchStatus.textContent = 'Conectando con API de Vercel...';
    
    try {
        // Llama a tu Serverless Function de Vercel
        const response = await fetch('/api/rates'); 
        if (!response.ok) {
            throw new Error(`Respuesta de la API de Vercel no fue exitosa: ${response.status}`);
        }
        const data = await response.json();
        
        // Ajusta la lógica para usar la respuesta de tu API de Vercel
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
        console.warn("Fallo en la conexión con la API de Vercel. Usando tasas de referencia fijas.", error);
        wldUsdtDisplay.textContent = `WLD/USDT: ${liveRates.WLD_to_USDT.toFixed(4)} (Fijo)`;
        clpUsdtP2pDisplay.textContent = `USDT/CLP: 1 USDT = ${liveRates.USDT_to_CLP.toFixed(2)} CLP (Fijo)`;
        usdtClpP2pWldDisplay.textContent = `USDT/CLP: ${liveRates.USDT_to_CLP.toFixed(2)} CLP / USDT (Fijo)`;
        vesUsdtP2pDisplay.textContent = `USDT/VES: 1 USDT = ${liveRates.USDT_to_VES.toFixed(2)} VES (Fijo)`;
        rateFetchStatus.textContent = 'Fallo de conexión. Usando tasas de Referencia Fijas.';
    }

    calculateExchange();
}


// --- Lógica de Intercambio (Cálculo) ---

function calculateFullRatesInternal() {
    const fullRates = {};
    
    const wldToUsdt = liveRates.WLD_to_USDT;
    const usdtToClp = liveRates.USDT_to_CLP; 
    const usdtToVes = liveRates.USDT_to_VES;

    // --- 1. Lógica WLD/CLP (Descuento 14%) ---
    if (wldToUsdt !== null && usdtToClp !== null) {
        const baseWldToClp = wldToUsdt * usdtToClp;
        const finalWldToClp = baseWldToClp * (1 - DISCOUNT_RATE_WLD_CLP);
        fullRates['WLD_to_CLP'] = finalWldToClp;
        fullRates['CLP_to_WLD'] = 1 / finalWldToClp;
    } else {
        fullRates['WLD_to_CLP'] = null;
        fullRates['CLP_to_WLD'] = null;
    }

    // --- 2. Lógica CLP/VES (Descuento 8%) ---
    if (usdtToClp !== null && usdtToVes !== null) {
        // Lógica correcta para la tasa cruzada:
        // Para convertir CLP a VES, primero compramos USDT con CLP, luego vendemos esos USDT por VES.
        // Tasa de compra de USDT con CLP: usdtToClp (ej: 980 CLP por 1 USDT)
        // Tasa de venta de USDT por VES: usdtToVes (ej: 39 VES por 1 USDT)
        // La tasa base es (VES por USDT) / (CLP por USDT) = VES por CLP
        const baseClpToVesRate = usdtToVes / usdtToClp;
        const finalClpToVesRate = baseClpToVesRate * (1 - DISCOUNT_RATE_CLP_VES); // Aplicar descuento del 6%
        fullRates['CLP_to_VES'] = finalClpToVesRate;
        fullRates['VES_to_CLP'] = 1 / finalClpToVesRate;
    } else {
        fullRates['CLP_to_VES'] = null;
        fullRates['VES_to_CLP'] = null;
    }
    
    // --- 3. Lógica CLP/USDT y USDT/CLP (Margen 0.4%) ---
    if (usdtToClp !== null) {
        const finalUsdtToClp = usdtToClp * (1 + MARGIN_RATE_USDT_CLP);
        const finalClpToUsdt = 1 / finalUsdtToClp;
        fullRates['CLP_to_USDT'] = finalClpToUsdt;
        fullRates['USDT_to_CLP'] = finalUsdtToClp;
        if (usdtClpMarginDisplay) {
             usdtClpMarginDisplay.textContent = `1 USDT = ${finalUsdtToClp.toFixed(2)} CLP`;
        }
    } else {
        fullRates['CLP_to_USDT'] = null;
        fullRates['USDT_to_CLP'] = null;
    }
    
    // --- 4. Lógica USDT/VES y VES/USDT (Sin Margen Adicional) ---
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

function calculateExchange() {
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

    paymentButton.disabled = false;
    errorMessage.classList.add('hidden');

    if (rate === null || typeof rate === 'undefined') {
        amountReceiveDisplay.textContent = "N/A";
        rateDisplay.textContent = `Intercambio ${currencySend} a ${currencyReceive} no disponible.`;
        paymentButton.disabled = true;
        errorMessage.classList.remove('hidden');
        errorMessage.textContent = `Error: El intercambio de ${currencySend} a ${currencyReceive} no es una ruta de remesa válida.`;
        return;
    }

    const amountReceive = amountSend * rate;
    const rateFixed = rate.toFixed(currencyReceive === 'WLD' ? 8 : currencyReceive === 'CLP' ? 2 : 4);
    let rateText;
    
    if (currencySend === currencyReceive) {
        rateText = "Intercambio 1:1";
    } else if (currencySend === 'CLP' && currencyReceive === 'VES') {
        rateText = `Tasa de Intercambio CLP/VES (Desc. 6%): 1 CLP = ${rateFixed} VES`;
    } else if (currencySend === 'WLD' && currencyReceive === 'CLP') {
        rateText = `Tasa de Intercambio WLD/CLP (Desc. 14%): 1 WLD = ${rateFixed} CLP`;
    } else if (currencySend === 'USDT' && currencyReceive === 'CLP') {
        rateText = `Tasa de Intercambio USDT/CLP (Margen +0.4%): 1 USDT = ${rateFixed} CLP`;
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

// --- Lógica de Transacciones y Modal de Pago ---

async function recordTransaction(amountSend, currencySend, amountReceive, currencyReceive) {
    if (!isAuthReady || !db) {
        console.error("Error: Firebase o autenticación no lista para registrar.");
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
        console.log("Transacción registrada con éxito.");
    } catch (error) {
        console.error("Error al registrar transacción:", error);
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
        historyContainer.innerHTML = '<p class="text-gray-500 text-sm p-2">Aún no hay transacciones.</p>';
        return;
    }

    transactions.forEach(tx => {
        const date = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleDateString() : 'Cargando fecha...';
        const time = tx.timestamp?.toDate ? tx.timestamp.toDate().toLocaleTimeString() : '';

        const item = document.createElement('div');
        item.className = 'p-3 bg-gray-50 rounded-lg border border-gray-200 text-sm';
        item.innerHTML = `
            <p class="font-bold text-gray-800">${formatCurrency(tx.amountSend, tx.currencySend)} → ${formatCurrency(tx.amountReceive, tx.currencyReceive)}</p>
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
                // **MEJORA UX**: Se agrega un botón para copiar el número de cuenta
                accountDiv.innerHTML = `
                    <p class="font-bold text-cyan-700">${account.bankName} (${account.accountType})</p>
                    <p class="text-sm text-gray-700">Titular: ${account.accountHolder}</p>
                    <p class="text-sm text-gray-700">RUT: ${account.rut}</p>
                    <div class="flex justify-between items-center mt-1 relative">
                        <p class="text-sm text-gray-700">N° Cuenta: <span class="font-mono">${account.accountNumber}</span></p>
                        <button class="copy-btn p-1 rounded hover:bg-teal-100" data-copy="${account.accountNumber}">
                            <svg xmlns="http://www.w3.org/2000/svg" class="h-4 w-4 text-teal-600" fill="none" viewBox="0 0 24 24" stroke="currentColor"><path stroke-linecap="round" stroke-linejoin="round" stroke-width="2" d="M8 16H6a2 2 0 01-2-2V6a2 2 0 012-2h8a2 2 0 012 2v2m-6 12h8a2 2 0 002-2v-8a2 2 0 00-2-2h-8a2 2 0 00-2 2v8a2 2 0 002 2z" /></svg>
                            <span class="copy-feedback">¡Copiado!</span>
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
        adminAccountDetailsContainer.innerHTML = '<p class="text-center text-gray-600 p-4">La dirección de la Wallet será proporcionada por el administrador una vez que confirme su intención de enviar criptomonedas.</p>';
    } else {
        modalCryptoWarning.classList.remove('hidden');
        modalCryptoWarning.textContent = `Aviso: El método de transferencia para ${currencySend} debe ser coordinado con el administrador.`;
        adminAccountDetailsContainer.innerHTML = '';
    }
    
    const rates = calculateFullRatesInternal();
    const rate = rates[`${currencySend}_to_${currencyReceive}`] || 0;
    recordTransaction(amountSend, currencySend, amountSend * rate, currencyReceive);

    paymentModal.classList.remove('hidden');
}

// --- Inicialización y Listeners ---

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
        toggleAdminButton.textContent = adminPanel.classList.contains('hidden') ? 'Mostrar Panel de Administración' : 'Ocultar Panel de Administración';
    });
    
    saveAccountsButton.addEventListener('click', saveAdminAccounts);
    
    paymentButton.addEventListener('click', showPaymentModal);
    closeModalButton.addEventListener('click', () => {
        paymentModal.classList.add('hidden');
    });

    // **NUEVO LISTENER**: Delegación de eventos para los botones de copiado
    adminAccountDetailsContainer.addEventListener('click', function(event) {
        const button = event.target.closest('.copy-btn');
        if (button) {
            const textToCopy = button.dataset.copy;
            copyToClipboard(textToCopy, button);
        }
    });
};