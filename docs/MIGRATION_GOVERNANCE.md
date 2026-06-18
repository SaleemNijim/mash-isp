# MASH ISP — Migration Governance

> **المرجع المعماري لإدارة migrations.**  
> لا يُستبدل `docs/BLUEPRINT.md` — Blueprint يحدد *ماذا* يُبنى؛ هذا المستند يحدد *كيف* تُدار التغييرات على قاعدة البيانات.

---

## Executive Summary

المشروع يحتوي على **19 migration** (`001`–`019`). الطبقة التأسيسية (`001`–`005`) منظمة ومتسقة مع Blueprint. من `010` فصاعداً ظهر نمط **تفاعلي**: مشكلة RLS/UI → migration صغيرة → غالباً RPC `SECURITY DEFINER`.

**القرار المعماري للمستقبل:**

| الطبقة | الأسلوب |
|--------|---------|
| عزل tenant | RLS + `FORCE ROW LEVEL SECURITY` |
| joins عبر جداول / reads معقدة | RPC `SECURITY DEFINER` من اليوم الأول |
| mutations إدارية (`users`, `user_permissions`) | RPC فقط — لا UPDATE مباشر من العميل |
| migrations جديدة | **Phase batches** حسب domain — لا ملف لكل RPC |

**ممنوع:** دمج أو حذف migrations مطبّقة على production.  
**مسموح:** baseline snapshot للبيئات الجديدة + توثيق + batches للميزات القادمة.

---

## Current Migration Inventory

| # | الملف | النوع | Domain |
|---|--------|-------|--------|
| 001 | `001_core_schema.sql` | Foundation | Core Schema |
| 002 | `002_rls_policies.sql` | Foundation | Security & RLS |
| 003 | `003_triggers.sql` | Foundation | Triggers |
| 004 | `004_functions.sql` | Foundation | Functions & RPC |
| 005 | `005_cron_indexes_seed.sql` | Foundation | Performance + Cron + Seed |
| 006 | `006_warehouse_rpc.sql` | Feature | Warehouse |
| 007 | `007_admin_user_rls.sql` | Security | Auth / Admin |
| 008 | `008_sell_cards_retail.sql` | Feature | Cards Commerce |
| 009 | `009_distributors_debts_proofs.sql` | Enhancement | Cards Commerce |
| 010 | `010_internal_messages.sql` | Feature | Messaging |
| 011 | `011_message_sender_visibility.sql` | Security | Messaging |
| 012 | `012_users_read_self.sql` | Fix | Auth |
| 013 | `013_auth_profile_fix.sql` | Fix | Auth |
| 014 | `014_credentials_vault_encryption.sql` | Security | Credentials |
| 015 | `015_messages_inbox_tenant_users_rpc.sql` | Fix | Messaging + Admin |
| 016 | `016_get_my_sent_messages.sql` | Enhancement | Messaging |
| 017 | `017_get_my_unread_message_count.sql` | Enhancement | Messaging |
| 018 | `018_employee_permissions_rpc.sql` | Fix | Auth / Permissions |
| 019 | `019_fix_messages_rls_recursion_suspend_rpc.sql` | Fix | Messaging + Auth |

---

## Migration Timeline (Phases)

```
Phase 0 — Frozen Foundation (001–005)
  Schema → RLS → Triggers → Core RPCs → Indexes/Cron/Seed

Phase 1 — Business Expansion (006–009)
  Warehouse | Admin RLS | Retail sales | Distributors v2

Phase 2 — Messaging + Auth Hardening (010–013)
  Messages subsystem | Sender visibility | Self-read | Profile RPC

Phase 3 — Security + Reactive RPC Layer (014–019)
  Vault credentials | Inbox/Sent/Count RPCs | Permissions RPC | RLS recursion fix
```

---

## Architectural Classification

| الطبقة | Migrations | التفاصيل |
|--------|------------|----------|
| Core Schema | 001 | 30 جدول |
| Security & RLS | 002, 007, 011, 012, 019 | policies + helpers |
| Functions & RPC | 004, 006, 008–010, 013–019 | انظر `RPC_CATALOG.md` |
| Seed Data | 005 | plans + permissions |
| Business Features | 006, 008, 009, 010 | warehouse, cards, messages |
| Background Jobs | 005 | pg_cron × 3 |
| Messaging | 010, 011, 015–017, 019 | الأكثر تشتتاً |
| Credentials | 001, 014 | plain → Vault |
| Performance | 005, 010 | indexes |

---

## Redundancy & Overlap (ملخص)

