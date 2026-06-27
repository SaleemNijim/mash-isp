/** اسم المرسل الرسمي في تنبيهات انتهاء الاشتراك */
export const SUBSCRIPTION_REMINDER_SENDER_NAME = 'م.سليم نجم'

/** عدد الأيام قبل الانتهاء لإظهار زر التفعيل وإرسال التنبيه */
export const SUBSCRIPTION_EXPIRY_WARNING_DAYS = 3

export interface TenantExpiryFields {
  is_active: boolean
  is_trial: boolean
  trial_ends_at: string | null
  subscription_end: string | null
}

/** تاريخ انتهاء الاشتراك الفعلي — يطابق منطق proxy.ts */
export function getTenantExpiryDate(tenant: TenantExpiryFields): Date | null {
  const raw = tenant.is_trial ? tenant.trial_ends_at : tenant.subscription_end
  if (!raw) return null
  const date = new Date(raw)
  return Number.isNaN(date.getTime()) ? null : date
}

/** الأيام المتبقية (سالب = منتهٍ) */
export function daysUntilTenantExpiry(tenant: TenantExpiryFields): number | null {
  const expiry = getTenantExpiryDate(tenant)
  if (!expiry) return null
  const ms = expiry.getTime() - Date.now()
  return Math.ceil(ms / (24 * 60 * 60 * 1000))
}

export function isTenantSubscriptionExpired(tenant: TenantExpiryFields): boolean {
  const days = daysUntilTenantExpiry(tenant)
  return days !== null && days < 0
}

export function isTenantSubscriptionExpiringSoon(
  tenant: TenantExpiryFields,
  withinDays = SUBSCRIPTION_EXPIRY_WARNING_DAYS,
): boolean {
  const days = daysUntilTenantExpiry(tenant)
  if (days === null) return false
  return days >= 0 && days <= withinDays
}

/**
 * إظهار «تفعيل اشتراك» في Super Admin:
 * - شركة معطّلة
 * - اشتراك منتهٍ
 * - بقي 3 أيام أو أقل على الانتهاء
 */
export function shouldShowActivateSubscription(tenant: TenantExpiryFields): boolean {
  if (!tenant.is_active) return true
  if (isTenantSubscriptionExpired(tenant)) return true
  if (isTenantSubscriptionExpiringSoon(tenant)) return true
  return false
}

function arabicDaysLabel(days: number): string {
  if (days === 0) return 'أقل من يوم واحد'
  if (days === 1) return 'يوم واحد'
  if (days === 2) return 'يومان'
  if (days >= 3 && days <= 10) return `${days} أيام`
  return `${days} يوماً`
}

function formatExpiryDateAr(iso: string): string {
  return new Date(iso).toLocaleDateString('ar-EG', {
    weekday: 'long',
    year: 'numeric',
    month: 'long',
    day: 'numeric',
  })
}

export function buildSubscriptionExpiryReminderMessage(options: {
  tenantName: string
  expiryIso: string
  daysRemaining: number
}): { title: string; body: string } {
  const { tenantName, expiryIso, daysRemaining } = options
  const daysText = arabicDaysLabel(daysRemaining)
  const dateText = formatExpiryDateAr(expiryIso)

  return {
    title: 'تنبيه: اشتراككم على وشك الانتهاء',
    body: [
      'السلام عليكم ورحمة الله وبركاته،',
      '',
      `نودّ إعلامكم بأن اشتراك شركة «${tenantName}» في منصة MASH ISP يقترب من تاريخ انتهائه.`,
      `يتبقى ${daysText} على انتهاء الاشتراك (بتاريخ ${dateText}).`,
      '',
      'نرجو منكم تسوية تجديد الاشتراك في أقرب وقت ممكن لضمان استمرار الخدمة دون انقطاع.',
      '',
      'مع خالص التقدير،',
      SUBSCRIPTION_REMINDER_SENDER_NAME,
    ].join('\n'),
  }
}
