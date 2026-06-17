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
    <div className="bg-mash-page">
      <section className="bg-mash-page py-16 lg:py-24 border-b border-mash-border">
        <div className="max-w-6xl mx-auto px-8 text-center">
          <h1 className="text-3xl sm:text-4xl font-medium text-mash-text mb-4">
            مميزات MASH ISP بالتفصيل
          </h1>
          <p className="text-base text-mash-text-secondary max-w-2xl mx-auto leading-relaxed">
            كل وظيفة مصممة لحل مشكلة حقيقية يواجهها مشغلو شبكات الإنترنت يومياً.
          </p>
          <div className="mt-8">
            <Link href="/register" className="mash-btn-primary">
              ابدأ مجاناً
            </Link>
          </div>
        </div>
      </section>

      <section className="max-w-6xl mx-auto px-8 py-16 lg:py-20">
        <div className="space-y-12">
          {FEATURE_DETAILS.map((feature, idx) => {
            const Icon = feature.icon
            return (
              <div
                key={feature.title}
                className={`flex flex-col lg:flex-row items-start gap-8 ${
                  idx % 2 === 1 ? 'lg:flex-row-reverse' : ''
                }`}
              >
                <div className="lg:w-1/3 shrink-0">
                  <div className="flex items-center gap-4 mb-4">
                    <div className="w-12 h-12 rounded-lg bg-primary-50 flex items-center justify-center shrink-0">
                      <Icon className="w-6 h-6 text-primary-600" strokeWidth={1.5} />
                    </div>
                    <h2 className="text-xl font-medium text-mash-text">{feature.title}</h2>
                  </div>
                  <Link
                    href="/register"
                    className="inline-flex items-center text-sm font-medium text-primary-600 hover:underline underline-offset-2 min-h-11"
                  >
                    ابدأ مجاناً ←
                  </Link>
                </div>

                <div className="flex-1 grid grid-cols-1 sm:grid-cols-2 gap-3">
                  {feature.benefits.map((b) => (
                    <div
                      key={b}
                      className="flex items-start gap-3 bg-mash-surface rounded-xl px-4 py-3 border border-mash-border"
                    >
                      <Check className="w-4 h-4 text-primary-600 mt-0.5 shrink-0" strokeWidth={2} />
                      <span className="text-sm text-mash-text-secondary leading-relaxed">{b}</span>
                    </div>
                  ))}
                </div>
              </div>
            )
          })}
        </div>
      </section>

      <section className="bg-mash-surface py-16 border-t border-mash-border">
        <div className="max-w-3xl mx-auto px-8 text-center">
          <h2 className="text-2xl sm:text-3xl font-medium text-mash-text mb-4">
            مقتنع؟ ابدأ تجربتك المجانية الآن
          </h2>
          <p className="text-mash-text-secondary mb-8">
            وصول كامل لجميع المميزات خلال فترة التجربة. لا بطاقة ائتمان مطلوبة.
          </p>
          <Link href="/register" className="mash-btn-primary text-base px-10">
            ابدأ مجاناً
          </Link>
        </div>
      </section>
    </div>
  )
}
