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
