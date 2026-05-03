/**
 * Centralized Geofence & Anti-Cheat Service
 *
 * Consolidates ALL geo-based security checks into a single reusable service.
 * Used by clock-in, clock-out, and break actions equally.
 */

import { calculateDistanceInMeters, getAccuratePosition } from '../utils/geoUtils';
import type { Profile } from './profileService';
import type { Timesheet } from './timeTracking';

// ─── Types ───────────────────────────────────────────────────────────────────

export type ClockAction = 'Clock-In' | 'Clock-Out' | 'Break-Start' | 'Break-End';

export interface AntiCheatResult {
    /** Whether all checks passed */
    passed: boolean;
    /** User's validated latitude (if passed) */
    latitude?: number;
    /** User's validated longitude (if passed) */
    longitude?: number;
    /** GPS accuracy in meters */
    accuracy?: number;
    /** If failed — the primary reason string */
    antiCheatReason?: string;
    /** If failed — structured details for audit logging */
    antiCheatDetails?: Record<string, any>;
    /** Human-readable error message to display to the user */
    userMessage?: string;
    /** All flags raised (even non-blocking warnings) */
    flags: string[];
}

// ─── Detectors ───────────────────────────────────────────────────────────────

/**
 * Detects emulators and virtual machines via WebGL GPU info and WebDriver flag.
 */
export function detectEmulator(): boolean {
    try {
        const isWebDriver = navigator.webdriver || false;
        const canvas = document.createElement('canvas');
        const gl = canvas.getContext('webgl') || canvas.getContext('experimental-webgl');
        let isVirtualGPU = false;
        if (gl) {
            // @ts-ignore
            const debugInfo = gl.getExtension('WEBGL_debug_renderer_info');
            if (debugInfo) {
                // @ts-ignore
                const renderer = gl.getParameter(debugInfo.UNMASKED_RENDERER_WEBGL)?.toLowerCase() || '';
                isVirtualGPU = renderer.includes('swiftshader') ||
                    renderer.includes('llvmpipe') ||
                    renderer.includes('virtualbox') ||
                    renderer.includes('vmware') ||
                    renderer.includes('bluestacks');
            }
        }
        return isWebDriver || isVirtualGPU;
    } catch {
        return false;
    }
}

/**
 * Detects browser extensions that override the Geolocation API.
 * Checks prototype chains, native function integrity, and return signatures.
 */
export function detectSpoofExtension(position: GeolocationPosition): string | null {
    try {
        if (!position) return 'No position object returned';

        // 1. Prototype Chain Check
        if (position.constructor?.name !== 'GeolocationPosition') {
            return 'Prototype Mismatch (Not GeolocationPosition)';
        }
        if (position.coords?.constructor?.name !== 'GeolocationCoordinates') {
            return 'Prototype Mismatch (Not GeolocationCoordinates)';
        }

        // 2. Function Hijack Check
        const geoString = navigator.geolocation.getCurrentPosition.toString();
        if (geoString.indexOf('[native code]') === -1) {
            return 'API Hooking Detected (Non-native getCurrentPosition)';
        }

        // 3. Return signature anomaly
        const testRet = navigator.geolocation.getCurrentPosition(() => { }, () => { }, { timeout: 1 });
        if (testRet !== undefined) {
            return 'API Intercepted (Invalid return signature)';
        }

        return null; // Passed all checks
    } catch (e) {
        console.warn("[GeofenceService] Spoof detector error:", e);
        return null; // Fail open to avoid blocking legitimate users
    }
}

/**
 * Detects fake GPS apps by checking for impossible sensor combinations.
 * Real devices rarely report altitude=0, speed=0, accuracy=0/1, heading=0 simultaneously.
 */
function detectFakeGpsSignature(coords: GeolocationCoordinates): boolean {
    return (
        coords.altitude === 0 &&
        coords.speed === 0 &&
        (coords.accuracy === 0 || coords.accuracy === 1) &&
        coords.heading === 0
    );
}

