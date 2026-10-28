-- V86: real SQL security assertions inside disposable, networkless PostgreSQL.
\set ON_ERROR_STOP on
\pset pager off
SET statement_timeout='5s';
SET lock_timeout='2s';

-- Infrastructure, roles, RLS and grant audit as cluster bootstrap owner.
DO $guard$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM pg_roles
   WHERE rolname IN ('mg_v86_tenant_a','mg_v86_tenant_b','mg_v86_guest')
     AND NOT rolsuper AND NOT rolbypassrls AND NOT rolcreatedb AND NOT rolcreaterole
     AND NOT rolcanlogin;
  IF n<>3 THEN RAISE EXCEPTION 'V86_ROLE_CAPABILITIES_FAIL'; END IF;
  SELECT count(*) INTO n FROM pg_class c
  JOIN pg_namespace ns ON ns.oid=c.relnamespace
  WHERE ns.nspname='mg_v86' AND c.relname='records'
    AND c.relrowsecurity AND c.relforcerowsecurity;
  IF n<>1 THEN RAISE EXCEPTION 'V86_RLS_ENFORCEMENT_FAIL'; END IF;
  SELECT count(*) INTO n FROM pg_policies
   WHERE schemaname='mg_v86' AND tablename='records'
     AND policyname IN ('scope_demo_a','scope_demo_b');
  IF n<>2 THEN RAISE EXCEPTION 'V86_POLICIES_FAIL'; END IF;
  IF has_table_privilege('mg_v86_tenant_a','mg_v86.records','TRUNCATE')
    OR has_table_privilege('mg_v86_tenant_b','mg_v86.records','TRUNCATE')
    OR has_table_privilege('mg_v86_guest','mg_v86.records','INSERT')
    OR has_table_privilege('mg_v86_guest','mg_v86.records','UPDATE')
    OR has_table_privilege('mg_v86_guest','mg_v86.records','DELETE')
    THEN RAISE EXCEPTION 'V86_GRANTS_FAIL'; END IF;
  SELECT count(*) INTO n FROM mg_v86.records;
  IF n<>4 THEN RAISE EXCEPTION 'V86_FIXTURES_FAIL'; END IF;
END $guard$;
\echo 'V86 AUDIT: roles=3 least_privilege=true; rls=enabled_forced; policies=2; synthetic_rows=4'

-- Role A can see only its ONE permitted site, despite tenant A having two.
BEGIN;
SET LOCAL ROLE mg_v86_tenant_a;
DO $a$
DECLARE n integer;
BEGIN
  IF current_user<>'mg_v86_tenant_a' THEN
    RAISE EXCEPTION 'V86_A_ROLE_NOT_EFFECTIVE'; END IF;
  SELECT count(*) INTO n FROM mg_v86.records;
  IF n<>1 THEN RAISE EXCEPTION 'V86_A_SCOPE_LEAK'; END IF;
  SELECT count(*) INTO n FROM mg_v86.records
    WHERE tenant_code<>'DEMO-A' OR site_code<>'A-01';
  IF n<>0 THEN RAISE EXCEPTION 'V86_A_FOREIGN_READ'; END IF;

  UPDATE mg_v86.records SET marker='synthetic-a-update' WHERE id=1;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'V86_A_OWN_UPDATE_DENIED'; END IF;
  UPDATE mg_v86.records SET marker='forbidden' WHERE id=3;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'V86_A_FOREIGN_UPDATE'; END IF;
  DELETE FROM mg_v86.records WHERE id=4;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'V86_A_FOREIGN_DELETE'; END IF;

  INSERT INTO mg_v86.records VALUES(101,'DEMO-A','A-01','synthetic-test');
  SELECT count(*) INTO n FROM mg_v86.records WHERE id=101;
  IF n<>1 THEN RAISE EXCEPTION 'V86_A_OWN_INSERT_DENIED'; END IF;

  BEGIN
    INSERT INTO mg_v86.records VALUES(102,'DEMO-B','B-01','forbidden');
    RAISE EXCEPTION 'V86_A_CROSS_TENANT_INSERT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO mg_v86.records VALUES(103,'DEMO-A','A-02','forbidden');
    RAISE EXCEPTION 'V86_A_CROSS_SITE_INSERT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    UPDATE mg_v86.records SET tenant_code='DEMO-B',site_code='B-01' WHERE id=1;
    RAISE EXCEPTION 'V86_A_CROSS_TENANT_UPDATE_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $a$;
