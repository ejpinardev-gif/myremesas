'use server';
/**
 * @fileOverview Market commentary flow to explain exchange rate movements.
 *
 * - provideMarketCommentary - A function that provides a summary of market conditions.
 * - MarketCommentaryInput - The input type for the provideMarketCommentary function.
 * - MarketCommentaryOutput - The return type for the provideMarketCommentary function.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const MarketCommentaryInputSchema = z.object({
  currencySend: z.string().describe('The currency being sent (e.g., CLP).'),
  currencyReceive: z.string().describe('The currency being received (e.g., VES).'),
  rate: z.number().describe('The current exchange rate between the two currencies.'),
});
export type MarketCommentaryInput = z.infer<typeof MarketCommentaryInputSchema>;

const MarketCommentaryOutputSchema = z.object({
  commentary: z.string().describe('A summary of the market conditions affecting the exchange rate.'),
});
export type MarketCommentaryOutput = z.infer<typeof MarketCommentaryOutputSchema>;

export async function provideMarketCommentary(input: MarketCommentaryInput): Promise<MarketCommentaryOutput> {
  return provideMarketCommentaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'marketCommentaryPrompt',
  input: {schema: MarketCommentaryInputSchema},
  output: {schema: MarketCommentaryOutputSchema},
  prompt: `You are an expert financial analyst providing commentary on currency exchange rates.

  Provide a brief summary of the market conditions that may be influencing the exchange rate between {{currencySend}} and {{currencyReceive}}, which currently stands at {{rate}}.
  Focus on factors that a user would easily understand, such as recent news events, economic indicators, or geopolitical situations.
  Keep the commentary concise and to the point.
  Response should be no more than two sentences.
  `,
});

const provideMarketCommentaryFlow = ai.defineFlow(
  {
    name: 'provideMarketCommentaryFlow',
    inputSchema: MarketCommentaryInputSchema,
    outputSchema: MarketCommentaryOutputSchema,
  },
  async input => {
    const {output} = await prompt(input);
    return output!;
  }
);
