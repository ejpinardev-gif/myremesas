
"use server";

import { fetchRealTimeExchangeRates, type ExchangeRatesInput } from '@/ai/flows/fetch-real-time-exchange-rates';
import { provideMarketCommentary, type MarketCommentaryInput } from '@/ai/flows/provide-market-commentary';

export async function getDynamicRates(input: ExchangeRatesInput) {
  try {
    const rates = await fetchRealTimeExchangeRates(input);
    return rates;
  } catch (error) {
    console.error('Error fetching dynamic rates from flow:', error);
    return null;
  }
}

export async function getMarketCommentary(input: MarketCommentaryInput) {
    try {
        const commentary = await provideMarketCommentary(input);
        return commentary;
    } catch (error) {
        console.error('Error fetching market commentary:', error);
        return null;
    }
}

// This is a server action that simulates uploading a file.
// In a real application, this would upload to a service like Firebase Storage
// and return the public URL.
export async function uploadFile(file: File, path: string): Promise<string> {
  console.log(`Simulating file upload for ${file.name} to ${path}`);
  // Simulate a delay
  await new Promise(resolve => setTimeout(resolve, 1000));
  
  // Return a placeholder URL.
  // In a real scenario, you'd get this from your storage service.
  return "https://placehold.co/600x400.png?text=Comprobante";
}
