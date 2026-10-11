-- Migration: 20261011171000_sensitive_cases_and_location_verification
-- Description: Add sensitive complaints, escalation routing, and location verification fields

-- 1. Incidents table additions
ALTER TABLE "incidents"
  ADD COLUMN IF NOT EXISTS "isSensitive" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "accusedPerson" TEXT,
  ADD COLUMN IF NOT EXISTS "accusedDepartment" TEXT,
  ADD COLUMN IF NOT EXISTS "escalationPath" TEXT DEFAULT 'STANDARD',
  ADD COLUMN IF NOT EXISTS "independentReviewerOnly" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "sensitiveCategory" TEXT,
  ADD COLUMN IF NOT EXISTS "confidentialityNoticeAcknowledged" BOOLEAN NOT NULL DEFAULT false;

CREATE INDEX IF NOT EXISTS "incidents_isSensitive_idx" ON "incidents"("isSensitive");
CREATE INDEX IF NOT EXISTS "incidents_independentReviewerOnly_idx" ON "incidents"("independentReviewerOnly");

-- 2. Incident Locations table additions
ALTER TABLE "incident_locations"
  ADD COLUMN IF NOT EXISTS "currentLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "currentLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "selectedLatitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "selectedLongitude" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "gpsAccuracy" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "locationSource" TEXT DEFAULT 'UNAVAILABLE',
  ADD COLUMN IF NOT EXISTS "verificationStatus" TEXT DEFAULT 'UNVERIFIED',
  ADD COLUMN IF NOT EXISTS "isMismatch" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mismatchDistanceMeters" DOUBLE PRECISION,
  ADD COLUMN IF NOT EXISTS "isOutsideCampus" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "mismatchConfirmed" BOOLEAN NOT NULL DEFAULT false;
