
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
import { ArrowLeft } from "lucide-react";
import type { RecipientData } from "@/lib/types";

const recipientSchema = z.object({
  fullName: z.string().min(3, "El nombre completo es requerido."),
  rut: z.string().min(1, "El RUT es requerido"),
  bank: z.string().min(1, "Debe seleccionar un banco."),
  accountType: z.string().min(1, "El tipo de cuenta es requerido."),
  accountNumber: z.string().min(1, "El número de cuenta es requerido"),
});

type RecipientFormValues = z.infer<typeof recipientSchema>;

type RecipientFormProps = {
  onSubmit: (data: RecipientData) => Promise<boolean>;
  onBack: () => void;
};

const bankOptions = [
  "Banco Estado",
  "Banco de Chile",
  "Santander",
  "Scotiabank",
  "BCI",
  "Itau",
  "Banco Bice",
  "Banco Falabella",
  "Mercado Pago",
  "Global66",
];

const accountTypeOptions = ["Cuenta Corriente", "Cuenta Vista", "Cuenta RUT"];


const ChileanRecipientForm = ({ onSubmit, onBack }: RecipientFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RecipientFormValues>({
    resolver: zodResolver(recipientSchema),
    defaultValues: {
      fullName: "",
      rut: "",
      bank: "",
      accountType: "",
      accountNumber: "",
    },
  });

  const handleFormSubmit: SubmitHandler<RecipientFormValues> = async (data) => {
    setIsSubmitting(true);
    const success = await onSubmit(data);
    setIsSubmitting(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4 pt-4">
        
        <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Nombre y Apellido</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre completo del titular" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
        />

        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="rut"
            render={({ field }) => (
              <FormItem>
                <FormLabel>RUT</FormLabel>
                <FormControl>
                  <Input placeholder="12345678-9" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
           <FormField
            control={form.control}
            name="bank"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Banco</FormLabel>
                <Select onValueChange={field.onChange} defaultValue={field.value}>
                  <FormControl>
                    <SelectTrigger>
                      <SelectValue placeholder="-- Seleccione un Banco --" />
                    </SelectTrigger>
                  </FormControl>
                  <SelectContent>
                    {bankOptions.map((bank) => (
                      <SelectItem key={bank} value={bank}>{bank}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

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
              <FormItem>
                <FormLabel>Número de Cuenta</FormLabel>
                <FormControl>
                  <Input placeholder="Número de cuenta" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
        />
        
        <div className="flex flex-col-reverse sm:flex-row sm:justify-between pt-4">
            <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
                 <ArrowLeft className="mr-2 h-4 w-4" /> Cancelar
            </Button>
            <Button type="submit" disabled={isSubmitting} className="mb-2 sm:mb-0">
              {isSubmitting ? "Guardando..." : "Guardar y Continuar al Pago"}
            </Button>
        </div>

      </form>
    </Form>
  );
};

export default ChileanRecipientForm;

    