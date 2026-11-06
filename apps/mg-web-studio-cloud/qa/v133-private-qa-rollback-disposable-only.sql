-- V133 DISPOSABLE ONLY: never run against Supabase QA, no CASCADE.
\set ON_ERROR_STOP on
BEGIN;
DO $$
BEGIN
 IF current_database() <> 'qa_ledger' OR current_user <> 'postgres' THEN
  RAISE EXCEPTION 'DISPOSABLE ONLY: qa_ledger as postgres required';
 END IF;
 IF EXISTS(SELECT 1 FROM mg_qa_mfa_challenges.challenge_journal) OR
    EXISTS(SELECT 1 FROM mg_qa_mfa_receipts.verified_mfa_events) THEN
  RAISE EXCEPTION 'NONEMPTY: preserve evidence';
 END IF;
END $$;
DROP TABLE mg_qa_mfa_challenges.challenge_journal RESTRICT;
DROP TABLE mg_qa_mfa_receipts.verified_mfa_events RESTRICT;
DROP SCHEMA mg_qa_mfa_challenges RESTRICT;
DROP SCHEMA mg_qa_mfa_receipts RESTRICT;
DROP ROLE mg_qa_mfa_challenge_journal,mg_qa_mfa_receipt_issuer,mg_qa_mfa_receipt_reader;
COMMIT;
