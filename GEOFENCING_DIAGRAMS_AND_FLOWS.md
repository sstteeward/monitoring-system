# Geofencing Architecture & Data Flow Diagrams

## 1. High-Level System Architecture

```
┌─────────────────────────────────────────────────────────────┐
│                    STUDENT DASHBOARD                         │
│  (src/components/StudentDashboard.tsx)                       │
│                                                               │
│  ┌──────────────────────┐       ┌──────────────────────┐    │
│  │  Clock-In Button     │       │ Background Monitor   │    │
│  │  (Triggered)         │       │ (Real-time)          │    │
│  └──────────┬───────────┘       └──────────┬───────────┘    │
│             │                              │                 │
└─────────────┼──────────────────────────────┼─────────────────┘
              │                              │
              │ imports                      │ imports
              ↓                              ↓
        ┌─────────────────────────────────────────────┐
        │  GEOFENCE SERVICE                           │
        │  (src/services/geofenceService.ts)          │
        │                                             │
        │  ├─ runFullAntiCheatSuite()                 │
        │  │  └─ Full validation for clock-in         │
        │  │                                           │
        │  ├─ quickGeofenceCheck()                    │
        │  │  └─ Fast check for background            │
        │  │                                           │
        │  ├─ startContinuousMonitor()                │
        │  │  └─ Real-time watchPosition              │
        │  │                                           │
        │  └─ detectVPN(), detectEmulator(), etc.     │
        └────────┬───────────────────────────────────┘
                 │ imports
                 ↓
        ┌─────────────────────────────────────────────┐
        │  GEO UTILS                                  │
        │  (src/utils/geoUtils.ts)                    │
        │                                             │
        │  ├─ calculateDistanceInMeters()             │
        │  │  └─ Haversine formula                    │
        │  │                                           │
        │  ├─ getAccuratePosition()                   │
        │  │  └─ GPS acquisition with retries         │
        │  │                                           │
        │  └─ getMultiSamplePosition()                │
        │     └─ Consistency check                    │
        └────────┬───────────────────────────────────┘
                 │ queries
                 ↓
        ┌─────────────────────────────────────────────┐
        │  BROWSER GEOLOCATION API                    │
        │  (navigator.geolocation)                    │
        │                                             │
        │  ├─ getCurrentPosition()                    │
        │  └─ watchPosition()                         │
        └─────────────────────────────────────────────┘
```

---

## 2. Clock-In Validation Flow

```
┌─ START: User clicks Clock-In ─────────────────────────────┐
│                                                            │
├─ 1. GET PROFILE (with company geofence data)              │
│    Profile → company.latitude, company.longitude          │
│            → company.geofence_radius (default: 100m)      │
│                                                            │
├─ 2. RUN FULL ANTI-CHEAT SUITE                             │
│    ├─ ✓ Check emulator/VM                                 │
│    ├─ ✓ Get GPS position (±150m, 2 retries)              │
│    ├─ ✓ Check browser extension spoof                     │
│    ├─ ✓ Check GPS timing anomaly                          │
│    ├─ ✓ Validate GPS accuracy                             │
│    ├─ ✓ Check fake GPS signature                          │
│    ├─ ✓ Check multi-sample consistency (disabled)         │
│    │                                                       │
│    ├─ ✓ GEOFENCE DISTANCE CHECK ⭐                        │
│    │   │                                                  │
│    │   distance = haversine(userLat, userLng,             │
│    │                        companyLat, companyLng)        │
│    │                                                       │
│    │   IF distance ≤ radius THEN                          │
│    │     ✓ PASS                                            │
│    │   ELSE                                                │
│    │     ✗ FAIL: Geofence Violation                       │
│    │     Message: "You are XXm away (Limit: 100m)"        │
│    │                                                       │
│    └─ ✓ Check teleportation/speed anomaly                 │
│                                                            │
├─ 3. IF PASSED: Save clock-in with GPS coordinates         │
│    INSERT INTO timesheets (                               │
│      user_id, clock_in, clock_in_latitude,               │
│      clock_in_longitude, status='working'                │
│    )                                                       │
│                                                            │
├─ 4. IF PASSED: Start continuous monitor                   │
│    ├─ Watch for geofence exits                            │
│    ├─ Watch for position jumps                            │
│    ├─ Auto clock-out after 3 violations                   │
│                                                            │
├─ 5. IF FAILED: Display error & block action               │
│    userMessage displayed to student                       │
│    Flag logged for audit                                  │
│                                                            │
└─ END ────────────────────────────────────────────────────┘
```

