# MASH ISP — Blueprint v3.1 (Pricing Edition)

> **هذا الملف هو المرجع الوحيد للمواصفات.** أي برومبت يُشير إلى "§X.Y" يقصد القسم المرقّم في هذا الملف.
> نسخة Markdown مكافئة للوثيقة الأصلية `MASH_ISP_Blueprint_v3_1.docx` — مُعدّة لتُقرأ من Cursor داخل المشروع في المسار `docs/BLUEPRINT.md`.

| البند | القيمة |
|---|---|
| الإصدار | v3.1 — Pricing Edition |
| التاريخ | يونيو 2025 |
| التغيير عن v3.0 | إعادة تصميم هيكل التسعير بالكامل |
| العميل التجريبي | فيوتشر واي — نابلس |

## ما الجديد في v3.1 عن v3.0

1. إلغاء خطط Starter / Professional القديمة — استبدالها بـ: **Free Trial + Pro فقط**.
2. Pro: خطة واحدة موحدة — شهري أو سنوي — بدون قيود على عدد المشتركين.
3. Enterprise: معروضة كـ **Coming Soon** — معطَّلة — المعمارية تدعم تفعيلها لاحقاً.
4. الأسعار: **ديناميكية بالكامل من Super Admin — لا hard-coded values أبداً**.
5. حساب التوفير تلقائي: "وفِّر X% مع الدفع السنوي".
6. تحديث جميع Migration / Seed / Prompts لتعكس البنية الجديدة.

---

## §1 — الأخطاء الحرجة المكتشفة والمُصحَّحة

تصنيف: (B) برمجي، (A) معماري، (BM) نموذج عمل. **جميعها مُصحَّحة في v3.1 ويجب أن يلتزم بها كل كود جديد.**

### §1.1 الأخطاء البرمجية

| # | الخطأ | المشكلة الأصلية | التصحيح الملزم |
|---|---|---|---|
| B1 | UNIQUE credentials خاطئ | `UNIQUE(username)` يمنع نفس username بين شركات مختلفة | `UNIQUE(tenant_id, username)` |
| B2 | `has_permission` لا تفحص `is_active` | مستخدم معلَّق يجتاز فحص الصلاحية | إضافة `JOIN users WHERE is_active=true` |
| B3 | Soft Delete Trigger: `NEW.tenant_id` | قد يكون NULL عند الحذف | استخدام `OLD.tenant_id` في الـ Trigger |
| B4 | Cron يُكرر الديون | نفس pending_task يُولِّد ديناً كل ساعة | `UNIQUE(related_task_id)` + `NOT EXISTS` |
| B5 | SheetJS لا يقرأ fill color | SheetJS المجاني لا يدعم ألوان الخلايا | استبدال بـ **exceljs** |
| B6 | Trigger حذف الدفعة لا يُعيد المخزون | حذف batch لا يُعدِّل quantity_in_stock | Trigger على `is_deleted=true` يعكس الكميات |
| B7 | payments CHECK ناقص | دفع إلكتروني بدون bank_account_id مقبول | `CHECK: method NOT IN(cash,debt) → bank_account_id IS NOT NULL` |
| B8 | DeleteConfirmModal بدون Network Error handling | النافذة مفتوحة بلا رسالة خطأ | `try/catch + toast.error` |
| B9 | pending_tasks status enum ناقص | `reminded` غير موجود في CHECK | إضافة `'reminded'` للـ CHECK |
| B10 | `price_annual` فقط في subscription_plans | لا price_monthly — لا حساب توفير | إضافة `price_monthly + discount_percent` (§2.4) |

### §1.2 الأخطاء المعمارية

| # | العيب المعماري | القرار الملزم |
|---|---|---|
| A1 | غياب طبقة SaaS | Landing → Register → Trial → Pro — طبقة كاملة |
| A2 | Multi-Tenant RLS ثغرات | `FORCE ROW LEVEL SECURITY` على كل الجداول |
| A3 | Offline نطاق غير محدد | تجديد + بيع بطاقات فقط offline — الباقي online (§6.1) |
| A4 | RPC Functions غير مكتوبة | `renew_subscription` + `receive_card_batch` + `create_tenant_with_trial` |
| A5 | Realtime استقبال غير مُطبَّق | `useRealtimeChannels(tenantId)` في layout.tsx (§4.3) |
| A6 | VirtualScroll + Pagination تعارض | `useInfiniteVirtualData` يجمعهما (§6.5) |
| A7 | Realtime channels عامة | channel name: `mac-changes-{tenantId}` |
| A8 | لا Tenant Onboarding | Register → `create_tenant_with_trial()` → Trial 30 يوم |
| A9 | خطط الاشتراك hard-coded | Dynamic Pricing: كل قيمة في DB + Super Admin controls (§3) |

### §1.3 عيوب نموذج العمل

| # | المشكلة | الحل الملزم |
|---|---|---|
| BM1 | لا فواتير MASH | `mash_invoices + mash_payments` |
| BM2 | لا Trial | Trial 30 يوم تلقائي عند التسجيل |
| BM3 | WE is_used غير دقيق | حقل informational مع تحذير UI |
| BM4 | نسبة الموزع عند رصيد سالب | `previous_balance` دائماً >= 0 |
| BM5 | لا آلية إلغاء دين عند الدفع | payment جديد → `UPDATE debts SET status=cancelled` |
| BM6 | خطط متعددة بأسعار ثابتة | Pro شهري + سنوي + Enterprise Coming Soon — كل شيء ديناميكي |

---

## §2 — طبقة SaaS الكاملة

هذه الطبقة جزء أساسي من المشروع وليست إضافة مستقبلية.

### §2.1 مسار المستخدم الكامل (User Journey)

```text
زائر يصل → Landing Page
  ↓  يشاهد المميزات + الأسعار (Pro شهري / سنوي) + Enterprise Coming Soon
يضغط "ابدأ مجاناً 30 يوم" → صفحة التسجيل
  ↓  يملأ: اسم الشركة + البريد + كلمة المرور
تسجيل ناجح → create_tenant_with_trial() → Tenant + Trial 30 يوم
  ↓  يُحوَّل إلى Dashboard + TrialBanner "تجربة مجانية: 30 يوم متبقية"
يستخدم النظام بحرية — وصول كامل لكل مميزات Pro خلال التجربة
  ↓  يوم 23: تذكير بريدي + Banner يتحول لـ warning
  ↓  يوم 28: تذكير ثانٍ + Banner يتحول لـ danger
يضغط "اشترك الآن" → صفحة الأسعار (Pro شهري أو سنوي)
  ↓  يختار الخطة → يُرسل إشعار الدفع → Super Admin يؤكد
subscription_end تمتد (شهر أو سنة) → is_trial=false
  ↓  يوم N-10: تذكير تجديد
```

