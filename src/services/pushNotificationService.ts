import { supabase } from '../lib/supabaseClient';

const VAPID_PUBLIC_KEY = (import.meta.env.VITE_WEB_PUSH_PUBLIC_KEY as string | undefined)?.trim();

export interface PushNotificationStatus {
    supported: boolean;
    configured: boolean;
    enabled: boolean;
    permission: NotificationPermission | 'unsupported';
}

function isSupported() {
    return typeof window !== 'undefined'
        && 'serviceWorker' in navigator
        && 'PushManager' in window
        && 'Notification' in window;
}

function base64UrlToArrayBuffer(value: string) {
    const base64 = value.replace(/-/g, '+').replace(/_/g, '/');
    const padding = '='.repeat((4 - (base64.length % 4)) % 4);
    const raw = atob(base64 + padding);
    const bytes = new Uint8Array(raw.length);

    for (let index = 0; index < raw.length; index += 1) {
        bytes[index] = raw.charCodeAt(index);
    }

    return bytes.buffer;
}

function arrayBufferToBase64(value: ArrayBuffer | null) {
    if (!value) return null;

    const bytes = new Uint8Array(value);
    let binary = '';
    for (const byte of bytes) binary += String.fromCharCode(byte);
    return btoa(binary);
}

async function getRegistration(registerIfMissing = false) {
    if (!isSupported()) return null;

    const existingRegistration = await navigator.serviceWorker.getRegistration('/');
    if (existingRegistration || !registerIfMissing) return existingRegistration ?? null;

    return navigator.serviceWorker.register('/sw.js', { scope: '/' });
}

async function saveSubscription(userId: string, subscription: PushSubscription) {
    const p256dh = arrayBufferToBase64(subscription.getKey('p256dh'));
    const auth = arrayBufferToBase64(subscription.getKey('auth'));

    if (!p256dh || !auth) {
        throw new Error('The browser returned an incomplete push subscription.');
    }

    const { error } = await supabase
        .from('push_subscriptions')
        .upsert({
            user_id: userId,
            endpoint: subscription.endpoint,
            p256dh,
            auth,
            user_agent: navigator.userAgent.slice(0, 512),
            updated_at: new Date().toISOString(),
        }, { onConflict: 'endpoint' });

    if (error) throw error;
}

async function getCurrentUserId() {
    const { data: { user }, error } = await supabase.auth.getUser();
    if (error) throw error;
    if (!user) throw new Error('Sign in before enabling browser alerts.');
    return user.id;
}

export const pushNotificationService = {
    isSupported,

    isConfigured() {
        return Boolean(VAPID_PUBLIC_KEY);
    },

    async getStatus(): Promise<PushNotificationStatus> {
        if (!isSupported()) {
            return { supported: false, configured: Boolean(VAPID_PUBLIC_KEY), enabled: false, permission: 'unsupported' };
        }

        const registration = await getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;

        return {
            supported: true,
            configured: Boolean(VAPID_PUBLIC_KEY),
            enabled: Boolean(subscription),
            permission: Notification.permission,
        };
    },

    async enable() {
        if (!isSupported()) throw new Error('This browser does not support push notifications.');
        if (!VAPID_PUBLIC_KEY) throw new Error('Browser alerts have not been configured yet.');

        const userId = await getCurrentUserId();
        const permission = await Notification.requestPermission();

        if (permission !== 'granted') {
            throw new Error('Allow notifications in your browser to receive alerts while you are away.');
        }

        const registration = await getRegistration(true);
        if (!registration) throw new Error('Unable to register the notification service.');

        const existingSubscription = await registration.pushManager.getSubscription();
        const subscription = existingSubscription ?? await registration.pushManager.subscribe({
            userVisibleOnly: true,
            applicationServerKey: base64UrlToArrayBuffer(VAPID_PUBLIC_KEY),
        });

        await saveSubscription(userId, subscription);
    },

    async disable() {
        if (!isSupported()) return;

        const registration = await getRegistration();
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (!subscription) return;

        const endpoint = subscription.endpoint;
        await subscription.unsubscribe();

        const { data: { user } } = await supabase.auth.getUser();
        if (user) {
            const { error } = await supabase
                .from('push_subscriptions')
                .delete()
                .eq('user_id', user.id)
                .eq('endpoint', endpoint);
            if (error) throw error;
        }
    },

    async syncExistingSubscription(userId: string) {
        if (!isSupported() || !VAPID_PUBLIC_KEY || Notification.permission !== 'granted') return;

        const registration = await getRegistration(true);
        const subscription = registration ? await registration.pushManager.getSubscription() : null;
        if (subscription) await saveSubscription(userId, subscription);
    },
};
