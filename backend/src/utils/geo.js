// ─────────────────────────────────────────────────────────────
// SecureByte — Campus Geofence & Location Verification Utility
//
// BIT Sindri Reference Center: 23.6547° N, 86.4737° E
// Radius: ~1200 meters encompassing all hostels, departments & gates
// ─────────────────────────────────────────────────────────────

const CAMPUS_CONFIG = {
  center: {
    latitude: 23.6547,
    longitude: 86.4737,
  },
  radiusMeters: 1200,
  // Distance threshold between current GPS and selected incident location
  // to flag as a meaningful discrepancy
  mismatchThresholdMeters: 400,
  // Minimum acceptable GPS accuracy in meters to treat discrepancy as meaningful
  maxGpsAccuracyForMismatchMeters: 150,
};

/**
 * Calculates Haversine distance in meters between two lat/lng coordinates.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const R = 6371000; // Earth radius in meters
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) *
      Math.cos((lat2 * Math.PI) / 180) *
      Math.sin(dLon / 2) *
      Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return R * c;
}

/**
 * Checks whether given coordinates fall inside the configured campus boundary.
 */
function isWithinCampusBoundary(lat, lon, customRadius = CAMPUS_CONFIG.radiusMeters) {
  if (lat == null || lon == null) return false;
  const dist = haversineDistance(
    lat,
    lon,
    CAMPUS_CONFIG.center.latitude,
    CAMPUS_CONFIG.center.longitude
  );
  return dist !== null && dist <= customRadius;
}

/**
 * Server-side verified evaluation of incident location data.
 * Never trusts a client-supplied 'isVerified' flag without independent evaluation.
 */
function evaluateIncidentLocation(locationInput = {}) {
  const {
    latitude,
    longitude,
    campusLandmark,
    buildingOrRoom,
    currentLatitude,
    currentLongitude,
    selectedLatitude,
    selectedLongitude,
    gpsAccuracy,
    locationSource: rawSource,
    mismatchConfirmed = false,
  } = locationInput;

  // Determine effective coordinates
  const effectiveLat = selectedLatitude != null ? selectedLatitude : latitude != null ? latitude : currentLatitude;
  const effectiveLng = selectedLongitude != null ? selectedLongitude : longitude != null ? longitude : currentLongitude;

  // Has current GPS fix
  const hasGps = currentLatitude != null && currentLongitude != null;
  // Has selected location
  const hasSelected = (selectedLatitude != null && selectedLongitude != null) || (latitude != null && longitude != null);
  // Has landmark
  const hasLandmark = typeof campusLandmark === 'string' && campusLandmark.trim().length >= 3;

  // Determine location source
  let locationSource = 'UNAVAILABLE';
  if (hasGps && hasSelected) {
    locationSource = rawSource === 'CAMPUS_LANDMARK' ? 'CAMPUS_LANDMARK' : 'MANUAL_MAP';
  } else if (hasGps) {
    locationSource = 'GPS';
  } else if (hasSelected) {
    locationSource = 'MANUAL_MAP';
  } else if (hasLandmark) {
    locationSource = 'CAMPUS_LANDMARK';
  }

  // Campus boundary check
  const isOutsideCampus = effectiveLat != null && effectiveLng != null
    ? !isWithinCampusBoundary(effectiveLat, effectiveLng)
    : false;

  // Discrepancy analysis
  let isMismatch = false;
  let mismatchDistanceMeters = null;
  let verificationStatus = 'UNVERIFIED';

  if (hasGps && hasSelected) {
    const dist = haversineDistance(currentLatitude, currentLongitude, effectiveLat, effectiveLng);
    if (dist != null) {
      mismatchDistanceMeters = Math.round(dist);
      const acc = typeof gpsAccuracy === 'number' && gpsAccuracy > 0 ? gpsAccuracy : 20;

      // Only evaluate mismatch if GPS accuracy is reliable enough
      if (acc <= CAMPUS_CONFIG.maxGpsAccuracyForMismatchMeters) {
        if (dist > CAMPUS_CONFIG.mismatchThresholdMeters) {
          isMismatch = true;
          verificationStatus = mismatchConfirmed ? 'CONFIRMED_ELSEWHERE' : 'LOCATION_MISMATCH';
        } else {
          isMismatch = false;
          verificationStatus = 'VERIFIED_MATCH';
        }
      } else {
        // GPS fix is too inaccurate to conclude a discrepancy
        verificationStatus = 'MANUAL_UNVERIFIED';
      }
    }
  } else if (hasGps && !hasSelected) {
    verificationStatus = 'GPS_ONLY';
  } else if (hasSelected || hasLandmark) {
    verificationStatus = 'MANUAL_UNVERIFIED';
  } else {
    verificationStatus = 'UNAVAILABLE';
  }

  return {
    latitude: effectiveLat != null ? Number(effectiveLat) : null,
    longitude: effectiveLng != null ? Number(effectiveLng) : null,
    campusLandmark: hasLandmark ? campusLandmark.trim() : null,
    buildingOrRoom: typeof buildingOrRoom === 'string' && buildingOrRoom.trim().length >= 2 ? buildingOrRoom.trim() : null,
    currentLatitude: hasGps ? Number(currentLatitude) : null,
    currentLongitude: hasGps ? Number(currentLongitude) : null,
    selectedLatitude: selectedLatitude != null ? Number(selectedLatitude) : (latitude != null ? Number(latitude) : null),
    selectedLongitude: selectedLongitude != null ? Number(selectedLongitude) : (longitude != null ? Number(longitude) : null),
    gpsAccuracy: typeof gpsAccuracy === 'number' ? Number(gpsAccuracy) : null,
    locationSource,
    verificationStatus,
    isMismatch,
    mismatchDistanceMeters,
    isOutsideCampus,
    mismatchConfirmed: Boolean(mismatchConfirmed),
  };
}

module.exports = {
  CAMPUS_CONFIG,
  haversineDistance,
  isWithinCampusBoundary,
  evaluateIncidentLocation,
};
