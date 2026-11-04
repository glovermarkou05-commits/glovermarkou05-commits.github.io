-- V133 DISPOSABLE QA-LIKE LAB ONLY, NEVER SUPABASE QA.
-- This script has an enforced database-name gate and fixed synthetic passwords.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
  IF current_database() <> 'qa_ledger' OR current_user <> 'postgres' THEN
    RAISE EXCEPTION 'DISPOSABLE ONLY: qa_ledger as postgres required';
  END IF;
  IF EXISTS(SELECT 1 FROM pg_namespace WHERE nspname IN
     ('mg_qa_mfa_challenges','mg_qa_mfa_receipts')) OR
     EXISTS(SELECT 1 FROM pg_roles WHERE rolname IN
     ('mg_qa_mfa_challenge_journal','mg_qa_mfa_receipt_issuer',
      'mg_qa_mfa_receipt_reader')) THEN
    RAISE EXCEPTION 'LAB PREEXISTING OBJECT: refuse overwrite';
  END IF;
END $$;
CREATE ROLE anon NOLOGIN;
CREATE ROLE authenticated NOLOGIN;
CREATE ROLE service_role NOLOGIN;
CREATE ROLE mg_qa_mfa_challenge_journal LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
 PASSWORD 'synthetic-v133-journal';
CREATE ROLE mg_qa_mfa_receipt_issuer LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
 PASSWORD 'synthetic-v133-issuer';
CREATE ROLE mg_qa_mfa_receipt_reader LOGIN NOINHERIT NOSUPERUSER NOCREATEDB NOCREATEROLE NOREPLICATION NOBYPASSRLS
 PASSWORD 'synthetic-v133-reader';
CREATE SCHEMA mg_qa_mfa_challenges;
CREATE SCHEMA mg_qa_mfa_receipts;
REVOKE ALL ON SCHEMA mg_qa_mfa_challenges,mg_qa_mfa_receipts FROM PUBLIC,anon,authenticated,service_role;
CREATE TABLE mg_qa_mfa_challenges.challenge_journal(
 proof_reference uuid PRIMARY KEY,
 challenge_id uuid NOT NULL UNIQUE,
 factor_id uuid NOT NULL,
 subject uuid NOT NULL,
 session_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('totp','mfa/phone')),
 created_at_sec bigint NOT NULL CHECK(created_at_sec>0),
 state text NOT NULL DEFAULT 'PENDING' CHECK(state IN ('PENDING','CLAIMED')),
 claimed_at_sec bigint,
 CONSTRAINT state_and_claim_consistent CHECK (
  (state='PENDING' AND claimed_at_sec IS NULL) OR
  (state='CLAIMED' AND claimed_at_sec IS NOT NULL))
);
CREATE TABLE mg_qa_mfa_receipts.verified_mfa_events(
 receipt_id uuid PRIMARY KEY,
 event_id uuid NOT NULL UNIQUE DEFAULT pg_catalog.gen_random_uuid(),
 proof_reference uuid NOT NULL UNIQUE,
 subject uuid NOT NULL,
 session_id uuid NOT NULL,
 method text NOT NULL CHECK(method IN ('totp','mfa/phone')),
 verified_at_sec bigint NOT NULL CHECK(verified_at_sec>0)
);
ALTER TABLE mg_qa_mfa_challenges.challenge_journal ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_challenges.challenge_journal FORCE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_receipts.verified_mfa_events ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_qa_mfa_receipts.verified_mfa_events FORCE ROW LEVEL SECURITY;
REVOKE ALL ON mg_qa_mfa_challenges.challenge_journal,mg_qa_mfa_receipts.verified_mfa_events
 FROM PUBLIC,anon,authenticated,service_role;
GRANT USAGE ON SCHEMA mg_qa_mfa_challenges TO mg_qa_mfa_challenge_journal;
GRANT USAGE ON SCHEMA mg_qa_mfa_receipts TO mg_qa_mfa_receipt_issuer,mg_qa_mfa_receipt_reader;
GRANT SELECT (proof_reference,challenge_id,factor_id,subject,session_id,method,created_at_sec,state,claimed_at_sec)
 ON mg_qa_mfa_challenges.challenge_journal TO mg_qa_mfa_challenge_journal;
GRANT INSERT (proof_reference,challenge_id,factor_id,subject,session_id,method,created_at_sec)
 ON mg_qa_mfa_challenges.challenge_journal TO mg_qa_mfa_challenge_journal;
GRANT UPDATE (state,claimed_at_sec) ON mg_qa_mfa_challenges.challenge_journal TO mg_qa_mfa_challenge_journal;
GRANT SELECT (receipt_id,event_id,proof_reference,subject,session_id,method,verified_at_sec)
 ON mg_qa_mfa_receipts.verified_mfa_events TO mg_qa_mfa_receipt_issuer,mg_qa_mfa_receipt_reader;
GRANT INSERT (receipt_id,proof_reference,subject,session_id,method,verified_at_sec)
 ON mg_qa_mfa_receipts.verified_mfa_events TO mg_qa_mfa_receipt_issuer;
CREATE POLICY qa_journal_select ON mg_qa_mfa_challenges.challenge_journal
 FOR SELECT TO mg_qa_mfa_challenge_journal USING (true);
CREATE POLICY qa_journal_insert ON mg_qa_mfa_challenges.challenge_journal
 FOR INSERT TO mg_qa_mfa_challenge_journal WITH CHECK(state='PENDING' AND claimed_at_sec IS NULL);
CREATE POLICY qa_journal_update ON mg_qa_mfa_challenges.challenge_journal
 FOR UPDATE TO mg_qa_mfa_challenge_journal
 USING(state='PENDING')
 WITH CHECK(state='CLAIMED' AND claimed_at_sec IS NOT NULL);
CREATE POLICY qa_receipt_select ON mg_qa_mfa_receipts.verified_mfa_events
 FOR SELECT TO mg_qa_mfa_receipt_issuer,mg_qa_mfa_receipt_reader USING (true);
CREATE POLICY qa_receipt_insert ON mg_qa_mfa_receipts.verified_mfa_events
 FOR INSERT TO mg_qa_mfa_receipt_issuer WITH CHECK (true);
COMMIT;
