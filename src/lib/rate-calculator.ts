import type { ExchangeRates, CalculatedRates } from '@/lib/types';

const DISCOUNT_RATE_WLD_CLP = 0.14;
const DISCOUNT_RATE_CLP_VES = 0.08;
const MARGIN_RATE_USDT_CLP = 0.004;

export function calculateFullRates(liveRates: ExchangeRates | null): { rates: CalculatedRates, derived: { usdtToClpMargin: number | null } } {
    const calculatedRates: CalculatedRates = {};
    const derived = { usdtToClpMargin: null };

    if (!liveRates) {
        return { rates: {}, derived };
    }
    
    const { WLD_to_USDT, USDT_to_CLP_P2P_WLD, CLP_to_USDT_P2P, VES_to_USDT_P2P } = liveRates;

    // --- 1. WLD <-> CLP ---
    if (WLD_to_USDT && USDT_to_CLP_P2P_WLD) {
        const baseWldToClp = WLD_to_USDT * USDT_to_CLP_P2P_WLD;
        const finalWldToClp = baseWldToClp * (1 - DISCOUNT_RATE_WLD_CLP);
        calculatedRates['WLD_to_CLP'] = finalWldToClp;
        calculatedRates['CLP_to_WLD'] = 1 / finalWldToClp;
    }

    // --- 2. CLP <-> VES ---
    if (CLP_to_USDT_P2P && VES_to_USDT_P2P) {
        const clpToBaseUsdtRate = 1 / CLP_to_USDT_P2P;
        const baseClpToVesRate = clpToBaseUsdtRate * VES_to_USDT_P2P;
        const finalClpToVesRate = baseClpToVesRate * (1 - DISCOUNT_RATE_CLP_VES);
        calculatedRates['CLP_to_VES'] = finalClpToVesRate;
        calculatedRates['VES_to_CLP'] = 1 / finalClpToVesRate;
    }
    
    // --- 3. CLP <-> USDT ---
    if (CLP_to_USDT_P2P) {
        const finalUsdtToClp = CLP_to_USDT_P2P * (1 + MARGIN_RATE_USDT_CLP);
        const finalClpToUsdt = 1 / finalUsdtToClp;
        calculatedRates['CLP_to_USDT'] = finalClpToUsdt;
        calculatedRates['USDT_to_CLP'] = finalUsdtToClp;
        derived.usdtToClpMargin = finalUsdtToClp;
    }

    // --- 4. Identity ---
    calculatedRates['CLP_to_CLP'] = 1.0;
    calculatedRates['VES_to_VES'] = 1.0;
    calculatedRates['WLD_to_WLD'] = 1.0;
    calculatedRates['USDT_to_USDT'] = 1.0;
    
    return { rates: calculatedRates, derived };
}
