// components/public/PricingCards.tsx
// §3.2 — كل قيمة من DB — صفر hard-coding

import Link from 'next/link'
import { CheckCircle2 } from 'lucide-react'
import { EnterpriseComingSoonCard } from './EnterpriseComingSoon'
import { getSubscriptionPlans } from '@/lib/public/plans'
import { PricingUnavailable } from './PricingUnavailable'

export interface Plan {
  id: string
  slug: string
  name: string
  billing_cycle: string
  price_monthly: number | null
  price_annual: number | null
  discount_percent: number | null
  trial_days: number | null
  features: unknown
  is_active: boolean
  is_coming_soon: boolean
  promotional_message: string | null
  sort_order: number
}

function planFeatures(raw: unknown): string[] {
  if (!Array.isArray(raw)) return []
  return raw.filter((f): f is string => typeof f === 'string')
}

function FeatureList({ features }: { features: string[] }) {
  if (!features.length) return null
  return (
    <ul className="space-y-2 text-sm text-[#4A6B60]">
      {features.map((f) => (
        <li key={f} className="flex items-center gap-2">
          <CheckCircle2 size={15} className="shrink-0 text-[#0F6E56]" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  )
}

function FreeTrialCard({ plan }: { plan: Plan }) {
  const features = planFeatures(plan.features)
  return (
    <div className="landing-card relative flex h-full flex-col gap-5 !p-6">
      <div>
        <h3 className="text-base font-bold text-[#0D1F1A]">{plan.name}</h3>
        <div className="mt-3">
          <span className="text-3xl font-bold text-[#0D1F1A]">مجاناً</span>
        </div>
        <p className="mt-1 text-sm text-[#4A6B60]">
          {plan.trial_days != null && <>لمدة {plan.trial_days} يوم — </>}
          لا بطاقة ائتمان
        </p>
      </div>

      <FeatureList features={features} />

      <Link href="/register" className="landing-btn-secondary mt-auto w-full text-center">
        ابدأ مجاناً
      </Link>
    </div>
  )
}

function PlanCard({ plan }: { plan: Plan }) {
  const features = planFeatures(plan.features)
  const isPro = plan.slug === 'pro_monthly' || plan.billing_cycle === 'monthly'
  const price = plan.billing_cycle === 'monthly' ? plan.price_monthly : plan.price_annual
  const period = plan.billing_cycle === 'monthly' ? 'شهر' : 'سنة'
  const hasDiscount = plan.discount_percent != null && plan.discount_percent > 0

  return (
    <div
      className={`relative flex h-full flex-col gap-5 rounded-2xl bg-white p-6 ${
        isPro
          ? 'border-2 border-[#0F6E56] shadow-[0_8px_40px_rgba(15,110,86,0.15)]'
          : 'landing-card !p-6'
      }`}
    >
      {isPro && (
        <div className="absolute -top-3.5 inset-x-0 flex justify-center">
          <span className="rounded-full bg-[#0F6E56] px-4 py-1 text-xs font-bold text-white">
            الأكثر شيوعاً
          </span>
        </div>
      )}

      <div>
        <div className="flex flex-wrap items-center gap-2">
          <h3 className="text-base font-bold text-[#0D1F1A]">{plan.name}</h3>
          {hasDiscount && (
            <span className="mash-badge-success text-[11px]">
              وفِّر {plan.discount_percent}%
            </span>
          )}
        </div>

        <div className="mt-3 flex items-end gap-1">
          <span className="text-3xl font-bold text-[#0D1F1A]">{price} ₪</span>
          <span className="mb-1 text-sm text-[#4A6B60]">{'/' + period}</span>
        </div>
      </div>

      <FeatureList features={features} />

      <Link
        href="/register"
        className={`mt-auto w-full text-center ${isPro ? 'landing-btn-primary' : 'landing-btn-secondary'}`}
      >
        ابدأ مجاناً
      </Link>
    </div>
  )
}

export async function PricingCards() {
  const result = await getSubscriptionPlans()

  if (!result.ok) {
    return <PricingUnavailable debugReason={result.error} />
  }

  const plans = result.plans
  if (!plans.length) return null

  return (
    <div className="grid grid-cols-1 gap-6 sm:grid-cols-2 xl:grid-cols-4" dir="rtl">
      {plans.map((plan) => {
        if (plan.is_coming_soon) {
          return (
            <EnterpriseComingSoonCard
              key={plan.slug}
              message={plan.promotional_message}
            />
          )
        }
        if (plan.billing_cycle === 'trial') {
          return <FreeTrialCard key={plan.slug} plan={plan as Plan} />
        }
        return <PlanCard key={plan.slug} plan={plan as Plan} />
      })}
    </div>
  )
}
