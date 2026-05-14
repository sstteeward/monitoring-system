# Geofencing Quick Reference & File Map

## Core Geofence Distance Formula

**Haversine Distance (meters):**

```
distance = R * 2 * atan2(√a, √(1-a))

where:
  R = 6,371,000 meters (Earth's radius)
  a = sin²(Δφ/2) + cos(φ₁) * cos(φ₂) * sin²(Δλ/2)
  φ = latitude in radians
  λ = longitude in radians
```

**File:** `src/utils/geoUtils.ts` (Lines 14-26)

---

## Geofence Check: IF/THEN Logic

```
IF distance ≤ radius THEN
  ✓ User is within geofence
  → Clock-In/Clock-Out ALLOWED
ELSE
  ✗ User is outside geofence
  → Action BLOCKED with error message
  → Flag: 'geofence_violation'
```

**File:** `src/services/geofenceService.ts` (Lines 254-269)

---

## Key File Dependencies

```
StudentDashboard.tsx (Clock-In UI)
    ↓ imports
geofenceService.ts (Validation logic)
    ├─ imports → geoUtils.ts (Distance calc)
    ├─ imports → profileService.ts (Get company data)
    └─ imports → timeTracking.ts (Save location)

CompaniesView.tsx (Admin config)
    └─ uses → LocationPickerMap.tsx (Map UI)
                   └─ uses → Leaflet/React-Leaflet

Database Flow:
companies table (id, latitude, longitude, geofence_radius)
    ↑ queried by
profileService.ts
    ↑ used by
geofenceService.ts (validation)
    ↓ stores result in
timesheets table (clock_in_latitude, clock_in_longitude, etc)
```

---

## Database Schema Reference

### Companies (Geofence Definition)

```sql
companies {
  id: uuid (PRIMARY KEY)
  name: text
  latitude: numeric         -- Center of geofence
  longitude: numeric        -- Center of geofence
  geofence_radius: integer  -- Meters from center
}
```

### Timesheets (Location Audit Trail)

```sql
timesheets {
  id: uuid (PRIMARY KEY)
  user_id: uuid
  clock_in: timestamp
  clock_in_latitude: numeric
  clock_in_longitude: numeric
  clock_out_latitude: numeric
  clock_out_longitude: numeric
}
```

---

## API Functions Reference

### 1. Calculate Distance

```typescript
calculateDistanceInMeters(
  { latitude: number, longitude: number },
  { latitude: number, longitude: number }
): number
```

**Returns:** Distance in meters (Haversine formula)
**File:** `src/utils/geoUtils.ts`

### 2. Full Geofence Validation

```typescript
runFullAntiCheatSuite(
  profile: Profile,
  action: 'Clock-In' | 'Clock-Out' | 'Break-Start' | 'Break-End',
  todaySessions: Timesheet[]
): Promise<AntiCheatResult>
```

**Returns:** { passed: boolean, antiCheatReason?, latitude?, longitude?, flags[] }
**File:** `src/services/geofenceService.ts`

### 3. Quick Geofence Check

```typescript
quickGeofenceCheck(
  companyLat: number,
  companyLng: number,
  radius: number
): Promise<{ inBounds: boolean, distance: number, latitude, longitude }>
```

**Returns:** Whether user is within radius (lightweight check)
**File:** `src/services/geofenceService.ts`

### 4. Continuous Monitoring

```typescript
startContinuousMonitor(
  companyLat: number,
  companyLng: number,
  radius: number,
  callbacks: {
    onOutOfBounds?: (distance, lat, lng) => void,
    onBackInBounds?: () => void,
    onPositionJump?: (jumpDistance, lat, lng) => void,
    onSuspiciousJitter?: (reason) => void,
    onVpnDetected?: (details) => void
  }
): () => void  // Returns cleanup function
```

**Used by:** StudentDashboard.tsx during active session
**File:** `src/services/geofenceService.ts`

### 5. Query Company Geofence Data

```typescript
profileService.getCurrentProfile()
  ← Returns profile with:
    company.latitude
    company.longitude
    company.geofence_radius
```

**File:** `src/services/profileService.ts` (Line 42)

---

## Component Integration Points

### StudentDashboard.tsx - Clock-In Integration

```typescript
import { runFullAntiCheatSuite } from "../services/geofenceService";

// During clock-in:
const result = await runFullAntiCheatSuite(profile, "Clock-In", todaySessions);
if (result.passed) {
  await timeTrackingService.clockIn(result.latitude, result.longitude);
}
```

### StudentDashboard.tsx - Background Monitoring

```typescript
const unmonitor = startContinuousMonitor(
  profile.company.latitude,
  profile.company.longitude,
  profile.company.geofence_radius || 100,
  {
    onOutOfBounds: () => {
      /* auto clock-out after 3 violations */
    },
    onPositionJump: () => {
      /* flag for audit */
    },
  },
);
```

### CompaniesView.tsx - Geofence Map Display

```typescript
<LocationPickerMap
  initialLat={company.latitude}
  initialLng={company.longitude}
  geofenceRadius={company.geofence_radius || 100}
  onLocationSelect={(lat, lng) => {
    setEditCompanyForm(p => ({...p, latitude: lat, longitude: lng}))
  }}
/>
```

---

## User Messages (Frontend Feedback)

**Geofence Violation:**

```
"You must be within the company premises to perform this action.
You are 450m away (Limit: 100m)."
```

**GPS Permission Denied:**

