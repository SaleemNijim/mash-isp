# MASH ISP — RPC Catalog

> كل دالة RPC وhelper قابلة للاستدعاء من `authenticated`.  
> **يُحدَّث إلزامياً** عند إضافة/تعديل RPC.

**Legend:** 🔒 = SECURITY DEFINER | 📖 = STABLE read | ✍️ = mutation

---

## RLS Helper Functions (internal — used in policies)

| Function | Type | Migration | Reads | Purpose |
|----------|------|-----------|-------|---------|
| `get_tenant_id()` | 🔒 📖 | 002 | `users` | tenant context for policies |
| `has_permission(user, perm)` | 🔒 📖 | 002 | `user_permissions`, `users` | permission gate + `is_active` |
| `is_super_admin()` | 🔒 📖 | 002 | `users` | platform admin |
| `is_tenant_admin()` | 🔒 📖 | 007 | `users` | company admin |
| `is_message_recipient(msg_id)` | 🔒 📖 | 019 | `message_recipients` | break RLS loop |
| `is_message_sender_of(msg_id)` | 🔒 📖 | 019 | `internal_messages` | break RLS loop |
| `user_is_my_message_sender(user_id)` | 🔒 📖 | 019 | `internal_messages`, `message_recipients` | break RLS loop |

---

## Auth & Onboarding

| RPC | Grant | Migration | Called From | Notes |
|-----|-------|-----------|-------------|-------|
| `get_my_user_profile()` | authenticated | 013 | `useTenant`, `proxy.ts`, permissions | Returns role, tenant_id, is_active, force_logout_at |
| `create_tenant_with_trial(company, admin_name)` | authenticated | 004→013 | `/register`, login setup | Idempotent since 013 — returns existing tenant_id |

---

## Admin & User Management

| RPC | Grant | Migration | Called From | Notes |
|-----|-------|-----------|-------------|-------|
| `list_tenant_users()` | authenticated | 015 | `useTenantUsers`, messages compose | Active admin+employee in tenant |
| `list_tenant_user_permissions()` | authenticated | 018 | `PermissionMatrix` | Employee permissions only |
| `set_employee_permission(user_id, perm, grant)` | authenticated | 018 | `PermissionMatrix` | Requires `is_tenant_admin()` |
| `suspend_tenant_employee(user_id)` | authenticated | 019 | permissions page | Sets `is_active=false`, `force_logout_at=now()` |

---

## Messaging — Send

| RPC | Grant | Migration | Authorization |
|-----|-------|-----------|---------------|
| `super_admin_send_to_tenant(tenant_id, title, body, …)` | authenticated | 010 | `is_super_admin()` |
| `super_admin_broadcast_to_tenants(title, body, …, tenant_ids?)` | authenticated | 010 | `is_super_admin()` |
| `admin_send_to_employees(title, body, …, employee_ids?)` | authenticated | 010 | `is_tenant_admin()` |
| `admin_send_to_platform(title, body, …)` | authenticated | 010 | `is_tenant_admin()` |

**Internal (no direct grant):** `_dispatch_internal_message(...)` — called by send RPCs only.

---

## Messaging — Read / Mark

| RPC | Grant | Migration | Called From | Why RPC? |
|-----|-------|-----------|-------------|----------|
| `get_my_inbox()` | authenticated | 015 | `useInbox` | Flat join bypasses RLS embed issues |
| `get_my_sent_messages()` | authenticated | 016 | `useSentMessages` | Sender + recipient count |
| `get_my_unread_message_count()` | authenticated | 017 | `useUnreadMessageCount` | Badge count |
| `peek_inbox_message(message_id)` | authenticated | 015 | Realtime toast | Title/priority without full load |
| `mark_message_read(recipient_id)` | authenticated | 010 | `useMessageMutations` | Own row update |
| `mark_all_messages_read()` | authenticated | 010 | Messages page | Bulk mark read |

---

## Credentials (Vault)

