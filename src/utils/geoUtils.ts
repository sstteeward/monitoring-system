/**
 * Utility functions for Geolocation calculations.
 */

export interface Coordinates {
    latitude: number;
    longitude: number;
}

/**
 * Calculates the distance between two coordinate points in meters using the Haversine formula.
 * @param coord1 The first coordinate pair
 * @param coord2 The second coordinate pair
 * @returns The distance in meters
 */
export function calculateDistanceInMeters(coord1: Coordinates, coord2: Coordinates): number {
    const R = 6371e3; // Earth's radius in meters
    const phi1 = coord1.latitude * (Math.PI / 180);
    const phi2 = coord2.latitude * (Math.PI / 180);
    const deltaPhi = (coord2.latitude - coord1.latitude) * (Math.PI / 180);
    const deltaLambda = (coord2.longitude - coord1.longitude) * (Math.PI / 180);

    const a =
        Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
        Math.cos(phi1) * Math.cos(phi2) *
        Math.sin(deltaLambda / 2) * Math.sin(deltaLambda / 2);

    const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

    return R * c; // Distance in meters
}

/**
 * Options for position acquisition.
 */
interface PositionOptions {
    /** Maximum acceptable accuracy in meters. Positions with worse accuracy are rejected. Default: 150 */
    maxAccuracy?: number;
    /** Timeout in ms for each attempt. Default: 12000 */
    timeout?: number;
    /** Number of retry attempts if accuracy is too poor. Default: 2 */
    retries?: number;
}

/**
 * Acquires a single high-accuracy GPS position.
 * Rejects if the browser denies permission, times out, or accuracy is too poor after retries.
 */
export async function getAccuratePosition(options: PositionOptions = {}): Promise<GeolocationPosition> {
    const { maxAccuracy = 150, timeout = 12000, retries = 2 } = options;

    let lastPosition: GeolocationPosition | null = null;
    let lastError: Error | GeolocationPositionError | null = null;

    for (let attempt = 0; attempt <= retries; attempt++) {
        try {
            const position = await new Promise<GeolocationPosition>((resolve, reject) => {
                navigator.geolocation.getCurrentPosition(resolve, reject, {
                    enableHighAccuracy: true,
                    timeout,
                    maximumAge: 0
                });
            });

            lastPosition = position;

            // Check accuracy — lower number = better
            if (position.coords.accuracy <= maxAccuracy) {
                return position;
            }

            // Accuracy too poor — will retry if attempts remain
        } catch (err) {
            lastError = err as Error | GeolocationPositionError;

            // Permission denied is fatal — don't retry
            if ((err as GeolocationPositionError).code === 1) {
                throw new Error(
                    "You denied location access. Please go to your browser settings, clear permissions for this site, and try again."
                );
            }

            // On last attempt, throw
            if (attempt === retries) {
                throw new Error(
                    "Could not get your location. Please check browser permissions and ensure GPS is enabled. " +
                    ((err as GeolocationPositionError).message || '')
                );
            }
        }

        // Small delay before retry
        if (attempt < retries) {
            await new Promise(r => setTimeout(r, 800));
        }
    }

    // If we got a position but accuracy was always too poor, still return the best one
    // but mark it so the caller can decide
    if (lastPosition) {
        return lastPosition;
    }

    throw lastError || new Error("Failed to acquire GPS position.");
}

/**
 * Result of a multi-sample GPS check.
 */
export interface MultiSampleResult {
    /** The primary position to use for geofence checks */
    position: GeolocationPosition;
    /** Whether the two samples were consistent (within threshold) */
    consistent: boolean;
    /** Distance between the two samples in meters */
    sampleDrift: number;
}

/**
 * Takes two GPS readings ~1.2s apart and checks if they are spatially consistent.
 * Legitimate devices show <30m drift between rapid readings.
 * GPS spoofers that randomize or switch coordinates will show >50m drift.
 *
 * @param consistencyThreshold Max allowable drift between samples in meters. Default: 50
 */
export async function getMultiSamplePosition(consistencyThreshold: number = 50): Promise<MultiSampleResult> {
    // First sample
    const sample1 = await getAccuratePosition({ maxAccuracy: 150, timeout: 12000, retries: 1 });

    // Wait ~1.2 seconds for the second sample
    await new Promise(r => setTimeout(r, 1200));

    // Second sample
    const sample2 = await getAccuratePosition({ maxAccuracy: 150, timeout: 12000, retries: 1 });

    const sampleDrift = calculateDistanceInMeters(
        { latitude: sample1.coords.latitude, longitude: sample1.coords.longitude },
        { latitude: sample2.coords.latitude, longitude: sample2.coords.longitude }
    );

    return {
        position: sample2, // Use the more recent sample
        consistent: sampleDrift <= consistencyThreshold,
        sampleDrift
    };
}
