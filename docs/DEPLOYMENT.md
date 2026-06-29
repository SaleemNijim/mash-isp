# MASH ISP — دليل النشر والإطلاق

> مرجع تشغيلي قبل رفع التطبيق إلى Vercel + Supabase.  
> لا يحتوي على مفاتيح حقيقية — انسخ `.env.example` إلى `.env.local` محلياً أو أضف المتغيرات في Vercel Dashboard.

---

## 1) المتطلبات المسبقة

| البند | الحالة |
|-------|--------|
| مشروع Supabase (Production) | مطلوب |
| حساب Vercel مربوط بالمستودع | مطلوب |
| دومين نهائي (مثلاً `app.mash-isp.com`) | مطلوب للإنتاج |
| Node.js 20+ محلياً | للاختبار قبل الرفع |
| Supabase CLI (`npm run supabase`) | لتطبيق migrations |

---

## 2) متغيرات البيئة في Vercel

أضفها من **Project → Settings → Environment Variables** لبيئتي **Preview** و**Production**.

| المتغير | النطاق | مطلوب | الوصف |
|---------|--------|-------|-------|
| `NEXT_PUBLIC_SUPABASE_URL` | Public | نعم | رابط مشروع Supabase |
| `NEXT_PUBLIC_SUPABASE_ANON_KEY` | Public | نعم | مفتاح anon (آمن للمتصفح مع RLS) |
| `SUPABASE_SERVICE_ROLE_KEY` | **Server فقط** | نعم | يتجاوز RLS — **ممنوع** `NEXT_PUBLIC_` |
| `NEXT_PUBLIC_APP_URL` | Public | نعم | الدومين النهائي، مثلاً `https://app.example.com` |
| `GOOGLE_DRIVE_CLIENT_ID` | Server | للمزامنة | OAuth Web Client من Google Cloud |
| `GOOGLE_DRIVE_CLIENT_SECRET` | Server | للمزامنة | سر OAuth |
| `GOOGLE_TOKEN_ENCRYPTION_KEY` | Server | للمزامنة | 32 بايت hex (64 حرف) أو base64 |
| `CRON_SECRET` | Server | للمزامنة | يحمي `GET/POST /api/google-drive/sync` من pg_cron |

### التحقق من أمان service role

`SUPABASE_SERVICE_ROLE_KEY` يُستخدم **حصراً** في:

- `lib/supabase/admin.ts`
- مسارات `app/api/google-drive/*`
- اختبارات التكامل في `__tests__/` (محلياً فقط)

**لا يوجد** أي `NEXT_PUBLIC_SUPABASE_SERVICE_ROLE_KEY` في المشروع.

---

## 3) تطبيق Migrations على Supabase

المشروع يحتوي **72 ملف migration** في `supabase/migrations/` (من `001` حتى `068` + ملفات timestamped).

### الطريقة الموصى بها

```bash
# من جذر المشروع — بعد ربط المشروع:
npx supabase link --project-ref YOUR_PROJECT_REF
npm run db:push
# أو: npx supabase db push
```

### التحقق

```bash
npx supabase migration list
```

يجب أن تكون كل migrations في عمود **Local** مطبقة على **Remote**.

### ملاحظات حرجة

- **لا تحذف** migrations مطبقة على production.
- migration `014_credentials_vault_encryption.sql` يتطلب امتداد **Vault** مفعّلاً.
- migration `034`/`036` تنشئ bucket `tenant_logos` — تأكد من وجوده في Storage.
- bucket `payment_proofs` مطلوب لرفع إشعارات الدفع (انظر `lib/payment-proof.ts`).

---

## 4) إعداد Supabase Dashboard

### 4.1 Auth URLs

من **Authentication → URL Configuration**:

| الحقل | القيمة |
|-------|--------|
| Site URL | `https://YOUR_DOMAIN` |
| Redirect URLs | `https://YOUR_DOMAIN/auth/callback` |
| | `https://YOUR_DOMAIN/reset-password` |
| | `http://localhost:3000/auth/callback` (تطوير) |

### 4.2 تفعيل pg_cron

من **Database → Extensions** → فعّل `pg_cron`.

بعد تطبيق migrations، تحقق من وجود المهام:

| Job | الجدولة | الغرض |
|-----|---------|-------|
| `overdue-to-debt` | كل ساعة | تحويل المهام المتأخرة لديون |
| `remind-pending` | كل 4 ساعات | تذكير المهام المعلقة |
| `clean-nonces` | كل ساعة | تنظيف sync_nonces |
| `notify-subscription-expiring` | يومياً | تنبيه انتهاء الاشتراك |
| `purge-expired-deleted` | 03:30 يومياً | تفريغ سلة المحذوفات |
| `google-drive-sync` | كل ساعة | مزامنة Google Drive لكل الشركات المربوطة |

```sql
SELECT jobname, schedule FROM cron.job ORDER BY jobname;
```

