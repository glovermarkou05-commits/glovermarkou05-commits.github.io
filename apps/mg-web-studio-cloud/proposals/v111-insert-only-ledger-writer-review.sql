-- V111: REVIEW PROPOSAL ONLY — NOT A SUPABASE MIGRATION.
-- Use ONLY with V110 PG17 disposable CI.
-- Database role is created in CI ONLY and is NOT a credentialed production role.
-- Goal: a dedicated non-login, NO BYPASSRLS writer has INSERT privileges
-- but cannot SELECT, UPDATE, DELETE, TRUNCATE, or access auth.*.
-- All members / credentials / final deployment roles require DBA approval.
BEGIN;
CREATE ROLE mg_auth_ledger_writer
  NOLOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS;
GRANT USAGE ON SCHEMA mg_auth_ledger TO mg_auth_ledger_writer;
GRANT INSERT (event_key,verified_at,retain_until)
  ON mg_auth_ledger.mfa_redemptions TO mg_auth_ledger_writer;

-- Table has RLS ENABLE and FORCE from V110.
-- Policy only checks rows accepted for insertion.
-- The CHECK constraints in V110 validate key format and freshness.
CREATE POLICY v111_mfa_insert_writer
  ON mg_auth_ledger.mfa_redemptions
  FOR INSERT TO mg_auth_ledger_writer
  WITH CHECK (true);
COMMIT;

-- IMPORTANT: the approved backend MUST NOT need SELECT privileges.
-- Its operation is plain parameterized INSERT, no ON CONFLICT and no RETURNING.
-- Treat successful transaction COMMIT as one redemption; SQLSTATE 23505
-- indicates the event has already been redeemed and MUST DENY.
-- On timeouts / unknown commit outcome DENY and require reconciliation.
-- Do not permit retries with a new event key for the same original MFA.
-- A compromised writer could insert arbitrary hashes; require trusted,
-- independently verified subject/session/MFA and resource authorization.
-- Privileged DBA retention cleanup should be separate, audited and time-bounded.
