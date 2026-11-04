-- =====================================================================
-- Two new roles for the field layer.
--
-- These live in a migration of their own because Postgres will not let a
-- transaction use an enum value it added itself: the policies and
-- triggers that compare against these roles are in the next migration,
-- which runs in a later transaction.
--
--   regional_manager  — owns a region, sees everything forwarded inside it
--   district_officer  — the District Operation Officer in the field,
--                       sees only the tickets forwarded to them
-- =====================================================================

alter type public.app_role add value if not exists 'regional_manager';
alter type public.app_role add value if not exists 'district_officer';
