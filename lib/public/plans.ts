import { cache } from 'react'
import { createClient } from '@/lib/supabase/server'
import type { Plan } from '@/components/public/PricingCards'

type PlansResult =
  | { ok: true; plans: Plan[] }
  | { ok: false; error: string }

/**
 * جلب خطط الأسعار من Supabase — مع cache لطلب واحد لكل render.
 * أخطاء الاتصال تُعاد بشكل آمن دون رمي استثناء (لا تكسر الصفحة العامة).
 */
export const getSubscriptionPlans = cache(async (): Promise<PlansResult> => {
  const url = process.env.NEXT_PUBLIC_SUPABASE_URL
  const key = process.env.NEXT_PUBLIC_SUPABASE_ANON_KEY

  if (!url || !key) {
    return { ok: false, error: 'missing_supabase_env' }
  }

  try {
    const supabase = await createClient()
    const { data, error } = await supabase
      .from('subscription_plans')
      .select('*')
      .order('sort_order')

    if (error) {
      return { ok: false, error: error.message }
    }

    return { ok: true, plans: (data ?? []) as Plan[] }
  } catch (err) {
    const message = err instanceof Error ? err.message : 'unknown_fetch_error'
    return { ok: false, error: message }
  }
})
