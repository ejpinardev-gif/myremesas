"use client";

import type { Dispatch, SetStateAction } from "react";
import { ArrowRightLeft } from "lucide-react";
import { Card, CardContent, CardHeader, CardTitle, CardFooter } from "@/components/ui/card";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Select, SelectContent, SelectItem, SelectTrigger, SelectValue } from "@/components/ui/select";
import { Button } from "@/components/ui/button";
import { Alert, AlertDescription } from "@/components/ui/alert";
import { formatCurrency } from "@/lib/utils";
import type { Currency } from "@/lib/types";
import { Skeleton } from "./ui/skeleton";

type ExchangeCalculatorProps = {
  amountSend: string;
  setAmountSend: Dispatch<SetStateAction<string>>;
  currencySend: Currency;
  setCurrencySend: Dispatch<SetStateAction<Currency>>;
  currencyReceive: Currency;
  setCurrencyReceive: Dispatch<SetStateAction<Currency>>;
  amountReceive: number;
  currentRate: number | null | undefined;
  onSwap: () => void;
  onPay: () => void;
  isLoading: boolean;
};

const currencyOptions: { value: Currency, label: string }[] = [
    { value: "CLP", label: "CLP (Peso Chileno)" },
    { value: "VES", label: "VES (Bolívar Soberano)" },
    { value: "WLD", label: "WLD (Worldcoin)" },
    { value: "USDT", label: "USDT (Tether)" },
];

const ExchangeCalculator = (props: ExchangeCalculatorProps) => {
  const { amountSend, setAmountSend, currencySend, setCurrencySend, currencyReceive, setCurrencyReceive, amountReceive, currentRate, onSwap, onPay, isLoading } = props;

  const isExchangeInvalid = currentRate === null || typeof currentRate === 'undefined';
  
  return (
    <Card className="lg:col-span-2 shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Exchange Calculator</CardTitle>
      </CardHeader>
      <CardContent className="space-y-4">
        <div>
          <Label htmlFor="amount-send">Amount to Send</Label>
          <Input id="amount-send" type="number" value={amountSend} onChange={(e) => setAmountSend(e.target.value)} min="0" placeholder="e.g., 100000" className="text-lg p-3 h-auto" />
        </div>
        <div>
          <Label htmlFor="currency-send">From Currency</Label>
          <Select value={currencySend} onValueChange={(value) => setCurrencySend(value as Currency)}>
            <SelectTrigger id="currency-send" className="text-lg p-3 h-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {currencyOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="text-center py-2">
            <Button variant="ghost" size="icon" onClick={onSwap} className="rounded-full bg-muted hover:bg-accent hover:text-accent-foreground">
                <ArrowRightLeft className="h-5 w-5" />
            </Button>
        </div>
        <div>
          <Label htmlFor="currency-receive">To Currency</Label>
          <Select value={currencyReceive} onValueChange={(value) => setCurrencyReceive(value as Currency)}>
            <SelectTrigger id="currency-receive" className="text-lg p-3 h-auto"><SelectValue /></SelectTrigger>
            <SelectContent>
              {currencyOptions.map(opt => <SelectItem key={opt.value} value={opt.value}>{opt.label}</SelectItem>)}
            </SelectContent>
          </Select>
        </div>
        <div className="mt-6 p-4 bg-primary text-primary-foreground rounded-lg">
            <p className="text-sm font-medium opacity-90">You Will Receive Approximately:</p>
            {isLoading ? <Skeleton className="h-9 w-3/5 mt-1 bg-primary-foreground/20" /> : <p className="text-3xl font-bold mt-1">{formatCurrency(amountReceive, currencyReceive)}</p>}
            {isLoading ? <Skeleton className="h-4 w-2/5 mt-2 bg-primary-foreground/20" /> : (currentRate && <p className="text-xs mt-2 opacity-80">1 {currencySend} ≈ {currentRate.toFixed(6)} {currencyReceive}</p>)}
        </div>
        {isExchangeInvalid && !isLoading && (
            <Alert variant="destructive">
                <AlertDescription>
                    Error: The exchange from {currencySend} to {currencyReceive} is not a valid remittance path.
                </AlertDescription>
            </Alert>
        )}
      </CardContent>
      <CardFooter>
        <Button onClick={onPay} className="w-full py-3 h-auto text-lg" disabled={isExchangeInvalid || isLoading || parseFloat(amountSend) <= 0}>
            Pay and See Transfer Details
        </Button>
      </CardFooter>
    </Card>
  );
};

export default ExchangeCalculator;