---

## 3. Geofence Check Decision Tree

```
                    ┌─ START ─────────────────┐
                    │  calculateDistance()    │
                    └────────────┬────────────┘
                                 │
                    ┌────────────┴────────────┐
                    │   distance = ?          │
                    └────────────┬────────────┘
                                 │
                ┌────────────────┴────────────────────┐
                │                                     │
        ┌───────▼──────────┐            ┌────────────▼──────────┐
        │ distance ≤ radius│            │ distance > radius     │
        └───────┬──────────┘            └────────────┬──────────┘
                │                                    │
                │                                    ├─ Calculate excess:
                │                                    │  excess = distance - radius
                │                                    │
                │                                    ├─ Create message:
                │                                    │  "You are Xm away"
                │                                    │
                ▼                                    ▼
        ┌─────────────────────────┐        ┌──────────────────────┐
        │ PASSED ✓                │        │ FAILED ✗             │
        │                         │        │                      │
        │ ├─ inBounds = true      │        │ ├─ inBounds = false  │
        │ ├─ flags = []           │        │ ├─ flags = [         │
        │ └─ Continue with        │        │ │   'geofence_      │
        │   next checks...        │        │ │    violation'      │
        │                         │        │ │ ]                  │
        │   THEN:                 │        │ ├─ antiCheatReason = │
        │   Save clock-in         │        │ │   'Geofence        │
        │   Start monitoring      │        │ │    Violation'      │
        │                         │        │ └─ Return to UI with │
        └─────────────────────────┘        │   error message      │
                                           └──────────────────────┘
```

---

## 4. Database Schema Diagram

```
┌─────────────────────────────────────────┐
│          COMPANIES TABLE                │
├─────────────────────────────────────────┤
│ id (uuid)                  [PK]         │
│ name (text)                             │
│ address (text)                          │
│ contact_person (text)                   │
│ contact_email (text)                    │
│ industry (text)                         │
│ latitude (numeric)         ⭐ GEOFENCE │
│ longitude (numeric)        ⭐ GEOFENCE │
│ geofence_radius (integer)  ⭐ GEOFENCE │
│ created_at (timestamptz)                │
│ updated_at (timestamptz)                │
└─────────────────────────────────────────┘
           ▲
           │ FK: company_id
           │
┌─────────────────────────────────────────┐
│         PROFILES TABLE                  │
├─────────────────────────────────────────┤
│ id (uuid)                  [PK]         │
│ auth_user_id (uuid)        [FK auth]    │
│ email (text)                            │
│ first_name (text)                       │
│ last_name (text)                        │
│ account_type (text)                     │
│ company_id (uuid)          [FK companies]
│ required_ojt_hours (int)                │
│ ...                                     │
│ created_at (timestamptz)                │
│ updated_at (timestamptz)                │
└─────────────────────────────────────────┘
           ▲
           │ FK: user_id
           │
┌─────────────────────────────────────────┐
│       TIMESHEETS TABLE                  │
├─────────────────────────────────────────┤
│ id (uuid)                  [PK]         │
│ user_id (uuid)             [FK profiles]│
│ clock_in (timestamptz)                  │
│ clock_in_latitude (numeric)  ⭐ AUDIT  │
│ clock_in_longitude (numeric) ⭐ AUDIT  │
│ clock_out (timestamptz)                 │
│ clock_out_latitude (numeric) ⭐ AUDIT  │
│ clock_out_longitude (numeric)⭐ AUDIT  │
│ status (text)                           │
│ requires_approval (boolean)             │
│ ...                                     │
└─────────────────────────────────────────┘
```

---

## 5. Geographic Calculation Visualization

```
                          CIRCULAR GEOFENCE (Top-down view)

                    Geofence Boundary (radius = 100m)

                              ╱─────╲
                            ╱         ╲
                          ╱             ╲
                        │     ZONE A     │
                        │   (In Bounds)   │
                      │                   │
                      │    ✓ Clock-In OK  │     Geofence center
                      │      (50m away)   │     (company.latitude,
        Outside │────┤    ●───────────●   ├────│ company.longitude)
        Bounds  │    │   /             \ │    │
        (Zone B)│    │ /               \ │    │
                │    └─                 ┘    │
                      │    ✗ Clock-In FAIL │
                      │     (200m away)   │
                      └─────────────────────


                    HAVERSINE DISTANCE FORMULA

    Input:  User Location: (userLat, userLng)
            Company Location: (companyLat, companyLng)

    Step 1: Convert to radians
            φ₁ = userLat * π/180
            φ₂ = companyLat * π/180
            Δφ = (companyLat - userLat) * π/180
            Δλ = (companyLng - userLng) * π/180

    Step 2: Calculate angle
            a = sin²(Δφ/2) + cos(φ₁) * cos(φ₂) * sin²(Δλ/2)
            c = 2 * atan2(√a, √(1-a))

    Step 3: Multiply by Earth radius
            distance = 6,371,000 * c  (meters)

    Output: Distance in meters

    Accuracy: ±0.5% for distances up to 500km
```

