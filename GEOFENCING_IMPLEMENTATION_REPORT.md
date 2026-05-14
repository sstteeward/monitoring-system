# Geofencing Implementation Report

## Overview

The monitoring system implements a comprehensive circular geofencing system for location-based clock-ins with advanced anti-cheat detection. Below is the complete technical breakdown.

---

## 1. DATABASE SCHEMA

### Companies Table

**File:** [supabase_companies_schema.sql](supabase_companies_schema.sql)

```sql
CREATE TABLE IF NOT EXISTS public.companies (
  id uuid DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  address TEXT,
  contact_person TEXT,
  contact_email TEXT,
  industry TEXT,
  latitude NUMERIC,           -- Company geofence center latitude
  longitude NUMERIC,          -- Company geofence center longitude
  geofence_radius INTEGER,    -- Radius in meters (default: 100m)
  created_at TIMESTAMPTZ DEFAULT now(),
  updated_at TIMESTAMPTZ DEFAULT now()
);
```

**Key Columns:**

- `latitude` - Center point of circular geofence
- `longitude` - Center point of circular geofence
- `geofence_radius` - Allowed distance in meters from center (typically 100-500m)

### Timesheets Table (Location Tracking)

**File:** [src/services/timeTracking.ts](src/services/timeTracking.ts#L1-L20)

```typescript
export interface Timesheet {
  id: string;
  user_id: string;
  clock_in: string;
  clock_out: string | null;
  clock_in_latitude?: number | null; // GPS coordinates at clock-in
  clock_in_longitude?: number | null;
  clock_out_latitude?: number | null; // GPS coordinates at clock-out
  clock_out_longitude?: number | null;
  status: "working" | "break" | "completed";
  requires_approval?: boolean;
}
```

### Profiles Table

**File:** [src/services/profileService.ts](src/services/profileService.ts#L1-L50)

Profile includes company data with geofence info:

```typescript
company?: {
    name: string;
    latitude?: number | null;
    longitude?: number | null;
    geofence_radius?: number | null
} | null;
```

**Query:** (Line 42)

```typescript
.select('*, company:companies(name, latitude, longitude, geofence_radius)')
```

---

## 2. GEOFENCING LOGIC

### A. Distance Calculation (Haversine Formula)

**File:** [src/utils/geoUtils.ts](src/utils/geoUtils.ts)

```typescript
export function calculateDistanceInMeters(
  coord1: Coordinates,
  coord2: Coordinates,
): number {
  const R = 6371e3; // Earth's radius in meters
  const phi1 = coord1.latitude * (Math.PI / 180);
  const phi2 = coord2.latitude * (Math.PI / 180);
  const deltaPhi = (coord2.latitude - coord1.latitude) * (Math.PI / 180);
  const deltaLambda = (coord2.longitude - coord1.longitude) * (Math.PI / 180);

  const a =
    Math.sin(deltaPhi / 2) * Math.sin(deltaPhi / 2) +
    Math.cos(phi1) *
      Math.cos(phi2) *
      Math.sin(deltaLambda / 2) *
      Math.sin(deltaLambda / 2);

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c; // Distance in meters
}
```

**Accuracy:** ±0.5% for distances up to 500km

### B. Core Geofence Check

**File:** [src/services/geofenceService.ts](src/services/geofenceService.ts#L250-L270)

**Circular Geofence Logic:**

```typescript
const distance = calculateDistanceInMeters(
  { latitude: userLat, longitude: userLng },
  { latitude: companyLat, longitude: companyLng },
);

if (distance > radius) {
  return {
    passed: false,
    antiCheatReason: "Geofence Violation",
    antiCheatDetails: { action, distance, radius },
    userMessage: `You must be within the company premises. You are ${Math.round(distance)}m away (Limit: ${radius}m).`,
    flags: ["geofence_violation"],
  };
}
```

**Check Trigger Points:**

- Clock-In: Full anti-cheat + geofence
- Clock-Out: Lightweight check
- Break Start/End: Lightweight check
- Continuous Background: watchPosition monitoring

---

## 3. FULL ANTI-CHEAT VALIDATION SUITE

**File:** [src/services/geofenceService.ts](src/services/geofenceService.ts#L130-L300)

**Function:** `runFullAntiCheatSuite(profile, action, todaySessions)`

**Validation Sequence (8 checks):**

1. **Emulator/VM Detection** - Detects WebGL GPU spoofing, WebDriver flag
2. **GPS Acquisition** - Tries to get accurate position (±150m) with retries
3. **Browser Extension Spoof** - Checks Geolocation API prototype chain
4. **Timing Anomaly** - Validates GPS timestamp isn't >5 minutes stale
5. **GPS Accuracy** - Flags if accuracy worse than 150m
6. **Fake GPS Signature** - Detects impossible sensor combinations (altitude=0, speed=0, accuracy=0/1, heading=0)
7. **Multi-Sample Consistency** - _(Currently disabled for speed)_
8. **Geofence Distance Check** - **Our circular check** ✓
9. **Teleportation Detection** - Flags >30m/s between sessions

---

## 4. GEOFENCE MONITORING FUNCTIONS

### A. Quick Geofence Check (Lightweight)

**File:** [src/services/geofenceService.ts](src/services/geofenceService.ts#L313-L330)

```typescript
export async function quickGeofenceCheck(
  companyLat: number,
  companyLng: number,
  radius: number,
): Promise<{
  inBounds: boolean;
  distance: number;
  latitude: number;
  longitude: number;
}>;
```

**Used for:** Background drift monitoring (no full anti-cheat)

### B. Continuous Session Monitor

**File:** [src/services/geofenceService.ts](src/services/geofenceService.ts#L420-L520)

```typescript
export function startContinuousMonitor(
  companyLat: number,
  companyLng: number,
  radius: number,
  callbacks: SessionMonitorCallbacks,
): () => void;
```

**Real-time Detection:**

- Leaving geofence (drift)
- Returning to geofence
- Sudden position jumps (>200m in <3 seconds)
- Suspiciously stable coordinates (<0.5m variance over 10 readings)

**Used in:** [src/components/StudentDashboard.tsx](src/components/StudentDashboard.tsx#L240-L330)

---

## 5. FRONTEND MAP COMPONENT

**File:** [src/components/LocationPickerMap.tsx](src/components/LocationPickerMap.tsx)

### Technologies:

- **Library:** Leaflet (v1.9.4) + React-Leaflet (v5.0.0)
- **Tiles:** OpenStreetMap
- **Geocoding:** Photon Komoot API (free, no key needed)

### Key Features:

**1. Circle Visualization (Geofence Boundary)**

```typescript
<Circle
    center={position}
    radius={geofenceRadius}        // In meters
    pathOptions={{
        color: '#20c997',
        weight: 2,
        opacity: 0.3,
        fillOpacity: 0.1
    }}
/>
```

**2. Interactive Location Selection**

- Click on map to set company location
- Marker placed at selected coordinates
- Flyto animation to zoom level 16

**3. Autocomplete Search**

- Real-time search with Photon API
- Displays location suggestions with address details
- Debounced search (300ms delay)

### Component Props:

```typescript
interface LocationPickerMapProps {
  initialLat?: number | null;
  initialLng?: number | null;
  onLocationSelect: (lat: number, lng: number) => void;
  geofenceRadius?: number; // Default: 100m
}
```

---

## 6. ADMIN UI FOR GEOFENCE CONFIGURATION

**File:** [src/components/CompaniesView.tsx](src/components/CompaniesView.tsx)

### Company Form Fields:

```typescript
const newCompany = {
  name: "",
  address: "",
  contact_person: "",
  contact_email: "",
  industry: "",
  department_id: "",
  latitude: "", // GPS latitude
  longitude: "", // GPS longitude
  geofence_radius: "100", // Default 100 meters
};
```

### Map Integration in Admin:

```typescript
<LocationPickerMap
    initialLat={editCompanyForm.latitude ? parseFloat(editCompanyForm.latitude) : null}
    initialLng={editCompanyForm.longitude ? parseFloat(editCompanyForm.longitude) : null}
    onLocationSelect={(lat, lng) => {
        setEditCompanyForm(p => ({ ...p, latitude: lat.toString(), longitude: lng.toString() }))
    }}
    geofenceRadius={parseInt(editCompanyForm.geofence_radius) || 100}
/>
```

### Persisting Geofence Data:

**Lines 180-190:** When saving/updating company:

```typescript
const updatedCompany = {
  // ... other fields
  latitude: newCompany.latitude ? parseFloat(newCompany.latitude) : null,
  longitude: newCompany.longitude ? parseFloat(newCompany.longitude) : null,
  geofence_radius: newCompany.geofence_radius
    ? parseInt(newCompany.geofence_radius)
    : null,
};
```

---

## 7. CLOCK-IN/CLOCK-OUT FLOW WITH GEOFENCE

**File:** [src/components/StudentDashboard.tsx](src/components/StudentDashboard.tsx)

### Clock-In Process:

```typescript
const result = await runFullAntiCheatSuite(profile, "Clock-In", todaySessions);

if (!result.passed) {
  // Show error: Geofence Violation (or other reason)
  setErrorMessage(result.userMessage);
  return;
}

// Save location data
await timeTrackingService.clockIn(result.latitude, result.longitude);
```

### Continuous Monitoring:

```typescript
const unmonitor = startContinuousMonitor(
  profile.company.latitude,
  profile.company.longitude,
  radius,
  {
    onOutOfBounds: (distance, lat, lng) => {
      // User left geofence
      geofenceViolationCount++;
      // Auto clock-out after 3 violations
    },
    onPositionJump: (jumpDistance, lat, lng) => {
      // Possible fake GPS toggle
      flagForAudit();
    },
    onSuspiciousJitter: (reason) => {
      // Unnaturally stable coordinates
      flagForAudit();
    },
  },
);
```

---

## 8. SECURITY ALERTS & AUDIT

**File:** [src/components/SecurityAlertsView.tsx](src/components/SecurityAlertsView.tsx#L47)

Geofence violations are flagged and displayed:

```typescript
if (lowerReason.includes('location') ||
    lowerReason.includes('geofence') ||
    lowerReason.includes('distance')) {
    return <span style={{ color: '#ef4444' }}>{SvgIcon.mapPin}</span>;
}
```

---

## 9. PACKAGES & DEPENDENCIES

**File:** [package.json](package.json)

```json
{
  "leaflet": "^1.9.4",
  "react-leaflet": "^5.0.0",
  "@types/leaflet": "^1.9.21"
}
```

---

## 10. KEY IMPLEMENTATION DETAILS

### Default Geofence Radius

- **Default Value:** 100 meters
- **Configurable Range:** Typically 100-500m
- **Fallback:** If company has no coordinates, geo checks are skipped

### GPS Accuracy Requirements

- **Clock-In:** ±150m accuracy required
- **Retries:** Up to 2 attempts with 800ms delay between
- **Timeout:** 12 seconds per attempt

### Distance Calculation Precision

- Uses Haversine formula for great-circle distances
- Works for distances up to 500km
- Accuracy: ±0.5%

### Continuous Monitoring Thresholds

- Position jump detection: >200m in <3 seconds = flagged
- Jitter detection: <0.5m variance over 10 readings = suspicious
- VPN detection: IP geolocation >100km from GPS = flagged

---

## 11. SUMMARY TABLE

| Component           | Purpose                  | File                  | Tech Stack              |
| ------------------- | ------------------------ | --------------------- | ----------------------- |
| **Distance Calc**   | Haversine formula        | geoUtils.ts           | TypeScript              |
| **Full Validation** | Anti-cheat + geofence    | geofenceService.ts    | Browser Geolocation API |
| **Quick Check**     | Lightweight monitoring   | geofenceService.ts    | Browser Geolocation API |
| **Map UI**          | Visualize & set geofence | LocationPickerMap.tsx | Leaflet + React-Leaflet |
| **Admin Config**    | Set company location     | CompaniesView.tsx     | React                   |
| **Clock-In Flow**   | User verification        | StudentDashboard.tsx  | React                   |
| **Database**        | Store coordinates        | companies table       | Supabase PostgreSQL     |

---

## 12. FILE STRUCTURE SUMMARY

```
src/
├── services/
│   ├── geofenceService.ts       ← Core geofence logic
│   ├── profileService.ts        ← Query company geofence data
│   └── timeTracking.ts          ← Store location in timesheets
├── utils/
│   └── geoUtils.ts              ← Distance calculations
├── components/
│   ├── LocationPickerMap.tsx    ← Leaflet map component
│   ├── CompaniesView.tsx        ← Admin geofence config
│   └── StudentDashboard.tsx     ← Clock-in flow with validation
└── lib/
    └── supabaseClient.ts        ← Supabase connection

Database/
├── supabase_companies_schema.sql ← Companies table definition
```

---

## GEOFENCE VIOLATION FLOW

```
User attempts Clock-In
    ↓
runFullAntiCheatSuite() executes
    ↓
getAccuratePosition() gets GPS coords
    ↓
calculateDistanceInMeters(userLoc, companyLoc)
    ↓
distance > radius?
    ├─ YES → Return FAILED with userMessage
    │         "You must be within X meters (You are Ym away)"
    └─ NO  → Continue other checks
              ↓
          All checks passed?
            ├─ YES → Save clockIn with lat/lng
            └─ NO  → Return FAILED reason
```

---

## EXTENSIONS & ENHANCEMENTS POSSIBLE

1. **Elliptical Geofences** - Instead of circles (rectangular or complex polygons)
2. **Multiple Geofence Points** - Different zones within company
3. **Time-based Geofence** - Different radius during work hours vs. after-hours
4. **Geofence Entry/Exit Logs** - Detailed audit trail
5. **GPS Accuracy Trends** - Alert if device GPS is degrading
6. **Real-time Heatmap** - Visualize where employees are working
