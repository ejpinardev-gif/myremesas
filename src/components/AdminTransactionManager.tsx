
"use client";
import { useState } from "react";
import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Button } from "@/components/ui/button";
import { Separator } from "@/components/ui/separator";
import { Badge } from "@/components/ui/badge";
import { Input } from "@/components/ui/input";
import { Label } from "@/components/ui/label";
import { Skeleton } from "@/components/ui/skeleton";
import { Alert, AlertDescription, AlertTitle } from "@/components/ui/alert";
import { formatCurrency, cn } from "@/lib/utils";
import type { FullTransaction, TransactionData, TransactionStatus } from "@/lib/types";
import { useToast } from "@/hooks/use-toast";
import { Check, Circle, Copy, Upload, X } from "lucide-react";

type AdminTransactionManagerProps = {
  transactions: FullTransaction[];
  isLoading: boolean;
  onUpdateTransaction: (
    userId: string,
    transactionId: string,
    data: Partial<TransactionData>
  ) => Promise<boolean>;
  uploadFile: (file: File, path: string) => Promise<string>;
};

const statusColors: Record<TransactionStatus, string> = {
  pending: "bg-yellow-100 text-yellow-800 border-yellow-200",
  processing: "bg-blue-100 text-blue-800 border-blue-200",
  completed: "bg-green-100 text-green-800 border-green-200",
  cancelled: "bg-red-100 text-red-800 border-red-200",
};

const DetailRow = ({ label, value, isCopyable = false }: { label: string; value: string | undefined | null; isCopyable?: boolean }) => {
    const { toast } = useToast();
    if (!value) return null;

    const handleCopy = () => {
        if (navigator.clipboard) {
            navigator.clipboard.writeText(value);
            toast({ title: "¡Copiado!", description: `${label} copiado.` });
        }
    };
    
    return (
        <div className="flex justify-between items-center py-1.5 text-xs">
            <span className="font-medium text-muted-foreground">{label}:</span>
            <div className="flex items-center gap-1">
                <span className="font-mono text-right break-all">{value}</span>
                {isCopyable && (
                    <Button variant="ghost" size="icon" className="h-5 w-5" onClick={handleCopy}>
                        <Copy className="h-3 w-3" />
                    </Button>
                )}
            </div>
        </div>
    );
};