---

## 6. Map UI Component Flow

```
┌──────────────────────────────────────────────────┐
│     LocationPickerMap Component                  │
│  (src/components/LocationPickerMap.tsx)         │
└──────────────────────┬───────────────────────────┘
                       │
        ┌──────────────┼──────────────┐
        │              │              │
        ▼              ▼              ▼
   ┌─────────┐   ┌─────────┐   ┌──────────┐
   │Search   │   │  Map    │   │Geofence  │
   │Bar      │   │Container│   │Circle    │
   └────┬────┘   └────┬────┘   └────┬─────┘
        │             │             │
        │             │             │
    Photon API   React-Leaflet   L.Circle
    (Komoot)     ├─ MapContainer  pathOptions:
    - Free       ├─ TileLayer     color: #20c997
    - 45 req/min │  (OSM)         weight: 2
    - Real-time  ├─ Marker        opacity: 0.3
      suggestions│  ├─ Position   fillOpacity: 0.1
                 │  └─ Lat/Lng
                 │  LocationMarker
                 │  useMapEvents
                 └─ MapController
                    useMap

        ▼               ▼               ▼
    Suggestions    Click Handler   Visualization
    List           setPosition()    of geofence
    Select location onLocationSelect boundary
```

---

## 7. Time Sequence: Clock-In to Monitoring

```
Timeline →

T+0s:  User clicks "Clock In"
       │
T+0.1s:├─ Query profile (with company data)
       │
T+0.2s:├─ Check for running session
       │
T+2s:  ├─ START: getAccuratePosition()
       │  (enableHighAccuracy: true, timeout: 12s)
       │
T+2.5s:├─ Browser requests location permission (if needed)
       │  (Usually already granted)
       │
T+3s:  ├─ Browser acquires GPS signal
       │
T+5s:  ├─ Got position with accuracy ~80m
       │  └─ Check if ≤150m? YES ✓
       │
T+5.1s:├─ Run anti-cheat checks #1-6
       │
T+5.5s:├─ GEOFENCE DISTANCE CHECK ⭐
       │  ├─ Calculate distance using Haversine
       │  │  userLat: 12.345, userLng: 121.567
       │  │  companyLat: 12.346, companyLng: 121.568
       │  │  distance = 142 meters
       │  │
       │  └─ Check: 142 ≤ 100? NO ✗
       │     GEOFENCE VIOLATION!
       │
T+6s:  ├─ Return result: { passed: false, ... }
       │
T+6.2s:├─ UI displays error message:
       │  "You must be within the company premises.
       │   You are 142m away (Limit: 100m)."
       │
T+6.5s:└─ END: Block clock-in


       ALTERNATIVE PATH (If geofence check PASSED):

T+5.5s:├─ GEOFENCE DISTANCE CHECK ⭐
       │  └─ Check: 95 ≤ 100? YES ✓
       │     GEOFENCE OK!
       │
T+5.6s:├─ Continue with checks #9 (teleportation)
       │
T+5.8s:├─ All checks passed ✓
       │
T+6s:  ├─ Save clock-in:
       │  INSERT INTO timesheets (
       │    user_id, clock_in, clock_in_latitude: 12.345,
       │    clock_in_longitude: 121.567, status: 'working'
       │  )
       │
T+6.2s:├─ UI shows "Clocked In ✓"
       │
T+6.3s:├─ START: Continuous monitor
       │  navigator.geolocation.watchPosition(...)
       │  - Monitor geofence violations
       │  - Check for position jumps
       │  - Detect suspicious jitter
       │
T+6.4s:└─ User can now perform work
          Background monitoring continues...
```

---

## 8. File Import Dependencies