| RPC | Grant | Migration | Authorization | Notes |
|-----|-------|-----------|---------------|-------|
| `set_credential_password(credential_id, password)` | authenticated | 014 | same tenant | Creates vault secret |
| `reveal_credential_password(credential_id)` | authenticated | 014 | `view_full_password` | Returns plaintext |
| `bulk_insert_credentials(rows JSONB)` | authenticated | 014 | same tenant | Excel import batch |

**Schema:** `internet_credentials.password_secret_id` → `vault.secrets` (014). No plain password column.

---

## ISP Business — Atomic Operations

| RPC | Grant | Migration | Operation |
|-----|-------|-----------|-----------|
| `renew_subscription(sub_id, cred_id, amount, method, bank_id, nonce)` | authenticated | 004 | Extend sub + payment + nonce |
| `receive_card_batch(supplier, notes, items JSONB)` | authenticated | 004 | Batch receive + stock trigger |
| `record_warehouse_movement(item_id, type, qty, notes?)` | authenticated | 006 | Movement + quantity update |
| `sell_cards(distributor_id, commission, method, bank_id, proof, items, nonce)` | authenticated | 008→**009** | Distributor sale atomic |
| `sell_retail_cards(product_id, qty, price, type, method, bank_id, notes, proof, nonce)` | authenticated | 008→**009** | Retail sale atomic |

### ⚠️ Breaking Change: sell_cards (008 → 009)

| Version | Signature highlight |
|---------|---------------------|
| v1 (008) | `p_distributor_name TEXT`, `p_previous_balance` |
| v2 (009) | `p_distributor_id UUID`, `p_payment_method`, `p_proof_url` |

**Current canonical:** 009 signature only.

---

## Trigger Functions (not client-callable)

| Function | Migration | Trigger on |
|----------|-----------|------------|
| `set_updated_at()` | 001 | `subscription_plans` |
| `log_soft_delete()` | 003 | 8 ISP tables |
| `update_stock_on_batch()` | 003 | `card_batch_items` INSERT |
| `reverse_stock_on_batch_delete()` | 003 | `card_batches` soft delete |
| `log_mac_change()` | 003 | `network_routers` MAC change |
| `cancel_debt_on_payment()` | 003 | `payments` INSERT |

---

## RPC Selection Guide (for new features)

```
Need to...
├── Read own tenant row with simple filter     → PostgREST + RLS
├── Join 2+ RLS tables for UI list             → RPC (flat SELECT)
├── Admin mutate users/permissions             → RPC + is_tenant_admin()
├── Multi-step business (payment + stock)      → RPC atomic
├── Store secret at rest                       → Vault + RPC
└── Cross-tenant (super_admin)                 → RPC + is_super_admin()
```

---

## Grants Audit Summary

| Category | Count | All granted to `authenticated`? |
|----------|-------|--------------------------------|
| Client RPCs | ~22 | Yes (explicit GRANT in migrations) |
| Policy helpers | 7 | No direct grant — policy/internal only |
| `_dispatch_internal_message` | 1 | No — internal only |

**Pattern for new RPCs:**
```sql
REVOKE ALL ON FUNCTION ... FROM PUBLIC;
GRANT EXECUTE ON FUNCTION ... TO authenticated;
```

---

## Version History (function rewrites)

| Function | Versions | Latest |
|----------|----------|--------|
| `create_tenant_with_trial` | 004, 013 | 013 (idempotent) |
| `sell_cards` | 008, 009 | 009 |
| `sell_retail_cards` | 008, 009 | 009 |
| `users_message_sender_read` | policy 011, helper 019 | 019 |

---

## Related

- [`RLS_GRAPH.md`](./RLS_GRAPH.md) — policy dependencies
- [`MIGRATION_GOVERNANCE.md`](./MIGRATION_GOVERNANCE.md) — when to add RPC vs migration
- [`DATABASE_LAYERS.md`](./DATABASE_LAYERS.md) — layer overview
