'use client'

import { Suspense } from 'react'
import { useSearchParams } from 'next/navigation'
import { SubscriptionPeriodForm } from '@/components/subscriptions/SubscriptionPeriodForm'

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
      <NewSubscriptionContent />
    </Suspense>
  )
}
