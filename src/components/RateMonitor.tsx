"use client";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { ExchangeRates } from "@/lib/types";

type RateMonitorProps = {
  liveRates: ExchangeRates | null;
  derivedRates: { usdtToClpMargin: number | null };
  isLoading: boolean;
};

const RateInfoCard = ({
  title,
  children,
  isLoading,
}: {
  title: string;
  children: React.ReactNode;
  isLoading: boolean;
}) => (
  <div className="p-3 bg-background rounded-lg border">
    <h4 className="font-bold text-sm text-foreground mb-2">{title}</h4>
    {isLoading ? (
      <div className="space-y-2">
        <Skeleton className="h-4 w-3/4" />
        <Skeleton className="h-4 w-1/2" />
      </div>
    ) : (
      <div className="space-y-1">{children}</div>
    )}
  </div>
);

const RateMonitor = ({
  liveRates,
  derivedRates,
  isLoading,
}: RateMonitorProps) => {
  return (
    <section className="mb-6">
      <h3 className="text-lg font-bold text-foreground mb-3">
        Reference Market Rates
      </h3>
      <p className="text-sm text-muted-foreground mb-4">
        These rates are fetched in real-time from P2P/market data.
      </p>
      <div className="grid grid-cols-1 md:grid-cols-3 gap-3">
        <RateInfoCard title="WLD/CLP (Disc. 14%)" isLoading={isLoading}>
          <p className="text-xs text-muted-foreground">
            WLD/USDT: {liveRates?.WLD_to_USDT?.toFixed(4) ?? "..."}
          </p>
          <p className="text-xs text-muted-foreground">
            USDT/CLP P2P: {liveRates?.USDT_to_CLP_P2P_WLD?.toFixed(2) ?? "..."}
          </p>
        </RateInfoCard>

        <RateInfoCard title="CLP/VES (Disc. 8%)" isLoading={isLoading}>
          <p className="text-xs text-muted-foreground">
            CLP/USDT P2P: {liveRates?.CLP_to_USDT_P2P?.toFixed(2) ?? "..."}
          </p>
          <p className="text-xs text-muted-foreground">
            VES/USDT P2P: {liveRates?.VES_to_USDT_P2P?.toFixed(2) ?? "..."}
          </p>
        </RateInfoCard>

        <RateInfoCard title="USDT/CLP (Margin +0.4%)" isLoading={isLoading}>
          <p className="text-xs text-muted-foreground">
            USDT/CLP Rate: {derivedRates?.usdtToClpMargin?.toFixed(2) ?? "..."}
          </p>
        </RateInfoCard>
      </div>
      <Separator className="my-6" />
    </section>
  );
};

export default RateMonitor;
