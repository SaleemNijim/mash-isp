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
    <ul className="space-y-2 text-sm text-mash-text-secondary">
      {features.map((f) => (
        <li key={f} className="flex items-center gap-2">
          <CheckCircle2 size={15} className="text-primary-600 shrink-0" />
          <span>{f}</span>
        </li>
      ))}
    </ul>
  )
}

function FreeTrialCard({ plan }: { plan: Plan }) {
  const features = planFeatures(plan.features)
  return (
    <div className="relative rounded-xl border border-mash-border bg-mash-surface p-6 flex flex-col gap-5">
      <div>
        <h3 className="text-[15px] font-medium text-mash-text">{plan.name}</h3>
        <div className="mt-3">
          <span className="text-3xl font-medium text-mash-text">مجاناً</span>
        </div>
        <p className="mt-1 text-sm text-mash-text-muted">
          {plan.trial_days != null && <>لمدة {plan.trial_days} يوم — </>}
          لا بطاقة ائتمان
        </p>
      </div>

      <FeatureList features={features} />

      <Link href="/register" className="mt-auto mash-btn-secondary w-full text-center">
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
      className={`relative rounded-xl p-6 flex flex-col gap-5 bg-mash-surface ${
        isPro
          ? 'border-2 border-primary-600'
          : 'border border-mash-border'
      }`}
    >
      {isPro && (
        <div className="absolute -top-3 inset-x-0 flex justify-center">
          <span className="bg-primary-50 text-primary-800 text-xs font-medium px-3 py-1 rounded-full">
            الأكثر شيوعاً
          </span>
        </div>
      )}

      <div>
        <div className="flex items-center gap-2 flex-wrap">
          <h3 className="text-[15px] font-medium text-mash-text">{plan.name}</h3>
          {hasDiscount && (
            <span className="mash-badge-success text-[11px]">
              وفِّر {plan.discount_percent}%
            </span>
          )}
        </div>

        <div className="mt-3 flex items-end gap-1">
          <span className="text-3xl font-medium text-mash-text">${price}</span>
          <span className="text-mash-text-muted text-sm mb-1">{'/' + period}</span>
        </div>
      </div>

      <FeatureList features={features} />

      <Link
        href="/register"
        className={`mt-auto w-full text-center ${isPro ? 'mash-btn-primary' : 'mash-btn-secondary'}`}
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
    <div className="grid grid-cols-1 sm:grid-cols-2 xl:grid-cols-4 gap-4" dir="rtl">
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
