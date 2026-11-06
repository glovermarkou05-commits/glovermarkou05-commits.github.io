-- V134 READ ONLY QA PREFLIGHT. Run via Supabase SQL editor or read-only API.
SELECT current_database() AS db_name,
       current_setting('server_version') AS pg_version,
       pg_is_in_recovery() AS read_replica;
SELECT (SELECT count(*) FROM auth.users)::int AS auth_users,
       (SELECT count(*) FROM auth.sessions)::int AS auth_sessions,
       (SELECT count(*) FROM auth.mfa_factors)::int AS auth_mfa_factors,
       (SELECT count(*) FROM auth.mfa_challenges)::int AS auth_mfa_challenges;
SELECT nspname FROM pg_namespace WHERE nspname IN
 ('mg_qa_mfa_challenges','mg_qa_mfa_receipts');
SELECT rolname,rolsuper,rolcreatedb,rolcreaterole,rolbypassrls,rolcanlogin
 FROM pg_roles WHERE rolname IN
 ('mg_qa_mfa_challenge_journal','mg_qa_mfa_receipt_issuer','mg_qa_mfa_receipt_reader');
-- Post-install checks (no writes):
SELECT n.nspname,c.relname,c.relrowsecurity,c.relforcerowsecurity
 FROM pg_class c JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname IN ('mg_qa_mfa_challenges','mg_qa_mfa_receipts') AND c.relkind='r';
SELECT pg_catalog.has_schema_privilege('anon','mg_qa_mfa_receipts','USAGE') AS anon_receipts_usage,
       pg_catalog.has_schema_privilege('authenticated','mg_qa_mfa_challenges','USAGE') AS auth_journal_usage,
       pg_catalog.has_schema_privilege('service_role','mg_qa_mfa_receipts','USAGE') AS service_receipts_usage;
-- IMPORTANT: run last SELECT only after installation, since absent schema returns error.