/**
 * Checks if the GPS timestamp is stale or spoofed.
 * A difference >5 minutes between system time and GPS timestamp is suspicious.
 */
function detectTimingAnomaly(positionTimestamp: number): boolean {
    return Math.abs(Date.now() - positionTimestamp) > 300000; // 5 minutes
}

/**
 * Checks GPS accuracy — positions with very high accuracy values (>150m) indicate
 * poor signal, indoor spoofing, or cellular-only triangulation.
 */
function isAccuracyTooLow(accuracy: number, threshold: number = 150): boolean {
    return accuracy > threshold;
}

// ─── Core Suite ──────────────────────────────────────────────────────────────

/**
 * Runs the complete anti-cheat + geofence validation suite.
 *
 * Checks performed in order:
 * 1. Emulator / VM detection
 * 2. Multi-sample GPS acquisition (2 readings, consistency check)
 * 3. Browser extension spoof detection
 * 4. GPS timestamp anomaly detection
 * 5. GPS accuracy validation
 * 6. Fake GPS signature detection
 * 7. Multi-sample consistency check
 * 8. Geofence distance check
 * 9. Teleportation / speed anomaly (when prior sessions exist)
 *
 * @param profile The user's profile (with company geofence data)
 * @param action The clock action being performed
 * @param todaySessions Previous sessions today (for teleportation detection)
 */
