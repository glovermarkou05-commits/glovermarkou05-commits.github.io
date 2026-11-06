-- V129 DISPOSABLE-PG17 LAB ROLLBACK CONTRACT / DBA REVIEW ONLY.
-- NOT A SUPABASE MIGRATION. NEVER RUN THIS FILE IN SUPABASE QA OR PROD.
-- Intentionally fails closed unless disposable database qa_ledger on PostgreSQL 17
-- under temporary postgres fixture; real QA rollback requires separate review,
-- renamed QA roles/schema mapping, backup, outage window and owner's approval.
-- This file is exercised ONLY by the PR #7 ephemeral GitHub workflow.
BEGIN;
SET LOCAL lock_timeout = '700ms';
SET LOCAL statement_timeout = '15s';

DO $guard$
DECLARE
  unexpected_objects integer;
  unexpected_routines integer;
  unexpected_policies integer;
  active_backend_sessions integer;
  unexpected_memberships integer;
  roles text[] := ARRAY[
    'mg_auth_ledger_writer','mg_v118_ci_backend','mg_v122_ci_auth_reader',
    'mg_v126_ci_issuer','mg_v126_ci_reader','mg_v128_ci_journal'
  ];
BEGIN
  IF current_database() <> 'qa_ledger'
     OR current_user <> 'postgres'
     OR current_setting('server_version_num')::integer < 170000
     OR current_setting('server_version_num')::integer >= 180000 THEN
    RAISE EXCEPTION 'V129_STOP_NOT_DISPOSABLE_PG17';
  END IF;

  IF (SELECT count(*) FROM pg_namespace
      WHERE nspname IN ('mg_auth_ledger','mg_v126_fictional','mg_v128_fictional')) <> 3
     OR (SELECT count(*) FROM pg_roles WHERE rolname = ANY(roles)) <> 6
     OR to_regclass('mg_auth_ledger.mfa_redemptions') IS NULL
     OR to_regclass('mg_v126_fictional.verified_mfa_events') IS NULL
     OR to_regclass('mg_v128_fictional.challenge_journal') IS NULL
     OR to_regclass('auth.sessions') IS NULL THEN
    RAISE EXCEPTION 'V129_STOP_MISSING_EXPECTED_OBJECTS';
  END IF;

  SELECT count(*) INTO unexpected_objects FROM pg_class c
  JOIN pg_namespace n ON n.oid=c.relnamespace
  WHERE n.nspname IN ('mg_auth_ledger','mg_v126_fictional','mg_v128_fictional')
    AND c.relkind IN ('r','p','v','m','f','S')
    AND NOT (
     (n.nspname='mg_auth_ledger' AND c.relname='mfa_redemptions' AND c.relkind='r') OR
     (n.nspname='mg_v126_fictional' AND c.relname='verified_mfa_events' AND c.relkind='r') OR
     (n.nspname='mg_v128_fictional' AND c.relname='challenge_journal' AND c.relkind='r')
    );
  SELECT count(*) INTO unexpected_routines FROM pg_proc p
  JOIN pg_namespace n ON n.oid=p.pronamespace
  WHERE n.nspname IN ('mg_auth_ledger','mg_v126_fictional','mg_v128_fictional');
  IF unexpected_objects <> 0 OR unexpected_routines <> 0 THEN
    RAISE EXCEPTION 'V129_STOP_FOREIGN_OBJECTS';
  END IF;

  -- Fail if any user events or journal rows are present, even if expired.
  IF EXISTS (SELECT 1 FROM mg_auth_ledger.mfa_redemptions)
     OR EXISTS (SELECT 1 FROM mg_v126_fictional.verified_mfa_events)
     OR EXISTS (SELECT 1 FROM mg_v128_fictional.challenge_journal) THEN
    RAISE EXCEPTION 'V129_STOP_NONEMPTY_PERSISTENT_EVIDENCE';
  END IF;

  -- Allow exactly one fixture membership: ledger_writer -> backend.
  SELECT count(*) INTO unexpected_memberships FROM pg_auth_members m
  JOIN pg_roles role_record ON role_record.oid=m.roleid
  JOIN pg_roles member_record ON member_record.oid=m.member
  WHERE (role_record.rolname = ANY(roles) OR member_record.rolname = ANY(roles))
    AND NOT (role_record.rolname='mg_auth_ledger_writer'
         AND member_record.rolname='mg_v118_ci_backend');
  IF unexpected_memberships<>0 OR NOT EXISTS (
    SELECT 1 FROM pg_auth_members m JOIN pg_roles r ON r.oid=m.roleid
     JOIN pg_roles member ON member.oid=m.member
    WHERE r.rolname='mg_auth_ledger_writer' AND member.rolname='mg_v118_ci_backend'
  ) THEN
    RAISE EXCEPTION 'V129_STOP_UNKNOWN_ROLE_MEMBERSHIP';
  END IF;

  SELECT count(*) INTO unexpected_policies FROM pg_policies
  WHERE schemaname IN ('mg_auth_ledger','mg_v126_fictional','mg_v128_fictional')
    AND (schemaname,tablename,policyname) NOT IN (
      ('mg_auth_ledger','mfa_redemptions','v111_mfa_insert_writer'),
      ('mg_v126_fictional','verified_mfa_events','v126_private_reader'),
      ('mg_v126_fictional','verified_mfa_events','v126_private_issuer'),
      ('mg_v128_fictional','challenge_journal','v128_reader'),
      ('mg_v128_fictional','challenge_journal','v128_insert'),
      ('mg_v128_fictional','challenge_journal','v128_claim')
    );
  IF unexpected_policies<>0 OR (SELECT count(*) FROM pg_policies
    WHERE schemaname IN ('mg_auth_ledger','mg_v126_fictional','mg_v128_fictional'))<>6 THEN
    RAISE EXCEPTION 'V129_STOP_UNKNOWN_POLICIES';
  END IF;

  SELECT count(*) INTO active_backend_sessions FROM pg_stat_activity
   WHERE datname=current_database() AND usename = ANY(roles);
  IF active_backend_sessions<>0 THEN
    RAISE EXCEPTION 'V129_STOP_CONNECTED_BACKENDS';
  END IF;