### 4.2.1 أسرار Vault لمزامنة Google Drive (pg_cron)

بعد تطبيق migration `068_google_drive_sync_pg_cron.sql`، أضف في **SQL Editor**:

```sql
-- مرة واحدة — استبدل القيم بقيم الإنتاج
SELECT vault.create_secret(
  'https://YOUR_DOMAIN',
  'google_drive_sync_app_url',
  'MASH ISP — رابط التطبيق لمزامنة Drive'
);

SELECT vault.create_secret(
  'YOUR_CRON_SECRET',
  'google_drive_sync_cron_secret',
  'MASH ISP — Bearer token لـ /api/google-drive/sync'
);
```

يجب أن يطابق `YOUR_CRON_SECRET` قيمة `CRON_SECRET` في Vercel.  
المزامنة التلقائية تعمل عبر **Supabase pg_cron + pg_net** — لا حاجة لـ Vercel Pro.

### 4.3 Vault

تأكد أن امتداد **supabase_vault** مفعّل (افتراضي في Supabase). كلمات مرور `internet_credentials` مشفرة عبر Vault (migration 014).

### 4.4 Storage

| Bucket | الاستخدام |
|--------|-----------|
| `tenant_logos` | شعارات الشركات (public read) |
| `payment_proofs` | إثباتات الدفع الإلكتروني |

### 4.5 النسخ الاحتياطي

من **Project Settings → Database → Backups** → فعّل **Daily Backups** (خطة Pro أو أعلى).

### 4.6 Advisors

شغّل **Database → Advisors** (Security + Performance) قبل الإطلاق وأصلح التحذيرات الحرجة.

---

## 5) Google Drive OAuth

### 5.1 Google Cloud Console

1. أنشئ مشروع **MASH ISP**.
2. فعّل **Google Drive API**.
3. **OAuth consent screen** → External (أو Internal إن كان Workspace فقط).
4. أنشئ **OAuth 2.0 Client ID** من نوع **Web application**.

### 5.2 Authorized redirect URIs

```
https://YOUR_DOMAIN/api/google-drive/callback
http://localhost:3000/api/google-drive/callback
```

### 5.3 Scopes المستخدمة

- `openid`
- `https://www.googleapis.com/auth/userinfo.email`
- `https://www.googleapis.com/auth/drive.file`

### 5.4 Verification

إذا سيستخدم الميزة **عملاء خارج test users**، أكمل **Google App Verification** أو ابقَ في وضع Testing مع قائمة مستخدمين محددة.

### 5.5 مفتاح التشفير

```bash
# توليد مفتاح 32 بايت hex:
node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"
```

ضعه في `GOOGLE_TOKEN_ENCRYPTION_KEY` في Vercel.

---

## 6) حساب Super Admin

Super Admin **منفصل** عن مديري الشركات (`admin`). لا يوجد تسجيل ذاتي له.

### الخطوات

1. أنشئ مستخدماً في **Supabase Auth** (Dashboard → Authentication → Users → Add user).
2. انسخ `User UID`.
3. نفّذ في SQL Editor:

```sql
INSERT INTO users (id, tenant_id, role, name, is_active)
VALUES (
  'PASTE_AUTH_USER_UUID',
  NULL,
  'super_admin',
  'اسم المسؤول',
  true
)
ON CONFLICT (id) DO UPDATE
SET role = 'super_admin', tenant_id = NULL, is_active = true;
```

### الحماية

- `proxy.ts` يحصر `super_admin` على `/super-admin/*`.
- `app/super-admin/layout.tsx` يتحقق server-side من الدور قبل عرض الواجهة.
- مدير شركة (`admin`) يُحوَّل إلى `/dashboard` إن حاول فتح `/super-admin/*`.

---

## 7) النشر على Vercel

### 7.1 قبل الرفع

```bash
npm test
npm run build
```

### 7.2 ربط المستودع

1. Import project في Vercel.
2. Framework: **Next.js** (يكتشف تلقائياً).
3. أضف متغيرات البيئة (القسم 2).
4. **Deploy** → Preview أولاً.

### 7.3 مزامنة Google Drive (pg_cron)

المزامنة التلقائية **ليست** على Vercel Cron (خطة Hobby تسمح بمهمة واحدة يومياً فقط).  
تُجدول كل **ساعة** عبر **Supabase pg_cron** → `GET /api/google-drive/sync` مع `Authorization: Bearer <CRON_SECRET>`.

1. طبّق migration `068_google_drive_sync_pg_cron.sql`.
2. فعّل امتداد **pg_net** من Database → Extensions (إن لم يُفعَّل تلقائياً).
3. أضف أسرار Vault (القسم 4.2.1).
4. تأكد من `CRON_SECRET` في Vercel.

زر **مزامنة Drive** في شريط التطبيق متاح للمسؤول والكاشير عندما يكون Drive مربوطاً.

### 7.4 Production

