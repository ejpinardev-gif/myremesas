
"use client";

import { useState, useEffect } from "react";
import {
  Dialog,
  DialogContent,
  DialogHeader,
  DialogTitle,
  DialogFooter,
} from "@/components/ui/dialog";
import { Button } from "@/components/ui/button";
import { formatCurrency } from "@/lib/utils";
import type { AdminAccount, RecipientData, Transaction, TransactionData } from "@/lib/types";
import { Alert, AlertTitle, AlertDescription } from "@/components/ui/alert";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Copy, CheckCircle2 } from "lucide-react";
import { useToast } from "@/hooks/use-toast";
import RecipientForm from "./RecipientForm";
import { Input } from "./ui/input";
import { Label } from "./ui/label";

type PaymentModalProps = {
  isOpen: boolean;
  onClose: () => void;
  transaction: Transaction;
  adminAccounts: AdminAccount[];
  onSaveTransaction: (recipientData: RecipientData) => Promise<string | null>;
  onUpdateTransaction: (transactionId: string, dataToUpdate: Partial<TransactionData>) => Promise<boolean>;
  uploadFile: (file: File, path: string) => Promise<string>;
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
      toast({ title: "¡Copiado!", description: `${label} copiado al portapapeles.` });
    } else {
      toast({ variant: "destructive", title: "Copia Fallida", description: "El portapapeles no está disponible." });
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
  transaction,
  adminAccounts,
  onSaveTransaction,
  onUpdateTransaction,
  uploadFile,
}: PaymentModalProps) => {
  
  const { fromCurrency, toCurrency, amountSend, amountReceive } = transaction;

  const requiresRecipientInfo = toCurrency === "VES";
  const [step, setStep] = useState(1); // 1: Recipient (if VES), 2: Payment, 3: Confirmation
  const [isSubmitting, setIsSubmitting] = useState(false);
  const [newTransactionId, setNewTransactionId] = useState<string | null>(null);
  const [receiptFile, setReceiptFile] = useState<File | null>(null);
  const { toast } = useToast();

  useEffect(() => {
    if (isOpen) {
      // If currency is not VES, we skip recipient step
      setStep(requiresRecipientInfo ? 1 : 2);
      setNewTransactionId(null);
      setReceiptFile(null);
    }
  }, [isOpen, requiresRecipientInfo, transaction.id]);

  const handleRecipientFormSubmit = async (data: RecipientData) => {
    setIsSubmitting(true);
    const createdTxId = await onSaveTransaction(data);
    setIsSubmitting(false);
    if (createdTxId) {
      setNewTransactionId(createdTxId);
      setStep(2); // Move to payment instructions
      return true;
    }
    toast({ variant: "destructive", title: "Error", description: "No se pudieron guardar los datos del destinatario." });
    return false;
  };
  
  const handlePaymentConfirmation = async () => {
    if (!receiptFile) {
        toast({
            variant: 'destructive',
            title: 'Comprobante Requerido',
            description: 'Por favor, sube el comprobante de pago para continuar.',
        });
        return;
    }

    setIsSubmitting(true);
    
    // Determine the transaction ID we're working with
    let txId = newTransactionId;

    // This case handles non-VES transactions where the tx isn't saved until this step
    if (!txId) {
      const createdTxId = await onSaveTransaction({} as RecipientData); // Pass empty object as recipient is not needed
      if(createdTxId) {
        txId = createdTxId;
      } else {
        toast({ variant: "destructive", title: "Error", description: "No se pudo iniciar la transacción." });
        setIsSubmitting(false);
        return;
      }
    }

    const filePath = `receipts/${txId}/${receiptFile.name}`;
    try {
      const url = await uploadFile(receiptFile, filePath);
      await onUpdateTransaction(txId, { status: 'processing', userReceiptUrl: url });
      setStep(3);
    } catch(e) {
      toast({ variant: "destructive", title: "Error", description: "No se pudo subir el comprobante o actualizar la transacción." });
    } finally {
      setIsSubmitting(false);
    }
  };
  
  const handleClose = () => {
    setStep(requiresRecipientInfo ? 1 : 2);
    setNewTransactionId(null);
    setReceiptFile(null);
    onClose();
  };

  const renderPaymentInstructions = () => {
    if (fromCurrency === "CLP") {
      return (
        <div className="p-4 bg-muted/50 rounded-lg border">
          <h3 className="text-lg font-bold text-foreground mb-3">
            Cuentas Disponibles para Transferencia (CLP)
          </h3>
          <ScrollArea className="h-[200px] pr-3">
            <div className="space-y-3">
              {adminAccounts.length > 0 ? (
                adminAccounts.map((account) => (
                  <div key={account.id} className="p-3 my-2 border bg-background rounded-lg text-sm">
                    <p className="font-bold text-foreground mb-2">{account.bankName} ({account.accountType})</p>
                    <AccountDetail label="Titular" value={account.accountHolder} />
                    <AccountDetail label="RUT" value={account.rut} />
                    <AccountDetail label="Cuenta" value={account.accountNumber} />
                    {account.email && (<AccountDetail label="Email" value={account.email} />)}
                  </div>
                ))
              ) : (
                <p className="text-muted-foreground text-sm">El administrador no ha configurado cuentas CLP.</p>
              )}
            </div>
          </ScrollArea>
        </div>
      );
    } else if (fromCurrency === 'WLD') {
      return (
         <Alert variant="default" className="bg-blue-50 border-blue-200">
            <AlertTitle className="text-blue-800">Instrucciones para WLD</AlertTitle>
            <AlertDescription className="text-blue-700">
                Para confirmar su pago, por favor envíe sus monedas a través de la App de Worldcoin al usuario: <strong className="font-mono">@ejpinar</strong>
            </AlertDescription>
          </Alert>
      )
    } else {
      return (
        <Alert variant="destructive">
          <AlertTitle>Transferencia Crypto</AlertTitle>
          <AlertDescription>
            Estás enviando una criptomoneda. Por favor, contacta al administrador para obtener la dirección de la billetera correcta antes de enviar fondos.
          </AlertDescription>
        </Alert>
      );
    }
  };

  const getTitle = () => {
    if (step === 1) return `Datos del Destinatario (${toCurrency})`;
    if (step === 2) return "Realiza tu Pago";
    if (step === 3) return "Transacción en Proceso";
    return "Detalles de la Transacción";
  }

  return (
    <Dialog open={isOpen} onOpenChange={handleClose}>
      <DialogContent className="sm:max-w-md">
        <DialogHeader>
          <DialogTitle className="text-2xl">{getTitle()}</DialogTitle>
        </DialogHeader>

        {step === 1 && requiresRecipientInfo && (
          <RecipientForm onSubmit={handleRecipientFormSubmit} onBack={handleClose} />
        )}
        
        {step === 2 && (
          <>
            <div className="p-4 mb-4 bg-destructive/10 border-l-4 border-destructive rounded-lg">
              <p className="text-sm font-medium text-destructive">Monto EXACTO a Transferir:</p>
              <p className="text-3xl font-extrabold text-destructive/90 mt-1">{formatCurrency(amountSend, fromCurrency)}</p>
              <p className="text-xs text-destructive/80 mt-2">Recibirás aprox: <span className="font-bold">{formatCurrency(amountReceive, toCurrency)}</span></p>
            </div>
            
            {renderPaymentInstructions()}

            <div className="space-y-2 mt-4">
              <Label htmlFor="receipt">Sube tu Comprobante</Label>
              <Input id="receipt" type="file" className="text-xs" onChange={(e) => setReceiptFile(e.target.files?.[0] || null)} />
              <p className="text-xs text-muted-foreground">El comprobante es obligatorio para avanzar.</p>
            </div>

            <DialogFooter className="mt-6">
              <Button onClick={handlePaymentConfirmation} className="w-full" disabled={isSubmitting || !receiptFile}>
                {isSubmitting ? "Procesando..." : "He Realizado el Pago"}
              </Button>
            </DialogFooter>
          </>
        )}

        {step === 3 && (
            <div className="flex flex-col items-center justify-center text-center p-6">
                <CheckCircle2 className="h-16 w-16 text-green-500 mb-4" />
                <h3 className="text-xl font-bold text-foreground">¡Excelente!</h3>
                <p className="text-muted-foreground mt-2">
                    Hemos recibido la confirmación de tu pago. Tu orden está ahora en estado <span className="font-semibold text-primary">Procesando</span>.
                    El administrador verificará tu pago y procesará la transferencia a la brevedad. Puedes seguir el estado en el historial.
                </p>
                <DialogFooter className="mt-6 w-full">
                    <Button onClick={handleClose} className="w-full">Entendido, Cerrar</Button>
                </DialogFooter>
            </div>
        )}

      </DialogContent>
    </Dialog>
  );
};

export default PaymentModal;
