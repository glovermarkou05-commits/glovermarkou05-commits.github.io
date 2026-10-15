-- MG WEB STUDIO CLOUD — DISEÑO PARA REVISIÓN; NO ES UNA MIGRACIÓN.
-- NO EJECUTADO. Depende del esquema previo schema_core.review.sql.
-- Las operaciones de escritura se realizarán mediante API servidora autorizada.
begin;
create table public.mg_site_identity (
 site_id uuid primary key,
 organization_id uuid not null,
 brand_color text not null default '#186999'
   check (brand_color ~ '^#[0-9A-Fa-f]{6}$'),
 public_phone text not null default ''
   check (char_length(public_phone) <= 80),
 updated_at timestamptz not null default now(),
 foreign key (site_id,organization_id)
   references public.mg_sites(id,organization_id) on delete cascade
);
create table public.mg_site_products (
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null,
 organization_id uuid not null,
 name text not null check (char_length(name) between 2 and 120),
 price_minor bigint not null check (price_minor >= 0),
 currency char(3) not null default 'USD' check (currency='USD'),
 is_visible boolean not null default true,
 created_at timestamptz not null default now(),
 foreign key (site_id,organization_id)
   references public.mg_sites(id,organization_id) on delete cascade
);
create index mg_site_products_by_site on public.mg_site_products(organization_id,site_id);
create table public.mg_site_promotions (
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null,
 organization_id uuid not null,
 title text not null check (char_length(title) between 2 and 160),
 is_active boolean not null default false,
 starts_at timestamptz,
 ends_at timestamptz,
 created_at timestamptz not null default now(),
 check (starts_at is null or ends_at is null or starts_at < ends_at),
 foreign key (site_id,organization_id)
   references public.mg_sites(id,organization_id) on delete cascade
);
create index mg_site_promotions_by_site on public.mg_site_promotions(organization_id,site_id);
-- Instantánea compartida y manifiesto de páginas: solo API servidora.
create table public.mg_site_content_releases (
 id uuid primary key default gen_random_uuid(),
 site_id uuid not null,
 organization_id uuid not null,
 release_number bigint not null check (release_number>0),
 published_shared jsonb not null check(jsonb_typeof(published_shared)='object'),
 page_manifest jsonb not null check(jsonb_typeof(page_manifest)='array'),
 published_by uuid not null references auth.users(id),
 published_at timestamptz not null default now(),
 unique(site_id,release_number),
 foreign key (site_id,organization_id)
   references public.mg_sites(id,organization_id) on delete cascade
);
alter table public.mg_site_identity enable row level security;
alter table public.mg_site_products enable row level security;
alter table public.mg_site_promotions enable row level security;
alter table public.mg_site_content_releases enable row level security;
revoke all on public.mg_site_identity from public,anon,authenticated;
revoke all on public.mg_site_products from public,anon,authenticated;
revoke all on public.mg_site_promotions from public,anon,authenticated;
revoke all on public.mg_site_content_releases from public,anon,authenticated;
-- En frontend solo se concede lectura a miembros activos de esa organización.
grant select on public.mg_site_identity to authenticated;
grant select on public.mg_site_products to authenticated;
grant select on public.mg_site_promotions to authenticated;
create policy mg_site_identity_read on public.mg_site_identity for select
to authenticated using (exists(select 1 from public.mg_memberships m
 where m.organization_id=mg_site_identity.organization_id
 and m.user_id=(select auth.uid()) and m.status='active'));
create policy mg_site_products_read on public.mg_site_products for select
to authenticated using (exists(select 1 from public.mg_memberships m
 where m.organization_id=mg_site_products.organization_id
 and m.user_id=(select auth.uid()) and m.status='active'));
create policy mg_site_promotions_read on public.mg_site_promotions for select
to authenticated using (exists(select 1 from public.mg_memberships m
 where m.organization_id=mg_site_promotions.organization_id
 and m.user_id=(select auth.uid()) and m.status='active'));
-- No acceso anónimo, no grant de escritura ni lectura de releases.
commit;