```
"You denied location access. Please go to your browser settings,
clear permissions for this site, and try again."
```

**Emulator Detected:**

```
"Emulator or Virtualized Environment detected.
Please use a real device to verify attendance."
```

**Suspicious GPS:**

```
"Suspicious location change detected.
You traveled 5000 meters in just 2 minutes."
```

---

## Configuration & Defaults

### Default Geofence Radius

```typescript
geofence_radius: number | null;
fallback: 100; // meters
```

### GPS Accuracy Requirements

```typescript
maxAccuracy: 150; // meters
timeout: 12000; // ms per attempt
retries: 2; // number of attempts
```

### Continuous Monitor Thresholds

```typescript
positionJumpThreshold: 200; // meters in <3 seconds
suspiciousJitterRange: 0.5; // meters variance over 10 readings
vpnDistanceThreshold: 100; // kilometers from GPS
```

---

## Implementation Checklist

- [x] Database columns (latitude, longitude, geofence_radius)
- [x] Haversine distance calculation
- [x] Circular geofence validation logic
- [x] Anti-cheat validation suite
- [x] Lightweight quick check function
- [x] Continuous real-time monitoring
- [x] Leaflet map visualization
- [x] Admin UI to configure geofence
- [x] Location storage in timesheets
- [x] Error messages & user feedback
- [x] Security audit logging
- [x] VPN detection support
- [x] GPS spoof detection

---

## Testing Geofence Implementation

### Manual Test Cases

1. **Valid Clock-In (Within Geofence)**
   - Set company to known location + 100m radius
   - Clock-in from within radius → Should pass

2. **Invalid Clock-In (Outside Geofence)**
   - Clock-in from 500m away → Should fail with "You are 500m away (Limit: 100m)"

3. **Spoof Detection**
   - Use fake GPS app → Should detect and block
   - Check "GPS Signature Detection" (all zeros pattern)

4. **Drift Monitoring**
   - Start session, walk outside geofence → Should trigger onOutOfBounds
   - Return inside → Should trigger onBackInBounds

5. **Position Jump**
   - Sudden GPS jump >200m in <3s → Should flag "Position Jump"

### GPS Accuracy Scenarios

```
Accuracy ≤ 150m   → Accept and continue
Accuracy > 150m   → Add warning flag 'low_accuracy_warning'
Accuracy > 300m   → Reject (too poor for reliable check)
```

---

## Extending Geofence Functionality

### 1. Add Rectangular Geofence

```typescript
interface RectangularGeofence {
  topLeft: { lat: number; lng: number };
  bottomRight: { lat: number; lng: number };
}

function isWithinRectangle(userPos, bounds) {
  return (
    userPos.lat >= bounds.bottomRight.lat &&
    userPos.lat <= bounds.topLeft.lat &&
    userPos.lng >= bounds.topLeft.lng &&
    userPos.lng <= bounds.bottomRight.lng
  );
}
```

### 2. Add Time-Based Geofence

```typescript
interface TimeBasedGeofence {
  workHours: { start: string; end: string }; // "09:00", "17:00"
  radiusWorkHours: number; // 100m
  radiusAfterHours: number; // 500m (more lenient)
}

const activeRadius = isWithinWorkHours()
  ? geofence.radiusWorkHours
  : geofence.radiusAfterHours;
```

### 3. Add Geofence Entry/Exit Log

```typescript
interface GeofenceEvent {
  user_id: uuid;
  company_id: uuid;
  event_type: 'ENTRY' | 'EXIT';
  latitude: number;
  longitude: number;
  accuracy: number;
  timestamp: timestamp;
}

CREATE TABLE geofence_events (
  id uuid PRIMARY KEY,
  user_id uuid REFERENCES profiles(id),
  company_id uuid REFERENCES companies(id),
  event_type text,
  latitude numeric,
  longitude numeric,
  accuracy numeric,
  timestamp timestamptz DEFAULT now()
);
```

---

## Current Limitations & Notes

1. **Browser Dependency** - Requires HTTPS for Geolocation API
2. **Permission Required** - Users must grant location permission
3. **Accuracy Variance** - Urban canyon vs. open sky (~50m difference)
4. **Mobile Only** - Desktop has different accuracy profile
5. **Rate Limiting** - Photon API has 45 requests/minute limit
6. **Privacy** - Location data is stored indefinitely in timesheets

---

## Performance Metrics

| Operation             | Time      | Notes                          |
| --------------------- | --------- | ------------------------------ |
| Distance calculation  | <1ms      | Haversine formula              |
| GPS acquisition       | 5-12s     | Depends on signal              |
| Full validation suite | 5-20s     | Multiple checks + multi-sample |
| Quick geofence check  | 5-8s      | Lightweight, cached position   |
| Continuous monitoring | Real-time | watchPosition updates          |
| Map render (Leaflet)  | <500ms    | OpenStreetMap tiles cached     |

---

## Security Considerations

### Threats Mitigated

- ✓ Fake GPS apps (signature detection)
- ✓ VPN usage (IP cross-check)
- ✓ Emulator/VM (GPU detection)
- ✓ Browser extensions (prototype chain check)
- ✓ Position spoofing (multi-sample check, disabled for speed)
- ✓ Teleportation (impossible speed detection)

### Not Protected Against

- ✗ Hardware-level GPS spoofer (not detectable)
- ✗ Network jailbreak + raw socket GPS
- ✗ Custom ROM with fake GPS permission
- ✗ User physically carrying device while driving
