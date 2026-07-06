import { describe, expect, it } from 'vitest'
import {
  buildSubscriptionExpiryReminderMessage,
  daysUntilTenantExpiry,
  defaultActivatePlanSlug,
  shouldShowActivateSubscription,
  SUBSCRIPTION_REMINDER_SENDER_NAME,
} from '@/lib/saas/subscription-expiry'

function daysFromNow(n: number): string {
  const d = new Date()
  d.setDate(d.getDate() + n)
  return d.toISOString()
}

describe('subscription-expiry', () => {
  it('shows activate when subscription expires within 3 days', () => {
    expect(
      shouldShowActivateSubscription({
        is_active: true,
        is_trial: false,
        trial_ends_at: null,
        subscription_end: daysFromNow(2),
      }),
    ).toBe(true)
  })

  it('hides activate when subscription has more than 3 days left', () => {
    expect(
      shouldShowActivateSubscription({
        is_active: true,
        is_trial: false,
        trial_ends_at: null,
        subscription_end: daysFromNow(10),
      }),
    ).toBe(false)
  })

  it('shows activate when tenant is on trial (early activation)', () => {
    expect(
      shouldShowActivateSubscription({
        is_active: true,
        is_trial: true,
        trial_ends_at: daysFromNow(25),
        subscription_end: daysFromNow(25),
      }),
    ).toBe(true)
  })

  it('defaults to monthly plan slug during trial', () => {
    expect(
      defaultActivatePlanSlug({
        is_active: true,
        is_trial: true,
        trial_ends_at: daysFromNow(10),
        subscription_end: daysFromNow(10),
      }),
    ).toBe('pro_monthly')
  })

  it('shows activate when tenant is disabled or expired', () => {
    expect(
      shouldShowActivateSubscription({
        is_active: false,
        is_trial: false,
        trial_ends_at: null,
        subscription_end: daysFromNow(30),
      }),
    ).toBe(true)

    expect(
      shouldShowActivateSubscription({
        is_active: true,
        is_trial: false,
        trial_ends_at: null,
        subscription_end: daysFromNow(-1),
      }),
    ).toBe(true)
  })

  it('reminder message includes sender name م.سليم نجم', () => {
    const iso = daysFromNow(2)
    const msg = buildSubscriptionExpiryReminderMessage({
      tenantName: 'FUTUER WAY',
      expiryIso: iso,
      daysRemaining: daysUntilTenantExpiry({
        is_active: true,
        is_trial: false,
        trial_ends_at: null,
        subscription_end: iso,
      })!,
    })
    expect(msg.body).toContain(SUBSCRIPTION_REMINDER_SENDER_NAME)
    expect(msg.title).toContain('على وشك الانتهاء')
  })
})
