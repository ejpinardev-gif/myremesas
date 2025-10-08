
"use client";

import { Separator } from "@/components/ui/separator";
import { Skeleton } from "@/components/ui/skeleton";
import type { CalculatedRates } from "@/lib/types";
import { cn } from "@/lib/utils";
import { TrendingUp, TrendingDown } from "lucide-react";

type RateTickerProps = {
  rates: CalculatedRates;
  isLoading: boolean;
};

const TickerItem = ({ pair, rate }: { pair: string; rate: number | null }) => {
  if (!rate) return null;
  const [from, to] = pair.split("_to_");
  const isUp = Math.random() > 0.5; // Placeholder for real trend data

  return (
    <div className="flex items-center space-x-2 mx-4">
      <span className="font-semibold text-sm">
        {from}/{to}
      </span>
      <span
        className={cn(
          "text-sm font-mono flex items-center",
          isUp ? "text-green-500" : "text-red-500"
        )}
      >
        {rate.toFixed(4)}
        {isUp ? (
          <TrendingUp className="h-4 w-4 ml-1" />
        ) : (
          <TrendingDown className="h-4 w-4 ml-1" />
        )}
      </span>
      <Separator orientation="vertical" className="h-4 bg-border/50" />
    </div>
  );
};

const RateTicker = ({ rates, isLoading }: RateTickerProps) => {
  const tickerRates = Object.entries(rates).filter(
    ([key, value]) =>
      value !== null &&
      !key.includes("_to_") && // Remove direct rates
      key.split('_')[0] !== key.split('_')[2] // Remove identity rates like CLP_to_CLP
  ).filter(([key]) => ["CLP_to_VES", "WLD_to_CLP", "USDT_to_CLP"].includes(key));


  if (isLoading) {
    return <Skeleton className="h-6 w-full max-w-lg mx-auto mt-2" />;
  }
  
  const renderTickerContent = () => (
     tickerRates.map(([key, value]) => (
        <TickerItem key={key} pair={key} rate={value} />
      ))
  )

  return (
    <div className="relative flex overflow-hidden py-2 bg-muted/50 rounded-lg border my-3 group">
      <div className="flex animate-scroll-x group-hover:animation-pause">
        {renderTickerContent()}
      </div>
       <div className="flex animate-scroll-x group-hover:animation-pause" aria-hidden="true">
        {renderTickerContent()}
      </div>
    </div>
  );
};

export default RateTicker;