### §2.2 صفحات الطبقة العامة (Public Layer)

| الصفحة | المسار | المحتوى الأساسي | CTA الرئيسي |
|---|---|---|---|
| Landing Page | `/` | Hero + مميزات + شهادات + FAQ + مقطع الأسعار | ابدأ مجاناً 30 يوم |
| صفحة المميزات | `/features` | قائمة تفصيلية بكل وظيفة + فائدتها | جرّب مجاناً |
| صفحة الأسعار | `/pricing` | Pro (شهري/سنوي) + Enterprise Coming Soon + مقارنة مميزات | ابدأ التجربة المجانية |
| صفحة التواصل | `/contact` | نموذج + واتساب + بريد | أرسل رسالة |
| التسجيل | `/register` | اسم الشركة + البريد + كلمة المرور | إنشاء الحساب |
| تأكيد البريد | `/verify-email` | رسالة تأكيد + إعادة إرسال | تم التحقق |
| تسجيل الدخول | `/login` | البريد + كلمة المرور | دخول |
| انتهاء الاشتراك | `/subscription-expired` | رسالة + Pro شهري / سنوي + Enterprise Coming Soon | جدِّد الاشتراك |

### §2.3 هيكل الخطط — القرار المعماري النهائي

**هذا هو القرار المعماري المعتمد — لا تعديل عليه:**

1. **Free Trial**: 30 يوم مجاناً — وصول كامل لكل مميزات Pro — لا بطاقة ائتمان.
2. **Pro Monthly**: سعر شهري — قابل للتعديل من Super Admin.
3. **Pro Annual**: سعر سنوي — قابل للتعديل — يعرض نسبة التوفير تلقائياً.
4. **Enterprise**: معطَّلة نهائياً — تُعرض كـ "Coming Soon" مع رسالة ترويجية.

**قاعدة صارمة:** لا أسعار hard-coded في الكود أبداً — كل قيمة من DB.
**قاعدة صارمة:** حساب التوفير تلقائي من: `((price_monthly*12 - price_annual) / (price_monthly*12)) * 100`

| الخطة | الحالة | السعر | الميزات | الحد |
|---|---|---|---|---|
| Free Trial | ✅ مُفعَّلة دائماً | مجاناً — 30 يوم | كل مميزات Pro بالكامل | لا قيود خلال التجربة |
| Pro — Monthly | ✅ مُفعَّلة | يُحدِّدها Super Admin | وصول كامل — لا قيود | لا حد على المشتركين |
| Pro — Annual | ✅ مُفعَّلة | يُحدِّدها Super Admin + خصم | نفس Pro + توفير يُحسب تلقائياً | لا حد على المشتركين |
| Enterprise | 🔒 Coming Soon | غير محدَّد بعد | رسالة ترويجية فقط — لا تفعيل | معمارياً: قابل للتفعيل |

### §2.4 قاعدة البيانات — جداول SaaS

#### subscription_plans — Schema النهائي (يُطبَّق حرفياً)

```sql
CREATE TABLE subscription_plans (
  id                  UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  slug                TEXT NOT NULL UNIQUE,  -- "free_trial" | "pro_monthly" | "pro_annual" | "enterprise"
  name                TEXT NOT NULL,
  billing_cycle       TEXT NOT NULL          -- "trial" | "monthly" | "annual" | "coming_soon"
                      CHECK (billing_cycle IN ('trial','monthly','annual','coming_soon')),
  price_monthly       NUMERIC(10,2),         -- سعر الشهر (للـ monthly plan)
  price_annual        NUMERIC(10,2),         -- سعر السنة (للـ annual plan)
  discount_percent    NUMERIC(5,2)           -- يُحسب تلقائياً ويُخزَّن للعرض
                      GENERATED ALWAYS AS (
                        CASE WHEN price_monthly IS NOT NULL AND price_annual IS NOT NULL
                          AND price_monthly > 0
                          THEN ROUND(((price_monthly * 12 - price_annual) / (price_monthly * 12)) * 100, 1)
                          ELSE NULL
                        END
                      ) STORED,
  trial_days          INTEGER DEFAULT 30,    -- للـ Free Trial فقط
  features            JSONB DEFAULT '[]',    -- قائمة المميزات للعرض
  is_active           BOOLEAN DEFAULT true,  -- تُعطِّل/تُفعِّل الخطة
  is_coming_soon      BOOLEAN DEFAULT false, -- Enterprise = true
  promotional_message TEXT,                  -- رسالة Coming Soon
  sort_order          INTEGER DEFAULT 0,     -- ترتيب العرض في UI
  created_at          TIMESTAMPTZ DEFAULT now(),
  updated_at          TIMESTAMPTZ DEFAULT now()
);

-- Trigger: updated_at تلقائي
CREATE TRIGGER trg_plans_updated_at
  BEFORE UPDATE ON subscription_plans
  FOR EACH ROW EXECUTE FUNCTION set_updated_at();
```

#### Seed — البيانات الافتراضية (الأسعار أمثلة فقط — الفعلي من Super Admin)

```sql
INSERT INTO subscription_plans
  (slug, name, billing_cycle, price_monthly, price_annual,
   trial_days, is_active, is_coming_soon, promotional_message, sort_order, features)
VALUES
  -- ① Free Trial
  ('free_trial', 'تجربة مجانية', 'trial',
   NULL, NULL, 30, true, false, NULL, 0,
   '["وصول كامل لكل المميزات","30 يوم مجاناً","لا بطاقة ائتمان"]'),

  -- ② Pro Monthly
  ('pro_monthly', 'Pro — شهري', 'monthly',
   20.00, NULL, NULL, true, false, NULL, 1,
   '["وصول كامل","لا قيود على المشتركين","دعم فني"]'),

  -- ③ Pro Annual (price_annual مثال: 180 = وفِّر 25%)
  ('pro_annual', 'Pro — سنوي', 'annual',
   20.00, 180.00, NULL, true, false, NULL, 2,
   '["وصول كامل","لا قيود على المشتركين","دعم فني","وفِّر مع الدفع السنوي"]'),

  -- ④ Enterprise — Coming Soon
  ('enterprise', 'Enterprise', 'coming_soon',
   NULL, NULL, NULL, false, true,
   'حلول Enterprise للفرق الكبيرة قيد التطوير. ميزات متقدمة وإدارة الفرق وأدوات المؤسسات ستكون متاحة قريباً.',
   3,
   '[]');
```

