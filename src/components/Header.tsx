"use client";

import { Badge } from "@/components/ui/badge";

type HeaderProps = {
  userId?: string;
  authStatus: string;
};

const Header = ({ userId, authStatus }: HeaderProps) => {
  return (
    <header className="text-center mb-8">
      <h1 className="text-4xl font-extrabold text-foreground mb-2">
        Remesas{" "}
        <span className="bg-gradient-to-r from-blue-700 to-cyan-500 text-transparent bg-clip-text">
          CLP / VES / WLD / USDT
        </span>
      </h1>
      <p className="text-muted-foreground">
        Calculadora de Intercambio y Registro de Transacciones
      </p>
      {userId ? (
        <div className="mt-4 inline-block">
          <Badge variant="outline" className="border-yellow-400 bg-yellow-50 text-yellow-900">
            <span className="font-bold mr-2">User ID:</span> 
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
