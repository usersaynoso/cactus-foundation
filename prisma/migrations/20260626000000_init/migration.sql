-- Cactus Foundation — single combined init migration
-- Applied on fresh install via `prisma migrate deploy` in the Vercel build step.
-- This file represents the complete schema; no incremental migrations needed
-- because Cactus has no live deployments to preserve.

CREATE SCHEMA IF NOT EXISTS "public";

-- ---------------------------------------------------------------------------
-- Enums
-- ---------------------------------------------------------------------------

CREATE TYPE "SiteStatus" AS ENUM ('live', 'comingSoon', 'maintenance');
CREATE TYPE "PageStatus" AS ENUM ('draft', 'published');
CREATE TYPE "BodyFormat" AS ENUM ('markdown', 'builder');
CREATE TYPE "ModuleStatus" AS ENUM ('pending_install', 'deploying', 'active', 'inactive', 'failed', 'update_available');
CREATE TYPE "MenuItemType" AS ENUM ('PAGE', 'EXTERNAL');
CREATE TYPE "MediaProviderType" AS ENUM ('B2', 'R2', 'S3', 'SPACES', 'WASABI', 'MINIO', 'VERCEL_BLOB', 'SUPABASE_STORAGE', 'CLOUDINARY', 'IMAGEKIT');

-- ---------------------------------------------------------------------------
-- Auth
-- ---------------------------------------------------------------------------

CREATE TABLE "User" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "passwordHash" TEXT,
    "roleId" TEXT NOT NULL,
    "emailVerifiedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "suspendedAt" TIMESTAMP(3),
    "acceptedPrivacyPolicyAt" TIMESTAMP(3),
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Passkey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Session" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Session_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "TrustedDevice" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "TrustedDevice_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "RecoveryRequest" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "used" BOOLEAN NOT NULL DEFAULT false,
    CONSTRAINT "RecoveryRequest_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Roles & Permissions
-- ---------------------------------------------------------------------------

CREATE TABLE "Role" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "isProtected" BOOLEAN NOT NULL DEFAULT false,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Role_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Permission" (
    "key" TEXT NOT NULL,
    "description" TEXT,
    "module" TEXT,
    CONSTRAINT "Permission_pkey" PRIMARY KEY ("key")
);

CREATE TABLE "RolePermission" (
    "roleId" TEXT NOT NULL,
    "permissionKey" TEXT NOT NULL,
    CONSTRAINT "RolePermission_pkey" PRIMARY KEY ("roleId","permissionKey")
);

-- ---------------------------------------------------------------------------
-- Site Configuration
-- ---------------------------------------------------------------------------

CREATE TABLE "SiteConfig" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "siteName" TEXT NOT NULL DEFAULT 'My Cactus Site',
    "tagline" TEXT,
    "description" TEXT,
    "timezone" TEXT NOT NULL DEFAULT 'UTC',
    "locale" TEXT NOT NULL DEFAULT 'en-GB',
    "dateFormat" TEXT NOT NULL DEFAULT 'DD/MM/YYYY',
    "timeFormat" TEXT NOT NULL DEFAULT 'HH:mm',
    "adminPath" TEXT NOT NULL,
    "setupCompleted" BOOLEAN NOT NULL DEFAULT false,
    "status" "SiteStatus" NOT NULL DEFAULT 'comingSoon',
    "hideFromCrawlers" BOOLEAN NOT NULL DEFAULT true,
    "publicRegistration" BOOLEAN NOT NULL DEFAULT true,
    "defaultRoleId" TEXT,
    "trustDeviceDays" INTEGER NOT NULL DEFAULT 28,
    "emailFromName" TEXT,
    "emailFromAddress" TEXT,
    "emailProvider" TEXT,
    "mediaProvider" "MediaProviderType",
    "privacyPolicyPageId" TEXT,
    "termsPageId" TEXT,
    "logoMediaId" TEXT,
    "faviconMediaId" TEXT,
    "sessionPurgeAfterDays" INTEGER NOT NULL DEFAULT 30,
    "recoveryPurgeAfterDays" INTEGER NOT NULL DEFAULT 7,
    "mainMenuId" TEXT,
    "homepageId" TEXT,
    "pendingRedeployId" TEXT,
    "designTokens" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Info Pages
-- ---------------------------------------------------------------------------