#### tenants — إضافة حقول Trial

```sql
ALTER TABLE tenants
  ADD COLUMN plan_id       UUID REFERENCES subscription_plans(id),
  ADD COLUMN billing_cycle TEXT  -- "monthly" | "annual" — الدورة الفعلية للمشترك
                           CHECK (billing_cycle IN ('monthly','annual')),
  ADD COLUMN is_trial      BOOLEAN DEFAULT false,
  ADD COLUMN trial_ends_at TIMESTAMPTZ;

-- ملاحظة: subscription_end موجود مسبقاً — تاريخ انتهاء الاشتراك المدفوع بعد انتهاء التجربة
```

#### mash_invoices + mash_payments — فواتير MASH

```sql
CREATE TABLE mash_invoices (
  id            UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  tenant_id     UUID NOT NULL REFERENCES tenants(id),
  plan_id       UUID NOT NULL REFERENCES subscription_plans(id),
  billing_cycle TEXT NOT NULL CHECK (billing_cycle IN ('monthly','annual')),
  amount        NUMERIC(10,2) NOT NULL,
  period_start  DATE NOT NULL,
  period_end    DATE NOT NULL,
  status        TEXT DEFAULT 'pending'
                CHECK (status IN ('pending','paid','overdue','cancelled')),
  paid_at       TIMESTAMPTZ,
  notes         TEXT,
  created_at    TIMESTAMPTZ DEFAULT now()
);

CREATE TABLE mash_payments (
  id             UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id     UUID NOT NULL REFERENCES mash_invoices(id),
  amount         NUMERIC(10,2) NOT NULL,
  payment_method TEXT NOT NULL,
  proof_url      TEXT,
  confirmed_by   UUID REFERENCES users(id),
  confirmed_at   TIMESTAMPTZ,
  created_at     TIMESTAMPTZ DEFAULT now()
);
```

#### create_tenant_with_trial() — RPC (تُطبَّق حرفياً)

```sql
CREATE OR REPLACE FUNCTION create_tenant_with_trial(
  p_company_name TEXT,
  p_admin_name   TEXT
) RETURNS UUID AS $$
DECLARE
  v_tenant_id  UUID;
  v_trial_plan UUID;
  v_trial_days INTEGER;
BEGIN
  -- جلب خطة Trial من DB (لا hard-coded values)
  SELECT id, trial_days INTO v_trial_plan, v_trial_days
  FROM subscription_plans WHERE slug = 'free_trial' AND is_active = true LIMIT 1;

  IF v_trial_plan IS NULL THEN
    RAISE EXCEPTION 'Free Trial plan not found or inactive';
  END IF;

  INSERT INTO tenants (
    name, plan_id, billing_cycle, is_trial,
    trial_ends_at, subscription_end, is_active
  ) VALUES (
    p_company_name, v_trial_plan, NULL, true,
    now() + (v_trial_days || ' days')::INTERVAL,
    now() + (v_trial_days || ' days')::INTERVAL,
    true
  ) RETURNING id INTO v_tenant_id;

  INSERT INTO users (id, tenant_id, role, name)
  VALUES (auth.uid(), v_tenant_id, 'admin', p_admin_name);

  -- فاتورة مجانية للـ Trial
  INSERT INTO mash_invoices (
    tenant_id, plan_id, billing_cycle, amount,
    period_start, period_end, status, paid_at
  ) VALUES (
    v_tenant_id, v_trial_plan, 'monthly', 0,
    CURRENT_DATE, CURRENT_DATE + v_trial_days, 'paid', now()
  );

  RETURN v_tenant_id;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;
```

### §2.5 هيكل المجلدات — طبقة SaaS الكاملة

```text
mash-isp/
├── app/
│   ├── (public)/                    ← صفحات عامة — لا تتطلب login
│   │   ├── layout.tsx               # Header (روابط + "تسجيل دخول") + Footer
│   │   ├── page.tsx                 # Landing Page
│   │   ├── features/page.tsx        # صفحة المميزات التفصيلية
│   │   ├── pricing/page.tsx         # Pro Monthly / Annual / Enterprise Coming Soon
│   │   └── contact/page.tsx         # نموذج التواصل
│   ├── (auth)/
│   │   ├── login/page.tsx
│   │   ├── register/page.tsx        # تسجيل شركة → create_tenant_with_trial()
│   │   └── verify-email/page.tsx
│   ├── (dashboard)/                 # يتطلب: login + (Trial أو Subscription نشطة)
│   │   └── layout.tsx               # TrialBanner + NetworkIndicator + IdleTimeout
│   └── super-admin/
│       ├── tenants/page.tsx
│       ├── invoices/page.tsx        # فواتير MASH
│       └── plans/page.tsx           # ← لوحة تحكم الأسعار الكاملة (§3)
└── components/
    ├── public/
    │   ├── HeroSection.tsx
    │   ├── FeaturesGrid.tsx
    │   ├── PricingCards.tsx         # ← يعرض الأسعار من DB + يحسب التوفير
    │   ├── EnterpriseComingSoon.tsx # ← Coming Soon card
    │   ├── TestimonialsSlider.tsx
    │   └── ContactForm.tsx
    └── trial/
        ├── TrialBanner.tsx          # Banner ديناميكي (info → warning → danger)
        └── UpgradeModal.tsx         # Pro Monthly / Annual choices
```

---

## §3 — معمارية التسعير الديناميكي

يصف هذا القسم آلية التسعير الديناميكي الكاملة: تخزين السعر في DB، تعديله من Super Admin، عرضه في UI مع حساب التوفير، إنشاء الفواتير بالسعر الصحيح، وعرض Enterprise Coming Soon.

### §3.1 مبدأ التصميم الأساسي

**القاعدة الذهبية: لا hard-coded values في الكود.** كل سعر، كل نسبة خصم، كل نص عرض، كل حالة خطة → تأتي من DB.

