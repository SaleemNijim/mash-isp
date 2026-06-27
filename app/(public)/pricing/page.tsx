// app/(public)/pricing/page.tsx — Server Component

import type { Metadata } from 'next'
import Link from 'next/link'
import { PricingCards } from '@/components/public/PricingCards'
import { PublicPageHero } from '@/components/shared/PublicPageHero'
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
    <section className="landing-section border-t border-[#D1E8E2] bg-[#F8FFFE]" dir="rtl">
      <div className="landing-container">
        <div className="mb-10 text-center">
          <span className="mb-2 block text-sm font-bold text-[#0F6E56]">المقارنة</span>
          <h2 className="text-2xl font-bold text-[#0D1F1A] sm:text-3xl">مقارنة مميزات الخطط</h2>
        </div>

        <div className="overflow-x-auto rounded-2xl border border-[#D1E8E2] bg-white shadow-[0_2px_12px_rgba(15,110,86,0.06)]">
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
    <details className="group overflow-hidden rounded-2xl border border-[#D1E8E2] bg-white">
      <summary className="flex min-h-11 cursor-pointer list-none items-center justify-between gap-4 px-6 py-5 font-bold text-[#0D1F1A] transition-colors hover:bg-[#F8FFFE]">
        {q}
        <ChevronDown
          size={18}
          className="shrink-0 text-[#4A6B60] transition-transform group-open:rotate-180"
        />
      </summary>
      <div className="border-t border-[#D1E8E2] bg-[#F8FFFE] px-6 py-4 text-sm leading-relaxed text-[#4A6B60]">
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
    <div dir="rtl" className="bg-white">
      <PublicPageHero
        eyebrow="الأسعار"
        title="خطط مرنة لكل حجم شركة"
        description="ابدأ بتجربة مجانية كاملة — لا بطاقة ائتمان مطلوبة — ثم اختر الخطة التي تناسبك."
      />

      <section className="landing-section pt-12">
        <div className="landing-container">
          <PricingCards />
        </div>
      </section>

      {plans.length > 0 && <ComparisonTable plans={plans} />}

      <section className="landing-section bg-[#F8FFFE] border-t border-[#D1E8E2]">
        <div className="landing-container max-w-3xl">
          <div className="mb-10 text-center">
            <span className="mb-2 block text-sm font-bold text-[#0F6E56]">الأسئلة الشائعة</span>
            <h2 className="text-2xl font-bold text-[#0D1F1A] sm:text-3xl">أسئلة يسألها الجميع</h2>
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

      <section className="border-t border-[#D1E8E2] bg-white py-16 text-center px-8">
        <h2 className="mb-4 text-2xl font-bold text-[#0D1F1A] sm:text-3xl">جاهز لتجربة MASH ISP؟</h2>
        <p className="mx-auto mb-8 max-w-lg text-[#4A6B60]">
          سجّل شركتك الآن واستمتع بتجربة مجانية كاملة — بدون أي التزام.
        </p>
        <Link href="/register" className="landing-btn-primary">
          ابدأ مجاناً
        </Link>
      </section>
    </div>
  )
}
