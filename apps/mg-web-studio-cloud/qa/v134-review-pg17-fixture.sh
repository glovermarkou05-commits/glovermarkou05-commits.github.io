#!/bin/bash
set -euo pipefail
test "$CI" = true
test "$V134_DISPOSABLE_ONLY" = 1
test -n "$PG_CONTAINER"
docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres -c 'CREATE ROLE anon NOLOGIN; CREATE ROLE authenticated NOLOGIN; CREATE ROLE service_role NOLOGIN;'
if docker exec -i "$PG_CONTAINER" psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d postgres < proposals/V134-QA-REVIEW-INSTALL-NO-SECRETS.sql >/tmp/v134-negative.log 2>&1; then
 echo "FAIL: install without approval"; exit 1
fi
grep -q 'V134 QA gate denied' /tmp/v134-negative.log
if docker exec -i -e PGOPTIONS='-c mg.qa_target_project_ref=wrong-qa-project -c mg.qa_install_approved=I_REVIEWED_V134_QA_ONLY' "$PG_CONTAINER" psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d postgres < proposals/V134-QA-REVIEW-INSTALL-NO-SECRETS.sql >/tmp/v134-wrong-project.log 2>&1; then
 echo "FAIL: wrong project accepted"; exit 1
fi
grep -q 'V134 QA gate denied' /tmp/v134-wrong-project.log
echo "QA_MISSING_AND_WRONG_PROJECT_GUARDS_PASS"
docker exec -i -e PGOPTIONS='-c mg.qa_target_project_ref=tbfhiqkivsoeuudlpkgi -c mg.qa_install_approved=I_REVIEWED_V134_QA_ONLY' "$PG_CONTAINER" psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d postgres < proposals/V134-QA-REVIEW-INSTALL-NO-SECRETS.sql
check=$(docker exec -i "$PG_CONTAINER" psql -X -tA -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
SELECT
 (SELECT count(*)=3 FROM pg_authid WHERE rolname LIKE 'mg_qa_mfa_%' AND rolpassword IS NULL AND rolcanlogin AND NOT rolsuper AND NOT rolbypassrls)
 AND (SELECT count(*)=2 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid WHERE n.nspname IN ('mg_qa_mfa_challenges','mg_qa_mfa_receipts') AND c.relkind='r' AND c.relrowsecurity AND c.relforcerowsecurity)
 AND (SELECT count(*)=7 FROM pg_policies WHERE schemaname IN ('mg_qa_mfa_challenges','mg_qa_mfa_receipts'))
 AND NOT has_schema_privilege('anon','mg_qa_mfa_challenges','USAGE')
 AND NOT has_schema_privilege('authenticated','mg_qa_mfa_receipts','USAGE')
 AND NOT has_schema_privilege('service_role','mg_qa_mfa_receipts','USAGE')
 AND NOT has_table_privilege('mg_qa_mfa_receipt_reader','mg_qa_mfa_receipts.verified_mfa_events','INSERT')
 AND NOT has_column_privilege('mg_qa_mfa_challenge_journal','mg_qa_mfa_challenges.challenge_journal','subject','UPDATE');
SQL
)
test "$check" = t
echo "QA_ROLE_NULL_PASSWORD_AND_FORCE_RLS_PASS"
docker exec -i "$PG_CONTAINER" psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
SET ROLE mg_qa_mfa_challenge_journal;
INSERT INTO mg_qa_mfa_challenges.challenge_journal(proof_reference,challenge_id,factor_id,subject,session_id,method,created_at_sec)
VALUES ('11111111-1111-4111-8111-111111111111','22222222-2222-4222-8222-222222222222','33333333-3333-4333-8333-333333333333','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','totp',2000000000);
UPDATE mg_qa_mfa_challenges.challenge_journal SET state='CLAIMED',claimed_at_sec=2000000001;
RESET ROLE;
SET ROLE mg_qa_mfa_receipt_issuer;
INSERT INTO mg_qa_mfa_receipts.verified_mfa_events(receipt_id,proof_reference,subject,session_id,method,verified_at_sec)
VALUES ('66666666-6666-4666-8666-666666666666','11111111-1111-4111-8111-111111111111','44444444-4444-4444-8444-444444444444','55555555-5555-4555-8555-555555555555','totp',2000000001);
RESET ROLE;
SQL
if docker exec -i "$PG_CONTAINER" psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d postgres < proposals/V134-QA-REVIEW-ROLLBACK-EMPTY-ONLY.sql >/tmp/v134-no-rollback-approval.log 2>&1; then
 echo "FAIL: rollback without approval"; exit 1
fi
grep -q 'V134 rollback gate denied' /tmp/v134-no-rollback-approval.log
echo "QA_ROLLBACK_MISSING_APPROVAL_GUARD_PASS"
if docker exec -i -e PGOPTIONS='-c mg.qa_target_project_ref=tbfhiqkivsoeuudlpkgi -c mg.qa_rollback_approved=I_REVIEWED_V134_EMPTY_ONLY' "$PG_CONTAINER" psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d postgres < proposals/V134-QA-REVIEW-ROLLBACK-EMPTY-ONLY.sql >/tmp/v134-rollback-negative.log 2>&1; then
 echo "FAIL: rollback deleted evidence"; exit 1
fi
grep -q 'V134 rollback refused: MFA evidence still present' /tmp/v134-rollback-negative.log
echo "QA_ROLLBACK_PRESERVES_NONEMPTY_DATA_PASS"
docker exec -i "$PG_CONTAINER" psql -X -v ON_ERROR_STOP=1 -U postgres -d postgres <<'SQL'
DELETE FROM mg_qa_mfa_receipts.verified_mfa_events;
DELETE FROM mg_qa_mfa_challenges.challenge_journal;
SQL
docker exec -i -e PGOPTIONS='-c mg.qa_target_project_ref=tbfhiqkivsoeuudlpkgi -c mg.qa_rollback_approved=I_REVIEWED_V134_EMPTY_ONLY' "$PG_CONTAINER" psql -X -1 -v ON_ERROR_STOP=1 -U postgres -d postgres < proposals/V134-QA-REVIEW-ROLLBACK-EMPTY-ONLY.sql
check=$(docker exec -i "$PG_CONTAINER" psql -X -tA -v ON_ERROR_STOP=1 -U postgres -d postgres -c "SELECT to_regnamespace('mg_qa_mfa_challenges') IS NULL AND to_regnamespace('mg_qa_mfa_receipts') IS NULL AND (SELECT count(*)=0 FROM pg_roles WHERE rolname LIKE 'mg_qa_mfa_%')")
test "$check" = t
echo "QA_ROLLBACK_EMPTY_ONLY_REMOVES_ALL_PASS"