```ts
// ❌ ممنوع:
const MONTHLY_PRICE = 20
const ANNUAL_PRICE = 180
const DISCOUNT = "25%"

// ✅ الصحيح:
const plans = await supabase.from("subscription_plans").select("*").eq("is_active", true)
const savings = plan.discount_percent  // محسوبة في DB كـ Generated Column
if (plan.is_coming_soon) return <EnterpriseComingSoon message={plan.promotional_message} />
```

### §3.2 حساب التوفير — منطق DB والـ UI

`discount_percent` هي Generated Column تُحسب تلقائياً عند كل INSERT أو UPDATE:

```text
price_monthly = 20, price_annual = 180
discount_percent = ROUND(((20*12 - 180) / (20*12)) * 100, 1) = 25.0

Super Admin يغيّر price_annual إلى 192:
discount_percent = ROUND(((240 - 192) / 240) * 100, 1) = 20.0
→ UI يعرض "وفِّر 20%" تلقائياً بدون أي كود إضافي
```

#### PricingCards.tsx — عرض الأسعار (مرجع التنفيذ)

```tsx
// components/public/PricingCards.tsx
import { createServerClient } from '@/lib/supabase/server'

interface Plan {
  slug: string
  name: string
  billing_cycle: string
  price_monthly: number | null
  price_annual: number | null
  discount_percent: number | null
  trial_days: number | null
  features: string[]
  is_active: boolean
  is_coming_soon: boolean
  promotional_message: string | null
  sort_order: number
}

// Server Component — يجلب الأسعار من DB
export async function PricingCards() {
  const supabase = createServerClient()
  const { data: plans } = await supabase
    .from('subscription_plans')
    .select('*')
    .order('sort_order')

  return (
    <div className="grid grid-cols-1 md:grid-cols-3 gap-6" dir="rtl">
      {plans?.map(plan => {
        // Enterprise Coming Soon — بطاقة خاصة
        if (plan.is_coming_soon) {
          return <EnterpriseComingSoonCard key={plan.slug} message={plan.promotional_message} />
        }
        // Free Trial — بطاقة خاصة
        if (plan.billing_cycle === "trial") {
          return <FreeTrialCard key={plan.slug} days={plan.trial_days} features={plan.features} />
        }
        // Pro Monthly
        if (plan.billing_cycle === "monthly") {
          return (
            <PlanCard key={plan.slug}
              name={plan.name}
              price={`$${plan.price_monthly}/شهر`}
              features={plan.features}
              cta="ابدأ مجاناً"
            />
          )
        }
        // Pro Annual — يعرض التوفير
        if (plan.billing_cycle === "annual") {
          return (
            <PlanCard key={plan.slug}
              name={plan.name}
              price={`$${plan.price_annual}/سنة`}
              badge={plan.discount_percent ? `وفِّر ${plan.discount_percent}%` : undefined}
              features={plan.features}
              cta="ابدأ مجاناً"
              highlighted={true}
            />
          )
        }
      })}
    </div>
  )
}
```

#### EnterpriseComingSoonCard — بطاقة Coming Soon (مرجع التنفيذ)

```tsx
// components/public/EnterpriseComingSoon.tsx
export function EnterpriseComingSoonCard({ message }: { message: string | null }) {
  return (
    <div className="border-2 border-dashed border-gray-300 rounded-xl p-8
                    flex flex-col items-center justify-center text-center
                    bg-gray-50 opacity-75" dir="rtl">
      <span className="text-4xl mb-4">🚀</span>
      <h3 className="text-xl font-bold text-gray-700 mb-2">Enterprise</h3>
      <span className="bg-gray-200 text-gray-600 text-xs font-bold px-3 py-1 rounded-full mb-4">
        قريباً
      </span>
      <p className="text-gray-500 text-sm leading-relaxed">
        {message ?? "حلول Enterprise قيد التطوير. ميزات متقدمة وإدارة الفرق ستكون متاحة قريباً."}
      </p>
      {/* زر غير مفعّل */}
      <button
        disabled
        className="mt-6 w-full py-2 rounded-lg bg-gray-300 text-gray-500 cursor-not-allowed font-medium"
      >
        قريباً
      </button>
    </div>
  )
}
```

### §3.3 UpgradeModal — اختيار Pro Monthly أو Annual (مرجع التنفيذ)

```tsx
// components/trial/UpgradeModal.tsx
import { useEffect, useState } from 'react'

export function UpgradeModal({ open, onClose }: Props) {
  const [plans, setPlans] = useState<Plan[]>([])
  const [selected, setSelected] = useState<string>("pro_annual")

  useEffect(() => {
    if (!open) return
    supabase
      .from('subscription_plans')
      .select('slug,name,billing_cycle,price_monthly,price_annual,discount_percent')
      .in('billing_cycle', ['monthly', 'annual'])
      .eq('is_active', true)
      .then(({ data }) => setPlans(data ?? []))
  }, [open])

  const monthlyPlan = plans.find(p => p.billing_cycle === "monthly")
  const annualPlan  = plans.find(p => p.billing_cycle === "annual")

  return (
    <Dialog open={open} onOpenChange={onClose}> <DialogContent dir="rtl">
      <h2 className="text-xl font-bold mb-4">اختر خطة الاشتراك</h2>

      {/* Pro Monthly */}
      {monthlyPlan && (
        <label className={`block border-2 rounded-xl p-4 cursor-pointer ${ selected === "pro_monthly" ? "border-blue-600" : "border-gray-200" }`}>
          <input type="radio" name="plan" value="pro_monthly"
                 checked={selected==="pro_monthly"} onChange={() => setSelected("pro_monthly")} />
          <div className="mr-3">
            <div className="font-bold">شهري</div>
            <div className="text-2xl font-bold text-blue-700">${monthlyPlan.price_monthly}<span className="text-sm font-normal text-gray-500">/شهر</span></div>
          </div>
        </label>
      )}

      {/* Pro Annual — يعرض التوفير */}
      {annualPlan && (
        <label className={`block border-2 rounded-xl p-4 cursor-pointer relative ${ selected === "pro_annual" ? "border-blue-600" : "border-gray-200" }`}>
          {annualPlan.discount_percent && (
            <span className="absolute -top-3 right-4 bg-green-500 text-white text-xs font-bold px-2 py-0.5 rounded-full">
              وفِّر {annualPlan.discount_percent}%
            </span>
          )}
          <input type="radio" name="plan" value="pro_annual"
                 checked={selected==="pro_annual"} onChange={() => setSelected("pro_annual")} />
          <div className="mr-3">
            <div className="font-bold">سنوي</div>
            <div className="text-2xl font-bold text-blue-700">${annualPlan.price_annual}<span className="text-sm font-normal text-gray-500">/سنة</span></div>
            {annualPlan.discount_percent && (
              <div className="text-xs text-green-600 mt-1">
                تدفع ${annualPlan.price_annual} بدلاً من ${(annualPlan.price_monthly! * 12).toFixed(0)} سنوياً
              </div>
            )}
          </div>
        </label>
      )}

      <Button className="w-full mt-4" onClick={() => handleUpgrade(selected)}>
        اشترك الآن
      </Button>
    </DialogContent> </Dialog>
  )
}
```

