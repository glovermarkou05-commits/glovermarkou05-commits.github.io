-- V53 RLS runtime matrix for STAGING only.
-- Synthetic auth.users and tenant records are created in a single transaction and rolled back.
-- This simulates database role/JWT claims; it is not an end-to-end Auth/PostgREST test.
BEGIN;
INSERT INTO auth.users (id,aud,role,email,email_confirmed_at,created_at,updated_at,raw_app_meta_data,raw_user_meta_data,is_anonymous) VALUES
('71000000-0000-4000-8000-000000000001','authenticated','authenticated','v53-test-1@example.invalid',now(),now(),now(),'{}','{}',false),
('71000000-0000-4000-8000-000000000002','authenticated','authenticated','v53-test-2@example.invalid',now(),now(),now(),'{}','{}',false),
('71000000-0000-4000-8000-000000000003','authenticated','authenticated','v53-test-3@example.invalid',now(),now(),now(),'{}','{}',false),
('71000000-0000-4000-8000-000000000004','authenticated','authenticated','v53-test-4@example.invalid',now(),now(),now(),'{}','{}',false);
INSERT INTO public.mg_organizations (id,name,slug,status) VALUES
('72000000-0000-4000-8000-000000000001','V53 Tenant A','v53-tenant-a','active'),
('72000000-0000-4000-8000-000000000002','V53 Tenant B','v53-tenant-b','active');
INSERT INTO public.mg_profiles (user_id,display_name) VALUES
('71000000-0000-4000-8000-000000000001','V53 User 1'),
('71000000-0000-4000-8000-000000000002','V53 User 2'),
('71000000-0000-4000-8000-000000000003','V53 User 3'),
('71000000-0000-4000-8000-000000000004','V53 User 4');
INSERT INTO public.mg_memberships (organization_id,user_id,role,status) VALUES
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000001','CLIENT_OWNER','active'),
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','CLIENT_EDITOR','active'),
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000003','CLIENT_VIEWER','active'),
('72000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000004','CLIENT_OWNER','active');
INSERT INTO public.mg_sites (id,organization_id,name,slug,status) VALUES
('73000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','V53 A Site 1','v53-a-1','draft'),
('73000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','V53 A Site 2','v53-a-2','draft'),
('73000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000002','V53 B Site 1','v53-b-1','draft');
INSERT INTO public.mg_membership_site_scopes (organization_id,user_id,site_id) VALUES
('72000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000001');
INSERT INTO public.mg_pages (id,organization_id,site_id,slug,title,draft_blocks) VALUES
('74000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','home','Site 1','[]'),
('74000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','home','Site 2','[]'),
('74000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','home','Site 3','[]');
INSERT INTO public.mg_site_draft_versions (organization_id,site_id,revision,document,updated_by) VALUES
('72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',1,'{"fixture":"v53"}','71000000-0000-4000-8000-000000000001'),
('72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',1,'{"fixture":"v53"}','71000000-0000-4000-8000-000000000001'),
('72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003',1,'{"fixture":"v53"}','71000000-0000-4000-8000-000000000004');
INSERT INTO public.mg_site_proposals (id,organization_id,site_id,plan_code,revision,status,created_by) VALUES
('75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','Start',1,'draft','71000000-0000-4000-8000-000000000001'),
('75000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','Crece',1,'draft','71000000-0000-4000-8000-000000000001'),
('75000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','Pro',1,'draft','71000000-0000-4000-8000-000000000004');
INSERT INTO public.mg_proposal_revisions (id,proposal_id,organization_id,site_id,revision,proposal_json,created_by) VALUES
('76000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',1,'{"fixture":"v53"}','71000000-0000-4000-8000-000000000001'),
('76000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',1,'{"fixture":"v53"}','71000000-0000-4000-8000-000000000001'),
('76000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003',1,'{"fixture":"v53"}','71000000-0000-4000-8000-000000000004');
INSERT INTO public.mg_proposal_reviews (id,proposal_id,organization_id,site_id,revision,decision,note,reviewed_by) VALUES
('77000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001',1,'approved','fixture','71000000-0000-4000-8000-000000000001'),
('77000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002',1,'approved','fixture','71000000-0000-4000-8000-000000000001'),
('77000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003',1,'approved','fixture','71000000-0000-4000-8000-000000000004');
INSERT INTO public.mg_proposal_notifications (id,organization_id,site_id,proposal_id,recipient_user_id,event_type,revision) VALUES
('78000000-0000-4000-8000-000000000001','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000001','75000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002','submitted',1),
('78000000-0000-4000-8000-000000000002','72000000-0000-4000-8000-000000000001','73000000-0000-4000-8000-000000000002','75000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003','submitted',1),
('78000000-0000-4000-8000-000000000003','72000000-0000-4000-8000-000000000002','73000000-0000-4000-8000-000000000003','75000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000004','submitted',1);
INSERT INTO public.mg_notification_reads (notification_id,recipient_user_id) VALUES
('78000000-0000-4000-8000-000000000001','71000000-0000-4000-8000-000000000002'),
('78000000-0000-4000-8000-000000000002','71000000-0000-4000-8000-000000000003'),
('78000000-0000-4000-8000-000000000003','71000000-0000-4000-8000-000000000004');
SELECT extensions.plan(56);
SELECT extensions.ok(NOT has_table_privilege('anon','public.mg_organizations','SELECT'),'anon has no tenant SELECT');
SELECT extensions.ok(NOT has_table_privilege('authenticated','public.mg_organizations','INSERT'),'authenticated has no INSERT');
SELECT extensions.ok(NOT has_table_privilege('authenticated','public.mg_organizations','UPDATE'),'authenticated has no UPDATE');
SELECT extensions.ok(NOT has_table_privilege('authenticated','public.mg_organizations','DELETE'),'authenticated has no DELETE');
SELECT extensions.ok(NOT has_schema_privilege('anon','mg_private','USAGE'),'anon has no mg_private USAGE');
SELECT extensions.ok(NOT has_schema_privilege('authenticated','mg_private','USAGE'),'authenticated has no mg_private USAGE');
SELECT extensions.ok(has_schema_privilege('service_role','mg_private','USAGE'),'service_role has mg_private USAGE');
SELECT extensions.ok(has_table_privilege('service_role','mg_private.mg_audit_events','SELECT'),'service_role has private SELECT');
SET LOCAL ROLE authenticated;
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000001',true),set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000001","role":"authenticated"}',true);
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_organizations),1::bigint,'owner A mg_organizations visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_memberships),1::bigint,'owner A mg_memberships visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_membership_site_scopes),0::bigint,'owner A mg_membership_site_scopes visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_sites),2::bigint,'owner A mg_sites visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_pages),2::bigint,'owner A mg_pages visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_site_draft_versions),2::bigint,'owner A mg_site_draft_versions visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_site_proposals),2::bigint,'owner A mg_site_proposals visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_revisions),2::bigint,'owner A mg_proposal_revisions visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_reviews),2::bigint,'owner A mg_proposal_reviews visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_notifications),0::bigint,'owner A mg_proposal_notifications visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_notification_reads),0::bigint,'owner A mg_notification_reads visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_profiles),1::bigint,'owner A mg_profiles visibility');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000002',true),set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000002","role":"authenticated"}',true);
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_organizations),1::bigint,'scoped editor A mg_organizations visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_memberships),1::bigint,'scoped editor A mg_memberships visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_membership_site_scopes),1::bigint,'scoped editor A mg_membership_site_scopes visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_sites),1::bigint,'scoped editor A mg_sites visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_pages),1::bigint,'scoped editor A mg_pages visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_site_draft_versions),1::bigint,'scoped editor A mg_site_draft_versions visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_site_proposals),1::bigint,'scoped editor A mg_site_proposals visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_revisions),1::bigint,'scoped editor A mg_proposal_revisions visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_reviews),1::bigint,'scoped editor A mg_proposal_reviews visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_notifications),1::bigint,'scoped editor A mg_proposal_notifications visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_notification_reads),1::bigint,'scoped editor A mg_notification_reads visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_profiles),1::bigint,'scoped editor A mg_profiles visibility');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000003',true),set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000003","role":"authenticated"}',true);
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_organizations),1::bigint,'unscoped viewer A mg_organizations visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_memberships),1::bigint,'unscoped viewer A mg_memberships visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_membership_site_scopes),0::bigint,'unscoped viewer A mg_membership_site_scopes visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_sites),0::bigint,'unscoped viewer A mg_sites visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_pages),0::bigint,'unscoped viewer A mg_pages visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_site_draft_versions),0::bigint,'unscoped viewer A mg_site_draft_versions visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_site_proposals),0::bigint,'unscoped viewer A mg_site_proposals visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_revisions),0::bigint,'unscoped viewer A mg_proposal_revisions visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_reviews),0::bigint,'unscoped viewer A mg_proposal_reviews visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_notifications),0::bigint,'unscoped viewer A mg_proposal_notifications visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_notification_reads),0::bigint,'unscoped viewer A mg_notification_reads visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_profiles),1::bigint,'unscoped viewer A mg_profiles visibility');
SELECT set_config('request.jwt.claim.sub','71000000-0000-4000-8000-000000000004',true),set_config('request.jwt.claims','{"sub":"71000000-0000-4000-8000-000000000004","role":"authenticated"}',true);
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_organizations),1::bigint,'owner B mg_organizations visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_memberships),1::bigint,'owner B mg_memberships visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_membership_site_scopes),0::bigint,'owner B mg_membership_site_scopes visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_sites),1::bigint,'owner B mg_sites visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_pages),1::bigint,'owner B mg_pages visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_site_draft_versions),1::bigint,'owner B mg_site_draft_versions visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_site_proposals),1::bigint,'owner B mg_site_proposals visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_revisions),1::bigint,'owner B mg_proposal_revisions visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_reviews),1::bigint,'owner B mg_proposal_reviews visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_proposal_notifications),1::bigint,'owner B mg_proposal_notifications visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_notification_reads),1::bigint,'owner B mg_notification_reads visibility');
SELECT extensions.is((SELECT count(*)::bigint FROM public.mg_profiles),1::bigint,'owner B mg_profiles visibility');
RESET ROLE;
SELECT * FROM extensions.finish();
ROLLBACK;
