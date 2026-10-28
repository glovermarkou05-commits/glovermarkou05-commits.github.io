-- V86: ONLY in disposable PG17 on authorized GitHub runner, never production.
-- Two entirely fictitious companies and four invented sites.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE mg_v86_tenant_a NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE mg_v86_tenant_b NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE mg_v86_guest NOLOGIN NOINHERIT NOBYPASSRLS;

CREATE SCHEMA mg_v86;
REVOKE ALL ON SCHEMA mg_v86 FROM PUBLIC;
CREATE TABLE mg_v86.records (
  id integer PRIMARY KEY,
  tenant_code text NOT NULL CHECK (tenant_code IN ('DEMO-A','DEMO-B')),
  site_code text NOT NULL CHECK (site_code IN ('A-01','A-02','B-01','B-02')),
  marker text NOT NULL
);
INSERT INTO mg_v86.records VALUES
  (1,'DEMO-A','A-01','synthetic-a-first'),
  (2,'DEMO-A','A-02','synthetic-a-second'),
  (3,'DEMO-B','B-01','synthetic-b-first'),
  (4,'DEMO-B','B-02','synthetic-b-second');

ALTER TABLE mg_v86.records ENABLE ROW LEVEL SECURITY;
ALTER TABLE mg_v86.records FORCE ROW LEVEL SECURITY;
CREATE POLICY scope_demo_a ON mg_v86.records FOR ALL TO mg_v86_tenant_a
  USING (tenant_code='DEMO-A' AND site_code='A-01')
  WITH CHECK (tenant_code='DEMO-A' AND site_code='A-01');
CREATE POLICY scope_demo_b ON mg_v86.records FOR ALL TO mg_v86_tenant_b
  USING (tenant_code='DEMO-B' AND site_code='B-01')
  WITH CHECK (tenant_code='DEMO-B' AND site_code='B-01');

GRANT USAGE ON SCHEMA mg_v86 TO mg_v86_tenant_a, mg_v86_tenant_b, mg_v86_guest;
GRANT SELECT, INSERT, UPDATE, DELETE ON mg_v86.records TO mg_v86_tenant_a, mg_v86_tenant_b;
GRANT SELECT ON mg_v86.records TO mg_v86_guest;
COMMIT;
