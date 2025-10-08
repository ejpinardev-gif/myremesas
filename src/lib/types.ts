import type { Timestamp } from 'firebase/firestore';

export type Currency = 'CLP' | 'VES' | 'WLD' | 'USDT';

export interface ExchangeRates {
  WLD_to_USDT: number;
  USDT_to_CLP_P2P_WLD: number;
  CLP_to_USDT_P2P: number;
  VES_to_USDT_P2P: number;
}

export interface CalculatedRates {
  [key: string]: number | null;
}

export interface Transaction {
  id: string;
  fromCurrency: Currency;
  toCurrency: Currency;
  amountSend: number;
  amountReceive: number;
  rate: number;
  timestamp: Date;
}

export interface TransactionData {
  fromCurrency: Currency;
  toCurrency: Currency;
  amountSend: number;
  amountReceive: number;
  rate: Timestamp;
  timestamp: Timestamp;
}

export interface AdminAccount {
  id: string;
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  rut: string;
  accountType: string;
  email?: string;
}

export interface AdminAccountData {
  bankName: string;
  accountHolder: string;
  accountNumber: string;
  rut: string;
  accountType: string;
  email?: string;
  updatedBy: string;
  timestamp: Timestamp;
}
