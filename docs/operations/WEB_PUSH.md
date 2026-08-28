# LensAlert Web Push

SahamLens uses standards-based Web Push with VAPID. It does not require Firebase or a third-party notification SDK.

## Production setup

1. Generate one stable VAPID key pair:

   ```bash
   node scripts/generate-web-push-vapid.mjs
   ```

2. Store the three emitted values in the production secret/environment store:

   - `WEB_PUSH_VAPID_PUBLIC_KEY`
   - `WEB_PUSH_VAPID_PRIVATE_KEY`
   - `WEB_PUSH_VAPID_SUBJECT` (`mailto:` or `https://` contact URI)

3. Apply database migration `021_web_push_notifications.sql` before deploying application code.

4. Keep the existing QStash `watchlist-alert` schedule active. The scheduled route evaluates alerts, marks newly triggered alerts, and dispatches Web Push deliveries.

Never rotate the VAPID key pair casually. Existing browser subscriptions are bound to the public application server key; rotating it requires users to subscribe again.

## User behavior

- Android/desktop: open LensWatch and press **Aktifkan Notifikasi HP**.
- iPhone/iPad: install SahamLens using **Share → Add to Home Screen**, open the installed web app, then enable notifications.
- Disabling notifications in LensWatch unsubscribes that browser and disables its server-side endpoint.

The notification payload is deliberately factual: symbol/trigger context and the alert message. It does not convert research alerts into buy/sell advice.

## Delivery safety

- Each `(alert_id, subscription_id)` is reserved once in `push_delivery_log`, preventing duplicate dispatch if scheduler/manual checks overlap.
- HTTP `404`/`410` from a push provider disables the expired subscription automatically.
- Missing VAPID configuration is fail-closed: alert evaluation still runs, but no Web Push request is attempted.
- Browser endpoint and encryption keys are stored only to deliver notifications and cascade-delete with the user account.

## Troubleshooting

- `Web Push belum dikonfigurasi di server`: verify all VAPID environment variables are present in the runtime process.
- iOS button says Home Screen is required: Web Push on iOS is available to installed web apps, not a normal Safari tab.
- Notification permission blocked: re-enable notifications for SahamLens in browser/OS settings, then return to LensWatch.
- A device stops receiving notifications: inspect `push_delivery_log.status_code` and `push_subscriptions.failure_count`; `404/410` subscriptions are intentionally disabled.
