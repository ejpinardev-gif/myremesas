
"use client";

import {
  Accordion,
  AccordionContent,
  AccordionItem,
  AccordionTrigger,
} from "@/components/ui/accordion";
import { Card, CardContent } from "@/components/ui/card";
import RateMonitor from "./RateMonitor";
import AccountManager from "./AccountManager";
import type { ExchangeRates, AdminAccount, AdminAccountData } from "@/lib/types";

type AdminPanelProps = {
  liveRates: ExchangeRates | null;
  derivedRates: { usdtToClpMargin: number | null };
  savedAccounts: AdminAccount[];
  onSaveAccount: (
    accountData: Omit<AdminAccountData, "updatedBy" | "timestamp">
  ) => Promise<boolean>;
  onDeleteAccount: (id: string) => void;
  isLoading: boolean;
};

const AdminPanel = (props: AdminPanelProps) => {
  return (
    <div className="mb-8">
      <Accordion type="single" collapsible className="w-full">
        <AccordionItem value="admin-panel" className="border-b-0">
          <AccordionTrigger className="w-full py-2 px-4 text-sm font-medium rounded-lg bg-card border shadow-sm hover:bg-muted/80 no-underline hover:no-underline justify-center [&[data-state=open]>svg]:rotate-180">
            <span className="text-center">Panel de Administración</span>
          </AccordionTrigger>
          <AccordionContent>
            <Card className="mt-4 bg-card border shadow-sm">
              <CardContent className="p-6">
                <h2 className="text-xl font-semibold mb-4 text-foreground">
                  Panel de Configuración
                </h2>
                <RateMonitor
                  liveRates={props.liveRates}
                  derivedRates={props.derivedRates}
                  isLoading={props.isLoading}
                />
                <AccountManager
                  savedAccounts={props.savedAccounts}
                  onSaveAccount={props.onSaveAccount}
                  onDeleteAccount={props.onDeleteAccount}
                />
              </CardContent>
            </Card>
          </AccordionContent>
        </AccordionItem>
      </Accordion>
    </div>
  );
};

export default AdminPanel;

    