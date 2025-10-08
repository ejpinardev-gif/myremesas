
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
import { RadioGroup, RadioGroupItem } from "@/components/ui/radio-group";
import { ArrowLeft } from "lucide-react";
import type { RecipientData } from "@/lib/types";
import banks from "@/lib/bancos-venezuela.json";

const recipientSchema = z.object({
  paymentMethod: z.enum(["bank", "pagoMovil"], { required_error: "Debe seleccionar un método de pago." }),
  fullName: z.string().min(3, "El nombre completo es requerido."),
  cedula: z.string().min(6, "La cédula es requerida.").regex(/^\d+$/, "La cédula solo debe contener números."),
  bank: z.string().min(1, "Debe seleccionar un banco."),
  accountNumber: z.string().optional(),
  phoneNumber: z.string().optional(),
}).refine(data => {
  if (data.paymentMethod === 'bank') {
    return !!data.accountNumber && data.accountNumber.length >= 20;
  }
  return true;
}, { message: "El número de cuenta debe tener 20 dígitos.", path: ["accountNumber"] })
.refine(data => {
  if (data.paymentMethod === 'pagoMovil') {
    return !!data.phoneNumber && data.phoneNumber.length >= 10;
  }
  return true;
}, { message: "El número de teléfono es requerido.", path: ["phoneNumber"] });

type RecipientFormValues = z.infer<typeof recipientSchema>;

type RecipientFormProps = {
  onSubmit: (data: RecipientData) => Promise<boolean>;
  onBack: () => void;
};

const RecipientForm = ({ onSubmit, onBack }: RecipientFormProps) => {
  const [isSubmitting, setIsSubmitting] = useState(false);

  const form = useForm<RecipientFormValues>({
    resolver: zodResolver(recipientSchema),
    defaultValues: {
      paymentMethod: "bank",
      fullName: "",
      cedula: "",
      bank: "",
    },
  });

  const paymentMethod = form.watch("paymentMethod");

  const handleFormSubmit: SubmitHandler<RecipientFormValues> = async (data) => {
    setIsSubmitting(true);
    await onSubmit(data);
    setIsSubmitting(false);
  };

  return (
    <Form {...form}>
      <form onSubmit={form.handleSubmit(handleFormSubmit)} className="space-y-4">
        <FormField
          control={form.control}
          name="paymentMethod"
          render={({ field }) => (
            <FormItem className="space-y-3">
              <FormLabel>Método de Pago</FormLabel>
              <FormControl>
                <RadioGroup
                  onValueChange={field.onChange}
                  defaultValue={field.value}
                  className="flex space-x-4"
                >
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="bank" />
                    </FormControl>
                    <FormLabel className="font-normal">Transferencia Bancaria</FormLabel>
                  </FormItem>
                  <FormItem className="flex items-center space-x-2 space-y-0">
                    <FormControl>
                      <RadioGroupItem value="pagoMovil" />
                    </FormControl>
                    <FormLabel className="font-normal">Pago Móvil</FormLabel>
                  </FormItem>
                </RadioGroup>
              </FormControl>
              <FormMessage />
            </FormItem>
          )}
        />
        
        <div className="grid grid-cols-1 md:grid-cols-2 gap-4">
          <FormField
            control={form.control}
            name="fullName"
            render={({ field }) => (
              <FormItem className="md:col-span-2">
                <FormLabel>Nombre y Apellido</FormLabel>
                <FormControl>
                  <Input placeholder="Nombre completo del titular" {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
          <FormField
            control={form.control}
            name="cedula"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Cédula de Identidad</FormLabel>
                <FormControl>
                  <Input placeholder="V-12345678" {...field} />
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
                    {banks.map((bank) => (
                      <SelectItem key={bank.code} value={bank.name}>{bank.name}</SelectItem>
                    ))}
                  </SelectContent>
                </Select>
                <FormMessage />
              </FormItem>
            )}
          />
        </div>

        {paymentMethod === 'bank' && (
          <FormField
            control={form.control}
            name="accountNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de Cuenta (20 dígitos)</FormLabel>
                <FormControl>
                  <Input placeholder="0102..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}

        {paymentMethod === 'pagoMovil' && (
           <FormField
            control={form.control}
            name="phoneNumber"
            render={({ field }) => (
              <FormItem>
                <FormLabel>Número de Teléfono</FormLabel>
                <FormControl>
                  <Input placeholder="0412..." {...field} />
                </FormControl>
                <FormMessage />
              </FormItem>
            )}
          />
        )}
        
        <div className="flex flex-col-reverse sm:flex-row sm:justify-end sm:space-x-2 pt-4">
            <Button type="button" variant="outline" onClick={onBack} disabled={isSubmitting}>
                 <ArrowLeft className="mr-2 h-4 w-4" /> Volver
            </Button>
            <Button type="submit" disabled={isSubmitting}>
              {isSubmitting ? "Guardando..." : "Guardar y Finalizar"}
            </Button>
        </div>

      </form>
    </Form>
  );
};

export default RecipientForm;
