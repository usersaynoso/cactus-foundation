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
CREATE TYPE "ModuleStatus" AS ENUM ('pending_install', 'deploying', 'pending_deploy', 'active', 'inactive', 'failed', 'update_available');
CREATE TYPE "NotificationType" AS ENUM ('deployment', 'core_update', 'module_update', 'message');
CREATE TYPE "MenuItemType" AS ENUM ('PAGE', 'EXTERNAL', 'MODULE_ENTITY');
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
    "totpSecretEncrypted" TEXT,
    "totpVerifiedAt" TIMESTAMP(3),
    "totpLastStep" BIGINT,
    "smsOtpPhoneEncrypted" TEXT,
    CONSTRAINT "User_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Passkey" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "label" TEXT,
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
    "trustDeviceDays" INTEGER NOT NULL DEFAULT 28,
    "starterTemplatesVersion" TEXT,
    "emailFromName" TEXT,
    "emailFromAddress" TEXT,
    "emailProvider" TEXT,
    "mediaProvider" "MediaProviderType",
    "privacyPolicyPageId" TEXT,
    "termsPageId" TEXT,
    "logoMediaId" TEXT,
    "logoDarkMediaId" TEXT,
    "faviconMediaId" TEXT,
    "faviconDarkMediaId" TEXT,
    "appIconMediaId" TEXT,
    "appleTouchIconMediaId" TEXT,
    "webManifest192MediaId" TEXT,
    "webManifest512MediaId" TEXT,
    "appName" TEXT,
    "appShortName" TEXT,
    "themeColor" TEXT,
    "backgroundColor" TEXT,
    "sessionPurgeAfterDays" INTEGER NOT NULL DEFAULT 30,
    "recoveryPurgeAfterDays" INTEGER NOT NULL DEFAULT 7,
    "mainMenuId" TEXT,
    "homepageId" TEXT,
    "pendingRedeployId" TEXT,
    "pendingRedeployAt" TIMESTAMP(3),
    "designTokens" JSONB,
    "consentBannerConfig" JSONB,
    "coreUpdateChannel"     TEXT NOT NULL DEFAULT 'public',
    "membersConfig" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "SiteConfig_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "UserColourPreset" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "tokens" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "UserColourPreset_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "UserColourPreset_name_key" ON "UserColourPreset"("name");

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
    "publishedData" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "history" JSONB,
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
    "originalName" TEXT,
    "mimeType" TEXT NOT NULL,
    "sizeBytes" INTEGER NOT NULL,
    "optimised" BOOLEAN NOT NULL DEFAULT false,
    "folderId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Media_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Folder" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "parentId" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Folder_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "Tag" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "Tag_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MediaTag" (
    "mediaId" TEXT NOT NULL,
    "tagId" TEXT NOT NULL,
    CONSTRAINT "MediaTag_pkey" PRIMARY KEY ("mediaId", "tagId")
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
    "publishedData" JSONB,
    "publishedAt" TIMESTAMP(3),
    "publishedById" TEXT,
    "history" JSONB,
    "displayConditions" JSONB,
    "priority" INTEGER NOT NULL DEFAULT 0,
    "isStarter" BOOLEAN NOT NULL DEFAULT false,
    "status" "PageStatus" NOT NULL DEFAULT 'draft',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Layout_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "SavedBlock" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL,
    "componentType" TEXT NOT NULL,
    "data" JSONB NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "SavedBlock_pkey" PRIMARY KEY ("id")
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
    "moduleId" TEXT,
    "entityKind" TEXT,
    "entityId" TEXT,
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
    "pendingVersion" TEXT,
    "tablePrefix" TEXT NOT NULL,
    "status" "ModuleStatus" NOT NULL DEFAULT 'pending_install',
    "installedAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "lastError" TEXT,
    "lastCheckedAt" TIMESTAMP(3),
    "updateAvailable" TEXT,
    "updateNotes" TEXT,
    "updateChannel" TEXT NOT NULL DEFAULT 'public',
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
-- GDPR Consent Records
-- ---------------------------------------------------------------------------

CREATE TABLE "ConsentRecord" (
    "id" TEXT NOT NULL,
    "consentId" TEXT NOT NULL,
    "userId" TEXT,
    "categoriesVersion" INTEGER NOT NULL,
    "decision" JSONB NOT NULL,
    "action" TEXT NOT NULL,
    "ipTruncated" TEXT,
    "uaHash" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "ConsentRecord_pkey" PRIMARY KEY ("id")
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
    "memberId" TEXT,
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
CREATE INDEX "Media_folderId_idx" ON "Media"("folderId");

CREATE UNIQUE INDEX "Folder_parentId_name_key" ON "Folder"("parentId", "name");
CREATE INDEX "Folder_parentId_idx" ON "Folder"("parentId");

CREATE UNIQUE INDEX "Tag_name_key" ON "Tag"("name");

CREATE INDEX "MediaTag_tagId_idx" ON "MediaTag"("tagId");

CREATE INDEX "MediaMigrationJob_status_idx" ON "MediaMigrationJob"("status");
CREATE INDEX "MediaMigrationJob_startedAt_idx" ON "MediaMigrationJob"("startedAt");

CREATE UNIQUE INDEX "MenuItem_menuId_pageId_key" ON "MenuItem"("menuId", "pageId");
CREATE INDEX "MenuItem_menuId_idx" ON "MenuItem"("menuId");
CREATE INDEX "MenuItem_pageId_idx" ON "MenuItem"("pageId");

CREATE UNIQUE INDEX "Module_name_key" ON "Module"("name");
CREATE UNIQUE INDEX "Module_tablePrefix_key" ON "Module"("tablePrefix");

CREATE INDEX "ModuleMigration_moduleName_idx" ON "ModuleMigration"("moduleName");
CREATE UNIQUE INDEX "ModuleMigration_moduleName_migrationName_key" ON "ModuleMigration"("moduleName", "migrationName");

CREATE INDEX "ConsentRecord_consentId_createdAt_idx" ON "ConsentRecord"("consentId", "createdAt");
CREATE INDEX "ConsentRecord_userId_idx" ON "ConsentRecord"("userId");

CREATE UNIQUE INDEX "RateLimit_key_action_key" ON "RateLimit"("key", "action");
CREATE INDEX "RateLimit_windowStart_idx" ON "RateLimit"("windowStart");

CREATE UNIQUE INDEX "WebAuthnChallenge_challenge_key" ON "WebAuthnChallenge"("challenge");
CREATE INDEX "WebAuthnChallenge_userId_idx" ON "WebAuthnChallenge"("userId");
CREATE INDEX "WebAuthnChallenge_memberId_idx" ON "WebAuthnChallenge"("memberId");
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

ALTER TABLE "ConsentRecord" ADD CONSTRAINT "ConsentRecord_userId_fkey" FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Media" ADD CONSTRAINT "Media_uploadedById_fkey" FOREIGN KEY ("uploadedById") REFERENCES "User"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "Media" ADD CONSTRAINT "Media_folderId_fkey" FOREIGN KEY ("folderId") REFERENCES "Folder"("id") ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "Folder" ADD CONSTRAINT "Folder_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "Folder"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MediaTag" ADD CONSTRAINT "MediaTag_mediaId_fkey" FOREIGN KEY ("mediaId") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MediaTag" ADD CONSTRAINT "MediaTag_tagId_fkey" FOREIGN KEY ("tagId") REFERENCES "Tag"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_menuId_fkey" FOREIGN KEY ("menuId") REFERENCES "Menu"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_parentId_fkey" FOREIGN KEY ("parentId") REFERENCES "MenuItem"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MenuItem" ADD CONSTRAINT "MenuItem_pageId_fkey" FOREIGN KEY ("pageId") REFERENCES "InfoPage"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- ---------------------------------------------------------------------------
-- Notifications
-- ---------------------------------------------------------------------------

CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "type" "NotificationType" NOT NULL DEFAULT 'deployment',
    "title" TEXT NOT NULL,
    "reasons" JSONB,
    "link" TEXT,
    "dedupeKey" TEXT,
    "readAt" TIMESTAMP(3),
    "deployInitiatedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "Notification_type_deployInitiatedAt_idx" ON "Notification"("type", "deployInitiatedAt");
CREATE INDEX "Notification_readAt_idx" ON "Notification"("readAt");
CREATE INDEX "Notification_dedupeKey_idx" ON "Notification"("dedupeKey");

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

-- ---------------------------------------------------------------------------
-- Members (frontend identity layer — see MEMBERS_SPEC.md)
-- ---------------------------------------------------------------------------

CREATE TYPE "MemberStatus" AS ENUM ('PENDING_VERIFICATION', 'PENDING_APPROVAL', 'ACTIVE', 'SUSPENDED', 'DELETED');
CREATE TYPE "AvatarChoice" AS ENUM ('UPLOAD', 'GRAVATAR', 'GENERATED');
CREATE TYPE "TwoFactorMethod" AS ENUM ('EMAIL', 'AUTHENTICATOR_APP', 'SMS');
CREATE TYPE "NotificationChannel" AS ENUM ('EMAIL');
CREATE TYPE "DigestMode" AS ENUM ('INSTANT', 'DAILY', 'WEEKLY', 'DISABLED');
CREATE TYPE "DataExportStatus" AS ENUM ('PENDING', 'PROCESSING', 'READY', 'EXPIRED');

CREATE TABLE "Member" (
    "id" TEXT NOT NULL,
    "email" TEXT NOT NULL,
    "username" TEXT NOT NULL,
    "displayName" TEXT,
    "avatarMediaId" TEXT,
    "avatarChoice" "AvatarChoice" NOT NULL DEFAULT 'GENERATED',
    "bio" TEXT,
    "websiteUrl" TEXT,
    "trusted" BOOLEAN NOT NULL DEFAULT false,
    "status" "MemberStatus" NOT NULL DEFAULT 'PENDING_VERIFICATION',
    "roleId" TEXT,
    "emailVerified" BOOLEAN NOT NULL DEFAULT false,
    "emailVerifiedAt" TIMESTAMP(3),
    "backupEmail" TEXT,
    "suspendedUntil" TIMESTAMP(3),
    "suspensionReason" TEXT,
    "suspensionNotified" BOOLEAN NOT NULL DEFAULT false,
    "deletionRequestedAt" TIMESTAMP(3),
    "deletionScheduledAt" TIMESTAMP(3),
    "deletionExportReady" BOOLEAN NOT NULL DEFAULT false,
    "usernameChangedAt" TIMESTAMP(3),
    "previousUsername" TEXT,
    "previousUsernameExpiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "Member_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberPasskey" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "credentialId" TEXT NOT NULL,
    "publicKey" BYTEA NOT NULL,
    "counter" BIGINT NOT NULL DEFAULT 0,
    "transports" TEXT[],
    "deviceName" TEXT,
    "lastUsedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberPasskey_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberPassword" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "hash" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberPassword_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberTwoFactor" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "method" "TwoFactorMethod" NOT NULL,
    "secretEncrypted" TEXT,
    "phoneEncrypted" TEXT,
    "verified" BOOLEAN NOT NULL DEFAULT false,
    "lastStep" BIGINT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberTwoFactor_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberTrustedBrowser" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "deviceInfo" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberTrustedBrowser_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberSession" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "location" TEXT,
    "lastActiveAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberSession_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberMagicLink" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberMagicLink_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberVerificationToken" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberVerificationToken_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberEmailChallenge" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "purpose" TEXT NOT NULL,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    "attempts" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberEmailChallenge_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberRecoveryCode" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "codeHash" TEXT NOT NULL,
    "usedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberRecoveryCode_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberNotificationPreference" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "channel" "NotificationChannel" NOT NULL DEFAULT 'EMAIL',
    "category" TEXT NOT NULL,
    "digestMode" "DigestMode" NOT NULL DEFAULT 'INSTANT',
    "enabled" BOOLEAN NOT NULL DEFAULT true,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberNotificationPreference_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberConsentRecord" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "consentType" TEXT NOT NULL,
    "granted" BOOLEAN NOT NULL,
    "ipAddress" TEXT,
    "userAgent" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberConsentRecord_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberDataExportRequest" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "status" "DataExportStatus" NOT NULL DEFAULT 'PENDING',
    "mediaId" TEXT,
    "expiresAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "completedAt" TIMESTAMP(3),
    CONSTRAINT "MemberDataExportRequest_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberActivityEvent" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "source" TEXT,
    "metadata" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberActivityEvent_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberProfileVisibility" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "showBio" BOOLEAN NOT NULL DEFAULT true,
    "showJoinDate" BOOLEAN NOT NULL DEFAULT true,
    "showWebsite" BOOLEAN NOT NULL DEFAULT true,
    CONSTRAINT "MemberProfileVisibility_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberInvite" (
    "id" TEXT NOT NULL,
    "tokenHash" TEXT NOT NULL,
    "createdById" TEXT,
    "createdByName" TEXT,
    "usedAt" TIMESTAMP(3),
    "usedByMemberId" TEXT,
    "revokedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,
    CONSTRAINT "MemberInvite_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberAdminNote" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "authorId" TEXT,
    "authorName" TEXT,
    "body" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberAdminNote_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "MemberAdminActionLog" (
    "id" TEXT NOT NULL,
    "memberId" TEXT NOT NULL,
    "actorId" TEXT,
    "actorName" TEXT,
    "action" TEXT NOT NULL,
    "detail" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "MemberAdminActionLog_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "EmailTemplate" (
    "id" TEXT NOT NULL,
    "key" TEXT NOT NULL,
    "subject" TEXT NOT NULL,
    "bodyHtml" TEXT NOT NULL,
    "updatedById" TEXT,
    "updatedAt" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    CONSTRAINT "EmailTemplate_pkey" PRIMARY KEY ("id")
);

-- Members indexes

CREATE UNIQUE INDEX "Member_email_key" ON "Member"("email");
CREATE UNIQUE INDEX "Member_username_key" ON "Member"("username");
CREATE INDEX "Member_status_idx" ON "Member"("status");
CREATE INDEX "Member_previousUsername_idx" ON "Member"("previousUsername");
CREATE INDEX "Member_deletionScheduledAt_idx" ON "Member"("deletionScheduledAt");
CREATE INDEX "Member_createdAt_idx" ON "Member"("createdAt");

CREATE UNIQUE INDEX "MemberPasskey_credentialId_key" ON "MemberPasskey"("credentialId");
CREATE INDEX "MemberPasskey_memberId_idx" ON "MemberPasskey"("memberId");

CREATE UNIQUE INDEX "MemberPassword_memberId_key" ON "MemberPassword"("memberId");

CREATE UNIQUE INDEX "MemberTwoFactor_memberId_method_key" ON "MemberTwoFactor"("memberId", "method");

CREATE UNIQUE INDEX "MemberTrustedBrowser_tokenHash_key" ON "MemberTrustedBrowser"("tokenHash");
CREATE INDEX "MemberTrustedBrowser_memberId_idx" ON "MemberTrustedBrowser"("memberId");
CREATE INDEX "MemberTrustedBrowser_expiresAt_idx" ON "MemberTrustedBrowser"("expiresAt");

CREATE UNIQUE INDEX "MemberSession_tokenHash_key" ON "MemberSession"("tokenHash");
CREATE INDEX "MemberSession_memberId_idx" ON "MemberSession"("memberId");
CREATE INDEX "MemberSession_expiresAt_idx" ON "MemberSession"("expiresAt");

CREATE UNIQUE INDEX "MemberMagicLink_tokenHash_key" ON "MemberMagicLink"("tokenHash");
CREATE INDEX "MemberMagicLink_memberId_idx" ON "MemberMagicLink"("memberId");
CREATE INDEX "MemberMagicLink_expiresAt_idx" ON "MemberMagicLink"("expiresAt");

CREATE UNIQUE INDEX "MemberVerificationToken_tokenHash_key" ON "MemberVerificationToken"("tokenHash");
CREATE INDEX "MemberVerificationToken_memberId_idx" ON "MemberVerificationToken"("memberId");
CREATE INDEX "MemberVerificationToken_expiresAt_idx" ON "MemberVerificationToken"("expiresAt");

CREATE INDEX "MemberEmailChallenge_memberId_purpose_idx" ON "MemberEmailChallenge"("memberId", "purpose");
CREATE INDEX "MemberEmailChallenge_expiresAt_idx" ON "MemberEmailChallenge"("expiresAt");

CREATE UNIQUE INDEX "MemberRecoveryCode_codeHash_key" ON "MemberRecoveryCode"("codeHash");
CREATE INDEX "MemberRecoveryCode_memberId_idx" ON "MemberRecoveryCode"("memberId");

CREATE UNIQUE INDEX "MemberNotificationPreference_memberId_channel_category_key" ON "MemberNotificationPreference"("memberId", "channel", "category");

CREATE INDEX "MemberConsentRecord_memberId_idx" ON "MemberConsentRecord"("memberId");
CREATE INDEX "MemberConsentRecord_createdAt_idx" ON "MemberConsentRecord"("createdAt");

CREATE INDEX "MemberDataExportRequest_memberId_idx" ON "MemberDataExportRequest"("memberId");
CREATE INDEX "MemberDataExportRequest_status_idx" ON "MemberDataExportRequest"("status");

CREATE INDEX "MemberActivityEvent_memberId_createdAt_idx" ON "MemberActivityEvent"("memberId", "createdAt" DESC);

CREATE UNIQUE INDEX "MemberProfileVisibility_memberId_key" ON "MemberProfileVisibility"("memberId");

CREATE UNIQUE INDEX "MemberInvite_tokenHash_key" ON "MemberInvite"("tokenHash");
CREATE INDEX "MemberInvite_expiresAt_idx" ON "MemberInvite"("expiresAt");

CREATE INDEX "MemberAdminNote_memberId_createdAt_idx" ON "MemberAdminNote"("memberId", "createdAt" DESC);

CREATE INDEX "MemberAdminActionLog_memberId_createdAt_idx" ON "MemberAdminActionLog"("memberId", "createdAt" DESC);

CREATE UNIQUE INDEX "EmailTemplate_key_key" ON "EmailTemplate"("key");

-- Members foreign keys

ALTER TABLE "Member" ADD CONSTRAINT "Member_roleId_fkey" FOREIGN KEY ("roleId") REFERENCES "Role"("id") ON DELETE SET NULL ON UPDATE CASCADE;
ALTER TABLE "MemberPasskey" ADD CONSTRAINT "MemberPasskey_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberPassword" ADD CONSTRAINT "MemberPassword_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberTwoFactor" ADD CONSTRAINT "MemberTwoFactor_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberTrustedBrowser" ADD CONSTRAINT "MemberTrustedBrowser_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberSession" ADD CONSTRAINT "MemberSession_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberMagicLink" ADD CONSTRAINT "MemberMagicLink_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberVerificationToken" ADD CONSTRAINT "MemberVerificationToken_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberEmailChallenge" ADD CONSTRAINT "MemberEmailChallenge_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberRecoveryCode" ADD CONSTRAINT "MemberRecoveryCode_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberNotificationPreference" ADD CONSTRAINT "MemberNotificationPreference_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberConsentRecord" ADD CONSTRAINT "MemberConsentRecord_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberDataExportRequest" ADD CONSTRAINT "MemberDataExportRequest_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberActivityEvent" ADD CONSTRAINT "MemberActivityEvent_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberProfileVisibility" ADD CONSTRAINT "MemberProfileVisibility_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberAdminNote" ADD CONSTRAINT "MemberAdminNote_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "MemberAdminActionLog" ADD CONSTRAINT "MemberAdminActionLog_memberId_fkey" FOREIGN KEY ("memberId") REFERENCES "Member"("id") ON DELETE CASCADE ON UPDATE CASCADE;
