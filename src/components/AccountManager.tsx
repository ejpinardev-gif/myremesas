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
  bankName: z.string().min(1, "Bank name is required"),
  accountHolder: z
    .string()
    .min(1, "Account holder is required")
    .default("Ender Javier Piña Rojas"),
  rut: z.string().min(1, "RUT is required").default("26728535-7"),
  accountType: z.string().min(1, "Account type is required"),
  accountNumber: z.string().min(1, "Account number is required"),
  email: z.string().email("Invalid email address").optional().or(z.literal("")),
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
          Add New Account (CLP)
        </h3>
        <p className="text-sm text-muted-foreground mb-4">
          Enter a destination account where the user will transfer CLP.
        </p>
        <Form {...form}>
          <form onSubmit={form.handleSubmit(onSubmit)} className="space-y-4">
            <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
              <FormField
                control={form.control}
                name="accountHolder"
                render={({ field }) => (
                  <FormItem>
                    <FormLabel>Account Holder</FormLabel>
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
                    <FormLabel>Bank</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="-- Select Bank --" />
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
                    <FormLabel>Account Type</FormLabel>
                    <Select
                      onValueChange={field.onChange}
                      defaultValue={field.value}
                    >
                      <FormControl>
                        <SelectTrigger>
                          <SelectValue placeholder="-- Select Type --" />
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
                    <FormLabel>Account Number</FormLabel>
                    <FormControl>
                      <Input placeholder="Account Number" {...field} />
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
                    <FormLabel>Email (Optional)</FormLabel>
                    <FormControl>
                      <Input
                        type="email"
                        placeholder="Email (Optional)"
                        {...field}
                      />
                    </FormControl>
                    <FormMessage />
                  </FormItem>
                )}
              />
            </div>
            <Button type="submit" className="w-full mt-4" disabled={isSubmitting}>
              {isSubmitting ? "Saving..." : "Save New Account"}
            </Button>
          </form>
        </Form>
      </section>

      <section className="pt-4">
        <h3 className="text-lg font-bold text-foreground mb-3">
          Saved Accounts ({savedAccounts.length})
        </h3>
        <ScrollArea className="h-48">
          <div className="space-y-3 pr-4">
            {savedAccounts.length === 0 ? (
              <p className="text-sm text-muted-foreground">
                No accounts configured.
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
