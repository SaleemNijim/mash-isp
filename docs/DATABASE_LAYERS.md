# MASH ISP — Database Layers

> خريطة طبقات قاعدة البيانات الحالية (post-migration 019).  
> للمطور الجديد: اقرأ هذا → `RLS_GRAPH.md` → `RPC_CATALOG.md`.

---

## Layer 0 — Extensions & Platform

| المكوّن | المصدر | ملاحظات |
|---------|--------|---------|
| `pg_cron` | Supabase Dashboard | migrations 005 — يتطلب تفعيل يدوي |
| `vault` | Supabase (افتراضي) | migration 014 |
| `supabase_realtime` | migration 010 | `message_recipients` فقط |

---

## Layer 1 — Core Schema (001)

**30 جدول** — كل جداول ISP تحمل `tenant_id` + `is_deleted`.

### SaaS Platform

| الجدول | الغرض |
|--------|-------|
| `subscription_plans` | تسعير ديناميكي — `discount_percent` generated |
| `tenants` | multi-tenant root |
| `mash_invoices` | فواتير SaaS |
| `mash_payments` | مدفوعات SaaS |

### Auth & Permissions

| الجدول | الغرض |
|--------|-------|
| `users` | `id = auth.uid()` |
| `permissions` | 12 كود (seed 005) |
| `user_permissions` | PK `(user_id, permission)` |

### ISP Operations

| المجموعة | الجداول |
|----------|---------|
| Customers & subs | `customers`, `subscriptions`, `internet_credentials`, `customer_credential_usage` |
| Cards | `card_products`, `card_batches`, `card_batch_items`, `card_distributor_sales`, `card_sale_items`, `card_retail_sales`*, `distributors`* |
| Payments | `payments`, `payment_proofs`, `pending_tasks`, `debts`, `company_bank_accounts` |
| Network | `network_ports`, `network_routers`, `network_extenders`, `router_mac_history` |
| Warehouse | `warehouse_items`, `warehouse_movements` |
| System | `imports`, `audit_logs`, `sync_nonces` |

\* `card_retail_sales` (008), `distributors` (009)

### Messaging (010)

| الجدول | الغرض |
|--------|-------|
| `internal_messages` | محتوى الرسالة + channel |
| `message_recipients` | inbox per user + `read_at` |

---

## Layer 2 — Security & RLS (002, 007, 011, 012, 019)

### Helper Functions (SECURITY DEFINER)

| الدالة | Migration | الاستخدام |
|--------|-----------|-----------|
| `get_tenant_id()` | 002 | كل policies tenant-scoped |
| `has_permission(user, perm)` | 002 | فحص `is_active = true` |
| `is_super_admin()` | 002 | bypass tenant |
| `is_tenant_admin()` | 007 | admin company |
| `is_message_recipient(msg_id)` | 019 | RLS helper — messages |
| `is_message_sender_of(msg_id)` | 019 | RLS helper — messages |
| `user_is_my_message_sender(user_id)` | 019 | RLS helper — users |

### Policy Pattern (002)

```
<table>_tenant_all      → tenant_id = get_tenant_id()
<table>_superadmin_all  → is_super_admin()
```

**استثناءات:**

| الجدول | policies إضافية |
|--------|-----------------|
| `users` | `users_read_self`, `users_admin_manage`, `users_message_sender_read`, `users_tenant_select`, `users_superadmin_all` |
| `user_permissions` | `user_permissions_admin_manage` |
| `audit_logs` | insert-only + admin read |
| `internal_messages` | sender / recipient / superadmin read |
| `message_recipients` | own / sender / superadmin / mark_read |

انظر التفاصيل في [`RLS_GRAPH.md`](./RLS_GRAPH.md).

---

## Layer 3 — Triggers & Automation (003, 005)

### Row Triggers (003)

