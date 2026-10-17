-- MG WEB STUDIO CLOUD | V13 | CORRECCIÓN DE RLS V1/V2 PARA REVISIÓN
-- NO EJECUTAR. NO MIGRACIÓN. Cambios de propuesta para una futura staging exclusiva.
-- Orden de estudio: esquema_core.review.sql -> modelo-contenido-compartido.review.sql
-- -> v13-propuestas-scopes.review.sql -> ESTE ARCHIVO.
-- Las políticas heredadas permitían leer todos los sitios de un tenant.
-- En V13 OWNER/ADMIN todo el tenant; EDITOR/VIEWER solo sitios asignados.
begin;

-- La versión segura usa operaciones de escritura SOLO por API backend;
-- la Data API autenticada es de solo lectura para estos recursos.
revoke insert,update,delete on public.mg_sites from authenticated;
revoke insert,update,delete on public.mg_pages from authenticated;
revoke insert,update,delete on public.mg_domains from authenticated;
revoke insert,update,delete on public.mg_site_identity from authenticated;
revoke insert,update,delete on public.mg_site_products from authenticated;
revoke insert,update,delete on public.mg_site_promotions from authenticated;

-- Revocar GRANTS por columna que el esquema antiguo otorgaba (son separados
-- de los grants por tabla). Revisión adicional mediante \dp y advisors.
revoke update(name,slug) on public.mg_sites from authenticated;
revoke update(slug,title,draft_blocks) on public.mg_pages from authenticated;

-- Eliminar políticas antiguas demasiado amplias (NO añadir nuevas políticas
-- permisivas sin sustituir primero las existentes: se combinan con OR).
drop policy if exists mg_sites_read_member on public.mg_sites;
drop policy if exists mg_sites_create_manager on public.mg_sites;
drop policy if exists mg_sites_update_manager on public.mg_sites;
drop policy if exists mg_pages_read_member on public.mg_pages;
drop policy if exists mg_pages_create_editor on public.mg_pages;
drop policy if exists mg_pages_update_editor on public.mg_pages;
drop policy if exists mg_domains_read_member on public.mg_domains;
drop policy if exists mg_site_identity_read on public.mg_site_identity;
drop policy if exists mg_site_products_read on public.mg_site_products;
drop policy if exists mg_site_promotions_read on public.mg_site_promotions;

-- Solo lectura efectiva y scoped por sitio. Helper SECURITY DEFINER privado
-- verificado en staging con cuentas y sesiones reales antes de instalar.
create policy mg_v13_sites_scoped_read
 on public.mg_sites for select to authenticated
 using ((select mg_private.mg_can_access_site(organization_id,id,'read')));

create policy mg_v13_pages_scoped_read
 on public.mg_pages for select to authenticated
 using ((select mg_private.mg_can_access_site(organization_id,site_id,'read')));

create policy mg_v13_domains_scoped_read
 on public.mg_domains for select to authenticated
 using ((select mg_private.mg_can_access_site(organization_id,site_id,'read')));

create policy mg_v13_identity_scoped_read
 on public.mg_site_identity for select to authenticated
 using ((select mg_private.mg_can_access_site(organization_id,site_id,'read')));

create policy mg_v13_products_scoped_read
 on public.mg_site_products for select to authenticated
 using ((select mg_private.mg_can_access_site(organization_id,site_id,'read')));

create policy mg_v13_promotions_scoped_read
 on public.mg_site_promotions for select to authenticated
 using ((select mg_private.mg_can_access_site(organization_id,site_id,'read')));

-- Las tablas de releases previas nunca se hacen públicas automáticamente.
-- Exponer solo snapshots publicados a través del backend público controlado.
-- Falta transformar mg_pages.slug='' del prototipo: reservar home explícita
-- y ajustar validaciones del V1 antes de cualquier migración real.
commit;