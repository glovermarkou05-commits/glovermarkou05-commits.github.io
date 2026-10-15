# MG WEB STUDIO CLOUD — Modelo de datos y seguridad V1
**Documento de diseño. No es una migración SQL ni modifica ninguna base de datos.**

## Identidad y multitenencia
- organizations: id, name, tax_identifier (protegido), billing_owner_id, status, created_at.
- profiles: user_id (Auth), display_name, locale, created_at.
- memberships: organization_id, user_id, role, status, invited_by; unique (organization_id,user_id).
- platform_staff_roles: user_id, role, active, granted_by, created_at.
- invitations: organization_id, email, role, token_hash, expires_at, accepted_at.
- audit_logs: organization_id opcional, actor_id, action, entity, record_id, diff_redacted, ip_hash, created_at.

## Sitios y CMS
- sites: id, organization_id, slug, theme_id, status, draft_revision_id, published_revision_id, created_at.
- site_pages: id, organization_id, site_id, page_key, slug, title, visibility, created_at; unique(site_id,slug).
- page_revisions: id, organization_id, site_id, page_id, version, blocks_json, meta_json, created_by, created_at.
- templates: id, owner_scope, name, kind, schema_version, metadata, is_active.
- template_versions: template_id, version, validated_blocks_json, created_by, created_at.
- site_themes: id, organization_id, site_id, tokens_json, assets, updated_at.
- site_media: id, organization_id, site_id, storage_path, type, size_bytes, visibility, uploaded_by.
- site_products: id, organization_id, site_id, sku, name, slug, price_minor, currency, stock_mode, stock_count, status.
- product_categories: id, organization_id, site_id, name, slug.
- promotions: id, organization_id, site_id, title, starts_at, ends_at, status, settings.
- site_forms: id, organization_id, site_id, schema, destination_policy, privacy_notice_version.
- form_submissions: id, organization_id, site_id, form_id, encrypted_payload, consent_at, status, created_at.
- site_publications: id, organization_id, site_id, revision_set, status, deployed_at, deployed_by, rollback_of.
- domains: id, organization_id, site_id, hostname, registrar, owner_entity, expires_at, dns_status, tls_status, verification_token_hash, last_checked_at; unique(hostname).

## Comercial y operación
- plans: id, code, prices, limits_json, status, revision.
- subscriptions: id, organization_id, plan_id, price_snapshot, status, activated_at, renews_at, grace_until.
- subscription_items: id, subscription_id, service_type, quantity, unit_price_snapshot, currency.
- invoices_internal: id, organization_id, subscription_id, total_minor, tax_minor, currency, status, due_at, external_invoice_ref.
- payment_attempts: id, organization_id, invoice_id, provider, provider_reference, status, idempotency_key.
- payments: id, organization_id, invoice_id, amount_minor, currency, confirmed_at, proof_file_path, reconciled_by.
- contracts: id, organization_id, version, signed_at, status, terms_document_path, renewal_policy.
- services: id, organization_id, site_id opcional, type, provider, status, renewal_at, costs_minor, units.
- tickets: id, organization_id, site_id opcional, requester_id, assigned_to, priority, status, sla_due_at, created_at.
- ticket_messages: id, organization_id, ticket_id, sender_id, body, attachment_refs, created_at.
- notifications: id, recipient_id, organization_id opcional, type, payload, read_at, created_at.
- usage_events: id, organization_id, site_id, metric_key, value, occurred_at.
- monthly_usage: organization_id, site_id, period, metric_key, total.
- recurring_jobs: id, job_key, organization_id, schedule, last_run, status; unique(job_key).
- webhook_events: id, provider, external_event_id, signature_checked, processed_at; unique(provider, external_event_id).

## Relaciones y reglas de integridad
- Toda fila sensible de cliente contiene organization_id y sus referencias no deben permitir asociarse a recursos de otra organización.
- FK compuestas (organization_id,id) cuando sea necesario para prevenir referencias cruzadas.
- Estado published_revision_id solo puede apuntar a una revisión aprobada de ese site_id.
- IDs públicos no son autorización; chequear membresía activa y permiso en cada consulta/acción.
- Precios monetarios en centavos enteros + ISO currency para evitar errores de coma flotante.
- Guardar snapshots de precios e impuestos al contratar; no reinterpretar facturas anteriores al editar planes.
- Al cambiar dominios, validar titularidad, DNS y TLS y mantener unicidad de hostname.

## Políticas de seguridad (diseño, no SQL aplicado)
- RLS habilitado en todas las tablas expuestas y políticas diferenciadas SELECT/INSERT/UPDATE/DELETE.
- Cliente: comprobar auth.uid() con membresía vigente organization_id, rol y permiso específico.
- UPDATE: políticas USING y WITH CHECK, para impedir reasignar organization_id, owner o site_id.
- Recursos públicos: exponer únicamente una proyección validada de los datos publicados; jamás abrir RLS de borradores o submissions al visitante.
- Storage: prefijos vinculados a tenant/site, objetos privados para formularios, contratos y comprobantes; políticas de subida, lectura, modificación y eliminación.
- Staff: privilegios globales gestionados en tabla segura, no user_metadata; toda elevación, soporte temporal y exportación queda auditada.
- MFA para SUPERADMIN y operaciones sensibles; sesiones con caducidad y revocación adecuadas.
- Webhooks: validar firma del proveedor, idempotencia y protección ante repetición.
- No utilizar SERVICE_ROLE o claves secretas en el navegador.
- Para sitios públicos, la API servidora consulta las revisiones publicadas y no concede permisos de backend a visitantes.

## Casos de prueba críticos
1. Usuario A intenta leer/modificar fila y medios de organización B: DENEGADO.
2. CLIENT_EDITOR intenta cobrar/publicar/cambiar dominio sin autorización: DENEGADO.
3. CLIENT_OWNER de empresa A con acceso también a empresa B: solo actúa en organización explícitamente seleccionada.
4. Invitación caducada o revocada: DENEGADA.
5. UPDATE intenta cambiar organization_id a uno ajeno: DENEGADO.
6. Formulario público no permite leer submissions ajenos ni subir archivos arbitrarios.
7. Repetición de webhook de pago no duplica cobro.
8. Publicación fallida no modifica la revisión pública previa.
9. Suspensión por mora no elimina archivos, dominio ni contenido.
10. Exportación de datos se restringe al propietario/administrador autorizado y queda registrada.

**Nota:** el SQL final debe diseñarse, aplicarse y probarse en una base de pruebas dedicada después de aprobación.