### §3.4 Super Admin — لوحة تحكم الأسعار

**هذا هو المكان الوحيد الذي تُعدَّل فيه الأسعار. لا تعديل في الكود.**

```text
app/super-admin/plans/page.tsx — قدرات الصفحة:

① تعديل سعر Pro الشهري
   → UPDATE subscription_plans SET price_monthly = $1 WHERE slug = 'pro_monthly'

② تعديل سعر Pro السنوي
   → UPDATE subscription_plans SET price_annual = $1 WHERE slug = 'pro_annual'
   → discount_percent يُحدَّث تلقائياً (Generated Column)
   → UI يعرض "وفِّر X%" تلقائياً

③ تعديل مدة التجربة المجانية
   → UPDATE subscription_plans SET trial_days = $1 WHERE slug = 'free_trial'
   → create_tenant_with_trial() تقرأها من DB

④ تعديل مميزات الخطة (features JSONB)
   → UPDATE subscription_plans SET features = $1 WHERE slug = 'pro_monthly'

⑤ تعديل رسالة Enterprise Coming Soon
   → UPDATE subscription_plans SET promotional_message = $1 WHERE slug = 'enterprise'

⑥ تفعيل / تعطيل خطة
   → UPDATE subscription_plans SET is_active = $1 WHERE slug = $2

⑦ تفعيل Enterprise مستقبلاً
   → UPDATE subscription_plans
        SET is_coming_soon = false, is_active = true,
            price_monthly = $1, billing_cycle = 'monthly'
        WHERE slug = 'enterprise'
   → لا تغيير في الكود — UI يتكيف تلقائياً
```

### §3.5 Super Admin Capabilities — القائمة الكاملة

| الإجراء | الجدول المُعدَّل | الأثر الفوري في UI | Code Change؟ |
|---|---|---|---|
| تعديل سعر Pro الشهري | `subscription_plans.price_monthly` | صفحة الأسعار + UpgradeModal فوراً | لا |
| تعديل سعر Pro السنوي | `subscription_plans.price_annual` | السعر + نسبة التوفير تلقائياً | لا |
| تعديل مدة التجربة | `subscription_plans.trial_days` | الـ Tenants الجدد يحصلون على المدة الجديدة | لا |
| تغيير مميزات الخطة | `subscription_plans.features` (JSONB) | PricingCards تعرض المميزات الجديدة | لا |
| تعديل رسالة Enterprise | `subscription_plans.promotional_message` | EnterpriseComingSoonCard تعرض النص الجديد | لا |
| تعطيل خطة | `subscription_plans.is_active = false` | الخطة تختفي من UI تلقائياً | لا |
| تفعيل Enterprise مستقبلاً | `is_coming_soon=false, is_active=true, price_monthly=X` | Enterprise تظهر كخطة فعلية | لا |
| تأكيد دفع مشترك | `mash_invoices.status = paid` + `tenants.subscription_end` | Tenant نشط — Middleware يسمح بالدخول | لا |
| إنشاء فاتورة يدوية | `INSERT INTO mash_invoices` | فاتورة جديدة في قائمة الفواتير | لا |

### §3.6 RLS — subscription_plans و mash_invoices

```sql
-- subscription_plans: عامة للقراءة — Super Admin فقط للكتابة
ALTER TABLE subscription_plans ENABLE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans FORCE ROW LEVEL SECURITY;

-- أي مستخدم يستطيع قراءة الخطط النشطة (للـ Pricing Page)
CREATE POLICY "plans_read_active" ON subscription_plans
  FOR SELECT USING (is_active = true OR is_coming_soon = true);

-- Super Admin فقط يكتب
CREATE POLICY "plans_write_superadmin" ON subscription_plans
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );

-- mash_invoices
ALTER TABLE mash_invoices ENABLE ROW LEVEL SECURITY;
ALTER TABLE mash_invoices FORCE ROW LEVEL SECURITY;

-- Admin يرى فواتير شركته فقط
CREATE POLICY "invoices_tenant_read" ON mash_invoices
  FOR SELECT USING (tenant_id = get_tenant_id());

-- Super Admin يرى ويعدِّل الكل
CREATE POLICY "invoices_superadmin_all" ON mash_invoices
  FOR ALL USING (
    EXISTS (SELECT 1 FROM users WHERE id = auth.uid() AND role = 'super_admin')
  );
```

---

## §4 — الأمان وعزل المستأجرين

**الأولوية القصوى: تسرب البيانات بين الشركات = كارثة.** أي ثغرة في عزل البيانات تعني أن شركة تستطيع رؤية بيانات شركة أخرى.

### §4.1 FORCE ROW LEVEL SECURITY — كل الجداول

```sql
-- FORCE ROW LEVEL SECURITY يُطبق الـ policies حتى على database owner
ALTER TABLE customers              FORCE ROW LEVEL SECURITY;
ALTER TABLE subscriptions          FORCE ROW LEVEL SECURITY;
ALTER TABLE internet_credentials   FORCE ROW LEVEL SECURITY;
ALTER TABLE card_products          FORCE ROW LEVEL SECURITY;
ALTER TABLE card_batches           FORCE ROW LEVEL SECURITY;
ALTER TABLE card_distributor_sales FORCE ROW LEVEL SECURITY;
ALTER TABLE payments               FORCE ROW LEVEL SECURITY;
ALTER TABLE pending_tasks          FORCE ROW LEVEL SECURITY;
ALTER TABLE network_routers        FORCE ROW LEVEL SECURITY;
ALTER TABLE network_ports          FORCE ROW LEVEL SECURITY;
ALTER TABLE user_permissions       FORCE ROW LEVEL SECURITY;
ALTER TABLE audit_logs             FORCE ROW LEVEL SECURITY;
-- جداول SaaS
ALTER TABLE tenants                FORCE ROW LEVEL SECURITY;
ALTER TABLE mash_invoices          FORCE ROW LEVEL SECURITY;
ALTER TABLE subscription_plans     FORCE ROW LEVEL SECURITY;
```

