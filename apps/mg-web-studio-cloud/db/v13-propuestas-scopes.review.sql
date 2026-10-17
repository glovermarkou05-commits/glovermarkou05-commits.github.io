-- MG WEB STUDIO CLOUD | V13 | SOLO DISEÑO PARA REVISIÓN
-- NO ES MIGRACIÓN. NO EJECUTAR EN SUPABASE NI PROYECTOS EXISTENTES.
-- Dependencias conceptuales: db/schema_core.review.sql, después
-- db/modelo-contenido-compartido.review.sql.
-- Este borrador presupone esquemas public/mg_private, auth.users,
-- mg_organizations, mg_memberships y mg_sites del V1, NO los crea.
-- Se necesita migración nueva generada con CLI, staging aislado y pgTAP
-- tras autorización expresa de costos/proyecto/región. Falta auditoría de producción.
begin;

-- Los miembros EDITOR/VIEWER necesitan scope de sitio, incluso dentro del tenant.
-- Administradores OWNER/ADMIN operan todos los sitios del tenant SOLO cuando su
-- membresía está activa. Nadie puede concederse scopes directamente desde la API.
create table public.mg_membership_site_scopes (
 organization_id uuid not null,
 user_id uuid not null,
 site_id uuid not null,
 granted_at timestamptz not null default now(),
 primary key (organization_id,user_id,site_id),
 foreign key (organization_id,user_id)
   references public.mg_memberships(organization_id,user_id) on delete cascade,
 foreign key (site_id,organization_id)
   references public.mg_sites(id,organization_id) on delete cascade
);
create index mg_v13_scope_user_site_idx
 on public.mg_membership_site_scopes(user_id,organization_id,site_id);

-- Única función privilegiada de lectura de membresía/scopes; devuelve bool,
-- nunca datos privados. SECURITY DEFINER justificada para evitar RLS recursiva,
-- con búsqueda fijada, grants explícitos y comprobación de auth.uid().
-- REVISAR PROPIETARIO DE LA FUNCIÓN antes de implementar en staging.
create function mg_private.mg_can_access_site(
 p_organization_id uuid, p_site_id uuid, p_action text
)
returns boolean
language sql stable security definer
set search_path = ''
as $mg_v13$
 select coalesce(
   (select
     case
       when m.role='CLIENT_OWNER' then
         p_action in ('read','edit','publish','members','billing','support')
       when m.role='CLIENT_ADMIN' then
         p_action in ('read','edit','publish','members','support')
       when m.role='CLIENT_EDITOR' then
         p_action in ('read','edit') and exists (
           select 1 from public.mg_membership_site_scopes scope
           where scope.organization_id=m.organization_id
             and scope.user_id=m.user_id and scope.site_id=p_site_id
         )
       when m.role='CLIENT_VIEWER' then
         p_action='read' and exists (
           select 1 from public.mg_membership_site_scopes scope
           where scope.organization_id=m.organization_id
             and scope.user_id=m.user_id and scope.site_id=p_site_id
         )
       else false
     end
    from public.mg_memberships m
    join public.mg_organizations o on o.id=m.organization_id
    join public.mg_sites s on s.organization_id=m.organization_id
       and s.id=p_site_id
    where m.organization_id=p_organization_id
      and m.user_id=(select auth.uid())
      and m.status='active'
      and o.status='active'
    limit 1
   ),false
 );
$mg_v13$;
revoke all on function mg_private.mg_can_access_site(uuid,uuid,text)
 from public,anon,authenticated;
grant usage on schema mg_private to authenticated;
grant execute on function mg_private.mg_can_access_site(uuid,uuid,text)
 to authenticated;

-- Borrador versionado: SOLO backend servidor puede escribir transaccionalmente.
create table public.mg_site_draft_versions (
 organization_id uuid not null,
 site_id uuid not null,
 revision bigint not null default 1 check(revision>0),
 document jsonb not null check(jsonb_typeof(document)='object'),
 updated_by uuid references auth.users(id) on delete set null,
 updated_at timestamptz not null default now(),
 primary key(organization_id,site_id),
 foreign key(site_id,organization_id)
  references public.mg_sites(id,organization_id) on delete restrict
);

