
"use client";

import { useState, useEffect, useMemo } from "react";
import type { User } from "firebase/auth";
import {
  useAuth,
  useFirestore,
  useUser,
} from "@/firebase";
import { collection, query, onSnapshot, serverTimestamp, doc, addDoc, deleteDoc, updateDoc } from "firebase/firestore";
import { errorEmitter } from '@/firebase/error-emitter';
import { FirestorePermissionError } from '@/firebase/errors';

import type { Currency, ExchangeRates, CalculatedRates, Transaction, AdminAccount, TransactionData, AdminAccountData, RecipientData } from "@/lib/types";
import { getDynamicRates } from "@/app/actions";
import { calculateFullRates } from "@/lib/rate-calculator";

import { useToast } from "@/hooks/use-toast";

import Header from "@/components/Header";
import AdminPanel from "@/components/AdminPanel";
import ExchangeCalculator from "@/components/ExchangeCalculator";
import TransactionHistory from "@/components/TransactionHistory";
import PaymentModal from "@/components/PaymentModal";
import { Skeleton } from "@/components/ui/skeleton";
import { initiateAnonymousSignIn } from "@/firebase/non-blocking-login";

export default function Home() {
  const { toast } = useToast();
  const auth = useAuth();
  const firestore = useFirestore();
  const { user, isUserLoading } = useUser();

  const [authStatus, setAuthStatus] = useState("Inicializando...");
  const appId = process.env.NEXT_PUBLIC_FIREBASE_APP_ID || 'default-remesa-app';

  // DATA STATE
  const [liveRates, setLiveRates] = useState<ExchangeRates | null>(null);
  const [transactions, setTransactions] = useState<Transaction[]>([]);
  const [adminAccounts, setAdminAccounts] = useState<AdminAccount[]>([]);
  const [isLoading, setIsLoading] = useState({ rates: true, history: true, accounts: true });

  // UI STATE
  const [amountSend, setAmountSend] = useState<string>("10000");
  const [currencySend, setCurrencySend] = useState<Currency>("CLP");
  const [currencyReceive, setCurrencyReceive] = useState<Currency>("VES");
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [currentTransaction, setCurrentTransaction] = useState<Transaction | null>(null);
  
  // DERIVED STATE
  const { rates: calculatedRates, derived } = useMemo(() => calculateFullRates(liveRates), [liveRates]);
  
  const rateKey = `${currencySend}_to_${currencyReceive}`;
  const currentRate = calculatedRates[rateKey];
  const amountReceive = useMemo(() => {
      const amount = parseFloat(amountSend);
      if (isNaN(amount) || amount <= 0 || !currentRate) {
          return 0;
      }
      const calculatedAmount = amount * currentRate;
      return Math.ceil(calculatedAmount * 100) / 100;
  }, [amountSend, currentRate]);

  // --- EFFECTS ---

  // Auth Effect
  useEffect(() => {
    if (!isUserLoading) {
      if (user) {
        setAuthStatus("Autenticado. Listo para usar.");
      } else {
        setAuthStatus("Autenticando...");
        initiateAnonymousSignIn(auth);
      }
    }
  }, [user, isUserLoading, auth]);

  // Fetch Dynamic Rates Effect
  useEffect(() => {
    const fetchRates = async () => {
      setIsLoading(prev => ({ ...prev, rates: true }));
      const systemPrompt = "Actúa como un proveedor de datos del mercado P2P. Genera cotizaciones precisas para Worldcoin, CLP y VES frente a USDT. Proporciona valores realistas para los mercados de Chile y Venezuela.";
      const userQuery = `Necesito 4 tasas: 1. WLD/USDT (Worldcoin a Tether). Valor central 1.19. 2. USDT/CLP P2P (Tether a Peso Chileno P2P, tasa de compra). Valor central 963. 3. CLP/USDT P2P (Peso Chileno a Tether, 3ra Oferta de Venta, 1 USDT a cuántos CLP). Valor central 963. 4. VES/USDT P2P (Bolívar a Tether, tasa de mercado). Valor central 36.`;
      
      const ratesData = await getDynamicRates({ systemPrompt, query: userQuery });
      if (ratesData) {
        setLiveRates(ratesData);
      } else {
        toast({ variant: "destructive", title: "Error al Obtener Tasas", description: "No se pudieron obtener las tasas de cambio en vivo. Usando valores de respaldo." });
        setLiveRates({ WLD_to_USDT: 1.19, USDT_to_CLP_P2P_WLD: 963, CLP_to_USDT_P2P: 963, VES_to_USDT_P2P: 36 });
      }
      setIsLoading(prev => ({ ...prev, rates: false }));
    };

    fetchRates();
    const intervalId = setInterval(fetchRates, 5 * 60 * 1000); // Fetch every 5 minutes
    return () => clearInterval(intervalId);
  }, [toast]);

  // Transaction History Listener
  useEffect(() => {
    if (!user || !firestore) return;
    setIsLoading(prev => ({ ...prev, history: true }));
    const collectionPath = `artifacts/${appId}/users/${user.uid}/transactions`;
    const q = query(collection(firestore, collectionPath));

    const unsubscribe = onSnapshot(q, (snapshot) => {
      const history: Transaction[] = [];
      snapshot.forEach((doc) => {
        const data = doc.data() as TransactionData;
        history.push({
          id: doc.id,
          ...data,
          timestamp: data.timestamp ? data.timestamp.toDate() : new Date(),
        });
      });
      setTransactions(history.sort((a, b) => b.timestamp.getTime() - a.timestamp.getTime()));
      setIsLoading(prev => ({ ...prev, history: false }));
    }, (error) => {
      const permissionError = new FirestorePermissionError({
        path: q.toString(),
        operation: 'list',
      });
      errorEmitter.emit('permission-error', permissionError);
      setIsLoading(prev => ({ ...prev, history: false }));
    });
    return () => unsubscribe();
  }, [user, appId, firestore]);

  // Admin Accounts Listener
  useEffect(() => {
    if (!firestore) return;
    setIsLoading(prev => ({...prev, accounts: true}));
    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
    const q = query(collection(firestore, collectionPath));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const accounts: AdminAccount[] = [];
        snapshot.forEach((doc) => {
            accounts.push({ id: doc.id, ...doc.data() } as AdminAccount);
        });
        setAdminAccounts(accounts.sort((a, b) => a.bankName.localeCompare(b.bankName)));
        setIsLoading(prev => ({...prev, accounts: false}));
    }, (error) => {
        const permissionError = new FirestorePermissionError({
            path: q.toString(),
            operation: 'list',
        });
        errorEmitter.emit('permission-error', permissionError);
        setIsLoading(prev => ({...prev, accounts: false}));
    });
    return () => unsubscribe();
  }, [appId, firestore]);
  
  // --- HANDLERS ---
  const handleSwap = () => {
    setCurrencySend(currencyReceive);
    setCurrencyReceive(currencySend);
  };

  const handleOpenPaymentModal = () => {
    if (!user || !currentRate || parseFloat(amountSend) <= 0) {
      toast({ variant: "destructive", title: "Operación Inválida", description: "Por favor, ingrese un monto válido y asegúrese de que las tasas estén cargadas." });
      return;
    }

    const newTransaction: Omit<Transaction, 'id' | 'timestamp'> = {
      fromCurrency: currencySend,
      toCurrency: currencyReceive,
      amountSend: parseFloat(amountSend),
      amountReceive: amountReceive,
      rate: currentRate,
      status: 'pending',
    };
    
    // We set a temporary transaction object to pass to the modal
    // The actual DB write happens inside the modal flow
    setCurrentTransaction({
      ...newTransaction,
      id: `temp-${Date.now()}`,
      timestamp: new Date()
    });
    setIsModalOpen(true);
  };

  const handleCloseModal = () => {
    setIsModalOpen(false);
    setCurrentTransaction(null);
  };

  const handleSaveTransaction = async (recipientData?: RecipientData, receiptUrl?: string): Promise<string | null> => {
    if (!user || !firestore || !currentTransaction) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo guardar la transacción." });
      return null;
    }
  
    const transactionData = {
      ...currentTransaction,
      id: undefined, // Firestore will generate it
      timestamp: serverTimestamp(),
      status: 'pending',
      recipient: recipientData || null,
      userReceiptUrl: receiptUrl || null,
    };
    
    delete (transactionData as any).id;
  
    const collectionPath = `artifacts/${appId}/users/${user.uid}/transactions`;
    const collectionRef = collection(firestore, collectionPath);
  
    try {
      const docRef = await addDoc(collectionRef, transactionData);
      toast({ title: "Éxito", description: "Transacción iniciada. Sube tu comprobante." });
      return docRef.id;
    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: collectionPath,
        operation: 'create',
        requestResourceData: transactionData,
      });
      errorEmitter.emit('permission-error', permissionError);
      return null;
    }
  };

  const handleUpdateTransaction = async (transactionId: string, dataToUpdate: Partial<TransactionData>): Promise<boolean> => {
    if (!user || !firestore) {
      toast({ variant: "destructive", title: "Error de Autenticación", description: "No se pudo actualizar la transacción." });
      return false;
    }
    const collectionPath = `artifacts/${appId}/users/${user.uid}/transactions`;
    const docRef = doc(firestore, collectionPath, transactionId);

    try {
      await updateDoc(docRef, dataToUpdate);
      toast({ title: "Éxito", description: "Tu transacción ha sido actualizada." });
      return true;
    } catch (serverError) {
      const permissionError = new FirestorePermissionError({
        path: docRef.path,
        operation: 'update',
        requestResourceData: dataToUpdate,
      });
      errorEmitter.emit('permission-error', permissionError);
      return false;
    }
  };


  const handleSaveAccount = (accountData: Omit<AdminAccountData, 'updatedBy' | 'timestamp'>) => {
    if (!user || !firestore) {
        toast({ variant: "destructive", title: "Error de Autenticación", description: "Debes iniciar sesión para guardar una cuenta." });
        return Promise.resolve(false);
    }
    
    const dataToSave = {
        ...accountData,
        updatedBy: user.uid,
        timestamp: serverTimestamp()
    };
    
    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
    const collectionRef = collection(firestore, collectionPath);

    return addDoc(collectionRef, dataToSave)
        .then(() => {
            toast({ title: "Éxito", description: "Cuenta guardada exitosamente." });
            return true;
        })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: collectionPath,
                operation: 'create',
                requestResourceData: dataToSave,
            });
            errorEmitter.emit('permission-error', permissionError);
            return false;
        });
  };

  const handleDeleteAccount = (id: string) => {
    if (!firestore) return;
    if (!window.confirm(`¿Estás seguro de que quieres eliminar esta cuenta?`)) return;

    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
    const docRef = doc(firestore, collectionPath, id);

    deleteDoc(docRef)
        .then(() => {
            toast({ title: "Éxito", description: "Cuenta eliminada." });
        })
        .catch((serverError) => {
            const permissionError = new FirestorePermissionError({
                path: docRef.path,
                operation: 'delete',
            });
            errorEmitter.emit('permission-error', permissionError);
        });
  };
  
  const isPageLoading = isUserLoading || (isLoading.rates && liveRates === null);

  return (
    <>
      <div className="min-h-screen bg-gray-50 p-4 md:p-8 font-sans" style={{ backgroundColor: 'var(--background-color)', color: 'var(--text-color)' }}>
        <div className="max-w-4xl mx-auto">
          <Header 
            rates={calculatedRates}
            isLoading={isLoading.rates}
          />
          
          { isPageLoading ? (
             <div className="space-y-8">
                <Skeleton className="h-10 w-full" />
                <div className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                    <Skeleton className="lg:col-span-2 h-[500px]" />
                    <Skeleton className="lg:col-span-1 h-[500px]" />
                </div>
            </div>
          ) : (
            <>
              <AdminPanel
                liveRates={liveRates}
                derivedRates={derived}
                savedAccounts={adminAccounts}
                onSaveAccount={handleSaveAccount}
                onDeleteAccount={handleDeleteAccount}
                isLoading={isLoading.rates || isLoading.accounts}
              />

              <main className="grid grid-cols-1 lg:grid-cols-3 gap-8">
                <ExchangeCalculator
                  amountSend={amountSend}
                  setAmountSend={setAmountSend}
                  currencySend={currencySend}
                  setCurrencySend={setCurrencySend}
                  currencyReceive={currencyReceive}
                  setCurrencyReceive={setCurrencyReceive}
                  amountReceive={amountReceive}
                  currentRate={currentRate}
                  onSwap={handleSwap}
                  onPay={handleOpenPaymentModal}
                  isLoading={isLoading.rates}
                />
                <TransactionHistory transactions={transactions} isLoading={isLoading.history} />
              </main>
            </>
          )}
        </div>
      </div>
      {currentTransaction && (
        <PaymentModal
          isOpen={isModalOpen}
          onClose={handleCloseModal}
          transaction={currentTransaction}
          adminAccounts={adminAccounts}
          onSaveTransaction={handleSaveTransaction}
          onUpdateTransaction={handleUpdateTransaction}
        />
      )}
    </>
  );
}

    