### §4.2 Middleware — 6 فحوصات (يشمل Trial + Plan Expiry) — يُطبَّق حرفياً

```ts
// middleware.ts — v3.1
export async function middleware(request: NextRequest) {
  const supabase = createMiddlewareClient(request)
  const { data: { session } } = await supabase.auth.getSession()

  // 1. هل يوجد session؟
  if (!session) return NextResponse.redirect(new URL('/login', request.url))

  const { data: profile } = await supabase.from('users')
    .select('is_active,force_logout_at,role,tenant_id')
    .eq('id', session.user.id).single()

  // 2. هل المستخدم نشط؟
  if (!profile?.is_active) return NextResponse.redirect(new URL('/suspended', request.url))

  // 3. هل صدر force_logout؟
  if (profile.force_logout_at &&
      new Date(profile.force_logout_at) > new Date(session.created_at)) {
    await supabase.auth.signOut()
    return NextResponse.redirect(new URL('/login', request.url))
  }

  // Super Admin: لا فحوصات إضافية
  if (profile.role === 'super_admin') {
    if (!request.nextUrl.pathname.startsWith('/super-admin'))
      return NextResponse.redirect(new URL('/super-admin/tenants', request.url))
    return NextResponse.next()
  }

  const { data: tenant } = await supabase.from('tenants')
    .select('is_active,is_trial,trial_ends_at,subscription_end')
    .eq('id', profile.tenant_id).single()

  // 4. هل الشركة نشطة؟
  if (!tenant?.is_active)
    return NextResponse.redirect(new URL('/subscription-expired', request.url))

  // 5. هل الاشتراك ساري؟ (Trial أو Paid)
  const expiryDate = tenant.is_trial
    ? new Date(tenant.trial_ends_at)
    : new Date(tenant.subscription_end)
  if (expiryDate < new Date())
    return NextResponse.redirect(new URL('/subscription-expired', request.url))

  // 6. حماية super-admin routes
  if (request.nextUrl.pathname.startsWith('/super-admin'))
    return NextResponse.redirect(new URL('/dashboard', request.url))

  return NextResponse.next()
}
```

### §4.3 Realtime Isolation

```ts
// كل channel مُقيَّد بـ tenant_id — لا يستطيع tenant آخر الاستماع
function useRealtimeChannels(tenantId: string) {
  useEffect(() => {
    const macChannel = supabase
      .channel(`mac-changes-${tenantId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "router_mac_history",
        filter: `tenant_id=eq.${tenantId}`
      }, handleMacChange).subscribe()

    const taskChannel = supabase
      .channel(`pending-tasks-${tenantId}`)
      .on("postgres_changes", {
        event: "INSERT", schema: "public", table: "pending_tasks",
        filter: `tenant_id=eq.${tenantId}`
      }, handleNewTask).subscribe()

    return () => {
      supabase.removeChannel(macChannel)
      supabase.removeChannel(taskChannel)
    }
  }, [tenantId])
}
```

---

## §5 — قاعدة البيانات (التصحيحات الكاملة)

### §5.1 has_permission — المُصحَّحة (تُطبَّق حرفياً)

```sql
CREATE OR REPLACE FUNCTION has_permission(p_user_id UUID, p_permission TEXT)
RETURNS BOOLEAN AS $$
  SELECT EXISTS (
    SELECT 1 FROM user_permissions up
    JOIN users u ON u.id = up.user_id
    WHERE up.user_id = p_user_id
      AND up.permission = p_permission
      AND u.is_active = true  -- ← مُضاف: مستخدم معلَّق لا يجتاز
  );
$$ LANGUAGE sql STABLE SECURITY DEFINER;
```

### §5.2 UNIQUE credentials المُصحَّح

```sql
-- خاطئ: UNIQUE(username) يمنع نفس username بين شركات مختلفة
-- صحيح:
ALTER TABLE internet_credentials
  ADD CONSTRAINT uq_credential_per_tenant UNIQUE (tenant_id, username);
```

### §5.3 debts — منع تكرار الديون (Cron)

```sql
ALTER TABLE debts ADD COLUMN related_task_id UUID REFERENCES pending_tasks(id);
ALTER TABLE debts ADD CONSTRAINT uq_task_debt UNIQUE (related_task_id);

SELECT cron.schedule('overdue-to-debt', '0 * * * *', $$
  INSERT INTO debts (tenant_id, customer_id, original_amount, reason, status, related_task_id)
  SELECT p.tenant_id, p.customer_id, p.amount,
    'إشعار دفع معلق > 24 ساعة — دين مؤقت', 'temporary', pt.id
  FROM pending_tasks pt JOIN payments p ON p.id = pt.related_payment_id
  WHERE pt.status IN ('pending','reminded') AND pt.due_at < now()
  AND NOT EXISTS (SELECT 1 FROM debts WHERE related_task_id = pt.id);

  UPDATE pending_tasks SET status = 'converted_to_debt'
  WHERE status IN ('pending','reminded') AND due_at < now();
$$);
```

### §5.4 Trigger عكس المخزون عند حذف الدفعة (يُطبَّق حرفياً)

```sql
CREATE OR REPLACE FUNCTION reverse_stock_on_batch_delete() RETURNS TRIGGER AS $$
BEGIN
  IF NEW.is_deleted = true AND OLD.is_deleted = false THEN
    UPDATE card_products cp
    SET quantity_in_stock = GREATEST(0, quantity_in_stock - cbi.quantity)
    FROM card_batch_items cbi WHERE cbi.batch_id = NEW.id AND cp.id = cbi.product_id;

    INSERT INTO audit_logs (tenant_id, table_name, record_id, action, performed_by)
    VALUES (OLD.tenant_id, 'card_batches', NEW.id, 'BATCH_DELETED_STOCK_REVERSED', auth.uid());
  END IF;
  RETURN NEW;
END;
$$ LANGUAGE plpgsql SECURITY DEFINER;

CREATE TRIGGER trg_reverse_batch_stock
  AFTER UPDATE ON card_batches FOR EACH ROW
  EXECUTE FUNCTION reverse_stock_on_batch_delete();
