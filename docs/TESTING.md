# MASH ISP — دليل الاختبارات

## تشغيل الاختبارات

```bash
# كل الاختبارات
npm test

# وضع المراقبة
npm run test:watch

# اختبارات المسارات فقط (سريعة — لا تحتاج Supabase)
npm run test:routes
```

## متغيرات البيئة للاختبارات التكاملية

أنشئ `.env.test.local` (أو صدّر المتغيرات في shell) قبل تشغيل اختبارات `security/` و `saas/` و `isp/`:

| المتغير | مطلوب لـ | الوصف |
|---|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | integration | رابط مشروع Supabase التجريبي |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | integration | مفتاح anon |
| `SUPABASE_SERVICE_ROLE_KEY` | integration | مفتاح service role (للتحقق من RLS) |
| `TEST_TENANT_A_JWT` | multi-tenant S1 | JWT لمستخدم Tenant A |
| `TEST_TENANT_B_JWT` | multi-tenant S1/S9 | JWT لمستخدم Tenant B |
| `TEST_BASE_URL` | API tests | اختياري — افتراضي `http://localhost:3000` |

### إنشاء JWT تجريبية

1. سجّل مستخدمين في مشروعين (أو tenantين) مختلفين عبر `/register`.
2. انسخ access token من DevTools → Application → Cookies أو من `supabase.auth.getSession()`.
3. عيّن `TEST_TENANT_A_JWT` و `TEST_TENANT_B_JWT`.

بدون هذه المتغيرات، الاختبارات التكاملية تُعلَّم `skip` مع سبب واضح — `npm test` يمر دون فشل.

## اختبارات المسارات (`test:routes`)

الملف `__tests__/routes/route-integrity.test.ts` يتحقق من:

1. **STATIC_ROUTE_MANIFEST** — كل `app/**/page.tsx` مُكتشَف من filesystem
2. **NAV_LINKS** — كل عنصر `available: true` في `DASHBOARD_NAV` له صفحة
3. **INTERNAL_LINKS** — كل `href="/..."` في `app/` و `components/` يشير لمسار صالح
4. **PROXY_REDIRECT_TARGETS** — كل redirect في `proxy.ts` له `page.tsx` أو `route.ts`
5. **FORBIDDEN_PATHS** — لا `/dashboard/subscriptions`، لا `middleware.ts`، لا `lib/supabase/middleware`

## قائمة Manual QA (من إصلاحات المسارات والـ auth)

### تسجيل ومصادقة

- [ ] `/register` — تسجيل شركة جديدة: مع session فورية → `create_tenant_with_trial` → `/dashboard`
- [ ] `/register` — مع تأكيد بريد: redirect إلى `/verify-email` (لا RPC مباشرة)
- [ ] `/auth/callback` — بعد تأكيد البريد → RPC → `/dashboard`
- [ ] `/login` — دخول مستخدم نشط → `/dashboard`
- [ ] مستخدم معلّق → `/suspended`
- [ ] اشتراك منتهٍ → `/subscription-expired`

### كل رابط القائمة (`available: true`)

| الرابط | المتوقع |
|---|---|
| `/dashboard` | لوحة KPIs |
| `/subscriptions` | إدارة الاشتراكات |
| `/card-batches` | دفعات البطاقات |
| `/warehouse` | المستودع |
| `/network/routers` | الشبكة |
| `/payments` | المدفوعات |
| `/pending-tasks` | المهام المعلقة |
| `/excel-viewer` | استيراد Excel |

**ممنوع:** أي رابط من شكل `/dashboard/X` حيث `X ≠ home` — المسارات الفعلية بدون بادئة `/dashboard/`.

### Super Admin

- [ ] `/super-admin/tenants` — قائمة الشركات
- [ ] `/super-admin/plans` — تعديل الأسعار
- [ ] `/super-admin/invoices` — فواتير MASH

### Regressions مغطاة آلياً

| # | الاختبار | الملف |
|---|---|---|
| R1 | `proxy.ts` يستخدم `getUser()` أولاً | `known-issues.test.ts` |
| R2 | register: session → RPC، لا session → verify-email | `known-issues.test.ts` |
| R3 | `auth/callback` يستدعي `create_tenant_with_trial` | `known-issues.test.ts` |
| R4 | `usePermissions.subscribe` يزيل القناة القديمة | `known-issues.test.ts` |
| R5 | migration `007_admin_user_rls.sql` موجود | `known-issues.test.ts` |
| R6 | `ExcelImportEngine` يستخدم `exceljs` | `known-issues.test.ts` |
| R7 | لا `/dashboard/subscriptions` | `route-integrity.test.ts` |
| R8 | لا `middleware.ts` في الجذر | `route-integrity.test.ts` |

## هيكل الاختبارات

```
__tests__/
  routes/route-integrity.test.ts   # مسارات + proxy + nav
  unit/DeleteConfirmModal.test.tsx # §1.1 B8
  regression/known-issues.test.ts  # إصلاحات المحادثة
  security/multi-tenant.test.ts    # §8.1 RLS
  saas/pricing.test.ts             # §8.2
  saas/registration.test.ts        # §2.1
  isp/soft-delete.test.ts          # §8.1 S5/S6
```
