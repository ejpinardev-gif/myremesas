
"use client";

import RateTicker from "./RateTicker";
import type { CalculatedRates } from "@/lib/types";

type HeaderProps = {
  rates: CalculatedRates;
  isLoading: boolean;
};

const Header = ({ rates, isLoading }: HeaderProps) => {
  return (
    <header className="text-center mb-8">
      <h1 className="text-4xl font-extrabold text-foreground mb-2">
        Calculadora de Cambios
      </h1>
      <p className="text-muted-foreground mb-4">
        Muestra cintillo con tasas de cambio en tiempo real
      </p>
      <RateTicker rates={rates} isLoading={isLoading} />
    </header>
  );
};

export default Header;

    