CREATE TABLE "InfoPage" (
    "id" TEXT NOT NULL,
    "slug" TEXT NOT NULL,
    "title" TEXT NOT NULL,
    "body" TEXT NOT NULL,
    "bodyFormat" "BodyFormat" NOT NULL DEFAULT 'markdown',
    "builderData" JSONB,
    "status" "PageStatus" NOT NULL DEFAULT 'draft',
    "metaDescription" TEXT,
    "ogImageId" TEXT,
    "createdById" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "InfoPage_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Media
-- ---------------------------------------------------------------------------

CREATE TABLE "Media" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "provider" "MediaProviderType" NOT NULL,
    "url" TEXT NOT NULL,
    "uploadedById" TEXT,
    "altText" TEXT,
    "isDecorative" BOOLEAN NOT NULL DEFAULT false,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaMigrationJob" (
    "id" TEXT NOT NULL,
    "toProvider" "MediaProviderType" NOT NULL,
    "status" TEXT NOT NULL,
    "totalItems" INTEGER NOT NULL,
    "migratedItems" INTEGER NOT NULL DEFAULT 0,
    "failedItemIds" JSONB NOT NULL DEFAULT '[]',
    "cursor" TEXT,
    "startedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    "lastError" TEXT,
    CONSTRAINT "MediaMigrationJob_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Layouts
-- ---------------------------------------------------------------------------

CREATE TABLE "Layout" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "type" TEXT NOT NULL DEFAULT 'infoPage',
    "description" TEXT,
    "builderData" JSONB,
    "displayConditions" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "status" "PageStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Layout_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Menus
-- ---------------------------------------------------------------------------

CREATE TABLE "Menu" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Menu_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MenuItem" (
    "id" TEXT NOT NULL,
    "menuId" TEXT NOT NULL,
    "parentId" TEXT,
    "type" "MenuItemType" NOT NULL,
    "pageId" TEXT,
    "label" TEXT,
    "url" TEXT,
    "openInNewTab" BOOLEAN NOT NULL DEFAULT false,
    "order" INTEGER NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MenuItem_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Modules
-- ---------------------------------------------------------------------------

CREATE TABLE "Module" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "repoUrl" TEXT NOT NULL,
    "version" TEXT NOT NULL,
    "tablePrefix" TEXT NOT NULL,
    "status" "ModuleStatus" NOT NULL DEFAULT 'pending_install',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "updateAvailable" TEXT,
    "updateNotes" TEXT,
    "manifest" JSONB,
    CONSTRAINT "Module_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ModuleMigration" (
    "id" TEXT NOT NULL,
    "moduleName" TEXT NOT NULL,
    "migrationName" TEXT NOT NULL,
    "appliedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "checksum" TEXT NOT NULL,
    CONSTRAINT "ModuleMigration_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "DeployLock" (
    "id" TEXT NOT NULL DEFAULT 'singleton',
    "lockedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lockedBy" TEXT NOT NULL,
    CONSTRAINT "DeployLock_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Rate Limiting & WebAuthn
-- ---------------------------------------------------------------------------

CREATE TABLE "RateLimit" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 1,
    "windowStart" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "RateLimit_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "WebAuthnChallenge" (
    "id" TEXT NOT NULL,
    "userId" TEXT,
    "challenge" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "WebAuthnChallenge_pkey" PRIMARY KEY ("id")
);

-- ---------------------------------------------------------------------------
-- Indexes
-- ---------------------------------------------------------------------------

CREATE UNIQUE INDEX "User_email_key" ON "User"("email");
CREATE UNIQUE INDEX "User_username_key" ON "User"("username");
CREATE INDEX "User_email_idx" ON "User"("email");
CREATE INDEX "User_username_idx" ON "User"("username");

CREATE UNIQUE INDEX "Passkey_credentialId_key" ON "Passkey"("credentialId");
CREATE INDEX "Passkey_userId_idx" ON "Passkey"("userId");

CREATE UNIQUE INDEX "Session_tokenHash_key" ON "Session"("tokenHash");
CREATE INDEX "Session_userId_idx" ON "Session"("userId");
CREATE INDEX "Session_expiresAt_idx" ON "Session"("expiresAt");

CREATE UNIQUE INDEX "TrustedDevice_tokenHash_key" ON "TrustedDevice"("tokenHash");
CREATE INDEX "TrustedDevice_userId_idx" ON "TrustedDevice"("userId");
CREATE INDEX "TrustedDevice_expiresAt_idx" ON "TrustedDevice"("expiresAt");

CREATE INDEX "EmailChallenge_userId_purpose_idx" ON "EmailChallenge"("userId", "purpose");
CREATE INDEX "EmailChallenge_expiresAt_idx" ON "EmailChallenge"("expiresAt");

CREATE UNIQUE INDEX "RecoveryRequest_tokenHash_key" ON "RecoveryRequest"("tokenHash");
CREATE INDEX "RecoveryRequest_userId_idx" ON "RecoveryRequest"("userId");
CREATE INDEX "RecoveryRequest_expiresAt_idx" ON "RecoveryRequest"("expiresAt");

CREATE UNIQUE INDEX "Role_name_key" ON "Role"("name");

CREATE UNIQUE INDEX "SiteConfig_adminPath_key" ON "SiteConfig"("adminPath");

CREATE UNIQUE INDEX "InfoPage_slug_key" ON "InfoPage"("slug");
CREATE INDEX "InfoPage_slug_idx" ON "InfoPage"("slug");
CREATE INDEX "InfoPage_status_idx" ON "InfoPage"("status");

CREATE UNIQUE INDEX "Media_key_key" ON "Media"("key");
CREATE INDEX "Media_uploadedById_idx" ON "Media"("uploadedById");
CREATE INDEX "Media_createdAt_idx" ON "Media"("createdAt");
CREATE INDEX "Media_provider_idx" ON "Media"("provider");

CREATE INDEX "MediaMigrationJob_status_idx" ON "MediaMigrationJob"("status");
CREATE INDEX "MediaMigrationJob_startedAt_idx" ON "MediaMigrationJob"("startedAt");

CREATE UNIQUE INDEX "MenuItem_menuId_pageId_key" ON "MenuItem"("menuId", "pageId");
CREATE INDEX "MenuItem_menuId_idx" ON "MenuItem"("menuId");
CREATE INDEX "MenuItem_pageId_idx" ON "MenuItem"("pageId");

CREATE UNIQUE INDEX "Module_name_key" ON "Module"("name");
CREATE UNIQUE INDEX "Module_tablePrefix_key" ON "Module"("tablePrefix");

CREATE INDEX "ModuleMigration_moduleName_idx" ON "ModuleMigration"("moduleName");
CREATE UNIQUE INDEX "ModuleMigration_moduleName_migrationName_key" ON "ModuleMigration"("moduleName", "migrationName");

CREATE UNIQUE INDEX "RateLimit_key_action_key" ON "RateLimit"("key", "action");
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

CREATE UNIQUE INDEX "WebAuthnChallenge_challenge_key" ON "WebAuthnChallenge"("challenge");
CREATE INDEX "WebAuthnChallenge_userId_idx" ON "WebAuthnChallenge"("userId");
CREATE INDEX "WebAuthnChallenge_expiresAt_idx" ON "WebAuthnChallenge"("expiresAt");

-- ---------------------------------------------------------------------------
-- Foreign Keys
-- ---------------------------------------------------------------------------

ALTER TABLE "User" ADD CONSTRAINT "User_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "Passkey" ADD CONSTRAINT "Passkey_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "Session" ADD CONSTRAINT "Session_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "TrustedDevice" ADD CONSTRAINT "TrustedDevice_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "EmailChallenge" ADD CONSTRAINT "EmailChallenge_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RecoveryRequest" ADD CONSTRAINT "RecoveryRequest_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "RolePermission" ADD CONSTRAINT "RolePermission_permissionKey_fkey" FOREIGN KEY ("permissionKey") REFERENCES "Permission"("key") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "InfoPage" ADD CONSTRAINT "InfoPage_createdById_fkey" FOREIGN KEY ("createdById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "InfoPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- GitHub App Connection
-- ---------------------------------------------------------------------------

CREATE TABLE "GithubAppConnection" (
    "id" TEXT NOT NULL,
    "appId" TEXT NOT NULL,
    "appSlug" TEXT NOT NULL,
    "installationId" TEXT,
    "installationAccount" TEXT,
    "privateKeyEncrypted" TEXT NOT NULL,
    "webhookSecretEncrypted" TEXT,
    "clientIdEncrypted" TEXT,
    "clientSecretEncrypted" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "GithubAppConnection_pkey" PRIMARY KEY ("id")
);
