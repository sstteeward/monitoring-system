/**
 * Device Fingerprinting Utility
 *
 * Generates a stable, deterministic fingerprint hash from passive browser
 * signals. Zero external dependencies — uses the Web Crypto API for hashing.
 *
 * The fingerprint stays constant for the same browser + device combination.
 * It changes when the hardware or browser changes significantly (e.g. GPU
 * driver update + browser major version bump), which naturally registers as
 * a "new device" in the system.
 */

// ─── Types ───────────────────────────────────────────────────────────────────

export interface DeviceComponents {
    screenResolution: string;
    colorDepth: number;
    timezone: string;
    timezoneOffset: number;
    userAgent: string;
    platform: string;
    hardwareConcurrency: number;
    deviceMemory: number | null;
    maxTouchPoints: number;
    languages: string;
    webglRenderer: string;
    webglVendor: string;
    canvasHash: string;
}

// ─── Component Collectors ────────────────────────────────────────────────────

/**
 * Collects all raw device signals used for fingerprinting.
 */
export function getDeviceComponents(): DeviceComponents {
    return {
        screenResolution: `${screen.width}x${screen.height}`,
        colorDepth: screen.colorDepth,
        timezone: Intl.DateTimeFormat().resolvedOptions().timeZone,
        timezoneOffset: new Date().getTimezoneOffset(),
        userAgent: navigator.userAgent,
        platform: navigator.platform || 'unknown',
        hardwareConcurrency: navigator.hardwareConcurrency || 0,
        deviceMemory: (navigator as any).deviceMemory ?? null,
        maxTouchPoints: navigator.maxTouchPoints || 0,
        languages: (navigator.languages || [navigator.language]).join(','),
        webglRenderer: getWebGLRenderer(),
        webglVendor: getWebGLVendor(),
        canvasHash: getCanvasFingerprint(),
    };
}

/**
 * Returns the unmasked WebGL renderer string (e.g. "ANGLE (NVIDIA GeForce GTX 1070 ...").
 */
function getWebGLRenderer(): string {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'no-webgl';
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return 'no-debug-info';
        return (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_RENDERER_WEBGL) || 'unknown';
    } catch {
        return 'error';
    }
}

/**
 * Returns the unmasked WebGL vendor string (e.g. "Google Inc. (NVIDIA)").
 */
function getWebGLVendor(): string {
    try {
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        if (!gl) return 'no-webgl';
        const debugInfo = (gl as WebGLRenderingContext).getExtension('WEBGL_debug_renderer_info');
        if (!debugInfo) return 'no-debug-info';
        return (gl as WebGLRenderingContext).getParameter(debugInfo.UNMASKED_VENDOR_WEBGL) || 'unknown';
    } catch {
        return 'error';
    }
}

/**
 * Generates a canvas-based fingerprint. Different rendering engines produce
 * subtly different pixel outputs for the same drawing commands, creating a
 * unique-ish signature per browser/OS/GPU combination.
 */
function getCanvasFingerprint(): string {
    try {
        const canvas = document.createElement('canvas');
        canvas.width = 200;
        canvas.height = 50;
        const ctx = canvas.getContext('2d');
        if (!ctx) return 'no-2d-context';

        // Draw text with specific styling that reveals rendering engine differences
        ctx.textBaseline = 'top';
        ctx.font = '14px Arial';
        ctx.fillStyle = '#f60';
        ctx.fillRect(125, 1, 62, 20);
        ctx.fillStyle = '#069';
        ctx.fillText('SIL Monitor 🔒', 2, 15);
        ctx.fillStyle = 'rgba(102, 204, 0, 0.7)';
        ctx.fillText('Device FP', 4, 35);

        // Use a simple hash of the data URL rather than the full base64
        const dataUrl = canvas.toDataURL();
        return simpleHash(dataUrl);
    } catch {
        return 'error';
    }
}

// ─── Hashing ─────────────────────────────────────────────────────────────────