| Trigger | الجدول | الحدث |
|---------|--------|-------|
| `trg_soft_delete_*` | 8 جداول ISP | AFTER UPDATE → `audit_logs` |
| `trg_update_stock_on_batch` | `card_batch_items` | INSERT → stock+ |
| `trg_reverse_batch_stock` | `card_batches` | soft delete → stock− |
| `trg_log_mac_change` | `network_routers` | MAC change → history |
| `trg_cancel_debt_on_payment` | `payments` | INSERT → cancel debt |

### Scheduled Jobs (005 — pg_cron)

| Job | Schedule | الغرض |
|-----|----------|-------|
| `overdue-to-debt` | hourly | pending_tasks → debts |
| `remind-pending` | every 4h | status → reminded |
| `clean-nonces` | hourly | sync_nonces cleanup |

---

## Layer 4 — Business RPCs (004, 006, 008–010, 013–019)

**Atomic operations** — العميل يستدعي RPC بدلاً من multi-step.

| Domain | RPCs | Migration |
|--------|------|-----------|
| Onboarding | `create_tenant_with_trial` | 004 → 013 |
| Subscriptions | `renew_subscription` | 004 |
| Cards inbound | `receive_card_batch` | 004 |
| Cards outbound | `sell_cards`, `sell_retail_cards` | 008 → 009 |
| Warehouse | `record_warehouse_movement` | 006 |
| Messaging send | `super_admin_*`, `admin_*` | 010 |
| Messaging read | `get_my_inbox`, `get_my_sent_messages`, … | 015–017 |
| Auth profile | `get_my_user_profile` | 013 |
| Credentials | `set/reveal/bulk_insert_credentials` | 014 |
| Admin | `list_tenant_users`, `set_employee_permission`, `suspend_tenant_employee` | 015, 018, 019 |

القائمة الكاملة: [`RPC_CATALOG.md`](./RPC_CATALOG.md).

---

## Layer 5 — Seed & Reference Data (005)

| البيانات | Count | Idempotent |
|----------|-------|------------|
| `subscription_plans` | 4 slugs | `ON CONFLICT DO NOTHING` |
| `permissions` | 12 codes | `ON CONFLICT DO NOTHING` |

---

## Layer 6 — Performance (005, 010)

| Index | الجدول |
|-------|--------|
| `idx_credentials_tenant_username` | `internet_credentials` |
| `idx_subscriptions_tenant_end_date` | `subscriptions` |
| `idx_payments_tenant_paid_at` | `payments` |
| `idx_pending_tasks_tenant_status_due` | `pending_tasks` |
| `idx_audit_logs_tenant_performed_at` | `audit_logs` |
| `idx_message_recipients_user_unread` | `message_recipients` |
| `idx_internal_messages_sender_created` | `internal_messages` |

---

## Dependency Flow

```
auth.uid()
    ↓
get_my_user_profile() ──→ tenant context
    ↓
get_tenant_id() ──→ RLS policies ──→ direct PostgREST (simple CRUD)
    ↓
has_permission() / is_tenant_admin() ──→ RPC gates
    ↓
SECURITY DEFINER RPC ──→ cross-table reads/writes
```

---

## Ownership Matrix

| Domain | Schema owner | RLS owner | Client entry |
|--------|-------------|-----------|--------------|
| SaaS billing | 001 | 002 | super_admin UI |
| ISP CRUD | 001 | 002 | dashboard + RLS |
| Cards atomic | 004, 008, 009 | 002, 008 | RPC |
| Messages | 010 | 010, 019 | RPC (read + send) |
| Credentials | 001, 014 | 002 | RPC + Vault |
| Admin users | 007, 018, 019 | 007, 019 | RPC |

---

## What Changed Over Time (High-Level)

| Before | After | Migration |
|--------|-------|-----------|
| `internet_credentials.password` plain TEXT | `password_secret_id` → Vault | 014 |
| PostgREST embed inbox | `get_my_inbox()` RPC | 015 |
| Direct UPDATE users (suspend) | `suspend_tenant_employee()` | 019 |
| Cross-table RLS EXISTS | SECURITY DEFINER helpers | 019 |
| `sell_cards(name, …)` | `sell_cards(distributor_id, …)` | 009 |
