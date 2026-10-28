-- V90: deterministic read-only source and destination comparison.
-- Output contains ONLY four invented rows and synthetic policy/catalog names.
-- psql invoked with -q -A -t -X, each query emits stable ordered lines.
\set ON_ERROR_STOP on
SET statement_timeout='5s';
SELECT 'row|'||id||'|'||tenant_code||'|'||site_code||'|'||marker
 FROM mg_v86.records ORDER BY id;
SELECT 'table|'||c.relname||'|rls='||c.relrowsecurity||'|force='||c.relforcerowsecurity
 FROM pg_class c JOIN pg_namespace n ON c.relnamespace=n.oid
 WHERE n.nspname='mg_v86' AND c.relname='records' AND c.relkind='r'
 ORDER BY c.relname;
SELECT 'column|'||a.attnum||'|'||a.attname||'|'||
 format_type(a.atttypid,a.atttypmod)||'|notnull='||a.attnotnull
 FROM pg_attribute a JOIN pg_class c ON c.oid=a.attrelid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='mg_v86' AND c.relname='records'
 AND a.attnum>0 AND NOT a.attisdropped ORDER BY a.attnum;
SELECT 'constraint|'||co.conname||'|'||pg_get_constraintdef(co.oid, true)
 FROM pg_constraint co JOIN pg_class c ON co.conrelid=c.oid
 JOIN pg_namespace n ON n.oid=c.relnamespace
 WHERE n.nspname='mg_v86' AND c.relname='records' ORDER BY co.conname;
SELECT 'index|'||indexname||'|'||indexdef
 FROM pg_indexes WHERE schemaname='mg_v86' AND tablename='records'
 ORDER BY indexname;
SELECT 'policy|'||policyname||'|'||cmd||'|'||
 array_to_string(roles,',')||'|'||coalesce(qual,'')||'|'||coalesce(with_check,'')
 FROM pg_policies WHERE schemaname='mg_v86' AND tablename='records'
 ORDER BY policyname;
SELECT 'role|'||rolname||'|login='||rolcanlogin||'|super='||rolsuper||
 '|bypass='||rolbypassrls||'|inherit='||rolinherit||
 '|createdb='||rolcreatedb||'|createrole='||rolcreaterole
 FROM pg_roles WHERE rolname IN ('mg_v86_tenant_a','mg_v86_tenant_b','mg_v86_guest')
 ORDER BY rolname;
SELECT 'privilege|'||r.rolname||'|schema='||
 has_schema_privilege(r.rolname,'mg_v86','USAGE')||
 '|select='||has_table_privilege(r.rolname,'mg_v86.records','SELECT')||
 '|insert='||has_table_privilege(r.rolname,'mg_v86.records','INSERT')||
 '|update='||has_table_privilege(r.rolname,'mg_v86.records','UPDATE')||
 '|delete='||has_table_privilege(r.rolname,'mg_v86.records','DELETE')||
 '|truncate='||has_table_privilege(r.rolname,'mg_v86.records','TRUNCATE')
 FROM pg_roles r WHERE r.rolname IN
 ('mg_v86_tenant_a','mg_v86_tenant_b','mg_v86_guest') ORDER BY r.rolname;
SELECT 'extension|'||e.extname||'|'||e.extversion||'|'||n.nspname
 FROM pg_extension e JOIN pg_namespace n ON n.oid=e.extnamespace
 ORDER BY e.extname;
