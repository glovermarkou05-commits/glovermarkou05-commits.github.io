-- V112 DDL ROLLBACK DESIGN — REVIEW ONLY. DO NOT APPLY TO SUPABASE.
-- This script is executed ONLY in disposable PostgreSQL 17 CI.
-- Requires explicit DBA review before any real QA rollback.
-- Fail closed if any MFA ledger events remain or unfamiliar objects exist.
-- A real rollout must first stop/disable the writer and settle in-flight
-- transactions, verify absence of any legitimate business dependency, audit
-- backups and retention/incident obligations, then obtain owner approval.
BEGIN;
DO $v112$
DECLARE
  unexpected_objects integer;
  unexpected_routines integer;
  member_count integer;
  event_rows bigint;
BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_namespace WHERE nspname='mg_auth_ledger')
     OR NOT EXISTS (SELECT 1 FROM pg_roles WHERE rolname='mg_auth_ledger_writer')
     OR to_regclass('mg_auth_ledger.mfa_redemptions') IS NULL THEN
    RAISE EXCEPTION 'V112_ABORT_EXPECTED_OBJECTS_MISSING';
  END IF;
  SELECT count(*) INTO unexpected_objects
    FROM pg_class
    WHERE relnamespace='mg_auth_ledger'::regnamespace
      AND relkind IN ('r','p','v','m','f','S')
      AND relname <> 'mfa_redemptions';
  SELECT count(*) INTO unexpected_routines
    FROM pg_proc WHERE pronamespace='mg_auth_ledger'::regnamespace;
  SELECT count(*) INTO member_count
    FROM pg_auth_members
    WHERE roleid='mg_auth_ledger_writer'::regrole;
  SELECT count(*) INTO event_rows
    FROM mg_auth_ledger.mfa_redemptions;
  IF unexpected_objects<>0 OR unexpected_routines<>0 OR member_count<>0
     OR event_rows<>0 THEN
    RAISE EXCEPTION 'V112_ABORT_NONEMPTY_OR_FOREIGN_DEPENDENCIES';
  END IF;
END $v112$;
DROP POLICY v111_mfa_insert_writer ON mg_auth_ledger.mfa_redemptions;
REVOKE INSERT(event_key, verified_at, retain_until)
  ON mg_auth_ledger.mfa_redemptions FROM mg_auth_ledger_writer;
REVOKE USAGE ON SCHEMA mg_auth_ledger FROM mg_auth_ledger_writer;
DROP TABLE mg_auth_ledger.mfa_redemptions RESTRICT;
DROP SCHEMA mg_auth_ledger RESTRICT;
DROP ROLE mg_auth_ledger_writer;
COMMIT;
-- Note: the test role stubs (anon/authenticated/service_role) are CI-only and
-- intentionally not removed; a genuine Supabase rollback must never alter them.