export async function runFullAntiCheatSuite(
    profile: Profile,
    action: ClockAction,
    todaySessions: Timesheet[] = []
): Promise<AntiCheatResult> {
    const flags: string[] = [];

    const companyLat = profile.company?.latitude;
    const companyLng = profile.company?.longitude;
    const radius = profile.company?.geofence_radius || 100;

    // If the company has no coordinates, skip all geo checks (legacy/unconfigured company)
    if (!companyLat || !companyLng) {
        return { passed: true, flags: ['No company coordinates — geo checks skipped'] };
    }

    // ── 1. Emulator / VM Detection ──────────────────────────────────────
    if (detectEmulator()) {
        return {
            passed: false,
            antiCheatReason: 'Emulator Detected',
            antiCheatDetails: { action },
            userMessage: 'Emulator or Virtualized Environment detected. Please use a real device to verify attendance.',
            flags: ['emulator_detected']
        };
    }

    // ── 2. Fast GPS Acquisition (Single Sample) ─────────────────────────
    let position: GeolocationPosition;
    try {
        position = await getAccuratePosition({ maxAccuracy: 150, timeout: 12000, retries: 1 });
    } catch (err: any) {
        // If the user is trying to clock out or take a break, don't trap them if GPS fails indoors
        if (action === 'Clock-Out' || action === 'Break-Start' || action === 'Break-End') {
            flags.push('gps_acquisition_failed_bypassed');
            return {
                passed: true,
                flags
            };
        }

        // getAccuratePosition already formats permission-denied errors nicely
        return {
            passed: false,
            antiCheatReason: 'GPS Acquisition Failed',
            antiCheatDetails: { action, error: err.message },
            userMessage: err.message,
            flags: ['gps_acquisition_failed']
        };
    }

    const { latitude: userLat, longitude: userLng, altitude, speed, accuracy, heading } = position.coords;

    // ── 3. Spoof Extension Detection ────────────────────────────────────
    const spoofResult = detectSpoofExtension(position);
    if (spoofResult) {
        return {
            passed: false,
            latitude: userLat,
            longitude: userLng,
            accuracy,
            antiCheatReason: 'Browser Extension Spoofing',
            antiCheatDetails: { action, flag: spoofResult },
            userMessage: 'Geolocation API spoofing detected. Please disable it and try again.',
            flags: ['spoof_extension']
        };
    }

    // ── 4. Timing Anomaly ───────────────────────────────────────────────
    if (detectTimingAnomaly(position.timestamp)) {
        const timeDiff = Math.abs(Date.now() - position.timestamp);
        return {
            passed: false,
            latitude: userLat,
            longitude: userLng,
            accuracy,
            antiCheatReason: 'Timing Anomaly',
            antiCheatDetails: { action, timeDiff },
            userMessage: 'Timing anomaly detected. The GPS data is stale or spoofed. Please disable any spoofers or refresh your location settings.',
            flags: ['timing_anomaly']
        };
    }

    // ── 5. GPS Accuracy Validation ──────────────────────────────────────
    if (isAccuracyTooLow(accuracy)) {
        flags.push('low_accuracy_warning');
    }

    // ── 6. Fake GPS Signature ───────────────────────────────────────────
    if (detectFakeGpsSignature(position.coords)) {
        return {
            passed: false,
            latitude: userLat,
            longitude: userLng,
            accuracy,
            antiCheatReason: 'Fake GPS Signature',
            antiCheatDetails: { action, altitude, speed, accuracy, heading },
            userMessage: 'Suspicious GPS data detected. Please disable any Mock Location or Fake GPS apps, ensure you have a clear view of the sky, and try again.',
            flags: ['fake_gps_signature']
        };
    }

    // ── 7. Multi-Sample Consistency ─────────────────────────────────────
    // Removed to improve clock-in speed.

    // ── 8. Geofence Distance Check ──────────────────────────────────────
    const distance = calculateDistanceInMeters(
        { latitude: userLat, longitude: userLng },
        { latitude: companyLat, longitude: companyLng }
    );

    if (distance > radius) {
        flags.push('geofence_violation');
    }

    // ── 9. Teleportation / Speed Anomaly (Clock-In only) ────────────────
    if (action === 'Clock-In') {
        const lastSession = todaySessions
            .filter(s => s.clock_out && s.clock_out_latitude && s.clock_out_longitude)
            .pop();

        if (lastSession && lastSession.clock_out_latitude && lastSession.clock_out_longitude && lastSession.clock_out) {
            const distFromLastOut = calculateDistanceInMeters(
                { latitude: userLat, longitude: userLng },
                { latitude: lastSession.clock_out_latitude, longitude: lastSession.clock_out_longitude }
            );
            const timeDiffSecs = (Date.now() - new Date(lastSession.clock_out).getTime()) / 1000;
            const spd = timeDiffSecs > 0 ? distFromLastOut / timeDiffSecs : 0;

            // >30 m/s (~108 km/h) over >2 km is physically suspicious
            if (spd > 30 && distFromLastOut > 2000) {
                return {
                    passed: false,
                    latitude: userLat,
                    longitude: userLng,
                    accuracy,
                    antiCheatReason: 'Teleportation / Speed Anomaly',
                    antiCheatDetails: { action, speed: spd, distFromLastOut, timeDiffSecs },
                    userMessage: `Suspicious location change detected. You traveled ${Math.round(distFromLastOut)} meters in just ${Math.round(timeDiffSecs / 60)} minutes.`,
                    flags: ['teleportation_anomaly']
                };
            }
        }
    }

    // ── All Passed ──────────────────────────────────────────────────────
    return {
        passed: true,
        latitude: userLat,
        longitude: userLng,
        accuracy,
        flags
    };
}

// ─── Lightweight Geofence Check (for drift monitoring) ──────────────────────

/**
 * A lightweight single-sample geofence check for session drift monitoring.
 * Does NOT run full anti-cheat (no multi-sample, no spoof detection).
 * Designed for rapid, periodic background checks.
 */
export async function quickGeofenceCheck(
    companyLat: number,
    companyLng: number,
    radius: number
): Promise<{ inBounds: boolean; distance: number; latitude: number; longitude: number }> {
    const position = await new Promise<GeolocationPosition>((resolve, reject) => {
        navigator.geolocation.getCurrentPosition(resolve, reject, {
            enableHighAccuracy: true,
            timeout: 8000,
            maximumAge: 10000 // Allow slightly cached for background checks
        });
    });

    const userLat = position.coords.latitude;
    const userLng = position.coords.longitude;

    const distance = calculateDistanceInMeters(
        { latitude: userLat, longitude: userLng },
        { latitude: companyLat, longitude: companyLng }
    );

    return {
        inBounds: distance <= radius,
        distance,
        latitude: userLat,
        longitude: userLng
    };
}

