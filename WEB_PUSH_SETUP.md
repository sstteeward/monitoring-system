# Web Push Notification Setup

This implementation keeps the in-app notification history and adds browser push alerts. Once a signed-in user turns on **Browser Alerts**, they can receive alerts while the SIL site is closed or they are logged out.

## 1. Generate a VAPID key pair

Run this on a trusted development machine. Keep the private key secret.

```powershell
npx web-push generate-vapid-keys --json
```

## 2. Configure the web app

Add the public key to the environment values used by the Vite deployment, then rebuild and redeploy the web app.

```text
VITE_WEB_PUSH_PUBLIC_KEY=<publicKey from the generated pair>
```

## 3. Configure Supabase secrets

Set these as Edge Function secrets. `SUPABASE_URL` and `SUPABASE_SERVICE_ROLE_KEY` are supplied by Supabase automatically; do not put the service-role key in the web app.

```powershell
supabase secrets set WEB_PUSH_VAPID_PUBLIC_KEY=<publicKey>
supabase secrets set WEB_PUSH_VAPID_PRIVATE_KEY=<privateKey>
supabase secrets set WEB_PUSH_VAPID_SUBJECT=mailto:notifications@your-domain.example
```

## 4. Create subscription storage

Run [supabase_web_push_notifications.sql](supabase_web_push_notifications.sql) once in the Supabase SQL Editor. It creates the subscription table with policies that only let a user manage their own browser subscriptions.

## 5. Deploy the Edge Function

```powershell
supabase functions deploy web-push-notification
```

## 6. Create the database webhook

In **Supabase Dashboard → Integrations → Database Webhooks**, create a webhook with these values:

| Setting | Value |
| --- | --- |
| Table | `public.user_notifications` |
| Event | `INSERT` |
| Type | Supabase Edge Function |
| Function | `web-push-notification` |
| Method | `POST` |
| Timeout | `1000` ms |
| Authentication | Add the service-key authorization header |

The function checks that service-key header itself. This is important because the database webhook, not an arbitrary browser request, is allowed to send alerts.

## Test

1. Deploy the web app over HTTPS.
2. Sign in as a test user and turn on **Browser Alerts** in Settings. Approve the browser permission prompt.
3. Insert or create a `user_notifications` row for that user.
4. Close the SIL tab and confirm the operating-system/browser alert appears.

If a device has no network connection, the browser push service normally delivers the alert after it reconnects. On iPhone/iPad, browser push support requires a supported browser and the site may need to be installed as a Home Screen web app.

For shared devices, users should turn Browser Alerts off before signing out so the next person does not continue receiving their alerts on that device.
