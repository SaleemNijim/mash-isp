# Migration Header Template

> انسخ هذا الـ header إلى **أعلى كل migration جديدة** (بعد 019).  
> لا تضع هذا الملف في `supabase/migrations/` — للتوثيق فقط.

---

## Filename Convention (post-019)

```
020_<domain>_<short_description>.sql
021_<domain>_<short_description>.sql
022_maintenance_2026Q2.sql
022_hotfix_<issue>.sql          ← emergencies only
```

**Domains:** `auth`, `messaging`, `cards`, `credentials`, `network`, `warehouse`, `saas`, `maintenance`, `hotfix`

---

## Header Block (copy below)

```sql
-- ============================================================
-- MASH ISP — 0XX_<domain>_<description>.sql
-- ============================================================
--
-- Type:       [ Foundation | Feature | Enhancement | Fix | Security | Maintenance | Hotfix ]
-- Domain:     [ auth | messaging | cards | credentials | network | warehouse | saas | ... ]
-- Depends-on: [ 019 | list prior migrations if any ]
--
-- Purpose:
--   [1-3 sentences: what problem this solves]
--
-- Affects:
--   Tables:    [ table names or "none" ]
--   Functions: [ RPC names or "none" ]
--   Policies:  [ policy names or "none" ]
--   Data:      [ yes/no — describe if yes ]
--
-- Breaking:   [ yes/no — describe client impact ]
-- Rollback:   [ notes — often "not reversible" for data migrations ]
--
-- Docs updated:
--   [ ] docs/RLS_GRAPH.md
--   [ ] docs/RPC_CATALOG.md
--   [ ] docs/MIGRATION_GOVERNANCE.md (inventory row)
--
-- RLS checklist:
--   [ ] No cross-table EXISTS without SECURITY DEFINER helper
--   [ ] search_path = public on SECURITY DEFINER functions
--   [ ] GRANT/REVOKE audited
--
-- ============================================================
```

---

## Type Definitions

| Type | When to Use | Example |
|------|-------------|---------|
| **Foundation** | Rare — new project baseline only | 001 |
| **Feature** | New domain capability (schema + RLS + RPC together) | 010 messaging |
| **Enhancement** | Extend existing domain without breaking | card_type column |
| **Fix** | Bug in prod behavior | 013 auth profile |
| **Security** | RLS, Vault, permission hardening | 014, 019 |
| **Maintenance** | Indexes, cron tweaks — batch quarterly | future 022 |
| **Hotfix** | Production emergency — minimal scope | future hotfix |

---

## Batch Migration Structure (preferred)

One file should contain **all layers for a domain slice:**

```
1. DDL (tables, columns, constraints)
2. RLS (ENABLE/FORCE + policies + helpers)
3. RPCs (CREATE + GRANT)
4. Indexes
5. Realtime / cron (if needed)
6. Seed (if needed, idempotent ON CONFLICT)
```

**Anti-pattern:** three consecutive files each adding one read RPC (015–017 pattern).

---

## PR Checklist

- [ ] Header block complete
- [ ] Type + Domain correct
- [ ] No hard-coded prices/trial days (use `subscription_plans`)
- [ ] Soft delete only — no DELETE on data tables
- [ ] `tenant_id` on new tables + FORCE RLS
- [ ] Docs updated (RLS_GRAPH / RPC_CATALOG / GOVERNANCE inventory)
- [ ] `npm run db:push` tested locally
- [ ] RLS smoke test (see `RLS_GRAPH.md`)

---

## Example (filled)

```sql
-- ============================================================
-- MASH ISP — 020_reports_export_rpc.sql
-- ============================================================
--
-- Type:       Feature
-- Domain:     saas
-- Depends-on: 019
--
-- Purpose:
--   Add read-only RPC for admin payment reports with flat joins.
--
-- Affects:
--   Tables:    none
--   Functions: get_tenant_payment_summary(date_from, date_to)
--   Policies:  none
--   Data:      no
--
-- Breaking:   no
-- Rollback:   DROP FUNCTION only
--
-- Docs updated:
--   [x] docs/RPC_CATALOG.md
--   [ ] docs/RLS_GRAPH.md
--   [x] docs/MIGRATION_GOVERNANCE.md
--
-- RLS checklist:
--   [x] Uses get_tenant_id() inside SECURITY DEFINER
--   [x] search_path = public
--   [x] GRANT EXECUTE TO authenticated
--
-- ============================================================
```

---

## Related

- [`MIGRATION_GOVERNANCE.md`](./MIGRATION_GOVERNANCE.md) — full policy
- [`BLUEPRINT.md`](./BLUEPRINT.md) — product spec (SQL marked «يُطبَّق حرفياً» overrides this template)