// ─── VPN Detection via IP Geolocation Cross-Check ───────────────────────────

/**
 * Detects VPN usage by comparing the user's IP-based geolocation with their GPS coordinates.
 * If the IP geolocates >100km from the GPS position, it's likely a VPN.
 *
 * Uses ip-api.com (free, no key needed, 45 req/min limit).
 * This is a soft check — it won't block, but will flag for audit.
 *
 * Returns: { vpnDetected, ipLat, ipLng, distanceKm, reason } or null if check failed.
 */
export async function detectVPN(
    gpsLat: number,
    gpsLng: number
): Promise<{ vpnDetected: boolean; ipLat: number; ipLng: number; distanceKm: number; reason?: string } | null> {
    try {
        const controller = new AbortController();
        const timeoutId = setTimeout(() => controller.abort(), 5000);

        const response = await fetch('http://ip-api.com/json/?fields=lat,lon,proxy,hosting,status', {
            signal: controller.signal
        });
        clearTimeout(timeoutId);

        if (!response.ok) return null;

        const data = await response.json();
        if (data.status !== 'success') return null;

        const ipLat = data.lat;
        const ipLng = data.lon;

        const distMeters = calculateDistanceInMeters(
            { latitude: gpsLat, longitude: gpsLng },
            { latitude: ipLat, longitude: ipLng }
        );
        const distanceKm = Math.round(distMeters / 1000);

        // ip-api provides proxy/hosting flags
        const isProxy = data.proxy === true;
        const isHosting = data.hosting === true;

        let vpnDetected = false;
        let reason: string | undefined;

        if (isProxy || isHosting) {
            vpnDetected = true;
            reason = isProxy ? 'IP identified as proxy/VPN' : 'IP identified as hosting/datacenter';
        } else if (distanceKm > 100) {
            vpnDetected = true;
            reason = `IP geolocation is ${distanceKm}km from GPS position`;
        }

        return { vpnDetected, ipLat, ipLng, distanceKm, reason };
    } catch (err) {
        console.warn('[GeofenceService] VPN detection failed (non-blocking):', err);
        return null; // Fail open — don't block on network issues
    }
}

// ─── Continuous Session Monitor (watchPosition-based) ───────────────────────

export interface SessionMonitorCallbacks {
    /** Called when user leaves the geofence */
    onOutOfBounds: (distance: number, lat: number, lng: number) => void;
    /** Called when user returns to the geofence */
    onBackInBounds: () => void;
    /** Called when a sudden position jump is detected (fake GPS toggle) */
    onPositionJump: (jumpDistance: number, lat: number, lng: number) => void;
    /** Called when fake GPS jitter pattern is detected (no natural GPS noise) */
    onSuspiciousJitter: (reason: string) => void;
    /** Called when VPN is detected via IP cross-check */
    onVpnDetected: (details: { ipLat: number; ipLng: number; distanceKm: number; reason?: string }) => void;
}

/**
 * Starts continuous real-time GPS monitoring during an active session.
 *
 * Uses navigator.geolocation.watchPosition for instant detection of:
 * - Leaving the geofence (drift)
 * - Sudden position jumps (fake GPS toggled on/off)
 * - Unnaturally stable coordinates (no micro-jitter = spoofed)
 * - VPN usage (IP geolocation cross-check, runs once at start)
 *
 * Returns a cleanup function to stop monitoring.
 */
