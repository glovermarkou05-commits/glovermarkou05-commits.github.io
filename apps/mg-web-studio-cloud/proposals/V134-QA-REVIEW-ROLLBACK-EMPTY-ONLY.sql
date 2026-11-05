-- MG WEB STUDIO AUTH QA V134 — REVIEW-ONLY GUARDED ROLLBACK. NO CASCADE.
-- Requires scoped owner authorization and confirmed backup/retention decision.
-- Run with psql -1 and matching session guard only AFTER verifying endpoint.
DO $guard$
BEGIN
 IF current_database()<>'postgres' OR current_user<>'postgres' OR pg_is_in_recovery() OR
    current_setting('mg.qa_target_project_ref',true)<>'tbfhiqkivsoeuudlpkgi' OR
    current_setting('mg.qa_rollback_approved',true)<>'I_REVIEWED_V134_EMPTY_ONLY' THEN
  RAISE EXCEPTION 'V134 rollback gate denied';
 END IF;
 IF to_regclass('mg_qa_mfa_challenges.challenge_journal') IS NULL OR
    to_regclass('mg_qa_mfa_receipts.verified_mfa_events') IS NULL THEN
  RAISE EXCEPTION 'V134 rollback refuses missing expected table';
 END IF;
END $guard$;
LOCK TABLE mg_qa_mfa_challenges.challenge_journal,
 mg_qa_mfa_receipts.verified_mfa_events IN ACCESS EXCLUSIVE MODE;
DO $check$
DECLARE c1 bigint; c2 bigint; expected_count integer;
BEGIN
 -- Fail closed unless owner can actually see ALL rows via explicit owner RLS policy.
 SELECT count(*) INTO c1 FROM mg_qa_mfa_challenges.challenge_journal;
 SELECT count(*) INTO c2 FROM mg_qa_mfa_receipts.verified_mfa_events;
 SELECT count(*) INTO expected_count
 FROM pg_policies WHERE (schemaname='mg_qa_mfa_challenges' AND tablename='challenge_journal'
  AND policyname='mgqa_journal_owner_read' AND roles::text LIKE '%postgres%')
 OR (schemaname='mg_qa_mfa_receipts' AND tablename='verified_mfa_events'
  AND policyname='mgqa_receipt_owner_read' AND roles::text LIKE '%postgres%');
 IF expected_count<>2 OR
    NOT (SELECT relrowsecurity AND relforcerowsecurity
      FROM pg_class WHERE oid='mg_qa_mfa_challenges.challenge_journal'::regclass) OR
    NOT (SELECT relrowsecurity AND relforcerowsecurity
      FROM pg_class WHERE oid='mg_qa_mfa_receipts.verified_mfa_events'::regclass)
 THEN RAISE EXCEPTION 'V134 rollback: owner read policy/RLS proof missing'; END IF;
 IF c1<>0 OR c2<>0 THEN
  RAISE EXCEPTION 'V134 rollback refused: MFA evidence still present';
 END IF;
END $check$;
DROP TABLE mg_qa_mfa_challenges.challenge_journal RESTRICT;
DROP TABLE mg_qa_mfa_receipts.verified_mfa_events RESTRICT;
DROP SCHEMA mg_qa_mfa_challenges RESTRICT;
DROP SCHEMA mg_qa_mfa_receipts RESTRICT;
DROP ROLE mg_qa_mfa_challenge_journal,mg_qa_mfa_receipt_issuer,mg_qa_mfa_receipt_reader;
