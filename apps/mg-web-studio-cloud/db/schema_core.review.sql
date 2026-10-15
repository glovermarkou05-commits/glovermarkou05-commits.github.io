-- MG WEB STUDIO CLOUD | BASE SQL DE REVISIÓN V1
-- NO ES UNA MIGRACIÓN, NO EJECUTAR EN PROYECTOS EXISTENTES.
-- Requiere proyecto Supabase nuevo y exclusivo, autorización, revisión de seguridad
-- y pruebas en entorno de staging. Preparar migración con Supabase CLI al aprobar.
begin;

create extension if not exists pgcrypto;

-- Ninguna autoinscripción concede rol ni pertenencia a una empresa.
create table public.mg_profiles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  display_name text not null default '',
  created_at timestamptz not null default now()
);

create table public.mg_organizations (
  id uuid primary key default gen_random_uuid(),
  name text not null check (char_length(name) between 2 and 160),
  slug text not null unique check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'active'
     check (status in ('active','suspended','archived')),
  created_at timestamptz not null default now()
);

create table public.mg_memberships (
  organization_id uuid not null references public.mg_organizations(id) on delete restrict,
  user_id uuid not null references auth.users(id) on delete cascade,
  role text not null check (role in ('CLIENT_OWNER','CLIENT_ADMIN','CLIENT_EDITOR','CLIENT_VIEWER')),
  status text not null default 'active' check (status in ('invited','active','revoked')),
  created_at timestamptz not null default now(),
  primary key (organization_id,user_id)
);
create index mg_memberships_user_active_idx
  on public.mg_memberships(user_id,organization_id) where status='active';

-- Los roles SUPERADMIN y del equipo MG solo se gestionan por backend privilegiado.
create schema if not exists mg_private;
revoke all on schema mg_private from public, anon, authenticated;
create table mg_private.mg_staff_roles (
  user_id uuid primary key references auth.users(id) on delete cascade,
  role text not null check (role in ('SUPERADMIN','OPERATIONS_ADMIN','BILLING_MANAGER','SUPPORT_AGENT','DESIGNER','AUDITOR')),
  granted_at timestamptz not null default now()
);
revoke all on mg_private.mg_staff_roles from public, anon, authenticated;

create table public.mg_sites (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null references public.mg_organizations(id) on delete restrict,
  name text not null check (char_length(name) between 2 and 160),
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  status text not null default 'draft'
    check (status in ('draft','review','published','suspended')),
  created_at timestamptz not null default now(),
  unique(organization_id,slug),
  unique(id,organization_id)
);
create index mg_sites_org_idx on public.mg_sites(organization_id);

create table public.mg_pages (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  slug text not null check (slug ~ '^[a-z0-9]+(-[a-z0-9]+)*$'),
  title text not null check (char_length(title) between 1 and 200),
  draft_blocks jsonb not null default '[]'::jsonb
    check (jsonb_typeof(draft_blocks)='array'),
  updated_at timestamptz not null default now(),
  unique(site_id,slug),
  foreign key(site_id,organization_id)
    references public.mg_sites(id,organization_id) on delete cascade
);
create index mg_pages_tenant_site_idx on public.mg_pages(organization_id,site_id);

-- Resolver público de sitios solo mediante API servidora controlada.
-- No dar lectura anónima de borradores ni de dominios en la Data API.
create table public.mg_domains (
  id uuid primary key default gen_random_uuid(),
  organization_id uuid not null,
  site_id uuid not null,
  hostname text not null unique,
  verified boolean not null default false,
  tls_status text not null default 'pending'
    check (tls_status in ('pending','active','failed')),
  created_at timestamptz not null default now(),
  foreign key(site_id,organization_id)
    references public.mg_sites(id,organization_id) on delete cascade
);
create index mg_domains_org_site_idx on public.mg_domains(organization_id,site_id);

-- Publicaciones, cobros, invitaciones, auditoría y altas de empresa las hace un backend
-- autorizado; ninguna acción client-side podrá forzar cambios administrativos.
create table mg_private.mg_audit_events (
  id bigint generated always as identity primary key,
  actor_id uuid,
  organization_id uuid,
  action text not null,
  details jsonb not null default '{}'::jsonb,
  happened_at timestamptz not null default now()
);
revoke all on mg_private.mg_audit_events from public, anon, authenticated;

