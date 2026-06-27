'use client'

import { useParams } from 'next/navigation'
import { SubscriptionPeriodForm } from '@/components/subscriptions/SubscriptionPeriodForm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'

export default function RenewSubscriptionPage() {
  const params = useParams()
  const subscriptionId = params.subscriptionId as string

  return (
    <PermissionGuard
      permission="renew_subscriptions"
      fallback={
        <div dir="rtl" className="py-16 text-center text-muted-foreground">
          ليس لديك صلاحية تجديد الاشتراكات.
        </div>
      }
    >
      <SubscriptionPeriodForm mode="renew" subscriptionId={subscriptionId} />
    </PermissionGuard>
  )
}