create table public.mg_site_proposals (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 site_id uuid not null,
 plan_code text not null check(plan_code in ('Start','Crece','Pro')),
 revision bigint not null default 1 check(revision>0),
 status text not null default 'draft'
  check(status in ('draft','submitted_for_review','needs_changes',
                   'rejected','approved','applied_to_draft')),
 created_by uuid not null references auth.users(id) on delete restrict,
 applied_draft_revision bigint check(applied_draft_revision>0),
 created_at timestamptz not null default now(),
 updated_at timestamptz not null default now(),
 unique(id,organization_id,site_id),
 foreign key(site_id,organization_id)
   references public.mg_sites(id,organization_id) on delete restrict
);
create index mg_v13_proposals_inbox_idx
 on public.mg_site_proposals(organization_id,site_id,status,updated_at desc);

create table public.mg_proposal_revisions (
 id uuid primary key default gen_random_uuid(),
 proposal_id uuid not null,
 organization_id uuid not null,
 site_id uuid not null,
 revision bigint not null check(revision>0),
 proposal_json jsonb not null check(jsonb_typeof(proposal_json)='object'),
 created_by uuid not null references auth.users(id) on delete restrict,
 created_at timestamptz not null default now(),
 unique(proposal_id,revision),
 unique(proposal_id,revision,organization_id,site_id),
 foreign key(proposal_id,organization_id,site_id)
   references public.mg_site_proposals(id,organization_id,site_id)
   on delete restrict
);
create index mg_v13_revisions_site_idx
 on public.mg_proposal_revisions(organization_id,site_id,proposal_id,revision desc);

create table public.mg_proposal_reviews (
 id uuid primary key default gen_random_uuid(),
 proposal_id uuid not null,
 organization_id uuid not null,
 site_id uuid not null,
 revision bigint not null check(revision>0),
 decision text not null check(decision in ('approved','changes','rejected')),
 note text not null default '' check(char_length(note)<=500),
 reviewed_by uuid not null references auth.users(id) on delete restrict,
 reviewed_at timestamptz not null default now(),
 unique(proposal_id,revision),
 foreign key(proposal_id,revision,organization_id,site_id)
   references public.mg_proposal_revisions
     (proposal_id,revision,organization_id,site_id) on delete restrict,
 check(decision='approved' or char_length(btrim(note)) between 8 and 500)
);
create index mg_v13_reviews_site_idx
 on public.mg_proposal_reviews(organization_id,site_id,proposal_id,revision desc);

-- Una notificación = un destinatario. El cuerpo PRIVADO NO va en eventos push;
-- ningún usuario puede crear o hacerse receptor de notificaciones mediante Data API.
create table public.mg_proposal_notifications (
 id uuid primary key default gen_random_uuid(),
 organization_id uuid not null,
 site_id uuid not null,
 proposal_id uuid not null,
 recipient_user_id uuid not null references auth.users(id) on delete cascade,
 event_type text not null
  check(event_type in ('submitted','approved','changes','rejected','applied')),
 revision bigint not null check(revision>0),
 created_at timestamptz not null default now(),
 unique(id,recipient_user_id),
 foreign key(proposal_id,revision,organization_id,site_id)
   references public.mg_proposal_revisions
   (proposal_id,revision,organization_id,site_id) on delete restrict
);
create index mg_v13_notifications_recipient_idx
 on public.mg_proposal_notifications(recipient_user_id,created_at desc);

create table public.mg_notification_reads (
 notification_id uuid not null,
 recipient_user_id uuid not null,
 read_at timestamptz not null default now(),
 primary key(notification_id,recipient_user_id),
 foreign key(notification_id,recipient_user_id)
   references public.mg_proposal_notifications(id,recipient_user_id)
   on delete cascade
);
create index mg_v13_notification_reads_recipient_idx
 on public.mg_notification_reads(recipient_user_id,read_at desc);

-- Outbox, auditoría/idempotencia: solo servicios internos. No publicar payload
-- de propuestas, emails, textos ni información privada en canales Realtime.
create table mg_private.mg_proposal_outbox (
 id bigint generated always as identity primary key,
 organization_id uuid not null,
 site_id uuid not null,
 proposal_id uuid not null,
 revision bigint not null check(revision>0),
 event_type text not null
   check(event_type in ('submitted','approved','changes','rejected','applied')),
 delivered_at timestamptz,
 retry_count integer not null default 0 check(retry_count>=0),
 created_at timestamptz not null default now(),
 foreign key(proposal_id,revision,organization_id,site_id)
  references public.mg_proposal_revisions
  (proposal_id,revision,organization_id,site_id) on delete restrict
);
create index mg_v13_outbox_pending_idx
 on mg_private.mg_proposal_outbox(created_at)
 where delivered_at is null;