const AdminTransactionItem = ({
  transaction,
  onUpdateTransaction,
  uploadFile,
}: {
  transaction: FullTransaction;
  onUpdateTransaction: AdminTransactionManagerProps["onUpdateTransaction"];
  uploadFile: AdminTransactionManagerProps["uploadFile"];
}) => {
  const [adminReceiptFile, setAdminReceiptFile] = useState<File | null>(null);
  const [isUploading, setIsUploading] = useState(false);
  const { toast } = useToast();

  const handleStatusChange = async (newStatus: TransactionStatus) => {
    let dataToUpdate: Partial<TransactionData> = { status: newStatus };

    if (newStatus === 'completed') {
        if (!adminReceiptFile) {
            toast({ variant: "destructive", title: "Error", description: "Debe subir un comprobante para completar la orden." });
            return;
        }
        setIsUploading(true);
        try {
            const filePath = `receipts/${transaction.userId}/${transaction.id}/admin_receipt_${adminReceiptFile.name}`;
            const url = await uploadFile(adminReceiptFile, filePath);
            dataToUpdate.adminReceiptUrl = url;
        } catch (error) {
            toast({ variant: "destructive", title: "Error de Subida", description: "No se pudo subir el comprobante." });
            setIsUploading(false);
            return;
        }
        setIsUploading(false);
    }
    
    await onUpdateTransaction(transaction.userId, transaction.id, dataToUpdate);
  };

  return (
    <AccordionItem value={transaction.id} className="border-b">
      <AccordionTrigger className="hover:no-underline">
        <div className="flex justify-between items-center w-full pr-4 text-sm">
          <div className="flex flex-col items-start">
             <span className="font-bold">{formatCurrency(transaction.amountSend, transaction.fromCurrency)} → {formatCurrency(transaction.amountReceive, transaction.toCurrency)}</span>
             <span className="text-xs text-muted-foreground">{transaction.timestamp.toLocaleString('es-ES')}</span>
          </div>
          <Badge className={cn("text-xs", statusColors[transaction.status])}>
            {transaction.status}
          </Badge>
        </div>
      </AccordionTrigger>
      <AccordionContent className="bg-muted/30 p-4 rounded-b-lg">
        <div className="grid grid-cols-1 md:grid-cols-2 gap-x-8 gap-y-4">
            {/* Transaction Details */}
            <div className="space-y-1">
                <h4 className="font-semibold text-sm mb-2">Detalles de la Orden</h4>
                <DetailRow label="ID de Transacción" value={transaction.id} isCopyable/>
                <DetailRow label="ID de Usuario" value={transaction.userId} isCopyable/>
                <DetailRow label="Tasa Aplicada" value={transaction.rate.toFixed(6)} />
                 {transaction.userReceiptUrl && (
                    <div className="pt-2">
                        <a href={transaction.userReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-blue-600 hover:underline text-sm">
                            Ver Comprobante del Usuario
                        </a>
                    </div>
                )}
                 {transaction.adminReceiptUrl && (
                    <div className="pt-2">
                        <a href={transaction.adminReceiptUrl} target="_blank" rel="noopener noreferrer" className="text-green-600 hover:underline text-sm">
                            Ver Comprobante del Admin
                        </a>
                    </div>
                )}
            </div>
            
            {/* Recipient Details */}
            <div className="space-y-1">
                <h4 className="font-semibold text-sm mb-2">Datos del Destinatario ({transaction.toCurrency})</h4>
                {transaction.recipient ? (
                    <>
                        <DetailRow label="Nombre Completo" value={transaction.recipient.fullName} isCopyable />
                        <DetailRow label="Cédula" value={transaction.recipient.cedula} isCopyable />
                        <DetailRow label="Banco" value={transaction.recipient.bank} />
                        {transaction.recipient.paymentMethod === 'bank' && <DetailRow label="N° Cuenta" value={transaction.recipient.accountNumber} isCopyable />}
                        {transaction.recipient.paymentMethod === 'pagoMovil' && <DetailRow label="Teléfono" value={transaction.recipient.phoneNumber} isCopyable />}
                    </>
                ) : (
                    <p className="text-xs text-muted-foreground">No se proporcionaron datos de destinatario.</p>
                )}
            </div>
        </div>

        {/* Admin Actions */}
        <Separator className="my-4" />
        <div className="flex flex-col sm:flex-row items-center gap-4">
            <div className="flex-grow space-y-2">
                <Label htmlFor={`admin-receipt-${transaction.id}`} className="text-xs font-medium">Subir Comprobante de Pago (Admin)</Label>
                <Input id={`admin-receipt-${transaction.id}`} type="file" className="text-xs h-9" onChange={(e) => setAdminReceiptFile(e.target.files?.[0] || null)} />
            </div>
            <div className="flex items-center gap-2 self-end">
                <Button size="sm" variant="destructive" onClick={() => handleStatusChange('cancelled')} disabled={isUploading}>
                    <X className="mr-2 h-4 w-4" /> Cancelar
                </Button>
                <Button size="sm" className="bg-green-600 hover:bg-green-700" onClick={() => handleStatusChange('completed')} disabled={isUploading || !adminReceiptFile}>
                   {isUploading ? "Subiendo..." : <><Check className="mr-2 h-4 w-4" /> Completar</>}
                </Button>
            </div>
        </div>

      </AccordionContent>
    </AccordionItem>
  );
};

const AdminTransactionManager = ({
  transactions,
  isLoading,
  onUpdateTransaction,
  uploadFile,
}: AdminTransactionManagerProps) => {
  if (isLoading) {
    return (
      <div className="space-y-2 mt-6">
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
        <Skeleton className="h-8 w-full" />
      </div>
    );
  }

  return (
    <section className="pt-6 border-t mt-6">
      <h3 className="text-lg font-bold text-foreground mb-3">
        Órdenes de Clientes ({transactions.length})
      </h3>
      {transactions.length === 0 ? (
        <Alert>
            <Circle className="h-4 w-4" />
            <AlertTitle>No hay órdenes</AlertTitle>
            <AlertDescription>Aún no hay transacciones de clientes para gestionar.</AlertDescription>
        </Alert>
      ) : (
        <Accordion type="multiple" className="w-full space-y-2">
          {transactions.map((tx) => (
            <AdminTransactionItem
              key={tx.id}
              transaction={tx}
              onUpdateTransaction={onUpdateTransaction}
              uploadFile={uploadFile}
            />
          ))}
        </Accordion>
      )}
    </section>
  );
};

export default AdminTransactionManager;
