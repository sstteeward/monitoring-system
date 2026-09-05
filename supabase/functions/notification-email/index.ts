import { createClient } from 'npm:@supabase/supabase-js@2.97.0';

/**
 * Sends the email for one in-app notification.
 *
 * Invoked by the `notification_email` database webhook on every INSERT into
 * public.user_notifications. The webhook payload is treated as a signal only —
 * the row is re-read with the service role, so a forged payload cannot make this
 * function email arbitrary text to an arbitrary address.
 *
 * Delivery is claimed atomically (email_sent false -> true) before the provider
 * call, so a webhook retry, a duplicate database event or a manual re-invocation
 * can never send the same notification twice. A provider failure releases the
 * claim and records the error, leaving the row eligible for a retry — the in-app
 * notification itself is never rolled back because email failed.
 */

interface NotificationRecord {
  id: string;
}

interface DatabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: NotificationRecord;
}

const APP_NAME = 'Asian College SIL/OJT Monitoring System';

function getProvidedApiKey(request: Request) {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return request.headers.get('apikey');
}

function secretsMatch(expected: string | undefined, actual: string | null) {
  if (!expected || !actual || expected.length !== actual.length) return false;

  let mismatch = 0;
  for (let index = 0; index < expected.length; index += 1) {
    mismatch |= expected.charCodeAt(index) ^ actual.charCodeAt(index);
  }

  return mismatch === 0;
}

function escapeHtml(value: string) {
  return value
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#039;');
}

/** Human label for the notification category, used in the subject line. */
const CATEGORY_LABEL: Record<string, string> = {
  announcement: 'Announcement',
  journal_approved: 'Journal Approved',
  journal_rejected: 'Journal Rejected',
  journal_revision: 'Revision Requested',
  attendance: 'Attendance Update',
  assignment: 'Assignment Update',
  company: 'Company Update',
  system: 'System Notice',
  reminder: 'Reminder',
  general: 'Notification',
};

/** Each portal lives under its own path, so the link lands where the user works. */
const PORTAL_PATH: Record<string, string> = {
  admin: '/admin',
  coordinator: '/coordinator',
  adviser: '/adviser',
  student: '/student',
  company: '/company',
};

function buildPortalUrl(baseUrl: string, role: string | null) {
  const root = baseUrl.replace(/\/+$/, '');
  return `${root}${PORTAL_PATH[role ?? ''] ?? ''}`;
}

/**
 * Responsive HTML email. Deliberately carries only the notification's own title
 * and message — no ids, no record internals, nothing about other users.
 */
function renderEmail(options: {
  recipientName: string;
  title: string;
  message: string;
  categoryLabel: string;
  createdAt: string;
  actionUrl: string;
}) {
  const title = escapeHtml(options.title);
  const message = escapeHtml(options.message).replace(/\n/g, '<br>');
  const name = escapeHtml(options.recipientName);
  const category = escapeHtml(options.categoryLabel);
  const date = escapeHtml(options.createdAt);

  return `<!doctype html>
<html lang="en">
<head>
<meta charset="utf-8">
<meta name="viewport" content="width=device-width,initial-scale=1">
<title>${title}</title>
</head>
<body style="margin:0;padding:0;background:#f1f5f9;">
  <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="background:#f1f5f9;padding:24px 12px;">
    <tr><td align="center">
      <table role="presentation" width="100%" cellpadding="0" cellspacing="0" style="max-width:560px;background:#ffffff;border-radius:14px;overflow:hidden;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,Arial,sans-serif;">
        <tr><td style="background:#047857;padding:20px 28px;">
          <div style="color:#ffffff;font-size:15px;font-weight:700;letter-spacing:.2px;">Asian College</div>
          <div style="color:#a7f3d0;font-size:12px;margin-top:2px;">SIL/OJT Monitoring System</div>
        </td></tr>
        <tr><td style="padding:28px;">
          <div style="display:inline-block;background:#ecfdf5;color:#047857;font-size:11px;font-weight:700;letter-spacing:.6px;text-transform:uppercase;padding:5px 10px;border-radius:999px;">${category}</div>
          <p style="margin:18px 0 6px;color:#334155;font-size:14px;">Hello ${name},</p>
          <h1 style="margin:0 0 14px;color:#0f172a;font-size:20px;line-height:1.35;font-weight:700;">${title}</h1>
          <div style="color:#334155;font-size:14px;line-height:1.7;">${message}</div>
          <table role="presentation" cellpadding="0" cellspacing="0" style="margin:26px 0 6px;">
            <tr><td style="border-radius:10px;background:#047857;">
              <a href="${options.actionUrl}" style="display:inline-block;padding:12px 22px;color:#ffffff;font-size:14px;font-weight:600;text-decoration:none;">View in your portal</a>
            </td></tr>
          </table>
          <p style="margin:18px 0 0;color:#64748b;font-size:12px;">${date}</p>
        </td></tr>
        <tr><td style="padding:18px 28px;background:#f8fafc;border-top:1px solid #e2e8f0;">
          <p style="margin:0;color:#64748b;font-size:12px;line-height:1.6;">
            You are receiving this because email notifications are enabled for your account.
            You can change this in your portal under <strong>Settings &rarr; Notifications</strong>.
          </p>
          <p style="margin:10px 0 0;color:#94a3b8;font-size:11px;">${escapeHtml(APP_NAME)}</p>
        </td></tr>
      </table>
    </td></tr>
  </table>
</body>
</html>`;
}

