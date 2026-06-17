import Link from 'next/link'
import {
  Wifi,
  CreditCard,
  Network,
  Package,
  BarChart3,
  Shield,
  type LucideIcon,
} from 'lucide-react'

const FEATURES: { icon: LucideIcon; title: string; description: string }[] = [
  {
    icon: Wifi,
    title: 'إدارة الاشتراكات',
    description:
      'تجديد، تعليق، وإلغاء اشتراكات المشتركين بضغطة واحدة. تتبُّع تواريخ الانتهاء وإرسال تذكيرات تلقائية.',
  },
  {
    icon: CreditCard,
    title: 'بطاقات الإنترنت',
    description:
      'إنشاء دفعات بطاقات، توزيعها على الموزعين، وتتبع المبيعات. دعم استيراد Excel مع قراءة ألوان الخلايا.',
  },
  {
    icon: Network,
    title: 'مراقبة الشبكة',
    description:
      'إدارة الراوترات والمنافذ، تتبع عناوين MAC، واستلام إشعارات فورية عند تغيير أي جهاز في الشبكة.',
  },
  {
    icon: Package,
    title: 'المستودع',
    description:
      'تتبع المخزون تلقائياً عند كل دفعة بطاقات واردة أو صادرة. تحذيرات عند انخفاض الرصيد.',
  },
  {
    icon: BarChart3,
    title: 'التقارير والإحصاءات',
    description:
      'لوحة تحكم بمؤشرات الأداء الرئيسية: الإيرادات، المشتركون النشطون، المدفوعات المعلقة، ومبيعات البطاقات.',
  },
  {
    icon: Shield,
    title: 'إدارة الصلاحيات',
    description:
      'تحكم دقيق في صلاحيات كل موظف. نظام RBAC ديناميكي يُعدَّل فوراً دون الحاجة لإعادة تسجيل الدخول.',
  },
]

export function FeaturesGrid() {
  return (
    <section className="bg-mash-surface py-20 lg:py-24 border-t border-mash-border">
      <div className="max-w-6xl mx-auto px-8">
        <div className="text-center mb-12">
          <span className="text-xs font-medium text-primary-600 tracking-wide mb-2 block">
            المميزات
          </span>
          <h2 className="text-2xl sm:text-3xl font-medium text-mash-text">
            كل ما تحتاجه لإدارة شركتك
          </h2>
          <p className="mt-3 text-base text-mash-text-secondary max-w-xl mx-auto">
            منظومة متكاملة مصممة خصيصاً لشركات الإنترنت العربية
          </p>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {FEATURES.map(({ icon: Icon, title, description }) => (
            <div
              key={title}
              className="rounded-xl border border-mash-border bg-mash-surface p-5 hover:border-primary-100 transition-colors"
            >
              <div className="w-10 h-10 rounded-lg bg-primary-50 flex items-center justify-center mb-4">
                <Icon className="w-5 h-5 text-primary-600" strokeWidth={1.5} />
              </div>
              <h3 className="text-[15px] font-medium text-mash-text mb-1.5">{title}</h3>
              <p className="text-[13px] text-mash-text-muted leading-relaxed">{description}</p>
            </div>
          ))}
        </div>

        <div className="text-center mt-10">
          <Link href="/register" className="mash-btn-primary">
            ابدأ مجاناً
          </Link>
        </div>
      </div>
    </section>
  )
}