```

### §5.5 Excel — exceljs بدل SheetJS (مرجع التنفيذ)

```ts
// npm install exceljs
import ExcelJS from 'exceljs'

async function readCredentialsWithColors(file: File) {
  const workbook = new ExcelJS.Workbook()
  await workbook.xlsx.load(await file.arrayBuffer())
  const sheet = workbook.worksheets[0]
  const credentials = []
  sheet.eachRow((row, rowNum) => {
    if (rowNum === 1) return
    const fill = row.getCell(1).fill as ExcelJS.FillPattern
    const bgColor = fill?.fgColor?.argb || ''
    const isRed = bgColor.startsWith('FFE') || bgColor === 'FFFF0000'
    credentials.push({
      username: row.getCell(2).value?.toString() || '',
      password: row.getCell(3).value?.toString() || '',
      is_used: isRed,
    })
  })
  return credentials
}
```

---

## §6 — Offline والمزامنة وتجربة المستخدم

### §6.1 نطاق Offline المُحدَّد بدقة

- ✅ **يعمل Offline:** تجديد الاشتراك + بيع بطاقات + عرض البيانات المُخزَّنة.
- ❌ **يتطلب اتصال:** إدارة الشبكة + تغيير MAC + إدارة المستودع + الاستيراد + رفع إشعارات.
- ⚠️ **بيانات Offline:** آخر بيانات مُزامَنة (قد تكون قديمة ساعات).
- 🔒 **Pricing Page:** تتطلب اتصالاً دائماً — الأسعار لا تُخزَّن Offline.

### §6.2 Conflict Resolution

| السيناريو | القرار |
|---|---|
| تجديد أوفلاين + تجديد نفس الاشتراك أونلاين | Server Wins — الأحدث يطغى |
| بيع بطاقات أوفلاين + المخزون نفد أونلاين | Client Wins + تحذير نقص مخزون |
| نفس الـ nonce مرتين | Reject: 409 Conflict |

**مبدأ v3.1:** Last Write Wins افتراضياً. البساطة أفضل من CRDT لهذا الحجم.

### §6.3 TrialBanner — ثلاثة مستويات (مرجع التنفيذ)

```tsx
// components/trial/TrialBanner.tsx
export function TrialBanner() {
  const { tenant } = useTenant()
  if (!tenant?.is_trial) return null

  const daysLeft = Math.ceil(
    (new Date(tenant.trial_ends_at).getTime() - Date.now()) / 86400000
  )
  if (daysLeft <= 0) return null

  // 3 مستويات بناءً على الأيام المتبقية
  const level = daysLeft <= 3 ? "danger" : daysLeft <= 7 ? "warning" : "info"
  const styles = {
    info:    "bg-blue-50 text-blue-800 border-blue-200",
    warning: "bg-amber-50 text-amber-800 border-amber-200",
    danger:  "bg-red-50 text-red-800 border-red-200 font-semibold",
  }
  const icons = { info: "ℹ️", warning: "⚠️", danger: "🚨" }

  return (
    <div className={`w-full py-2 px-4 text-center text-sm border-b ${styles[level]}`} dir="rtl">
      {icons[level]} فترة التجربة المجانية: {daysLeft} يوم متبق{daysLeft===1?"":"ي"} —
      <button onClick={() => setShowUpgrade(true)} className="underline font-bold mr-1">
        اشترك الآن
      </button>
    </div>
  )
}
```

### §6.4 Onboarding Wizard

| الخطوة | المحتوى |
|---|---|
| ١ — الترحيب | مرحباً بـ [اسم الشركة]! دعنا نُعدَّ النظام في 5 دقائق. |
| ٢ — البيانات الأساسية | شعار الشركة + اللون الرئيسي + رقم الهاتف |
| ٣ — الحسابات البنكية | إضافة حسابات الدفع الإلكتروني |
| ٤ — فئات البطاقات | تأكيد أو تعديل الفئات الافتراضية |
| ٥ — أول مستخدم | إنشاء أول موظف + صلاحياته |
| ٦ — الاستيراد | رابط Excel Viewer (اختياري) |
| ٧ — الانتهاء | Dashboard الحقيقي + رابط الدليل |

### §6.5 Infinite Scroll — بديل VirtualScroll+Pagination (يُطبَّق حرفياً)

```ts
// hooks/useInfiniteVirtualData.ts
import { useInfiniteQuery } from '@tanstack/react-query'

