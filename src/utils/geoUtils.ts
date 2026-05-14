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

/**
 * GeoJSON Polygon interface
 */
export interface GeoJSONPolygon {
    type: 'FeatureCollection';
    features: Array<{
        type: 'Feature';
        geometry: {
            type: 'Polygon';
            coordinates: number[][][]; // [[[lng, lat], [lng, lat], ...]]
        };
    }>;
}

/**
 * Extracts polygon coordinates from GeoJSON format
 * @param geojson GeoJSON FeatureCollection containing polygon geometry
 * @returns Array of [longitude, latitude] pairs
 */
export function extractPolygonCoordinates(geojson: GeoJSONPolygon): Array<[number, number]> {
    if (!geojson?.features?.[0]?.geometry?.coordinates?.[0]) {
        return [];
    }
    return geojson.features[0].geometry.coordinates[0] as Array<[number, number]>;
}

/**
 * Ray casting algorithm: Checks if a point is inside a polygon
 * Uses the ray casting algorithm which is efficient and robust
 * 
 * @param point The point to test [longitude, latitude]
 * @param polygon Array of polygon vertices [[lng, lat], [lng, lat], ...]
 * @returns true if point is inside the polygon, false otherwise
 */
export function isPointInPolygon(
    point: [number, number],
    polygon: Array<[number, number]>
): boolean {
    const [x, y] = point;
    let inside = false;

    for (let i = 0, j = polygon.length - 1; i < polygon.length; j = i++) {
        const xi = polygon[i][0];
        const yi = polygon[i][1];
        const xj = polygon[j][0];
        const yj = polygon[j][1];

        const intersect =
            yi > y !== yj > y && x < ((xj - xi) * (y - yi)) / (yj - yi) + xi;

        if (intersect) inside = !inside;
    }

    return inside;
}

/**
 * Checks if a point is within a polygon boundary (using ray casting)
 * More robust version with multiple test rays
 * 
 * @param lat Latitude of the point
 * @param lng Longitude of the point
 * @param polygon GeoJSON Polygon feature collection
 * @returns true if point is inside the polygon
 */
export function isPointInPolygonGeofence(
    lat: number,
    lng: number,
    polygon: GeoJSONPolygon
): boolean {
    const coordinates = extractPolygonCoordinates(polygon);
    
    if (coordinates.length < 3) {
        console.warn('Polygon has fewer than 3 points - cannot be a valid polygon');
        return false;
    }

    return isPointInPolygon([lng, lat], coordinates);
}

/**
 * Combined geofence check: Returns true if point is within either polygon or radius
 * 
 * @param lat User latitude
 * @param lng User longitude
 * @param polygon GeoJSON polygon (optional)
 * @param centerLat Geofence center latitude (for circular fallback)
 * @param centerLng Geofence center longitude (for circular fallback)
 * @param radiusMeters Geofence radius in meters (for circular fallback)
 * @returns true if point is within geofence
 */
export function isPointInGeofence(
    lat: number,
    lng: number,
    polygon: GeoJSONPolygon | null | undefined,
    centerLat: number | null | undefined,
    centerLng: number | null | undefined,
    radiusMeters: number | null | undefined
): boolean {
    // Check polygon if available
    if (polygon) {
        try {
            if (isPointInPolygonGeofence(lat, lng, polygon)) {
                return true;
            }
        } catch (err) {
            console.warn('Error checking polygon geofence:', err);
        }
    }

    // Fall back to circular radius check
    if (centerLat !== null && centerLat !== undefined && centerLng !== null && centerLng !== undefined) {
        const radius = radiusMeters || 100; // Default 100m
        const distance = calculateDistanceInMeters(
            { latitude: lat, longitude: lng },
            { latitude: centerLat, longitude: centerLng }
        );
        return distance <= radius;
    }

    return false;
}

/**
 * Calculates the centroid (center point) of a polygon
 * Useful for auto-centering map view
 * 
 * @param polygon GeoJSON Polygon
 * @returns [latitude, longitude] of the centroid
 */
export function calculatePolygonCentroid(
    polygon: GeoJSONPolygon
): [number, number] | null {
    const coordinates = extractPolygonCoordinates(polygon);
    
    if (coordinates.length === 0) {
        return null;
    }

    let sumLat = 0;
    let sumLng = 0;

    coordinates.forEach(([lng, lat]) => {
        sumLng += lng;
        sumLat += lat;
    });

    return [sumLat / coordinates.length, sumLng / coordinates.length];
}

/**
 * Validates polygon has minimum required points and forms a closed ring
 * 
 * @param polygon GeoJSON Polygon
 * @returns true if polygon is valid
 */
export function isValidPolygon(polygon: GeoJSONPolygon | null | undefined): boolean {
    if (!polygon) return false;

    try {
        const coordinates = extractPolygonCoordinates(polygon);
        
        if (coordinates.length < 3) {
            return false;
        }

        // Check if polygon is closed (first and last point same)
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        
        if (first[0] === last[0] && first[1] === last[1]) {
            return true;
        }

        // Polygon will be auto-closed, so still valid
        return true;
    } catch (err) {
        console.warn('Invalid polygon:', err);
        return false;
    }
}

/**
 * Converts polygon coordinates to GeoJSON format
 * 
 * @param coordinates Array of [lng, lat] pairs
 * @returns GeoJSON FeatureCollection
 */
export function coordinatesToGeoJSON(coordinates: Array<[number, number]>): GeoJSONPolygon {
    // Ensure polygon is closed
    if (coordinates.length > 0) {
        const first = coordinates[0];
        const last = coordinates[coordinates.length - 1];
        if (first[0] !== last[0] || first[1] !== last[1]) {
            coordinates = [...coordinates, first];
        }
    }

    return {
        type: 'FeatureCollection',
        features: [
            {
                type: 'Feature',
                geometry: {
                    type: 'Polygon',
                    coordinates: [coordinates]
                }
            }
        ]
    };
}
