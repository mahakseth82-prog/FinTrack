/**
 * FinTrack — Integer Paise Math Utility (Golden Rule #2)
 *
 * All monetary amounts in FinTrack are stored and calculated in integer PAISE
 * (₹1 = 100 paise) so floating-point precision bugs (like 0.1 + 0.2 = 0.30000000000000004)
 * never corrupt a user's ledger.
 */

export type Paise = number; // Safe integer up to ₹9,00,71,99,25,47,409.91

/**
 * Converts a Rupee value (number or string like "250.50" or "2,000") into exact integer paise.
 */
export function rupeesToPaise(rupeesInput: number | string): Paise {
  if (typeof rupeesInput === 'number') {
    if (!Number.isFinite(rupeesInput) || rupeesInput < 0) {
      throw new Error(`Invalid rupee amount: ${rupeesInput}`);
    }
    return Math.round(rupeesInput * 100);
  }

  const cleaned = rupeesInput.replace(/[₹,\s]/g, '').trim();
  if (!/^\d+(\.\d{1,2})?$/.test(cleaned)) {
    throw new Error(`Invalid rupee string format: "${rupeesInput}"`);
  }

  const [wholePart, decimalPart = ''] = cleaned.split('.');
  const paddedDecimal = (decimalPart + '00').slice(0, 2);
  const paise = parseInt(wholePart, 10) * 100 + parseInt(paddedDecimal, 10);

  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Amount exceeds safe integer limit: ${rupeesInput}`);
  }
  return paise;
}

/**
 * Converts integer paise back to a decimal Rupee number for display only.
 */
export function paiseToRupees(paise: Paise): number {
  if (!Number.isSafeInteger(paise)) {
    throw new Error(`Paise value must be a safe integer, got: ${paise}`);
  }
  return paise / 100;
}

/**
 * Formats integer paise into Indian Rupee format (e.g. 200000 -> "₹2,000", 25050 -> "₹250.50")
 */
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

/**
 * Deterministic Partial Repayment Calculator (Golden Rule #1: Code Calculates)
 * Given principal_paise, already_repaid_paise, and new_payment_paise, returns the
 * updated repayment state and obligation status.
 */
export interface RepaymentCalculationResult {
  principalPaise: Paise;
  previousRepaidPaise: Paise;
  paymentAppliedPaise: Paise;
  newRepaidPaise: Paise;
  newRemainingPaise: Paise;
  overpaymentPaise: Paise;
  status: 'OPEN' | 'PARTIALLY_PAID' | 'SETTLED';
}

export function calculatePartialRepayment(
  principalPaise: Paise,
  previousRepaidPaise: Paise,
  paymentPaise: Paise
): RepaymentCalculationResult {
  if (principalPaise <= 0) {
    throw new Error('Principal amount in paise must be greater than 0');
  }
  if (previousRepaidPaise < 0 || previousRepaidPaise > principalPaise) {
    throw new Error('Invalid previous repaid paise state');
  }
  if (paymentPaise <= 0) {
    throw new Error('Repayment amount in paise must be greater than 0');
  }

  const currentRemainingPaise = principalPaise - previousRepaidPaise;
  const paymentAppliedPaise = Math.min(currentRemainingPaise, paymentPaise);
  const overpaymentPaise = Math.max(0, paymentPaise - currentRemainingPaise);
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
    overpaymentPaise,
    status,
  };
}

