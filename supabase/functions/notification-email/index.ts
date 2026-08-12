import { createClient } from 'npm:@supabase/supabase-js@2.97.0';

interface NotificationRecord {
  id: string;
  user_id: string;
  title: string;
  message: string;
}

interface DatabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: NotificationRecord;
}

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

Deno.serve(async (request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const brevoApiKey = Deno.env.get('BREVO_API_KEY');
  const senderEmail = Deno.env.get('BREVO_SENDER_EMAIL');
  const senderName = Deno.env.get('BREVO_SENDER_NAME') ?? 'SIL Monitoring System';
  const webhookSecret = Deno.env.get('NOTIFICATION_EMAIL_WEBHOOK_SECRET');

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

  if (payload.type !== 'INSERT' || payload.schema !== 'public' || payload.table !== 'user_notifications' || !payload.record?.user_id) {
    return Response.json({ ignored: true });
  }

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: profile, error: profileError } = await supabase
    .from('profiles')
    .select('email, first_name, last_name')
    .eq('auth_user_id', payload.record.user_id)
    .maybeSingle();

  if (profileError) {
    console.error('Unable to load notification recipient:', profileError);
    return Response.json({ error: 'Unable to load recipient.' }, { status: 500 });
  }

  if (!profile?.email) {
    console.warn('Skipping email because the user has no profile email.', { userId: payload.record.user_id });
    return Response.json({ skipped: 'missing_recipient_email' });
  }

  const recipientName = [profile.first_name, profile.last_name].filter(Boolean).join(' ').trim() || undefined;
  const title = escapeHtml(payload.record.title);
  const message = escapeHtml(payload.record.message).replace(/\n/g, '<br>');

  const brevoResponse = await fetch('https://api.brevo.com/v3/smtp/email', {
    method: 'POST',
    headers: {
      accept: 'application/json',
      'api-key': brevoApiKey,
      'content-type': 'application/json',
    },
    body: JSON.stringify({
      sender: { email: senderEmail, name: senderName },
      to: [{ email: profile.email, ...(recipientName ? { name: recipientName } : {}) }],
      subject: payload.record.title,
      htmlContent: `<!doctype html><html><body style="font-family:Arial,sans-serif;color:#1f2937;line-height:1.5"><h2 style="margin-bottom:12px">${title}</h2><p>${message}</p><p style="margin-top:24px;color:#6b7280;font-size:13px">SIL Monitoring System</p></body></html>`,
    }),
  });

  if (!brevoResponse.ok) {
    const responseBody = await brevoResponse.text();
    console.error('Brevo email delivery failed:', { status: brevoResponse.status, responseBody });
    return Response.json({ error: 'Brevo rejected the email.' }, { status: 502 });
  }

  const result = await brevoResponse.json();
  return Response.json({ delivered: true, messageId: result.messageId });
});
