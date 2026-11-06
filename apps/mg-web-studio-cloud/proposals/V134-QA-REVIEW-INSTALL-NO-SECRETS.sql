-- MG WEB STUDIO AUTH QA — V134 REVIEW CANDIDATE ONLY. DO NOT EXECUTE IN QA YET.
-- Requires separate scoped approval, verified project endpoint, backups and rollback review.
-- This SQL deliberately creates LOGIN roles with PASSWORD NULL (locked).
-- The only credentials must later be set via interactive psql \password, NEVER in GitHub/SQL history.
-- Run as a single transaction (-1) ONLY after independent endpoint verification.
DO $guard$
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR pg_is_in_recovery() OR
    current_setting('mg.qa_target_project_ref',true) IS DISTINCT FROM 'tbfhiqkivsoeuudlpkgi' OR
    current_setting('mg.qa_install_approved',true) IS DISTINCT FROM 'I_REVIEWED_V134_QA_ONLY' THEN
  RAISE EXCEPTION 'V134 QA gate denied: project/session/operator approvals missing';
 END IF;
 IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN
  ('mg_qa_mfa_challenges','mg_qa_mfa_receipts'))
  OR EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
  ('mg_qa_mfa_challenge_journal','mg_qa_mfa_receipt_issuer','mg_qa_mfa_receipt_reader')) THEN
  RAISE EXCEPTION 'V134 refuses preexisting schemas or roles';
 END IF;
END $guard$;
-- This is not a backend credential provisioning method.
CREATE ROLE mg_qa_mfa_challenge_journal LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE mg_qa_mfa_receipt_issuer LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE ROLE mg_qa_mfa_receipt_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS PASSWORD NULL;
CREATE SCHEMA mg_qa_mfa_challenges AUTHORIZATION postgres;
CREATE SCHEMA mg_qa_mfa_receipts AUTHORIZATION postgres;
REVOKE ALL ON SCHEMA mg_qa_mfa_challenges,mg_qa_mfa_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE mg_qa_mfa_challenges.challenge_journal (
 proof_reference uuid PRIMARY KEY,
 challenge_id uuid NOT NULL UNIQUE,
 factor_id uuid NOT NULL,
 subject uuid NOT NULL,
 session_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN('totp','mfa/phone')),
 created_at_sec bigint NOT NULL CHECK(created_at_sec>0),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CLAIMED')),
 claimed_at_sec bigint,
 CONSTRAINT mgqa_challenge_claim_consistent CHECK (
  (state='PENDING' AND claimed_at_sec IS NULL) OR
  (state='CLAIMED' AND claimed_at_sec IS NOT NULL)
 )
);
CREATE TABLE mg_qa_mfa_receipts.verified_mfa_events (
 receipt_id uuid PRIMARY KEY,
 event_id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
 proof_reference uuid NOT NULL UNIQUE,
 subject uuid NOT NULL,
 session_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN('totp','mfa/phone')),
 verified_at_sec bigint NOT NULL CHECK(verified_at_sec>0)
);
ALTER TABLE mg_qa_mfa_challenges.challenge_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_challenges.challenge_journal FORCE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_receipts.verified_mfa_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_receipts.verified_mfa_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON mg_qa_mfa_challenges.challenge_journal,
 mg_qa_mfa_receipts.verified_mfa_events FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA mg_qa_mfa_challenges TO mg_qa_mfa_challenge_journal;
GRANT USAGE ON SCHEMA mg_qa_mfa_receipts TO mg_qa_mfa_receipt_issuer,mg_qa_mfa_receipt_reader;
GRANT SELECT(proof_reference,challenge_id,factor_id,subject,session_id,method,created_at_sec,state,claimed_at_sec)
 ON mg_qa_mfa_challenges.challenge_journal TO mg_qa_mfa_challenge_journal;
GRANT INSERT(proof_reference,challenge_id,factor_id,subject,session_id,method,created_at_sec)
 ON mg_qa_mfa_challenges.challenge_journal TO mg_qa_mfa_challenge_journal;
GRANT UPDATE(state,claimed_at_sec) ON mg_qa_mfa_challenges.challenge_journal TO mg_qa_mfa_challenge_journal;
GRANT SELECT(receipt_id,event_id,proof_reference,subject,session_id,method,verified_at_sec)
 ON mg_qa_mfa_receipts.verified_mfa_events TO mg_qa_mfa_receipt_issuer,mg_qa_mfa_receipt_reader;
GRANT INSERT(receipt_id,proof_reference,subject,session_id,method,verified_at_sec)
 ON mg_qa_mfa_receipts.verified_mfa_events TO mg_qa_mfa_receipt_issuer;
CREATE POLICY mgqa_journal_read ON mg_qa_mfa_challenges.challenge_journal
 FOR SELECT TO mg_qa_mfa_challenge_journal USING(true);
CREATE POLICY mgqa_journal_create ON mg_qa_mfa_challenges.challenge_journal
 FOR INSERT TO mg_qa_mfa_challenge_journal WITH CHECK(state='PENDING' AND claimed_at_sec IS NULL);
CREATE POLICY mgqa_journal_claim ON mg_qa_mfa_challenges.challenge_journal
 FOR UPDATE TO mg_qa_mfa_challenge_journal USING(state='PENDING')
 WITH CHECK(state='CLAIMED' AND claimed_at_sec IS NOT NULL);
CREATE POLICY mgqa_receipt_read ON mg_qa_mfa_receipts.verified_mfa_events
 FOR SELECT TO mg_qa_mfa_receipt_issuer,mg_qa_mfa_receipt_reader USING(true);
CREATE POLICY mgqa_receipt_create ON mg_qa_mfa_receipts.verified_mfa_events
 FOR INSERT TO mg_qa_mfa_receipt_issuer WITH CHECK(true);
-- FORCE RLS applies even to the owner (Supabase 'postgres' is not necessarily superuser).
-- Permit exact read-only maintenance visibility for safe nonempty rollback detection.
CREATE POLICY mgqa_journal_owner_read ON mg_qa_mfa_challenges.challenge_journal
 FOR SELECT TO postgres USING(true);
CREATE POLICY mgqa_receipt_owner_read ON mg_qa_mfa_receipts.verified_mfa_events
 FOR SELECT TO postgres USING(true);
-- Nothing is granted to anon/authenticated/service_role. No public Data API endpoint,
-- SECURITY DEFINER, auth.sessions privileges, or elevated rights.
