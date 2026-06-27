'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SubscriptionPeriodForm } from '@/components/subscriptions/SubscriptionPeriodForm'
import { PermissionGuard } from '@/components/permissions/PermissionGuard'

function NewSubscriptionContent() {
  const searchParams = useSearchParams()
  const customer = searchParams.get('customer')

  return (
    <SubscriptionPeriodForm
      mode="create"
      preselectedCustomerId={customer}
    />
  )
}

export default function NewSubscriptionPage() {
  return (
    <Suspense
      fallback={
        <div dir="rtl" className="py-16 text-center text-muted-foreground">
          جارٍ التحميل...
        </div>
      }
    >
      <PermissionGuard
        permission="create_subscriptions"
        fallback={
          <div dir="rtl" className="py-16 text-center text-muted-foreground">
            ليس لديك صلاحية إنشاء اشتراك جديد.
          </div>
        }
      >
        <NewSubscriptionContent />
      </PermissionGuard>
    </Suspense>
  )
}
