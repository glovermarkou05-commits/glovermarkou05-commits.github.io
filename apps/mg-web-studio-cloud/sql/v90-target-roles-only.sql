-- V90: Only prerequisites for a completely EMPTY disposable restore destination.
-- pg_dump stores database schema/ACL/RLS but does not create cluster-global roles.
-- These names and permissions are identical to the V86 invented source roles.
\set ON_ERROR_STOP on
BEGIN;
CREATE ROLE mg_v86_tenant_a NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE mg_v86_tenant_b NOLOGIN NOINHERIT NOBYPASSRLS;
CREATE ROLE mg_v86_guest NOLOGIN NOINHERIT NOBYPASSRLS;
COMMIT;
