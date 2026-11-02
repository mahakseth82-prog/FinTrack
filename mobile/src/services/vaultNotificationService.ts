import * as Notifications from 'expo-notifications';
import { Platform } from 'react-native';

// Set notification handler to present notifications immediately even if app is in foreground
Notifications.setNotificationHandler({
  handleNotification: async () => ({
    shouldShowAlert: true,
    shouldPlaySound: true,
    shouldSetBadge: true,
    shouldShowBanner: true,
    shouldShowList: true,
  }),
});

/**
 * Configure Android notification channels for high-priority renewal reminders.
 */
export async function setupVaultNotificationChannels(): Promise<void> {
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('vault-renewals', {
      name: 'Vault Document Renewals',
      description: 'Alerts for upcoming insurance, warranty, and document renewals',
      importance: Notifications.AndroidImportance.HIGH,
      vibrationPattern: [0, 250, 250, 250],
      lightColor: '#0284C7',
      sound: 'default',
    });
  }
}

/**
 * Schedules a local push notification 10 days prior to the document's expiry date at 10:00 AM local time.
 * Returns the scheduled notificationId, or null if date is in the past or permissions are denied.
 */
export async function scheduleDocumentRenewalReminder(params: {
  documentId?: string;
  title: string;
  expiryDateStr: string; // YYYY-MM-DD
}): Promise<string | null> {
  try {
    const { status: existingStatus } = await Notifications.getPermissionsAsync();
    let finalStatus = existingStatus;

    if (existingStatus !== 'granted') {
      const { status } = await Notifications.requestPermissionsAsync();
      finalStatus = status;
    }

    if (finalStatus !== 'granted') {
      console.warn('Notification permissions not granted');
      return null;
    }

    await setupVaultNotificationChannels();

    const [y, m, d] = params.expiryDateStr.split('-').map(Number);
    if (!y || !m || !d) return null;

    // Target expiry date at 10:00 AM
    const expiryDate = new Date(y, m - 1, d, 10, 0, 0, 0);

    // 10 days prior at 10:00 AM
    const reminderDate = new Date(expiryDate.getTime() - 10 * 24 * 60 * 60 * 1000);

    const now = new Date();
    if (reminderDate.getTime() <= now.getTime()) {
      // 10 days prior has already passed
      return null;
    }

    const formattedExpiryDate = expiryDate.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    });

    const notificationId = await Notifications.scheduleNotificationAsync({
      content: {
        title: 'Document Renewal Alert ⚠️',
        body: `Your "${params.title}" expires in 10 days on ${formattedExpiryDate}. Tap to view document details.`,
        data: {
          documentId: params.documentId,
          type: 'VAULT_RENEWAL',
        },
        sound: 'default',
      },
      trigger: {
        type: Notifications.SchedulableTriggerInputTypes.DATE,
        date: reminderDate,
        channelId: 'vault-renewals',
      },
    });

    return notificationId;
  } catch (err) {
    console.warn('Failed to schedule renewal reminder:', err);
    return null;
  }
}

/**
 * Cancels a previously scheduled notification when a document is deleted or renewed.
 */
export async function cancelDocumentRenewalReminder(
  notificationId?: string | null
): Promise<void> {
  if (!notificationId) return;
  try {
    await Notifications.cancelScheduledNotificationAsync(notificationId);
  } catch (err) {
    console.warn('Failed to cancel renewal notification:', err);
  }
}