create table mg_private.mg_operation_idempotency (
 organization_id uuid not null references public.mg_organizations(id),
 actor_user_id uuid not null references auth.users(id),
 operation_key text not null check(char_length(operation_key) between 6 and 100),
 request_fingerprint text not null check(char_length(request_fingerprint) between 16 and 256),
 result_json jsonb not null check(jsonb_typeof(result_json)='object'),
 created_at timestamptz not null default now(),
 primary key(organization_id,actor_user_id,operation_key)
);

-- RLS más grants mínimos. Los usuarios autenticados solo pueden LEER los
-- documentos autorizados; toda creación/decisión/lectura marcada se hará por
-- API servidora autenticada y transacción con auditoría.
alter table public.mg_membership_site_scopes enable row level security;
alter table public.mg_site_draft_versions enable row level security;
alter table public.mg_site_proposals enable row level security;
alter table public.mg_proposal_revisions enable row level security;
alter table public.mg_proposal_reviews enable row level security;
alter table public.mg_proposal_notifications enable row level security;
alter table public.mg_notification_reads enable row level security;
alter table mg_private.mg_proposal_outbox enable row level security;
alter table mg_private.mg_operation_idempotency enable row level security;

revoke all on public.mg_membership_site_scopes from public,anon,authenticated;
revoke all on public.mg_site_draft_versions from public,anon,authenticated;
revoke all on public.mg_site_proposals from public,anon,authenticated;
revoke all on public.mg_proposal_revisions from public,anon,authenticated;
revoke all on public.mg_proposal_reviews from public,anon,authenticated;
revoke all on public.mg_proposal_notifications from public,anon,authenticated;
revoke all on public.mg_notification_reads from public,anon,authenticated;
revoke all on mg_private.mg_proposal_outbox from public,anon,authenticated;
revoke all on mg_private.mg_operation_idempotency from public,anon,authenticated;

grant select on public.mg_membership_site_scopes to authenticated;
grant select on public.mg_site_draft_versions to authenticated;
grant select on public.mg_site_proposals to authenticated;
grant select on public.mg_proposal_revisions to authenticated;
grant select on public.mg_proposal_reviews to authenticated;
grant select on public.mg_proposal_notifications to authenticated;
grant select on public.mg_notification_reads to authenticated;

create policy mg_v13_scopes_read_self
 on public.mg_membership_site_scopes for select to authenticated
 using(user_id=(select auth.uid()) and exists(
   select 1 from public.mg_memberships m
   where m.organization_id=mg_membership_site_scopes.organization_id
     and m.user_id=(select auth.uid()) and m.status='active'
 ));

create policy mg_v13_drafts_read_scoped
 on public.mg_site_draft_versions for select to authenticated
 using ((select mg_private.mg_can_access_site(
    organization_id,site_id,'read')));

create policy mg_v13_proposals_read_scoped
 on public.mg_site_proposals for select to authenticated
 using ((select mg_private.mg_can_access_site(
    organization_id,site_id,'read')));

create policy mg_v13_revisions_read_scoped
 on public.mg_proposal_revisions for select to authenticated
 using ((select mg_private.mg_can_access_site(
    organization_id,site_id,'read')));

create policy mg_v13_reviews_read_scoped
 on public.mg_proposal_reviews for select to authenticated
 using ((select mg_private.mg_can_access_site(
    organization_id,site_id,'read')));

create policy mg_v13_notifications_read_recipient
 on public.mg_proposal_notifications for select to authenticated
 using (recipient_user_id=(select auth.uid())
    and (select mg_private.mg_can_access_site(
      organization_id,site_id,'read')));

create policy mg_v13_notification_reads_self
 on public.mg_notification_reads for select to authenticated
 using (recipient_user_id=(select auth.uid()) and exists (
   select 1 from public.mg_proposal_notifications n
   where n.id=mg_notification_reads.notification_id
     and n.recipient_user_id=(select auth.uid())
 ));

-- Sin politicas INSERT/UPDATE/DELETE para authenticated/anon.
-- La API servidora debe implementar CAS, revision inmutable, transacción que
-- actualiza draft + decisión + notificación/outbox + auditoría, y manejo de
-- solicitudes idempotentes, sin usar rol ni tenant desde payload cliente.
commit;