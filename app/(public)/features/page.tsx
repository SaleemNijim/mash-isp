import type { Metadata } from 'next'
import Link from 'next/link'
import {
  Wifi,
  CreditCard,
  Network,
  Package,
  BarChart3,
  Shield,
  Landmark,
  Building2,
  Check,
  type LucideIcon,
} from 'lucide-react'
import { PublicPageHero } from '@/components/shared/PublicPageHero'

export const metadata: Metadata = {
  title: 'المميزات',
  description:
    'قائمة تفصيلية بكل مميزات MASH ISP — إدارة اشتراكات، بطاقات، شبكة، مدفوعات، وصلاحيات.',
}

const FEATURE_DETAILS: {
  icon: LucideIcon
  title: string
  benefits: string[]
}[] = [
  {
    icon: Wifi,
    title: 'إدارة الاشتراكات',
    benefits: [
      'تجديد الاشتراك بضغطة واحدة مع تحديث فوري للتاريخ',
      'تعليق وإلغاء الاشتراكات مع حفظ السجل التاريخي',
      'تذكيرات تلقائية قبل انتهاء الاشتراك',
      'عرض المشتركين المتأخرين بالدفع في قائمة المهام المعلقة',
      'ربط كل اشترك ببيانات كريدنشال الإنترنت (username/password)',
      'نظام ديون مؤقتة تلقائي عند التأخر أكثر من 24 ساعة',
    ],
  },
  {
    icon: CreditCard,
    title: 'بطاقات الإنترنت',
    benefits: [
      'إنشاء دفعات بطاقات بفئات وأسعار مختلفة',
      'استيراد بطاقات من Excel مع دعم قراءة الألوان (exceljs)',
      'توزيع البطاقات على الموزعين وتتبع المبيعات',
      'تتبع تلقائي لحالة كل بطاقة: متوفرة، مُباعة، مُستخدمة',
      'تقارير مبيعات البطاقات حسب الفئة والموزع',
      'إعادة حساب المخزون تلقائياً عند حذف أي دفعة',
    ],
  },
  {
    icon: Network,
    title: 'مراقبة الشبكة',
    benefits: [
      'إدارة الراوترات والمنافذ بواجهة بسيطة',
      'تتبع عناوين MAC لكل مشترك',
      'إشعارات فورية (Realtime) عند تغيير أي جهاز في الشبكة',
      'عزل تام للإشعارات — كل شركة ترى شبكتها فقط',
      'سجل تاريخي لتغييرات MAC مع الوقت والمسؤول',
      'دعم عمليات مراقبة الشبكة أون-لاين فقط للدقة الكاملة',
    ],
  },
  {
    icon: Package,
    title: 'إدارة المستودع',
    benefits: [
      'تتبع رصيد كل نوع بطاقة في الوقت الفعلي',
      'زيادة المخزون تلقائياً عند استلام دفعة جديدة',
      'خصم المخزون تلقائياً عند بيع البطاقات',
      'عكس التغييرات كاملاً عند حذف أو إلغاء دفعة',
      'تحذيرات عند انخفاض الرصيد عن الحد الأدنى',
      'تقارير حركة المستودع اليومية والشهرية',
    ],
  },
  {
    icon: BarChart3,
    title: 'التقارير والإحصاءات',
    benefits: [
      'لوحة تحكم بمؤشرات الأداء الرئيسية (KPIs) لحظياً',
      'إجمالي الإيرادات والمدفوعات خلال الفترة المختارة',
      'عدد المشتركين النشطين، المعلقين، والجدد',
      'تقارير مبيعات البطاقات حسب الفترة الزمنية',
      'قائمة المهام المعلقة والديون المؤقتة',
      'سجل تدقيق كامل لكل عملية حذف أو تعديل',
    ],
  },
  {
    icon: Shield,
    title: 'إدارة الصلاحيات',
    benefits: [
      'نظام RBAC ديناميكي: Admin, Supervisor, Collector, Viewer',
      'تخصيص صلاحيات دقيقة لكل موظف بشكل مستقل',
      'تفعيل وتعطيل الصلاحيات فوراً دون إعادة تسجيل دخول',
      'تعليق حسابات الموظفين مع منعهم فوراً من الدخول',
      'force_logout لأي مستخدم عن بُعد عند الحاجة',
      'جميع الصلاحيات مفروضة على مستوى قاعدة البيانات (RLS)',
    ],
  },
  {
    icon: Landmark,
    title: 'المدفوعات والديون',
    benefits: [
      'تسجيل المدفوعات النقدية والإلكترونية',
      'ربط كل دفعة بحساب بنكي محدد',
      'نظام ديون تلقائي: pending → debt → cancelled عند الدفع',
      'إشعارات دفع معلقة مع مؤقت 24 ساعة',
      'تقارير مالية شهرية مفصّلة',
      'دعم متعدد الحسابات البنكية وطرق الدفع',
    ],
  },
  {
    icon: Building2,
    title: 'عزل البيانات (Multi-Tenant)',
    benefits: [
      'كل شركة في بيئة معزولة تماماً — لا تسرب بيانات',
      'FORCE ROW LEVEL SECURITY على جميع الجداول',
      'بيانات شركتك لا تُرى من أي شركة أخرى حتى للمطوّرين',
      'دعم عدد غير محدود من الشركات على نفس الخادم',
      'إنشاء شركة جديدة في ثوانٍ مع تجربة مجانية تلقائية',
      'Middleware يفحص صلاحية الاشتراك في كل طلب',
    ],
  },
]