-- Defensa por doble control: grants por operación + RLS por organización.
alter table public.mg_profiles enable row level security;
alter table public.mg_organizations enable row level security;
alter table public.mg_memberships enable row level security;
alter table public.mg_sites enable row level security;
alter table public.mg_pages enable row level security;
alter table public.mg_domains enable row level security;
alter table mg_private.mg_staff_roles enable row level security;
alter table mg_private.mg_audit_events enable row level security;

revoke all on table public.mg_profiles from public, anon, authenticated;
revoke all on table public.mg_organizations from public, anon, authenticated;
revoke all on table public.mg_memberships from public, anon, authenticated;
revoke all on table public.mg_sites from public, anon, authenticated;
revoke all on table public.mg_pages from public, anon, authenticated;
revoke all on table public.mg_domains from public, anon, authenticated;

grant select on public.mg_profiles to authenticated;
grant update(display_name) on public.mg_profiles to authenticated;
grant select on public.mg_organizations to authenticated;
grant select on public.mg_memberships to authenticated;
grant select, insert on public.mg_sites to authenticated;
grant update(name,slug) on public.mg_sites to authenticated;
grant select, insert on public.mg_pages to authenticated;
grant update(slug,title,draft_blocks) on public.mg_pages to authenticated;
grant select on public.mg_domains to authenticated;

-- El perfil se crea exclusivamente desde backend durante invitación/alta aprobada.
create policy mg_profile_read_own
 on public.mg_profiles for select to authenticated
 using (user_id=(select auth.uid()));
create policy mg_profile_update_own
 on public.mg_profiles for update to authenticated
 using (user_id=(select auth.uid()))
 with check (user_id=(select auth.uid()));

-- Memberships: cada usuario solo ve su propia membresía ACTIVA.
-- Este SELECT no consulta otras tablas RLS y evita recursión de políticas.
create policy mg_memberships_read_self
 on public.mg_memberships for select to authenticated
 using (user_id=(select auth.uid()) and status='active');

create policy mg_organizations_read_member
 on public.mg_organizations for select to authenticated
 using (exists (
   select 1 from public.mg_memberships m
   where m.organization_id=mg_organizations.id
     and m.user_id=(select auth.uid()) and m.status='active'
 ));

create policy mg_sites_read_member
 on public.mg_sites for select to authenticated
 using (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_sites.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
 ));

create policy mg_sites_create_manager
 on public.mg_sites for insert to authenticated
 with check (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_sites.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
    and m.role in ('CLIENT_OWNER','CLIENT_ADMIN')
 ));

create policy mg_sites_update_manager
 on public.mg_sites for update to authenticated
 using (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_sites.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
    and m.role in ('CLIENT_OWNER','CLIENT_ADMIN')
 ))
 with check (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_sites.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
    and m.role in ('CLIENT_OWNER','CLIENT_ADMIN')
 ));

create policy mg_pages_read_member
 on public.mg_pages for select to authenticated
 using (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_pages.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
 ));

create policy mg_pages_create_editor
 on public.mg_pages for insert to authenticated
 with check (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_pages.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
    and m.role in ('CLIENT_OWNER','CLIENT_ADMIN','CLIENT_EDITOR')
 ));

create policy mg_pages_update_editor
 on public.mg_pages for update to authenticated
 using (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_pages.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
    and m.role in ('CLIENT_OWNER','CLIENT_ADMIN','CLIENT_EDITOR')
 ))
 with check (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_pages.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
    and m.role in ('CLIENT_OWNER','CLIENT_ADMIN','CLIENT_EDITOR')
 ));

create policy mg_domains_read_member
 on public.mg_domains for select to authenticated
 using (exists(
  select 1 from public.mg_memberships m
  where m.organization_id=mg_domains.organization_id
    and m.user_id=(select auth.uid()) and m.status='active'
 ));

-- No se conceden INSERT/UPDATE/DELETE de roles, memberships, dominios ni
-- organizaciones a autenticados; tampoco DELETE de sitios o páginas.
-- No existen políticas anon; la publicación pública usará servidor
-- que exponga ÚNICAMENTE versiones PUBLICADAS tras validación.
commit;