ROLLBACK;
\echo 'V86 ROLE A: own_read_write=allowed; cross_tenant_read_write=denied; cross_site=denied'

-- Role B tests independently, with a different legal tenant and site.
BEGIN;
SET LOCAL ROLE mg_v86_tenant_b;
DO $b$
DECLARE n integer;
BEGIN
  IF current_user<>'mg_v86_tenant_b' THEN
    RAISE EXCEPTION 'V86_B_ROLE_NOT_EFFECTIVE'; END IF;
  SELECT count(*) INTO n FROM mg_v86.records;
  IF n<>1 THEN RAISE EXCEPTION 'V86_B_SCOPE_LEAK'; END IF;
  SELECT count(*) INTO n FROM mg_v86.records
    WHERE tenant_code<>'DEMO-B' OR site_code<>'B-01';
  IF n<>0 THEN RAISE EXCEPTION 'V86_B_FOREIGN_READ'; END IF;
  UPDATE mg_v86.records SET marker='synthetic-b-update' WHERE id=3;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>1 THEN RAISE EXCEPTION 'V86_B_OWN_UPDATE_DENIED'; END IF;
  UPDATE mg_v86.records SET marker='forbidden' WHERE id=1;
  GET DIAGNOSTICS n=ROW_COUNT;
  IF n<>0 THEN RAISE EXCEPTION 'V86_B_FOREIGN_UPDATE'; END IF;
  INSERT INTO mg_v86.records VALUES(201,'DEMO-B','B-01','synthetic-test');
  BEGIN
    INSERT INTO mg_v86.records VALUES(202,'DEMO-A','A-01','forbidden');
    RAISE EXCEPTION 'V86_B_CROSS_TENANT_INSERT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
  BEGIN
    INSERT INTO mg_v86.records VALUES(203,'DEMO-B','B-02','forbidden');
    RAISE EXCEPTION 'V86_B_CROSS_SITE_INSERT_ALLOWED';
  EXCEPTION WHEN insufficient_privilege THEN NULL;
  END;
END $b$;
ROLLBACK;
\echo 'V86 ROLE B: own_read_write=allowed; cross_tenant_read_write=denied; cross_site=denied'

-- Third role has schema/table SELECT privilege but NO RLS policy.
BEGIN;
SET LOCAL ROLE mg_v86_guest;
DO $guest$
DECLARE n integer;
BEGIN
  IF current_user<>'mg_v86_guest' THEN RAISE EXCEPTION 'V86_GUEST_ROLE_FAIL'; END IF;
  SELECT count(*) INTO n FROM mg_v86.records;
  IF n<>0 THEN RAISE EXCEPTION 'V86_GUEST_DEFAULT_DENY_FAIL'; END IF;
END $guest$;
ROLLBACK;
\echo 'V86 GUEST: default_denied=true'

-- The read/write assertions were wrapped in ROLLBACK: original rows untouched.
DO $end$
DECLARE n integer;
BEGIN
  SELECT count(*) INTO n FROM mg_v86.records;
  IF n<>4 THEN RAISE EXCEPTION 'V86_TEST_TRANSACTION_LEAK'; END IF;
  IF EXISTS(SELECT 1 FROM mg_v86.records
    WHERE marker LIKE '%update%' OR id>4) THEN
    RAISE EXCEPTION 'V86_ROLLBACK_FAIL';
  END IF;
END $end$;
\echo 'V86 COMPLETE: real SQL RLS isolation assertions passed; 4 fixtures unchanged'