END
$guard$;

-- The rest only executes if EVERY precondition above succeeds.
-- No CASCADE, no dropping any Supabase system/public/auth schema.
REVOKE mg_auth_ledger_writer FROM mg_v118_ci_backend;
REVOKE SELECT (id,user_id,not_after) ON auth.sessions FROM mg_v122_ci_auth_reader;
REVOKE USAGE ON SCHEMA auth FROM mg_v122_ci_auth_reader;

DROP POLICY v128_claim ON mg_v128_fictional.challenge_journal;
DROP POLICY v128_insert ON mg_v128_fictional.challenge_journal;
DROP POLICY v128_reader ON mg_v128_fictional.challenge_journal;
DROP TABLE mg_v128_fictional.challenge_journal RESTRICT;
DROP SCHEMA mg_v128_fictional RESTRICT;

DROP POLICY v126_private_issuer ON mg_v126_fictional.verified_mfa_events;
DROP POLICY v126_private_reader ON mg_v126_fictional.verified_mfa_events;
DROP TABLE mg_v126_fictional.verified_mfa_events RESTRICT;
DROP SCHEMA mg_v126_fictional RESTRICT;

DROP POLICY v111_mfa_insert_writer ON mg_auth_ledger.mfa_redemptions;
DROP TABLE mg_auth_ledger.mfa_redemptions RESTRICT;
DROP SCHEMA mg_auth_ledger RESTRICT;

DROP ROLE mg_v128_ci_journal;
DROP ROLE mg_v126_ci_reader;
DROP ROLE mg_v126_ci_issuer;
DROP ROLE mg_v122_ci_auth_reader;
DROP ROLE mg_v118_ci_backend;
DROP ROLE mg_auth_ledger_writer;
COMMIT;
-- This verifies a complete teardown of the CI fixture ONLY.
-- Actual QA teardown MUST account for real-role grants, user TOTP cleanup,
-- signed-off data retention, backups, and dependencies before any DDL.