/**
 * Quick synchronous string hash (djb2). Used only for the canvas sub-hash.
 */
function simpleHash(str: string): string {
    let hash = 5381;
    for (let i = 0; i < str.length; i++) {
        hash = ((hash << 5) + hash) + str.charCodeAt(i);
        hash |= 0; // Convert to 32-bit integer
    }
    return (hash >>> 0).toString(16);
}

/**
 * Generates a SHA-256 hex digest of the combined device components.
 * Falls back to a djb2 hash if SubtleCrypto is unavailable (e.g. non-HTTPS).
 */
async function sha256(message: string): Promise<string> {
    try {
        const msgBuffer = new TextEncoder().encode(message);
        const hashBuffer = await crypto.subtle.digest('SHA-256', msgBuffer);
        const hashArray = Array.from(new Uint8Array(hashBuffer));
        return hashArray.map(b => b.toString(16).padStart(2, '0')).join('');
    } catch {
        // Fallback: SubtleCrypto requires a secure context (HTTPS)
        return simpleHash(message);
    }
}

// ─── Public API ──────────────────────────────────────────────────────────────

/**
 * Generates a deterministic device fingerprint as a hex SHA-256 hash.
 *
 * The fingerprint is derived from screen, GPU, canvas, timezone, and browser
 * metadata. It does NOT include volatile data like cookies or IP addresses.
 *
 * @returns A 64-character hex string (SHA-256) or a shorter djb2 fallback hash.
 */
export async function generateDeviceFingerprint(): Promise<string> {
    const components = getDeviceComponents();

    // Concatenate all signals into a single deterministic string
    const raw = [
        components.screenResolution,
        components.colorDepth,
        components.timezone,
        components.timezoneOffset,
        components.userAgent,
        components.platform,
        components.hardwareConcurrency,
        components.deviceMemory ?? 'null',
        components.maxTouchPoints,
        components.languages,
        components.webglRenderer,
        components.webglVendor,
        components.canvasHash,
    ].join('|||');

    return sha256(raw);
}

/**
 * Builds a short human-readable device label for display purposes.
 * Example: "Chrome 130 / Windows / NVIDIA GeForce GTX 1070"
 */
export function getDeviceLabel(components?: DeviceComponents): string {
    const c = components || getDeviceComponents();

    // Extract browser name + major version from userAgent
    let browser = 'Unknown Browser';
    const chromeMatch = c.userAgent.match(/Chrome\/(\d+)/);
    const firefoxMatch = c.userAgent.match(/Firefox\/(\d+)/);
    const safariMatch = c.userAgent.match(/Version\/(\d+).*Safari/);
    const edgeMatch = c.userAgent.match(/Edg\/(\d+)/);

    if (edgeMatch) browser = `Edge ${edgeMatch[1]}`;
    else if (chromeMatch) browser = `Chrome ${chromeMatch[1]}`;
    else if (firefoxMatch) browser = `Firefox ${firefoxMatch[1]}`;
    else if (safariMatch) browser = `Safari ${safariMatch[1]}`;

    // Extract OS
    let os = c.platform;
    if (c.userAgent.includes('Windows')) os = 'Windows';
    else if (c.userAgent.includes('Mac OS')) os = 'macOS';
    else if (c.userAgent.includes('Android')) os = 'Android';
    else if (c.userAgent.includes('iPhone') || c.userAgent.includes('iPad')) os = 'iOS';
    else if (c.userAgent.includes('Linux')) os = 'Linux';

    // Shorten GPU name
    let gpu = c.webglRenderer;
    if (gpu.length > 40) {
        // Extract the parenthetical GPU name from ANGLE strings
        const angleMatch = gpu.match(/\((.+?)\)/);
        gpu = angleMatch ? angleMatch[1] : gpu.substring(0, 40) + '…';
    }

    return `${browser} / ${os} / ${gpu}`;
}