بعد نجاح Preview وManual QA → **Promote to Production** أو merge إلى الفرع الرئيسي.

---

## 8) اختبارات ما قبل الإطلاق

### 8.1 الأمان (§8.1)

| # | البند | كيف تختبر |
|---|---|---|
| S1 | FORCE RLS: Tenant A لا يرى بيانات Tenant B | JWT لـ Tenant A + SELECT من جدول Tenant B → يجب 0 نتائج |
| S2 | has_permission تفحص is_active | علِّق مستخدم → POST API → يجب 403 |
| S3 | subscription_plans: Tenant لا يعدِّل الأسعار | PATCH بـ tenant JWT → يجب 403 |
| S4 | Super Admin فقط يعدِّل الخطط | PATCH بـ super_admin JWT → يجب 200 |
| S5 | Soft Delete: لا حذف فعلي | SELECT WHERE is_deleted=true → يجد السجل |
| S6 | audit_logs يسجل كل حذف | حذف → audit_logs يحتوي القيم القديمة |
| S7 | force_logout_at يعمل فوراً | علِّق مستخدم → reload → خروج تلقائي |
| S8 | Trial expiry → redirect | trial_ends_at = now()-1h → reload → /subscription-expired |
| S9 | Realtime isolation | Tenant A يستمع → Tenant B يُحدِّث MAC → Tenant A لا يستقبل |

### 8.2 التسعير — Zero Tolerance (§8.2)

| # | الاختبار | المعيار |
|---|---|---|
| PR1 | discount_percent يُحسب صحيحاً | price_monthly=20, annual=180 → discount_percent=25.0 |
| PR2 | تعديل السعر من Super Admin يظهر فوراً | UPDATE price_annual → reload pricing → سعر + discount جديد |
| PR3 | لا hard-coded prices في الكود | بحث في `components/public` → لا أسعار ثابتة |
| PR4 | Enterprise = Coming Soon | is_coming_soon=true → EnterpriseComingSoonCard |
| PR5 | تفعيل Enterprise بدون code change | is_coming_soon=false, is_active=true → PlanCard |
| PR6 | Trial يقرأ trial_days من DB | register جديد → trial_ends_at = now + trial_days |
| PR7 | UpgradeModal يعرض الخطتين | TrialBanner → Pro Monthly + Annual من DB |
| PR8 | مشترك monthly لا يحصل على annual price | billing_cycle في mash_invoices يطابق الخطة |

### 8.3 العمليات (§8.3)

| # | العملية | المعيار |
|---|---|---|
| O1 | تجديد اشتراك → RPC ذري | كل واحد أو لا شيء |
| O2 | استلام دفعة → Trigger يزيد المخزون | quantity_in_stock يتغير فوراً |
| O3 | حذف دفعة → Trigger يُعيد المخزون | لا رصيد سالب |
| O4 | Cron 1h → دين مؤقت بلا تكرار | UNIQUE related_task_id |
| O5 | تغيير MAC → Realtime للـ tenant فقط | isolation صحيح |
| O6 | Toggle صلاحية → فوري بلا re-login | Zustand يُحدَّث |
| O7 | استيراد Excel أحمر → is_used=true | exceljs يقرأ الألوان |

### اختبارات آلية

```bash
npm test
```

**اختبارات متخطاة بدون `.env.test.local`:**

| الملف | السبب |
|-------|-------|
| `__tests__/security/multi-tenant.test.ts` | يحتاج `TEST_TENANT_A_JWT`, `TEST_TENANT_B_JWT` |
| `registration.test.ts` (تكامل) | يحتاج Supabase env |
| `soft-delete.test.ts` (تكامل) | يحتاج Supabase env |

انظر `docs/TESTING.md` لتفاصيل إنشاء JWT تجريبية.

### Manual QA إضافي

- [ ] تسجيل شركة + Trial
- [ ] تأكيد البريد / استعادة كلمة المرور
- [ ] رسائل super_admin ↔ شركات
- [ ] بيع وتجديد اشتراكات + بطاقات
- [ ] Google Drive: ربط (مسؤول) / مزامنة (مسؤول + كاشير) / فصل
- [ ] انتهاء اشتراك → `/subscription-expired`

---

## 9) ترتيب الإطلاق الموصى به

1. `npm test` + `npm run build` محلياً
2. تطبيق كل migrations على Supabase Production
3. تفعيل pg_cron + Vault + Storage + Backups
4. ضبط Auth URLs + متغيرات Vercel
5. إعداد Google OAuth (إن لزم)
6. إنشاء حساب `super_admin`
7. نشر Preview → Manual QA (§8)
8. Promote to Production

---

## 10) مراجع

| الملف | المحتوى |
|-------|---------|
| `docs/BLUEPRINT.md` | المواصفات الكاملة |
| `docs/TESTING.md` | تشغيل الاختبارات وJWT تجريبية |
| `.env.example` | قائمة المتغيرات |
| `vercel.json` | Security Headers |
