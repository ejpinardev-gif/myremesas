
"use client";

import { useState } from "react";
import { useForm, type SubmitHandler } from "react-hook-form";
import { zodResolver } from "@hookform/resolvers/zod";
import { z } from "zod";
import { Button } from "@/components/ui/button";
import { Input } from "@/components/ui/input";
import {
  Select,
  SelectContent,
  SelectItem,
  SelectTrigger,
  SelectValue,
} from "@/components/ui/select";
import {
  Form,
  FormControl,
  FormField,
  FormItem,
  FormLabel,
  FormMessage,
} from "@/components/ui/form";
import { ScrollArea } from "@/components/ui/scroll-area";
import { Trash2 } from "lucide-react";
import type { AdminAccount, AdminAccountData } from "@/lib/types";

const accountSchema = z.object({
  bankName: z.string().min(1, "El nombre del banco es requerido"),
  accountHolder: z
    .string()
    .min(1, "El titular de la cuenta es requerido")
    .default("Ender Javier Piña Rojas"),
  rut: z.string().min(1, "El RUT es requerido").default("26728535-7"),
  accountType: z.string().min(1, "El tipo de cuenta es requerido"),
  accountNumber: z.string().min(1, "El número de cuenta es requerido"),
  email: z.string().email("Dirección de correo inválida").optional().or(z.literal("")),
});

type AccountFormValues = z.infer<typeof accountSchema>;

type AccountManagerProps = {
  savedAccounts: AdminAccount[];
  onSaveAccount: (
    accountData: Omit<AdminAccountData, "updatedBy" | "timestamp">
  ) => Promise<boolean>;
  onDeleteAccount: (id: string) => void;
};

const bankOptions = [
  "Banco Estado",
  "Banco de Chile",
  "Santander",
  "Scotiabank",
  "Mercado Pago",
  "Global66",
];
const accountTypeOptions = ["Cuenta Corriente", "Cuenta Vista", "Cuenta RUT"];

const AccountManager = ({
  savedAccounts,
  onSaveAccount,
  onDeleteAccount,
}: AccountManagerProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<AccountFormValues>({
    resolver: zodResolver(accountSchema),
    defaultValues: {
      accountHolder: "Ender Javier Piña Rojas",
      rut: "26728535-7",
      bankName: "",
      accountType: "",
      accountNumber: "",
      email: "",
    },
  });

  const onSubmit: SubmitHandler<AccountFormValues> = async (data) => {
    setIsSubmitting(true);
    const success = await onSaveAccount(data);
    if (success) {
      form.reset();
    }
    setIsSubmitting(false);
  };

  return (
    <>
      <section className="border-b border-border pb-4">
        <h3 className="text-lg font-bold text-foreground mb-3">
          Agregar Nueva Cuenta (CLP)
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Ingrese una cuenta de destino donde el usuario transferirá CLP.
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="accountHolder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Titular de la Cuenta</FormLabel>
                    <FormControl>
                      <Input placeholder="Ender Javier Piña Rojas" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="rut"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>RUT/Cédula</FormLabel>
                    <FormControl>
                      <Input placeholder="26728535-7" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="bankName"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Banco</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="-- Seleccione Banco --" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {bankOptions.map((bank) => (
                          <SelectItem key={bank} value={bank}>
                            {bank}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accountType"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Tipo de Cuenta</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="-- Seleccione Tipo --" />
                        </SelectTrigger>
                      </FormControl>
                      <SelectContent>
                        {accountTypeOptions.map((type) => (
                          <SelectItem key={type} value={type}>
                            {type}
                          </SelectItem>
                        ))}
                      </SelectContent>
                    </Select>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="accountNumber"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Número de Cuenta</FormLabel>
                    <FormControl>
                      <Input placeholder="Número de Cuenta" {...field} />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
              <FormField
                control={form.control}
                name="email"
                render={({ field }) => (
                  <FormItem className="md:col-span-2">
                    <FormLabel>Email (Opcional)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Email (Opcional)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full mt-4" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar Nueva Cuenta"}
            </Button>
          </form>
        </Form>
      </section>

      <section className="pt-4">
        <h3 className="text-lg font-bold text-foreground mb-3">
          Cuentas Guardadas ({savedAccounts.length})
        </h3>
        <ScrollArea className="h-48">
          <div className="space-y-3 pr-4">
            {savedAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No hay cuentas configuradas.
              </p>
            ) : (
              savedAccounts.map((account) => (
                <div
                  key={account.id}
                  className="p-3 bg-background border rounded-lg flex justify-between items-center text-xs"
                >
                  <div>
                    <p className="font-bold text-foreground">
                      {account.bankName} ({account.accountType})
                    </p>
                    <p className="text-muted-foreground">
                      N° {account.accountNumber} | RUT: {account.rut}
                    </p>
                  </div>
                  <Button
                    variant="ghost"
                    size="icon"
                    className="text-destructive hover:text-destructive"
                    onClick={() => onDeleteAccount(account.id)}
                  >
                    <Trash2 className="h-4 w-4" />
                  </Button>
                </div>
              ))
            )}
          </div>
        </ScrollArea>
      </section>
    </>
  );
};

export default AccountManager;

    