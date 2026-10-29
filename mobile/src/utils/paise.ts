/**
 * FinTrack Mobile — Integer Paise Math Utility (Golden Rule #2)
 * ₹1 = 100 Paise (BIGINT in database, safe integer in TypeScript)
 */

export type Paise = number;

export function rupeesToPaise(rupeesInput: number | string): Paise {
  if (typeof rupeesInput === 'number') {
    if (!Number.isFinite(rupeesInput) || rupeesInput < 0) {
      throw new Error(`Invalid rupee amount: ${rupeesInput}`);
    }
    return Math.round(rupeesInput * 100);
  }

  const cleaned = rupeesInput.replace(/[₹,\s]/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid rupee format: "${rupeesInput}"`);
  }

  const [wholePart, decimalPart = ''] = cleaned.split('.');
  const paddedDecimal = (decimalPart + '00').slice(0, 2);
  return parseInt(wholePart, 10) * 100 + parseInt(paddedDecimal, 10);
}

export function paiseToRupees(paise: Paise): number {
  return paise / 100;
}

export function formatINR(paise: Paise, showDecimalsWhenZero = false): string {
  const isNegative = paise < 0;
  const absPaise = Math.abs(Math.trunc(paise));
  const rupees = Math.floor(absPaise / 100);
  const remainderPaise = absPaise % 100;

  const formattedRupees = rupees.toLocaleString('en-IN');
  const sign = isNegative ? '-' : '';

  if (remainderPaise === 0 && !showDecimalsWhenZero) {
    return `${sign}₹${formattedRupees}`;
  }
  const paddedPaise = remainderPaise.toString().padStart(2, '0');
  return `${sign}₹${formattedRupees}.${paddedPaise}`;
}

export interface PartialRepaymentBreakdown {
  principalPaise: Paise;
  previousRepaidPaise: Paise;
  paymentAppliedPaise: Paise;
  newRepaidPaise: Paise;
  newRemainingPaise: Paise;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'SETTLED';
}

export function calculatePartialRepayment(
  principalPaise: Paise,
  previousRepaidPaise: Paise,
  paymentPaise: Paise
): PartialRepaymentBreakdown {
  const currentRemaining = Math.max(0, principalPaise - previousRepaidPaise);
  const paymentAppliedPaise = Math.min(currentRemaining, Math.max(0, paymentPaise));
  const newRepaidPaise = previousRepaidPaise + paymentAppliedPaise;
  const newRemainingPaise = principalPaise - newRepaidPaise;

  let status: 'OPEN' | 'PARTIALLY_PAID' | 'SETTLED' = 'OPEN';
  if (newRemainingPaise === 0) {
    status = 'SETTLED';
  } else if (newRepaidPaise > 0) {
    status = 'PARTIALLY_PAID';
  }

  return {
    principalPaise,
    previousRepaidPaise,
    paymentAppliedPaise,
    newRepaidPaise,
    newRemainingPaise,
    status,
  };
}

