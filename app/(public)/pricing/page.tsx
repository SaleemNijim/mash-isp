// app/(public)/pricing/page.tsx — Server Component

import type { Metadata } from 'next'
import Link from 'next/link'
import { PricingCards } from '@/components/public/PricingCards'
import { CheckCircle2, XCircle, ChevronDown } from 'lucide-react'
import type { Plan } from '@/components/public/PricingCards'
import { getSubscriptionPlans } from '@/lib/public/plans'

export const metadata: Metadata = {
  title: 'الأسعار',
  description:
    'خطط MASH ISP — تجربة مجانية كاملة، Pro شهري أو سنوي، وEnterprise قريباً. كل الأسعار شفافة ومرنة.',
}

function planFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((f): f is string => typeof f === 'string')
}

function ComparisonTable({ plans }: { plans: Plan[] }) {
  const activePlans = plans.filter((p) => !p.is_coming_soon)
  const allFeatures = [...new Set(activePlans.flatMap((p) => planFeatures(p.features)))]

  if (!allFeatures.length) return null

  return (
    <section className="py-16 bg-mash-page border-t border-mash-border" dir="rtl">
      <div className="max-w-5xl mx-auto px-8">
        <div className="text-center mb-10">
          <span className="text-xs font-medium text-primary-600 block mb-2">المقارنة</span>
          <h2 className="text-2xl sm:text-3xl font-medium text-mash-text">
            مقارنة مميزات الخطط
          </h2>
        </div>

        <div className="overflow-x-auto rounded-xl border border-mash-border bg-mash-surface">
          <table className="w-full text-sm text-right mash-data-table">
            <thead>
              <tr className="border-b border-mash-border">
                <th className="px-5 py-4 font-medium text-mash-text-secondary w-2/5">الميزة</th>
                {activePlans.map((p) => (
                  <th key={p.slug} className="px-4 py-4 font-medium text-center text-mash-text">
                    {p.name}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody>
              {allFeatures.map((feature) => (
                <tr key={feature}>
                  <td className="px-5 py-3.5 text-mash-text font-medium">{feature}</td>
                  {activePlans.map((p) => {
                    const has = planFeatures(p.features).includes(feature)
                    return (
                      <td key={p.slug} className="px-4 py-3.5 text-center">
                        {has ? (
                          <CheckCircle2 size={18} className="inline-block text-primary-600" />
                        ) : (
                          <XCircle size={18} className="inline-block text-mash-border" />
                        )}
                      </td>
                    )
                  })}
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>
    </section>
  )
}

function FaqItem({ q, a }: { q: string; a: string }) {
  return (
    <details className="group border border-mash-border rounded-xl overflow-hidden bg-mash-surface">
      <summary className="flex items-center justify-between gap-4 px-6 py-5 cursor-pointer font-medium text-mash-text hover:bg-mash-page transition-colors list-none min-h-11">
        {q}
        <ChevronDown
          size={18}
          className="shrink-0 text-mash-text-muted transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="px-6 py-4 text-mash-text-secondary text-sm leading-relaxed border-t border-mash-border bg-mash-page">
        {a}
      </div>
    </details>
  )
}

export default async function PricingPage() {
  const result = await getSubscriptionPlans()
  const plans = result.ok ? result.plans : []
  const trialPlan = plans.find((p) => p.billing_cycle === 'trial')

  const trialDaysLabel =
    trialPlan?.trial_days != null ? ` لمدة ${trialPlan.trial_days} يوماً` : ''

  return (
    <div dir="rtl">
      <section className="bg-mash-page py-20 text-center px-8 border-b border-mash-border">
        <span className="text-xs font-medium text-primary-600 block mb-3">الأسعار</span>
        <h1 className="text-3xl sm:text-4xl font-medium text-mash-text mb-4">
          خطط مرنة لكل حجم شركة
        </h1>
        <p className="text-base text-mash-text-secondary max-w-xl mx-auto">
          ابدأ بتجربة مجانية كاملة — لا بطاقة ائتمان مطلوبة — ثم اختر الخطة التي تناسبك.
        </p>
      </section>

      <section className="py-16 bg-mash-surface">
        <div className="max-w-6xl mx-auto px-8">
          <PricingCards />
        </div>
      </section>

      {plans.length > 0 && <ComparisonTable plans={plans} />}

      <section className="py-16 bg-mash-surface border-t border-mash-border">
        <div className="max-w-3xl mx-auto px-8">
          <div className="text-center mb-10">
            <span className="text-xs font-medium text-primary-600 block mb-2">
              الأسئلة الشائعة
            </span>
            <h2 className="text-2xl sm:text-3xl font-medium text-mash-text">
              أسئلة يسألها الجميع
            </h2>
          </div>

          <div className="space-y-3">
            <FaqItem
              q="هل يوجد تجربة مجانية؟"
              a={`نعم! عند التسجيل تحصل على تجربة مجانية${trialDaysLabel} مع وصول كامل لكل مميزات Pro — لا بطاقة ائتمان مطلوبة.`}
            />
            <FaqItem
              q="كيف يتم الدفع؟"
              a="بعد انتهاء فترة التجربة المجانية، تختار الخطة المناسبة (شهري أو سنوي) وترسل إشعار الدفع. يراجع فريق MASH الدفع ويؤكده، ثم يُفعَّل اشتراكك فوراً."
            />
            <FaqItem
              q="متى يُفعَّل Enterprise؟"
              a="خطة Enterprise قيد التطوير حالياً وستُطلق قريباً. تواصل معنا عبر صفحة التواصل لإدراج شركتك في قائمة الانتظار."
            />
          </div>
        </div>
      </section>

      <section className="bg-mash-page py-16 text-center px-8 border-t border-mash-border">
        <h2 className="text-2xl sm:text-3xl font-medium text-mash-text mb-4">
          جاهز لتجربة MASH ISP؟
        </h2>
        <p className="text-mash-text-secondary mb-8 max-w-lg mx-auto">
          سجّل شركتك الآن واستمتع بتجربة مجانية كاملة — بدون أي التزام.
        </p>
        <Link href="/register" className="mash-btn-primary">
          ابدأ مجاناً
        </Link>
      </section>
    </div>
  )
}
