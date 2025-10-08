
'use server';
/**
 * @fileOverview Flujo de comentarios de mercado para explicar los movimientos de las tasas de cambio.
 *
 * - provideMarketCommentary - Una función que proporciona un resumen de las condiciones del mercado.
 * - MarketCommentaryInput - El tipo de entrada para la función provideMarketCommentary.
 * - MarketCommentaryOutput - El tipo de retorno para la función provideMarketCommentary.
 */

import {ai} from '@/ai/genkit';
import {z} from 'zod';

const MarketCommentaryInputSchema = z.object({
  currencySend: z.string().describe('La moneda que se envía (ej., CLP).'),
  currencyReceive: z.string().describe('La moneda que se recibe (ej., VES).'),
  rate: z.number().describe('La tasa de cambio actual entre las dos monedas.'),
});
export type MarketCommentaryInput = z.infer<typeof MarketCommentaryInputSchema>;

const MarketCommentaryOutputSchema = z.object({
  commentary: z.string().describe('Un resumen de las condiciones del mercado que afectan la tasa de cambio.'),
});
export type MarketCommentaryOutput = z.infer<typeof MarketCommentaryOutputSchema>;

export async function provideMarketCommentary(input: MarketCommentaryInput): Promise<MarketCommentaryOutput> {
  return provideMarketCommentaryFlow(input);
}

const prompt = ai.definePrompt({
  name: 'marketCommentaryPrompt',
  input: {schema: MarketCommentaryInputSchema},
  output: {schema: MarketCommentaryOutputSchema},
  prompt: `Eres un analista financiero experto que proporciona comentarios sobre las tasas de cambio de divisas.

  Proporciona un breve resumen de las condiciones del mercado que pueden estar influyendo en la tasa de cambio entre {{currencySend}} y {{currencyReceive}}, que actualmente es de {{rate}}.
  Concéntrate en factores que un usuario entendería fácilmente, como noticias recientes, indicadores económicos o situaciones geopolíticas.
  Mantén el comentario conciso y al grano.
  La respuesta no debe tener más de dos frases.
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

    