export function useInfiniteVirtualData(tableName: string, searchFields: string[], search: string) {
  const PAGE = 100
  const query = useInfiniteQuery({
    queryKey: [tableName, search],
    queryFn: async ({ pageParam = 0 }) => {
      let q = supabase.from(tableName).select('*', { count: 'exact' })
        .eq('is_deleted', false).range(pageParam*PAGE, (pageParam+1)*PAGE-1)
      if (search) q = q.or(searchFields.map(f => `${f}.ilike.%${search}%`).join(','))
      return q
    },
    getNextPageParam: (last, pages) => {
      return pages.length * PAGE < (last.count ?? 0) ? pages.length : undefined
    },
    initialPageParam: 0,
  })
  const allItems = query.data?.pages.flatMap(p => p.data ?? []) ?? []
  return { ...query, allItems }
}
```

---

## §7 — البرومبتات

> **انتقلت البرومبتات إلى ملف مستقل:** `MASH_ISP_Prompts_v3_2.md` — مقسمة ومعاد صياغتها لـ Cursor Pro (Agent Mode) مع نطاق حصري ومعايير قبول لكل برومبت. لا تستخدم برومبتات القسم السابع من الوثيقة الأصلية DOCX.

---

## §8 — قائمة الفحص الشامل قبل الإطلاق

### §8.1 الأمان

| # | البند | كيف تختبر |
|---|---|---|
| S1 | FORCE RLS: Tenant A لا يرى بيانات Tenant B | JWT لـ Tenant A + SELECT من جدول Tenant B → يجب 0 نتائج |
| S2 | has_permission تفحص is_active | علِّق مستخدم → POST API → يجب 403 |
| S3 | subscription_plans: Tenant لا يعدِّل الأسعار | PATCH /subscription_plans بـ tenant JWT → يجب 403 |
| S4 | Super Admin فقط يعدِّل الخطط | PATCH بـ super_admin JWT → يجب 200 |
| S5 | Soft Delete: لا حذف فعلي | SELECT WHERE is_deleted=true → يجد السجل |
| S6 | audit_logs يسجل كل حذف | حذف → audit_logs يحتوي القيم القديمة |
| S7 | force_logout_at يعمل فوراً | علِّق مستخدم → reload → خروج تلقائي |
| S8 | Trial expiry → redirect | trial_ends_at = now()-1h → reload → /subscription-expired |
| S9 | Realtime isolation | Tenant A يستمع → Tenant B يُحدِّث MAC → Tenant A لا يستقبل |

### §8.2 التسعير — Zero Tolerance

| # | الاختبار | المعيار |
|---|---|---|
| PR1 | discount_percent يُحسب صحيحاً | price_monthly=20, annual=180 → discount_percent=25.0 |
| PR2 | تعديل السعر من Super Admin يظهر فوراً | UPDATE price_annual → reload pricing page → سعر جديد + discount جديد |
| PR3 | لا hard-coded prices في الكود | بحث عن أسعار ثابتة في `*.tsx` → لا نتائج |
| PR4 | Enterprise = Coming Soon | is_coming_soon=true → EnterpriseComingSoonCard بدون زر تفعيل |
| PR5 | تفعيل Enterprise لا يحتاج code change | UPDATE is_coming_soon=false, is_active=true → PlanCard تظهر تلقائياً |
| PR6 | Trial يقرأ trial_days من DB | UPDATE trial_days=14 → register جديد → trial_ends_at = now+14d |
| PR7 | UpgradeModal يعرض كلا الخطتين | TrialBanner → "اشترك الآن" → Pro Monthly + Pro Annual من DB |
| PR8 | مشترك monthly لا يحصل على annual price | billing_cycle في mash_invoices يطابق الخطة المختارة |

### §8.3 العمليات

| # | العملية | المعيار |
|---|---|---|
| O1 | تجديد اشتراك → RPC ذري | كل واحد أو لا شيء |
| O2 | استلام دفعة → Trigger يزيد المخزون | quantity_in_stock يتغير فوراً |
| O3 | حذف دفعة → Trigger يُعيد المخزون | لا رصيد سالب |
| O4 | Cron 1h → دين مؤقت بلا تكرار | UNIQUE related_task_id |
| O5 | تغيير MAC → Realtime للـ tenant فقط | isolation صحيح |
| O6 | Toggle صلاحية → فوري بلا re-login | Zustand يُحدَّث |
| O7 | استيراد Excel أحمر → is_used=true | exceljs يقرأ الألوان |

### §8.4 الأداء

| # | الاختبار | المعيار | الأداة |
|---|---|---|---|
| P1 | Infinite Scroll: 100 إضافي عند التمرير | < 300ms | Network Tab |
| P2 | بحث 447 مشترك بـ Debounce 300ms | < 500ms | React Query Devtools |
| P3 | KPIs Dashboard بـ Promise.all | < 1 ثانية | Lighthouse |
| P4 | Pricing Page: جلب الخطط من DB | < 200ms | Network Tab |
| P5 | Landing Page First Paint | < 1.5 ثانية | Lighthouse |

---

## §9 — خارطة الطريق والتقييم النهائي

**الحكم النهائي: جاهز للتنفيذ بعد اعتماد v3.1.** المشروع SaaS حقيقي: مسار تسجيل كامل + Pricing ديناميكي + Enterprise Coming Soon.

### §9.1 الترتيب الموصى به

1. ضع هذا الملف في `docs/BLUEPRINT.md` داخل المشروع + ملف القواعد في `.cursor/rules/`.
2. P0 → P1 (DB أولاً دائماً) → اختبر `supabase db push`.
3. P2 → P3 → اختبر Register + Pricing Page يعملان.
4. P4 → P5 → P6 → اختبر كل وحدة.
5. P7 → اختبر super-admin/plans يعرض الأسعار ويعدِّلها.
6. P8 → اختبر الأمان + pricing tests → Deploy.
7. إطلاق فيوتشر واي → أول إيراد.

### §9.2 خارطة الطريق

| المرحلة | ما تنجزه | المدة | معيار النجاح |
|---|---|---|---|
| P0 — Setup | هيكل + مكتبات + .env | نصف يوم | `npm run dev` بدون أخطاء |
| P1 — DB | Schema + RLS + Triggers + Cron + Seed | يوم كامل | `supabase db push` ✅ |
| P2 — Auth | Login + Register + Middleware + Offline DB | يوم كامل | تسجيل شركة جديدة يعمل |
| P3 — Public + Pricing | Landing + Pricing ديناميكي + Enterprise Coming Soon | يوم كامل | الأسعار من DB + discount صحيح |
| P4 — Excel | Import Engine + exceljs | يوم كامل | استيراد فيوتشر واي ✅ |
| P5 — Core ISP | اشتراكات + كريدنشال + بطاقات | يومان | تجديد اشتراك كامل |
| P6 — Operations | مدفوعات + شبكة + مستودع | يومان | MAC change + Realtime ✅ |
| P7 — Dashboard + Admin | KPIs + super-admin/plans لوحة الأسعار | يوم ونصف | تعديل سعر → يظهر فوراً |
| P8 — Tests + Deploy | pricing.test + security.test + Vercel | يوم كامل | فيوتشر واي على Production |
| Launch | إطلاق + أول شركة مدفوعة | أسبوع تسويق | أول إيراد SaaS |

### §9.3 توصيات ما بعد الإطلاق

| التوصية | التوقيت |
|---|---|
| Email تذكيرات: انتهاء Trial + انتهاء الاشتراك (Resend) | الشهر الأول |
| Analytics: عدد تسجيلات، trial-to-paid conversion rate | الشهر الأول |
| تقارير PDF: فاتورة مشتركين شهرية قابلة للطباعة | الشهر الثاني |
| دعم فني: Tickets بسيطة (Notion أو Linear) | الشهر الثاني |
| PWA: تحويل المشروع لـ Progressive Web App | الربع الثاني |
| تفعيل Enterprise بعد جمع متطلبات العملاء الكبار | الربع الثالث |

---

**MASH ISP Blueprint v3.1 — جاهز للتنفيذ**
Next.js 14 · TypeScript · Supabase RLS (FORCE) · Dynamic RBAC · Soft Delete
Free Trial + Pro (Monthly/Annual) + Enterprise Coming Soon
Dynamic Pricing — DB Controlled — No Hard-coded Values
