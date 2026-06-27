'use client'

import {
  Users,
  Router,
  Receipt,
  Building2,
  Bell,
  BarChart3,
  type LucideIcon,
} from 'lucide-react'
import { FadeIn } from './FadeIn'

const FEATURES: {
  icon: LucideIcon
  title: string
  description: string
}[] = [
  {
    icon: Users,
    title: 'إدارة المشتركين',
    description:
      'تتبع اشتراكات عملائك، سجل المدفوعات، وأدر بياناتهم بسهولة تامة',
  },
  {
    icon: Router,
    title: 'إدارة الشبكة والأجهزة',
    description:
      'تحكم في الراوترات، OLT، وأجهزة الشبكة من لوحة تحكم موحدة مع تتبع MAC',
  },
  {
    icon: Receipt,
    title: 'الفوترة والمدفوعات',
    description: 'نظام فوترة تلقائي مع إشعارات الدفع، وتقارير مالية مفصلة',
  },
  {
    icon: Building2,
    title: 'تعدد المستأجرين (Multi-Tenant)',
    description: 'إدارة أكثر من شركة ISP من حساب واحد مع فصل تام للبيانات',
  },
  {
    icon: Bell,
    title: 'الإشعارات الفورية',
    description: 'تنبيهات لحظية عند تغيير MAC، انقطاع الخدمة، أو تجديد الاشتراك',
  },
  {
    icon: BarChart3,
    title: 'تقارير وإحصائيات',
    description: 'لوحة تحليلات متقدمة لمراقبة نمو الشبكة وإيراداتك الشهرية',
  },
]

export function FeaturesSection() {
  return (
    <section id="features" className="landing-section bg-white" dir="rtl">
      <div className="landing-container">
        <FadeIn className="mb-14 text-center">
          <span className="mb-3 inline-block text-sm font-bold text-[#0F6E56]">المميزات</span>
          <h2 className="mb-4 text-3xl font-bold text-[#0D1F1A] sm:text-[2rem]">
            كل ما تحتاجه في مكان واحد
          </h2>
          <p className="mx-auto max-w-2xl text-base leading-[1.7] text-[#4A6B60]">
            أدوات متخصصة لقطاع الإنترنت — من إدارة المشتركين إلى مراقبة الشبكة في الوقت الفعلي
          </p>
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 lg:grid-cols-3">
          {FEATURES.map((feature, i) => {
            const Icon = feature.icon
            return (
              <FadeIn key={feature.title} delay={i * 0.06}>
                <article className="landing-card group h-full border-r-4 border-r-[#0F6E56]">
                  <div className="mb-5 flex size-12 items-center justify-center rounded-xl bg-[#E8F5F1] text-[#0F6E56] transition-colors group-hover:bg-[#0F6E56] group-hover:text-white">
                    <Icon className="size-6" strokeWidth={1.75} />
                  </div>
                  <h3 className="mb-3 text-xl font-bold text-[#0D1F1A]">{feature.title}</h3>
                  <p className="text-base leading-[1.7] text-[#4A6B60]">{feature.description}</p>
                </article>
              </FadeIn>
            )
          })}
        </div>
      </div>
    </section>
  )
}
