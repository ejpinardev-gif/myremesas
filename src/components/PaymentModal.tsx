"use client";

import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
  DialogClose,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { Currency, AdminAccount } from "@/lib/types";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy } from "lucide-react";
import { useToast } from "@/hooks/use-toast";

type PaymentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  amountSend: number;
  currencySend: Currency;
  amountReceive: number;
  currencyReceive: Currency;
  adminAccounts: AdminAccount[];
};

const AccountDetail = ({
  label,
  value,
}: {
  label: string;
  value: string | undefined;
}) => {
  const { toast } = useToast();

  if (!value) return null;

  const handleCopy = () => {
    if (navigator.clipboard) {
      navigator.clipboard.writeText(value);
      toast({ title: "Copied!", description: `${label} copied to clipboard.` });
    } else {
      toast({ variant: "destructive", title: "Copy Failed", description: "Clipboard not available." });
    }
  };

  return (
    <div className="flex justify-between items-center py-2 border-b border-dashed last:border-none">
      <span className="font-medium text-muted-foreground">{label}:</span>
      <div className="flex items-center gap-2">
        <span className="font-mono text-foreground break-all">{value}</span>
        <Button variant="ghost" size="icon" className="h-6 w-6" onClick={handleCopy}>
          <Copy className="h-3 w-3" />
        </Button>
      </div>
    </div>
  );
};

const PaymentModal = ({
  isOpen,
  onClose,
  amountSend,
  currencySend,
  amountReceive,
  currencyReceive,
  adminAccounts,
}: PaymentModalProps) => {
  return (
    <Dialog open={isOpen} onOpenChange={onClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">Transfer Details</DialogTitle>
        </DialogHeader>

        <div className="p-4 mb-4 bg-destructive/10 border-l-4 border-destructive rounded-lg">
          <p className="text-sm font-medium text-destructive">
            EXACT Amount to Transfer:
          </p>
          <p className="text-3xl font-extrabold text-destructive/90 mt-1">
            {formatCurrency(amountSend, currencySend)}
          </p>
          <p className="text-xs text-destructive/80 mt-2">
            You will receive approx:{" "}
            <span className="font-bold">
              {formatCurrency(amountReceive, currencyReceive)}
            </span>
          </p>
        </div>

        {currencySend === "CLP" ? (
          <div className="p-4 bg-muted/50 rounded-lg border">
            <h3 className="text-lg font-bold text-foreground mb-3">
              Available Accounts for Transfer (CLP)
            </h3>
            <ScrollArea className="h-[200px] pr-3">
              <div className="space-y-3">
                {adminAccounts.length > 0 ? (
                  adminAccounts.map((account) => (
                    <div
                      key={account.id}
                      className="p-3 my-2 border bg-background rounded-lg text-sm"
                    >
                      <p className="font-bold text-foreground mb-2">
                        {account.bankName} ({account.accountType})
                      </p>
                      <AccountDetail
                        label="Holder"
                        value={account.accountHolder}
                      />
                      <AccountDetail label="RUT" value={account.rut} />
                      <AccountDetail
                        label="Account"
                        value={account.accountNumber}
                      />
                      {account.email && (
                        <AccountDetail label="Email" value={account.email} />
                      )}
                    </div>
                  ))
                ) : (
                  <p className="text-muted-foreground text-sm">
                    The administrator has not configured CLP accounts.
                  </p>
                )}
              </div>
            </ScrollArea>
          </div>
        ) : (
          <Alert variant="destructive">
            <AlertTitle>Crypto Transfer</AlertTitle>
            <AlertDescription>
              You are sending a cryptocurrency. Please contact the administrator
              to get the correct wallet address before sending funds.
            </AlertDescription>
          </Alert>
        )}

        <p className="text-xs text-muted-foreground mt-4 text-center">
          Once the transfer is complete, send the receipt to the administrator
          via WhatsApp/Email.
        </p>

        <DialogFooter className="mt-4">
          <DialogClose asChild>
            <Button type="button" className="w-full">
              Understood / Close
            </Button>
          </DialogClose>
        </DialogFooter>
      </DialogContent>
    </Dialog>
  );
};

export default PaymentModal;
