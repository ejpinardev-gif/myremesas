"use client";

import { useState, useEffect, useMemo } from "react";
import type { User } from "firebase/auth";
import { onAuthStateChanged, signInAnonymously } from "firebase/auth";
import { collection, query, onSnapshot, addDoc, serverTimestamp, deleteDoc, doc } from "firebase/firestore";

import { auth, db } from "@/lib/firebase";
import type { Currency, ExchangeRates, CalculatedRates, Transaction, AdminAccount, TransactionData, AdminAccountData } from "@/lib/types";
import { getDynamicRates } from "@/app/actions";
import { calculateFullRates } from "@/lib/rate-calculator";

import { useToast } from "@/hooks/use-toast";

import Header from "@/components/Header";
import AdminPanel from "@/components/AdminPanel";
import ExchangeCalculator from "@/components/ExchangeCalculator";
import TransactionHistory from "@/components/TransactionHistory";
import PaymentModal from "@/components/PaymentModal";
import { Skeleton } from "@/components/ui/skeleton";

export default function Home() {
  const { toast } = useToast();

  // AUTH STATE
  const [user, setUser] = useState<User | null>(null);
  const [authStatus, setAuthStatus] = useState("Initializing...");
  const [isAuthReady, setIsAuthReady] = useState(false);
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
  
  // DERIVED STATE
  const { rates: calculatedRates, derived } = useMemo(() => calculateFullRates(liveRates), [liveRates]);
  
  const rateKey = `${currencySend}_to_${currencyReceive}`;
  const currentRate = calculatedRates[rateKey];
  const amountReceive = useMemo(() => {
      const amount = parseFloat(amountSend);
      if (isNaN(amount) || amount <= 0 || !currentRate) {
          return 0;
      }
      return amount * currentRate;
  }, [amountSend, currentRate]);

  // --- EFFECTS ---

  // Auth Effect
  useEffect(() => {
    const unsubscribe = onAuthStateChanged(auth, (currentUser) => {
      if (currentUser) {
        setUser(currentUser);
        setAuthStatus("Authenticated. Ready to use.");
        setIsAuthReady(true);
      } else {
        setUser(null);
        setIsAuthReady(false);
        setAuthStatus("Authenticating...");
        signInAnonymously(auth).catch(err => {
          console.error("Anonymous sign-in failed:", err);
          setAuthStatus(`Authentication Error: ${err.message}`);
          toast({ variant: "destructive", title: "Authentication Error", description: "Could not sign in anonymously." });
        });
      }
    });
    return () => unsubscribe();
  }, [toast]);

  // Fetch Dynamic Rates Effect
  useEffect(() => {
    const fetchRates = async () => {
      setIsLoading(prev => ({ ...prev, rates: true }));
      const systemPrompt = "Act as a P2P market data provider. Generate accurate quotes for Worldcoin, CLP, and VES against USDT. Provide realistic values for the Chilean and Venezuelan markets.";
      const userQuery = `I need 4 rates: 1. WLD/USDT (Worldcoin to Tether). Central value 1.19. 2. USDT/CLP P2P (Tether to Chilean Peso P2P, buy rate). Central value 963. 3. CLP/USDT P2P (Chilean Peso to Tether, 3rd Sell Offer, 1 USDT to how many CLP). Central value 963. 4. VES/USDT P2P (Bolivar to Tether, market rate). Central value 36.`;
      
      const ratesData = await getDynamicRates({ systemPrompt, query: userQuery });
      if (ratesData) {
        setLiveRates(ratesData);
      } else {
        toast({ variant: "destructive", title: "Rate Fetch Error", description: "Could not fetch live exchange rates. Using fallback values." });
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
    if (!isAuthReady || !user) return;
    setIsLoading(prev => ({ ...prev, history: true }));
    const collectionPath = `artifacts/${appId}/users/${user.uid}/transactions`;
    const q = query(collection(db, collectionPath));

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
      console.error("Error listening to transaction history:", error);
      toast({ variant: "destructive", title: "History Error", description: "Could not load transaction history." });
      setIsLoading(prev => ({ ...prev, history: false }));
    });
    return () => unsubscribe();
  }, [isAuthReady, user, appId, toast]);

  // Admin Accounts Listener
  useEffect(() => {
    if (!db) return;
    setIsLoading(prev => ({...prev, accounts: true}));
    const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
    const q = query(collection(db, collectionPath));
    const unsubscribe = onSnapshot(q, (snapshot) => {
        const accounts: AdminAccount[] = [];
        snapshot.forEach((doc) => {
            accounts.push({ id: doc.id, ...doc.data() } as AdminAccount);
        });
        setAdminAccounts(accounts.sort((a, b) => a.bankName.localeCompare(b.bankName)));
        setIsLoading(prev => ({...prev, accounts: false}));
    }, (error) => {
        console.error("Error fetching admin accounts:", error);
        toast({ variant: "destructive", title: "Account Fetch Error", description: "Could not load admin accounts." });
        setIsLoading(prev => ({...prev, accounts: false}));
    });
    return () => unsubscribe();
  }, [appId, toast]);
  
  // --- HANDLERS ---
  const handleSwap = () => {
    setCurrencySend(currencyReceive);
    setCurrencyReceive(currencySend);
  };

  const handleOpenPaymentModal = async () => {
    if (!isAuthReady || !user || !currentRate || parseFloat(amountSend) <= 0) {
      toast({ variant: "destructive", title: "Invalid Operation", description: "Please enter a valid amount and ensure rates are loaded." });
      return;
    }

    const transactionData: Omit<TransactionData, 'timestamp' | 'rate'> & { rate: number } = {
      fromCurrency: currencySend,
      toCurrency: currencyReceive,
      amountSend: parseFloat(amountSend),
      amountReceive: amountReceive,
      rate: currentRate,
    };

    try {
      const collectionPath = `artifacts/${appId}/users/${user.uid}/transactions`;
      await addDoc(collection(db, collectionPath), {
        ...transactionData,
        timestamp: serverTimestamp()
      });
      setIsModalOpen(true);
    } catch (e) {
      console.error("Error logging transaction:", e);
      toast({ variant: "destructive", title: "Transaction Error", description: "Could not save the transaction." });
    }
  };

  const handleSaveAccount = async (accountData: Omit<AdminAccountData, 'updatedBy' | 'timestamp'>) => {
    if (!user) {
        toast({ variant: "destructive", title: "Authentication Error", description: "You must be signed in to save an account." });
        return false;
    }
    try {
        const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
        await addDoc(collection(db, collectionPath), {
            ...accountData,
            updatedBy: user.uid,
            timestamp: serverTimestamp()
        });
        toast({ title: "Success", description: "Account saved successfully." });
        return true;
    } catch (error) {
        console.error("Error saving account:", error);
        if (error instanceof Error) {
          toast({ variant: "destructive", title: "Save Error", description: error.message });
        } else {
          toast({ variant: "destructive", title: "Save Error", description: "Could not save the account." });
        }
        return false;
    }
  };

  const handleDeleteAccount = async (id: string) => {
    if (!window.confirm(`Are you sure you want to delete this account?`)) return;
    try {
        const collectionPath = `artifacts/${appId}/public/data/admin_accounts`;
        await deleteDoc(doc(db, collectionPath, id));
        toast({ title: "Success", description: "Account deleted." });
    } catch (error) {
        console.error("Error deleting account:", error);
        if (error instanceof Error) {
          toast({ variant: "destructive", title: "Delete Error", description: error.message });
        } else {
          toast({ variant: "destructive", title: "Delete Error", description: "Could not delete the account." });
        }
    }
  };
  
  const isPageLoading = !isAuthReady || (isLoading.rates && liveRates === null);

  return (
    <>
      <div className="min-h-screen p-4 md:p-8">
        <div className="max-w-4xl mx-auto">
          <Header userId={user?.uid} authStatus={authStatus} />
          
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
      <PaymentModal
        isOpen={isModalOpen}
        onClose={() => setIsModalOpen(false)}
        amountSend={parseFloat(amountSend)}
        currencySend={currencySend}
        amountReceive={amountReceive}
        currencyReceive={currencyReceive}
        adminAccounts={adminAccounts}
      />
    </>
  );
}
