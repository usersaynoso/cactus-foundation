-- Core schema reconcile 003: add the SMS value to the TwoFactorMethod enum.
--
-- Added with SMS-based member 2FA. Kept in its own file, as the ONLY statement,
-- on purpose: `ALTER TYPE ... ADD VALUE` cannot run alongside other statements
-- in one implicit transaction batch on older PostgreSQL. `IF NOT EXISTS` makes
-- it idempotent (Postgres 10+), so it is a no-op once the value exists.

ALTER TYPE "TwoFactorMethod" ADD VALUE IF NOT EXISTS 'SMS';
