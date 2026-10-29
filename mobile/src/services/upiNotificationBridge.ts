import { apiFetch } from './api';
import { IngestionDraftDto } from '../types/ledger';

/**
 * Whitelisted Indian UPI & Banking Android package names monitored by
 * FinTrack's `NotificationListenerService` (Play Store compliant — NO `READ_SMS` permission needed).
 */
export const ALLOWED_UPI_PACKAGES: Record<string, string> = {
  'com.google.android.apps.nbu.paisa.user': 'Google Pay (GPay)',
  'com.phonepe.app': 'PhonePe',
  'net.one97.paytm': 'Paytm UPI',
  'in.org.npci.upiapp': 'BHIM UPI',
  'com.sbi.lotusintouch': 'SBI YONO / Bank Alert',
  'com.snapwork.hdfc': 'HDFC Bank Alert',
  'com.csam.icici.bank.imobile': 'ICICI iMobile Alert',
};

export interface AndroidStatusBarNotificationEvent {
  packageName: string;
  title: string;
  body: string;
  postedAtMs: number;
}

/**
 * Filters out non-financial or promotional notifications before forwarding
 * to the FinTrack backend deduplication engine.
 */
export function isFinancialUpiNotification(
  event: AndroidStatusBarNotificationEvent
): boolean {
  if (!ALLOWED_UPI_PACKAGES[event.packageName]) {
    return false;
  }
  const combined = `${event.title} ${event.body}`;
  const hasRupeeAmount = /(?:₹|Rs\.?|INR)\s*[0-9,]+/i.test(combined);
  const hasTransactionVerb =
    /\b(paid|sent|debited|received|credited|transferred)\b/i.test(combined);
  return hasRupeeAmount && hasTransactionVerb;
}

/**
 * Forwards a verified Android UPI status-bar notification to `/api/v1/ingestion/upi-notification`
 * where SHA-256 fingerprint deduplication prevents duplicate GPay + Bank drafts.
 */
export async function forwardUpiNotificationToBackend(
  workspaceId: string,
  event: AndroidStatusBarNotificationEvent
): Promise<{
  duplicateSkipped: boolean;
  reason?: string;
  fingerprint: string;
  draft: IngestionDraftDto;
} | null> {
  if (!isFinancialUpiNotification(event)) {
    return null;
  }

  return apiFetch('/ingestion/upi-notification', {
    method: 'POST',
    workspaceId,
    body: event,
  });
}