export default function FeaturesPage() {
  return (
    <div className="bg-white">
      <PublicPageHero
        eyebrow="المميزات"
        title="مميزات MASH ISP بالتفصيل"
        description="كل وظيفة مصممة لحل مشكلة حقيقية يواجهها مشغّلو شبكات الإنترنت يومياً."
      />

      <section className="landing-container pb-8 pt-4">
        <div className="text-center">
          <Link href="/register" className="landing-btn-primary">
            ابدأ مجاناً
          </Link>
        </div>
      </section>

      <section className="landing-container pb-20">
        <div className="space-y-12">
          {FEATURE_DETAILS.map((feature, idx) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className={`flex flex-col items-start gap-8 lg:flex-row ${
                  idx % 2 === 1 ? 'lg:flex-row-reverse' : ''
                }`}
              >
                <div className="lg:w-1/3 shrink-0">
                  <div className="mb-4 flex items-center gap-4">
                    <div className="flex size-12 shrink-0 items-center justify-center rounded-xl bg-[#E8F5F1]">
                      <Icon className="size-6 text-[#0F6E56]" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-xl font-bold text-[#0D1F1A]">{feature.title}</h2>
                  </div>
                  <Link
                    href="/register"
                    className="inline-flex min-h-11 items-center text-sm font-bold text-[#0F6E56] hover:underline underline-offset-2"
                  >
                    ابدأ مجاناً ←
                  </Link>
                </div>

                <div className="grid flex-1 grid-cols-1 gap-3 sm:grid-cols-2">
                  {feature.benefits.map((b) => (
                    <div
                      key={b}
                      className="landing-card !p-4 flex items-start gap-3 !shadow-none hover:!shadow-[0_4px_20px_rgba(15,110,86,0.08)]"
                    >
                      <Check className="mt-0.5 size-4 shrink-0 text-[#0F6E56]" strokeWidth={2} />
                      <span className="text-sm leading-relaxed text-[#4A6B60]">{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="border-t border-[#D1E8E2] bg-[#F8FFFE] py-16">
        <div className="landing-container max-w-3xl text-center">
          <h2 className="mb-4 text-2xl font-bold text-[#0D1F1A] sm:text-3xl">
            مقتنع؟ ابدأ تجربتك المجانية الآن
          </h2>
          <p className="mb-8 text-[#4A6B60]">
            وصول كامل لجميع المميزات خلال فترة التجربة. لا بطاقة ائتمان مطلوبة.
          </p>
          <Link href="/register" className="landing-btn-primary px-10 text-base">
            ابدأ مجاناً
          </Link>
        </div>
      </section>
    </div>
  )
}