```
StudentDashboard.tsx
├── import { runFullAntiCheatSuite }
│   └── from '../services/geofenceService'
├── import { quickGeofenceCheck }
│   └── from '../services/geofenceService'
├── import { startContinuousMonitor }
│   └── from '../services/geofenceService'
└── import { profileService }
    └── from '../services/profileService'

geofenceService.ts
├── import { calculateDistanceInMeters }
│   └── from '../utils/geoUtils'
├── import { getAccuratePosition }
│   └── from '../utils/geoUtils'
├── import { getMultiSamplePosition }
│   └── from '../utils/geoUtils'
├── import type { Profile }
│   └── from './profileService'
└── import type { Timesheet }
    └── from './timeTracking'

CompaniesView.tsx
├── import LocationPickerMap
│   └── from './LocationPickerMap'
└── import { coordinatorService }
    └── from '../services/coordinatorService'

LocationPickerMap.tsx
├── import { MapContainer, TileLayer, Marker, Circle }
│   └── from 'react-leaflet'
├── import L
│   └── from 'leaflet'
└── import 'leaflet/dist/leaflet.css'
```

---

## 9. API Response Objects

### runFullAntiCheatSuite Response

**SUCCESS:**

```json
{
  "passed": true,
  "latitude": 12.345678,
  "longitude": 121.56789,
  "accuracy": 87,
  "flags": []
}
```

**FAILURE (Geofence Violation):**

```json
{
  "passed": false,
  "latitude": 12.345678,
  "longitude": 121.56789,
  "accuracy": 87,
  "antiCheatReason": "Geofence Violation",
  "antiCheatDetails": {
    "action": "Clock-In",
    "distance": 450,
    "radius": 100
  },
  "userMessage": "You must be within the company premises. You are 450m away (Limit: 100m).",
  "flags": ["geofence_violation"]
}
```

### quickGeofenceCheck Response

```json
{
  "inBounds": false,
  "distance": 450,
  "latitude": 12.345678,
  "longitude": 121.56789
}
```

### Company Object

```json
{
  "id": "550e8400-e29b-41d4-a716-446655440000",
  "name": "Tech Solutions Inc.",
  "address": "Dumaguete City",
  "latitude": 9.3043,
  "longitude": 123.3034,
  "geofence_radius": 100,
  "intern_count": 25
}
```

---

## 10. Error Scenario Recovery Flow

```
                   GEOFENCE VIOLATION DETECTED
                          ↓
    ┌───────────────────────────────────────────────┐
    │ distance = 450m, radius = 100m                │
    │ Verdict: OUTSIDE GEOFENCE                     │
    └────────────────────┬────────────────────────┘
                         │
         ┌───────────────┴───────────────┐
         │                               │
    IMMEDIATE                      LOGGED FOR AUDIT
    ├─ Reject action            ├─ flagged: 'geofence_violation'
    ├─ Show error message       ├─ Distance: 450m
    │  "You are 450m away"       ├─ Limit: 100m
    ├─ Block database write     ├─ User ID: xxx
    ├─ Log to browser console   ├─ Timestamp: ISO
    └─ Clear GPS form inputs    └─ Reason: 'Geofence Violation'

    USER OPTIONS:
    ├─ Move closer to company (50m closer)
    │  └─ Try Clock-In again
    │
    ├─ Contact coordinator (geofence too strict)
    │  └─ Coordinator can increase radius
    │
    └─ Report GPS issue
       └─ Use different device
          └─ Try again with better GPS signal

    COORDINATOR OPTIONS:
    ├─ View incident in Security Alerts
    ├─ Check audit log for all attempts
    ├─ Increase geofence_radius from 100m → 150m
    └─ Re-save company → triggers update

    ADMIN OPTIONS:
    ├─ View all geofence violations company-wide
    ├─ Export audit trail for compliance
    ├─ Adjust system-wide GPS accuracy thresholds
    └─ Review VPN/emulator detections
```

---

## Summary Table

| Layer        | Component           | Purpose          | Output                 |
| ------------ | ------------------- | ---------------- | ---------------------- |
| **UI**       | StudentDashboard    | User interaction | Clock-In action        |
| **Service**  | geofenceService     | Validation logic | Pass/Fail result       |
| **Utils**    | geoUtils            | Math operations  | Distance (m)           |
| **API**      | Browser Geolocation | GPS data         | Coordinates + Accuracy |
| **Map**      | LocationPickerMap   | Visual config    | Company location       |
| **Database** | companies           | Geofence config  | Radius constraints     |
| **Database** | timesheets          | Audit trail      | Location history       |
