// src/ai/flows/fetch-real-time-exchange-rates.ts
'use server';

/**
 * @fileOverview Fetches real-time exchange rates from a GenAI service.
 *
 * - fetchRealTimeExchangeRates - A function that fetches real-time exchange rates.
 * - ExchangeRatesInput - The input type for the fetchRealTimeExchangeRates function.
 * - ExchangeRatesOutput - The return type for the fetchRealTimeExchangeRates function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'genkit';

const ExchangeRatesInputSchema = z.object({
  query: z.string().describe('The query to fetch exchange rates.'),
  systemPrompt: z.string().describe('The system prompt to guide the LLM.'),
});

export type ExchangeRatesInput = z.infer<typeof ExchangeRatesInputSchema>;

const ExchangeRatesOutputSchema = z.object({
  WLD_to_USDT: z.number().describe('Tasa WLD a USDT (ej: 1.19)'),
  USDT_to_CLP_P2P_WLD: z.number().describe('Tasa USDT a CLP P2P (ej: 963)'),
  CLP_to_USDT_P2P: z.number().describe('Tasa P2P de 1 USDT a CLP (3ra oferta de venta) (ej: 963)'),
  VES_to_USDT_P2P: z.number().describe('Tasa P2P de 1 USDT a VES (ej: 36)'),
});

export type ExchangeRatesOutput = z.infer<typeof ExchangeRatesOutputSchema>;

export async function fetchRealTimeExchangeRates(
  input: ExchangeRatesInput
): Promise<ExchangeRatesOutput> {
  return fetchRealTimeExchangeRatesFlow(input);
}

const prompt = ai.definePrompt({
  name: 'exchangeRatesPrompt',
  input: {schema: ExchangeRatesInputSchema},
  output: {schema: ExchangeRatesOutputSchema},
  prompt: `{{query}}`,
  system: `{{systemPrompt}}`,
  config: {
    responseMimeType: 'application/json',
    responseSchema: {
      type: 'OBJECT',
      properties: {
        WLD_to_USDT: {type: 'NUMBER', description: 'Tasa WLD a USDT (ej: 1.19)'},
        USDT_to_CLP_P2P_WLD: {type: 'NUMBER', description: 'Tasa USDT a CLP P2P (ej: 963)'},
        CLP_to_USDT_P2P: {type: 'NUMBER', description: 'Tasa P2P de 1 USDT a CLP (3ra oferta de venta) (ej: 963)'},
        VES_to_USDT_P2P: {type: 'NUMBER', description: 'Tasa P2P de 1 USDT a VES (ej: 36)'},
      },
      required: [
        'WLD_to_USDT',
        'USDT_to_CLP_P2P_WLD',
        'CLP_to_USDT_P2P',
        'VES_to_USDT_P2P',
      ],
    },
  },
});

const fetchRealTimeExchangeRatesFlow = ai.defineFlow(
  {
    name: 'fetchRealTimeExchangeRatesFlow',
    inputSchema: ExchangeRatesInputSchema,
    outputSchema: ExchangeRatesOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