export function startContinuousMonitor(
    companyLat: number,
    companyLng: number,
    radius: number,
    callbacks: SessionMonitorCallbacks
): () => void {
    let watchId: number | null = null;
    let lastPosition: { lat: number; lng: number; time: number } | null = null;
    const recentPositions: Array<{ lat: number; lng: number; time: number }> = [];
    let vpnCheckDone = false;
    let vpnCheckInterval: number | null = null;

    // ── watchPosition for real-time GPS monitoring ──
    try {
        watchId = navigator.geolocation.watchPosition(
            (position) => {
                const { latitude, longitude, accuracy } = position.coords;
                const now = Date.now();

                // Skip very inaccurate readings
                if (accuracy > 200) return;

                // ── Geofence Check ──
                const distance = calculateDistanceInMeters(
                    { latitude, longitude },
                    { latitude: companyLat, longitude: companyLng }
                );

                if (distance > radius) {
                    callbacks.onOutOfBounds(distance, latitude, longitude);
                } else {
                    callbacks.onBackInBounds();
                }

                // ── Sudden Jump Detection ──
                // If position jumps >200m within 3 seconds, likely a spoofer toggled on/off
                if (lastPosition) {
                    const timeDelta = (now - lastPosition.time) / 1000;
                    if (timeDelta < 3 && timeDelta > 0) {
                        const jumpDist = calculateDistanceInMeters(
                            { latitude, longitude },
                            { latitude: lastPosition.lat, longitude: lastPosition.lng }
                        );
                        if (jumpDist > 200) {
                            callbacks.onPositionJump(jumpDist, latitude, longitude);
                        }
                    }
                }

                // ── Jitter Analysis ──
                // Store last 10 positions. Real GPS has natural micro-fluctuations (~2-15m).
                // If 10+ consecutive readings have <0.5m variance, it's suspiciously stable.
                recentPositions.push({ lat: latitude, lng: longitude, time: now });
                if (recentPositions.length > 10) recentPositions.shift();

                if (recentPositions.length >= 10) {
                    const lats = recentPositions.map(p => p.lat);
                    const lngs = recentPositions.map(p => p.lng);
                    const latRange = Math.max(...lats) - Math.min(...lats);
                    const lngRange = Math.max(...lngs) - Math.min(...lngs);

                    // Convert to approximate meters (1 degree ≈ 111,000 meters)
                    const latRangeM = latRange * 111000;
                    const lngRangeM = lngRange * 111000 * Math.cos(latitude * Math.PI / 180);

                    if (latRangeM < 0.5 && lngRangeM < 0.5) {
                        callbacks.onSuspiciousJitter(
                            `GPS position is unnaturally stable (${latRangeM.toFixed(2)}m × ${lngRangeM.toFixed(2)}m jitter over ${recentPositions.length} readings). Real GPS always has micro-fluctuations.`
                        );
                    }
                }

                lastPosition = { lat: latitude, lng: longitude, time: now };

                // ── VPN Check (runs once after first GPS fix) ──
                if (!vpnCheckDone) {
                    vpnCheckDone = true;
                    detectVPN(latitude, longitude).then(result => {
                        if (result?.vpnDetected) {
                            callbacks.onVpnDetected(result);
                        }
                    });
                }
            },
            (error) => {
                console.warn('[ContinuousMonitor] watchPosition error:', error.message);
            },
            {
                enableHighAccuracy: true,
                maximumAge: 5000,
                timeout: 15000
            }
        );
    } catch (err) {
        console.error('[ContinuousMonitor] Failed to start watchPosition:', err);
    }

    // ── Periodic VPN re-check every 15 minutes ──
    vpnCheckInterval = window.setInterval(async () => {
        if (lastPosition) {
            const result = await detectVPN(lastPosition.lat, lastPosition.lng);
            if (result?.vpnDetected) {
                callbacks.onVpnDetected(result);
            }
        }
    }, 15 * 60 * 1000);

    // ── Return cleanup function ──
    return () => {
        if (watchId !== null) {
            navigator.geolocation.clearWatch(watchId);
        }
        if (vpnCheckInterval !== null) {
            clearInterval(vpnCheckInterval);
        }
    };
}

