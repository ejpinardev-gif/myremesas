import { clsx, type ClassValue } from "clsx"
import { twMerge } from "tailwind-merge"

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs))
}

export function formatCurrency(value: number, currencyCode: string): string {
  if (isNaN(value)) value = 0;

  try {
    if (currencyCode === 'WLD') {
      return `${value.toLocaleString('en-US', { minimumFractionDigits: 4, maximumFractionDigits: 8 })} WLD`;
    }
    if (currencyCode === 'USDT') {
       return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 4 })} USDT`;
    }
    if (currencyCode === 'VES') {
       return value.toLocaleString('es-VE', { style: 'currency', currency: 'VES', minimumFractionDigits: 2, maximumFractionDigits: 2 });
    }
    if (currencyCode === 'CLP') {
       return value.toLocaleString('es-CL', { style: 'currency', currency: 'CLP', minimumFractionDigits: 0, maximumFractionDigits: 0 });
    }
  } catch (e) {
    // Fallback for environments without full ICU support
    return `${value.toFixed(2)} ${currencyCode}`;
  }

  return `${value.toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })} ${currencyCode}`;
}
