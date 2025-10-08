
"use client";

import { Card, CardHeader, CardTitle, CardContent } from "@/components/ui/card";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Skeleton } from "@/components/ui/skeleton";
import { Separator } from "@/components/ui/separator";
import { formatCurrency } from "@/lib/utils";
import type { Transaction } from "@/lib/types";

type TransactionHistoryProps = {
  transactions: Transaction[];
  isLoading: boolean;
};

const TransactionHistory = ({ transactions, isLoading }: TransactionHistoryProps) => {
  return (
    <Card className="lg:col-span-1 shadow-lg">
      <CardHeader>
        <CardTitle className="text-2xl">Historial de Transacciones</CardTitle>
      </CardHeader>
      <CardContent>
        <ScrollArea className="h-96 pr-4">
          <div className="space-y-4">
            {isLoading ? (
              Array.from({ length: 5 }).map((_, i) => (
                <div key={i} className="space-y-2 py-2">
                    <div className="flex justify-between">
                        <Skeleton className="h-5 w-2/5" />
                        <Skeleton className="h-4 w-1/4" />
                    </div>
                     <div className="flex justify-between">
                        <Skeleton className="h-4 w-1/2" />
                        <Skeleton className="h-4 w-1/3" />
                    </div>
                </div>
              ))
            ) : transactions.length === 0 ? (
              <p className="text-muted-foreground text-sm pt-4">Aún no se han registrado transacciones.</p>
            ) : (
              transactions.map((t, index) => (
                <div key={t.id}>
                  <div className="flex justify-between items-start text-sm">
                    <span className="font-bold text-foreground">{formatCurrency(t.amountSend, t.fromCurrency)}</span>
                    <span className="text-xs text-muted-foreground">{t.timestamp.toLocaleDateString('es-ES', { day: 'numeric', month: 'short', hour: '2-digit', minute: '2-digit' })}</span>
                  </div>
                  <div className="flex justify-between items-center text-xs mt-1">
                    <span className="text-cyan-600 font-semibold">→ {formatCurrency(t.amountReceive, t.toCurrency)}</span>
                    <span className="text-muted-foreground">Tasa: {t.rate.toFixed(6)}</span>
                  </div>
                  {index < transactions.length - 1 && <Separator className="mt-4"/>}
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </CardContent>
    </Card>
  );
};

export default TransactionHistory;

    