Deno.serve(async (request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const brevoApiKey = Deno.env.get('BREVO_API_KEY');
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'Asian College SIL';
  const webhookSecret = Deno.env.get('NOTIFICATION_EMAIL_WEBHOOK_SECRET');
  const appBaseUrl = Deno.env.get('APP_BASE_URL') ?? 'https://sil-monitoring.vercel.app';

  if (!serviceRoleKey || !supabaseUrl || !brevoApiKey || !senderEmail) {
    console.error('Notification email function is missing required secrets.');
    return Response.json({ error: 'Email notification service is not configured.' }, { status: 500 });
  }

  const hasServiceRoleKey = getProvidedApiKey(request) === serviceRoleKey;
  const hasWebhookSecret = secretsMatch(
    webhookSecret,
    request.headers.get('x-notification-webhook-secret'),
  );

  if (!hasServiceRoleKey && !hasWebhookSecret) {
    return Response.json({ error: 'Unauthorized' }, { status: 401 });
  }

  let payload: DatabaseWebhookPayload;
  try {
    payload = await request.json();
  } catch {
    return Response.json({ error: 'Invalid JSON payload.' }, { status: 400 });
  }

  if (
    payload.type !== 'INSERT'
    || payload.schema !== 'public'
    || payload.table !== 'user_notifications'
    || !payload.record?.id
  ) {
    return Response.json({ ignored: true });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const notificationId = payload.record.id;

  // Re-read the row rather than trusting the webhook body.
  const { data: notification, error: notificationError } = await supabase
    .from('user_notifications')
    .select('id, user_id, title, message, notification_type, created_at, email_sent, email_attempts')
    .eq('id', notificationId)
    .maybeSingle();

  if (notificationError) {
    console.error('Unable to load the notification:', notificationError);
    return Response.json({ error: 'Unable to load the notification.' }, { status: 500 });
  }

  if (!notification) {
    return Response.json({ skipped: 'notification_not_found' });
  }

  if (notification.email_sent) {
    return Response.json({ skipped: 'already_sent' });
  }

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email, first_name, last_name, account_type')
    .eq('auth_user_id', notification.user_id)
    .maybeSingle();

  if (profileError) {
    console.error('Unable to load notification recipient:', profileError);
    return Response.json({ error: 'Unable to load recipient.' }, { status: 500 });
  }

  if (!profile?.email) {
    console.warn('Skipping email because the user has no profile email.', { notificationId });
    return Response.json({ skipped: 'missing_recipient_email' });
  }

  // The recipient's own preferences decide whether this category is emailed.
  const { data: emailAllowed, error: preferenceError } = await supabase
    .rpc('notification_email_enabled', {
      p_user_id: notification.user_id,
      p_notification_type: notification.notification_type ?? 'general',
    });

  if (preferenceError) {
    console.error('Unable to read notification preferences:', preferenceError);
    return Response.json({ error: 'Unable to read preferences.' }, { status: 500 });
  }

  if (emailAllowed === false) {
    return Response.json({ skipped: 'email_disabled_by_preference' });
  }

  // Claim the send. Only the caller that flips email_sent false -> true proceeds,
  // so concurrent or repeated invocations cannot both reach the provider.
  const { data: claimed, error: claimError } = await supabase
    .from('user_notifications')
    .update({
      email_sent: true,
      email_sent_at: new Date().toISOString(),
      email_attempts: (notification.email_attempts ?? 0) + 1,
      email_error: null,
    })
    .eq('id', notificationId)
    .eq('email_sent', false)
    .select('id')
    .maybeSingle();

  if (claimError) {
    console.error('Unable to claim the notification for sending:', claimError);
    return Response.json({ error: 'Unable to claim the notification.' }, { status: 500 });
  }

  if (!claimed) {
    return Response.json({ skipped: 'already_claimed' });
  }

  const releaseClaim = async (reason: string) => {
    const { error } = await supabase
      .from('user_notifications')
      .update({ email_sent: false, email_sent_at: null, email_error: reason.slice(0, 500) })
      .eq('id', notificationId);
    if (error) console.error('Unable to release the send claim:', error);
  };

  const recipientName = [profile.first_name, profile.last_name]
    .filter(Boolean).join(' ').trim() || 'there';
  const categoryLabel = CATEGORY_LABEL[notification.notification_type ?? 'general'] ?? 'Notification';

  let brevoResponse: Response;
  try {
    brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
      method: 'POST',
      headers: {
        accept: 'application/json',
        'api-key': brevoApiKey,
        'content-type': 'application/json',
      },
      body: JSON.stringify({
        sender: { email: senderEmail, name: senderName },
        to: [{ email: profile.email, name: recipientName }],
        subject: `[Asian College SIL] ${notification.title}`,
        htmlContent: renderEmail({
          recipientName,
          title: notification.title,
          message: notification.message,
          categoryLabel,
          createdAt: new Date(notification.created_at).toLocaleString('en-US', {
            dateStyle: 'long',
            timeStyle: 'short',
          }),
          actionUrl: buildPortalUrl(appBaseUrl, profile.account_type),
        }),
      }),
    });
  } catch (error) {
    // A network failure must not lose the notification — release the claim so a
    // retry can pick it up.
    console.error('Brevo request failed:', error);
    await releaseClaim(`network_error: ${String(error)}`);
    return Response.json({ error: 'Unable to reach the email provider.' }, { status: 502 });
  }

  if (!brevoResponse.ok) {
    const responseBody = await brevoResponse.text();
    console.error('Brevo email delivery failed:', { status: brevoResponse.status, responseBody });
    await releaseClaim(`brevo_${brevoResponse.status}: ${responseBody}`);
    return Response.json({ error: 'Brevo rejected the email.' }, { status: 502 });
  }

  const result = await brevoResponse.json();
  return Response.json({ delivered: true, messageId: result.messageId });
});