| النمط | أمثلة | التوصية |
|-------|-------|---------|
| RPCs read مجزّأة | 015 + 016 + 017 | batch في phase واحدة مستقبلاً |
| Micro-policy migrations | 011, 012 | ضمن phase «Auth/Messaging» |
| Function rewrite | `sell_cards` 008→009, `create_tenant_with_trial` 004→013 | توثيق breaking change في header |
| RLS → RPC workaround | 015–019 | تجنّب — استخدم RPC من البداية |

---

## Technical Debt (أولويات)

| P | البند |
|---|-------|
| P0 | RLS graph على `users` ↔ messages — انظر `RLS_GRAPH.md` |
| P0 | RPC catalog موحّد — `RPC_CATALOG.md` |
| P1 | Phase discipline للميزات الجديدة |
| P2 | Baseline snapshot v2 للبيئات الجديدة (بدون مس history) |
| P3 | migration ربع سنوية للصيانة (indexes) |

---

## Consolidation Rules

### ❌ لا يُدمَج أبداً (production history)

- `001`–`010` (baseline مطبّق)
- `014` (data migration Vault — irreversible)
- أي migration مُطبَّق على remote

### ✅ مرشح baseline v2 (fresh installs فقط)

- Messaging bundle: 010 + 011 + 015–017 + policies من 019
- Auth bundle: 007 + 012 + 013 + 018 + suspend من 019
- Cards bundle: 008 + 009 نسخة نهائية واحدة

---

## Risks if Current Approach Continues

1. Migration fatigue — review و onboarding أصعب.
2. RLS regression cycles — policy → recursion → fix → RPC.
3. Environment drift — بيئة ناقصة 016/019 = سلوك مختلف.
4. Coupled hotfixes — RLS + feature في ملف واحد (019).

---

## Recommended Governance Policy

### متى تُنشأ migration جديدة؟

**✅ نعم — migration فورية:**

- جدول أو عمود جديد
- تغيير constraint / CHECK
- data migration irreversible
- hotfix أمني على production
- breaking schema change

**⏸️ لا — انتظر Phase batch:**

- RPC read helper واحد
- policy SELECT واحدة
- index بسيط (إلا في slot صيانة ربع سنوي)
- إصلاح UI-driven بدون تغيير schema

### Phase batch (المستقبل)

```
020_<domain>_<feature>.sql   ← schema + RLS + RPCs + indexes معاً
021_<domain>_maintenance.sql ← ربع سنوي
```

**Naming مقترح للملفات الجديدة** (بعد 019):

```
020_messaging_v2.sql
021_auth_admin_batch.sql
022_maintenance_2026Q2.sql
```

### Hotfix workflow

1. `0XX_hotfix_<issue>.sql` — minimal scope
2. خلال 48 ساعة: تحديث `RLS_GRAPH.md` / `RPC_CATALOG.md`
3. ticket لمتابعة consolidation doc إن لزم
4. لا تجميع RLS fix + feature جديد في hotfix واحد

### RLS & Security functions

1. قبل policy cross-table: راجع `RLS_GRAPH.md`
2. cross-table checks → helper `SECURITY DEFINER` (نمط 019)
3. admin mutations على `users` / `user_permissions` → RPC فقط
4. checklist PR: recursion test, grants audit, `search_path = public`

### Baseline جديد

- عند major version أو 10+ migrations reactive في domain واحد
- snapshot للـ **fresh clones** — لا rewrite لـ production history

---

## Client ↔ Database Contract

| العملية | المسار المعتمد |
|---------|----------------|
| CRUD tenant-scoped بسيط | PostgREST + RLS |
| Joins عبر جداول (inbox, permissions list) | RPC |
| Admin: suspend, set permission | RPC |
| Atomic business (renew, sell cards) | RPC |
| Password credentials | RPC + Vault — لا عمود plain |

---

## Related Documents

| الملف | المحتوى |
|-------|---------|
| [`DATABASE_LAYERS.md`](./DATABASE_LAYERS.md) | طبقات DB و ownership |
| [`RLS_GRAPH.md`](./RLS_GRAPH.md) | policies، recursion points |
| [`RPC_CATALOG.md`](./RPC_CATALOG.md) | كل RPC + SECURITY DEFINER rationale |
| [`MIGRATION_TEMPLATE.md`](./MIGRATION_TEMPLATE.md) | header إلزامي للmigrations الجديدة |
| [`BLUEPRINT.md`](./BLUEPRINT.md) | مواصفات المنتج |
| [`TESTING.md`](./TESTING.md) | اختبارات RLS/integration |

---

## Final Conclusions

1. **001–005** — canonical foundation؛ لا لمس.
2. **010–019** — طبقة reactive؛ توثيقها أهم من دمجها.
3. **الميزات الجديدة** — phase batches + RPC-first للreads المعقدة.
4. **كل PR migration** — يحدّث catalog/graph إن تأثر RLS أو RPC.
