/**
 * SecureByte — Mobile Geofencing, Landmark Resolution & Discrepancy Verification
 *
 * Implements client-side checks for:
 * 1. Campus boundary validation (BIT Sindri center + 1200m radius)
 * 2. Real-time discrepancy detection between current device GPS and selected incident location
 * 3. Landmark coordinate resolution
 */
import { CAMPUS_LOCATIONS } from '../data/campusLocations';

export const CAMPUS_BOUNDARY = {
  centerLat: 23.6547,
  centerLng: 86.4737,
  radiusMeters: 1200,
  campusName: 'BIT Sindri',
};

/**
 * Calculates Great-Circle distance in meters using Haversine formula.
 */
export function calculateHaversineDistance(lat1, lon1, lat2, lon2) {
  if (lat1 == null || lon1 == null || lat2 == null || lon2 == null) return null;
  const toRad = (deg) => (deg * Math.PI) / 180;
  const R = 6371000; // Earth's mean radius in meters

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c);
}

/**
 * Checks if coordinates are within the configured campus boundary.
 */
export function isWithinCampus(lat, lon) {
  if (lat == null || lon == null) return true;
  const distance = calculateHaversineDistance(CAMPUS_BOUNDARY.centerLat, CAMPUS_BOUNDARY.centerLng, lat, lon);
  return distance != null ? distance <= CAMPUS_BOUNDARY.radiusMeters : true;
}

/**
 * Finds landmark coordinates from preset name if available.
 */
export function findLandmarkCoords(landmarkName) {
  if (!landmarkName || typeof landmarkName !== 'string') return null;
  const normalized = landmarkName.trim().toLowerCase();
  const match = CAMPUS_LOCATIONS.find(
    (loc) => loc.name.toLowerCase().includes(normalized) || normalized.includes(loc.name.toLowerCase())
  );
  if (match) {
    return { latitude: match.latitude, longitude: match.longitude, name: match.name };
  }
  return null;
}

/**
 * Evaluates whether current GPS and selected incident location meaningfully diverge.
 * 
 * Rules:
 * - Distance threshold: 400m
 * - Maximum GPS accuracy cutoff: 150m (inaccurate GPS does not trigger false warnings)
 */
export function evaluateLocationDiscrepancy({
  currentCoords,
  selectedCoords,
  thresholdMeters = 400,
  maxAccuracyMeters = 150,
}) {
  if (!currentCoords || !selectedCoords) {
    return {
      isMismatch: false,
      distanceMeters: null,
      isSufficientAccuracy: false,
      warningMessage: null,
    };
  }

  const accuracy = currentCoords.accuracy;
  const isSufficientAccuracy = accuracy == null || accuracy <= maxAccuracyMeters;

  if (!isSufficientAccuracy) {
    return {
      isMismatch: false,
      distanceMeters: null,
      isSufficientAccuracy: false,
      warningMessage: null,
    };
  }

  const distance = calculateHaversineDistance(
    currentCoords.latitude,
    currentCoords.longitude,
    selectedCoords.latitude,
    selectedCoords.longitude
  );

  if (distance != null && distance > thresholdMeters) {
    return {
      isMismatch: true,
      distanceMeters: distance,
      isSufficientAccuracy: true,
      warningMessage: `Your selected incident location differs from your current GPS location (approx. ~${distance}m away). The incident may have happened elsewhere. Please verify before submitting.`,
    };
  }

  return {
    isMismatch: false,
    distanceMeters: distance,
    isSufficientAccuracy: true,
    warningMessage: null,
  };
}
