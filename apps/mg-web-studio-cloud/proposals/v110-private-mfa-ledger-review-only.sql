-- V110 SECURITY REVIEW ONLY. NOT A DEPLOYMENT MIGRATION.
-- DO NOT APPLY TO SUPABASE without separate DBA + owner approval.
-- This SQL is applied ONLY by a disposable PostgreSQL 17 container in CI.
-- No auth.* tables, views, SECURITY DEFINER, exposed RPCs or public grants.
-- Assumes predefined Supabase roles anon/authenticated/service_role; for
-- standalone CI, disposable role stubs are created in the job beforehand.
BEGIN;

CREATE SCHEMA mg_auth_ledger;
REVOKE ALL ON SCHEMA mg_auth_ledger FROM PUBLIC;
REVOKE ALL ON SCHEMA mg_auth_ledger FROM anon, authenticated, service_role;

CREATE TABLE mg_auth_ledger.mfa_redemptions (
    event_key text COLLATE "C" PRIMARY KEY,
    verified_at timestamptz NOT NULL,
    consumed_at timestamptz NOT NULL DEFAULT clock_timestamp(),
    retain_until timestamptz NOT NULL,
    CONSTRAINT v110_event_hash_lower_hex CHECK (event_key ~ '^[0-9a-f]{64}$'),
    CONSTRAINT v110_verification_within_window CHECK (
        verified_at <= consumed_at + interval '3 seconds'
        AND consumed_at <= verified_at + interval '300 seconds'
    ),
    CONSTRAINT v110_durable_tombstone CHECK (
        retain_until >= verified_at + interval '310 seconds'
        AND retain_until > consumed_at
    )
);
ALTER TABLE mg_auth_ledger.mfa_redemptions ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_auth_ledger.mfa_redemptions FORCE ROW LEVEL SECURITY;

-- No policies: fail closed for non-owners.
-- A future reviewed backend role/policy is REQUIRED before application use.
REVOKE ALL ON TABLE mg_auth_ledger.mfa_redemptions FROM PUBLIC;
REVOKE ALL ON TABLE mg_auth_ledger.mfa_redemptions
  FROM anon, authenticated, service_role;
COMMIT;

-- Intended atomic consume primitive (REVIEW DESIGN, not executed by SQL file):
-- WITH t AS (SELECT transaction_timestamp() AS now_at)
-- INSERT INTO mg_auth_ledger.mfa_redemptions
--   (event_key, verified_at, retain_until)
-- SELECT :trusted_hmac_event_key, t.now_at - interval '10 seconds',
--        t.now_at + interval '300 seconds'
-- FROM t
-- ON CONFLICT (event_key) DO NOTHING
-- RETURNING event_key;
--
-- Return exactly one row ONLY on successful insert+commit.
-- The commercial action and ledger MUST share an audited transaction or
-- recovery/idempotency protocol. Do not infer end-to-end authorization here.
-- All public API roles must stay unable to USAGE this private schema.
