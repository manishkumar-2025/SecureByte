-- Migration: 20261011120000_audit_advanced_features
-- Description: Dual OTP verification, device session tracking, and multi-channel dispatch logs

-- 1. NotificationType Enum Updates
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'SECURITY_ALERT';
ALTER TYPE "NotificationType" ADD VALUE IF NOT EXISTS 'ESCALATION_ALERT';

-- 2. New Enums
DO $$ BEGIN
    CREATE TYPE "OtpChannel" AS ENUM ('EMAIL', 'SMS');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "DispatchChannel" AS ENUM ('SMS', 'PUSH', 'EMAIL');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    CREATE TYPE "DispatchStatus" AS ENUM ('QUEUED', 'SENT', 'DELIVERED', 'FAILED', 'ACKNOWLEDGED');
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 3. User Table Alterations
ALTER TABLE "users" 
  ADD COLUMN IF NOT EXISTS "phone" TEXT,
  ADD COLUMN IF NOT EXISTS "emailVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "phoneVerified" BOOLEAN NOT NULL DEFAULT false,
  ADD COLUMN IF NOT EXISTS "isVerified" BOOLEAN NOT NULL DEFAULT false;

-- 4. Verification OTPs Table
CREATE TABLE IF NOT EXISTS "verification_otps" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "target" TEXT NOT NULL,
    "channel" "OtpChannel" NOT NULL,
    "codeHash" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "maxAttempts" INTEGER NOT NULL DEFAULT 5,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "resendAfter" TIMESTAMP(3) NOT NULL,
    "verifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "verification_otps_pkey" PRIMARY KEY ("id")
);

-- 5. Device Sessions Table
CREATE TABLE IF NOT EXISTS "device_sessions" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "deviceIdentifier" TEXT NOT NULL,
    "userAgent" TEXT,
    "ipAddress" TEXT,
    "lastSeenAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "isTrusted" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "device_sessions_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "device_sessions_userId_deviceIdentifier_key" UNIQUE ("userId", "deviceIdentifier")
);

-- 6. Dispatch Logs Table
CREATE TABLE IF NOT EXISTS "dispatch_logs" (
    "id" TEXT NOT NULL,
    "incidentId" TEXT,
    "userId" TEXT,
    "recipient" TEXT NOT NULL,
    "channel" "DispatchChannel" NOT NULL,
    "priority" "IncidentPriority" NOT NULL DEFAULT 'CRITICAL',
    "status" "DispatchStatus" NOT NULL DEFAULT 'QUEUED',
    "idempotencyKey" TEXT,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "provider" TEXT,
    "providerRef" TEXT,
    "responsePayload" JSONB,
    "errorMessage" TEXT,
    "escalated" BOOLEAN NOT NULL DEFAULT false,
    "sentAt" TIMESTAMP(3),
    "acknowledgedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "dispatch_logs_pkey" PRIMARY KEY ("id"),
    CONSTRAINT "dispatch_logs_idempotencyKey_key" UNIQUE ("idempotencyKey")
);

-- 7. Foreign Keys
DO $$ BEGIN
    ALTER TABLE "verification_otps" 
      ADD CONSTRAINT "verification_otps_userId_fkey" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "device_sessions" 
      ADD CONSTRAINT "device_sessions_userId_fkey" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE CASCADE ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

DO $$ BEGIN
    ALTER TABLE "dispatch_logs" 
      ADD CONSTRAINT "dispatch_logs_userId_fkey" 
      FOREIGN KEY ("userId") REFERENCES "users"("id") ON DELETE SET NULL ON UPDATE CASCADE;
EXCEPTION
    WHEN duplicate_object THEN null;
END $$;

-- 8. Indexes
CREATE INDEX IF NOT EXISTS "verification_otps_userId_channel_idx" ON "verification_otps"("userId", "channel");
CREATE INDEX IF NOT EXISTS "verification_otps_target_idx" ON "verification_otps"("target");
CREATE INDEX IF NOT EXISTS "device_sessions_userId_idx" ON "device_sessions"("userId");
CREATE INDEX IF NOT EXISTS "dispatch_logs_incidentId_idx" ON "dispatch_logs"("incidentId");
CREATE INDEX IF NOT EXISTS "dispatch_logs_status_idx" ON "dispatch_logs"("status");
CREATE INDEX IF NOT EXISTS "dispatch_logs_recipient_idx" ON "dispatch_logs"("recipient");
