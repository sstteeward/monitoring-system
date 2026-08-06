import * as webpush from 'npm:web-push@3.6.7';
import { createClient } from 'npm:@supabase/supabase-js@2.97.0';

interface NotificationRecord {
  id: string;
  user_id: string;
  title: string;
  message: string;
  type: 'info' | 'warning' | 'success' | 'danger';
}

interface DatabaseWebhookPayload {
  type: 'INSERT' | 'UPDATE' | 'DELETE';
  table: string;
  schema: string;
  record: NotificationRecord;
}

interface PushSubscriptionRecord {
  id: string;
  endpoint: string;
  p256dh: string;
  auth: string;
}

function getPushStatusCode(error: unknown) {
  if (
    typeof error === 'object'
    && error !== null
    && 'statusCode' in error
    && typeof error.statusCode === 'number'
  ) {
    return error.statusCode;
  }

  return undefined;
}

function getProvidedApiKey(request: Request) {
  const authorization = request.headers.get('authorization');
  if (authorization?.toLowerCase().startsWith('bearer ')) {
    return authorization.slice(7).trim();
  }

  return request.headers.get('apikey');
}

Deno.serve(async (request) => {
  const serviceRoleKey = Deno.env.get('SUPABASE_SERVICE_ROLE_KEY');
  const supabaseUrl = Deno.env.get('SUPABASE_URL');
  const vapidPublicKey = Deno.env.get('WEB_PUSH_VAPID_PUBLIC_KEY');
  const vapidPrivateKey = Deno.env.get('WEB_PUSH_VAPID_PRIVATE_KEY');
  const vapidSubject = Deno.env.get('WEB_PUSH_VAPID_SUBJECT');

  if (!serviceRoleKey || !supabaseUrl || !vapidPublicKey || !vapidPrivateKey || !vapidSubject) {
    console.error('Web push notification function is missing required secrets.');
    return Response.json({ error: 'Push notification service is not configured.' }, { status: 500 });
  }

  if (getProvidedApiKey(request) !== serviceRoleKey) {
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

  webpush.setVapidDetails(vapidSubject, vapidPublicKey, vapidPrivateKey);

  const supabase = createClient(supabaseUrl, serviceRoleKey, {
    auth: { autoRefreshToken: false, persistSession: false },
  });

  const { data: subscriptions, error } = await supabase
    .from('push_subscriptions')
    .select('id, endpoint, p256dh, auth')
    .eq('user_id', payload.record.user_id);

  if (error) {
    console.error('Unable to load push subscriptions:', error);
    return Response.json({ error: 'Unable to load subscriptions.' }, { status: 500 });
  }

  const notificationPayload = JSON.stringify({
    title: payload.record.title,
    body: payload.record.message,
    tag: `notification-${payload.record.id}`,
    url: '/',
  });

  const results = await Promise.all((subscriptions as PushSubscriptionRecord[] ?? []).map(async (subscription) => {
    try {
      await webpush.sendNotification({
        endpoint: subscription.endpoint,
        keys: { p256dh: subscription.p256dh, auth: subscription.auth },
      }, notificationPayload, { TTL: 60 * 60 * 24 });
      return { subscriptionId: subscription.id, delivered: true };
    } catch (pushError: unknown) {
      const statusCode = getPushStatusCode(pushError);
      console.error('Push delivery failed:', { subscriptionId: subscription.id, statusCode });

      if (statusCode === 404 || statusCode === 410) {
        await supabase.from('push_subscriptions').delete().eq('id', subscription.id);
      }

      return { subscriptionId: subscription.id, delivered: false };
    }
  }));

  return Response.json({ delivered: results.filter((result) => result.delivered).length, attempted: results.length });
});
