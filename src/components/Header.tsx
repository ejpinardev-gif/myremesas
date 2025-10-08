
"use client";

import { Badge } from "@/components/ui/badge";
import RateTicker from "./RateTicker";
import type { CalculatedRates } from "@/lib/types";

type HeaderProps = {
  userId?: string;
  authStatus: string;
  rates: CalculatedRates;
  isLoading: boolean;
};

const Header = ({ userId, authStatus, rates, isLoading }: HeaderProps) => {
  return (
    <header className="text-center mb-8">
      <h1 className="text-4xl font-extrabold text-foreground mb-2">
        Calculadora de Cambios
      </h1>
      <RateTicker rates={rates} isLoading={isLoading} />
      {userId ? (
        <div className="mt-4 inline-block">
          <Badge variant="outline" className="border-yellow-400 bg-yellow-50 text-yellow-900">
            <span className="font-bold mr-2">ID de Usuario:</span> 
            <span className="font-mono text-xs">{userId}</span>
          </Badge>
        </div>
      ) : (
         <p className="text-sm text-muted-foreground mt-2">{authStatus}</p>
      )}
    </header>
  );
};

export default Header;
