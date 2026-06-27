'use client'

import { useState } from 'react'
import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { cn } from '@/lib/utils'
import { formatTrialPeriodShort, planFeatures } from '@/lib/public/format-trial'
import type { Plan } from '@/components/public/PricingCards'
import { FadeIn } from './FadeIn'

const FALLBACK_TRIAL_FEATURES = [
  'وصول كامل لكل المميزات',
  'مشتركون غير محدودون',
  'لا بطاقة ائتمان',
]

const FALLBACK_PRO_FEATURES = [
  'مشتركون غير محدودون',
  'جميع الأجهزة',
  'تقارير متقدمة',
  'دعم أولوي',
]

function FeatureList({ items }: { items: string[] }) {
  if (!items.length) return null
  return (
    <ul className="space-y-3">
      {items.map((item) => (
        <li key={item} className="flex items-start gap-2.5 text-sm leading-relaxed text-[#4A6B60]">
          <CheckCircle2 className="mt-0.5 size-4 shrink-0 text-[#0F6E56]" />
          <span>{item}</span>
        </li>
      ))}
    </ul>
  )
}

interface PricingSectionProps {
  plans?: Plan[]
}

export function PricingSection({ plans = [] }: PricingSectionProps) {
  const [annual, setAnnual] = useState(false)

  const trialPlan = plans.find((p) => p.billing_cycle === 'trial')
  const proMonthly = plans.find((p) => p.slug === 'pro_monthly' || p.billing_cycle === 'monthly')
  const proAnnual = plans.find((p) => p.billing_cycle === 'annual')

  const trialFeatures = planFeatures(trialPlan?.features)
  const proFeatures = planFeatures(proMonthly?.features)
  const annualFeatures = planFeatures(proAnnual?.features)

  const displayTrialFeatures =
    trialFeatures.length > 0 ? trialFeatures : FALLBACK_TRIAL_FEATURES
  const displayProFeatures = proFeatures.length > 0 ? proFeatures : FALLBACK_PRO_FEATURES
  const displayAnnualFeatures =
    annualFeatures.length > 0
      ? annualFeatures
      : [...FALLBACK_PRO_FEATURES, 'خصم سنوي', 'فاتورة واحدة']

  const activePro = annual ? proAnnual : proMonthly
  const proPrice = annual
    ? proAnnual?.price_annual
    : proMonthly?.price_monthly
  const proPeriod = annual ? 'سنة' : 'شهر'
  const proDiscount =
    proAnnual?.discount_percent != null && proAnnual.discount_percent > 0
      ? proAnnual.discount_percent
      : null

  return (
    <section id="pricing" className="landing-section bg-[#F8FFFE]" dir="rtl">
      <div className="landing-container">
        <FadeIn className="mb-10 text-center">
          <span className="mb-3 inline-block text-sm font-bold text-[#0F6E56]">الأسعار</span>
          <h2 className="mb-4 text-3xl font-bold text-[#0D1F1A] sm:text-[2rem]">
            خطط تناسب جميع الأحجام
          </h2>
          <p className="mx-auto max-w-xl text-base leading-[1.7] text-[#4A6B60]">
            ابدأ بتجربة مجانية كاملة — لا قيود على عدد المشتركين — ثم اختر الخطة المناسبة
          </p>
        </FadeIn>

        <FadeIn delay={0.05} className="mb-10 flex items-center justify-center gap-3">
          <span className={cn('text-sm font-medium', !annual ? 'text-[#0D1F1A]' : 'text-[#4A6B60]')}>
            شهري
          </span>
          <button
            type="button"
            role="switch"
            aria-checked={annual}
            onClick={() => setAnnual((v) => !v)}
            className={cn(
              'relative h-7 w-12 rounded-full transition-colors duration-300',
              annual ? 'bg-[#0F6E56]' : 'bg-[#D1E8E2]'
            )}
          >
            <span
              className={cn(
                'absolute top-0.5 size-6 rounded-full bg-white shadow transition-all duration-300',
                annual ? 'right-0.5' : 'left-0.5'
              )}
            />
          </button>
          <span className={cn('text-sm font-medium', annual ? 'text-[#0D1F1A]' : 'text-[#4A6B60]')}>
            سنوي
          </span>
          {proDiscount != null && (
            <span
              className={cn(
                'rounded-full bg-[#10B981]/15 px-2.5 py-1 text-xs font-bold text-[#10B981] transition-all duration-300',
                annual ? 'scale-100 opacity-100' : 'scale-90 opacity-0'
              )}
            >
              وفِّر {proDiscount}%
            </span>
          )}
        </FadeIn>

        <div className="grid grid-cols-1 gap-6 lg:grid-cols-3">
          <FadeIn delay={0.1}>
            <article className="landing-card flex h-full flex-col">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-[#0D1F1A]">
                  {trialPlan?.name ?? 'التجربة المجانية'}
                </h3>
                <div className="mt-4 flex flex-wrap items-end gap-1">
                  <span className="text-4xl font-bold text-[#0D1F1A]">مجاناً</span>
                  {trialPlan?.trial_days != null && (
                    <span className="mb-1 text-sm text-[#4A6B60]">
                      {formatTrialPeriodShort(trialPlan.trial_days)}
                    </span>
                  )}
                </div>
              </div>
              <FeatureList items={displayTrialFeatures} />
              <Link href="/register" className="landing-btn-secondary mt-8 w-full text-center">
                ابدأ مجاناً
              </Link>
            </article>
          </FadeIn>

          <FadeIn delay={0.15}>
            <article className="relative flex h-full flex-col rounded-2xl border-2 border-[#0F6E56] bg-white p-8 shadow-[0_8px_40px_rgba(15,110,86,0.18)]">
              <div className="absolute -top-3.5 inset-x-0 flex justify-center">
                <span className="rounded-full bg-[#0F6E56] px-4 py-1 text-xs font-bold text-white">
                  الأكثر شيوعاً
                </span>
              </div>
              <div className="mb-6">
                <h3 className="text-lg font-bold text-[#0D1F1A]">
                  {activePro?.name ?? (annual ? 'السنوية' : 'الاحترافية')}
                </h3>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-bold text-[#0D1F1A]">
                    {proPrice != null ? `${proPrice} ₪` : '—'}
                  </span>
                  <span className="mb-1 text-sm text-[#4A6B60]">/ {proPeriod}</span>
                </div>
              </div>
              <FeatureList items={displayProFeatures} />
              <Link href="/register" className="landing-btn-primary mt-8 w-full text-center">
                اشترك الآن
              </Link>
            </article>
          </FadeIn>

          <FadeIn delay={0.2}>
            <article className="landing-card flex h-full flex-col">
              <div className="mb-6">
                <h3 className="text-lg font-bold text-[#0D1F1A]">
                  {proAnnual?.name ?? 'السنوية'}
                </h3>
                <div className="mt-4 flex items-end gap-1">
                  <span className="text-4xl font-bold text-[#0D1F1A]">
                    {proAnnual?.price_annual != null ? `${proAnnual.price_annual} ₪` : '—'}
                  </span>
                  <span className="mb-1 text-sm text-[#4A6B60]">/ سنة</span>
                </div>
                {proDiscount != null && (
                  <span className="mt-2 inline-block rounded-full bg-[#10B981]/15 px-2.5 py-1 text-xs font-bold text-[#10B981]">
                    وفِّر {proDiscount}%
                  </span>
                )}
              </div>
              <FeatureList items={displayAnnualFeatures} />
              <Link href="/register" className="landing-btn-secondary mt-8 w-full text-center">
                وفّر مع الخطة السنوية
              </Link>
            </article>
          </FadeIn>
        </div>
      </div>
    </section>
  )
}
