-- V54: restrict future table and sequence grants in public for objects created by postgres.
-- Applied to MG WEB STUDIO CLOUD - STAGING (yefcgjtovfnsqtdjdsod).
-- Supabase migration version: 20261020191612.
-- Existing objects and defaults owned by other roles are unchanged.

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON TABLES FROM anon, authenticated;

ALTER DEFAULT PRIVILEGES FOR ROLE postgres IN SCHEMA public
  REVOKE ALL ON SEQUENCES FROM anon, authenticated;
